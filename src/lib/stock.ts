// Stock first (owner's creator feedback, 2026-10-25: "seeing where there is stock is more helpful than price — booster boxes are
// often only at LGS"). The words every card, rail and product page leads with, and the three lists built on stock: what came back
// into stock (price history), the week's biggest price moves in popular sets (price history), and older sets' product that stores
// still have (today's stock). Pure: no database, no React; the loaders are in stock-data.ts.
//
// THE COUNTS. `inStockStores` and `listedStores` are independent stores only (ProductStat); TCGplayer is named after them ("+ TCGplayer"),
// never counted as a store. "of N" is the stores that LIST the product (in stock or sold out), not every store in the region: a store
// that never carried it is not "out of stock" of it.
//
// THE HISTORY. data/public/price-history.json (lib/price-history.ts): per day, the cheapest in-stock price (null: nothing open) and
// the stores with it in stock. "Back in stock" is a change in those snapshots (nothing open on one day, open the next), and a price
// move is the same product's cheapest in-stock price on two days a week apart: both are facts the file holds. Nothing is shown
// before the file holds enough days for it (MIN_DAYS_BACK, MIN_DAYS_MOVES).
import { plural } from "./format";
import { dailySeries, type PriceHistory } from "./price-history";
import { SET_BY_CODE, SETS, type MtgSet } from "./sets";

// ─── The stock line ─────────────────────────────────────────────────────────────

export interface StockFacts {
  inStockStores: number;
  listedStores: number;
  marketplaceOpen: boolean;
}

/**
 * Where it can be bought, as one sentence, before any price: "In stock at 12 of 15 stores", "Pre-order at 3 of 4 stores", "On
 * TCGplayer only: no store has it in stock", "Sold out at all 5 stores that list it", "Not in stock anywhere we track".
 * TCGplayer is never in the count; `tcg` says whether to name it after ("+ TCGplayer").
 */
export function stockHeadline(p: StockFacts, preorder = false): { text: string; open: boolean; tcg: boolean } {
  const n = p.inStockStores;
  const of = Math.max(p.listedStores, n);
  if (n > 0) return { text: `${preorder ? "Pre-order" : "In stock"} at ${n} of ${plural(of, "store")}`, open: true, tcg: p.marketplaceOpen };
  if (p.marketplaceOpen) return { text: `On TCGplayer only: no store has it ${preorder ? "open for pre-order" : "in stock"}`, open: true, tcg: false };
  if (of > 0) return { text: of === 1 ? "Sold out at the 1 store that lists it" : `Sold out at all ${of} stores that list it`, open: false, tcg: false };
  return { text: "Not in stock anywhere we track", open: false, tcg: false };
}

// ─── Back in stock (price history) ───────────────────────────────────────────────

/** Back in stock needs two days of snapshots: one with nothing open, the next with it open. */
export const MIN_DAYS_BACK = 2;
/** How far back "back in stock" looks: a product that came back in the last week and is still open. */
export const BACK_DAYS = 7;

/** More returns than this on one day (or this share of the market's products) is a failed read the day before, not restocks. */
export const BULK_RETURNS = 25;
export const BULK_SHARE = 0.1;

export interface BackInStock {
  slug: string;
  /** The day (UTC days since 1970) of the snapshot it was open in again, after one with nothing open. */
  day: number;
  /** Today's (the last snapshot's) stores in stock and cheapest price. */
  stores: number;
  cents: number;
}

/** Days of snapshots in the file. */
export const historyDays = (h: PriceHistory | null): number => (h ? h.through - h.since + 1 : 0);

/**
 * The market's products open in the last snapshot that, within the last `days`, went from a snapshot with nothing open to one with
 * it open. A product's FIRST snapshot is never a "came back" (it may only be new to MTG Compare: that is "Newly listed"). Most recent
 * return first, then the most stores. Empty under MIN_DAYS_BACK days of snapshots.
 */
export function backInStock(h: PriceHistory | null, market: string, { days = BACK_DAYS } = {}): BackInStock[] {
  if (!h || historyDays(h) < MIN_DAYS_BACK) return [];
  const slugs = Object.keys(h.series[market] ?? {});
  const found: BackInStock[] = [];
  const perDay = new Map<number, number>();
  for (const slug of slugs) {
    const s = dailySeries(h, market, slug, days + 1);
    const last = s[s.length - 1];
    if (!last || last.day !== h.through || last.cents == null) continue;
    let back: number | null = null;
    for (let i = 1; i < s.length; i++) if (s[i - 1].cents == null && s[i].cents != null) back = s[i].day;
    if (back == null) continue;
    found.push({ slug, day: back, stores: last.stores, cents: last.cents });
    perDay.set(back, (perDay.get(back) ?? 0) + 1);
  }
  // A day on which a large share of the market "came back" is a store read that failed the day before (its listings read as
  // nothing open), not restocks: that day's returns are left out.
  const gap = Math.max(BULK_RETURNS, Math.ceil(slugs.length * BULK_SHARE));
  const out = found.filter((b) => (perDay.get(b.day) ?? 0) <= gap);
  return out.sort((a, b) => b.day - a.day || b.stores - a.stores || a.slug.localeCompare(b.slug));
}

// ─── Price moves (price history) ─────────────────────────────────────────────────

/** A week-over-week move needs the day a week back and today: 8 days of snapshots. */
export const MIN_DAYS_MOVES = 8;
export const MOVE_DAYS = 7;
/** At least 10%, and at least this many cents of the currency (5.00), so a A$0.40 pack wobble is not a "move". */
export const MOVE_MIN_PCT = 10;
export const MOVE_MIN_CENTS = 500;
/** Under half or over double a week back is a misfiled listing far more often than a price (the /deals rule's bound). */
export const MOVE_MAX_RATIO = 2;

export interface PriceMove {
  slug: string;
  /** The cheapest in-stock price a week back and today. */
  before: number;
  after: number;
  /** Whole percent, + up, − down. */
  pct: number;
  /** Stores with it in stock today. */
  stores: number;
}

/**
 * The cheapest in-stock price today against the same product's a week back (both days open), for `slugs` only (the popular sets'
 * headline products): at least MOVE_MIN_PCT% and MOVE_MIN_CENTS either way, within MOVE_MAX_RATIO. Biggest move first.
 * Empty under MIN_DAYS_MOVES days of snapshots.
 */
export function priceMoves(h: PriceHistory | null, market: string, slugs: Iterable<string>, { days = MOVE_DAYS, minPct = MOVE_MIN_PCT, minCents = MOVE_MIN_CENTS } = {}): PriceMove[] {
  if (!h || historyDays(h) < days + 1) return [];
  const out: PriceMove[] = [];
  for (const slug of new Set(slugs)) {
    const s = dailySeries(h, market, slug, days + 1);
    const now = s[s.length - 1];
    const then = s[0];
    if (!now || !then || now.day !== h.through || then.day !== h.through - days || now.cents == null || then.cents == null) continue;
    const diff = now.cents - then.cents;
    const ratio = now.cents / then.cents;
    if (ratio > MOVE_MAX_RATIO || ratio < 1 / MOVE_MAX_RATIO) continue;
    const pct = Math.round((diff / then.cents) * 100);
    if (Math.abs(pct) >= minPct && Math.abs(diff) >= minCents) out.push({ slug, before: then.cents, after: now.cents, pct, stores: now.stores });
  }
  return out.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.slug.localeCompare(b.slug));
}

/** The product types a buyer watches a set's price by (booster boxes, Collector boxes, bundles, Commander decks). */
export const MOVE_TYPES = ["Play Booster Box", "Collector Booster Box", "Draft Booster Box", "Set Booster Box", "Bundle", "Commander Deck"];

/**
 * The sets whose prices are worth watching: the owner's hot sets, the newest released, and the ones the region's stores carry most.
 * Creators talk about select products of popular sets, not every set (owner's feedback, 2026-10-25). Released sets only.
 */
export function popularSetCodes(hot: readonly string[], inStockBySet: ReadonlyMap<string, number>, today: string, { newest = 6, most = 8 } = {}): string[] {
  const released = (c: string) => (SET_BY_CODE.get(c)?.releaseDate ?? "9999") <= today;
  const byStock = [...inStockBySet.entries()].filter(([c, n]) => n > 0 && released(c)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const codes = [...hot.filter(released), ...SETS.filter((s) => released(s.code)).slice(0, newest).map((s) => s.code), ...byStock.slice(0, most).map(([c]) => c)];
  return [...new Set(codes)];
}

// ─── Out of print, still in stock ────────────────────────────────────────────────

/** A set released this many months ago or more counts as older product (Wizards reprints a set's boosters for well under that). */
export const OLDER_MONTHS = 18;
/** The types the page lists: boxes, bundles and Commander decks (the product people hunt for at a local store). */
export const OLDER_TYPES = ["Play Booster Box", "Collector Booster Box", "Draft Booster Box", "Set Booster Box", "Jumpstart Booster Box", "Bundle", "Gift Bundle", "Commander Deck"];

/** The day OLDER_MONTHS before `today` (YYYY-MM-DD). */
export function olderCutoff(today: string, months = OLDER_MONTHS): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** The sets released on or before the cutoff, newest first. */
export function olderSets(today: string, months = OLDER_MONTHS): MtgSet[] {
  const cut = olderCutoff(today, months);
  return SETS.filter((s) => s.releaseDate <= cut);
}

export interface OlderCard extends StockFacts {
  slug: string;
  setCode: string | null;
  productType: string;
  name: string;
}

/**
 * Older sets' headline product that an independent store has in stock today, grouped by set: sets with the most store stock first,
 * then newer first; in a set, most stores first. TCGplayer alone does not count (the point is the stores that still carry it).
 */
export function groupOlderInStock<T extends OlderCard>(cards: readonly T[], today: string, months = OLDER_MONTHS): { set: MtgSet; items: T[]; stores: number }[] {
  const codes = new Set(olderSets(today, months).map((s) => s.code));
  const by = new Map<string, T[]>();
  for (const c of cards) {
    if (!c.setCode || !codes.has(c.setCode) || c.inStockStores < 1 || !OLDER_TYPES.includes(c.productType)) continue;
    (by.get(c.setCode) ?? by.set(c.setCode, []).get(c.setCode)!).push(c);
  }
  const typeIx = (t: string) => OLDER_TYPES.indexOf(t);
  return [...by.entries()]
    .map(([code, items]) => ({
      set: SET_BY_CODE.get(code)!,
      items: [...items].sort((a, b) => b.inStockStores - a.inStockStores || typeIx(a.productType) - typeIx(b.productType) || a.name.localeCompare(b.name)),
      stores: items.reduce((n, c) => n + c.inStockStores, 0),
    }))
    .sort((a, b) => b.stores - a.stores || b.set.releaseDate.localeCompare(a.set.releaseDate));
}
