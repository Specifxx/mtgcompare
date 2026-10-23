// The live numbers in the guides: small, scoped reads of the region's current ProductStat and StoreStat rows, made once per render
// (the page is force-dynamic and kept by the CDN for a day). Every read is one market, selects only what a card shows and is capped:
// a guide reads at most about 60 small rows per render. The reads themselves are src/content/live.ts's, shared with the blog.
import { prisma } from "@/lib/db";
import { cardSelect, OPEN, toCard, type ProductCardData } from "@/lib/data";
import type { Market, RegionInfo } from "@/lib/regions";
import { familyIn, lastCheckedIn, topStores, type FamilyKey, type StoreRow } from "../live";
import type { GuideSlug } from "./index";
import { BOX_LABELS, GIFT_CAP, GIFT_TYPES, PER_PACK_TYPES, cardsFor, openCount, openOfSets, openOfType, setCountsOf, wrapFor, type Wrap } from "./more-data";
import { SETS } from "@/lib/sets";

export type { StoreRow };

/** One product type's open listings in a market (typeSummary): how many are open, and the cheapest open price. */
export interface TypeSummaryRow {
  productType: string;
  open: number;
  fromCents: number | null;
}

/** What a guide's live blocks render. Each guide fills what it uses; the rest stays empty. */
export interface GuideData {
  /** When the region's stores were last read (ISO): the byline's and every live block's "prices checked". Null before the first import. */
  checked: string | null;
  /** The day the page rendered (YYYY-MM-DD, UTC). */
  today: string;
  /** Per product family (src/content/live.ts FAMILIES), or per a guide's own key: open products, in the order the block shows them. */
  rows: Partial<Record<string, ProductCardData[]>>;
  /** typeSummary: per product type label. */
  types: TypeSummaryRow[];
  /** The region's stores with the most sealed Magic in stock (at most 12 rows). */
  stores: StoreRow[];
  /** Per product type label: open products, as the guide's EXTRA read orders them (more-data.ts). */
  byType?: Partial<Record<string, ProductCardData[]>>;
  /** Per product type label: how many are open in the region. */
  openByType?: Partial<Record<string, number>>;
  /** Per set code: products listed and open (the release calendar, Universes Beyond). */
  sets?: Record<string, { products: number; open: number }>;
  /** The weekly wrap's real week-over-week moves (from the price-history file), and the cards they name. */
  wrap?: Wrap;
  cards?: ProductCardData[];
}

export const emptyGuideData = (today: string, checked: string | null = null): GuideData => ({ checked, today, rows: {}, types: [], stores: [] });

/** Per product type, the market's open listings: one groupBy over ProductStat, then the product type of each (at most ~30 rows). */
export async function typeSummary(market: Market): Promise<TypeSummaryRow[]> {
  const rows = await prisma.productStat.findMany({
    where: { market, ...OPEN, lowestPriceCents: { gt: 0 } },
    take: 4000,
    select: { lowestPriceCents: true, product: { select: { productType: true } } },
  });
  const acc = new Map<string, TypeSummaryRow>();
  for (const r of rows) {
    const t = r.product.productType;
    const a = acc.get(t) ?? { productType: t, open: 0, fromCents: null };
    a.open++;
    if (r.lowestPriceCents != null && (a.fromCents == null || r.lowestPriceCents < a.fromCents)) a.fromCents = r.lowestPriceCents;
    acc.set(t, a);
  }
  return [...acc.values()].sort((a, b) => b.open - a.open).slice(0, 20);
}

/** Which families a guide reads, and how many of each (cheapest first). */
const READS: Record<GuideSlug, readonly [FamilyKey, number][]> = {
  "play-booster-vs-collector-booster-vs-bundle": [["play-box", 3], ["collector-box", 3], ["bundle", 3], ["play-pack", 2], ["collector-pack", 2]],
  "how-many-packs-in-magic-products": [["play-box", 2], ["collector-box", 2], ["draft-box", 2], ["set-box", 2], ["bundle", 2]],
  "magic-sealed-products-explained": [["play-box", 1], ["collector-box", 1], ["bundle", 1], ["commander", 1], ["prerelease", 1], ["play-pack", 1], ["collector-pack", 1]],
  "is-a-collector-booster-box-worth-it": [["collector-box", 6], ["collector-pack", 3], ["play-box", 2]],
  "how-to-preorder-magic-sets": [],
  "how-to-avoid-resealed-magic-products": [["play-box", 3], ["collector-box", 3]],
  "where-to-buy-magic-sealed-online": [],
  "magic-msrp": [],
  "cheapest-way-to-buy-magic-packs": [],
  "play-vs-collector-booster-box-value-by-set": [],
  "universes-beyond-sealed-price-guide": [],
  "commander-precon-price-guide": [],
  "secret-lair-drops-explained": [],
  "magic-sealed-gifts-under-50": [],
  "magic-release-dates-preorder-calendar": [],
  "magic-sealed-market-wrap": [],
  "mtg-booster-box-prices": [],
  "collector-booster-box-prices": [],
  "mtg-bundle-prices": [],
};

const UB_CODES = SETS.filter((x) => x.series === "Universes Beyond").map((x) => x.code);
/** The calendar's sets: every set out in the last 365 days or not out yet. */
export function calendarSets(today: string) {
  const back = new Date(Date.parse(`${today}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
  return SETS.filter((x) => x.releaseDate >= back);
}

/** The new guides' own reads (more-data.ts), by slug: what fills byType, openByType, sets and wrap. */
async function extraFor(slug: GuideSlug, market: RegionInfo["market"], today: string): Promise<Partial<GuideData>> {
  const types = async (labels: readonly string[], take: number, order: "asc" | "desc" = "asc", extra: Record<string, unknown> = {}) =>
    Object.fromEntries(await Promise.all(labels.map(async (l) => [l, await openOfType(market, l, take, order, extra)] as const)));
  const counts = async (labels: readonly string[]) => Object.fromEntries(await Promise.all(labels.map(async (l) => [l, await openCount(market, l)] as const)));
  switch (slug) {
    case "cheapest-way-to-buy-magic-packs":
      return { byType: await types(PER_PACK_TYPES, 40), openByType: await counts(PER_PACK_TYPES) };
    case "play-vs-collector-booster-box-value-by-set":
      return { byType: await types(["Play Booster Box", "Collector Booster Box"], 200) };
    case "universes-beyond-sealed-price-guide":
      return { byType: { ub: await openOfSets(market, UB_CODES, 400) }, sets: await setCountsOf(market, UB_CODES) };
    case "commander-precon-price-guide":
      return { byType: await types(["Commander Deck", "Commander Deck Set"], 12), openByType: await counts(["Commander Deck", "Commander Deck Set"]) };
    case "secret-lair-drops-explained": {
      const [cheap, dear] = await Promise.all([openOfType(market, "Secret Lair Drop", 8), openOfType(market, "Secret Lair Drop", 3, "desc")]);
      return { byType: { cheapest: cheap, dearest: dear }, openByType: await counts(["Secret Lair Drop"]) };
    }
    case "magic-sealed-gifts-under-50":
      // Dearest first under the cap: the most a gift of that kind gets for the money, in the region's own currency.
      return { byType: await types(GIFT_TYPES, 4, "desc", { lte: GIFT_CAP[market] }) };
    case "magic-release-dates-preorder-calendar":
      return { sets: await setCountsOf(market, calendarSets(today).map((x) => x.code)) };
    case "magic-sealed-market-wrap": {
      const wrap = wrapFor(market);
      return { wrap, cards: await cardsFor(market, [...wrap.lower, ...wrap.higher].map((m) => m.slug)) };
    }
    case "mtg-booster-box-prices":
      return { byType: await types(BOX_LABELS, 120), openByType: await counts(BOX_LABELS) };
    case "collector-booster-box-prices": {
      const [cheap, dear, n] = await Promise.all([openOfType(market, "Collector Booster Box", 120), openOfType(market, "Collector Booster Box", 3, "desc"), openCount(market, "Collector Booster Box")]);
      return { byType: { "Collector Booster Box": cheap, dearest: dear }, openByType: { "Collector Booster Box": n } };
    }
    case "mtg-bundle-prices":
      return { byType: await types(["Bundle", "Play Booster Box"], 80), openByType: await counts(["Bundle"]) };
    default:
      return {};
  }
}

/** The guides that also read named products (a release's own sealed line), by the words its names contain. */
const NAMED: Partial<Record<GuideSlug, string>> = {
  "how-to-preorder-magic-sets": "Star Trek",
  "magic-msrp": "Star Trek",
};

/** Load what a guide's live blocks show, for one region. */
export async function loadGuideData(slug: GuideSlug, r: RegionInfo, now: Date = new Date()): Promise<GuideData> {
  const today = now.toISOString().slice(0, 10);
  const checked = lastCheckedIn(r.market);
  const reads = READS[slug].map(async ([k, n]) => [k, await familyIn(r.market, k, n)] as const);
  const named = NAMED[slug];
  const [lists, namedRows, stores, types] = await Promise.all([
    Promise.all(reads),
    named
      ? prisma.productStat
          .findMany({
            where: { market: r.market, ...OPEN, lowestPriceCents: { gt: 0 }, product: { name: { contains: named, mode: "insensitive" } } },
            orderBy: { lowestPriceCents: "asc" },
            take: 40,
            select: cardSelect,
          })
          .then((rows) => rows.map(toCard))
      : Promise.resolve([] as ProductCardData[]),
    slug === "where-to-buy-magic-sealed-online" ? topStores(r.market, 12) : Promise.resolve([] as StoreRow[]),
    slug === "where-to-buy-magic-sealed-online" || slug === "magic-sealed-products-explained" ? typeSummary(r.market) : Promise.resolve([] as TypeSummaryRow[]),
  ]);
  const rows: GuideData["rows"] = Object.fromEntries(lists);
  if (named) rows.named = namedRows;
  const extra = await extraFor(slug, r.market, today);
  return { ...emptyGuideData(today, await checked), rows, stores, types, ...extra };
}
