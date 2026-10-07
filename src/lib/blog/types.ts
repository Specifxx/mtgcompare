import type { ReactNode } from "react";
import type { Country } from "../country";
import type { Catalog, CardLite, IndexPoint, SealedLite, SiteStats } from "../data";

// Every post is built from OP Compare's own price database at request time
// (through the same cached loaders as the price pages), so a figure in a post
// always matches the card page it links to. A sentence that needs a fact prints
// only when the fact exists.
export interface PostContext {
  cat: Catalog;
  sealed: SealedLite[];
  stats: SiteStats;
  index: IndexPoint[];
  country: Country;
}

export interface PostSection {
  id: string;
  title: string;
  body: ReactNode;
}

export interface PostBody {
  /** "The short version" — 3–5 bullets. */
  summary: ReactNode[];
  /** Opening paragraph(s), above the table of contents. */
  lede: ReactNode;
  sections: PostSection[];
  /** Up to three cards for the hero strip and share image. */
  heroCards: CardLite[];
}

export interface Post {
  slug: string;
  /** May include the current month ("… (October 2026)") — computed per render. */
  title: (ctx: Pick<PostContext, "cat">) => string;
  description: string;
  tags: string[];
  date: string; // YYYY-MM-DD published
  /** "blog" (news and set reviews, dated) or "guide" (evergreen, served at /guides/[slug]). Default "blog". */
  category?: "blog" | "guide";
  /** Visible FAQ and FAQPage JSON-LD from one array (ArticleFaq). */
  faq?: { q: string; a: string }[];
  /** Show the live per-market store counts (ArticleMarketData) after the lede: where-to-buy and cheaper-abroad. */
  marketData?: boolean;
  minutes: number;
  /** Related site pages for the "data behind this post" strip. */
  related: { href: string; label: string }[];
  build: (ctx: PostContext) => PostBody;
}
