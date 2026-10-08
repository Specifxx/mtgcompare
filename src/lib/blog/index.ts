import { setConcentration } from "./posts/set-concentration";
import { boosterBoxes } from "./posts/booster-boxes";
import { cheaperAbroad } from "./posts/cheaper-abroad";
import { mostExpensive } from "./posts/most-expensive";
import { rarities } from "./posts/rarities";
import { setReview } from "./posts/set-review";
import { whereToBuy } from "./posts/where-to-buy";
import type { Post } from "./types";

// Newest first. Adding a post: write it in posts/, add it here — the blog
// index, sitemap, RSS feed and share images follow. Seven posts on purpose: each
// is built from the data, so a post exists only where the data can carry it.
export const POSTS: Post[] = [mostExpensive, setConcentration, setReview, boosterBoxes, rarities, whereToBuy, cheaperAbroad];

export function postBySlug(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export interface Author {
  slug: string;
  name: string;
  /** Short role line for the byline card. */
  role: string;
  bio: string;
  /** What this author covers, as the tags of the posts they write. */
  topics: string[];
}

/** File-based authors (RiftCompare's lib/blog/authors.ts): /authors/[slug] is generated from this list. */
export const AUTHORS: Author[] = [
  {
    slug: "mtg-compare-team",
    name: "MTG Compare",
    role: "The team behind the site",
    bio: "The MTG Compare team builds and runs the site: the price import, the store matching and the guides. Every figure in a post comes from our own price data.",
    topics: ["guide", "market", "buying", "collecting"],
  },
];

export const AUTHOR = {
  name: "MTG Compare",
  url: "/authors",
  bio: "The MTG Compare team builds and runs the site: the price import, the store matching and the guides. Every figure in a post comes from our own price data.",
};

/** Where a post lives: guides at /guides/[slug], everything else at /blog/[slug]. */
export function postHref(p: Pick<Post, "slug" | "category">): string {
  return p.category === "guide" ? `/guides/${p.slug}` : `/blog/${p.slug}`;
}
