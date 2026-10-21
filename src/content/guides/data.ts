// The live numbers in the guides: small, scoped reads of the region's current ProductStat rows, made once per ISR render (the
// guide pages revalidate daily and after each import). Every read is one market, selects only what a card shows and is capped:
// a guide reads at most about 40 rows (about 20 KB) per render (src/lib/db.ts rules 1–2). No unstable_cache: the page is the cache.
//
// Sources, and nothing else: the existing loaders (calendarProducts, productsBySet, lastCheckedAt), typeSummary below (one GROUP BY,
// at most 16 rows) and, for the booster-box guide only, one query for the pack types of three sets.
import { calendarProducts, CALENDAR_TYPES, cardSelect, lastCheckedAt, OPEN, productsBySet, sortCards, toCard, type ProductCardData } from "@/lib/data";
import { cardOpen } from "@/lib/compact";
import { prisma } from "@/lib/db";
import { isOpen, statsInMarket } from "@/lib/public-data/joins";
import { routeRaw } from "@/lib/public-data/route";
import type { Market, RegionInfo } from "@/lib/regions";
import { packsFor, packsForLabel, perPackCents } from "@/lib/packs";
import { usMsrpCents } from "@/lib/rrp";
import type { GuideSlug } from "./index";
import { buildBattleSets, isReleased, newestReleased, upcomingSets } from "./facts";

/** One product type's open listings in a market (typeSummary): in stock and on pre-order counted apart, and the in-stock from-price. */
export interface TypeSummaryRow {
  productType: string;
  /** Open products of released sets (or of no set): in stock at a store, or on TCGplayer in the US. */
  inStock: number;
  /** Open products of sets still to be released: pre-orders. */
  preorder: number;
  /** The lowest in-stock price, in the market's currency (cents). */
  fromCents: number | null;
}

/** What a guide's live blocks render. Each guide fills what it uses; the rest stays empty. */
export interface GuideData {
  /** When the region's stores were last read (ISO): the byline's and every live block's "prices checked". Null before the first import. */
  checked: string | null;
  /** The day the page rendered (YYYY-MM-DD, UTC): what "released" and "upcoming" are judged against. */
  today: string;
  /** The sets the live block covers, in the order it shows them. */
  sets: string[];
  /** Per set code: its OPEN products the block prices, cheapest first. */
  bySet: Record<string, ProductCardData[]>;
  /** Per set code: how many of its products are open (the pre-order guide's "open for pre-order" count). */
  openCount: Record<string, number>;
  /** typeSummary: per product type label. */
  types: TypeSummaryRow[];
  /** The cheapest-packs guide: per pack type, the open product with the lowest price per pack (released sets only). */
  cards: ProductCardData[];
  /** The where-to-buy guide: the region's stores with the most Pokémon sealed in stock (StoreStat, at most 12 rows). */
  stores: StoreRow[];
}

/** One store's current counts (StoreStat), for the where-to-buy guide. */
export interface StoreRow {
  store: string;
  inStock: number;
  listed: number;
}

export const emptyGuideData = (today: string, checked: string | null = null): GuideData => ({
  checked,
  today,
  sets: [],
  bySet: {},
  openCount: {},
  types: [],
  cards: [],
  stores: [],
});

/** The pack-bearing types the booster-box guide prices within a set: a box against a bundle and against single packs. */
export const BOX_GUIDE_TYPES = ["Booster Box", "Booster Bundle", "Sleeved Booster", "Booster Pack"];

/**
 * Per product type, the market's open listings: one GROUP BY over ProductStat ⋈ Product, at most 16 rows (one per type) and about
 * 1 KB. Products of a set not yet released count as pre-orders, the rest as in stock; the from-price is the in-stock one.
 */
export async function typeSummary(market: Market, upcoming: string[]): Promise<TypeSummaryRow[]> {
  const fromFiles = (): TypeSummaryRow[] => {
    const acc = new Map<string, TypeSummaryRow>();
    for (const { s, p } of statsInMarket(market)) {
      if (!isOpen(s)) continue;
      const type = String(p.productType);
      const a = acc.get(type) ?? ({ productType: type, inStock: 0, preorder: 0, fromCents: null } as TypeSummaryRow);
      const pre = p.setCode != null && upcoming.includes(String(p.setCode));
      if (pre) a.preorder++;
      else {
        a.inStock++;
        const c = s.lowestPriceCents as number | null;
        if (c !== null && (a.fromCents === null || c < a.fromCents)) a.fromCents = c;
      }
      acc.set(type, a);
    }
    return [...acc.values()].slice(0, 16);
  };
  return routeRaw(fromFiles, () => prisma.$queryRaw<TypeSummaryRow[]>`
    SELECT p."productType" AS "productType",
      (count(*) FILTER (WHERE NOT coalesce(p."setCode" = ANY(${upcoming}::text[]), false)))::int AS "inStock",
      (count(*) FILTER (WHERE coalesce(p."setCode" = ANY(${upcoming}::text[]), false)))::int AS "preorder",
      min(s."lowestPriceCents") FILTER (WHERE NOT coalesce(p."setCode" = ANY(${upcoming}::text[]), false)) AS "fromCents"
    FROM "ProductStat" s JOIN "Product" p ON p."id" = s."productId"
    WHERE s."market" = ${market} AND (s."inStockStores" > 0 OR s."marketplaceOpen")
    GROUP BY 1
    LIMIT 16`);
}

/** The booster-box guide's one query: the open box, bundle, sleeved booster and loose pack listings of three sets (one per set and type, so about 12 rows). */
async function packTypesOfSets(market: Market, setCodes: string[], types: string[] = BOX_GUIDE_TYPES, take = 60): Promise<ProductCardData[]> {
  if (!setCodes.length) return [];
  const rows = await prisma.productStat.findMany({
    where: { market, ...OPEN, product: { setCode: { in: setCodes }, productType: { in: types } } },
    take,
    select: cardSelect,
  });
  return sortCards(rows.map(toCard));
}

/** What the Build & Battle guide compares a Build & Battle Box with, within one set: its bundle, its ETB and its booster box. */
export const BB_COMPARE_TYPES = ["Build & Battle Box", "Booster Bundle", "Elite Trainer Box", "Booster Box"];

/** The pack types the cheapest-packs guide ranks: every type with a fixed or per-set pack count (packs.ts). */
export const PACK_GUIDE_TYPES = ["Booster Box", "Booster Bundle", "Elite Trainer Box", "Build & Battle Box", "Sleeved Booster", "Booster Pack"];

/**
 * The cheapest-packs guide's read: per pack type, the four cheapest open products of released sets (one capped read per type, at
 * most 24 rows), then the one with the lowest price per pack of each type, in PACK_GUIDE_TYPES order.
 */
async function cheapestPerPackByType(market: Market, upcoming: string[]): Promise<ProductCardData[]> {
  const lists = await Promise.all(
    PACK_GUIDE_TYPES.map((t) =>
      prisma.productStat.findMany({
        where: { market, ...OPEN, lowestPriceCents: { gt: 0 }, product: { productType: t, setCode: { not: null, notIn: upcoming } } },
        orderBy: { lowestPriceCents: "asc" },
        take: 4,
        select: cardSelect,
      }),
    ),
  );
  const out: ProductCardData[] = [];
  for (const rows of lists) {
    let best: { p: ProductCardData; pp: number } | null = null;
    for (const p of rows.map(toCard)) {
      const pp = perPackCents(p.lowestPriceCents, packsForLabel(p.productType, p.setCode, p.name));
      if (pp != null && (!best || pp < best.pp)) best = { p, pp };
    }
    if (best) out.push(best.p);
  }
  return out;
}

/** The where-to-buy guide's read: the region's active stores, most in stock first (at most 12 small rows). */
async function topStores(market: Market): Promise<StoreRow[]> {
  return prisma.storeStat.findMany({
    where: { market, dormant: false, inStock: { gt: 0 } },
    orderBy: { inStock: "desc" },
    take: 12,
    select: { store: true, inStock: true, listed: true },
  });
}

const group = (cards: ProductCardData[]): Record<string, ProductCardData[]> => {
  const out: Record<string, ProductCardData[]> = {};
  for (const p of cards) if (p.setCode) (out[p.setCode] ??= []).push(p);
  return out;
};

/** The cheapest open product of each calendar type (box, ETB, bundle) among a set's products: what calendarProducts() picks. */
export function cheapestHeadline(products: ProductCardData[]): ProductCardData[] {
  const out: ProductCardData[] = [];
  for (const p of sortCards(products.filter(cardOpen))) {
    if (CALENDAR_TYPES.includes(p.productType) && !out.some((x) => x.productType === p.productType)) out.push(p);
  }
  return out;
}

/** Load what a guide's live blocks show, for one region. */
export async function loadGuideData(slug: GuideSlug, r: RegionInfo, now: Date = new Date()): Promise<GuideData> {
  const today = now.toISOString().slice(0, 10);
  const checkedAt = lastCheckedAt(r.market).then((d) => d?.toISOString() ?? null);
  const done = async (d: Partial<Omit<GuideData, "checked" | "today">>): Promise<GuideData> => ({ ...emptyGuideData(today, await checkedAt), ...d });

  switch (slug) {
    case "how-many-packs-in-pokemon-products": {
      // The newest set with headline product in stock here: the three newest released sets are read (≤ 27 rows) and the block
      // shows the newest one that has any, so a region whose stores have not stocked the newest set yet still gets a table.
      const codes = newestReleased(today, 3).map((s) => s.code);
      const bySet = Object.fromEntries(await calendarProducts(r.market, codes));
      const pick = codes.find((c) => bySet[c]?.length) ?? codes[0];
      return done({ sets: pick ? [pick] : [], bySet: pick && bySet[pick] ? { [pick]: bySet[pick] } : {}, openCount: {}, types: [] });
    }
    case "booster-box-vs-etb-vs-booster-bundle": {
      const codes = newestReleased(today, 4).map((s) => s.code); // ≤ 36 rows
      return done({ sets: codes, bySet: Object.fromEntries(await calendarProducts(r.market, codes)), openCount: {}, types: [] });
    }
    case "are-pokemon-booster-boxes-worth-it": {
      const codes = newestReleased(today, 3, (s) => !s.noBoosterBox).map((s) => s.code);
      return done({ sets: codes, bySet: group(await packTypesOfSets(r.market, codes)), openCount: {}, types: [] });
    }
    case "pokemon-sealed-products-explained": {
      const upcoming = upcomingSets(today).map((s) => s.code);
      return done({ sets: [], bySet: {}, openCount: {}, types: await typeSummary(r.market, upcoming) });
    }
    case "pokemon-tcg-msrp": {
      // US only (the route 404s elsewhere): the four newest released sets that have a US MSRP, so nothing before Scarlet & Violet.
      const codes = newestReleased(today, 4, (s) => usMsrpCents("booster-pack", s.code) != null).map((s) => s.code); // ≤ 36 rows
      return done({ sets: codes, bySet: Object.fromEntries(await calendarProducts(r.market, codes)), openCount: {}, types: [] });
    }
    case "how-to-preorder-pokemon-tcg": {
      // The two soonest upcoming sets, each read whole (productsBySet: one set in one market, typically 5–25 rows): the open count
      // and the cheapest box, ETB and bundle both come from the same rows.
      const codes = upcomingSets(today)
        .slice(0, 2)
        .map((s) => s.code);
      const lists = await Promise.all(codes.map((c) => productsBySet(r.market, c)));
      const bySet: Record<string, ProductCardData[]> = {};
      const openCount: Record<string, number> = {};
      codes.forEach((c, i) => {
        bySet[c] = cheapestHeadline(lists[i]);
        openCount[c] = lists[i].filter(cardOpen).length;
      });
      return done({ sets: codes, bySet, openCount, types: [] });
    }
    case "whats-in-a-pokemon-elite-trainer-box": {
      // The four newest released sets' open ETBs (≤ 24 rows); the block shows each set's cheapest.
      const codes = newestReleased(today, 4).map((s) => s.code);
      return done({ sets: codes, bySet: group(await packTypesOfSets(r.market, codes, ["Elite Trainer Box"], 24)) });
    }
    case "pokemon-center-etb-vs-elite-trainer-box": {
      // The three newest released sets that have a Pokémon Center ETB count (packs.ts), their open ETBs of both kinds (≤ 30 rows).
      const codes = newestReleased(today, 3, (s) => packsFor("pc-etb", s.code) != null).map((s) => s.code);
      return done({ sets: codes, bySet: group(await packTypesOfSets(r.market, codes, ["Elite Trainer Box", "Pokémon Center Elite Trainer Box"], 30)) });
    }
    case "cheapest-way-to-buy-pokemon-packs": {
      const upcoming = upcomingSets(today).map((s) => s.code);
      return done({ cards: await cheapestPerPackByType(r.market, upcoming) });
    }
    case "where-to-buy-pokemon-cards-online": {
      const upcoming = upcomingSets(today).map((s) => s.code);
      const [stores, types] = await Promise.all([topStores(r.market), typeSummary(r.market, upcoming)]);
      return done({ stores, types });
    }
    case "pokemon-build-and-battle-box": {
      // The open Build & Battle Boxes of the soonest upcoming set and the seven newest released ones (about one per set, ≤ 16 rows
      // read), then, for the newest released set with one open here, its bundle, ETB and booster box beside it (≤ 12 rows).
      const sets = buildBattleSets(today);
      const codes = sets.map((s) => s.code);
      const bySet = group(await packTypesOfSets(r.market, codes, ["Build & Battle Box"], 16));
      const pick = sets.find((s) => isReleased(s, today) && bySet[s.code]?.length)?.code;
      const cards = pick ? await packTypesOfSets(r.market, [pick], BB_COMPARE_TYPES, 12) : [];
      return done({ sets: codes, bySet, cards });
    }
    case "how-to-avoid-resealed-pokemon-products": {
      // As the pack-count guide: the newest released set with headline product in stock here (≤ 27 rows read).
      const codes = newestReleased(today, 3).map((s) => s.code);
      const bySet = Object.fromEntries(await calendarProducts(r.market, codes));
      const pick = codes.find((c) => bySet[c]?.length) ?? codes[0];
      return done({ sets: pick ? [pick] : [], bySet: pick && bySet[pick] ? { [pick]: bySet[pick] } : {} });
    }
  }
}
