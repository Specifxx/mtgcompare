// Request-path reads. Every query here is scoped to one region, product, set or
// store and selects only the columns a page renders (src/lib/db.ts, rules 1–2).
// Pages that call these are ISR-cached and re-rendered once per import.
import { prisma } from "./db";
import { SET_BY_CODE, SETS } from "./sets";
import { typeRank } from "./sealed-title";
import { rankOffers } from "./sealed-offers";
import { isMarketplace, STORE_BY_KEY, storeHost, TCGPLAYER } from "./stores";
import { cardOpen } from "./compact";
import type { Market } from "./regions";

export interface ProductCardData {
  slug: string;
  name: string;
  productType: string;
  setCode: string | null;
  imageUrl: string | null;
  lowestPriceCents: number | null; // cheapest open offer, a marketplace's included
  inStockStores: number; // independent stores only
  listedStores: number; // independent stores only
  marketplaceOpen: boolean; // TCGplayer (US) has it: buyable even with no store in stock
  // Median of the OPEN independent-store prices (null under two stores): a
  // cross-store fact about now, so a card can say "18% below the median".
  medianOpenCents: number | null;
  releaseDate: string | null;
}

// The columns a product card renders, as a Prisma select (cardSelect) and the row it returns (CardRow), and the mapper to
// ProductCardData (toCard). Exported so a page's own loader (a new file importing prisma, src/lib/db.ts rules) selects
// exactly what a card shows and maps it the same way; a $queryRaw loader returns the same names and nests `product` itself.
export const cardSelect = {
  lowestPriceCents: true,
  inStockStores: true,
  listedStores: true,
  marketplaceOpen: true,
  medianOpenCents: true,
  product: { select: { slug: true, name: true, productType: true, setCode: true, imageUrl: true } },
} as const;

export type CardRow = {
  lowestPriceCents: number | null;
  inStockStores: number;
  listedStores: number;
  marketplaceOpen: boolean;
  medianOpenCents: number | null;
  product: { slug: string; name: string; productType: string; setCode: string | null; imageUrl: string | null };
};

export function toCard(r: CardRow): ProductCardData {
  return {
    ...r.product,
    lowestPriceCents: r.lowestPriceCents,
    inStockStores: r.inStockStores,
    listedStores: r.listedStores,
    marketplaceOpen: r.marketplaceOpen,
    medianOpenCents: r.medianOpenCents,
    releaseDate: r.product.setCode ? SET_BY_CODE.get(r.product.setCode)?.releaseDate ?? null : null,
  };
}

/** In stock first (cheapest first), then sold out by type and name. */
export function sortCards(cards: ProductCardData[]): ProductCardData[] {
  return [...cards].sort((a, b) => {
    const ai = cardOpen(a) ? 0 : 1;
    const bi = cardOpen(b) ? 0 : 1;
    if (ai !== bi) return ai - bi;
    if (ai === 0) return (a.lowestPriceCents ?? 0) - (b.lowestPriceCents ?? 0);
    return typeRank(a.productType) - typeRank(b.productType) || a.name.localeCompare(b.name);
  });
}

// Buyable now: a store has it in stock, or TCGplayer does (ProductStat's
// store counts never include TCGplayer; marketplaceOpen says it has it).
export const OPEN = { OR: [{ inStockStores: { gt: 0 } }, { marketplaceOpen: true }] };

// A ProductStat row exists only for a product something in that market lists
// (a store or TCGplayer), so "listed in the region" needs no filter of its own:
// listedStores is 0 for a product only TCGplayer lists.

/**
 * Worth a page in the index / a tile on the browse page: something you can buy
 * now (at a store or on TCGplayer), or something at least two stores carry (so
 * there's a comparison to make). A one-store, sold-out listing still has a
 * product page, reachable from its set and store — just not in the browse grid
 * or sitemap.
 */
export const COMPARABLE = { OR: [...OPEN.OR, { listedStores: { gte: 2 } }] };

/** The browse page's data set: every comparable product in the market. */
export async function marketProducts(market: Market): Promise<ProductCardData[]> {
  const rows = await prisma.productStat.findMany({ where: { market, ...COMPARABLE }, select: cardSelect });
  return rows.map(toCard);
}

/**
 * How many products marketProducts() would return: one COUNT. The browse pages
 * past page 1 check their number against it first, so /us/sealed/page/9999 is a
 * 404 that costs a count, not a read of the whole market.
 */
export async function marketProductCount(market: Market): Promise<number> {
  return prisma.productStat.count({ where: { market, ...COMPARABLE } });
}

export async function productsByType(market: Market, typeLabel: string): Promise<ProductCardData[]> {
  const rows = await prisma.productStat.findMany({
    where: { market, product: { productType: typeLabel } },
    select: cardSelect,
  });
  return sortCards(rows.map(toCard));
}

export async function productsBySet(market: Market, setCode: string): Promise<ProductCardData[]> {
  const rows = await prisma.productStat.findMany({
    where: { market, product: { setCode } },
    select: cardSelect,
  });
  return rows.map(toCard).sort((a, b) => typeRank(a.productType) - typeRank(b.productType) || a.name.localeCompare(b.name));
}

/** The cheapest in-stock products of some types — for the region home page rails. */
export async function cheapestInStock(market: Market, typeLabels: string[], take: number): Promise<ProductCardData[]> {
  const rows = await prisma.productStat.findMany({
    where: { market, ...OPEN, product: { productType: { in: typeLabels } } },
    orderBy: { lowestPriceCents: "asc" },
    take: take * 4,
    select: cardSelect,
  });
  // Favour recent sets: an old set's box is rarely the cheapest thing anyone wants.
  return rows
    .map(toCard)
    .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "") || (a.lowestPriceCents ?? 0) - (b.lowestPriceCents ?? 0))
    .slice(0, take);
}

// The product types a buyer prices a set by, and the home page's "latest sets" cards show.
export const HEADLINE_TYPES = ["Booster Box", "Elite Trainer Box", "Booster Bundle", "Pokémon Center Elite Trainer Box"];

/**
 * The region home page's rails, from small targeted reads: in-stock booster
 * boxes and ETBs (newest sets first), open pre-orders, and the headline
 * products of the newest sets the region stocks.
 */
export async function homeRails(market: Market, today = new Date().toISOString().slice(0, 10)) {
  const upcoming = SETS.filter((s) => s.releaseDate > today).map((s) => s.code);
  const recentCodes = SETS.slice(0, 12).map((s) => s.code);
  const newestFirst = (a: ProductCardData, b: ProductCardData) =>
    (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "") || (a.lowestPriceCents ?? 0) - (b.lowestPriceCents ?? 0);
  const inStockOfType = async (type: string) =>
    (
      await prisma.productStat.findMany({
        where: { market, ...OPEN, product: { productType: type, OR: [{ setCode: null }, { setCode: { notIn: upcoming } }] } },
        take: 150,
        select: cardSelect,
      })
    )
      .map(toCard)
      .sort(newestFirst)
      .slice(0, 8);
  const [boxes, etbs, preorders, latest] = await Promise.all([
    inStockOfType("Booster Box"),
    inStockOfType("Elite Trainer Box"),
    upcoming.length
      ? prisma.productStat.findMany({ where: { market, ...OPEN, product: { setCode: { in: upcoming } } }, take: 60, select: cardSelect })
      : Promise.resolve([]),
    prisma.productStat.findMany({
      where: { market, product: { setCode: { in: recentCodes }, productType: { in: HEADLINE_TYPES } } },
      select: cardSelect,
    }),
  ]);
  const bySet = new Map<string, ProductCardData[]>();
  for (const p of latest.map(toCard)) (bySet.get(p.setCode!) ?? bySet.set(p.setCode!, []).get(p.setCode!)!).push(p);
  return { boxes, etbs, preorders: sortCards(preorders.map(toCard)).slice(0, 8), latestSets: bySet };
}

export interface RegionOverview {
  products: number;
  inStock: number;
  stores: number;
  storesRead: number;
  lastChecked: Date | null;
}

// StoreStat has a row for TCGplayer too (the importer reads it like a store);
// store counts and "last checked" are about the stores.
const STORES_ONLY = { store: { not: TCGPLAYER.key } };

export async function regionOverview(market: Market): Promise<RegionOverview> {
  const [products, inStock, stores] = await Promise.all([
    prisma.productStat.count({ where: { market } }),
    prisma.productStat.count({ where: { market, ...OPEN } }),
    prisma.storeStat.aggregate({ where: { market, listed: { gt: 0 }, ...STORES_ONLY }, _count: { _all: true }, _max: { lastOkAt: true } }),
  ]);
  const read = await prisma.storeStat.count({ where: { market, ...STORES_ONLY } });
  return { products, inStock, stores: stores._count._all, storesRead: read, lastChecked: stores._max.lastOkAt ?? null };
}

/** When the market's stores were last read successfully: the "Prices checked" line on listing pages. One aggregate. */
export async function lastCheckedAt(market: Market): Promise<Date | null> {
  const r = await prisma.storeStat.aggregate({ where: { market, ...STORES_ONLY }, _max: { lastOkAt: true } });
  return r._max.lastOkAt ?? null;
}

export async function allRegionOverviews(): Promise<Record<string, { products: number; inStock: number; stores: number }>> {
  const [listed, open, stores] = await Promise.all([
    prisma.productStat.groupBy({ by: ["market"], _count: { _all: true } }),
    prisma.productStat.groupBy({ by: ["market"], where: OPEN, _count: { _all: true } }),
    prisma.storeStat.groupBy({ by: ["market"], where: { listed: { gt: 0 }, ...STORES_ONLY }, _count: { _all: true } }),
  ]);
  const out: Record<string, { products: number; inStock: number; stores: number }> = {};
  for (const r of listed) (out[r.market] ??= { products: 0, inStock: 0, stores: 0 }).products = r._count._all;
  for (const r of open) (out[r.market] ??= { products: 0, inStock: 0, stores: 0 }).inStock = r._count._all;
  for (const r of stores) (out[r.market] ??= { products: 0, inStock: 0, stores: 0 }).stores = r._count._all;
  return out;
}

export interface OfferView {
  store: string;
  storeName: string;
  storeHost: string;
  title: string;
  url: string;
  priceCents: number;
  inStock: boolean;
  lastSeen: string;
  /** A marketplace (TCGplayer), not a store: ranked like one, never counted as one. */
  marketplace: boolean;
}

/** A product's TCGplayer offer, in US cents. Shown outside the US as a US marketplace only. */
export interface UsMarketplaceOffer {
  title: string; // TCGplayer's own product name: a clean eBay search
  url: string;
  priceCents: number;
  inStock: boolean;
  lastSeen: string;
}

export interface ProductPageData {
  id: string;
  slug: string;
  name: string;
  productType: string;
  setCode: string | null;
  imageUrl: string | null;
  offers: OfferView[];
  stats: { market: string; lowestPriceCents: number | null; inStockStores: number; listedStores: number; marketplaceOpen: boolean; medianOpenCents: number | null }[];
  /**
   * Outside the US only: the product's TCGplayer offer, priced in US$. NEVER
   * merged into `offers` — a region only compares prices in its own currency,
   * so this stays out of the ranking, the headline price and the JSON-LD. In
   * the US it is null because TCGplayer is already one of `offers`.
   */
  usMarketplace: UsMarketplaceOffer | null;
}

const offerSelect = { store: true, title: true, url: true, priceCents: true, inStock: true, lastSeen: true } as const;

function toOfferView(o: { store: string; title: string; url: string; priceCents: number; inStock: boolean; lastSeen: Date }): OfferView {
  const s = STORE_BY_KEY.get(o.store);
  return {
    store: o.store,
    storeName: s?.name ?? o.store,
    storeHost: s ? storeHost(s) : "",
    title: o.title,
    url: o.url,
    priceCents: o.priceCents,
    inStock: o.inStock,
    lastSeen: o.lastSeen.toISOString(),
    marketplace: !!s && isMarketplace(s),
  };
}

export async function productPage(slug: string, market: Market): Promise<ProductPageData | null> {
  const p = await prisma.product.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      productType: true,
      setCode: true,
      imageUrl: true,
      offers: {
        where: { market },
        take: 80,
        select: offerSelect,
      },
      stats: { select: { market: true, lowestPriceCents: true, inStockStores: true, listedStores: true, marketplaceOpen: true, medianOpenCents: true } },
    },
  });
  if (!p) return null;
  const offers = rankOffers(p.offers.map(toOfferView));
  // One row by its unique key, five columns: the cheapest read a page can make.
  const tcg =
    market === TCGPLAYER.market
      ? null
      : await prisma.offer.findUnique({
          where: { productId_store: { productId: p.id, store: TCGPLAYER.key } },
          select: { title: true, url: true, priceCents: true, inStock: true, lastSeen: true },
        });
  return { ...p, offers, usMarketplace: tcg ? { ...tcg, lastSeen: tcg.lastSeen.toISOString() } : null };
}

/** Rows per page on the browse and store pages. Each page is its own cached URL. */
export const PAGE_SIZE = 48;

/**
 * One page of a store's listings, in stock first then cheapest. Paged in SQL:
 * a big store has 1,400 rows, and each page is rendered (and cached) on its own,
 * so a page reads only its own rows. The page count comes from StoreStat.listed.
 */
export async function storeOffers(store: string, page = 1) {
  const rows = await prisma.offer.findMany({
    where: { store },
    orderBy: [{ inStock: "desc" }, { priceCents: "asc" }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      priceCents: true,
      inStock: true,
      lastSeen: true,
      url: true,
      product: { select: { slug: true, name: true, productType: true, setCode: true, imageUrl: true } },
    },
  });
  return rows;
}

export async function storeStats(market: Market) {
  return prisma.storeStat.findMany({
    where: { market },
    select: { store: true, listed: true, inStock: true, lastOkAt: true, lastError: true },
  });
}

export async function storeStat(store: string) {
  return prisma.storeStat.findUnique({ where: { store }, select: { listed: true, inStock: true, lastOkAt: true, lastError: true, dormant: true } });
}

/** Per set: how many products the market lists and how many are in stock (at a store or on TCGplayer). */
export async function setCounts(market: Market): Promise<Map<string, { products: number; inStock: number }>> {
  const rows = await prisma.productStat.findMany({
    where: { market, product: { setCode: { not: null } } },
    select: { inStockStores: true, marketplaceOpen: true, product: { select: { setCode: true } } },
  });
  const out = new Map<string, { products: number; inStock: number }>();
  for (const r of rows) {
    const code = r.product.setCode!;
    const c = out.get(code) ?? { products: 0, inStock: 0 };
    c.products++;
    if (r.inStockStores > 0 || r.marketplaceOpen) c.inStock++;
    out.set(code, c);
  }
  return out;
}

/** Other products from the same set in this market (product page, "more from"). */
export async function relatedProducts(market: Market, setCode: string, excludeSlug: string, take = 8): Promise<ProductCardData[]> {
  const rows = await prisma.productStat.findMany({
    where: { market, product: { setCode, slug: { not: excludeSlug } } },
    take: 40,
    select: cardSelect,
  });
  return sortCards(rows.map(toCard)).slice(0, take);
}

/** A product of one set and its offers in one market, ranked (open first, cheapest first). */
export interface SetOfferGroup {
  product: ProductCardData;
  offers: OfferView[];
}

// Bounds for setOfferGroups: a set has about a dozen sealed products in a
// market and a new set's product is listed by a few dozen stores at most.
const SET_GROUPS_TAKE = 30;
const SET_GROUP_OFFERS_TAKE = 40;

/**
 * Every product of one set listed in the market, each with its stores' offers —
 * the pre-order pages' price lists. One scoped read (a set × a market), capped
 * twice: the product count and the offers per product. Products in typeRank
 * order (booster box first).
 */
export async function setOfferGroups(market: Market, setCode: string): Promise<SetOfferGroup[]> {
  const rows = await prisma.productStat.findMany({
    where: { market, product: { setCode } },
    take: SET_GROUPS_TAKE,
    select: {
      ...cardSelect,
      product: { select: { ...cardSelect.product.select, offers: { where: { market }, take: SET_GROUP_OFFERS_TAKE, select: offerSelect } } },
    },
  });
  return rows
    .map(({ product: { offers, ...product }, ...stat }) => ({ product: toCard({ ...stat, product }), offers: rankOffers(offers.map(toOfferView)) }))
    .sort((a, b) => typeRank(a.product.productType) - typeRank(b.product.productType) || a.product.name.localeCompare(b.product.name));
}

/**
 * A set's TCGplayer offers (the US marketplace, priced in US$), by product slug: the pre-order page's marketplace row outside the US,
 * where TCGplayer is never one of the region's offers. One read scoped to the set and to TCGplayer, capped like setOfferGroups.
 */
export async function setMarketplaceOffers(setCode: string): Promise<Map<string, UsMarketplaceOffer>> {
  const rows = await prisma.offer.findMany({
    where: { store: TCGPLAYER.key, product: { setCode } },
    take: SET_GROUPS_TAKE,
    select: { title: true, url: true, priceCents: true, inStock: true, lastSeen: true, product: { select: { slug: true } } },
  });
  return new Map(rows.map(({ product, lastSeen, ...o }) => [product.slug, { ...o, lastSeen: lastSeen.toISOString() }]));
}

/**
 * How far a set reaches across all seven markets: the distinct stores (never a marketplace) that list any of its products, and the
 * markets those stores are in. One GROUP BY by store, scoped to the set: at most one small row per store.
 */
export async function setStoreReach(setCode: string): Promise<{ stores: number; markets: number }> {
  const rows = await prisma.offer.groupBy({ by: ["store"], where: { store: { not: TCGPLAYER.key }, product: { setCode } } });
  const markets = new Set(rows.flatMap((r) => STORE_BY_KEY.get(r.store)?.market ?? []));
  return { stores: rows.length, markets: markets.size };
}

// The headline set products a buyer prices a new set by. The release calendar
// and the set page's "cheapest way to buy packs" strip read these.
export const CALENDAR_TYPES = ["Booster Box", "Elite Trainer Box", "Booster Bundle"];

/**
 * Release calendar: for the given sets, the cheapest OPEN booster box, ETB and
 * bundle in the market. One scoped read: a handful of sets × three types.
 */
export async function calendarProducts(market: Market, setCodes: string[]): Promise<Map<string, ProductCardData[]>> {
  const out = new Map<string, ProductCardData[]>();
  if (!setCodes.length) return out;
  const rows = await prisma.productStat.findMany({
    where: { market, ...OPEN, product: { setCode: { in: setCodes }, productType: { in: CALENDAR_TYPES } } },
    take: setCodes.length * CALENDAR_TYPES.length * 3,
    select: cardSelect,
  });
  for (const p of sortCards(rows.map(toCard))) {
    const list = out.get(p.setCode!) ?? out.set(p.setCode!, []).get(p.setCode!)!;
    if (!list.some((x) => x.productType === p.productType)) list.push(p); // cheapest per type: sortCards put it first
  }
  return out;
}

/**
 * The markets that list a product of this set / of this type — the regions its
 * set or type page is indexable in (the page is noindex where it lists
 * nothing), for hreflang. One small GROUP BY: at most seven rows.
 */
export async function marketsWithSet(setCode: string): Promise<Market[]> {
  const rows = await prisma.productStat.groupBy({ by: ["market"], where: { product: { setCode } } });
  return rows.map((r) => r.market as Market);
}

export async function marketsWithType(typeLabel: string): Promise<Market[]> {
  const rows = await prisma.productStat.groupBy({ by: ["market"], where: { product: { productType: typeLabel } } });
  return rows.map((r) => r.market as Market);
}

/** Passes the browse/sitemap bar in a market: something to buy or something to compare (COMPARABLE, for one row). */
export function comparable(s: { inStockStores: number; listedStores: number; marketplaceOpen: boolean }): boolean {
  return s.inStockStores > 0 || s.marketplaceOpen || s.listedStores >= 2;
}
