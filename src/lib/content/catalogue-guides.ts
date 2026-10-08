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
    { slug: "magic-card-rarities-explained", reason: "What the rarities mean, and why they are a weak guide to price" },
    { slug: "where-to-buy-magic-cards", reason: "Which stores in your market carry Magic singles, and how they compare" },
    { slug: "are-magic-cards-cheaper-abroad", reason: "Whether a cross-market price gap survives postage and import tax" },
  ],
  sealed: [
    { slug: "magic-booster-box-prices", reason: "The dearest booster boxes, with the cheapest in-stock price in your market" },
    { slug: "where-to-buy-magic-cards", reason: "How the stores we compare differ on price and stock" },
  ],
  sets: [
    { slug: "magic-card-rarities-explained", reason: "What the rarities in a set mean for price" },
    { slug: "most-expensive-magic-cards", reason: "The priciest cards right now, with the sets they come from" },
    { slug: "magic-booster-box-prices", reason: "The dearest booster boxes, with the cheapest in-stock price in your market" },
  ],
  "price-guide": [
    { slug: "magic-card-rarities-explained", reason: "Why rarity is a weak guide to the price of a printing" },
    { slug: "most-expensive-magic-cards", reason: "The priciest Magic cards, ranked by TCGplayer market price" },
    { slug: "magic-set-value-concentration", reason: "Which sets hold the most value, and how much sits in their top cards" },
  ],
  market: [
    { slug: "most-expensive-magic-cards", reason: "Which cards make up the top end of the market" },
    { slug: "magic-set-value-concentration", reason: "Which sets hold the most value, and how concentrated it is" },
  ],
  movers: [
    { slug: "most-expensive-magic-cards", reason: "The priciest cards right now, with the sets they come from" },
    { slug: "are-magic-cards-cheaper-abroad", reason: "Why a price gap between markets is not always a bargain" },
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
      title: p.title({ cat: { pricesAt: new Date().toISOString() } }),
      href: postHref(p),
      reason: g.reason,
    });
    if (out.length >= limit) break;
  }
  return out;
}
