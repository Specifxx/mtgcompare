import { POSTS, postHref } from "@/lib/blog";

// ─────────────────────────────────────────────────────────────────────────────
// Tool ↔ guide: which of our posts explains each tool or data page, and — read
// the other way round — which tools each post is about (RiftCompare's
// lib/content/tool-guides.ts). One map, read both ways, so the two directions
// cannot drift: a tool page renders guidesForTool(route) under its data.
//
// Rules for an entry (RiftCompare, "Blog and tools, joined up"):
//  - at most three guides, most useful first — more reads as a link farm;
//  - each `reason` says what the POST covers, never a claim about the tool the
//    post does not make;
//  - only published posts (a retired slug drops out rather than rendering a
//    dead link), never a retired tool;
//  - no invest/flip framing.
//
// MTG Compare's writing lives at /blog/<slug> and /guides/<slug> (lib/blog); the catalogue track's
// guides can join an entry once they exist. Pure and in-memory: safe on any
// ISR page with no query and no cache.

export type RelatedGuide = { slug: string; title: string; href: string; reason: string };
type GuideRef = { slug: string; reason: string };
type ToolEntry = { label: string; guides: readonly GuideRef[] };

export const TOOL_GUIDES = {
  "/tools": {
    label: "All tools",
    guides: [
      { slug: "where-to-buy-magic-cards", reason: "How the six markets we cover compare for singles and sealed" },
      { slug: "magic-booster-box-prices", reason: "The dearest booster boxes, with the cheapest in-stock price in your market" },
      { slug: "are-magic-cards-cheaper-abroad", reason: "Whether a cross-market price gap survives postage and import tax" },
    ],
  },
  "/tools/best-basket": {
    label: "Best Basket",
    guides: [
      { slug: "where-to-buy-magic-cards", reason: "Which stores in your market carry Magic singles, and how they compare" },
      { slug: "are-magic-cards-cheaper-abroad", reason: "What buying from another market adds once postage and tax are counted" },
    ],
  },
  "/tools/box-ev": {
    label: "Booster box EV calculator",
    guides: [
      { slug: "magic-booster-box-prices", reason: "Where the box itself is cheapest to buy, market by market" },
      { slug: "magic-card-rarities-explained", reason: "What the four booster rarities mean, and how price bands split by rarity" },
    ],
  },
  "/tools/deal-finder": {
    label: "Deal Finder",
    guides: [
      { slug: "are-magic-cards-cheaper-abroad", reason: "Where real price gaps between markets come from, and when they close" },
      { slug: "where-to-buy-magic-cards", reason: "How the stores we compare differ on price and stock" },
    ],
  },
  "/tools/rising": {
    label: "Rising Cards",
    guides: [
      { slug: "most-expensive-magic-cards", reason: "The priciest cards right now, with the sets they come from" },
      { slug: "magic-card-rarities-explained", reason: "Why two printings of one card can be priced far apart" },
    ],
  },
  "/tools/demand": {
    label: "Demand Finder",
    guides: [
      { slug: "most-expensive-magic-cards", reason: "The cards collectors chase most, with their market prices" },
      { slug: "magic-set-value-concentration", reason: "Which sets hold the most value, and how much sits in their top cards" },
    ],
  },
  "/tools/selling-fees": {
    label: "Selling fee calculator",
    guides: [
      { slug: "where-to-buy-magic-cards", reason: "The marketplaces and stores Magic cards sell through" },
    ],
  },
  "/trade": {
    label: "Trade calculator",
    guides: [
      { slug: "magic-card-rarities-explained", reason: "How rarity changes a card's value, with price bands for each rarity" },
      { slug: "most-expensive-magic-cards", reason: "Where the top of the market sits right now" },
    ],
  },
  "/deck": {
    label: "Deck builder",
    guides: [
      { slug: "where-to-buy-magic-cards", reason: "Where to buy the singles a list needs" },
      { slug: "are-magic-cards-cheaper-abroad", reason: "Whether buying a list from another market survives postage" },
    ],
  },
  "/decks": {
    label: "Deck library",
    guides: [
      { slug: "where-to-buy-magic-cards", reason: "Where to buy the singles a deck list needs, market by market" },
    ],
  },
} as const satisfies Record<string, ToolEntry>;

export type ToolRoute = keyof typeof TOOL_GUIDES;
export const TOOL_ROUTES = Object.keys(TOOL_GUIDES) as ToolRoute[];

/**
 * The posts that explain this tool, resolved against the PUBLISHED posts — a
 * retired slug drops out rather than rendering a dead link.
 */
export function guidesForTool(route: ToolRoute, limit = 3): RelatedGuide[] {
  const bySlug = new Map(POSTS.map((p) => [p.slug, p]));
  const out: RelatedGuide[] = [];
  for (const g of TOOL_GUIDES[route].guides) {
    const p = bySlug.get(g.slug);
    if (!p) continue;
    out.push({ slug: p.slug, title: p.title({ cat: { pricesAt: new Date().toISOString() } }), href: postHref(p), reason: g.reason });
    if (out.length >= limit) break;
  }
  return out;
}

/** The tools a post is about: every TOOL_GUIDES route that lists it, in map order, minus `exclude`, capped. */
export function toolsForArticle(slug: string, exclude?: string, limit = 3): { href: ToolRoute; label: string }[] {
  const out: { href: ToolRoute; label: string }[] = [];
  for (const route of TOOL_ROUTES) {
    if (route === exclude) continue;
    if (!TOOL_GUIDES[route].guides.some((g) => g.slug === slug)) continue;
    out.push({ href: route, label: TOOL_GUIDES[route].label });
    if (out.length >= limit) break;
  }
  return out;
}
