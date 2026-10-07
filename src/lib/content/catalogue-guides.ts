import { POSTS, postHref } from "@/lib/blog";
import type { RelatedGuide } from "@/lib/content/tool-guides";

// Which of our guides explains each catalogue page (card, sets, sealed, price
// guide, market, movers), read by RelatedGuides. Same rules as tool-guides.ts:
// at most three, most useful first, each `reason` says what the POST covers,
// only published posts (a retired slug drops out), no invest or flip framing.
// Kept beside tool-guides so the tools track's file is untouched.
type Ref = { slug: string; reason: string };

export const CATALOGUE_GUIDES = {
  card: [
    { slug: "one-piece-card-rarities-explained", reason: "What Leader, SR, SEC, Parallel, SP, Treasure and Manga printings are, and why they price so far apart" },
    { slug: "where-to-buy-one-piece-cards", reason: "Which stores in your market carry One Piece singles, and how they compare" },
    { slug: "are-one-piece-cards-cheaper-abroad", reason: "Whether a cross-market price gap survives postage and import tax" },
  ],
  sealed: [
    { slug: "one-piece-booster-box-prices", reason: "What a booster box costs in each market, and where it is cheapest" },
    { slug: "where-to-buy-one-piece-cards", reason: "How the stores we compare differ on price and stock" },
  ],
  sets: [
    { slug: "one-piece-card-rarities-explained", reason: "What the rarities and special printings in a set mean for price" },
    { slug: "most-expensive-one-piece-cards", reason: "The priciest cards right now, and what most of them have in common" },
    { slug: "one-piece-booster-box-prices", reason: "What a booster box of a set costs, market by market" },
  ],
  "price-guide": [
    { slug: "one-piece-card-rarities-explained", reason: "Why printings of one card are priced so far apart" },
    { slug: "most-expensive-one-piece-cards", reason: "The priciest One Piece cards and what drives them" },
    { slug: "cheapest-one-piece-leaders", reason: "Budget Leaders to build around, priced in your market" },
  ],
  market: [
    { slug: "most-expensive-one-piece-cards", reason: "Which cards the index's top end is made of" },
    { slug: "one-piece-card-rarities-explained", reason: "Why Parallel, Manga and SP printings move differently from standard prints" },
  ],
  movers: [
    { slug: "most-expensive-one-piece-cards", reason: "The priciest cards right now and what most of them have in common" },
    { slug: "are-one-piece-cards-cheaper-abroad", reason: "Why a price gap between markets is not always a bargain" },
  ],
} as const satisfies Record<string, readonly Ref[]>;

export type CatalogueGuideRoute = keyof typeof CATALOGUE_GUIDES;

export function guidesForCatalogue(route: CatalogueGuideRoute, limit = 3): RelatedGuide[] {
  const bySlug = new Map(POSTS.map((p) => [p.slug, p]));
  const out: RelatedGuide[] = [];
  for (const g of CATALOGUE_GUIDES[route] as readonly Ref[]) {
    const p = bySlug.get(g.slug);
    if (!p) continue;
    out.push({
      slug: p.slug,
      title: p.title({ cat: { pricesAt: new Date().toISOString() } as never }),
      href: postHref(p),
      reason: g.reason,
    });
    if (out.length >= limit) break;
  }
  return out;
}
