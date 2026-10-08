import { FINISH_INDEX, finishLabel, unitKey, type Finish, type UnitRef } from "./constants";
import type { Country } from "./country";
import { getCardsByIds, getSets } from "./data";
import { planeSource } from "./data/plane/runtime";
import { readLiveOffers, type LiveOffer } from "./offer-read";
import { sourceLabel } from "./stores";

// ─────────────────────────────────────────────────────────────────────────────
// THE ALERT PRICE — what a price alert compares, and the stores it names.
// RiftCompare's lib/alert-price.ts, ported over the published offer files:
// the rows come from the shared live-offer reader (offer-read.ts), one
// (product, finish) unit at a time.
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
//     its rows on the daily import, so a day-old row is current).
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
// ONE read per market for every watched (product, finish) pair: the live
// offers of the units (a handful of bucket files and ss/runs.json). The reader
// marks a row out of stock when its store run is older than 72h or failed, so
// a row last refreshed 36h-14d ago that the reader no longer calls in stock is
// treated as a row that still claims stock ("unknown"), never as a sell-out.
// Called from the alert run (scripts/alerts.ts, GitHub Actions), never from a
// page and never inside an unstable_cache.

export const ALERT_FRESH_MS = 36 * 60 * 60 * 1000;
export const ALERT_LOOKBACK_MS = 72 * 60 * 60 * 1000;
/** An in-stock eligible row older than 72h but newer than this still says "unknown", not "soldout". */
export const ALERT_OUTAGE_MAX_MS = 14 * 24 * 60 * 60 * 1000;
/** Stores an alert names, cheapest first. */
export const ALERT_STORE_LIMIT = 3;
/** Row cap per watched pair — far above any real card's store count per market. */
export const ALERT_ROWS_PER_PAIR = 40;

export type AlertPriceState = "priced" | "soldout" | "unknown";

/** One live offer as the alert price reads it. */
export interface AlertPriceRow {
  productId: number;
  finish?: Finish;
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

export const alertPairKey = (market: string, cardId: number, finish: Finish) => `${market}:${cardId}.${FINISH_INDEX[finish]}`;

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

/** How a run reads the live offers of some units in one market. The default is the published files (liveAlertReader); a test injects a stand-in. */
export type AlertOfferReader = (units: readonly UnitRef[], market: Country) => Promise<LiveOffer[]>;
export const liveAlertReader = (): AlertOfferReader => async (units, market) => {
  const { src } = await planeSource();
  return readLiveOffers(src, { units, market, includeTcgplayer: true });
};

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

/** A live offer as an alert row. A row the reader calls out of stock but whose store last ran 36h-14d ago still claims stock for the "unknown" rule. */
export function alertRowOf(o: LiveOffer, now: Date): AlertPriceRow {
  const age = now.getTime() - o.refreshedAt.getTime();
  const claimsStock = o.inStock || (age > ALERT_FRESH_MS && age <= ALERT_OUTAGE_MAX_MS);
  return { productId: o.productId, finish: o.finish, market: o.market, source: o.source, priceCents: o.priceCents, condition: o.condition, url: o.url, inStock: claimsStock, updatedAt: o.refreshedAt };
}

/**
 * The alert price for every watched (product, finish, market) pair. A pair
 * with no rows at all comes back "soldout". Throws if the read fails: with no
 * prices there is nothing safe to compare, and the caller must not read that
 * as every card selling out.
 */
export async function computeAlertPrices(
  read: AlertOfferReader,
  pairs: readonly { cardId: number; finish: Finish; market: string }[],
  now: Date,
): Promise<Map<string, AlertPrice>> {
  const byMarket = new Map<string, Map<number, UnitRef>>();
  for (const p of pairs) {
    const units = byMarket.get(p.market) ?? new Map<number, UnitRef>();
    units.set(p.cardId * 2 + FINISH_INDEX[p.finish], { id: p.cardId, finish: p.finish });
    byMarket.set(p.market, units);
  }
  const out = new Map<string, AlertPrice>();
  for (const [market, units] of byMarket) {
    const offers = await read([...units.values()], market as Country);
    const grouped = new Map<string, AlertPriceRow[]>();
    for (const o of offers) {
      if (!isAlertEligibleSource(o.source)) continue;
      const row = alertRowOf(o, now);
      const k = alertPairKey(o.market, o.productId, o.finish);
      const list = grouped.get(k);
      if (list) list.push(row);
      else grouped.set(k, [row]);
    }
    for (const u of units.values()) {
      const k = alertPairKey(market, u.id, u.finish);
      const rows = grouped.get(k) ?? [];
      let price = alertPriceFromRows(rows, now);
      // Nothing eligible inside 72h, but an older row still claims stock from a feed that keeps failing: unknown.
      if (price.state === "soldout" && rows.some((r) => isAlertEligibleRow(r, now, ALERT_OUTAGE_MAX_MS))) price = { state: "unknown", ...NO_PRICE, stores: [] };
      out.set(k, price);
    }
  }
  return out;
}

/** What an alert run names a card by: the unit's own card row (name, treatment, set, number, market price), read from the published catalogue. */
export interface AlertCard {
  id: number;
  finish: Finish;
  name: string;
  variant: string | null; // the treatment label and, for a foil unit, its finish word
  slug: string;
  number: string | null;
  setCode: string;
  releasedOn: Date | null;
  marketUsd: number | null; // the unit's TCGplayer MARKET price in USD cents (the below-market reference)
  low: Record<Country, number | null>;
}
/** Keyed by unitKey(id, finish). A product the catalogue no longer has is absent. */
export type AlertCardLoader = (units: readonly UnitRef[]) => Promise<Map<string, AlertCard>>;

export const liveAlertCards: AlertCardLoader = async (units) => {
  const out = new Map<string, AlertCard>();
  const sets = new Map((await getSets()).map((x) => [x.id, x] as const));
  for (const finish of ["N", "F"] as const) {
    const ids = [...new Set(units.filter((u) => u.finish === finish).map((u) => u.id))];
    if (!ids.length) continue;
    for (const [id, c] of await getCardsByIds(ids, { unit: finish })) {
      const released = sets.get(c.setId)?.releasedOn ?? null;
      const variant = [c.label, finish === "F" ? finishLabel(c, "F") : null].filter(Boolean).join(", ") || null;
      out.set(unitKey(id, finish), { id, finish, name: c.name, variant, slug: c.slug, number: c.number, setCode: c.setCode, releasedOn: released ? new Date(released) : null, marketUsd: c.marketUsd, low: c.low });
    }
  }
  return out;
};
