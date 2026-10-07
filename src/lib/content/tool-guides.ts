import { POSTS } from "@/lib/blog";
import type { Catalog } from "@/lib/data";

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
// OP Compare's writing lives at /blog/<slug> (lib/blog); the catalogue track's
// guides can join an entry once they exist. Pure and in-memory: safe on any
// ISR page with no query and no cache.

export type RelatedGuide = { slug: string; title: string; href: string; reason: string };
type GuideRef = { slug: string; reason: string };
type ToolEntry = { label: string; guides: readonly GuideRef[] };

export const TOOL_GUIDES = {
  "/tools": {
    label: "All tools",
    guides: [
      { slug: "where-to-buy-one-piece-cards", reason: "How the six markets we cover compare for singles and sealed" },
      { slug: "one-piece-booster-box-prices", reason: "What a booster box costs in each market, and where it is cheapest" },
      { slug: "are-one-piece-cards-cheaper-abroad", reason: "Whether a cross-market price gap survives postage and import tax" },
    ],
  },
  "/tools/best-basket": {
    label: "Best Basket",
    guides: [
      { slug: "where-to-buy-one-piece-cards", reason: "Which stores in your market carry One Piece singles, and how they compare" },
      { slug: "cheapest-one-piece-leaders", reason: "The cheapest Leaders to build around, priced in your market" },
      { slug: "are-one-piece-cards-cheaper-abroad", reason: "What buying from another market adds once postage and tax are counted" },
    ],
  },
  "/tools/box-ev": {
    label: "Booster box EV calculator",
    guides: [
      { slug: "one-piece-booster-box-prices", reason: "Where the box itself is cheapest to buy, market by market" },
      { slug: "one-piece-card-rarities-explained", reason: "What Leader, SR, SEC, Parallel, SP, Treasure and Manga rarities are" },
    ],
  },
  "/tools/deal-finder": {
    label: "Deal Finder",
    guides: [
      { slug: "are-one-piece-cards-cheaper-abroad", reason: "Where real price gaps between markets come from, and when they close" },
      { slug: "where-to-buy-one-piece-cards", reason: "How the stores we compare differ on price and stock" },
    ],
  },
  "/tools/rising": {
    label: "Rising Cards",
    guides: [
      { slug: "most-expensive-one-piece-cards", reason: "The priciest cards right now and what most of them have in common" },
      { slug: "one-piece-card-rarities-explained", reason: "Why two printings of one card can be priced far apart" },
    ],
  },
  "/tools/demand": {
    label: "Demand Finder",
    guides: [
      { slug: "most-expensive-one-piece-cards", reason: "The cards collectors chase most, priced in your market" },
      { slug: "cheapest-one-piece-leaders", reason: "The Leaders players build around without spending much" },
    ],
  },
  "/tools/selling-fees": {
    label: "Selling fee calculator",
    guides: [
      { slug: "where-to-buy-one-piece-cards", reason: "The marketplaces and stores One Piece cards sell through" },
    ],
  },
  "/trade": {
    label: "Trade calculator",
    guides: [
      { slug: "one-piece-card-rarities-explained", reason: "How rarity and printing change a card's value on both sides of a trade" },
      { slug: "most-expensive-one-piece-cards", reason: "Where the top of the market sits right now" },
    ],
  },
  "/deck": {
    label: "Deck builder",
    guides: [
      { slug: "cheapest-one-piece-leaders", reason: "Budget Leaders and what their decks cost to build" },
      { slug: "where-to-buy-one-piece-cards", reason: "Where to buy the singles a list needs" },
    ],
  },
  "/decks": {
    label: "Deck library",
    guides: [
      { slug: "cheapest-one-piece-leaders", reason: "Budget Leaders and what their decks cost to build" },
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
    out.push({ slug: p.slug, title: p.title({ cat: { pricesAt: new Date().toISOString() } as Catalog }), href: `/blog/${p.slug}`, reason: g.reason });
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
