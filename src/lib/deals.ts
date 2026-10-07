// Deal Finder's rules, pure (no Prisma, no Next): RiftCompare's three views
// (src/lib/arbitrage.ts there), ported onto OP Compare's data. Client-safe, so
// the "only my cards" island and the homepage read the same definitions.
//
//   tcg      "Underpriced vs TCGplayer" (default): a STORE or an eBay seller in
//            the viewer's market sells the card for less than TCGplayer's US
//            market price, converted. TCGplayer is the REFERENCE side, never the
//            buy side: its own Offer row (the US "tcgplayer" source, TCGplayer's
//            lowest listing of any condition) is used only to VETO a US row it
//            already beats (scoreVsTcg). Ranked by money below market by default.
//   ebay     "Cheapest on eBay" (free): the cheapest eBay listing beats every
//            store we track (and, in the US, TCGplayer's own lowest listing).
//   vs-ebay  "Underpriced vs eBay": a store sells for less than the cheapest
//            eBay listing.
//
// Why this replaced selectors.ts biggestSavings (DECISIONS.md, "Deal Finder:
// RiftCompare's three views; TCGplayer is the reference, never the buy side"):
// that ranked Card.low<M>, which in the US is usually TCGplayer's own
// any-condition lowest listing, against TCGplayer's own market price — 89% of
// its US "deals" measured TCGplayer against itself.
//
// eBay prices: an eBay row is compared on its DELIVERED cost when the seller
// stated postage, and on the item price (flagged "+ postage") when not; a stated
// postage wins an exact tie. Canada's eBay rows (`ebay_us`) are US listings with
// international postage nobody quoted, so Canada has no eBay comparison and its
// eBay feed is off the default buy side (still selectable, clearly labelled).
import type { Country } from "./country";
import { usdCentsToCountry } from "./fx";
import { storesIn } from "./stores";

// ── Thresholds (RiftCompare's, in the market's minor units) ──────────────────
/** A buy price under this is bulk noise. */
export const MIN_BUY_CENTS = 300;
/** A row must sit at least this far below TCGplayer market to count. */
export const MIN_BELOW_CENTS = 100;
/** Outlier guard: 75% below market almost always means two different products. */
export const MAX_BELOW_PCT = 75;
/** Cheapest on eBay / Underpriced vs eBay guards. */
export const EBAY_MIN_CENTS = 100;
export const EBAY_MIN_GAP_CENTS = 50;
export const EBAY_MAX_GAP_PCT = 80;

export const DEAL_PAGE_SIZE = 25;
export type DealSort = "saving" | "pct";

// ── eBay feeds ───────────────────────────────────────────────────────────────
// Which eBay rows a market has for SINGLES (lib/ebay-plan.ts SINGLES_MARKETS;
// tests/deals.test.ts keeps the two in step): its own marketplace's listings
// (`ebay`), Canada's derived US listings (`ebay_us`), or none (Singapore is
// search-link only).
export type EbayFeed = "own" | "cross-border" | null;
export const EBAY_FEED: Record<Country, EbayFeed> = { US: "own", AU: "own", UK: "own", EU: "own", CA: "cross-border", SG: null };

/** The Offer.source of a market's eBay singles rows, or null. */
export function ebaySourceFor(country: Country): "ebay" | "ebay_us" | null {
  const f = EBAY_FEED[country];
  return f === "own" ? "ebay" : f === "cross-border" ? "ebay_us" : null;
}

/** Can a market have an honest eBay comparison at all? Not Canada, not a market with no feed. */
export function hasEbayComparison(country: Country): boolean {
  return EBAY_FEED[country] === "own";
}

/** What an eBay buy row is called. "delivered" only when the seller stated postage. */
export function ebayBuyLabel(country: Country, postageKnown: boolean): string {
  if (EBAY_FEED[country] === "cross-border") return "eBay US + intl postage";
  return postageKnown ? "eBay (delivered)" : "eBay + postage";
}

export interface EbayListingRow {
  id: number;
  priceCents: number;
  shippingCents: number | null;
  url: string;
}
export interface EbayBest {
  cents: number;
  url: string;
  postageKnown: boolean;
}

/**
 * The cheapest eBay listing per card as Deal Finder shows it: item + stated
 * postage when postage is known, the item price alone (flagged) when not.
 * Cross-border (Canada) always compares the item price. On a tie the listing
 * with known postage wins — the same order as getDealInputs' SQL.
 */
export function cheapestEbayByCard(country: Country, rows: readonly EbayListingRow[]): Map<number, EbayBest> {
  const cross = EBAY_FEED[country] === "cross-border";
  const best = new Map<number, EbayBest>();
  for (const r of rows) {
    const postageKnown = !cross && r.shippingCents != null;
    const cents = r.priceCents + (postageKnown ? r.shippingCents! : 0);
    const prev = best.get(r.id);
    if (!prev || cents < prev.cents || (cents === prev.cents && postageKnown && !prev.postageKnown)) {
      best.set(r.id, { cents, url: r.url, postageKnown });
    }
  }
  return best;
}

// ── The cached inputs ────────────────────────────────────────────────────────
/**
 * One card's deal inputs in one market, as data.ts getDealInputs caches them:
 * [productId, cheapest in-stock store price, TCGplayer's own lowest listing (US
 * only, USD), cheapest eBay listing (delivered where known), 1 if its postage is
 * known]. Tuples keep a whole market's entry near 200 KB.
 */
export type DealInputTuple = [id: number, storeMin: number | null, tcgLow: number | null, ebayCents: number | null, ebayKnown: 0 | 1];

export interface DealInput {
  id: number;
  storeMin: number | null;
  tcgLow: number | null;
  ebay: { cents: number; postageKnown: boolean } | null;
}

export function encodeDealInput(r: { id: number; storeMin: number | null; tcgLow: number | null; ebayCents: number | null; ebayKnown: boolean | null }, country: Country): DealInputTuple {
  // Cross-border eBay is never "known" postage, whatever the row says.
  const known = r.ebayCents != null && r.ebayKnown === true && EBAY_FEED[country] !== "cross-border";
  return [r.id, r.storeMin, country === "US" ? r.tcgLow : null, r.ebayCents, known ? 1 : 0];
}

export function decodeDealInputs(tuples: readonly DealInputTuple[]): DealInput[] {
  return tuples.map(([id, storeMin, tcgLow, ebayCents, ebayKnown]) => ({
    id,
    storeMin,
    tcgLow,
    ebay: ebayCents == null ? null : { cents: ebayCents, postageKnown: ebayKnown === 1 },
  }));
}

// ── Sources (the store picker) ───────────────────────────────────────────────
export interface DealSource {
  key: string; // a store key (STORES), or the eBay source ("ebay" / "ebay_us")
  name: string;
  isEbay: boolean;
}

/** Every selectable buy source: eBay (where there is a feed), then each store. Never TCGplayer. */
export function dealFinderSources(country: Country): DealSource[] {
  const stores = storesIn(country)
    .map((s) => ({ key: s.key, name: s.name, isEbay: false }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const ek = ebaySourceFor(country);
  return ek ? [{ key: ek, name: EBAY_FEED[country] === "cross-border" ? "eBay US" : "eBay", isEbay: true }, ...stores] : stores;
}

/** The default buy side: every store, plus eBay — never TCGplayer, never Canada's cross-border feed. */
export function defaultBuyKeys(country: Country): string[] {
  return dealFinderSources(country)
    .filter((s) => !s.isEbay || EBAY_FEED[country] === "own")
    .map((s) => s.key);
}

/** A requested buy side, reduced to keys that are really buyable here. A URL can carry anything. */
export function resolveBuyKeys(country: Country, buy: readonly string[]): string[] {
  const valid = new Set(dealFinderSources(country).map((s) => s.key));
  return [...new Set(buy)].filter((k) => valid.has(k));
}

/** A resolved buy side split: the store keys, whether eBay is on it, and whether the stores are ALL of them. */
export function splitBuyKeys(country: Country, keys: readonly string[]): { storeKeys: string[]; ebay: boolean; allStores: boolean } {
  const ek = ebaySourceFor(country);
  const storeKeys = keys.filter((k) => k !== ek).sort();
  const all = storesIn(country).map((s) => s.key);
  return { storeKeys, ebay: ek != null && keys.includes(ek), allStores: storeKeys.length === all.length && all.every((k) => storeKeys.includes(k)) };
}

// ── Underpriced vs TCGplayer ─────────────────────────────────────────────────
/** How far below `refCents` a price sits, as a percentage OF THE REFERENCE, to one decimal. */
export function belowPct(priceCents: number, refCents: number): number | null {
  if (!(refCents > 0)) return null;
  return Math.round(((refCents - priceCents) / refCents) * 1000) / 10;
}

/**
 * Does buying at `buyCents` count as underpriced vs TCGplayer market
 * (`marketCents`, already in the market's currency)? One predicate for the
 * cached ranking AND the live listing on the page. In the US a row is dropped
 * when TCGplayer's own lowest listing is at or below it; elsewhere that listing
 * is a US seller's price with international postage, so it is ignored.
 */
export function scoreVsTcg(country: Country, buyCents: number, marketCents: number, tcgLowUsdCents: number | null): { belowCents: number; belowPct: number } | null {
  if (buyCents < MIN_BUY_CENTS) return null;
  const belowCents = marketCents - buyCents;
  if (belowCents < MIN_BELOW_CENTS) return null;
  if (country === "US" && tcgLowUsdCents != null && tcgLowUsdCents <= buyCents) return null;
  const pct = belowPct(buyCents, marketCents);
  if (pct == null || pct > MAX_BELOW_PCT) return null;
  return { belowCents, belowPct: pct };
}

export interface TcgRanked {
  id: number;
  buy: number;
  buyIsEbay: boolean;
  postageKnown: boolean; // eBay rows only
  market: number; // TCGplayer market, in the market's currency
  low: number | null; // US only: TCGplayer's own lowest listing, USD
  below: number;
  pct: number;
}

const byId = (a: { id: number }, b: { id: number }) => a.id - b.id;

/**
 * The "Underpriced vs TCGplayer" ranking. `marketUsd` is TCGplayer's US market
 * price per card (the catalogue's). `storeMin` overrides the inputs' all-store
 * minimum when the reader picked some stores (null = every store; an empty map
 * = no store). `ebay` puts the eBay feed on the buy side.
 */
export function rankVsTcgplayer(
  country: Country,
  inputs: readonly DealInput[],
  marketUsd: (id: number) => number | null | undefined,
  opts: { sort: DealSort; ebay: boolean; storeMin?: ReadonlyMap<number, number> | null },
): TcgRanked[] {
  const rows: TcgRanked[] = [];
  for (const inp of inputs) {
    const store = opts.storeMin ? opts.storeMin.get(inp.id) ?? null : inp.storeMin;
    const e = opts.ebay ? inp.ebay : null;
    let buy: number;
    let buyIsEbay: boolean;
    if (store != null && (e == null || store <= e.cents)) {
      buy = store;
      buyIsEbay = false;
    } else if (e != null) {
      buy = e.cents;
      buyIsEbay = true;
    } else continue;
    const usd = marketUsd(inp.id);
    if (usd == null || !(usd > 0)) continue;
    const market = usdCentsToCountry(usd, country);
    const score = scoreVsTcg(country, buy, market, inp.tcgLow);
    if (!score) continue;
    rows.push({ id: inp.id, buy, buyIsEbay, postageKnown: buyIsEbay && !!e?.postageKnown, market, low: inp.tcgLow, below: score.belowCents, pct: score.belowPct });
  }
  return sortRanked(rows, opts.sort);
}

/** "saving" = money first, then %; "pct" = % first, then money; then the id, so the order is stable. */
export function sortRanked<T extends { id: number; below: number; pct: number }>(rows: T[], sort: DealSort): T[] {
  return rows.sort((a, b) => (sort === "pct" ? b.pct - a.pct || b.below - a.below : b.below - a.below || b.pct - a.pct) || byId(a, b));
}

// ── Cheapest on eBay ─────────────────────────────────────────────────────────
export interface CheapestEbayRanked {
  id: number;
  ebayCents: number;
  postageKnown: boolean;
  storeCents: number; // the cheapest tracked alternative (US: TCGplayer's own low too)
  gapCents: number;
}

/**
 * Cards whose cheapest eBay listing costs less than every store we track — and,
 * in the US, less than TCGplayer's own lowest listing, which is buyable there.
 * eBay ≥ 100, gap ≥ 50, gap < 80% of the alternative. Money gap first.
 */
export function rankCheapestOnEbay(country: Country, inputs: readonly DealInput[]): CheapestEbayRanked[] {
  if (!hasEbayComparison(country)) return [];
  const out: CheapestEbayRanked[] = [];
  for (const inp of inputs) {
    const e = inp.ebay;
    if (!e || inp.storeMin == null) continue;
    if (e.cents < EBAY_MIN_CENTS) continue;
    const low = country === "US" ? inp.tcgLow : null;
    if (low != null && low <= e.cents) continue;
    const alt = low != null ? Math.min(inp.storeMin, low) : inp.storeMin;
    const gap = alt - e.cents;
    if (gap < EBAY_MIN_GAP_CENTS) continue;
    if (gap * 100 >= alt * EBAY_MAX_GAP_PCT) continue;
    out.push({ id: inp.id, ebayCents: e.cents, postageKnown: e.postageKnown, storeCents: alt, gapCents: gap });
  }
  return out.sort((a, b) => b.gapCents - a.gapCents || b.gapCents / b.storeCents - a.gapCents / a.storeCents || byId(a, b));
}

// ── Underpriced vs eBay ──────────────────────────────────────────────────────
/** Does a store at `storeCents` count as underpriced vs eBay at `ebayCents`? Store ≥ 100, gap ≥ 50, < 80% of eBay. */
export function scoreVsEbay(storeCents: number, ebayCents: number): { below: number; pct: number } | null {
  if (storeCents < EBAY_MIN_CENTS) return null;
  const below = ebayCents - storeCents;
  if (below < EBAY_MIN_GAP_CENTS) return null;
  if (below * 100 >= ebayCents * EBAY_MAX_GAP_PCT) return null;
  const pct = belowPct(storeCents, ebayCents);
  return pct == null ? null : { below, pct };
}

export interface VsEbayRanked {
  id: number;
  store: number;
  ebay: number;
  postageKnown: boolean;
  below: number;
  pct: number; // a share of the eBay price
}

export function rankUnderpricedVsEbay(country: Country, inputs: readonly DealInput[], sort: DealSort = "saving"): VsEbayRanked[] {
  if (!hasEbayComparison(country)) return [];
  const out: VsEbayRanked[] = [];
  for (const inp of inputs) {
    if (inp.storeMin == null || !inp.ebay) continue;
    const s = scoreVsEbay(inp.storeMin, inp.ebay.cents);
    if (!s) continue;
    out.push({ id: inp.id, store: inp.storeMin, ebay: inp.ebay.cents, postageKnown: inp.ebay.postageKnown, below: s.below, pct: s.pct });
  }
  return sortRanked(out, sort);
}

// ── Paging ───────────────────────────────────────────────────────────────────
/**
 * One page AFTER the optional "only my cards" filter, so total and pageCount
 * describe the list the reader is looking at: page 2 of "My watchlist" is the
 * 26th-50th watched deal, not the watched cards on page 2 of the global list.
 */
export function pageRanked<T extends { id: number; below: number }>(
  rows: readonly T[],
  opts: { page: number; pageSize: number; onlyIds?: ReadonlySet<number> | null },
): { slice: T[]; total: number; page: number; pageCount: number; savingsTotalCents: number } {
  const only = opts.onlyIds;
  const filtered = only ? rows.filter((r) => only.has(r.id)) : rows;
  const size = Math.max(1, Math.floor(opts.pageSize) || 1);
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Math.floor(opts.page) || 1), pageCount);
  return {
    slice: filtered.slice((page - 1) * size, page * size),
    total,
    page,
    pageCount,
    savingsTotalCents: filtered.reduce((s, r) => s + r.below, 0),
  };
}

// ── Live listings ────────────────────────────────────────────────────────────
export interface StoreListing {
  source: string; // "store:<key>"
  priceCents: number;
  url: string;
  condition: string | null;
}

/** The cheapest live store listing among the selected store keys (null = every store). */
export function cheapestListing(listings: readonly StoreListing[], storeKeys: ReadonlySet<string> | null): StoreListing | null {
  let best: StoreListing | null = null;
  for (const l of listings) {
    if (!l.source.startsWith("store:")) continue;
    if (storeKeys && !storeKeys.has(l.source.slice(6))) continue;
    if (!best || l.priceCents < best.priceCents || (l.priceCents === best.priceCents && l.source < best.source)) best = l;
  }
  return best;
}

// ── Cross-market gaps (/market/records) ──────────────────────────────────────
export interface CrossMarketGap {
  id: number;
  homeCents: number;
  away: Country;
  awayCents: number; // in the away market's own currency
  awayConverted: number; // in the home currency
  savingCents: number;
  pct: number;
}

/** Same floors as RiftCompare's board: home price ≥ 300, gap ≥ 20%, ≤ 300%-style outliers out (≤ 80% here), saving ≥ 500. */
export const XMARKET_MIN_HOME_CENTS = 300;
export const XMARKET_MIN_GAP_PCT = 20;
export const XMARKET_MAX_GAP_PCT = 80;
export const XMARKET_MIN_SAVING_CENTS = 500;

/**
 * Cards whose cheapest in-stock STORE price in another market, converted at the
 * reference rate, sits meaningfully below the home market's. `storeMinBy` is
 * each market's id → cheapest store price (own currency); `convert(cents, from,
 * to)` is the reference FX. Ranked by money saved, then %.
 */
export function crossMarketGaps(
  home: Country,
  storeMinBy: Partial<Record<Country, ReadonlyMap<number, number>>>,
  convert: (cents: number, from: Country, to: Country) => number,
): CrossMarketGap[] {
  const homeMin = storeMinBy[home];
  if (!homeMin) return [];
  const out: CrossMarketGap[] = [];
  for (const [id, homeCents] of homeMin) {
    if (homeCents < XMARKET_MIN_HOME_CENTS) continue;
    let best: CrossMarketGap | null = null;
    for (const [m, mins] of Object.entries(storeMinBy) as [Country, ReadonlyMap<number, number>][]) {
      if (m === home || !mins) continue;
      const away = mins.get(id);
      if (away == null) continue;
      const conv = convert(away, m, home);
      const saving = homeCents - conv;
      const pct = belowPct(conv, homeCents);
      if (pct == null || pct < XMARKET_MIN_GAP_PCT || pct > XMARKET_MAX_GAP_PCT || saving < XMARKET_MIN_SAVING_CENTS) continue;
      if (!best || saving > best.savingCents) best = { id, homeCents, away: m, awayCents: away, awayConverted: conv, savingCents: saving, pct };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.savingCents - a.savingCents || b.pct - a.pct || byId(a, b));
}

