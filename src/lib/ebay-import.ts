// The daily eBay listing import: the PLAN (which feeds, how many Browse calls, in what order) and the RUN
// (reserve a call, search, normalise, replace the feed's rows). Pure logic plus injected dependencies (the
// database, the clock, fetch, the log), so tests/ run all of it with fakes and scripts/ebay-import.ts wires
// it to Postgres and api.ebay.com. See DEPLOY.md, "eBay listings: the daily import" for the capacity model.
//
//   PRIORITY (spend in this order until the run cap is reached; a cap hit drops the LEAST valuable):
//     1. chase    generic chase cards: 8 queries per marketplace, taken round-robin        (5 × 8   = 40 calls)
//     2. sealed   generic sealed Pokémon: 6 queries per marketplace, classifier-checked     (5 × 6   = 30)
//     3. types    one query per high-value product type per marketplace                     (5 × 9   = 45)
//     4. sets     chase cards of the 30 most recently released sets, 1 query each           (5 × 30  = 150)
//     5. sweep    the CATALOGUE SWEEP (ebay-sweep.ts): broad searches paged 200 listings a call, each listing
//                 handed to the product the classifier says it is: an item feed for EVERY product it finds,
//                 cheap ones included (EBAY_SWEEP_CALLS, default 2,100, shared by marketplace by product count × audience,
//                 in MARKETPLACE_ORDER); each marketplace starts with the HOT PASS (the hot sets' own searches, at most
//                 half its share)
//     6. items    one query per (marketplace, product) the sweep did NOT cover, whatever the sweep left of the run cap:
//                 first the HOT-SET products of the priority marketplaces (US, UK, EU), any type and price (packs and
//                 cheap ones too), by hot rank, then marketplace, then value; then every ELIGIBLE key (core), then,
//                 budget permitting, downward by price to US$25 (extension), each tier ranked by reference price ×
//                 market weight (sold-out ×1.5)
//   A "feed" is what the strips read (ebay-context.ts). Marketplaces: au+nz share EBAY_AU, us+sg share EBAY_US,
//   uk EBAY_GB, ca EBAY_CA, eu EBAY_DE. The owner's priorities (which sets are hot, which markets come first) live in popular.ts.
import { searchTerms } from "./affiliate";
import { referenceUsd, tierOf, type Tier } from "./ebay-eligibility";
import { createTokenManager, EbayError, searchPage, type Deps, type SearchSpec, type TokenManager } from "./ebay-api";
import {
  feedKey,
  feedReference,
  hoursToMs,
  MARKET_WEIGHT,
  MARKETPLACE_IDS,
  MARKETPLACE_OF_REGION,
  MARKETPLACES,
  MAX_FEED_ROWS,
  minRowsFor,
  parseMaxAgeHours,
  purgeCutoff as purgeCutoffFor,
  type FeedItem,
  type FeedKind,
  type MarketplaceId,
} from "./ebay-context";
import {
  CHASE_FLOOR,
  lowestPriceFirst,
  normaliseChase,
  normaliseItemFeed,
  normaliseSealed,
  normaliseSetChase,
  normaliseType,
  roundRobin,
  SEALED_FLOOR_USD,
  typeFloor,
  usdToMarketplace,
  type ItemTarget,
} from "./ebay-normalise";
import { budgetDay, type ImportDb, type PlanRow } from "./ebay-store";
import { buildSweepIndex, hotSweepQueries, marketplaceShares, SweepCollector, sweepSignatureSets, sweepVocabulary, sweepWithHot, type QueryProgress, type SweepIndex } from "./ebay-sweep";
import { HOT_SET_QUERY, HOT_SETS, hotRank, isHotSet, PRIORITY_MARKETPLACES } from "./popular";
import type { Region } from "./regions";
import { normalizeTitle, roughUsdCents, TYPE_BY_KEY, TYPE_BY_LABEL, TYPE_BY_SLUG, type TypeKey } from "./sealed-title";
import { SET_BY_CODE, SETS, type PokemonSet } from "./sets";

// ─── Tunables ──────────────────────────────────────────────────────────────────

export const DEFAULT_RUN_CAP = 2500;
export const DEFAULT_DAILY_CAP = 2500;
/** Calls the catalogue sweep may spend (of what the fixed feeds leave); the per-product searches get the rest. EBAY_SWEEP_CALLS overrides. */
/**
 * Measured on the first full run (2026-10-11): the sweep wrote 4,673 item feeds with 1,800 calls (2.6 a call); the 408 per-product
 * searches after it found listings for 150 products (0.37 a call). So the sweep gets most of the day.
 */
export const DEFAULT_SWEEP_CALLS = 2100;
/** Feeds the sweep writes per database transaction. */
export const SWEEP_WRITE_BATCH = 100;
/** The hard ceiling for the daily cap setting: eBay's default limit is 5,000 a day for the whole application, shared with the owner's other site. */
export const MAX_DAILY_CAP = 2500;
export const CONCURRENCY = 3;
/**
 * Circuit breaker: this many searches in a row that FAILED (a 400/5xx after its retry, malformed JSON, or HTTP 200 with no listings and
 * a warning from eBay) stop the run. A persistent failure is a configuration problem, not noise, and must not burn the day's calls. Any
 * search that returns listings resets the count. (A 403, or a 401 that survives the token refresh, stops the run at once.)
 */
export const BREAKER_FAILURES = 6;
/** ...and this many in a row that came back with no listings at all (HTTP 200, nothing in itemSummaries, no warning). Real searches are rarely empty back to back. */
export const BREAKER_EMPTY = 30;
/**
 * A feed whose rows are younger than this is not bought again (a re-run, an overlapping run, a retry after a crash, an accidental
 * re-dispatch) unless forced. Never more than a quarter of the age bound, so the compliant mode's 4-hourly runs always buy again.
 */
export const FRESH_SKIP_HOURS = 2;
export const FRESH_SKIP_SHARE = 0.25;
export const freshWindowMs = (env: { EBAY_LISTING_MAX_AGE_HOURS?: string }) => Math.min(hoursToMs(FRESH_SKIP_HOURS), hoursToMs(parseMaxAgeHours(env.EBAY_LISTING_MAX_AGE_HOURS)) * FRESH_SKIP_SHARE);
/** Retries, beyond a search's first try, a run may make: 5% of the plan plus a few. They count against the run cap like any search. */
export const retryAllowance = (planned: number) => Math.ceil(planned * 0.05) + 5;
/** A progress line (calls today against the caps) every this many searches. */
export const PROGRESS_EVERY = 250;

export const ITEM_LIMIT = 50; // results fetched per item search
export const ITEM_KEEP = 8; // stored per item feed
export const SET_FEED_COUNT = 30;
export const SOLD_OUT_BOOST = 1.5;

// ─── Eligibility ───────────────────────────────────────────────────────────────
// (ebay-eligibility.ts: shared with the product page, which places its strip by it.)

export interface ItemKey {
  marketplace: MarketplaceId;
  productId: string;
  name: string;
  type: TypeKey;
  groupKey: string;
  setCode: string | null;
  /** The highest reference price among the marketplace's regions that list the product, US$. */
  usd: number;
  soldOut: boolean;
  tier: Exclude<Tier, "no">;
  /** usd × the marketplace's weight × 1.5 when sold out: the order the budget is spent in within a tier. */
  value: number;
}

/**
 * Every (marketplace, product) item key the product data makes eligible, ranked: core by value (then product id,
 * so the order is stable), then the extension by value. Only regions where the product has a ProductStat row
 * count: a product no AU or NZ store lists has no EBAY_AU key.
 */
export function itemKeys(rows: readonly PlanRow[]): ItemKey[] {
  const by = new Map<string, { marketplace: MarketplaceId; row: PlanRow; usd: number; anyOpen: boolean }>();
  for (const r of rows) {
    const type = TYPE_BY_LABEL.get(r.typeLabel)?.key;
    const usd = referenceUsd(r);
    const region = r.market.toLowerCase() as Region;
    const marketplace = MARKETPLACE_OF_REGION[region];
    if (!type || usd == null || !marketplace) continue;
    const k = `${marketplace}|${r.productId}`;
    const cur = by.get(k);
    const open = r.openCents != null;
    if (!cur) by.set(k, { marketplace, row: r, usd, anyOpen: open });
    else {
      cur.anyOpen = cur.anyOpen || open;
      if (usd > cur.usd) {
        cur.usd = usd;
        cur.row = r;
      }
    }
  }
  const out: ItemKey[] = [];
  for (const { marketplace, row, usd, anyOpen } of by.values()) {
    const type = TYPE_BY_LABEL.get(row.typeLabel)!.key;
    const tier = tierOf(type, usd);
    if (tier === "no") continue;
    out.push({
      marketplace,
      productId: row.productId,
      name: row.name,
      type,
      groupKey: row.groupKey,
      setCode: row.setCode,
      usd,
      soldOut: !anyOpen,
      tier,
      value: usd * MARKET_WEIGHT[marketplace] * (anyOpen ? 1 : SOLD_OUT_BOOST),
    });
  }
  const tierRank = (t: ItemKey) => (t.tier === "core" ? 0 : 1);
  return out.sort((a, b) => tierRank(a) - tierRank(b) || b.value - a.value || a.productId.localeCompare(b.productId) || a.marketplace.localeCompare(b.marketplace));
}

/** A product the per-product searches buy first because its set is hot (popular.ts), whatever its type or price. */
export interface HotKey {
  marketplace: MarketplaceId;
  productId: string;
  name: string;
  type: TypeKey;
  groupKey: string;
  setCode: string;
  /** The set's place in HOT_SETS (0 = the most wanted). */
  rank: number;
  /** The highest reference price among the marketplace's regions that list it, US$ (null: no price known). */
  usd: number | null;
  /** usd × the marketplace's weight × 1.5 when sold out (as itemKeys); 0 with no price. */
  value: number;
}

/**
 * Every (PRIORITY marketplace, hot-set product) key: the products of popular.ts HOT_SETS listed in the US, UK or EU, ANY type and ANY
 * price (booster packs and cheap ones included: no eligibility rule), ordered by the set's hot rank, then MARKETPLACE_ORDER, then
 * value (then product id, so the order is stable). Only regions where the product has a ProductStat row count, as for itemKeys.
 */
export function hotItemKeys(rows: readonly PlanRow[], today = "9999-12-31"): HotKey[] {
  const priority = new Set<string>(PRIORITY_MARKETPLACES);
  // A hot set that is not out yet gets nothing (popular.ts): its listings are pre-sales, which the normaliser refuses anyway.
  const released = (code: string | null) => !!code && (SET_BY_CODE.get(code)?.releaseDate ?? "9999-12-31") <= today;
  const by = new Map<string, { marketplace: MarketplaceId; row: PlanRow; usd: number | null; anyOpen: boolean }>();
  for (const r of rows) {
    if (!isHotSet(r.setCode) || !released(r.setCode)) continue;
    const marketplace = MARKETPLACE_OF_REGION[r.market.toLowerCase() as Region];
    if (!marketplace || !priority.has(marketplace) || !TYPE_BY_LABEL.has(r.typeLabel)) continue;
    const usd = referenceUsd(r);
    const k = `${marketplace}|${r.productId}`;
    const cur = by.get(k);
    const open = r.openCents != null;
    if (!cur) by.set(k, { marketplace, row: r, usd, anyOpen: open });
    else {
      cur.anyOpen = cur.anyOpen || open;
      if (usd != null && (cur.usd == null || usd > cur.usd)) {
        cur.usd = usd;
        cur.row = r;
      }
    }
  }
  const order = (m: MarketplaceId) => MARKETPLACE_ORDER.indexOf(m);
  return [...by.values()]
    .map(({ marketplace, row, usd, anyOpen }): HotKey => ({
      marketplace,
      productId: row.productId,
      name: row.name,
      type: TYPE_BY_LABEL.get(row.typeLabel)!.key,
      groupKey: row.groupKey,
      setCode: row.setCode!,
      rank: hotRank(row.setCode),
      usd,
      value: usd == null ? 0 : usd * MARKET_WEIGHT[marketplace] * (anyOpen ? 1 : SOLD_OUT_BOOST),
    }))
    .sort((a, b) => a.rank - b.rank || order(a.marketplace) - order(b.marketplace) || b.value - a.value || a.productId.localeCompare(b.productId));
}

// ─── Queries ───────────────────────────────────────────────────────────────────

/**
 * Marketplaces in the order the budget is spent: the owner's priority ones first (popular.ts PRIORITY_MARKETPLACES: US, UK, EU), then
 * the rest by audience weight (AU, CA), so a cap hit drops EBAY_CA before EBAY_US.
 */
export const MARKETPLACE_ORDER: readonly MarketplaceId[] = [
  ...PRIORITY_MARKETPLACES,
  ...MARKETPLACE_IDS.filter((m) => !(PRIORITY_MARKETPLACES as readonly string[]).includes(m)).sort((a, b) => MARKET_WEIGHT[b] - MARKET_WEIGHT[a] || a.localeCompare(b)),
];

export const CHASE_QUERIES = [
  "Charizard ex special illustration rare",
  "Umbreon ex special illustration rare",
  "Pikachu ex special illustration rare",
  "Mega Charizard X ex",
  "Mewtwo ex special illustration rare",
  "PSA 10 Charizard",
  "Gengar ex special illustration rare",
  "Rayquaza ex special illustration rare",
] as const;

export const SEALED_QUERIES = [
  "booster box sealed",
  "elite trainer box sealed",
  "ultra premium collection sealed",
  "booster bundle sealed",
  "pokemon center elite trainer box sealed",
  "premium collection box sealed",
] as const;

/** The high-value types that get their own feed (a type page's strip), with what they search for. */
export const TYPE_FEEDS: readonly { type: TypeKey; query: string }[] = [
  { type: "booster-box", query: "booster box sealed" },
  { type: "etb", query: "elite trainer box sealed" },
  { type: "pc-etb", query: "pokemon center elite trainer box sealed" },
  { type: "upc", query: "ultra premium collection sealed" },
  { type: "booster-box-case", query: "booster box case sealed" },
  { type: "etb-case", query: "elite trainer box case sealed" },
  { type: "booster-bundle-case", query: "booster bundle case sealed" },
  { type: "build-battle-stadium", query: "build and battle stadium sealed" },
  { type: "collection", query: "premium collection box sealed" },
];

// Sets named with a common word: a keyword search for "Evolutions", "Generations" or "Celebrations" returns cards of every set.
const COMMON_WORD_SETS = new Set(["xy12", "g1", "cel25"]);

/** The most recently released sets whose name is a good chase-card search (not a series name, not a common word, already out). */
export function setFeedSets(today: string, n = SET_FEED_COUNT, sets: readonly PokemonSet[] = SETS): PokemonSet[] {
  return sets.filter((s) => s.releaseDate <= today && !s.generic && !COMMON_WORD_SETS.has(s.code)).slice(0, n);
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, ""); // "Pokémon GO" → "Pokemon GO"

export function setQuery(s: PokemonSet): string {
  const suffix = s.series === "Mega Evolution" || s.series === "Scarlet & Violet" ? "special illustration rare" : s.series === "Sword & Shield" ? "alt art" : "full art";
  return `${fold(s.name)} ${suffix}`;
}

/**
 * "Pokemon <product name, cleaned>", at most 100 characters (cut at a word). No "sealed": eBay requires every keyword, and many sealed
 * listings never say it (762 of 1,735 item searches came back with nothing on 2026-10-10); the classifier refuses singles and lots.
 */
export function itemQuery(name: string): string {
  const terms = searchTerms(name);
  const q = /\bpokemon\b/i.test(terms) ? terms : `Pokemon ${terms}`;
  const t = q.replace(/\s+/g, " ").trim();
  if (t.length <= 100) return t;
  const cut = t.slice(0, 100);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trim();
}

const prefixed = (q: string) => `Pokemon ${q}`.slice(0, 100);

// ─── The plan ──────────────────────────────────────────────────────────────────

export type Bucket = "chase" | "sealed" | "types" | "sets" | "sweep" | "items";
export const BUCKETS: readonly Bucket[] = ["chase", "sealed", "types", "sets", "sweep", "items"];

export type Rule =
  | { kind: "chase" }
  | { kind: "sealed" }
  | { kind: "type"; type: TypeKey }
  | { kind: "set"; setCode: string }
  | { kind: "item"; target: ItemTarget };

export interface PlanFeed {
  feed: string;
  bucket: Bucket;
  kind: FeedKind;
  marketplace: MarketplaceId;
  /** One Browse call per entry. */
  searches: SearchSpec[];
  rule: Rule;
  /** items only: the eligible key it buys (absent for a hot-set product that is not an eligible key) */
  item?: ItemKey;
  /** items only: a hot-set product of a priority marketplace (hotItemKeys), bought before every eligible key */
  hot?: boolean;
}

export interface Plan {
  feeds: PlanFeed[];
  /** Browse calls the plan makes (the sum of its searches). */
  calls: number;
  cap: number;
  byBucket: Record<Bucket, { feeds: number; calls: number; wanted: number; wantedCalls: number; fresh: number }>;
  /** Eligible item keys (core and extension) and how many the cap reached. */
  items: { core: number; extension: number; coreCovered: number; extensionCovered: number };
  /** The catalogue sweep's share of the cap (0 when it is not wanted or nothing is left for it). */
  sweepBudget: number;
  /** Every eligible key, in budget order (for the capacity report). */
  keys: ItemKey[];
}

const feedFor = (b: Bucket, kind: FeedKind, marketplace: MarketplaceId, arg: string | undefined, searches: SearchSpec[], rule: Rule): PlanFeed => ({
  feed: feedKey(marketplace, kind, arg),
  bucket: b,
  kind,
  marketplace,
  searches,
  rule,
});

/** The fixed (non-item) feeds, in priority order. */
export function fixedFeeds(today: string): PlanFeed[] {
  const out: PlanFeed[] = [];
  for (const mp of MARKETPLACE_ORDER) {
    out.push(feedFor("chase", "chase", mp, undefined, CHASE_QUERIES.map((q) => ({ q: prefixed(q), marketplace: mp, limit: 20, minPrice: CHASE_FLOOR[MARKETPLACES[mp].currency], ref: feedReference(mp, "chase") })), { kind: "chase" }));
  }
  for (const mp of MARKETPLACE_ORDER) {
    const min = usdToMarketplace(SEALED_FLOOR_USD, mp);
    out.push(feedFor("sealed", "sealed", mp, undefined, SEALED_QUERIES.map((q) => ({ q: prefixed(q), marketplace: mp, limit: 30, minPrice: min, ref: feedReference(mp, "sealed") })), { kind: "sealed" }));
  }
  for (const mp of MARKETPLACE_ORDER) {
    for (const t of TYPE_FEEDS) {
      out.push(feedFor("types", "type", mp, TYPE_BY_KEY.get(t.type)!.slug, [{ q: prefixed(t.query), marketplace: mp, limit: 50, minPrice: typeFloor(t.type, mp), ref: feedReference(mp, "type") }], { kind: "type", type: t.type }));
    }
  }
  for (const s of setFeedSets(today)) {
    for (const mp of MARKETPLACE_ORDER) {
      out.push(feedFor("sets", "set", mp, s.slug, [{ q: prefixed(setQuery(s)), marketplace: mp, limit: 30, minPrice: CHASE_FLOOR[MARKETPLACES[mp].currency], ref: feedReference(mp, "set") }], { kind: "set", setCode: s.code }));
    }
  }
  return out;
}

/**
 * The words a product of a set in HOT_SET_QUERY is searched by: its name with the set's own name swapped for the keyword sellers
 * use ("30th Celebration Elite Trainer Box" → "30th Elite Trainer Box", which "30th Anniversary" listings match; "Scarlet & Violet 151
 * Booster Bundle" → "151 Booster Bundle"). Any other product: its name.
 */
export function hotQueryName(name: string, setCode: string | null): string {
  const term = setCode ? HOT_SET_QUERY[setCode] : undefined;
  const set = setCode ? SET_BY_CODE.get(setCode) : undefined;
  if (!term || !set) return name;
  const words = (t: string) => normalizeTitle(t).split(/[^A-Za-z0-9]+/).filter((w) => w && w.toLowerCase() !== "and"); // "&" / "and" are separators
  const nameRe = words(set.name).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s&:,.'\\-–—]*(?:and[\\s]*)?");
  let rest = normalizeTitle(name).replace(new RegExp(`\\b${nameRe}\\b`, "gi"), " ");
  if (setCode === "cel30") rest = rest.replace(/\b30th\s+anniversary(?:\s+celebration)?\b/gi, " ");
  rest = rest.replace(/^\s*pokemon(?:\s+tcg\s*[:\-–—]?|\s*[:\-–—])/i, " "); // a leading "Pokemon TCG:" (itemQuery puts "Pokemon" first again; "Pokemon Center" stays)
  rest = rest.replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, "").replace(/\s+/g, " ");
  const hasTerm = new RegExp(`\\b${term}\\b`, "i").test(rest);
  return hasTerm ? rest : `${term} ${rest}`.trim();
}

/** One product's own search: "Pokemon <cleaned name>" (a hot set's keyword in place of its name), the type's price floor, the item normaliser. */
function productFeed(k: Pick<ItemKey, "marketplace" | "productId" | "name" | "type" | "groupKey" | "setCode">): PlanFeed {
  return {
    feed: feedKey(k.marketplace, "item", k.productId),
    bucket: "items",
    kind: "item",
    marketplace: k.marketplace,
    searches: [{ q: itemQuery(hotQueryName(k.name, k.setCode)), marketplace: k.marketplace, limit: ITEM_LIMIT, minPrice: typeFloor(k.type, k.marketplace), ref: feedReference(k.marketplace, "item") }],
    rule: { kind: "item", target: { groupKey: k.groupKey, type: k.type, setCode: k.setCode } },
  };
}

const itemFeed = (k: ItemKey): PlanFeed => ({ ...productFeed(k), item: k });

/**
 * The per-product searches, in the order they are bought (before the cap and the sweep's coverage are applied): first the hot-set
 * products of the priority marketplaces (hotItemKeys: any type, any price), then every eligible key not already among them (itemKeys'
 * order: core by value, then the extension). A hot product that is also an eligible key keeps its ItemKey (`item`), so it still counts
 * as a covered core or extension key.
 */
export function perProductFeeds(rows: readonly PlanRow[], keys: readonly ItemKey[] = itemKeys(rows), today?: string): PlanFeed[] {
  const eligible = new Map(keys.map((k) => [feedKey(k.marketplace, "item", k.productId), k]));
  const hot = hotItemKeys(rows, today).map((h): PlanFeed => {
    const f = productFeed(h);
    const item = eligible.get(f.feed);
    return { ...f, hot: true, ...(item ? { item } : {}) };
  });
  const seen = new Set(hot.map((f) => f.feed));
  return [...hot, ...keys.map(itemFeed).filter((f) => !seen.has(f.feed))];
}

export interface PlanOptions {
  /** The most Browse calls the plan may make. */
  cap: number;
  /** The most the catalogue sweep may spend (DEFAULT_SWEEP_CALLS). */
  sweepCalls?: number;
  today: string;
  only?: readonly Bucket[];
  /** Feeds whose rows are fresh enough to keep (not bought again). They count as covered, cost nothing and do not end the plan. */
  fresh?: ReadonlySet<string>;
}

/**
 * Spend `cap` calls in priority order: chase, sealed, types, sets, the catalogue sweep's share, then the per-product searches
 * (perProductFeeds: the hot-set products of the US, UK and EU first, then item keys, core by value, then the extension). The item
 * feeds planned here are the PRE-plan: the run buys them only for products the sweep did not cover, and with whatever the sweep
 * actually left (ebay-import.ts runImport).
 */
export function buildPlan(rows: readonly PlanRow[], opts: PlanOptions): Plan {
  const want = (b: Bucket) => !opts.only || opts.only.includes(b);
  const keys = itemKeys(rows);
  const fixed = fixedFeeds(opts.today).filter((f) => want(f.bucket));
  const items = perProductFeeds(rows, keys, opts.today).filter((f) => want(f.bucket));
  const byBucket = Object.fromEntries(BUCKETS.map((b) => [b, { feeds: 0, calls: 0, wanted: 0, wantedCalls: 0, fresh: 0 }])) as Plan["byBucket"];
  let left = Math.max(0, Math.floor(opts.cap));
  const feeds: PlanFeed[] = [];
  let calls = 0;
  let stopped = false; // once a feed does not fit, nothing of lower priority is bought: a cap hit drops the LEAST valuable, never a hole in the middle
  const itemsCount = { core: 0, extension: 0, coreCovered: 0, extensionCovered: 0 };
  let sweepBudget = 0;
  const visit = (f: PlanFeed) => {
    const b = byBucket[f.bucket];
    b.wanted++;
    b.wantedCalls += f.searches.length;
    if (f.item) itemsCount[f.item.tier]++;
    if (opts.fresh?.has(f.feed)) {
      b.fresh++; // refreshed recently (another run, earlier today): covered, not bought again
      if (f.item) itemsCount[f.item.tier === "core" ? "coreCovered" : "extensionCovered"]++;
      return;
    }
    if (stopped || f.searches.length > left) {
      stopped = true;
      return;
    }
    left -= f.searches.length;
    calls += f.searches.length;
    b.feeds++;
    b.calls += f.searches.length;
    if (f.item) itemsCount[f.item.tier === "core" ? "coreCovered" : "extensionCovered"]++;
    feeds.push(f);
  };
  for (const f of fixed) visit(f);
  if (want("sweep")) {
    const wanted = Math.max(0, Math.floor(opts.sweepCalls ?? DEFAULT_SWEEP_CALLS));
    const b = byBucket.sweep;
    b.wanted = MARKETPLACE_IDS.length;
    b.wantedCalls = wanted;
    sweepBudget = stopped ? 0 : Math.min(wanted, left);
    if (sweepBudget > 0) {
      b.feeds = MARKETPLACE_IDS.length;
      b.calls = sweepBudget;
      left -= sweepBudget;
      calls += sweepBudget;
    }
  }
  for (const f of items) visit(f);
  return { feeds, calls, cap: opts.cap, byBucket, items: itemsCount, keys, sweepBudget };
}

// ─── Caps ──────────────────────────────────────────────────────────────────────

const clampInt = (raw: string | undefined, def: number, lo: number, hi: number) => {
  const s = (raw ?? "").trim();
  if (!s) return def;
  const n = Number(s);
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), lo), hi) : def;
};

export interface CapEnv {
  EBAY_DAILY_CAP?: string;
  EBAY_RUN_CAP?: string;
  EBAY_SWEEP_CALLS?: string;
  EBAY_LISTING_MAX_AGE_HOURS?: string;
}

/** The daily cap (default 2500, clamped to 0..2500) and the per-run cap (default 2500). */
export function capsFromEnv(env: CapEnv): { daily: number; run: number } {
  return { daily: clampInt(env.EBAY_DAILY_CAP, DEFAULT_DAILY_CAP, 0, MAX_DAILY_CAP), run: clampInt(env.EBAY_RUN_CAP, DEFAULT_RUN_CAP, 0, MAX_DAILY_CAP) };
}

/** The catalogue sweep's call allowance (default 2,100, clamped to 0..2500). */
export const sweepCallsFromEnv = (env: CapEnv) => clampInt(env.EBAY_SWEEP_CALLS, DEFAULT_SWEEP_CALLS, 0, MAX_DAILY_CAP);

/** What this run may spend: min(run cap, what is left of today's daily cap, --max-calls). */
export function runCap(caps: { daily: number; run: number }, usedToday: number, maxCalls?: number): number {
  const left = Math.max(0, caps.daily - usedToday);
  return Math.min(caps.run, left, maxCalls != null && Number.isFinite(maxCalls) ? Math.max(0, Math.floor(maxCalls)) : Infinity);
}

// ─── Normalising a search ──────────────────────────────────────────────────────

/** The rows a feed would store from its searches' raw results (one list per search), or [] when nothing qualifies. */
export function selectFeedItems(feed: PlanFeed, raw: readonly (readonly unknown[])[], now: number): FeedItem[] {
  const r = feed.rule;
  const mp = feed.marketplace;
  const norm = (fn: (x: unknown) => FeedItem | null) => raw.map((list) => list.map(fn).filter((x): x is FeedItem => !!x));
  switch (r.kind) {
    case "chase":
      return roundRobin(norm((x) => normaliseChase(x, mp, now)), MAX_FEED_ROWS);
    case "sealed":
      return roundRobin(norm((x) => normaliseSealed(x, mp, now)), MAX_FEED_ROWS);
    case "type":
      return roundRobin(norm((x) => normaliseType(x, mp, now, r.type)), MAX_FEED_ROWS);
    case "set":
      return roundRobin(norm((x) => normaliseSetChase(x, mp, now, r.setCode)), MAX_FEED_ROWS);
    case "item":
      return lowestPriceFirst(norm((x) => normaliseItemFeed(x, mp, now, r.target)).flat(), ITEM_KEEP);
  }
}

// ─── The run ───────────────────────────────────────────────────────────────────

export interface RunOptions {
  dryRun?: boolean;
  /** Buy feeds again even when their rows are fresh (a manual refresh). */
  force?: boolean;
  only?: readonly Bucket[];
  maxCalls?: number;
  concurrency?: number;
}

export interface ImportDeps {
  db: ImportDb;
  api: Deps;
  env: CapEnv;
  log: (line: string) => void;
}

export interface BucketResult {
  planned: number;
  refreshed: number;
  failed: number;
  skipped: number;
  /** Feeds not bought because their rows were fresh (refreshed by an earlier or overlapping run). */
  fresh: number;
  /** Searches made for this bucket's feeds (retries included). */
  calls: number;
  emptied: number;
  stored: number;
  /** items only: eligible keys the catalogue sweep covered this run, so not searched one by one. */
  covered: number;
}

/** What the catalogue sweep did in one marketplace: counts only. */
export interface SweepReport {
  marketplace: MarketplaceId;
  products: number;
  pages: number;
  listings: number;
  valid: number;
  matched: number;
  /** products with at least one listing */
  found: number;
  /** item feeds written (products with at least minRowsFor("item") listings) */
  written: number;
  /** the general queries (SWEEP_QUERIES) */
  queries: QueryProgress[];
  /** the hot pass's queries (hotSweepQueries), run first, and the pages they fetched (included in `pages`) */
  hotQueries: QueryProgress[];
  hotPages: number;
}

/** One hot set in one priority marketplace after the run: counts only. */
export interface HotCoverage {
  set: string;
  marketplace: MarketplaceId;
  /** products of the set the marketplace's regions list */
  products: number;
  /** ...of which have an item feed in the database after the run */
  withFeed: number;
}

/** The per-product searches for hot-set products of the priority marketplaces (hotItemKeys): counts only. */
export interface HotItems {
  /** hot keys in all */
  keys: number;
  /** refreshed recently (not bought again) */
  fresh: number;
  /** covered by this run's sweep */
  covered: number;
  /** searched one by one this run */
  searched: number;
  /** ...of which wrote an item feed */
  refreshed: number;
}

export interface RunSummary {
  dryRun: boolean;
  day: string;
  caps: { daily: number; run: number };
  usedBefore: number;
  usedAfter: number;
  plan: Plan;
  buckets: Record<Bucket, BucketResult>;
  searches: number;
  retries: number;
  purged: number;
  purgedAtEnd: number;
  /**
   * why the run stopped early, if it did: "rate-limited" (429) | "cap" (the run cap or the daily cap: retries count against it,
   * so the least valuable feeds of the plan were left for the next run) | "retries" (the retry allowance) |
   * "token" | "forbidden" (401/403 on a search: the keyset has no Buy API access) | "failing" (BREAKER_FAILURES failed
   * searches in a row) | "empty" (BREAKER_EMPTY searches in a row with no listings at all)
   */
  stopped: string | null;
  /** the token failure's code and OAuth category, or the search failure's code (e.g. search-http-403), when that is why */
  tokenError: string | null;
  feedsRefreshed: number;
  /**
   * the fixed feeds and the per-product searches planned (the sweep is reported in `sweep`); a hot-set product that is not an eligible key
   * (a pack, a cheap product) is best effort like the sweep: it is in `hotItems`, not here or in `feedsRefreshed` (the job's exit check)
   */
  feedsPlanned: number;
  sweep: SweepReport[];
  /** per hot set (HOT_SETS order) × priority marketplace: products with an item feed after the run / products listed */
  hot: HotCoverage[];
  hotItems: HotItems;
  itemFeedsInDb: number;
  rowsInDb: number;
  oldestRowAgeMs: number | null;
}

/** Does a feed count in feedsPlanned / feedsRefreshed? All but a hot-set product's search that is not an eligible key (see RunSummary). */
const counted = (f: PlanFeed) => !f.hot || !!f.item;

const emptyBucket = (): BucketResult => ({ planned: 0, refreshed: 0, failed: 0, skipped: 0, fresh: 0, calls: 0, emptied: 0, stored: 0, covered: 0 });

/** Delete listings older than the bound plus the grace (3.1(b): copies no longer required are deleted). The store import calls the same helper. */
export function purgeCutoff(nowMs: number, env: CapEnv): Date {
  return purgeCutoffFor(nowMs, env.EBAY_LISTING_MAX_AGE_HOURS);
}

/**
 * Per hot set (HOT_SETS order) and priority marketplace: how many of the set's products the marketplace lists, and how many of those
 * `hasFeed` says have an item feed. Counts only.
 */
export function hotCoverage(rows: readonly PlanRow[], hasFeed: (feed: string) => boolean, sets: readonly string[] = HOT_SETS): HotCoverage[] {
  const ids = new Map<string, Set<string>>();
  const wanted = new Set(sets);
  for (const r of rows) {
    if (!r.setCode || !wanted.has(r.setCode)) continue;
    const mp = MARKETPLACE_OF_REGION[r.market.toLowerCase() as Region];
    if (!mp) continue;
    const k = `${r.setCode}|${mp}`;
    const s = ids.get(k) ?? new Set<string>();
    s.add(r.productId);
    ids.set(k, s);
  }
  const out: HotCoverage[] = [];
  for (const set of sets) {
    for (const marketplace of PRIORITY_MARKETPLACES) {
      const list = [...(ids.get(`${set}|${marketplace}`) ?? [])];
      out.push({ set, marketplace, products: list.length, withFeed: list.filter((id) => hasFeed(feedKey(marketplace, "item", id))).length });
    }
  }
  return out;
}

type StopWhy = "rate-limited" | "cap" | "retries" | "token" | "forbidden" | "failing" | "empty";
class StopRun extends Error {
  constructor(readonly why: StopWhy) {
    super(why);
  }
}

export async function runImport(deps: ImportDeps, opts: RunOptions = {}): Promise<RunSummary> {
  const { db, api, env, log } = deps;
  const now = () => api.now();
  const day = budgetDay(now());
  const caps = capsFromEnv(env);
  const dry = !!opts.dryRun;

  if (!dry) await db.ensureTables();
  let purged = 0;
  if (!dry) purged = await db.purge(purgeCutoff(now(), env), day);

  let usedBefore = 0;
  try {
    usedBefore = await db.used(day);
  } catch (e) {
    if (!dry) throw e; // a dry run may meet a database that has no tables yet
  }
  const cap = runCap(caps, usedBefore, opts.maxCalls);
  const rows = await db.planRows();
  // Every feed's age (also what the hot-set report counts from, with the feeds this run writes): read once, at the start.
  let ages = new Map<string, Date>();
  try {
    ages = await db.feedAges();
  } catch {
    /* no table yet (a dry run before the first import): nothing is fresh */
  }
  // Feeds refreshed recently (an earlier run today, an overlapping one, a retry after a crash) are not bought again unless forced.
  let fresh: Set<string> | undefined;
  if (!opts.force) {
    const freshMs = freshWindowMs(env);
    fresh = new Set([...ages].filter(([, at]) => now() - at.getTime() < freshMs).map(([feed]) => feed));
  }
  const today = new Date(now()).toISOString().slice(0, 10);
  const plan = buildPlan(rows, { cap, sweepCalls: sweepCallsFromEnv(env), today, only: opts.only, fresh });

  const buckets = Object.fromEntries(BUCKETS.map((b) => [b, emptyBucket()])) as Record<Bucket, BucketResult>;
  for (const b of BUCKETS) {
    buckets[b].planned = plan.byBucket[b].feeds;
    buckets[b].fresh = plan.byBucket[b].fresh;
    buckets[b].skipped = plan.byBucket[b].wanted - plan.byBucket[b].feeds - plan.byBucket[b].fresh;
  }
  // The sweep's marketplaces and the per-product searches are decided as the run goes (what the sweep covered, what it left).
  buckets.sweep.planned = 0;
  buckets.items.planned = 0;
  const summary: RunSummary = {
    dryRun: dry,
    day,
    caps,
    usedBefore,
    usedAfter: usedBefore,
    plan,
    buckets,
    searches: 0,
    retries: 0,
    purged,
    purgedAtEnd: 0,
    stopped: null,
    tokenError: null,
    feedsRefreshed: 0,
    feedsPlanned: plan.feeds.filter((f) => f.bucket !== "items").length,
    sweep: [],
    hot: [],
    hotItems: { keys: 0, fresh: 0, covered: 0, searched: 0, refreshed: 0 },
    itemFeedsInDb: 0,
    rowsInDb: 0,
    oldestRowAgeMs: null,
  };
  for (const line of startReport(summary, { maxCalls: opts.maxCalls, force: !!opts.force, freshMs: freshWindowMs(env) })) log(line);

  // Item feeds this run writes: the sweep's (`swept`, which also decides what the per-product searches skip) and the per-product searches'.
  const swept = new Set<string>();
  const itemWritten = new Set<string>();
  /** The end of every run: the purge and the database summary (not in a dry run), then the hot-set coverage, counted from the feeds read at the start and those written since, less what the end purge removed. */
  async function close(): Promise<RunSummary> {
    if (!dry) await finish(deps, summary);
    const cutoff = now() - hoursToMs(parseMaxAgeHours(env.EBAY_LISTING_MAX_AGE_HOURS)); // what the site still shows, not what the purge keeps
    summary.hot = hotCoverage(rows, (feed) => swept.has(feed) || itemWritten.has(feed) || (ages.get(feed)?.getTime() ?? -Infinity) >= cutoff);
    return summary;
  }

  if (dry || (!plan.feeds.length && plan.sweepBudget <= 0)) return close();

  // One token for the run. A token failure is fatal: nothing else can work.
  const tokens: TokenManager = createTokenManager(api);
  try {
    await tokens.get();
  } catch (e) {
    summary.stopped = "token";
    summary.tokenError = e instanceof EbayError ? e.describe() : "error";
    return close();
  }

  // STRICT run cap: every search (a first try, a retry, the repeat after a 401) is claimed here BEFORE its await, so three workers can
  // never overshoot it, and retries come out of the same cap as everything else.
  let spent = 0;
  let retriesLeft = retryAllowance(plan.calls);

  /** Reserve one call in the database (atomically) before it is made. Throws StopRun at the run cap, the retry allowance or the daily cap. */
  async function reserve(retry: boolean): Promise<void> {
    if (spent >= plan.cap) throw new StopRun("cap");
    if (retry) {
      if (retriesLeft <= 0) throw new StopRun("retries");
      retriesLeft--;
    }
    spent++;
    let total: number | null;
    try {
      total = await db.reserve(day, 1, caps.daily);
    } catch (e) {
      spent--;
      if (retry) retriesLeft++;
      throw e;
    }
    if (total == null) {
      spent--;
      if (retry) retriesLeft++;
      throw new StopRun("cap");
    }
    if (retry) summary.retries++;
    summary.searches++;
    summary.usedAfter = total;
    if (summary.searches % PROGRESS_EVERY === 0) log(progressLine(summary));
  }

  // The circuit breaker: consecutive searches that failed, and consecutive ones that returned nothing at all. Any search that
  // returns listings resets both. A 403 (or a 401 that survives the token refresh) means the keyset cannot search: stop at once.
  let badRun = 0;
  let emptyRun = 0;

  async function search(spec: SearchSpec, bucket: Bucket): Promise<unknown[]> {
    return (await searchRaw(spec, bucket)).items;
  }

  /** One reserved, retried, circuit-broken search: the listings and eBay's total (the sweep pages by it). */
  async function searchRaw(spec: SearchSpec, bucket: Bucket): Promise<{ items: unknown[]; total: number | null }> {
    let attempt = 0;
    let s = spec;
    for (;;) {
      await reserve(attempt > 0);
      buckets[bucket].calls++;
      try {
        const page = await searchPage(api, tokens, s, async () => {
          try {
            await reserve(true); // the repeat after a 401 is a second call
            buckets[bucket].calls++;
            return true;
          } catch {
            return false;
          }
        });
        badRun = 0;
        if (page.items.length) emptyRun = 0;
        else if (++emptyRun >= BREAKER_EMPTY) throw new StopRun("empty");
        return page;
      } catch (e) {
        if (e instanceof StopRun) throw e;
        if (!(e instanceof EbayError)) throw e;
        if (e.status === 429) throw new StopRun("rate-limited");
        if (e.code.startsWith("token")) {
          summary.tokenError = e.describe();
          throw new StopRun("token");
        }
        if (e.status === 401 || e.status === 403) {
          summary.tokenError = e.describe(); // only the fixed code: "search-http-403"
          throw new StopRun("forbidden");
        }
        // The price-filter syntax could not be exercised without keys: one 400 retries without it.
        if (e.status === 400 && s.minPrice != null && attempt === 0) {
          s = { ...s, minPrice: null };
          attempt++;
          continue;
        }
        // One retry on a server error or a timeout.
        if ((e.status != null && e.status >= 500) || e.code === "search-network") {
          if (attempt === 0) {
            attempt++;
            continue;
          }
        }
        if (++badRun >= BREAKER_FAILURES) {
          summary.tokenError = e.describe();
          throw new StopRun("failing");
        }
        throw e;
      }
    }
  }

  let stop: StopRun | null = null; // set by the first worker to hit a StopRun; the others stop before their next search

  async function doFeed(f: PlanFeed): Promise<void> {
    const raw: unknown[][] = [];
    let failures = 0;
    for (const spec of f.searches) {
      if (stop) throw stop; // another worker ended the run (429, breaker, cap): no further search for this feed
      try {
        raw.push(await search(spec, f.bucket));
      } catch (e) {
        if (e instanceof StopRun) throw e; // the run ends: this feed keeps its old rows
        failures++;
        raw.push([]);
      }
    }
    const b = buckets[f.bucket];
    if (failures === f.searches.length) {
      b.failed++; // every search failed: the old rows stay until the bound
      return;
    }
    const at = now();
    const items = selectFeedItems(f, raw, at);
    if (!items.length) {
      b.emptied++; // an empty result keeps the old rows until the bound
      return;
    }
    await db.replaceFeed(f.feed, items, new Date(at)); // one transaction: the feed's rows are REPLACED, never appended
    if (f.kind === "item") itemWritten.add(f.feed);
    b.refreshed++;
    b.stored += items.length;
    if (counted(f)) summary.feedsRefreshed++;
  }

  // Concurrency 3, in plan order. A StopRun ends the whole run: workers finish the feed they are in and take no more.
  async function runFeeds(list: readonly PlanFeed[]): Promise<void> {
    let next = 0;
    const workers = Array.from({ length: Math.max(1, opts.concurrency ?? CONCURRENCY) }, async () => {
      while (!stop) {
        const i = next++;
        if (i >= list.length) return;
        const f = list[i];
        try {
          await doFeed(f);
        } catch (e) {
          if (e instanceof StopRun) {
            stop ??= e;
            return;
          }
          buckets[f.bucket].failed++;
          log(`feed ${f.bucket}: unexpected error (${e instanceof Error ? e.name : "error"})`);
        }
      }
    });
    await Promise.all(workers);
  }

  // 1. The fixed feeds (chase, sealed, types, sets): the strips every page shows.
  await runFeeds(plan.feeds.filter((f) => f.bucket !== "items"));

  // 2. The catalogue sweep: an item feed for every product its pages find, marketplace by marketplace (US, UK, EU first), each
  //    starting with the hot sets' own searches (at most half its share).
  if (!stop && plan.sweepBudget > 0) {
    const vocab = sweepVocabulary(rows);
    const sigSets = sweepSignatureSets(rows);
    const all = MARKETPLACE_ORDER.map((mp) => buildSweepIndex(rows, mp, vocab, sigSets)).filter((ix) => ix.products.length > 0);
    // A marketplace swept in the last fresh window (a re-run, an overlapping run) is not swept again unless forced.
    const freshItems = (mp: MarketplaceId) => (fresh ? [...fresh].filter((k) => k.startsWith(`${mp}|item:`)).length : 0);
    const todo: SweepIndex[] = [];
    for (const ix of all) {
      if (freshItems(ix.marketplace) >= Math.max(50, Math.floor(ix.products.length * 0.25))) buckets.sweep.fresh++;
      else todo.push(ix);
    }
    let left = Math.min(plan.sweepBudget, plan.cap - spent);
    for (let i = 0; i < todo.length && !stop && left > 0; i++) {
      const ix = todo[i];
      buckets.sweep.planned++;
      const budget = marketplaceShares(todo.slice(i), left).get(ix.marketplace) ?? 0;
      const collector = new SweepCollector(ix, now());
      const before = buckets.sweep.calls;
      let queries: QueryProgress[] = [];
      let hotQueries: QueryProgress[] = [];
      // The hot searches for what THIS marketplace lists (a type only another market stocks would cost pages that can match nothing).
      const hot = hotSweepQueries(
        rows.filter((r) => MARKETPLACE_OF_REGION[r.market.toLowerCase() as Region] === ix.marketplace),
        today,
      );
      const hotQs = new Set(hot.map((q) => `Pokemon ${q.q}`));
      let hotFetched = 0; // counted as the pages are made, so a run that stops during the hot pass still reports them
      try {
        const done = await sweepWithHot(
          collector,
          budget,
          async (spec) => {
            if (stop) throw stop; // another worker ended the run: no further page
            if (hotQs.has(spec.q)) hotFetched++;
            try {
              return await searchRaw(spec, "sweep");
            } catch (e) {
              if (e instanceof StopRun) stop ??= e; // at once, so the sibling workers stop before their next page
              throw e;
            }
          },
          {
            concurrency: Math.max(1, opts.concurrency ?? CONCURRENCY),
            hot,
            spent: () => buckets.sweep.calls, // the hot pass's real cost, retries included, comes off the general pass's share
            shouldStop: () => !!stop,
            isFatal: (e) => e instanceof StopRun,
          },
        );
        queries = done.general;
        hotQueries = done.hot;
      } catch (e) {
        if (e instanceof StopRun) stop ??= e;
        else log(`sweep ${ix.marketplace}: unexpected error (${e instanceof Error ? e.name : "error"})`);
      }
      left -= buckets.sweep.calls - before;
      // What the pages found is written even when the run stopped part-way: every row is a real, current listing.
      const at = now();
      const ready = [...collector.feeds()].filter(([, items]) => items.length >= minRowsFor("item")).map(([productId, items]) => ({ feed: feedKey(ix.marketplace, "item", productId), items }));
      let written = 0;
      for (let j = 0; j < ready.length; j += SWEEP_WRITE_BATCH) {
        const batch = ready.slice(j, j + SWEEP_WRITE_BATCH);
        try {
          await db.replaceFeeds(batch, new Date(at));
          written += batch.length;
          buckets.sweep.stored += batch.reduce((a, f) => a + f.items.length, 0);
          for (const f of batch) swept.add(f.feed);
        } catch {
          // One bad row must not cost the other 99 products their refresh: write that batch one feed at a time.
          for (const f of batch) {
            try {
              await db.replaceFeed(f.feed, f.items, new Date(at));
              written++;
              buckets.sweep.stored += f.items.length;
              swept.add(f.feed);
            } catch (e) {
              buckets.sweep.failed++;
              log(`sweep ${ix.marketplace}: a feed write failed (${e instanceof Error ? e.name : "error"}); that product keeps its old rows`);
            }
          }
        }
      }
      buckets.sweep.refreshed += written;
      const found = collector.feeds().size;
      buckets.sweep.emptied += found - ready.length; // (none while one listing is enough for a product's strip)
      const st = collector.stats;
      const hotPages = Math.max(hotFetched, hotQueries.reduce((a, q) => a + q.pages, 0));
      summary.sweep.push({ marketplace: ix.marketplace, products: ix.products.length, pages: st.pages, listings: st.listings, valid: st.valid, matched: st.matched, found, written, queries, hotQueries, hotPages });
      log(`sweep ${ix.marketplace}: ${num(st.pages)} pages (${num(hotPages)} on the hot sets), ${num(st.matched)} listings matched to ${num(found)} of ${num(ix.products.length)} products; ${num(written)} item feeds written.`);
    }
  }

  // 3. Per-product searches for what the sweep did not cover, with what is left of the cap: the hot-set products of the US, UK and EU
  //    first (any type, any price), then the eligible keys, most valuable first (perProductFeeds: the plan's own order).
  const wantItems = !opts.only || opts.only.includes("items");
  const perProduct = wantItems ? perProductFeeds(rows, plan.keys, today) : [];
  const notFresh = perProduct.filter((f) => !fresh?.has(f.feed));
  const open = notFresh.filter((f) => !swept.has(f.feed));
  buckets.items.covered = notFresh.length - open.length;
  const hotFeeds = perProduct.filter((f) => f.hot);
  summary.hotItems.keys = hotFeeds.length;
  summary.hotItems.fresh = hotFeeds.filter((f) => fresh?.has(f.feed)).length;
  summary.hotItems.covered = hotFeeds.filter((f) => !fresh?.has(f.feed) && swept.has(f.feed)).length;
  if (stop && wantItems) summary.feedsPlanned += plan.feeds.filter((f) => f.bucket === "items" && counted(f)).length; // the run stopped first: that work is unfinished, not absent
  if (!stop && wantItems) {
    const room = Math.max(0, plan.cap - spent);
    const take = Math.max(0, room - retryAllowance(Math.min(room, open.length)));
    const list = open.slice(0, take);
    buckets.items.planned = list.length;
    summary.feedsPlanned += list.filter(counted).length;
    summary.hotItems.searched = list.filter((f) => f.hot).length;
    await runFeeds(list);
    summary.hotItems.refreshed = list.filter((f) => f.hot && itemWritten.has(f.feed)).length;
  }

  if (stop) summary.stopped = (stop as StopRun).why;
  // Feeds the plan held but the run never finished (it stopped first) count as skipped, with the ones the cap left out.
  for (const b of BUCKETS) {
    const r = buckets[b];
    if (b === "sweep") {
      r.skipped = Math.max(0, plan.byBucket.sweep.wanted - r.planned - r.fresh); // marketplaces not reached (or with no products)
      continue;
    }
    if (b === "items") {
      r.skipped = plan.byBucket.items.wanted - plan.byBucket.items.fresh - r.covered - r.refreshed - r.failed - r.emptied;
      continue;
    }
    r.skipped = plan.byBucket[b].wanted - plan.byBucket[b].feeds - plan.byBucket[b].fresh + (r.planned - r.refreshed - r.failed - r.emptied);
  }
  return close();
}

const num = (x: number) => x.toLocaleString("en");

/**
 * What a run is about to do, printed before the first search (so a manual "Run workflow" says it at once): today's budget (the Pacific
 * day eBay's limit resets on), how much of it is used and left, what THIS run may spend and why, what the plan buys, and when it stops.
 * Numbers only. The counter is this site's own: another application on the same eBay keyset is invisible to it (DEPLOY.md).
 */
export function startReport(s: RunSummary, o: { maxCalls?: number; force: boolean; freshMs: number }): string[] {
  const left = Math.max(0, s.caps.daily - s.usedBefore);
  const reasons = [`run cap ${num(s.caps.run)}`, `${num(left)} left of today's ${num(s.caps.daily)}`, ...(o.maxCalls != null ? [`--max-calls ${num(Math.max(0, Math.floor(o.maxCalls)))}`] : [])];
  const wanted = BUCKETS.reduce((a, b) => a + s.plan.byBucket[b].wantedCalls, 0);
  const fresh = BUCKETS.reduce((a, b) => a + s.plan.byBucket[b].fresh, 0);
  const per = BUCKETS.filter((b) => s.plan.byBucket[b].wanted > 0)
    .map((b) => (b === "sweep" ? `sweep up to ${num(s.plan.sweepBudget)} calls over ${num(s.plan.byBucket.sweep.feeds)} marketplaces` : b === "items" ? `items: whatever the sweep leaves, for the hot-set products and then the eligible products it did not cover (pre-plan ${num(s.plan.byBucket.items.feeds)})` : `${b} ${num(s.plan.byBucket[b].feeds)} feeds/${num(s.plan.byBucket[b].calls)} calls`))
    .join(", ");
  return [
    `${s.dryRun ? "DRY RUN (no eBay call, no database write). " : ""}Budget day ${s.day} (the Pacific day: eBay's call limit resets at 00:00 Pacific = 07:00 UTC in summer, 08:00 in winter).`,
    `Browse calls reserved so far today: ${num(s.usedBefore)} of the ${num(s.caps.daily)} daily cap (${num(left)} left). The counter sees only this site's runs: another application on the same eBay keyset is invisible to it.`,
    `This run may make at most ${num(s.plan.cap)} searches, retries included (the smallest of: ${reasons.join(", ")}).${s.plan.cap === 0 ? " Nothing to do: the budget for today is spent." : ""}`,
    `Plan: ${num(s.plan.feeds.length)} feeds in ${num(s.plan.calls)} searches (${per || "nothing"}); ${num(fresh)} feeds skipped as refreshed in the last ${Math.round((o.freshMs / 3600_000) * 10) / 10} h${o.force ? " (--force: bought again anyway)" : ""}; the plan would like ${num(wanted)} searches in all, and what does not fit waits for the next run.`,
    `It stops early on a 429, a 401/403 on a search, ${BREAKER_FAILURES} failed searches in a row, or ${BREAKER_EMPTY} with no listings in a row.`,
    `Priorities (src/lib/popular.ts): marketplaces in the order ${MARKETPLACE_ORDER.join(", ")}; hot sets ${HOT_SETS.join(", ")}. Each marketplace's sweep starts with the hot sets' own searches (at most half its share), and their products in ${PRIORITY_MARKETPLACES.join(", ")} that the sweep misses are searched one by one before any other product.`,
  ];
}

/** A progress line: this run's searches and today's total against the caps. Numbers only. */
export function progressLine(s: RunSummary): string {
  return `progress: ${num(s.searches)} searches this run (${num(s.retries)} retries, run cap ${num(s.plan.cap)}); ${num(s.usedAfter)} of the ${num(s.caps.daily)} daily cap used today; ${num(s.feedsRefreshed)} feeds refreshed.`;
}

async function finish(deps: ImportDeps, s: RunSummary): Promise<void> {
  const { db, api, env } = deps;
  try {
    s.purgedAtEnd = await db.purge(purgeCutoff(api.now(), env), s.day);
  } catch {
    /* the purge never fails the import */
  }
  try {
    const sum = await db.summary();
    s.itemFeedsInDb = sum.itemFeeds;
    s.rowsInDb = sum.rows;
    s.oldestRowAgeMs = sum.oldest ? api.now() - sum.oldest.getTime() : null;
  } catch {
    /* a summary is not worth failing for */
  }
  try {
    s.usedAfter = await db.used(s.day);
  } catch {
    /* keep the reserved total */
  }
}
