// The import: read every store's Pokémon sealed listings and replace the
// current state in the database. Runs from scripts/import.ts (GitHub Actions),
// never on a request path — it reads whole tables on purpose (src/lib/db.ts).
//
// Per store, in order:
//   1. Currency guard — the store must charge in its market's currency, or
//      nothing it lists is written (a C$ price must never render as US$).
//   2. Read its configured collections, passing ?country= so a Shopify
//      Markets store answers in its own currency (see shopifyMeta in feeds.ts).
//      If every configured collection has gone, rediscover from its sitemap.
//   3. identify() every title (src/lib/sealed-title.ts) and keep the store's
//      best listing per product: in stock first, then cheapest, and never below
//      the product type's price floor.
//   4. Only after a SUCCESSFUL read are the store's rows replaced. A failed
//      read keeps the old rows, which age into "unknown" after 72 hours. So
//      does a read cut off part-way, or one with under half the listings the
//      store had last time, unless the run before saw the same (guardReads).
//
// TCGplayer (src/lib/tcgplayer.ts) is read the same way as one more US source:
// its catalogue comes back as FeedProducts and goes through the same identify(),
// floors and one-row-per-product rule, and a failed read keeps its rows too.
//
// Then every product's per-market summary (ProductStat) and every store's
// health (StoreStat) is recomputed from the stored offers.
import { createHash } from "node:crypto";
import { prisma } from "./db";
import {
  isPokemonCollection,
  rankCollections,
  readShopifyCollection,
  readWooCategory,
  shopifyMeta,
  sitemapCollections,
  wooCategories,
  type CollectionRead,
  type FeedProduct,
} from "./feeds";
import { RateLimitedError, REQUEST_DELAY_MS, SCRAPE_HEADERS, sleep } from "./scrape-http";
import { usMsrpCents } from "./rrp";
import { canonicalName, cleanName, floorCents, identify, isIdentity, roughUsdCents, slugify, type SealedIdentity, type TypeKey } from "./sealed-title";
import { headlineOffer, offerStock } from "./sealed-offers";
import { SOURCES, STORE_BY_KEY, isMarketplace, storeCurrency, type StoreConfig } from "./stores";
import { isTcgImage, readTcgplayerCatalogue, tcgFeedProducts, tcgImageExists } from "./tcgplayer";

export interface ImportRow {
  identity: SealedIdentity;
  title: string;
  url: string;
  priceCents: number;
  inStock: boolean;
  imageUrl: string | null;
  imageArea?: number; // pixels, when the feed said (feeds.ts)
}

export interface StoreRead {
  store: StoreConfig;
  ok: boolean;
  error: string | null;
  rows: ImportRow[];
  products: number; // feed products read, before identify()
  rediscovered: boolean;
  ms: number;
  // Why an ok read may be incomplete (a feed cut off part-way); guardReads
  // decides whether its rows may replace the store's current ones.
  partial?: string;
}

// The photo HEAD sweep (sweepImages) runs 4 at a time for at most this long.
const IMAGE_SWEEP_MAX_MS = 5 * 60_000;
const MAX_PAGES = 8; // per collection: 2,000 products
const OFFER_TTL_DAYS = 14; // an offer not re-read for this long is deleted
// An in-stock price below 25% of the product's IN-STOCK median in that market
// is a mislisting (a pack filed as a box, a deposit variant). Not tighter: for
// out-of-print sets, one store selling old stock at the original price next to
// others asking collector prices is real, and it's the deal people want.
const LOW_OUTLIER = 0.25;
// The high side (dropHighOutliers), for STORE rows only: an in-stock price over
// this many times the product's in-stock median in the market is a lot the
// title didn't admit to ("Booster Pack x 50 (LIVE)" at 50x, a "Pack Bundle" at
// 53x) or a display filed as a unit. Small products are the ones sold by the
// handful, so they get the wider bar; a box, ETB or collection is only judged
// while its set is recent (HIGH_OUTLIER_MAX_AGE_DAYS) — an out-of-print box
// really can ask 3x the next store's old stock.
const HIGH_OUTLIER: Partial<Record<TypeKey, number>> = {
  "booster-pack": 4,
  "sleeved-booster": 4,
  blister: 4,
  "booster-bundle": 4,
  "build-battle": 4,
  "booster-box": 3,
  etb: 3,
  "pc-etb": 3,
  collection: 3,
};
const HIGH_OUTLIER_RECENT_ONLY = new Set<TypeKey>(["booster-box", "etb", "pc-etb", "collection"]);
const HIGH_OUTLIER_MAX_AGE_DAYS = 548; // 18 months
// A store whose in-stock prices sit under this share of the market median on
// SUSPECT_STORE_MIN products isn't selling at those prices: it shows "in stock"
// at the old MSRP on product that has long gone (tcgcarddepot listed 39 such
// products). Its rows are kept, as sold out, for the run.
const SUSPECT_STORE_SHARE = 0.5;
const SUSPECT_STORE_MIN = 5;
// …and that is a pattern only when it is a fifth or more of what the store has
// in stock at a comparable price: a genuinely cheap store (5 of 99 rows under
// half the median — shopverse, measured 2026-09) is a discounter, not a stale
// feed, and must not be flipped to sold out wholesale (and then to dormant).
// tcgcarddepot: 41 of 101.
const SUSPECT_STORE_MIN_RATE = 0.2;
// A TCGplayer ask on an UNRELEASED set over this many times TPCi's US MSRP is a
// pre-release placeholder ($449.99 for a $59.99 PC ETB), not a price anyone
// will pay: the stores' pre-orders are at or near MSRP. Released sets keep
// every ask; there the market is the price.
const PRE_RELEASE_MSRP_MULTIPLE = 3;
// A store with this many listings and none in stock at the end of a run is
// dormant (see StoreStat.dormant); its rows don't count as "listed by".
const DORMANT_MIN_LISTED = 20;
// A marketplace ask over this multiple of what the stores ask for the same
// product (see dropPlaceholderAsks) is a placeholder, not a price. Generous on
// purpose: stores' sold-out listings often still show the original retail
// price, and out-of-print product really does sell for many times that on
// TCGplayer (a Fates Collide booster box at 4.5x, old checklanes at 5–9x).
// Measured 2026-09-28 over the 1,578 TCGplayer offers: the four asks over 20x
// were all placeholders ($188,888.88 for a Burning Shadows case, $1,203 for a
// blister the stores list at ~$14).
const MARKETPLACE_HIGH = 20;
// A case over this many times the same marketplace's price for one of the
// set's units is a placeholder. A real case holds 6–25 units (booster bundle
// cases, 25, list at 20–36x a bundle); the two over 60x asked 100x and 136x.
const CASE_MAX_UNITS = 60;
const CASE_UNIT: Partial<Record<TypeKey, TypeKey>> = { "booster-box-case": "booster-box", "etb-case": "etb", "booster-bundle-case": "booster-bundle" };
// A marketplace read that comes back with fewer than this share of the offers
// it had last time is broken (a short catalogue that still looked whole),
// unless it had only a handful to begin with.
const COVERAGE_FLOOR = 0.7;
const COVERAGE_MIN_ROWS = 50;
// The same for a store, looser: stores do clear out stock. What this catches
// is a store whose main collection failed while a small side collection (a
// pre-order page, one set's collection) read fine — 243 listings became 16.
const STORE_COVERAGE_FLOOR = 0.5;
const STORE_COVERAGE_MIN_ROWS = 20;
const COVERAGE_ERROR = "coverage dropped";
const CUT_OFF_ERROR = "feed cut off";

// A variant that is several of the product ("Display (10)", "Case of 6",
// "3 x", "Booster Box" on a pack listing) — stores sell singles and multiples
// as options of one listing, and the multiple's price is not the product's.
const MULTI_VARIANT = /\bdisplays?\b|\bcases?\b|\bbox\s*of\b|\bsets?\s*of\b|\bbundle\b|\blot\b|\bbooster\s*box\b|\b(?:[2-9]|[1-9]\d)\s*x\b|\bx\s*(?:[2-9]|[1-9]\d)\b|\b(?:[2-9]|[1-9]\d)\s*(?:packs?|tins?|boxes|units?|pcs|pieces)\b|\bfull\s*(?:set|case)\b|\ball\s*\d/i;

/** Pick the price a product lists at: the cheapest orderable variant at or above the floor. */
export function priceOf(p: FeedProduct, floor: number): { priceCents: number; inStock: boolean } | null {
  // With several options, drop the multi-unit ones. A single variant is the
  // product itself, whatever its (often "Default Title") name says.
  const single = p.variants.length > 1 ? p.variants.filter((v) => !v.title || !MULTI_VARIANT.test(v.title)) : p.variants;
  const priced = single.filter((v) => v.priceCents > 0);
  if (!priced.length) return null;
  const avail = priced.filter((v) => v.available);
  const inStock = avail.length > 0;
  const pool = (inStock ? avail : priced).filter((v) => v.priceCents >= floor);
  if (!pool.length) return null;
  return { priceCents: Math.min(...pool.map((v) => v.priceCents)), inStock };
}

/** Is `a` a better listing of the same product than `b`? In stock beats sold out, then cheaper wins. */
function better(a: ImportRow, b: ImportRow): boolean {
  if (a.inStock !== b.inStock) return a.inStock;
  return a.priceCents < b.priceCents;
}

export function rowsFromReads(store: StoreConfig, reads: CollectionRead[]): ImportRow[] {
  const best = new Map<string, ImportRow>();
  const seen = new Set<string>();
  for (const r of reads) {
    const strict = !isPokemonCollection(r.handle) && !r.handle.startsWith("search:");
    for (const p of r.products) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const id = identify(p.title, { strict });
      if (!isIdentity(id)) continue;
      const price = priceOf(p, floorCents(id.type, store.market));
      if (!price) continue;
      const row: ImportRow = { identity: id, title: p.title, url: p.url, imageUrl: p.imageUrl, ...price };
      if (p.imageWidth && p.imageHeight) row.imageArea = p.imageWidth * p.imageHeight;
      const prev = best.get(id.groupKey);
      if (!prev || better(row, prev)) best.set(id.groupKey, row);
    }
  }
  return [...best.values()];
}

async function readShopifyStore(store: StoreConfig): Promise<{ reads: CollectionRead[]; rediscovered: boolean; error: string | null }> {
  const expected = storeCurrency(store);
  const meta = await shopifyMeta(store.base, store.country);
  if (meta.currency && meta.currency !== expected) {
    return { reads: [], rediscovered: false, error: `store now charges ${meta.currency}, market ${store.market} is ${expected}` };
  }
  const reads: CollectionRead[] = [];
  for (const handle of store.collections) {
    await sleep(REQUEST_DELAY_MS);
    reads.push(await readShopifyCollection(store.base, handle, { country: store.country, maxPages: MAX_PAGES }));
  }
  if (reads.some((r) => r.ok && r.products.length)) return { reads, rediscovered: false, error: null };
  // Every configured collection is gone or empty: the store renamed them.
  const found = rankCollections(await sitemapCollections(store.base)).slice(0, 4);
  for (const handle of found) {
    await sleep(REQUEST_DELAY_MS);
    reads.push(await readShopifyCollection(store.base, handle, { country: store.country, maxPages: MAX_PAGES }));
  }
  return { reads, rediscovered: found.length > 0, error: null };
}

async function readWooStore(store: StoreConfig): Promise<{ reads: CollectionRead[]; rediscovered: boolean; error: string | null }> {
  const expected = storeCurrency(store);
  const cats = await wooCategories(store.base);
  const ids = new Map(cats.map((c) => [c.slug, c.id]));
  const reads: CollectionRead[] = [];
  for (const slug of store.collections) {
    await sleep(REQUEST_DELAY_MS);
    reads.push(await readWooCategory(store.base, slug, ids, MAX_PAGES));
  }
  let rediscovered = false;
  if (!reads.some((r) => r.ok && r.products.length)) {
    reads.push(await readWooCategory(store.base, "search:pokemon", ids, MAX_PAGES));
    rediscovered = true;
  }
  const wrong = reads.flatMap((r) => r.products).find((p) => p.currency && p.currency !== expected);
  if (wrong) return { reads: [], rediscovered, error: `store now charges ${wrong.currency}, market ${store.market} is ${expected}` };
  return { reads, rediscovered, error: null };
}

async function readTcgplayer(): Promise<{ reads: CollectionRead[]; rediscovered: boolean; error: string | null }> {
  // The catalogue is TCGplayer's Pokémon product line, so its titles are read
  // like a store's Pokémon collection: they needn't say "Pokémon".
  const products = tcgFeedProducts(await readTcgplayerCatalogue());
  return { reads: [{ handle: "pokemon", ok: true, products }], rediscovered: false, error: null };
}

export async function readStore(store: StoreConfig): Promise<StoreRead> {
  const t0 = Date.now();
  try {
    const { reads, rediscovered, error } =
      store.platform === "tcgplayer"
        ? await readTcgplayer()
        : store.platform === "woocommerce"
          ? await readWooStore(store)
          : await readShopifyStore(store);
    const products = reads.reduce((n, r) => n + r.products.length, 0);
    if (error) return { store, ok: false, error, rows: [], products, rediscovered, ms: Date.now() - t0 };
    // An empty read (every collection 404, a block page, a timeout) is a
    // failure, not "the store sold everything": keep yesterday's rows.
    if (!reads.some((r) => r.ok) || products === 0) {
      return { store, ok: false, error: "no products read", rows: [], products, rediscovered, ms: Date.now() - t0 };
    }
    // A feed that failed part-way (a timeout or 5xx on page 2+) looks like a
    // small, healthy catalogue. guardReads decides whether to trust it.
    const cut = reads.find((r) => r.truncatedAtPage);
    const partial = cut ? `${CUT_OFF_ERROR} at page ${cut.truncatedAtPage} of ${cut.handle}` : undefined;
    return { store, ok: true, error: null, partial, rows: rowsFromReads(store, reads), products, rediscovered, ms: Date.now() - t0 };
  } catch (e) {
    const error = e instanceof RateLimitedError ? `rate limited: ${e.message}` : (e as Error).message || String(e);
    return { store, ok: false, error, rows: [], products: 0, rediscovered: false, ms: Date.now() - t0 };
  }
}

/**
 * Drop in-stock rows priced far below the other stores' price for the same
 * product in the same market — a pack filed as a box, a deposit variant. Needs
 * three or more listings to have a median worth trusting.
 */
export function dropLowOutliers(reads: StoreRead[]): number {
  const prices = new Map<string, number[]>();
  for (const r of reads)
    for (const row of r.rows) {
      if (!row.inStock) continue; // sold-out asks aren't a market
      const k = `${r.store.market}|${row.identity.groupKey}`;
      (prices.get(k) ?? prices.set(k, []).get(k)!).push(row.priceCents);
    }
  const median = new Map<string, number>();
  for (const [k, v] of prices) {
    if (v.length < 3) continue;
    const s = [...v].sort((a, b) => a - b);
    median.set(k, s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2);
  }
  let dropped = 0;
  for (const r of reads) {
    r.rows = r.rows.filter((row) => {
      const m = median.get(`${r.store.market}|${row.identity.groupKey}`);
      if (m != null && row.inStock && row.priceCents < m * LOW_OUTLIER) {
        dropped++;
        console.warn(`  outlier dropped: ${r.store.key} "${row.title}" ${row.priceCents} vs median ${m}`);
        return false;
      }
      return true;
    });
  }
  return dropped;
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/** In-stock median per market × product from the STORES' rows, where three or more stores have it. */
function inStockMedians(reads: StoreRead[]): Map<string, number> {
  const prices = new Map<string, number[]>();
  for (const r of reads) {
    if (isMarketplace(r.store)) continue;
    for (const row of r.rows) {
      if (!row.inStock) continue;
      const k = `${r.store.market}|${row.identity.groupKey}`;
      (prices.get(k) ?? prices.set(k, []).get(k)!).push(row.priceCents);
    }
  }
  const out = new Map<string, number>();
  for (const [k, v] of prices) if (v.length >= 3) out.set(k, median(v));
  return out;
}

function ageDays(releaseDate: string | undefined, today: Date): number {
  return releaseDate ? (today.getTime() - Date.parse(releaseDate)) / 86400_000 : Infinity;
}

/**
 * Drop a store's in-stock rows priced far ABOVE the other stores' in-stock
 * price for the same product in the same market (HIGH_OUTLIER): a lot or a
 * display the title didn't say. Marketplace rows are judged by
 * dropPlaceholderAsks instead. Needs three or more in-stock listings.
 */
export function dropHighOutliers(reads: StoreRead[], today = new Date()): number {
  const medians = inStockMedians(reads);
  let dropped = 0;
  for (const r of reads) {
    if (isMarketplace(r.store)) continue;
    r.rows = r.rows.filter((row) => {
      const bar = HIGH_OUTLIER[row.identity.type];
      const m = medians.get(`${r.store.market}|${row.identity.groupKey}`);
      if (bar == null || m == null || !row.inStock || row.priceCents <= m * bar) return true;
      if (HIGH_OUTLIER_RECENT_ONLY.has(row.identity.type) && ageDays(row.identity.set?.releaseDate, today) > HIGH_OUTLIER_MAX_AGE_DAYS) return true;
      dropped++;
      console.warn(`  high outlier dropped: ${r.store.key} "${row.title}" ${row.priceCents} vs median ${m} (${bar}x)`);
      return false;
    });
  }
  return dropped;
}

/**
 * Stores whose "in stock" can't be believed: SUSPECT_STORE_MIN or more of
 * their in-stock prices (and SUSPECT_STORE_MIN_RATE of those with a market
 * median to compare with) sit under SUSPECT_STORE_SHARE of the market's in-stock
 * median. Every row of such a store is written as sold out this run (the
 * listing and its price stay on the page, ranked with the other sold-out ones).
 * Runs before dropLowOutliers, which would otherwise delete the worst of them
 * and leave the rest counted as the cheapest in stock.
 */
export function demoteSuspectStores(reads: StoreRead[]): { store: string; low: number }[] {
  const medians = inStockMedians(reads);
  const demoted: { store: string; low: number }[] = [];
  for (const r of reads) {
    if (isMarketplace(r.store)) continue;
    let low = 0;
    let judged = 0;
    for (const row of r.rows) {
      const m = medians.get(`${r.store.market}|${row.identity.groupKey}`);
      if (m == null || !row.inStock) continue;
      judged++;
      if (row.priceCents < m * SUSPECT_STORE_SHARE) low++;
    }
    if (low < SUSPECT_STORE_MIN || low < judged * SUSPECT_STORE_MIN_RATE) continue;
    for (const row of r.rows) row.inStock = false;
    demoted.push({ store: r.store.key, low });
    console.warn(`  suspect stock: ${r.store.key} has ${low} in-stock prices under half the market median; its rows are written as sold out`);
  }
  return demoted;
}

/**
 * Drop a marketplace's (TCGplayer's) placeholder asks. tcgplayer.ts skips an
 * ask over three times TCGplayer's own market price, but most older products
 * have no market price, and their only seller may ask $188,888.88 for a
 * Burning Shadows booster box case. Two checks, both for marketplace rows only:
 *
 *   - Over MARKETPLACE_HIGH times the median of the STORES' asks for the same
 *     product in any market (converted roughly to US$), sold-out asks included
 *     — for such products they are often the only other asks there are.
 *     Needs two store asks.
 *   - A case over CASE_MAX_UNITS times the marketplace's own price for one of
 *     the set's units (a $19,998.95 Lost Origin booster bundle case against a
 *     $198.49 booster bundle), for cases no store lists.
 *
 *   - On a set that hasn't released yet, over PRE_RELEASE_MSRP_MULTIPLE times
 *     TPCi's US MSRP for the product (src/lib/rrp.ts), where one is published:
 *     TCGplayer's first sellers list a $59.99 Pokémon Center ETB at $449.99
 *     months before release, and that became the "from" price.
 *
 * Uses only this run's reads: on a partial run (--only) the first check sees
 * fewer store asks and simply applies less often.
 */
export function dropPlaceholderAsks(reads: StoreRead[], today = new Date()): number {
  const storeAsks = new Map<string, number[]>();
  for (const r of reads) {
    if (!r.ok || isMarketplace(r.store)) continue;
    for (const row of r.rows) {
      const k = row.identity.groupKey;
      (storeAsks.get(k) ?? storeAsks.set(k, []).get(k)!).push(roughUsdCents(row.priceCents, r.store.market));
    }
  }
  let dropped = 0;
  for (const r of reads) {
    if (!r.ok || !isMarketplace(r.store)) continue;
    const unit = new Map<string, number>();
    for (const row of r.rows) if (row.identity.set) unit.set(`${row.identity.set.code}|${row.identity.type}`, row.priceCents);
    r.rows = r.rows.filter((row) => {
      const usd = roughUsdCents(row.priceCents, r.store.market);
      const asks = storeAsks.get(row.identity.groupKey);
      const ref = asks && asks.length >= 2 ? median(asks) : null;
      const unitType = CASE_UNIT[row.identity.type];
      const unitPrice = unitType && row.identity.set ? unit.get(`${row.identity.set.code}|${unitType}`) : undefined;
      const msrp = row.identity.set && ageDays(row.identity.set.releaseDate, today) < 0 ? usMsrpCents(row.identity.type, row.identity.set.code) : null;
      const why =
        ref != null && usd > ref * MARKETPLACE_HIGH
          ? `vs stores' median ~US$${(ref / 100).toFixed(2)}`
          : unitPrice != null && row.priceCents > unitPrice * CASE_MAX_UNITS
            ? `vs ${(unitPrice / 100).toFixed(2)} for one ${unitType}`
            : msrp != null && row.priceCents > msrp * PRE_RELEASE_MSRP_MULTIPLE
              ? `vs US MSRP ${(msrp / 100).toFixed(2)} before release`
              : null;
      if (!why) return true;
      dropped++;
      console.warn(`  placeholder ask dropped: ${r.store.key} "${row.title}" ${row.priceCents} ${why}`);
      return false;
    });
  }
  return dropped;
}

/** Has a read lost too many of the offers it had last time to be trusted? */
export function coverageDropped(rows: number, before: number, floor = COVERAGE_FLOOR, minRows = COVERAGE_MIN_ROWS): boolean {
  return before >= minRows && rows < before * floor;
}

/**
 * Reads that can't be trusted to replace a store's rows are turned into
 * failures, so the previous rows are kept (and age into "unknown") instead:
 *   - a feed cut off part-way: writing it would delete everything after the
 *     page that failed;
 *   - a read that looks complete but carries far fewer offers than last time
 *     (a store's main collection failed while a small side collection read).
 *
 * A marketplace stays failed until the old rows are pruned (OFFER_TTL_DAYS);
 * scripts/import.ts turns the job red well before that. A store's short read
 * is accepted when the run before failed the same way: a flaky read rarely
 * fails identically twelve hours apart, and a store that really did clear its
 * shelves (or whose page 2 always errors) shouldn't show "not checked
 * recently" for two weeks.
 */
export function distrustRead(
  r: Pick<StoreRead, "store" | "rows" | "partial">,
  had: number,
  lastError: string | null | undefined,
): { reason: string; accept: boolean } | null {
  const market = isMarketplace(r.store);
  const short = market
    ? coverageDropped(r.rows.length, had)
    : coverageDropped(r.rows.length, had, STORE_COVERAGE_FLOOR, STORE_COVERAGE_MIN_ROWS);
  const reason = r.partial ?? (short ? `${COVERAGE_ERROR} from ${had} to ${r.rows.length} offers` : null);
  if (!reason) return null;
  const kind = reason.startsWith(CUT_OFF_ERROR) ? CUT_OFF_ERROR : COVERAGE_ERROR;
  return { reason, accept: !market && !!lastError?.startsWith(kind) };
}

async function guardReads(reads: StoreRead[]): Promise<void> {
  const ok = reads.filter((r) => r.ok);
  if (!ok.length) return;
  const keys = ok.map((r) => r.store.key);
  const counts = await prisma.offer.groupBy({ by: ["store"], where: { store: { in: keys } }, _count: { _all: true } });
  const before = new Map(counts.map((c) => [c.store, c._count._all]));
  const lastError = new Map(
    (await prisma.storeStat.findMany({ where: { store: { in: keys } }, select: { store: true, lastError: true } })).map((s) => [s.store, s.lastError]),
  );
  for (const r of ok) {
    const verdict = distrustRead(r, before.get(r.store.key) ?? 0, lastError.get(r.store.key));
    if (!verdict) continue;
    if (verdict.accept) {
      console.log(`  ${r.store.key}: ${verdict.reason}, as last run; accepting the read`);
      r.error = verdict.reason; // still recorded on StoreStat, so it stays visible
      continue;
    }
    r.ok = false;
    r.error = `${verdict.reason}; kept the previous rows`;
    r.rows = [];
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/**
 * Is a product's name wrong for the key it's filed under? Either the name
 * identifies to another key, or it doesn't identify at all any more (a name
 * taken from a listing the classifier now refuses: "3-Pack Blister MAX 1 PER
 * CUSTOMER", "Tins (Pair)").
 */
function misfiled(p: { name: string; groupKey: string }): boolean {
  const id = identify(p.name);
  return !isIdentity(id) || id.groupKey !== p.groupKey;
}

/**
 * A listing's identity across runs: its store and URL, hashed (the same hash
 * the database computes in previousOfferRefs, so the importer reads 16
 * characters per stored offer instead of its whole URL).
 */
export function offerRef(store: string, url: string): string {
  return createHash("md5").update(`${store} ${url}`).digest("hex").slice(0, 16);
}

/** Every stored offer's product, store and ref. The one whole-table read of Offer URLs, as hashes. */
async function previousOfferRefs(): Promise<{ productId: string; store: string; ref: string }[]> {
  return prisma.$queryRaw<{ productId: string; store: string; ref: string }[]>`
    SELECT "productId", "store", left(md5("store" || ' ' || "url"), 16) AS "ref" FROM "Offer"`;
}

/**
 * Which existing products follow their listings to a new key. Pure, so it is
 * tested without a database (tests/importer.test.ts).
 *
 * A classifier change (or a store renaming its listings) can send a product's
 * listings to a key no product holds yet. Left alone, the importer would
 * create a new product for that key — a new page, often "<slug>-2" — and then
 * delete the old one once it has no offers, so its URL would 404. Instead the
 * product itself moves: same id, slug and page, new key.
 *
 * Keyed on the LISTINGS, not the product's name: a product moves to key K when
 * more than half of ALL its stored offers (store + URL, see offerRef) were
 * read this run and now identify to K, and no product holds K. Offers of
 * stores that failed this run count against a move, so a partial or unlucky
 * run moves nothing it can't see. One exception: a product that would be
 * left with no offers at all — every one of them is from a store read this
 * run (`readStores`, whose rows are all replaced) and none stayed on its key,
 * like a merged product splitting three ways ("First Partner Illustration
 * Collection" into Series 1, 2 and 3) — would be deleted, so it follows its
 * listings anyway: to the key its own name identifies to (`nameKey`) if any
 * went there, else to the key most went to — the first of those that is free
 * ("Espathra 2-Pack Blister", holding three single-pack and two 2-pack
 * listings, keeps its page as the 2-pack when another product already holds
 * the single-pack key).
 *
 * Products are visited in order, repeatedly, so one can take a key another
 * move freed (a chain); two products swapping keys block each other and stay
 * put. Returns the moves in the order they can be written without breaking
 * the unique groupKey.
 */
export function planMoves(
  existing: { id: string; groupKey: string; nameKey?: string | null }[],
  previous: { productId: string; store: string; ref: string }[],
  now: Map<string, string>,
  readStores: Set<string>,
): { id: string; from: string; to: string }[] {
  const total = new Map<string, number>();
  const kept = new Set<string>(); // products with an offer from a store not read this run
  const votes = new Map<string, Map<string, number>>();
  for (const o of previous) {
    total.set(o.productId, (total.get(o.productId) ?? 0) + 1);
    if (!readStores.has(o.store)) kept.add(o.productId);
    const k = now.get(o.ref);
    if (k === undefined) continue;
    const v = votes.get(o.productId) ?? votes.set(o.productId, new Map()).get(o.productId)!;
    v.set(k, (v.get(k) ?? 0) + 1);
  }
  const keyOf = new Map(existing.map((p) => [p.id, p.groupKey]));
  const holder = new Map(existing.map((p) => [p.groupKey, p.id]));
  const moves: { id: string; from: string; to: string }[] = [];
  for (let changed = true, pass = 0; changed && pass < 10; pass++) {
    changed = false;
    for (const p of existing) {
      const v = votes.get(p.id);
      const from = keyOf.get(p.id)!;
      if (!v || from !== p.groupKey) continue; // no listings read, or already moved
      // Where its listings went, most first; the name's key first when orphaned.
      const ranked = [...v].filter(([k]) => k !== from).sort((a, b) => b[1] - a[1]);
      if (!ranked.length) continue;
      let candidates: string[];
      if (!kept.has(p.id) && !v.has(from)) {
        candidates = ranked.map(([k]) => k);
        if (p.nameKey && v.has(p.nameKey) && p.nameKey !== from) candidates = [p.nameKey, ...candidates.filter((k) => k !== p.nameKey)];
      } else if (ranked[0][1] * 2 > total.get(p.id)!) candidates = [ranked[0][0]];
      else continue;
      const to = candidates.find((k) => !holder.has(k));
      if (!to) continue;
      holder.delete(from);
      holder.set(to, p.id);
      keyOf.set(p.id, to);
      moves.push({ id: p.id, from, to });
      changed = true;
    }
  }
  return moves;
}

/**
 * The name a misfiled product takes: TCGplayer's (one clean catalogue name)
 * when it has a matching listing, else the name most of its listings give,
 * the earliest read on a tie.
 */
export function pickName(candidates: { name: string; marketplace: boolean }[]): string | null {
  const tcg = candidates.find((c) => c.marketplace);
  if (tcg) return tcg.name;
  const counts = new Map<string, number>();
  for (const c of candidates) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  let best: string | null = null;
  for (const [name, n] of counts) if (best === null || n > counts.get(best)!) best = name;
  return best;
}

interface ImageCandidate {
  url: string;
  marketplace: boolean;
  area: number; // pixels, 0 when unknown
  words: string[]; // the product's set slug and signature words, for filename matches
}

/**
 * Is this photo gone? A HEAD costs no bandwidth. Only an answer that says so
 * counts: 404/410, or a page that is not an image. A 403/405/429/5xx or a
 * timeout is "can't tell" and keeps the photo (a store that refuses HEAD must
 * not lose every photo, and get it back next run, forever).
 */
async function imageExists(url: string): Promise<boolean> {
  if (isTcgImage(url)) return tcgImageExists(url);
  try {
    const res = await fetch(url, { method: "HEAD", headers: SCRAPE_HEADERS, redirect: "follow", signal: AbortSignal.timeout(10_000) });
    if (res.status === 404 || res.status === 410) return false;
    if (res.ok) return (res.headers.get("content-type") ?? "").startsWith("image/");
    return true;
  } catch {
    return true;
  }
}

/** The words a product's photo filename might carry: its set's slug and its signature (the featured Pokémon). */
function imageWords(identity: SealedIdentity): string[] {
  const sig = identity.groupKey.split("|")[2] ?? "";
  return [...(identity.set?.slug.split("-") ?? []), ...sig.split("-")].filter((w) => w.length >= 4);
}

function filenameMentions(url: string, words: string[]): boolean {
  const file = slugify(decodeURIComponent(url.split("?")[0].split("/").pop() ?? ""));
  return words.some((w) => file.includes(w));
}

/**
 * A product's photo, best first: TCGplayer's catalogue photo (one clean shot
 * per product; the URL is built from the product id, so it is checked against
 * the CDN before use), then a store photo whose filename names the set or the
 * featured Pokémon (a photo of THIS product, not the store's generic set
 * banner), then the largest store photo, then any.
 */
export function rankImages(cands: ImageCandidate[]): string[] {
  const score = (c: ImageCandidate) => (c.marketplace ? 3 : filenameMentions(c.url, c.words) ? 2 : c.area > 0 ? 1 : 0);
  return [...new Map(cands.map((c) => [c.url, c])).values()]
    .sort((a, b) => score(b) - score(a) || b.area - a.area)
    .map((c) => c.url);
}

async function pickImage(cands: ImageCandidate[]): Promise<string | null> {
  for (const url of rankImages(cands)) {
    if (!isTcgImage(url)) return url; // store photos are HEAD-checked after the write (sweepImages)
    if (await tcgImageExists(url)) return url;
  }
  return null;
}

/**
 * Create any products this run found for the first time. Returns groupKey →
 * product id, and how many products were renamed and given an image.
 *
 * First, products whose listings have moved to a new key follow them
 * (planMoves). Then, on a full run:
 *   - a product whose own name no longer identifies to its key (a product is
 *     named after the listing that created it, and "Neo Discovery 2-Pack
 *     Blister" can't say which 2-pack it is once "[Unlimited Edition]"
 *     matters; "3PK Blister MAX 2 PER CUSTOMER" no longer identifies at all)
 *     takes the name of a listing that does (pickName); the slug stays;
 *   - a curated product (the Ultra-Premium Collections) takes its fixed name;
 *   - every other name is re-run through cleanName, which learns new store
 *     noise between runs ("[CRI - 3]", "(anglais)", "MAX 1 PER CUSTOMER");
 *   - a product with a store photo takes TCGplayer's instead when TCGplayer
 *     lists it (pickImage), and every photo set this run is HEAD-checked
 *     (sweepImages), so a 404 is cleared and refilled next run.
 * Not on a partial (--only) run, which sees only some of the listings to
 * choose from. A product with no photo gets one on any run.
 */
async function upsertProducts(reads: StoreRead[], full: boolean): Promise<{ ids: Map<string, string>; renamed: number; imaged: number }> {
  const existing = await prisma.product.findMany({ select: { id: true, groupKey: true, slug: true, name: true, imageUrl: true } });
  const byKey = new Map(existing.map((p) => [p.groupKey, p]));
  const byId = new Map(existing.map((p) => [p.id, p]));
  const slugs = new Set(existing.map((p) => p.slug));
  const now = new Map<string, string>();
  const identityOf = new Map<string, SealedIdentity>();
  for (const r of reads)
    for (const row of r.rows) {
      now.set(offerRef(r.store.key, row.url), row.identity.groupKey);
      if (!identityOf.has(row.identity.groupKey)) identityOf.set(row.identity.groupKey, row.identity);
    }
  const nameKeys = existing.map((p) => {
    const id = identify(p.name);
    return { id: p.id, groupKey: p.groupKey, nameKey: isIdentity(id) ? id.groupKey : null };
  });
  const moved = planMoves(nameKeys, await previousOfferRefs(), now, new Set(reads.map((r) => r.store.key)));
  for (const m of moved) {
    const p = byId.get(m.id)!;
    byKey.delete(m.from);
    p.groupKey = m.to;
    byKey.set(m.to, p);
  }
  const fresh = new Map<string, { identity: SealedIdentity; images: ImageCandidate[] }>();
  const images = new Map<string, ImageCandidate[]>(); // existing product id → this run's photos of it
  const names = new Map<string, { name: string; marketplace: boolean }[]>();
  for (const r of reads)
    for (const row of r.rows) {
      const k = row.identity.groupKey;
      const have = byKey.get(k);
      const cand: ImageCandidate | null = row.imageUrl ? { url: row.imageUrl, marketplace: isMarketplace(r.store), area: row.imageArea ?? 0, words: imageWords(row.identity) } : null;
      if (have) {
        if (cand) (images.get(have.id) ?? images.set(have.id, []).get(have.id)!).push(cand);
        if (full && misfiled(have) && !misfiled({ name: row.identity.name, groupKey: k })) {
          (names.get(have.id) ?? names.set(have.id, []).get(have.id)!).push({ name: row.identity.name, marketplace: isMarketplace(r.store) });
        }
        continue;
      }
      const f = fresh.get(k) ?? fresh.set(k, { identity: row.identity, images: [] }).get(k)!;
      if (cand) f.images.push(cand);
    }
  // Moves first, in planMoves' order: an old key a moved product frees may be
  // taken by another move, or be about to be created.
  for (const m of moved) {
    const identity = identityOf.get(m.to)!;
    await prisma.product.update({
      where: { id: m.id },
      data: { groupKey: m.to, productType: identity.typeLabel, setCode: identity.set?.code ?? null },
    });
  }
  // Photos: a product with none gets the best on offer; on a full run one with
  // a store photo moves to TCGplayer's when TCGplayer lists it.
  const image = new Map<string, string>();
  await mapLimit([...images], 4, async ([id, cands]) => {
    const current = byId.get(id)!.imageUrl;
    if (current && (!full || isTcgImage(current) || !cands.some((c) => c.marketplace))) return;
    const url = await pickImage(current ? cands.filter((c) => c.marketplace) : cands);
    if (url && url !== current) image.set(id, url);
  });
  const freshImage = new Map<string, string | null>();
  await mapLimit([...fresh], 4, async ([k, f]) => void freshImage.set(k, await pickImage(f.images)));
  const data = [...fresh.values()].map(({ identity }) => {
    let slug = identity.slugBase || "product";
    for (let n = 2; slugs.has(slug); n++) slug = `${identity.slugBase}-${n}`;
    slugs.add(slug);
    return {
      groupKey: identity.groupKey,
      slug,
      name: identity.name,
      productType: identity.typeLabel,
      setCode: identity.set?.code ?? null,
      imageUrl: freshImage.get(identity.groupKey) ?? null,
    };
  });
  if (data.length) await prisma.product.createMany({ data, skipDuplicates: true });
  for (const [id, imageUrl] of image) await prisma.product.update({ where: { id }, data: { imageUrl } });
  // Names: a misfiled product takes a listing's name; a curated key its fixed
  // name; every other name is re-cleaned.
  let renamed = 0;
  if (full) {
    for (const p of existing) {
      const fixed = canonicalName(p.groupKey);
      const picked = names.has(p.id) ? pickName(names.get(p.id)!) : null;
      const name = fixed ?? picked ?? cleanName(p.name);
      if (!name || name === p.name) continue;
      await prisma.product.update({ where: { id: p.id }, data: { name } });
      renamed++;
    }
  }
  await sweepImages([...image.values(), ...[...freshImage.values()].filter((u): u is string => !!u)]);
  const all = await prisma.product.findMany({ select: { id: true, groupKey: true } });
  console.log(`products: ${data.length} new, ${moved.length} moved to a new key, ${renamed} renamed, ${image.size + [...freshImage.values()].filter(Boolean).length} given an image, ${all.length} total`);
  return { ids: new Map(all.map((p) => [p.groupKey, p.id])), renamed, imaged: image.size };
}

/**
 * HEAD every photo set this run and clear the ones that aren't there (a store
 * that renamed its files, a CDN that answers 404): a product with no photo is
 * refilled from its listings on the next run, one with a dead photo is not.
 * TCGplayer's were checked before they were chosen.
 */
async function sweepImages(urls: string[]): Promise<void> {
  const dead: string[] = [];
  const deadline = Date.now() + IMAGE_SWEEP_MAX_MS; // photos past it keep unchecked (the sweep is a courtesy, not a gate)
  await mapLimit([...new Set(urls.filter((u) => !isTcgImage(u)))], 4, async (url) => {
    if (Date.now() > deadline) return;
    if (!(await imageExists(url))) dead.push(url);
  });
  if (!dead.length) return;
  const cleared = await prisma.product.updateMany({ where: { imageUrl: { in: dead } }, data: { imageUrl: null } });
  console.log(`images: ${cleared.count} cleared (HEAD failed), refilled next run`);
}

async function writeOffers(reads: StoreRead[], ids: Map<string, string>, now: Date): Promise<number> {
  let written = 0;
  for (const r of reads) {
    if (!r.ok) continue;
    const data = r.rows.map((row) => ({
      productId: ids.get(row.identity.groupKey)!,
      store: r.store.key,
      market: r.store.market,
      title: row.title.slice(0, 300),
      url: row.url,
      priceCents: row.priceCents,
      inStock: row.inStock,
      imageUrl: row.imageUrl,
      lastSeen: now,
    }));
    await prisma.$transaction([
      prisma.offer.deleteMany({ where: { store: r.store.key } }),
      prisma.offer.createMany({ data }),
    ]);
    written += data.length;
  }
  // Stores that left the registry, and rows no successful read has confirmed in
  // weeks. SOURCES, not STORES: TCGplayer is not a store but its rows stay.
  const registered = SOURCES.map((s) => s.key);
  const gone = await prisma.offer.deleteMany({
    where: { OR: [{ store: { notIn: registered } }, { lastSeen: { lt: new Date(now.getTime() - OFFER_TTL_DAYS * 86400_000) } }] },
  });
  if (gone.count) console.log(`offers: pruned ${gone.count} stale or orphaned`);
  // A product no store has listed for OFFER_TTL_DAYS: its page would only say
  // "not listed anywhere". It comes back (same slug) if a store lists it again.
  // Also clears products a classifier change re-keyed whose listings didn't
  // mostly go to one free key (planMoves moves those instead).
  const dead = await prisma.product.deleteMany({ where: { offers: { none: {} } } });
  if (dead.count) console.log(`products: removed ${dead.count} no store lists`);
  return written;
}

/**
 * One product × market summary from its offers. The store counts are
 * independent stores only ("N stores" never counts a marketplace); a
 * marketplace's open offer sets marketplaceOpen instead. The "from" price is
 * the cheapest open offer of any kind, as on the product page. A dormant
 * store's rows (see dormantStores) don't count as "listed". The median is of
 * the OPEN independent-store prices, null under two.
 */
export function productStat(
  list: StatOffer[],
  now: number,
  dormant: ReadonlySet<string> = new Set(),
): { lowestPriceCents: number | null; inStockStores: number; listedStores: number; marketplaceOpen: boolean; medianOpenCents: number | null } {
  const fromMarketplace = (o: StatOffer) => {
    const s = STORE_BY_KEY.get(o.store);
    return !!s && isMarketplace(s);
  };
  const open = list.filter((o) => offerStock(o, now) === "open");
  const openStores = open.filter((o) => !fromMarketplace(o));
  return {
    lowestPriceCents: headlineOffer(list, now)?.priceCents ?? null,
    inStockStores: new Set(openStores.map((o) => o.store)).size,
    listedStores: new Set(list.filter((o) => !fromMarketplace(o) && !dormant.has(o.store)).map((o) => o.store)).size,
    marketplaceOpen: open.some(fromMarketplace),
    medianOpenCents: openStores.length >= 2 ? Math.round(median(openStores.map((o) => o.priceCents))) : null,
  };
}

type StatOffer = { store: string; priceCents: number; inStock: boolean; lastSeen: Date };

/** Every store's stored listings and how many are in stock. One groupBy over Offer. */
async function storeCounts(): Promise<Map<string, { listed: number; inStock: number }>> {
  const counts = await prisma.offer.groupBy({ by: ["store", "inStock"], _count: { _all: true } });
  const out = new Map<string, { listed: number; inStock: number }>();
  for (const c of counts) {
    const s = out.get(c.store) ?? out.set(c.store, { listed: 0, inStock: 0 }).get(c.store)!;
    s.listed += c._count._all;
    if (c.inStock) s.inStock += c._count._all;
  }
  return out;
}

/** Stores with DORMANT_MIN_LISTED or more listings and none in stock: they list, but don't sell. */
export function dormantStores(counts: ReadonlyMap<string, { listed: number; inStock: number }>): Set<string> {
  const out = new Set<string>();
  for (const [store, c] of counts) {
    const s = STORE_BY_KEY.get(store);
    if (s && !isMarketplace(s) && c.listed >= DORMANT_MIN_LISTED && c.inStock === 0) out.add(store);
  }
  return out;
}

/** Recompute every product's per-market summary from the stored offers. */
export async function recomputeStats(now = new Date(), dormant: ReadonlySet<string> = new Set()): Promise<number> {
  const offers = await prisma.offer.findMany({
    select: { productId: true, market: true, store: true, priceCents: true, inStock: true, lastSeen: true },
  });
  const groups = new Map<string, typeof offers>();
  for (const o of offers) {
    const k = `${o.productId}|${o.market}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(o);
  }
  const data = [...groups.entries()].map(([k, list]) => {
    const [productId, market] = k.split("|");
    return { productId, market, ...productStat(list, now.getTime(), dormant) };
  });
  await prisma.$transaction([prisma.productStat.deleteMany({}), prisma.productStat.createMany({ data })]);
  return data.length;
}

async function writeStoreStats(reads: StoreRead[], now: Date, counts: ReadonlyMap<string, { listed: number; inStock: number }>, dormant: ReadonlySet<string>): Promise<void> {
  for (const r of reads) {
    const data = {
      market: r.store.market,
      listed: counts.get(r.store.key)?.listed ?? 0,
      inStock: counts.get(r.store.key)?.inStock ?? 0,
      dormant: dormant.has(r.store.key),
      lastError: r.error,
      ...(r.ok ? { lastOkAt: now } : {}),
    };
    await prisma.storeStat.upsert({ where: { store: r.store.key }, create: { store: r.store.key, ...data }, update: data });
  }
  // Stores not read this run can still turn dormant (or stop being) as their
  // rows age out or the flag's threshold changes.
  await prisma.storeStat.updateMany({ where: { store: { in: [...dormant] }, dormant: false }, data: { dormant: true } });
  await prisma.storeStat.updateMany({ where: { store: { notIn: [...dormant] }, dormant: true }, data: { dormant: false } });
  await prisma.storeStat.deleteMany({ where: { store: { notIn: SOURCES.map((s) => s.key) } } });
}

export interface ImportSummary {
  stores: number; // independent stores read — "N stores" means these, never a marketplace
  ok: number;
  // lastOkAt: its last successful read, this run's or an earlier one's.
  marketplaces: { key: string; name: string; market: string; ok: boolean; offers: number; error: string | null; lastOkAt: Date | null }[];
  failed: { key: string; market: string; error: string }[]; // stores and marketplaces
  offers: number;
  outliers: number; // store rows dropped as far below the market (dropLowOutliers)
  highOutliers: number; // …and far above it (dropHighOutliers)
  suspectStores: { store: string; low: number }[]; // stores whose rows were written as sold out (demoteSuspectStores)
  placeholders: number; // marketplace placeholder asks dropped
  dormant: string[]; // store keys (dormantStores)
  renamed: number; // products renamed on a full run
  stats: number;
  // Per market for the stores; a marketplace gets its own row ("US · TCGplayer").
  byMarket: Record<string, { stores: number; ok: number; offers: number; inStock: number }>;
  minutes: number;
}

/**
 * What a run reads: every source (the stores and TCGplayer), or those whose
 * key or market is in `only` ("tcgplayer" and "US" both include TCGplayer).
 * Marketplaces first: TCGplayer is one long read (~60 pages, one a second),
 * so it runs alongside the stores instead of after them.
 */
export function sourcesFor(only?: string[]): StoreConfig[] {
  const picked = only?.length ? SOURCES.filter((s) => only.includes(s.key) || only.includes(s.market)) : SOURCES;
  return [...picked.filter(isMarketplace), ...picked.filter((s) => !isMarketplace(s))];
}

export async function runImport(opts: { only?: string[]; concurrency?: number } = {}): Promise<ImportSummary> {
  const t0 = Date.now();
  const now = new Date();
  const sources = sourcesFor(opts.only);
  const nStores = sources.filter((s) => !isMarketplace(s)).length;
  console.log(`reading ${nStores} stores${sources.length > nStores ? ` and ${sources.length - nStores} marketplace` : ""}…`);
  let done = 0;
  const reads = await mapLimit(sources, opts.concurrency ?? 3, async (s) => {
    const r = await readStore(s);
    done++;
    const inStock = r.rows.filter((x) => x.inStock).length;
    console.log(
      `[${done}/${sources.length}] ${s.market} ${s.key}: ` +
        (r.ok ? `${r.rows.length} sealed (${inStock} in stock) from ${r.products} products` : `FAILED — ${r.error}`) +
        `${r.partial ? ` [${r.partial}]` : ""}` +
        `${r.rediscovered ? " [rediscovered collections]" : ""} · ${(r.ms / 1000).toFixed(0)}s`,
    );
    return r;
  });

  const suspectStores = demoteSuspectStores(reads);
  const outliers = dropLowOutliers(reads);
  const highOutliers = dropHighOutliers(reads, now);
  const placeholders = dropPlaceholderAsks(reads, now);
  await guardReads(reads);
  const { ids, renamed } = await upsertProducts(
    reads.filter((r) => r.ok),
    !opts.only?.length,
  );
  const offers = await writeOffers(reads, ids, now);
  const counts = await storeCounts();
  const dormant = dormantStores(counts);
  if (dormant.size) console.log(`stores: ${dormant.size} dormant (${DORMANT_MIN_LISTED}+ listings, none in stock): ${[...dormant].sort().join(", ")}`);
  const stats = await recomputeStats(now, dormant);
  await writeStoreStats(reads, now, counts, dormant);

  const byMarket: ImportSummary["byMarket"] = {};
  for (const r of reads) {
    const key = isMarketplace(r.store) ? `${r.store.market} · ${r.store.name}` : r.store.market;
    const m = (byMarket[key] ??= { stores: 0, ok: 0, offers: 0, inStock: 0 });
    m.stores++;
    if (r.ok) {
      m.ok++;
      m.offers += r.rows.length;
      m.inStock += r.rows.filter((x) => x.inStock).length;
    }
  }
  const storeReads = reads.filter((r) => !isMarketplace(r.store));
  const marketReads = reads.filter((r) => isMarketplace(r.store));
  const lastOk = new Map(
    (await prisma.storeStat.findMany({ where: { store: { in: marketReads.map((r) => r.store.key) } }, select: { store: true, lastOkAt: true } })).map((s) => [s.store, s.lastOkAt]),
  );
  return {
    stores: storeReads.length,
    ok: storeReads.filter((r) => r.ok).length,
    marketplaces: marketReads.map((r) => ({
      key: r.store.key,
      name: r.store.name,
      market: r.store.market,
      ok: r.ok,
      offers: r.rows.length,
      error: r.error,
      lastOkAt: lastOk.get(r.store.key) ?? null,
    })),
    failed: reads.filter((r) => !r.ok).map((r) => ({ key: r.store.key, market: r.store.market, error: r.error ?? "?" })),
    offers,
    outliers,
    highOutliers,
    suspectStores,
    placeholders,
    dormant: [...dormant].sort(),
    renamed,
    stats,
    byMarket,
    minutes: (Date.now() - t0) / 60000,
  };
}
