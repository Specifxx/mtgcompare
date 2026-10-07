// The eBay pass's plan: which (product, market) pairs to search this run, in
// what order, within what budget. PURE — no network, no database — and pinned
// by tests/ebay-plan.test.ts, which is the build-enforced quota model.
//
// OP Compare's own eBay application has 5,000 Browse calls a day. Two runs a day
// (05:37 and 17:37 UTC, .github/workflows/ebay-prices.yml) each spend at most
// min(EBAY_MAX_CALLS, liveRemaining − EBAY_QUOTA_RESERVE), split across markets
// by fixed shares, and inside each market by the product's TCGplayer market
// value: singles of US$100+ every 24h, singles from the floor (US$20; US$50 in
// the EU) every 48h, sealed of US$30+ every 48h. Below the floor: never searched,
// the visitor gets the eBay search link instead.
//
// Changing a floor, share or interval changes the arithmetic: update
// tests/ebay-plan.test.ts, the methodology copy (a test reads it) and DECISIONS.

/** The markets the eBay pass knows. SG has a 0% share (no EPN programme). */
export type EbayMarket = "US" | "UK" | "AU" | "EU" | "CA" | "SG";
export const EBAY_MARKETS: EbayMarket[] = ["US", "UK", "AU", "EU", "CA", "SG"];

/** Share of each run's budget. Modelled in DECISIONS (2026-10-03, eBay Browse API). */
export const MARKET_SHARES: Record<EbayMarket, number> = { US: 0.26, UK: 0.26, AU: 0.26, EU: 0.19, CA: 0.03, SG: 0 };

/** Markets searched for singles. CA singles are DERIVED from the US search (0 calls); SG is search-link only. */
export const SINGLES_MARKETS: EbayMarket[] = ["US", "UK", "AU", "EU"];
/** Markets searched for sealed. */
export const SEALED_MARKETS: EbayMarket[] = ["US", "UK", "AU", "EU", "CA"];

// ── Defaults (env-overridable, parsed with envInt) ───────────────────────────
export const DEFAULT_MAX_CALLS = 2200; // EBAY_MAX_CALLS: per-run cap, and the budget when the live count can't be read
export const DEFAULT_QUOTA_RESERVE = 600; // EBAY_QUOTA_RESERVE: never spent today
export const DEFAULT_MIN_VALUE_CENTS = 2000; // EBAY_MIN_VALUE_CENTS: singles floor, US/UK/AU

// ── Tiers ────────────────────────────────────────────────────────────────────
export const S1_MIN_CENTS = 10000; // singles of US$100+ — daily
export const EU_MIN_VALUE_CENTS = 5000; // the EU singles floor is max(floor, this)
export const SEALED_MIN_CENTS = 3000; // sealed of US$30+
export const LAUNCH_WINDOW_DAYS = 60; // unpriced products are searched only this long after release (or in presale), and only with a store reference price
export const DUE_GRACE_HOURS = 3; // a 24h pair checked at 05:39 yesterday is due at 05:37 today

export type Tier = "S1" | "S2" | "SU" | "P1";
export const TIER_INTERVAL_HOURS: Record<Tier, number> = { S1: 24, S2: 48, SU: 48, P1: 48 };
/** S1 < S2 = P1 < SU. */
export const TIER_PRIORITY: Record<Tier, number> = { S1: 1, S2: 2, P1: 2, SU: 3 };

/**
 * Sealed kinds the eBay pass searches: the ones matchSealedTitle can recognise
 * in a title (lib/match.ts sealedKindOfTitle), minus loose Booster Packs. A
 * search for an Illustration Box or a Promo Pack could never match, so it would
 * be a call spent for nothing.
 */
export const SEARCHED_SEALED_KINDS = new Set([
  "Booster Box", "Booster Case", "Display", "Display Case", "Starter Deck", "Double Pack Set", "Sleeved Booster Pack",
]);

// ── Model constants (tests/ebay-plan.test.ts) ────────────────────────────────
export const RETRY_RATE = 0.25; // share of singles whose strict query returns 0 and is retried (RiftCompare's figure)
export const SINGLE_CALL_COST = 1 + RETRY_RATE; // modelled calls per singles search
export const SEALED_CALL_COST = 1; // sealed: one query, no retry
export const PACING_MS = 150; // sleep between Browse calls (lib/ebay.ts)

// ── Env parsing ──────────────────────────────────────────────────────────────

/** An integer env value; "" and anything non-numeric are UNSET (null), never 0. */
export function envInt(v: string | undefined | null): number | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t || !/^-?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * The run's budget:
 *   remaining known   → max(0, min(cap, remaining − reserve))
 *   remaining unknown → max(0, min(cap, dailyLimit − reserve − ourSpend24h))
 * then a valid dispatch cap (1..cap) can only LOWER it. A dispatch cap above
 * the run cap, zero, negative or non-numeric is ignored (and reported).
 *
 * The unknown case (Developer Analytics failed) bounds the run by our OWN spend
 * over the last 24h, read from the ImportRun history: eBay's current day began
 * less than 24h ago, so everything we spent in it is in that window. Without
 * it, three runs in one eBay day could each take the full cap.
 *
 * `reserve` and `cap` are clamped by clampLimits() first: a negative reserve is
 * 0, and a cap above half the spendable day is lowered to it, so the first run
 * after eBay's reset can never take the second run's share.
 */
export function budgetFor(
  remaining: number | null,
  cap: number = DEFAULT_MAX_CALLS,
  reserve: number = DEFAULT_QUOTA_RESERVE,
  dispatchCap?: string | number | null,
  log?: (msg: string) => void,
  opts: { dailyLimit?: number | null; ourSpend24h?: number } = {},
): number {
  const dailyLimit = opts.dailyLimit ?? DEFAULT_DAILY_LIMIT;
  ({ cap, reserve } = clampLimits(cap, reserve, dailyLimit, log));
  const left = remaining ?? dailyLimit - (opts.ourSpend24h ?? 0);
  let b = Math.max(0, Math.min(cap, left - reserve));
  if (dispatchCap != null && String(dispatchCap).trim() !== "") {
    const d = envInt(String(dispatchCap));
    if (d != null && d > 0 && d <= cap) b = Math.min(b, d);
    else log?.(`eBay: ignoring max_calls=${JSON.stringify(String(dispatchCap))} (must be 1..${cap}; it can only lower the budget)`);
  }
  return b;
}

/** The daily limit assumed when eBay's live count can't be read (OP Compare's own application). */
export const DEFAULT_DAILY_LIMIT = 5000;

/** Runs a day (.github/workflows/ebay-prices.yml); the cap is at most the spendable day split between them. */
export const RUNS_PER_DAY = 2;

/**
 * EBAY_QUOTA_RESERVE below 0 → 0. EBAY_MAX_CALLS below 0 → 0; above
 * floor((dailyLimit − reserve) / RUNS_PER_DAY) → that (logged), against the
 * LIVE daily limit when eBay reported one.
 */
export function clampLimits(cap: number, reserve: number, dailyLimit: number, log?: (msg: string) => void): { cap: number; reserve: number } {
  if (reserve < 0) {
    log?.(`eBay: EBAY_QUOTA_RESERVE=${reserve} is negative — using 0`);
    reserve = 0;
  }
  if (cap < 0) cap = 0;
  const maxCap = Math.max(0, Math.floor((dailyLimit - reserve) / RUNS_PER_DAY));
  if (cap > maxCap) {
    log?.(`eBay: EBAY_MAX_CALLS=${cap} is more than half the spendable day ((${dailyLimit} − ${reserve}) / ${RUNS_PER_DAY}) — using ${maxCap}`);
    cap = maxCap;
  }
  return { cap, reserve };
}

/** EBAY_ONLY_MARKET: blank → null (all markets); a known code → it; anything else THROWS. */
export function parseOnlyMarket(v: string | undefined | null): EbayMarket | null {
  const t = (v ?? "").trim().toUpperCase();
  if (!t) return null;
  const code = t === "GB" ? "UK" : t;
  if ((EBAY_MARKETS as string[]).includes(code)) return code as EbayMarket;
  throw new Error(`EBAY_ONLY_MARKET=${JSON.stringify(v)} is not one of ${EBAY_MARKETS.join(" ")}`);
}

/** What a market searches: CA is sealed only (its singles are derived from US), SG nothing by default. */
export function marketScope(m: EbayMarket): { singles: boolean; sealed: boolean } {
  return { singles: SINGLES_MARKETS.includes(m), sealed: SEALED_MARKETS.includes(m) };
}

// ── Products and tiers ───────────────────────────────────────────────────────
export interface PlanProduct {
  id: number;
  kind: "single" | "sealed";
  marketUsd: number | null; // TCGplayer market price, USD cents
  number?: string | null; // singles: null for DON!! (never searched)
  sealedKind?: string; // sealed: Sealed.kind
  launch: boolean; // released within LAUNCH_WINDOW_DAYS, or presale
  /**
   * Unpriced products only: the cheapest non-eBay offer in any market, in USD
   * cents (RiftCompare's trustedRef). Without one an unpriced product is never
   * searched — there would be nothing to judge a listing's price against.
   */
  refUsd?: number | null;
  /** False when the product's own canonical title can't match it (lib/ebay-match.ts selfMatches): never searched. */
  matchable?: boolean;
}

export function singlesFloor(m: EbayMarket, minValueCents: number = DEFAULT_MIN_VALUE_CENTS): number {
  return m === "EU" ? Math.max(minValueCents, EU_MIN_VALUE_CENTS) : minValueCents;
}

/** The tier of a product in a market, or null when it is never searched there. */
export function tierOf(p: PlanProduct, m: EbayMarket, minValueCents: number = DEFAULT_MIN_VALUE_CENTS): Tier | null {
  const scope = marketScope(m);
  if (p.matchable === false) return null;
  // Unpriced: only in a launch window, and only with a store reference price above the floor.
  const ref = p.launch && p.refUsd != null ? p.refUsd : null;
  if (p.kind === "single") {
    if (!scope.singles || !p.number) return null;
    if (p.marketUsd == null) return ref != null && ref >= singlesFloor(m, minValueCents) ? "SU" : null;
    if (p.marketUsd >= S1_MIN_CENTS) return "S1";
    if (p.marketUsd >= singlesFloor(m, minValueCents)) return "S2";
    return null;
  }
  if (!scope.sealed || !p.sealedKind || !SEARCHED_SEALED_KINDS.has(p.sealedKind)) return null;
  return (p.marketUsd ?? ref ?? -1) >= SEALED_MIN_CENTS ? "P1" : null;
}

/** Is a pair due? Never searched → yes; else when its age reaches interval − grace. EBAY_FORCE → always. */
export function isDue(checkedAt: Date | null, tier: Tier, now: Date, force = false): boolean {
  if (force || !checkedAt) return true;
  return now.getTime() - checkedAt.getTime() >= (TIER_INTERVAL_HOURS[tier] - DUE_GRACE_HOURS) * 3600_000;
}

export function isLaunch(releasedOn: Date | null | undefined, presale: boolean, now: Date): boolean {
  if (presale) return true;
  if (!releasedOn) return false;
  return now.getTime() - releasedOn.getTime() <= LAUNCH_WINDOW_DAYS * 86_400_000;
}

// ── Pairs and the plan ───────────────────────────────────────────────────────
export interface Pair {
  productId: number;
  market: EbayMarket;
  kind: "single" | "sealed";
  tier: Tier;
  marketUsd: number | null;
  checkedAt: Date | null;
  cost: number; // modelled calls
}

export const pairKey = (productId: number, market: string) => `${productId}|${market}`;

/** Never-searched first, then most overdue, then most valuable. Tier first of all. */
export function comparePairs(a: Pair, b: Pair, now: Date): number {
  const t = TIER_PRIORITY[a.tier] - TIER_PRIORITY[b.tier];
  if (t) return t;
  if (!a.checkedAt !== !b.checkedAt) return a.checkedAt ? 1 : -1;
  if (a.checkedAt && b.checkedAt) {
    const oa = now.getTime() - a.checkedAt.getTime() - TIER_INTERVAL_HOURS[a.tier] * 3600_000;
    const ob = now.getTime() - b.checkedAt.getTime() - TIER_INTERVAL_HOURS[b.tier] * 3600_000;
    if (oa !== ob) return ob - oa;
  }
  const v = (b.marketUsd ?? -1) - (a.marketUsd ?? -1);
  if (v) return v;
  return a.productId - b.productId;
}

/** Every due pair of one market, in priority order. */
export function duePairs(
  products: PlanProduct[],
  market: EbayMarket,
  checks: Map<string, Date>,
  now: Date,
  opts: { force?: boolean; minValueCents?: number } = {},
): Pair[] {
  const out: Pair[] = [];
  for (const p of products) {
    const tier = tierOf(p, market, opts.minValueCents);
    if (!tier) continue;
    const checkedAt = checks.get(pairKey(p.id, market)) ?? null;
    if (!isDue(checkedAt, tier, now, opts.force)) continue;
    out.push({ productId: p.id, market, kind: p.kind, tier, marketUsd: p.marketUsd, checkedAt, cost: p.kind === "single" ? SINGLE_CALL_COST : SEALED_CALL_COST });
  }
  return out.sort((a, b) => comparePairs(a, b, now));
}

export interface RunPlan {
  /** Pairs to search, in execution order (markets rotated by UTC day). */
  order: Pair[];
  /** Due pairs the modelled budget did not reach; searched only if real spend leaves room (they stay due otherwise). */
  overflow: Pair[];
  /** Markets in the order they are executed this run. */
  marketOrder: EbayMarket[];
  allowance: Record<string, number>; // phase-1 allowance per market (modelled calls)
  used: Record<string, number>; // modelled calls planned per market (phase 1 + spill)
  spill: number; // modelled calls handed on in phase 2
  modelled: number; // total modelled calls planned
}

/** Execution order of the markets, rotated by UTC day so no market is always last. */
export function rotateMarkets(markets: EbayMarket[], dayIndex: number): EbayMarket[] {
  const n = markets.length;
  if (!n) return [];
  const k = ((dayIndex % n) + n) % n;
  return [...markets.slice(k), ...markets.slice(0, k)];
}

export function utcDayIndex(now: Date): number {
  return Math.floor(now.getTime() / 86_400_000);
}

/**
 * Plan a run.
 * Phase 1: each market gets floor(budget × share) modelled calls and takes its
 *          own due pairs in order until that allowance is used.
 * Phase 2: the unused allowance goes to the remaining due pairs of ALL markets,
 *          merged by the same ordering.
 * With `only` set, that market gets the whole budget and nothing spills.
 */
export function planRun(
  dueByMarket: Partial<Record<EbayMarket, Pair[]>>,
  budget: number,
  now: Date,
  opts: { only?: EbayMarket | null; dayIndex?: number } = {},
): RunPlan {
  const markets = (opts.only ? [opts.only] : EBAY_MARKETS).filter((m) => (dueByMarket[m]?.length ?? 0) > 0 || opts.only === m);
  const allowance: Record<string, number> = {};
  const used: Record<string, number> = {};
  const taken = new Map<EbayMarket, Pair[]>();
  const rest: Pair[] = [];
  let total = 0;
  for (const m of markets) {
    const share = opts.only ? 1 : MARKET_SHARES[m];
    allowance[m] = Math.floor(budget * share);
    used[m] = 0;
    const list: Pair[] = [];
    const due = dueByMarket[m] ?? [];
    let i = 0;
    // Strict priority: stop at the first pair that doesn't fit, so a cheaper
    // low-tier pair never jumps ahead of a higher-tier one.
    for (; i < due.length && used[m] + due[i].cost <= allowance[m]; i++) {
      list.push(due[i]);
      used[m] += due[i].cost;
    }
    rest.push(...due.slice(i));
    taken.set(m, list);
    total += used[m];
  }
  // Phase 2 — spill.
  let spill = 0;
  const overflow: Pair[] = [];
  const left = budget - total;
  if (!opts.only && left > 0) {
    rest.sort((a, b) => comparePairs(a, b, now));
    let i = 0;
    for (; i < rest.length && spill + rest[i].cost <= left; i++) {
      const p = rest[i];
      taken.get(p.market)!.push(p);
      used[p.market] += p.cost;
      spill += p.cost;
    }
    overflow.push(...rest.slice(i));
  } else overflow.push(...rest.sort((a, b) => comparePairs(a, b, now)));
  const marketOrder = rotateMarkets(markets, opts.dayIndex ?? utcDayIndex(now));
  const order = marketOrder.flatMap((m) => taken.get(m) ?? []);
  return { order, overflow, marketOrder, allowance, used, spill, modelled: total + spill };
}

// ── The daily model (tests/ebay-plan.test.ts) ────────────────────────────────
export interface ModelCounts {
  s1: number; // singles ≥ US$100
  s2Low: number; // singles from the US/UK/AU floor up to the EU floor (US$20–50)
  s2High: number; // singles from the EU floor to US$100 (US$50–100)
  su: number; // unpriced singles in a launch window
  sealed: number; // searched sealed (≥ US$30, plus unpriced in a launch window)
}

/** Modelled Browse calls a day, per market and in total. */
export function modelDailyCalls(c: ModelCounts): { byMarket: Record<EbayMarket, number>; total: number } {
  const perDay = (n: number, tier: Tier) => n * (24 / TIER_INTERVAL_HOURS[tier]);
  const singles = (eu: boolean) =>
    (perDay(c.s1, "S1") + perDay(eu ? c.s2High : c.s2Low + c.s2High, "S2") + perDay(c.su, "SU")) * SINGLE_CALL_COST;
  const sealed = perDay(c.sealed, "P1") * SEALED_CALL_COST;
  const byMarket = {} as Record<EbayMarket, number>;
  for (const m of EBAY_MARKETS) {
    const s = marketScope(m);
    byMarket[m] = (s.singles ? singles(m === "EU") : 0) + (s.sealed ? sealed : 0);
  }
  return { byMarket, total: Object.values(byMarket).reduce((a, b) => a + b, 0) };
}

// ── What a pair's search outcome writes (lib/ebay-import.ts) ─────────────────
export type SearchOutcome =
  | { status: "ok"; matched: boolean } // every query the pair needed completed (HTTP 200)
  | { status: "failed" } // no token, network error, timeout, 4xx/5xx
  | { status: "rate-limited" } // HTTP 429 — latches the run
  | { status: "budget" }; // spend() refused

/**
 * The partial-run safety rule. Only a COMPLETED search writes: a match upserts
 * the row, no match deletes it (yesterday's listing is not evidence of today's).
 * Anything else leaves the Offer AND the EbayCheck untouched, so the pair stays
 * due and a run cut short never removes a live price.
 */
export function pairWrite(o: SearchOutcome): { offer: "upsert" | "delete" | "keep"; check: "matched" | "unmatched" | "keep" } {
  if (o.status !== "ok") return { offer: "keep", check: "keep" };
  return o.matched ? { offer: "upsert", check: "matched" } : { offer: "delete", check: "unmatched" };
}

/** A singles pair needs every query it sent to complete: a 429 on the retry is NOT completed. */
export type QueryStatus = "ok" | "failed" | "rate-limited" | "budget";
export function combineQueries(strict: QueryStatus, retry: QueryStatus | null): QueryStatus {
  if (strict !== "ok") return strict;
  return retry ?? "ok";
}

// ── The failure breaker (lib/ebay-import.ts) ─────────────────────────────────
// A search that fails without a 429 (4xx, 5xx, timeout, network) is charged and
// the pair stays due. One broken thing (an outage, a hang, a keyset not approved
// for Browse, a filter eBay rejects) would otherwise fail every pair and spend
// the whole budget, twice a day, on a green run.
export const BREAKER_CONSECUTIVE = 10; // this many failed pairs in a row stop the run
export const BREAKER_MIN_PAIRS = 50; // after this many pairs…
export const BREAKER_RATE = 0.5; // …a failure rate above this stops the run

export class FailureBreaker {
  pairs = 0;
  failures = 0;
  consecutive = 0;
  tripped: string | null = null;
  /** Record one pair's outcome ("failed" or completed); true when the run must stop. */
  record(failed: boolean): boolean {
    this.pairs++;
    if (failed) {
      this.failures++;
      this.consecutive++;
    } else this.consecutive = 0;
    if (!this.tripped && this.consecutive >= BREAKER_CONSECUTIVE) this.tripped = `${this.consecutive} failed searches in a row`;
    if (!this.tripped && this.pairs >= BREAKER_MIN_PAIRS && this.failures / this.pairs > BREAKER_RATE)
      this.tripped = `${this.failures} of ${this.pairs} searches failed`;
    return this.tripped != null;
  }
}

/**
 * Is the run green? Red (exit 1, ImportRun.ok = false) when the keys were
 * refused, when the failure breaker tripped, or when calls were spent and not
 * one pair completed.
 */
export function ebayRunVerdict(s: { tokenRefused?: boolean; latched: string | null; spent: number; completed: number }): { ok: boolean; reason: string | null } {
  if (s.tokenRefused) return { ok: false, reason: "eBay token refused — the keys are set but eBay would not issue a token (0 Browse calls made)" };
  if (s.latched === "failures") return { ok: false, reason: "too many eBay searches failed (not 429) — the run stopped early" };
  if (s.spent > 0 && s.completed === 0) return { ok: false, reason: `spent ${s.spent} calls and no search completed` };
  return { ok: true, reason: null };
}

/** Foreign spend suspected: this run spends at most this many calls (a GitHub ::warning:: says why). */
export const FOREIGN_SPEND_BUDGET = 50;
