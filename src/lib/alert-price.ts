import type { prisma } from "./db";
import { sourceLabel } from "./stores";

// ─────────────────────────────────────────────────────────────────────────────
// THE ALERT PRICE — what a price alert compares, and the stores it names.
// RiftCompare's lib/alert-price.ts, ported over OP Compare's Offer table in
// wave 2 (2026-10-03).
// ─────────────────────────────────────────────────────────────────────────────
// Card.low<M> is the cheapest open listing ANYWHERE in a market — eBay
// included — so an alert never reads it. The alert price is narrower, by
// construction:
//   • a real store (`store:<key>`) or TCGplayer's cheapest US listing
//     (`tcgplayer`) — never an eBay row (`ebay`, `ebay_us`, anything starting
//     "ebay": its identity and condition guards are the weakest of any source,
//     and CLAUDE.md keeps eBay out of alerts);
//   • in stock, Near Mint or no stated condition (alertConditionRank 0);
//   • refreshed within ALERT_FRESH_MS (36h: every eligible source rewrites
//     its rows on each of the two daily imports).
//
// STATE, not just a number:
//   • "priced"  — at least one eligible fresh copy; the cheapest is the price.
//   • "soldout" — nothing eligible in stock, and no stale row claims otherwise.
//   • "unknown" — we cannot tell, because a source whose feed is failing still
//                 claims stock: no fresh eligible copy but a row seen 36-72h
//                 ago claims one; no eligible row inside 72h but one up to
//                 ALERT_OUTAGE_MAX_MS (14 days) old does; or a STALE row from
//                 another source is cheaper than every fresh copy. Never read
//                 as sold out, or an outage would send "back in stock" when
//                 the feed recovers.
//
// ONE bounded query for every watched (card, market) pair: grouped by market
// (at most six OR branches of `productId IN (…)`), in-stock rows refreshed in
// the last 72h, narrow columns, capped at ALERT_ROWS_PER_PAIR a pair. Plus,
// only when some pair reads sold out, one more bounded read of those pairs'
// older rows. Called from the alert run (scripts/alerts.ts, GitHub Actions),
// never from a page and never inside an unstable_cache.

export const ALERT_FRESH_MS = 36 * 60 * 60 * 1000;
export const ALERT_LOOKBACK_MS = 72 * 60 * 60 * 1000;
/** An in-stock eligible row older than 72h but newer than this still says "unknown", not "soldout". */
export const ALERT_OUTAGE_MAX_MS = 14 * 24 * 60 * 60 * 1000;
/** Stores an alert names, cheapest first. */
export const ALERT_STORE_LIMIT = 3;
/** Row cap per watched pair — far above any real card's store count per market. */
export const ALERT_ROWS_PER_PAIR = 40;

export type AlertPriceState = "priced" | "soldout" | "unknown";

/** One Offer row as the alert query selects it. */
export interface AlertPriceRow {
  productId: number;
  market: string;
  source: string;
  priceCents: number;
  condition: string | null;
  url: string;
  inStock: boolean;
  updatedAt: Date;
}

/** A copy an alert may quote: the row's own price, condition and link. */
export interface AlertOffer {
  source: string;
  name: string;
  priceCents: number;
  condition: string | null;
  url: string; // the raw listing URL; the alert run affiliate-wraps it
  lastSeen: Date;
}

export interface AlertPrice {
  state: AlertPriceState;
  priceCents: number | null; // the cheapest offer's price when "priced", else null
  condition: string | null; // that offer's condition (NM or unstated by construction)
  checkedAt: Date | null; // when that offer was last refreshed by an import
  stores: AlertOffer[]; // up to ALERT_STORE_LIMIT, one per source, cheapest first
}

export const alertPairKey = (market: string, cardId: number) => `${market}:${cardId}`;

/**
 * Alert eligibility of a condition label: 0 = Near Mint, Mint or unstated (may
 * trigger an alert); 1 = lightly played or Excellent; 2 = moderately played,
 * Good or just "played"; 3 = heavily played; 4 = damaged. Worst named wins.
 * RiftCompare's alertConditionRank (lib/condition.ts), stricter than the
 * importer's conditionRank on purpose: a played copy read as a "price drop"
 * is exactly the false alert this exists to stop.
 */
export function alertConditionRank(condition: string | null | undefined): number {
  const t = (condition ?? "").trim().toLowerCase();
  if (!t) return 0;
  if (/damaged|\bdmg\b|\bpoor\b/.test(t)) return 4;
  if (/heav(ily|y)?[\s-]*play|\bhp\b/.test(t)) return 3;
  if (/moderate(ly)?[\s-]*play|\bmp\b/.test(t)) return 2;
  if (/\b(very\s*)?good\b|\bgd\b/.test(t)) return 2;
  if (/(light|slight)(ly)?[\s-]*play|\blp\b|\bsp\b|excellent|\bex\b/.test(t)) return 1;
  if (/play(ed)?\b/.test(t)) return 2;
  return 0;
}

/** May rows from this source ever set or name an alert price? A tracked store or TCGplayer — never eBay. */
export function isAlertEligibleSource(source: string): boolean {
  const s = source.toLowerCase();
  return !s.startsWith("ebay") && (s.startsWith("store:") || s === "tcgplayer");
}

/** Pure: may this ROW set the alert price right now? */
export function isAlertEligibleRow(r: AlertPriceRow, now: Date, freshMs = ALERT_FRESH_MS): boolean {
  return (
    r.inStock &&
    isAlertEligibleSource(r.source) &&
    alertConditionRank(r.condition) === 0 &&
    r.priceCents > 0 &&
    now.getTime() - r.updatedAt.getTime() <= freshMs
  );
}

const NO_PRICE = { priceCents: null, condition: null, checkedAt: null } as const;

/**
 * Pure: one (card, market)'s alert price from its rows. Ties break by source
 * key, so which store an email names is deterministic run to run.
 */
export function alertPriceFromRows(rows: readonly AlertPriceRow[], now: Date): AlertPrice {
  const fresh = rows.filter((r) => isAlertEligibleRow(r, now));
  // Rows that would count if they were fresh, but were refreshed 36-72h ago.
  const stale = rows.filter((r) => !isAlertEligibleRow(r, now) && isAlertEligibleRow(r, now, ALERT_LOOKBACK_MS));
  if (!fresh.length) return { state: stale.length ? "unknown" : "soldout", ...NO_PRICE, stores: [] };
  // A failing store that was CHEAPER than every fresh copy: unknown, so the run
  // writes nothing. A stale row from a source that also has a fresh copy is a
  // listing that store dropped, not an outage, and is ignored.
  const freshMin = Math.min(...fresh.map((r) => r.priceCents));
  const freshSources = new Set(fresh.map((r) => r.source));
  if (stale.some((r) => !freshSources.has(r.source) && r.priceCents < freshMin)) {
    return { state: "unknown", ...NO_PRICE, stores: [] };
  }
  const sorted = [...fresh].sort((a, b) => a.priceCents - b.priceCents || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
  const stores: AlertOffer[] = [];
  const seen = new Set<string>();
  for (const r of sorted) {
    if (seen.has(r.source)) continue;
    seen.add(r.source);
    stores.push({ source: r.source, name: sourceLabel(r.source, r.market), priceCents: r.priceCents, condition: r.condition ?? null, url: r.url, lastSeen: r.updatedAt });
    if (stores.length >= ALERT_STORE_LIMIT) break;
  }
  const lead = stores[0]!;
  return { state: "priced", priceCents: lead.priceCents, condition: lead.condition, checkedAt: lead.lastSeen, stores };
}

export type AlertPriceDb = { offer: Pick<typeof prisma.offer, "findMany"> };

/**
 * The baseline a NEW watch starts from: the alert price when the pair is
 * "priced", else null — so the first store listing fires "now listed".
 * dropAnchorCents marks a baseline that IS an alert price.
 */
export function alertBaselineSeed(p: AlertPrice | undefined): {
  lastPriceCents: number | null;
  startPriceCents: number | null;
  dropAnchorCents: number | null;
} {
  const cents = p?.state === "priced" ? p.priceCents : null;
  return { lastPriceCents: cents, startPriceCents: cents, dropAnchorCents: cents };
}

const ELIGIBLE_SOURCE = { OR: [{ source: { startsWith: "store:" } }, { source: "tcgplayer" }] };

/**
 * The alert price for every watched (card, market) pair, in ONE query. A pair
 * with no rows at all comes back "soldout". Throws if the read fails: with no
 * prices there is nothing safe to compare, and the caller must not read that
 * as every card selling out.
 */
export async function computeAlertPrices(
  db: AlertPriceDb,
  pairs: readonly { cardId: number; market: string }[],
  now: Date,
  opts: { slim?: boolean } = {},
): Promise<Map<string, AlertPrice>> {
  const byMarket = new Map<string, Set<number>>();
  for (const p of pairs) {
    const ids = byMarket.get(p.market) ?? new Set<number>();
    ids.add(p.cardId);
    byMarket.set(p.market, ids);
  }
  const out = new Map<string, AlertPrice>();
  if (!byMarket.size) return out;
  const pairCount = [...byMarket.values()].reduce((n, s) => n + s.size, 0);
  const rows = await db.offer.findMany({
    where: {
      inStock: true,
      updatedAt: { gte: new Date(now.getTime() - ALERT_LOOKBACK_MS) },
      AND: [ELIGIBLE_SOURCE, { OR: [...byMarket].map(([market, ids]) => ({ market, productId: { in: [...ids] } })) }],
    },
    select: { productId: true, market: true, source: true, priceCents: true, condition: true, url: !opts.slim, inStock: true, updatedAt: true },
    // Cheapest first, so a (never expected) truncation drops the dearest rows.
    orderBy: { priceCents: "asc" },
    take: pairCount * ALERT_ROWS_PER_PAIR,
  });
  const grouped = new Map<string, AlertPriceRow[]>();
  for (const r of rows) {
    const k = alertPairKey(r.market, r.productId);
    const row: AlertPriceRow = { ...r, url: (r as { url?: string }).url ?? "" };
    const list = grouped.get(k);
    if (list) list.push(row);
    else grouped.set(k, [row]);
  }
  for (const [market, ids] of byMarket) for (const cardId of ids) out.set(alertPairKey(market, cardId), alertPriceFromRows(grouped.get(alertPairKey(market, cardId)) ?? [], now));

  // A pair with nothing eligible inside 72h is "soldout" only if no OLDER
  // in-stock eligible row (up to ALERT_OUTAGE_MAX_MS) survives from a source
  // whose imports keep failing.
  const soldOut = new Map<string, Set<number>>();
  for (const [market, ids] of byMarket) {
    for (const cardId of ids) {
      if (out.get(alertPairKey(market, cardId))?.state !== "soldout") continue;
      const set = soldOut.get(market) ?? new Set<number>();
      set.add(cardId);
      soldOut.set(market, set);
    }
  }
  if (soldOut.size) {
    const soldOutCount = [...soldOut.values()].reduce((n, s) => n + s.size, 0);
    const old = await db.offer.findMany({
      where: {
        inStock: true,
        updatedAt: { gte: new Date(now.getTime() - ALERT_OUTAGE_MAX_MS), lt: new Date(now.getTime() - ALERT_LOOKBACK_MS) },
        AND: [ELIGIBLE_SOURCE, { OR: [...soldOut].map(([market, ids]) => ({ market, productId: { in: [...ids] } })) }],
      },
      select: { productId: true, market: true, source: true, priceCents: true, condition: true, inStock: true, updatedAt: true },
      take: soldOutCount * ALERT_ROWS_PER_PAIR,
    });
    for (const r of old) {
      if (!soldOut.get(r.market)?.has(r.productId)) continue;
      if (isAlertEligibleRow({ ...r, url: "" }, now, ALERT_OUTAGE_MAX_MS)) out.set(alertPairKey(r.market, r.productId), { state: "unknown", ...NO_PRICE, stores: [] });
    }
  }
  return out;
}
