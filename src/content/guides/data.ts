// The live numbers in the guides: small, scoped reads of the region's current ProductStat and StoreStat rows, made once per render
// (the page is force-dynamic and kept by the CDN for a day). Every read is one market, selects only what a card shows and is capped:
// a guide reads at most about 60 small rows per render. The reads themselves are src/content/live.ts's, shared with the blog.
import { prisma } from "@/lib/db";
import { cardSelect, OPEN, toCard, type ProductCardData } from "@/lib/data";
import type { Market, RegionInfo } from "@/lib/regions";
import { familyIn, lastCheckedIn, topStores, type FamilyKey, type StoreRow } from "../live";
import type { GuideSlug } from "./index";

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
};

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
  return { ...emptyGuideData(today, await checked), rows, stores, types };
}
