// src/lib/data/plane/formats.ts (owner WP01a, FROZEN). THE WIRE FORMATS of the published data, v1 (contract section 2.9, section 2.9). Tuples, not objects: a row is one JSON array on one line.
// null = unknown, 0 = absent text/id (one byte in the file). Positions are APPEND-ONLY: a reader ignores trailing elements it does not know (additive changes only inside v1; section 2.9).
// Everything under `v1/` of the private data repository is described here. NOTHING in this file may ever describe an eBay field, a user, a ranking, a score or a demand count beyond the free preview slice (12.3).
import type { Country } from "../../country";

export const PLANE_FORMAT = "v1" as const;
export const PLANE_PREFIX = "v1";                         // every data file lives under v1/; latest.json and status.json also sit at the branch root
export const PLANE_FILE_MAX_BYTES = 1_000_000;            // asserted on every published file (the validator refuses more). Next stops caching a fetched file at about 1,570,000 raw bytes (measured)
export type Z<T> = T | 0;                                 // 0 stands for "none" in text and id positions

/** latest.json at the branch root. The only mutable URL; every other URL is read at `ref`. */
export interface PointerFile {
  v: 1; seq: number;
  ref: string;                                            // 40-hex sha of the DATA commit; a pinned URL is .../<ref>/v1/<path>
  publishedAt: string; priceDay: string;                  // priceDay = UTC date of the TCGCSV build, never of the cron
  tcgcsv: string; scryfall: string;                       // the source stamps the gate compares against
  phase: "catalog" | "full";                              // catalog = prices live, store aggregates carried from the previous publish (membership reconciled); full = stores included
  format: "v1";
  counts: { cards: number; units: number; files: number };
  manifestSha256: string; prev: string | null;            // prev = the previous pointer's ref (a file missing at `ref` is read at `prev`, same format only)
  repo: string;                                           // "<owner>/<name>" that holds v1/**: normally the repository that holds latest.json; a rotation changes it with no deploy (12.5.7)
  histCut: string;                                        // YYYY-MM-DD of the last history cut: hist/p ends on this day, hist/t holds the days after it
  pvAt: string | null;                                    // when pv/* (the free demand and rising preview slices) was last written by the demand-snapshot overlay; null before the first
}

// ── identity, prices ──────────────────────────────────────────────────────────────────────────────────────────────────
/** v1/cat/<floor(b/64)>/<b>.json, b = floor(id/256): identity, static (rewritten only when a row appears or its text changes). */
export type CatRow = [id: number, slug: string, name: string, alt: Z<string>, setId: number, sc: Z<string>, number: Z<string>, fnum: Z<string>, rarity: string, cls: number, treat: string, label: Z<string>, flags: number, link: number, oracleNo: number, scryId: Z<string>, rootId: Z<number>, tn: Z<string>, colors: number, mv: number, ptype: number];   // colors (WUBRG mask), mv (mana value), ptype (PRIMARY_TYPES index) are copies of the oracle's, so a tile built by a bucket fan-in never needs the oracle shard
export interface CatFile { v: 1; b: number; c: CatRow[] }
/** v1/px/<floor(b/64)>/<b>.json: TCGplayer prices per finish + (tracked finishes) market change 7 d, 30 d (percent, 1 decimal) and 90-day high, USD cents. Trailing nulls are cut. mask = PRICE_MASK. */
export type PxRow = [id: number, marketN: number | null, marketF: number | null, lowN: number | null, lowF: number | null, mask: number, c7N?: number | null, c30N?: number | null, hiN?: number | null, c7F?: number | null, c30F?: number | null, hiF?: number | null];
export interface PxFile { v: 1; b: number; p: PxRow[] }
/** v1/un/<floor(b/64)>/<b>.json (phase 2): per TRACKED unit and market (MARKETS order US AU UK SG CA EU, market currency cents): cheapest fresh in-stock listing incl. TCGplayer's own low in the US, store counts, cheapest STORE listing. */
export type UnRow = [uid: number, low: (number | null)[], stores: number[], storeMin: (number | null)[]];
export interface UnFile { v: 1; b: number; at: string; u: UnRow[] }
/** v1/of/<floor(b/64)>/<b>.json (phase 2): store offers of tracked units. condition = CONDITIONS index or null (unstated). path is store-relative; the origin comes from the registry. store is a REGISTRY id (>= 10) or a feed id (8, 9); never 0 to 7 (12.3.5). */
export type OfferTuple = [uid: number, market: number, store: number, priceCents: number, condition: number | null, inStock: 0 | 1, path: string];
export interface OfferFile { v: 1; b: number; at: string; o: OfferTuple[] }

// ── lookups ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** v1/slug/<fnv1a32(slug) % 256 as 2 hex>.json: card slugs, oracle slugs (to oracleNo) and sealed slugs (to productId). Sorted by slug. */
export interface SlugShard { v: 1; h: number; s: [slug: string, productId: number][]; o: [slug: string, oracleNo: number][]; z: [slug: string, productId: number][] }
/** v1/sc/<fnv1a32(code) % 64 as 2 hex>.json: Scryfall set code (or Set.tok for an unjoined card) -> collector-number key -> product ids (1 to 3). */
export interface ScShard { v: 1; h: number; s: Record<string, Record<string, number[]>> }
/** v1/or/<oracleNo % 512 as 3 hex>.json: oracle facts. Scryfall-derived text is shown by pages and never offered as a bulk download; the data repository is private (12.3). */
export type OracleRow = [no: number, scryfallId: string, slug: string, name: string, manaCost: string, manaValue: number, typeLine: string, colors: number, identity: number, legal: string, edhrecRank: Z<number>, flags: number, layout: Z<string>, pt: Z<string>, loyalty: Z<string>, oracleText: Z<string>, keywords: string, faces: Z<number>, nPrint: number];
export interface OracleShard { v: 1; h: number; o: OracleRow[] }
/** v1/nm/<n>.json: the typeahead table, hottest first (chunk 0 = top 8,000 oracles). */
export type NameRow = [no: number, name: string, oracleSlug: string, topSlug: Z<string>, nPrint: number, topCents: number | null, alt: Z<string>];
export interface NameFile { v: 1; n: number; r: NameRow[] }
/** v1/meta/sets.json */
export type SetRow = [id: number, slug: string, tok: string, code: string, name: string, tcgName: Z<string>, kind: string, releasedOn: Z<string>, bucket: 0 | 1, scry: Z<string>, cardCount: number, trackedCount: number, sealedCount: number];
export interface SetsFile { v: 1; at: string; sets: SetRow[] }
/** v1/meta/scrysets.json: [code, name, setType, releasedOn, parent] */
export interface ScrySetsFile { v: 1; sets: [code: string, name: string, setType: string, releasedOn: Z<string>, parent: Z<string>][] }
/** v1/meta/buckets.json: the bucket numbers that exist (cat, px) and those that hold tracked units (un, of, hist); a reader never requests a file this list rules out. */
export interface BucketsFile { v: 1; width: 256; cat: number[]; tracked: number[] }
/** v1/st/<setId>.json (+ st/<setId>-<k>.json): the set board, collector order. low/stores = the HEADLINE unit's per-market aggregates (0 when untracked). */
export type BoardRow = [id: number, slug: string, name: string, number: Z<string>, rarity: string, cls: number, treat: string, label: Z<string>, flags: number, sc: Z<string>, marketN: number | null, marketF: number | null, lowN: number | null, lowF: number | null, mask: number, low: Z<(number | null)[]>, stores: Z<number[]>, change7d: number | null];
export interface BoardFile { v: 1; set: number; at: string; n: number; chunk: number; chunks: number; c: BoardRow[] }   // n = rows of the whole board; 2,000 rows per file
/** v1/sl/list-<k>.json and v1/sl/d/<fnv1a32(slug) % 64 as 2 hex>.json */
export const SEALED_FLAGS = { PRESALE: 1, GONE: 2 } as const;      // GONE (budget critique 15): set after two complete days absent from TCGCSV; a GONE row stays in the file, out of every list and sitemap
/** kind = the SealedKind string ("Booster Box"); low / stores = the cheapest fresh in-stock offer and the store count per market in MARKETS order (the US entry includes TCGplayer's own low), 0 when no store stage has covered the product; change7d from the sealed series. */
export type SealedRow = [id: number, slug: string, name: string, setId: Z<number>, kind: string, packCount: Z<number>, releasedOn: Z<string>, flags: number, market: number | null, lowTcg: number | null, low: Z<(number | null)[]>, stores: Z<number[]>, change7d: number | null];
export interface SealedListFile { v: 1; at: string; chunk: number; chunks: number; s: SealedRow[] }   // 2,500 rows per file
export type SealedOfferTuple = [market: number, store: number, price: number, cond: number | null, inStock: 0 | 1, path: string];
/** One row per product of the shard: offers at index 2 (the validator reads store ids there), the contents text (set list, pack makeup) at index 3. */
export interface SealedDetailFile { v: 1; h: number; p: [id: number, slug: string, offers: SealedOfferTuple[], contents: Z<string>][] }

// ── the browse index: columnar, rows = LISTED cards sorted by id, 8,192 rows per chunk ─────────────────────────────────
export interface IxDict { v: 1; chunk: number; rows: number; sc: string[]; tr: string[]; lb: string[] }
export interface IxK { v: 1; n: number; id: number[]; slug: string[]; name: string[]; set: number[]; sc: number[]; num: string[]; ns: number[]; rar: string; cls: string; tr: number[]; lb: number[]; fl: number[]; or: number[]; co: number[]; mv: number[]; pt: string; alt: Record<number, string>; sid: Record<number, string> }
export interface IxP { v: 1; n: number; mn: number[]; mf: number[]; ln: number[]; lf: number[]; mk: number[]; t: [row: number, finish: number, c7x10: number, c30x10: number][] }
export interface IxS { v: 1; at: string; u: number[][] }                                   // sparse by tracked unit: [row, finish, low x6, stores x6, storeMin x6]; -1 = none
/** flat in-stock offers for the Plus store picker, columnar: uid, market (ONE digit per row in the string `mk`), store id, price in market-currency cents; <= 40,000 rows per chunk. */
export interface IxF { v: 1; n: number; uid: number[]; mk: string; st: number[]; pr: number[] }
/** ix/o-<n>.json (16,384 oracles per chunk, dense by ordinal): colours mask, identity mask, legality (index into IxOdict.legal), EDHREC rank (-1 none), oracle flags, keyword string (index into IxOdict.keywords). */
export interface IxO { v: 1; n: number; no: number[]; co: number[]; idn: number[]; lg: number[]; ed: number[]; fl: number[]; kw: number[] }
export interface IxOdict { v: 1; legal: string[]; keywords: string[] }                      // ix/odict.json

// ── history ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** v4 series: [startDay YYYYMMDD, value, days, value, days, ...]; value = USD cents or null (no price); days = consecutive CALENDAR days the value held. A run is never extended across a gap (history-codec.ts). */
export type SeriesV4 = [startDay: number, ...runs: (number | null)[]];
/** v1/hist/p/<floor(b/64)>/<b>.json with b = floor(id/64): about 730 days ending on the cut day. v3 (the draft) is still READ; v4 is written. */
export interface HistFile { v: 3 | 4; p: Record<string, (number | null)[]> }
/** v1/hist/t/<floor(n/64)>/<n>.json with n = floor(id/512): the days after the last cut, v4 runs. A chart = base + tail; a series with no tail entry ends on the cut day. */
export interface HistTailFile { v: 4; cut: number; p: Record<string, (number | null)[]> }
/** v1/hist/w/<uid % 8>.json: 18 weekly closes per tracked unit taken on SUNDAYS (changes once a week): the public input of Rising Cards. The reader appends the live price as the newest point. */
export interface WeeklyFile { v: 1; end: string; weeks: number; k: number[]; c: number[][] }
/** v1/hist/index.json */
export interface IndexSeriesFile { v: 1; days: [day: string, value: number, totalUsd: number, cardCount: number][] }

// ── free views (every one is something a signed-out visitor sees) ──────────────────────────────────────────────────────
export type StoreRunRow = [store: number, market: number, at: string, ok: 0 | 1, offers: number, inStock: number, singlesInStock: number, sealedInStock: number, cheapest: number];
export interface StoreRunsFile { v: 1; at: string; r: StoreRunRow[] }                      // v1/ss/runs.json
export type StoreListingTuple = [uid: number, priceCents: number, condition: number | null, path: string];
export interface StoreListingsFile { v: 1; top: StoreListingTuple[]; cheapestHere: StoreListingTuple[] }   // v1/ss/l/<store>-<market>.json
export type HomeTileRow = [id: number, slug: string, name: string, sc: string, number: Z<string>, rarity: string, flags: number, headFinish: 0 | 1, market: number | null];
/** v1/hm/home.json. dealCounts = the number of deals per market (a count is not a row); dealsFree = the ONE savings row per market a signed-out visitor sees: [id, slug, name, buyCents, belowPct]. */
export interface HomeFile { v: 1; at: string; stats: { cards: number; tracked: number; sets: number; sealed: number; oracles: number }; newest: number[]; upcoming: number[]; chase: HomeTileRow[]; popular: HomeTileRow[]; up: HomeTileRow[]; down: HomeTileRow[]; dealCounts: number[]; dealsFree: ([id: number, slug: string, name: string, buyCents: number, belowPct: number] | null)[] }
export interface MarketFile { v: 1; at: string; basket: { n: number; totalUsd: number; avg: number; median: number }; adv: number; dec: number; cons: [id: number, slug: string, name: string, cents: number][]; sets: [setId: number, n: number, totalCents: number][] }   // v1/mk/overview.json
export interface RecordsFile { v: 1; at: string; gaps: Record<string, [uid: number, home: number, away: number, awayCents: number, converted: number, saving: number, pct: number][]>; highs: [uid: number, cents: number, high90: number][]; lows: [uid: number, cents: number, high90: number, pctBelow: number][] }   // v1/mk/records.json
export type MoverRow = [id: number, finish: 0 | 1, slug: string, name: string, sc: string, number: Z<string>, rarity: string, flags: number, marketCents: number, changePct: number];
export interface MoversFile { v: 1; at: string; r: MoverRow[] }                           // v1/mv/<up|down>-<7|30>-<a|n|f>.json and v1/mv/recent.json (the 24 largest changes between the last two days)
export interface SitemapPlanFile { v: 1; sets: number; sealed: number; commanders: number; names: number; cards: number; urls: { cards: number } }   // v1/sm/plan.json; sections v1/sm/<kind>-<n>.json = string[] (10,000 paths)

// ── the free PREVIEW slices of the paid analytics (pv/, written ONLY by the demand-snapshot overlay; 12.3.4) ───────────────────────────────────────────
/** v1/pv/demand.json: the free Demand strip: the top 10 most searched cards over 7 days, SEARCHES ONLY (no views, no more rows). Exactly what a signed-out visitor already sees on /movers. */
export interface DemandPreviewFile { v: 1; at: string; days: 7; r: [cardId: number, searches: number][] }
/** v1/pv/rising.json: the free Rising preview: the top 3 picks per scope with the reason of each (what a free account sees on the tool page). Never the other 37. */
export interface RisingPreviewFile { v: 1; at: string; scopes: Record<string, { id: number; slug: string; name: string; reason: string }[]> }

// ── bookkeeping ───────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ManifestFile { v: 1; files: [path: string, bytes: number, sha256Prefix: string][] }   // v1/manifest.json: never fetched by the site; audits and the verification step

/** The families a publish may contain (an allowlist: a file outside it refuses the publish). Family = the first path segment under v1/ (hist/ splits in p, t, w, index). */
export const FAMILIES = ["cat", "px", "un", "of", "slug", "sc", "or", "nm", "meta", "st", "sl", "ix", "hist", "ss", "hm", "mk", "mv", "sm", "pv", "manifest.json", "status.json"] as const;
/** Families that exist only after the store stage (phase 2). */
export const STORE_FAMILIES = ["un", "of", "ix/s", "ix/f", "sl/d"] as const;
/** The market order of every per-market array (country.ts MARKETS). */
export type MarketIndex = 0 | 1 | 2 | 3 | 4 | 5;
export type MarketCountry = Country;

/** The column count of every row family (the TypeScript tuples cannot be checked at run time). px rows grow with the unit stats: 6 untracked, 9 with Normal tracked or Foil tracked only, 12 with both. */
export const ROW_WIDTH = {
  cat: 21, px: [6, 9, 12], un: 4, of: 7, or: 19, nm: 7, set: 13, board: 18, sealed: 13, storeRun: 9, ixS: 20,
} as const;
