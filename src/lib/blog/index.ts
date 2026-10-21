// The blog: dated posts at /blog/<slug>, region-less (one canonical URL), each built from the stores' live listings in every market
// we compare. This file is the registry. It is pure (no database, no React), so the sitemap, the OG route, next.config.js's tests
// and tests/guides.test.ts read it as it stands.
//
// The posts are the old MTG Compare's (a singles site until 2026-10-21) where their subject still makes sense for sealed product,
// at their old slugs, so their URLs keep working. The singles-only posts (card prices, rarities, price movers…) are DROPPED_POSTS:
// next.config.js sends each to /blog with a 308. Old /guides/<slug> posts are sent to their /blog/<slug> or to /blog.
//
// The writing rules are the guides' (src/content/guides/index.ts): only facts we are sure of, with their source; live numbers say
// "today"; no currency conversion; nothing may match BANNED_COPY; no pull rates, EV, investment or trend claims.

export type PostSlug =
  | "magic-star-trek-release-date-products"
  | "magic-star-trek-commander-decks"
  | "magic-star-trek-mechanics-explained"
  | "where-to-buy-magic-star-trek"
  | "cheapest-magic-booster-boxes"
  | "magic-booster-box-prices"
  | "where-to-buy-magic-cards"
  | "are-magic-cards-cheaper-abroad";

export interface Post {
  slug: PostSlug;
  title: string;
  description: string;
  kicker: string;
  /** First published (the old site's date, kept), and last substantively edited (the sealed rewrite). */
  published: string;
  updated: string;
}

const SEALED = "2026-10-21";

/** Newest first. */
export const POSTS: readonly Post[] = [
  {
    slug: "magic-star-trek-release-date-products",
    title: "MTG Star Trek release date, prerelease and every product",
    description: "When Magic: The Gathering | Star Trek comes out, its prerelease and Arena dates, every sealed product and what it holds, with today's prices in each market.",
    kicker: "Star Trek",
    published: "2026-10-16",
    updated: SEALED,
  },
  {
    slug: "magic-star-trek-commander-decks",
    title: "MTG Star Trek Commander decks: all 4 precons explained",
    description: "The four Star Trek Commander decks and their Collector's Editions: what each holds, the colours and themes reported so far, and today's prices.",
    kicker: "Star Trek",
    published: "2026-10-16",
    updated: SEALED,
  },
  {
    slug: "magic-star-trek-mechanics-explained",
    title: "MTG Star Trek mechanics: assimilate, federation, dilemma",
    description: "The new mechanics of Magic: The Gathering | Star Trek in Wizards of the Coast's own words, the set's Booster Fun, and where its boosters are in stock.",
    kicker: "Star Trek",
    published: "2026-10-16",
    updated: SEALED,
  },
  {
    slug: "where-to-buy-magic-star-trek",
    title: "Where to buy MTG Star Trek: pre-order prices by market",
    description: "Star Trek booster boxes, Bundles and Commander decks at the stores we compare in seven markets, each in its own currency, with the US MSRP.",
    kicker: "Star Trek",
    published: "2026-10-14",
    updated: SEALED,
  },
  {
    slug: "cheapest-magic-booster-boxes",
    title: "The cheapest Magic booster boxes in stock",
    description: "The cheapest Magic: The Gathering booster boxes in stock in each market we compare today, with the price per pack where the pack count is certain.",
    kicker: "Booster boxes",
    published: "2026-10-14",
    updated: SEALED,
  },
  {
    slug: "magic-booster-box-prices",
    title: "Magic booster box prices: the dearest boxes in stock",
    description: "The most expensive Magic: The Gathering booster boxes in stock in each market today, and how Play, Collector, Draft and Set Booster boxes differ.",
    kicker: "Booster boxes",
    published: "2026-10-08",
    updated: SEALED,
  },
  {
    slug: "where-to-buy-magic-cards",
    title: "Where to buy Magic: The Gathering sealed: 7 markets compared",
    description: "How many stores sell Magic sealed in the US, the UK, Australia, Canada, New Zealand, Europe and Singapore, what's in stock today, and who carries the most.",
    kicker: "Where to buy",
    published: "2026-10-08",
    updated: SEALED,
  },
  {
    slug: "are-magic-cards-cheaper-abroad",
    title: "Is Magic sealed cheaper abroad? Box prices by market",
    description: "The same Magic booster box in seven markets, each at its own store price and currency, and what importing one adds once postage and tax are counted.",
    kicker: "Across markets",
    published: "2026-10-08",
    updated: SEALED,
  },
];

/** The old site's posts with no sealed subject: each is a 308 to /blog (next.config.js). */
export const DROPPED_POSTS: readonly string[] = [
  "magic-star-trek-spoilers",
  "magic-card-price-movers",
  "commander-staples-prices",
  "cheapest-magic-mythic-rares-by-colour",
  "most-expensive-magic-cards",
  "magic-set-value-concentration",
  "newest-magic-set-chase-cards",
  "magic-card-rarities-explained",
];

/** The old site served these posts at /guides/<slug>: next.config.js sends each to its /blog/<slug>, or to /blog when dropped. */
export const OLD_GUIDE_POSTS: readonly string[] = ["where-to-buy-magic-cards", "are-magic-cards-cheaper-abroad", "magic-card-rarities-explained"];

export const POST_BY_SLUG: ReadonlyMap<string, Post> = new Map(POSTS.map((p) => [p.slug, p]));
export const postPath = (slug: string) => `/blog/${slug}`;

/** The <title>: the template adds " | MTG Compare" when the whole still fits in 65; otherwise the title alone. */
export function postMetaTitle(title: string): string | { absolute: string } {
  return title.length + " | MTG Compare".length <= 65 ? title : { absolute: title };
}
