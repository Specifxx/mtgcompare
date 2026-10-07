// The eBay pass: search eBay for the (product, market) pairs that are due, and
// write each pair's result as soon as its search completes. Script-side only —
// run by scripts/ebay.ts from .github/workflows/ebay-prices.yml (05:37 and 17:37
// UTC), never from a page, a route or the store import.
//
// Partial-run safety (lib/ebay-plan.ts pairWrite): a COMPLETED search upserts
// the pair's row (match) or deletes it (no match); a failed, 429'd or
// budget-refused search touches nothing, so the pair stays due and a run cut
// short never removes a live price. Nothing is ever replaced wholesale.
//
// This pass does not aggregate, record history or revalidate: the 07:07 and
// 19:07 store import does all three with the fresh eBay rows.
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { Country } from "./country";
import { convertUsdCents, toUsdCents } from "./fx";
import { buildCardIndex, type SealedRef } from "./match";
import { EBAY_MARKETPLACE, capEbayBudget, ebaySpentThisRun, isEbayRateLimited, primeEbayBudget, searchBrowse, type BrowseItem } from "./ebay";
import {
  CARD_LIMIT,
  SEALED_LIMIT,
  cardFilter,
  cardQuery,
  pickListing,
  screenItems,
  sealedFilter,
  selfMatches,
  sealedQuery,
  panelListings,
  screenGraded,
  type ChooseTarget,
  type EbayListing,
  type GradedListing,
} from "./ebay-match";
import {
  DEFAULT_MIN_VALUE_CENTS,
  EBAY_MARKETS,
  FOREIGN_SPEND_BUDGET,
  FailureBreaker,
  combineQueries,
  duePairs,
  envInt,
  isLaunch,
  pairKey,
  pairWrite,
  parseOnlyMarket,
  planRun,
  tierOf,
  type EbayMarket,
  type Pair,
  type PlanProduct,
  type QueryStatus,
  type Tier,
} from "./ebay-plan";

type Log = (...a: unknown[]) => void;

export interface MarketStats {
  due: number;
  planned: number;
  searched: number; // completed
  matched: number;
  deleted: number; // completed with no match, and a row was removed
  failed: number; // not completed (error, timeout, 429, budget)
  singles: number; // singles searches completed
  retries: number; // singles whose strict query returned 0
}

export interface EbayPassSummary {
  remainingStart: number | null;
  dailyLimit: number;
  reset: string | null;
  budget: number;
  spent: number;
  modelled: number;
  byMarket: Record<string, MarketStats>;
  /** Oldest checkedAt age (hours) per "market:tier" over every eligible pair; null = some pair never searched. */
  tierSlip: Record<string, { oldestHours: number | null; neverSearched: number; pairs: number }>;
  latched: "429" | "budget" | "failures" | null;
  /** Pairs whose search completed (matched or not), over every market. */
  completed: number;
  /** Why the failure breaker stopped the run. */
  breaker?: string;
  /** Singles never searched because their own canonical title can't match them. */
  unmatchable: number;
  /** Unpriced launch products with / without a store reference price. */
  unpriced: { withRef: number; withoutRef: number };
  foreignSpendWarning: boolean;
  tokenRefused?: true;
  collisions: number;
  derivedCA: { written: number; deleted: number };
  rejects: Record<string, number>;
}

/** Our own spend over the last 24h + this much slack before we suspect someone else spends this keyset. */
export const FOREIGN_SPEND_SLACK = 300;

/** dailyLimit − remaining > ourSpend24h + slack → another app is spending this keyset. */
export function foreignSpend(remaining: number | null, dailyLimit: number, ourSpend24h: number): boolean {
  if (remaining == null) return false;
  return dailyLimit - remaining > ourSpend24h + FOREIGN_SPEND_SLACK;
}

interface CardRow {
  id: number;
  name: string;
  number: string | null;
  variant: string | null;
  marketUsd: number | null;
  refUsd: number | null;
  setName: string | null;
}
interface SealedRow {
  id: number;
  name: string;
  marketUsd: number | null;
  refUsd: number | null;
}

/** A GitHub Actions annotation, shown on the run's summary page (never carries a secret). */
const annotate = (level: "warning" | "error", title: string, msg: string) => console.log(`::${level} title=${title}::${msg}`);

const emptyStats = (): MarketStats => ({ due: 0, planned: 0, searched: 0, matched: 0, deleted: 0, failed: 0, singles: 0, retries: 0 });

export async function runEbayPass(
  log: Log,
  opts: { now?: Date; onProgress?: (spent: number) => Promise<void> } = {},
): Promise<EbayPassSummary> {
  const now = opts.now ?? new Date();
  const only = parseOnlyMarket(process.env.EBAY_ONLY_MARKET);
  const force = process.env.EBAY_FORCE === "1";
  const minValue = envInt(process.env.EBAY_MIN_VALUE_CENTS) ?? DEFAULT_MIN_VALUE_CENTS;

  // Our own spend over the last 24h (every eBay run records `spent`, also when
  // it throws). It bounds the budget when eBay's live count can't be read, and
  // it is what the foreign-spend check compares eBay's used count with.
  const recent = await prisma.importRun.findMany({
    where: { kind: "ebay", startedAt: { gte: new Date(now.getTime() - 86_400_000) } },
    select: { summary: true },
  });
  const ourSpend24h = recent.reduce((s, r) => s + (Number((r.summary as { spent?: unknown } | null)?.spent) || 0), 0);

  const prime = await primeEbayBudget((m) => log(m), { ourSpend24h });
  const summary: EbayPassSummary = {
    remainingStart: prime.remaining,
    dailyLimit: prime.dailyLimit,
    reset: prime.reset,
    budget: prime.budget,
    spent: 0,
    modelled: 0,
    byMarket: {},
    tierSlip: {},
    latched: null,
    completed: 0,
    unmatchable: 0,
    unpriced: { withRef: 0, withoutRef: 0 },
    foreignSpendWarning: false,
    collisions: 0,
    derivedCA: { written: 0, deleted: 0 },
    rejects: {},
  };
  if (prime.tokenRefused) {
    summary.tokenRefused = true;
    return summary;
  }

  // ── Foreign-spend check (the shared-keyset guard) ──────────────────────────
  // A pasted RiftCompare keyset would otherwise spend RiftCompare's quota on
  // every run with nothing failing: annotate the run, and spend only a sample.
  if (foreignSpend(prime.remaining, prime.dailyLimit, ourSpend24h)) {
    summary.foreignSpendWarning = true;
    summary.budget = capEbayBudget(FOREIGN_SPEND_BUDGET);
    const msg =
      `another app is spending this keyset — check EBAY_CLIENT_ID/SECRET are OP Compare's own ` +
      `(used ${prime.dailyLimit - (prime.remaining ?? 0)} of ${prime.dailyLimit}; our last 24h: ${ourSpend24h}). ` +
      `This run spends at most ${FOREIGN_SPEND_BUDGET} calls.`;
    log(`⚠ ${msg}`);
    annotate("warning", "eBay keyset", msg);
  }

  // ── Products ───────────────────────────────────────────────────────────────
  const [cardsRaw, sealedRaw, checkRows] = await Promise.all([
    prisma.card.findMany({
      select: { id: true, name: true, number: true, variant: true, marketUsd: true, set: { select: { code: true, name: true, releasedOn: true } } },
    }),
    prisma.sealed.findMany({
      select: { id: true, name: true, kind: true, marketUsd: true, releasedOn: true, presale: true, set: { select: { code: true, name: true, releasedOn: true } } },
    }),
    prisma.ebayCheck.findMany({ select: { productId: true, market: true, checkedAt: true } }),
  ]);
  // The FULL index, as the store import builds it: a title that fits another printing is a miss.
  const idx = buildCardIndex(cardsRaw.filter((c) => c.number).map((c) => ({ ...c, setCode: c.set.code, setName: c.set.name })));
  const sealedRefs: SealedRef[] = sealedRaw.map((s) => ({ id: s.id, name: s.name, kind: s.kind as SealedRef["kind"], setCode: s.set?.code ?? null, setName: s.set?.name ?? null }));

  // Unpriced products in a launch window are judged against the cheapest
  // non-eBay offer in any market (RiftCompare's trustedRef); without one they
  // are not searched at all.
  const cardLaunch = new Map(cardsRaw.map((c) => [c.id, isLaunch(c.set.releasedOn, false, now)]));
  const sealedLaunch = new Map(sealedRaw.map((s) => [s.id, isLaunch(s.releasedOn ?? s.set?.releasedOn, s.presale, now)]));
  const unpricedIds = [
    ...cardsRaw.filter((c) => c.marketUsd == null && c.number && cardLaunch.get(c.id)).map((c) => c.id),
    ...sealedRaw.filter((s) => s.marketUsd == null && sealedLaunch.get(s.id)).map((s) => s.id),
  ];
  const refUsd = new Map<number, number>();
  if (unpricedIds.length) {
    const offers = await prisma.offer.findMany({
      where: { productId: { in: unpricedIds }, NOT: { source: { startsWith: "ebay" } } },
      select: { productId: true, priceCents: true, currency: true },
    });
    for (const o of offers) {
      const usd = toUsdCents(o.priceCents, o.currency);
      if (usd > 0 && usd < (refUsd.get(o.productId) ?? Infinity)) refUsd.set(o.productId, usd);
    }
  }
  summary.unpriced = { withRef: unpricedIds.filter((id) => refUsd.has(id)).length, withoutRef: unpricedIds.filter((id) => !refUsd.has(id)).length };

  const cards = new Map<number, CardRow>(
    cardsRaw.map((c) => [c.id, { id: c.id, name: c.name, number: c.number, variant: c.variant, marketUsd: c.marketUsd, refUsd: refUsd.get(c.id) ?? null, setName: c.set.name }]),
  );
  const sealed = new Map<number, SealedRow>(sealedRaw.map((s) => [s.id, { id: s.id, name: s.name, marketUsd: s.marketUsd, refUsd: refUsd.get(s.id) ?? null }]));
  // A printing whose own canonical title can't match it is never searched (a
  // "Japanese Version" promo, a Playmat promo, two same-tag printings in a set).
  const matchable = (c: (typeof cardsRaw)[number]) =>
    !c.number || selfMatches({ id: c.id, name: c.name, number: c.number, variant: c.variant, setName: c.set.name, setCode: c.set.code }, idx);
  const products: PlanProduct[] = [
    ...cardsRaw.map((c): PlanProduct => ({ id: c.id, kind: "single", marketUsd: c.marketUsd, number: c.number, launch: cardLaunch.get(c.id)!, refUsd: refUsd.get(c.id) ?? null })),
    ...sealedRaw.map((s): PlanProduct => ({ id: s.id, kind: "sealed", marketUsd: s.marketUsd, sealedKind: s.kind, launch: sealedLaunch.get(s.id)!, refUsd: refUsd.get(s.id) ?? null })),
  ];
  // Only products that would otherwise be searched somewhere pay for the check.
  const rawById = new Map(cardsRaw.map((c) => [c.id, c]));
  for (const p of products) {
    if (p.kind !== "single" || !EBAY_MARKETS.some((m) => tierOf(p, m, minValue))) continue;
    const c = rawById.get(p.id)!;
    if (!matchable(c)) {
      p.matchable = false;
      summary.unmatchable++;
    }
  }
  if (summary.unmatchable) log(`eBay: ${summary.unmatchable} printings skipped — their own canonical title can't match them (no call is spent on them)`);
  if (unpricedIds.length) log(`eBay: ${summary.unpriced.withRef} unpriced launch products have a store reference price; ${summary.unpriced.withoutRef} without one are not searched`);
  const checks = new Map<string, Date>(checkRows.map((r) => [pairKey(r.productId, r.market), r.checkedAt]));

  // ── Plan ───────────────────────────────────────────────────────────────────
  const markets = only ? [only] : EBAY_MARKETS;
  const due: Partial<Record<EbayMarket, Pair[]>> = {};
  for (const m of markets) {
    due[m] = duePairs(products, m, checks, now, { force, minValueCents: minValue });
    summary.byMarket[m] = { ...emptyStats(), due: due[m]!.length };
  }
  const plan = planRun(due, prime.budget, now, { only });
  summary.modelled = Math.round(plan.modelled);
  for (const p of plan.order) summary.byMarket[p.market].planned++;
  log(
    `eBay plan: ${plan.order.length} pairs (${Math.round(plan.modelled)} modelled calls, spill ${Math.round(plan.spill)}), ` +
      `${plan.overflow.length} more due; order ${plan.marketOrder.join(" → ") || "—"}`,
  );

  // ── Search and write, pair by pair ─────────────────────────────────────────
  const banned = new Map<string, Set<string>>(); // market → item ids dropped for a collision
  const claimed = new Map<string, number>(); // itemId|market → productId
  const survivorsOf = new Map<string, EbayListing[]>(); // productId|market → survivors
  const gradedOf = new Map<string, GradedListing[]>(); // productId|market → slabs (display only, never an Offer)
  const kindOf = (id: number): "single" | "sealed" => (cards.has(id) ? "single" : "sealed");
  const bannedIn = (m: string) => banned.get(m) ?? banned.set(m, new Set()).get(m)!;

  const writePair = async (productId: number, market: EbayMarket, listing: EbayListing | null): Promise<number> => {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    const data = (l: EbayListing) => ({
      priceCents: l.priceCents, currency: l.currency, url: l.url, inStock: true, condition: l.condition, title: l.title, shippingCents: l.shippingCents, updatedAt: now,
    });
    if (listing) {
      ops.push(prisma.offer.upsert({ where: { productId_source_market: { productId, source: "ebay", market } }, create: { productId, source: "ebay", market, ...data(listing) }, update: data(listing) }));
    } else {
      ops.push(prisma.offer.deleteMany({ where: { productId, source: "ebay", market } }));
    }
    ops.push(
      prisma.ebayCheck.upsert({
        where: { productId_market: { productId, market } },
        create: { productId, market, checkedAt: now, matched: Boolean(listing) },
        update: { checkedAt: now, matched: Boolean(listing) },
      }),
    );
    // CA singles are derived from the US search at no cost — only when the
    // seller is in the US or Canada, so "ships from the US" is true.
    let caWrite: "write" | "delete" | null = null;
    if (market === "US" && kindOf(productId) === "single") {
      if (listing && (listing.location === "US" || listing.location === "CA")) {
        const ca = { ...data(listing), priceCents: convertUsdCents(listing.priceCents, "CAD"), currency: "CAD", shippingCents: null };
        ops.push(prisma.offer.upsert({ where: { productId_source_market: { productId, source: "ebay_us", market: "CA" } }, create: { productId, source: "ebay_us", market: "CA", ...ca }, update: ca }));
        caWrite = "write";
      } else {
        ops.push(prisma.offer.deleteMany({ where: { productId, source: "ebay_us", market: "CA" } }));
        caWrite = "delete";
      }
    }
    // The listing panels (EbayListing: the first 8 survivors, headline pick
    // first; EbayGradedListing: slabs). Replaced as one set in the SAME
    // transaction, and only here, which only runs after a COMPLETED search.
    const panel = panelListings(survivorsOf.get(pairKey(productId, market)) ?? [], listing, bannedIn(market));
    const slabs = gradedOf.get(pairKey(productId, market)) ?? [];
    ops.push(prisma.ebayListing.deleteMany({ where: { productId, market } }));
    if (panel.length) {
      ops.push(
        prisma.ebayListing.createMany({
          data: panel.map((l, rank) => ({ productId, market, rank, priceCents: l.priceCents, shippingCents: l.shippingCents, currency: l.currency, url: l.url, title: l.title, imageUrl: l.imageUrl, updatedAt: now })),
        }),
      );
    }
    ops.push(prisma.ebayGradedListing.deleteMany({ where: { productId, market } }));
    if (slabs.length) {
      ops.push(
        prisma.ebayGradedListing.createMany({
          data: slabs.map((l) => ({ productId, market, itemId: l.itemId, priceCents: l.priceCents, shippingCents: l.shippingCents, currency: l.currency, url: l.url, title: l.title, imageUrl: l.imageUrl, grader: l.grader, grade: l.grade, updatedAt: now })),
          skipDuplicates: true,
        }),
      );
    }
    const res = await prisma.$transaction(ops);
    if (caWrite === "write") summary.derivedCA.written++;
    else if (caWrite === "delete" && ((res[2] as { count?: number })?.count ?? 0) > 0) summary.derivedCA.deleted++;
    checks.set(pairKey(productId, market), now);
    return listing ? 0 : ((res[0] as { count?: number }).count ?? 0);
  };

  /** Pick a listing no other product claimed; on a collision, drop the item from BOTH and re-settle the other. */
  const settle = async (productId: number, market: EbayMarket): Promise<EbayListing | null> => {
    const survivors = survivorsOf.get(pairKey(productId, market)) ?? [];
    for (;;) {
      const pick = pickListing(survivors, bannedIn(market));
      if (!pick) return null;
      const key = `${pick.itemId}|${market}`;
      const other = claimed.get(key);
      if (other == null || other === productId) {
        claimed.set(key, productId);
        return pick;
      }
      summary.collisions++;
      log(`  eBay ${market}: listing ${pick.itemId} matched both ${other} and ${productId} — dropped from both`);
      bannedIn(market).add(pick.itemId);
      claimed.delete(key);
      const again = await settle(other, market);
      await writePair(other, market, again);
    }
  };

  const search = async (pair: Pair): Promise<{ status: QueryStatus; items: BrowseItem[]; target: ChooseTarget | null }> => {
    const marketplace = EBAY_MARKETPLACE[pair.market];
    if (pair.kind === "single") {
      const c = cards.get(pair.productId)!;
      const target: ChooseTarget = { kind: "single", id: c.id, name: c.name, variant: c.variant, setName: c.setName, marketUsd: c.marketUsd, refUsd: c.refUsd, idx };
      const q = cardQuery({ number: c.number!, name: c.name });
      const filter = cardFilter(pair.market as Country, c.marketUsd ?? c.refUsd);
      const r1 = await searchBrowse({ marketplace, q: q.strict, filter, limit: CARD_LIMIT });
      if (r1.status !== "ok") return { status: r1.status, items: [], target };
      if (r1.items.length || !q.retry) return { status: "ok", items: r1.items, target };
      summary.byMarket[pair.market].retries++;
      const r2 = await searchBrowse({ marketplace, q: q.retry, filter, limit: CARD_LIMIT });
      return { status: combineQueries(r1.status, r2.status), items: r2.status === "ok" ? r2.items : [], target };
    }
    const s = sealed.get(pair.productId)!;
    const target: ChooseTarget = { kind: "sealed", id: s.id, name: s.name, marketUsd: s.marketUsd, refUsd: s.refUsd, refs: sealedRefs };
    const r = await searchBrowse({ marketplace, q: sealedQuery(s.name), filter: sealedFilter(pair.market as Country, s.marketUsd ?? s.refUsd), limit: SEALED_LIMIT });
    return { status: r.status, items: r.status === "ok" ? r.items : [], target };
  };

  let saw429 = false;
  const breaker = new FailureBreaker();
  let sinceProgress = 0;
  for (const pair of [...plan.order, ...plan.overflow]) {
    if (isEbayRateLimited()) break;
    const st = summary.byMarket[pair.market];
    const r = await search(pair);
    if (r.status === "rate-limited") saw429 = true;
    if (r.status === "budget") break; // the run's budget is spent; the pair stays due
    // A lower bound on our spend survives a timeout kill (the next run's foreign-spend check reads it).
    if (opts.onProgress && ++sinceProgress >= 100) {
      sinceProgress = 0;
      await opts.onProgress(ebaySpentThisRun()).catch(() => {});
    }
    const outcome = r.status === "ok" ? ({ status: "ok", matched: false } as const) : ({ status: r.status } as const);
    if (pairWrite(outcome).check === "keep") {
      st.failed++;
      // A 5xx, 4xx, timeout or network error is charged and the pair stays due:
      // stop before one broken thing spends the whole budget.
      if (r.status === "failed" && breaker.record(true)) {
        summary.breaker = breaker.tripped!;
        log(`eBay: stopping — ${breaker.tripped}`);
        annotate("error", "eBay searches failing", `${breaker.tripped}; stopped after ${ebaySpentThisRun()} calls`);
        break;
      }
      continue;
    }
    breaker.record(false);
    summary.completed++;
    const { survivors, rejects } = screenItems(r.items, r.target!, pair.market as Country);
    for (const [k, v] of Object.entries(rejects)) summary.rejects[k] = (summary.rejects[k] ?? 0) + v;
    survivorsOf.set(pairKey(pair.productId, pair.market), survivors);
    gradedOf.set(pairKey(pair.productId, pair.market), screenGraded(r.items, r.target!, pair.market as Country));
    const listing = await settle(pair.productId, pair.market);
    const deleted = await writePair(pair.productId, pair.market, listing);
    st.searched++;
    if (pair.kind === "single") st.singles++;
    if (listing) st.matched++;
    else if (deleted) st.deleted++;
  }
  // Panel rows not refreshed for 72 hours are dropped: an old eBay row is never shown.
  // (Only when a search completed: a run that failed everywhere touches nothing.)
  if (summary.completed > 0) {
    const sweepBefore = new Date(now.getTime() - 72 * 3600 * 1000);
    await prisma.ebayListing.deleteMany({ where: { updatedAt: { lt: sweepBefore } } }).catch(() => {});
    await prisma.ebayGradedListing.deleteMany({ where: { updatedAt: { lt: sweepBefore } } }).catch(() => {});
  }
  summary.spent = ebaySpentThisRun();
  summary.latched = summary.breaker ? "failures" : saw429 ? "429" : isEbayRateLimited() ? "budget" : null;

  // ── Slip: how old is the oldest pair of each tier, per market? ─────────────
  for (const m of markets) {
    for (const p of products) {
      const tier: Tier | null = tierOf(p, m, minValue);
      if (!tier) continue;
      const k = `${m}:${tier}`;
      const row = summary.tierSlip[k] ?? (summary.tierSlip[k] = { oldestHours: null, neverSearched: 0, pairs: 0 });
      row.pairs++;
      const at = checks.get(pairKey(p.id, m));
      if (!at) row.neverSearched++;
      else row.oldestHours = Math.max(row.oldestHours ?? 0, Math.round((now.getTime() - at.getTime()) / 360_000) / 10);
    }
  }

  // ── Log ────────────────────────────────────────────────────────────────────
  for (const m of markets) {
    const st = summary.byMarket[m];
    const slipTier = summary.tierSlip[`${m}:S2`] ? "S2" : "P1";
    const slip = summary.tierSlip[`${m}:${slipTier}`];
    if (!st.due && !slip) continue;
    log(
      `eBay ${m}: due ${st.due}, searched ${st.searched}, matched ${st.matched}, deleted ${st.deleted}, failed ${st.failed}, ` +
        `oldest ${slipTier} pair ${slip?.oldestHours ?? "—"}h${slip?.neverSearched ? ` (${slip.neverSearched} never searched)` : ""}`,
    );
    if (st.singles) log(`eBay ${m}: retry rate ${Math.round((st.retries / st.singles) * 100)}%`);
  }
  if (summary.derivedCA.written || summary.derivedCA.deleted) log(`eBay CA (from US): ${summary.derivedCA.written} written, ${summary.derivedCA.deleted} deleted`);
  const funnel = Object.entries(summary.rejects).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
  if (funnel) log(`eBay rejects: ${funnel}`);
  log(`eBay: spent ${summary.spent} calls (modelled ${summary.modelled})${summary.latched ? `; stopped: ${summary.latched === "429" ? "eBay returned 429" : summary.latched === "failures" ? `searches failing (${summary.breaker})` : "budget used"}` : ""}`);
  return summary;
}

