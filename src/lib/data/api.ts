// src/lib/data/api.ts (CONTRACT FILE, FROZEN; not part of the barrel and copied at C0 as the typing reference and deleted at M3 once every module below exists). Declarations only: each `declare` line is implemented in the module named in its header.
// THE LOADER API OF THE PUBLISHED-DATA ERA (contract section 7). Every name that pages, libraries and tests import from "@/lib/data" today is here, typed (no `unknown` anywhere: tests/plane-api.test.ts counts), or is in checks/removed.json with its replacement.
// Conventions
//   * get*  = a loader a page may call. read*/load*/query* = an uncached helper INSIDE a module. resolve* = an uncached request-scoped resolver. Names are OP's wherever the meaning is unchanged.
//   * Cache column in the comments (the only five kinds that exist; contract 7.5):
//       P  a pinned plane read: fetch(raw/<repo>/<sha>/v1/<file>, { next: { revalidate: 2_592_000 } }), NO tag, so Next's Data Cache holds each (sha, file) for 30 days and a publish needs no purge. The sha comes from getDataRef().
//       M  the instance memory (typed arrays, a 64 MB LRU, a 20 s pointer memo): never shared between instances, rebuilt per ref.
//       R  the three RANKING caches, the only unstable_cache that may wrap plane data: key [name-vN, ref, ...] (tier-neutral), tag RANK_TAG, value <= 1.5 MB, computed from data resolved BEFORE the closure.
//       N  a Neon-backed unstable_cache (user content, one tag in NEON_TAGS); the callback only queries Neon.
//       -  not cached (per-user, per-request, or a pure function).
//   * A loader NEVER returns a paid dataset to a viewer who may not have it: the three paid loaders take `who: Entitlement` (minted from the session, opaque) and cut AFTER the tier-neutral computation (plane/entitlement.ts, contract 12.3).
//   * Public pages read these loaders and nothing else; no module under src/app imports "@/lib/db" (tests/app-no-db-import.test.ts, tests/public-no-neon.test.ts).
import type { Country } from "../country";
import type { Condition, Finish, SealedKind, UnitRef } from "../constants";
import type { Access } from "../premium-gates";
import type { DemandWindowDays } from "../demand-view";
import type { DemandWindowResult } from "../demand-snapshot";
import type { Movement } from "../demand-movement";
import type { HomeStats } from "../home";
import type { PromoStatus } from "../launch-promo-shared";
import type { PanelGraded, PanelListing } from "../listing-panel";
import type { RiseAnalysis, RiseScope, WeekAgoRanking } from "../rise-predictor";
import type { RisingSnapshotData } from "../rising-snapshot";
import type { ChecklistCard } from "../set-scope";
import type { Catalog, CardDetail, CardLite, CardLookup, CardMini, CardPage, CardQuery, CatalogStats, HistoryPoint, IndexPoint, NameHit, NameIndexEntry, OfferRow, OracleDetail, OracleMini, ScrySetLite, SetIndex, SetLite } from "./types";
import type { BrowseIndex } from "./plane/browse-index";
import type { DealQuery, Entitlement, Sliced } from "./plane/entitlement";
import type { PointerFile } from "./plane/formats";
import type { PlaneHealth } from "./plane/runtime";
import type { StatusFile } from "./plane/status";

// ── core.ts (WP02) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export declare const DECKS_TAG: "published-decks", RISING_SNAPSHOTS_TAG: "rising-snapshots", EBAY_BANNER_TAG: "ebay-banner", RANK_TAG: "rank";
/** The tags `POST /api/revalidate` purges (it replaces PRICES_TAG): only Neon-backed caches and the rankings. Plane data needs no purge (pinned URLs). */
export declare const NEON_TAGS: readonly ["published-decks", "rising-snapshots", "ebay-banner", "rank"];
export declare const TTL: { readonly day: 86400; readonly week: 604800; readonly hours6: 21600; readonly live: 30 };
/** STALE_HOURS (72, import.ts) in milliseconds: an offer is live when it is in stock AND the run of its (store, market) in ss/runs.json is newer than this. */
export declare const STALE_MS: number;
export declare const MAX_PAGE: 100, PAGE_SIZES: readonly [24, 48, 100];
/** Sorts arrays, folds q (<= 60 chars), clamps per to PAGE_SIZES and page to 1..MAX_PAGE, drops defaults, empties and unknown values. The only way a request becomes a CardQuery. */
export declare function canonicalQuery(q: Partial<CardQuery>): CardQuery;
export declare function offerLive(inStock: boolean, refreshedAt: Date | string | number, now?: number): boolean;
export declare function jsonBytes(v: unknown): number;
/** The pointer of the data the site is serving (memo 20 s, single flight, never backwards); null only on a cold instance that cannot reach the host. P-free: the pointer fetch is no-store behind the memo. */
export declare function getDataRef(): Promise<PointerFile | null>;
export declare function planeHealth(): PlaneHealth;                                                       // GET /api/data-status; reads memory only
export declare function getPlaneStatus(): Promise<StatusFile | null>;                                  // P (status.json at the pointed sha): the admin panel (publicationStatusOf) and the freshness alarms

// ── catalog.ts (WP02) ──────────────────────────────────────────────────────────────────────────────────────────────────────
export declare function getSets(): Promise<SetLite[]>;                                               // P meta/sets.json (439 x 150 B = 66 KB)
export declare function getScrySets(): Promise<Record<string, ScrySetLite>>;                         // P meta/scrysets.json
export declare function getSetIndex(): Promise<SetIndex>;                                            // M maps over getSets()
export declare function getSetBySlug(slug: string): Promise<SetLite | null>;
export declare function getSetByCode(code: string): Promise<SetLite | null>;                       // accepts Set.tok, Set.code, Set.scry, case-insensitive
export declare function getCatalogStats(): Promise<CatalogStats>;                                    // P status.json counts + meta/sets.json
/** P slug/<h> -> cat/<b>, px/<b> (+ un/<b>, of/<b> when the mask says tracked) + or/<n> + meta/sets + ss/runs: 6 to 8 files, 139 KB median cold. null for an unknown slug; a miss is never cached. Works for unlisted rows. */
export declare function getCardDetail(slug: string): Promise<CardDetail | null>;
export declare function getOracleBySlug(slug: string): Promise<OracleDetail | null>;                   // P slug/<h> (oracle part) -> or/<no % 512>; about 0.5 KB
export declare function getOraclePrintings(oracleNo: number, page?: number, per?: 24 | 48): Promise<{ total: number; items: CardMini[] }>;   // M engine: cls 0 and LISTED, marketUsd desc, nulls last
export declare function getSetHighlights(setId: number, n?: number): Promise<CardMini[]>;           // P st/<setId>.json; n <= 12
/** Fan-in by bucket: P cat/px (+ un) of the distinct buckets (floor(id / 256)); more than 9 buckets reads the browse index (M). Misses are absent from the map. <= 2,000 ids. Per-user class: /api/* and account pages. */
export declare function getCardsByIds(ids: readonly number[], opts?: { stores?: boolean }): Promise<Map<number, CardLite>>;
export declare function getCardLookup(q: { ids?: readonly number[]; slugs?: readonly string[] }): Promise<CardLookup>;   // <= 500 ids + 500 slugs; never throws on a miss
export declare function resolveOracles(nameKeys: readonly string[]): Promise<Map<string, OracleMini>>;   // P nm/<k> (the hot chunk first), <= 300 keys
export declare function resolveBySetNumber(pairs: readonly { set: string; number: string }[]): Promise<Map<string, CardLite[]>>;   // P sc/<h> then cat/px; key "<sc>|<nkey>"; 1 to 3 cards per pair
export declare function cardExists(ids: readonly number[]): Promise<Set<number>>;                    // P cat/<b> for the buckets meta/buckets.json lists (an unknown id costs no request): user-state validation, replaces a foreign key
export declare function sealedExists(ids: readonly number[]): Promise<Set<number>>;                  // P sl/list-<k>
/** Server-only: the typed-array engine, one per instance and ref (M). The replacement for every "scan cat.cards" caller. Resolve it BEFORE a closure that an unstable_cache wraps. */
export declare function getBrowseIndex(o?: { withStores?: boolean; withOracle?: boolean }): Promise<BrowseIndex>;
/** @deprecated TRANSITION SHIM (src/lib/data/catalog-shim.ts): every LISTED class-0 row from the browse index, 5-minute memo, one console.warn per process, REFUSES in a production deployment. Deleted at M3 (ratchet: tests/no-get-catalog.test.ts). */
export declare function getCatalog(): Promise<Catalog>;

// ── history.ts (WP02): readers of the hist/ files; all P ─────────────────────────────────────────────────────────────────────
export declare const RECENT_HISTORY_MAX_IDS: 500;
/** hist/p base bucket (floor(id / 64)) + hist/t tail (floor(id / 512)), merged by mergeTail; default 365 days; [] for an untracked unit (the mask says so: no request). OP's getProductHistory(id) is DELETED: a call without a finish cannot exist. */
export declare function getUnitHistory(unit: UnitRef, days?: number): Promise<HistoryPoint[]>;
export declare function getSparklines(units: readonly UnitRef[], days?: number): Promise<Record<string, number[]>>;   // <= 48 units, key UnitKey, <= 30 points
export declare function getRecentHistory(units: readonly UnitRef[]): Promise<Map<string, Map<number, number>>>;   // <= 500 units; the last 120 days; batches of 16 files; key UnitKey -> dayMs -> cents
export declare function getIndexSeries(): Promise<IndexPoint[]>;                                       // hist/index.json, newest 730 days
export declare function getRecentlyUpdated(n?: number): Promise<{ card: CardLite; pct: number }[]>;   // mv/recent.json (the 24 largest changes between the last two days) -> getCardsByIds

// ── lists.ts (WP07) ───────────────────────────────────────────────────────────────────────────────────────────────────
export declare function getCardPage(q: Partial<CardQuery>): Promise<CardPage>;                       // M engine: canonicalQuery(q) -> BrowseIndex.query; 1 to 5 ms once built. MARKET-ONLY sorts and ranges: a low-only unit never tops `value`
export declare function getMovers(o: { dir: "up" | "down"; window: 7 | 30; finish?: Finish; minCents?: number; setId?: number; n?: number }): Promise<CardLite[]>;   // P mv/<dir>-<w>-<a|n|f>.json when setId is absent (n <= 100), else the engine
export declare function getNewestCards(n?: number): Promise<CardLite[]>;                            // M engine, newest set first; n <= 100
export declare function getOracleAZ(letter: string, page: number): Promise<{ total: number; items: OracleMini[] }>;   // P nm/<k>; 100 per page

// ── search.ts (WP07) ──────────────────────────────────────────────────────────────────────────────────────────────────
export declare function getNameIndex(): Promise<NameIndexEntry[]>;                                  // P nm/0 (the top 8,000 oracles, hottest first): 480 KB
export declare function getNameTail(qn: string): Promise<NameHit[]>;                                // P nm/<k> beyond the hot chunk; the cached TAIL loader (<= 24 hits). `readNameTail` is the uncached helper inside it
export declare function searchNames(q: string, limit?: number): Promise<NameHit[]>;                 // hot index scan in memory, then getNameTail
export declare function searchCards(q: string, o?: Partial<CardQuery>): Promise<CardPage>;          // parseSearch (pure), then getCardPage

// ── facets.ts (WP08) ──────────────────────────────────────────────────────────────────────────────────────────────────
export interface KeywordRow { slug: string; label: string; count: number }                         // count = oracles
export declare function getKeywordIndex(): Promise<KeywordRow[]>;                                    // P ix/odict.json keyword dictionary + ix/o counts
export declare function getKeywordPage(slug: string, page: number, per?: 24 | 48 | 100): Promise<{ keyword: KeywordRow | null; total: number; items: OracleMini[] }>;
export declare function getFacetCounts(): Promise<{ rarity: Record<string, number>; type: Record<string, number>; treat: Record<string, number>; color: Record<string, number> }>;   // M engine, one pass, LISTED class 0

// ── commanders.ts (WP11) ──────────────────────────────────────────────────────────────────────────────────────────────
export declare function getCommanderPage(o: { identity?: number; q?: string; page: number; per: 24 | 48 | 100 }): Promise<{ total: number; pages: number; items: OracleMini[] }>;   // ORACLE_FLAGS.COMMANDER over ix/o + nm
export declare function getCommanderBySlug(slug: string): Promise<{ oracle: OracleDetail; printings: CardMini[]; decks: LibraryDeckRow[] } | null>;   // oracle P; decks N (empty when Neon is down)

// ── sealed.ts (WP09) ──────────────────────────────────────────────────────────────────────────────────────────────────────
export interface SealedLite { id: number; slug: string; name: string; setId: number | null; kind: SealedKind; packCount: number | null; releasedOn: string | null; presale: boolean; marketUsd: number | null; lowTcg: number | null; low: Record<Country, number | null>; stores: Record<Country, number>; change7d: number | null }   // imageUrl and tcgplayerUrl are DERIVED from id (images.ts, constants.ts)
export interface SealedDetail extends SealedLite { contents: string | null; offers: OfferRow[] }   // finish is always "N"; offers = store/feed rows + the synthesised TCGplayer row
export interface SealedQuery { kind?: SealedKind; setId?: number; presale?: boolean; q?: string; sort: "value" | "price-asc" | "price-desc" | "newest" | "name"; page: number; per: 24 | 48 | 100 }
export declare function getSealedPage(q: Partial<SealedQuery>): Promise<{ total: number; pages: number; page: number; items: SealedLite[] }>;   // P sl/list-<k> (2 chunks, 330 KB each) filtered in memory (M). OP's getSealedCatalog is REMOVED
export declare function getSealedBySet(setId: number): Promise<SealedLite[]>;                       // <= 200 rows (Secret Lair Drop: 1,077 -> 200 + total)
export declare function getSealedByIds(ids: readonly number[]): Promise<Map<number, SealedLite>>;
export declare function getSealedDetail(slug: string): Promise<SealedDetail | null>;                 // P slug/<h> (sealed part) -> sl/d/<fnv1a32(slug) % 64>.json
export declare function getSealedSoldOut(): Promise<Record<Country, number[]>>;                      // P sl/list: GONE and no in-stock offer, per market

// ── deals.ts (WP13): THE PAID LIST OF DEAL FINDER (Plus and Premium; free preview 3 rows, anonymous none) ──────────────────────────────────────────────
export declare const BASKET_ID_CHUNK: 40;
export interface DealRow { uid: number; buyCents: number; marketCents: number; belowCents: number; belowPct: number; storeId: number; source: string; market: Country }
/** R key [deal-rank-v1, ref, country, sort, buyKeysHash]: the FULL ranking from the index columns (ix/k, ix/p, ix/s, ix/f; 1 to 3 ms, about 70 KB), tier-neutral. The slice is cut AFTER `who` is read: anonymous 0 rows, free 3, plus and premium the page;
 *  a below-full viewer is always served the DEFAULT view (refinements coerced, `coerced` true, the API answers 402). Replaces getDealInputs, getStoreMins and getDealRankById. eBay is never in this list. */
export declare function getDealList(country: Country, q: Partial<DealQuery>, who: Entitlement): Promise<Sliced<DealRow>>;
export declare function getDealCount(country: Country): Promise<number>;                           // free: the NUMBER only (the home page, the upsell line): P hm/home.json dealCounts
export interface DealOfferDetail { uid: number; stores: { storeId: number; source: string; priceCents: number; url: string; condition: Condition | null }[]; ebay: { priceCents: number; shippingCents: number | null; url: string; checkedAt: string }[]; tcgplayerUrl: string }
export declare function getDealOffers(country: Country, uids: readonly number[]): Promise<DealOfferDetail[]>;   // <= 25 units: P of/<b>; ebay[] from Neon (EbayBest) when it answers, else []
export type BasketListingTuple = [uid: number, source: string, priceCents: number, condition: number | null, url: string];
export declare function getBasketListings(country: Country, uids: readonly number[]): Promise<BasketListingTuple[]>;   // P of/<b> for <= 40 uids, cheapest 60 per product; freshness by ss/runs.json

// ── demand.ts (WP07): RISING CARDS AND DEMAND FINDER (Premium; free preview slices). The counters live in Neon only; nothing ranked is a published file except the two clear preview slices pv/*. ────────────────────────
export interface DemandPick { card: CardLite & { setCode: string }; searches: number; views: number; move: Movement | null }
export interface DemandResult {
  bySearch: DemandPick[]; byView: DemandPick[]; windowUsable: boolean; coveredDays: number | null; totalDays: number; failed?: boolean; previous: { startDay: string; endDay: string; coveredDays: number } | null;
  access: Access; locked: boolean; limit: number;                            // below full: the 7-day top-10-by-search preview (pv/demand.json) for everyone, byView empty, other windows empty
}
/** N (Neon CardStat + DemandDay) behind a tier-neutral R entry [demand-v1, ref, days]; the preview is P pv/demand.json. Never throws: a failure is an empty result with `failed`. */
export declare function getTopDemand(days: DemandWindowDays, who: Entitlement, limit?: number): Promise<DemandResult>;
/** The free strip of /movers and the tools hub: the top 10 most searched cards over 7 days, identical for every viewer (a cached public page), read from the CLEAR preview slice pv/demand.json and hydrated with getCardsByIds. Never Neon, never a views column. P. */
export declare function getDemandStrip(): Promise<{ at: string; rows: { card: CardLite & { setCode: string }; searches: number }[] }>;
/** The Rising Cards teaser of a cached public page (home, tools hub): at most 3 picks per scope from the clear slice pv/rising.json. Never Neon. P. */
export declare function getRisingTeaser(scope: RiseScope): Promise<RisePreviewRow[]>;
/** ADMIN and the demand job only (Neon DemandDay). Throws when the window is not covered (OP's guard). `ref` is the data commit. */
export declare function demandWindowAtOrThrow(ref: string, days: number, opts?: { previous?: boolean }): Promise<DemandWindowResult>;
export interface RisePreviewRow { id: number; slug: string; name: string; reason: string }
export type RiseResult =
  | { access: "full"; locked: false; limit: number; failed: boolean; analysis: RiseAnalysis }
  | { access: "preview" | "none"; locked: true; limit: number; failed: boolean; preview: RisePreviewRow[] };            // below full there is no `analysis` property to read: the type itself is the gate (pv/rising.json, <= 3 rows per scope)
/** R [rise-v1, ref, day, scope]: assembleRisingCards over hist/w (public weekly closes) + the Neon counters, cached tier-neutral and cut after `who`. THE one Rising Cards entry point (never wrap it, never call it inside an unstable_cache callback). */
export declare function getCachedRisingCards(scope: RiseScope, who: Entitlement): Promise<RiseResult>;
export declare function getRisingWeekAgo(scope: RiseScope, who: Entitlement): Promise<WeekAgoRanking | null>;   // full access only; null otherwise or when it cannot be rebuilt
/** N: the frozen JSON of a minted Hot 40 (/rising/[token]); whoever has the link sees it (a snapshot is a shared page, not a paid read). */
export declare function getRisingSnapshot(token: string): Promise<{ title: string; data: RisingSnapshotData; createdAt: string } | null>;

// ── stores.ts (WP04) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface StoreStat { source: string; market: string; offers: number; inStock: number; singlesInStock: number; sealedInStock: number; cheapest: number }
export declare function getStoreStats(): Promise<StoreStat[]>;                                       // P ss/runs.json (4 KB); store ids -> source keys through the registry
export type StoreListing = [uid: number, priceCents: number, condition: Condition | null, url: string];   // uid instead of productId (the finish is part of the unit); url = offerUrl(storeId, market, path)
export interface StoreListings { top: StoreListing[]; cheapestHere: StoreListing[] }
export declare function getStoreListings(source: string, market: string): Promise<StoreListings>;   // P ss/l/<store>-<market>.json, 4 KB
/** Pure; kept byte for byte from OP. The importer's board builder and tests/set-checklist.test.ts use it: the cheapest store price and the distinct store count per product. */
export declare function foldStoreRows(rows: readonly { productId: number; _min: { priceCents: number | null } }[]): Map<number, { minCents: number; stores: number }>;

// ── decks.ts (WP10): user content, N; they degrade to empty when Neon is down ──────────────────────────────────────────────────────────────────
export interface LibraryDeckRow { id: string; slug: string; title: string; authorName: string | null; commanderName: string; commanderSlug: string; commanderCardId: number; partnerCardId: number | null; identity: number; lines: { cardId: number; qty: number; finish?: Finish }[]; cardCount: number; publishedTotals: Partial<Record<Country, number | null>>; createdAt: string }
export declare const LIBRARY_DECKS_MAX: 200;
export declare function getLibraryDecks(): Promise<LibraryDeckRow[]>;                               // N tag DECKS_TAG; THROWS inside the cache (a failed read is never stored as an empty library), pages catch outside
export declare function getPublishedDeck(slug: string): Promise<LibraryDeckRow | null>;             // N
export declare function getDecksUsingCard(cardId: number): Promise<{ slug: string; title: string; commanderName: string }[]>;   // N

// ── sets.ts (WP12) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export declare const SET_CHECKLIST_CHUNK: 2000;
export declare function getSetChecklist(setId: number, market: Country): Promise<ChecklistCard[]>;   // P st/<setId>[-k].json in collector order (nsort); <= 6,000 cards
export declare function getUpcomingSets(n?: number): Promise<SetLite[]>;                              // derived from getSets()
export declare function getSetValueStats(): Promise<Map<number, { n: number; totalCents: number }>>;  // from mk/overview.json
export declare function getBoxPools(setId: number): Promise<CardMini[]>;                              // P st/<setId>.json: the listed singles of the set with prices (Box EV)

// ── home.ts (WP15) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface HomeTile { id: number; slug: string; name: string; setCode: string; number: string | null; rarity: string; flags: number; headFinish: Finish; marketUsd: number | null }
export interface HomeFeed { at: string; stats: { cards: number; tracked: number; sets: number; sealed: number; oracles: number }; newest: SetLite[]; upcoming: SetLite[]; chase: HomeTile[]; popular: HomeTile[]; up: HomeTile[]; down: HomeTile[]; dealCounts: Record<Country, number>; dealsFree: Record<Country, (HomeTile & { buyCents: number; belowPct: number }) | null> }
export declare function getHomeFeed(): Promise<HomeFeed>;                                            // P hm/home.json (8 KB) + meta/sets.json; free-safe by construction (one deal per market, counts)
export declare function getPopular(n?: number): Promise<HomeTile[]>;                                // P hm/home.json popular tiles (EDHREC rank, then market); never reordered by a Neon counter
export interface MarketOverview { at: string; basket: { n: number; totalUsd: number; avg: number; median: number }; advancing: number; declining: number; constituents: { id: number; slug: string; name: string; cents: number }[]; sets: { setId: number; n: number; totalCents: number }[] }
export interface MarketRecords { gaps: { card: CardLite; finish: Finish; home: number; away: Country; awayCents: number; awayConverted: number; saving: number; pct: number }[]; highs: { card: CardLite; finish: Finish; cents: number; high90: number }[]; lows: { card: CardLite; finish: Finish; cents: number; high90: number; pctBelow: number }[] }
export declare function getMarketOverview(): Promise<MarketOverview>;                                 // P mk/overview.json: replaces the whole-catalogue scan of /market
export declare function getMarketRecords(home: Country): Promise<MarketRecords>;                      // P mk/records.json (stores only, free) + getCardsByIds for the 40 cards

// ── sitemap.ts (WP15) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export declare const SITEMAP_SECTION_SIZE: 10_000;                                                         // far below the 50,000-URL / 50 MB protocol cap; a test asserts <= 50_000
export type SitemapKind = "static" | "sets" | "sealed" | "commanders" | "names" | "cards";
export interface SitemapPlan { static: number; sets: number; sealed: number; commanders: number; names: number; cards: number }   // URL counts
export declare function getSitemapPlan(): Promise<SitemapPlan>;                                       // P sm/plan.json. Sitemaps are ROUTE HANDLERS that set publicDataHeaders(), never sitemap.ts (Next doubles the Cache-Control of a metadata route)
export declare function getSitemapSection(kind: SitemapKind, index: number): Promise<string[]>;      // P sm/<kind>-<n>.json, <= SITEMAP_SECTION_SIZE paths

// ── site.ts (WP18) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface SiteStats { lastImportAt: string | null; storeOffers: { source: string; market: string; offers: number; inStock: number }[]; ebayLive: boolean }   // ebayLive is the one Neon bit (ImportRun kind "ebay" within 3 days); false when Neon is down
export declare function getSiteStats(): Promise<SiteStats>;                                           // P status.json + ss/runs.json
export declare function getHomeStats(): Promise<HomeStats>;                                          // P hm/home.json + ss/runs.json
export declare const MIN_REVIEWS_TO_DISPLAY: 3;
export interface PublicReview { id: string; rating: number | null; message: string; displayName: string | null }
export declare function getApprovedReviews(limit?: number): Promise<PublicReview[]>;                // N; [] on any error. Never widen the select to `email`
export declare function getLaunchPromo(): Promise<PromoStatus>;                                       // N Counter launch-promo; { left: 0 } when Neon is down

// ── email.ts (WP14) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export declare function getEmailStatus(): Promise<"on" | "off">;                                      // environment only

// ── ebay.ts (WP05): Neon only. eBay data is never a published file (licence). ───────────────────────────────────────────────────────────────────────
export interface EbayPanelBundle { best: { finish: Finish; market: Country; priceCents: number; shipCents: number | null; itemId: string; checkedAt: string }[]; listings: PanelListing[]; graded: PanelGraded[] }   // PanelListing / PanelGraded live in listing-panel.ts (tests/no-ebay-api.test.ts forbids a non-ebay*.ts file importing an ebay*.ts module)
export declare function getEbayPanel(productId: number): Promise<EbayPanelBundle>;                  // N tag EBAY_BANNER_TAG; callers call it ONLY when CardDetail.tracked != 0; an empty bundle when Neon is down
export interface BannerTile { id: number; name: string; image: string | null; cents: number; ship: boolean | null; market: Country; itemId: string; checkedAt: string }
export interface BannerPayloadV1 { v: 1; builtAt: number; tiles: BannerTile[] }                   // <= 100 KB, asserted
export declare function getChaseBanner(): Promise<BannerPayloadV1 | null>;                          // N EbayBanner row; the chase POOL is public (hm/home.json chase), the listings are not; null -> plain affiliate search tiles. getEbayPicks and getChaseStrip are REMOVED
