import type { ReactNode } from "react";
import type { Country } from "../country";
import type { CardLite, CardMini, CatalogStats, IndexPoint, MarketOverview, MarketRecords, SealedLite, SetLite, SiteStats } from "../data";

// Every post is built from MTG Compare's published price data at request time
// (through the same cached, bounded loaders as the price pages), so a figure in
// a post always matches the card page it links to. A sentence that needs a fact
// prints only when the fact exists. The context holds only bounded views of the
// data (the dearest hundred cards, one set's board, the Booster Box list): no
// post scans the catalogue.
export interface RarityRow {
  rarity: string;
  label: string;
  /** Listed printings of this rarity (headline unit, class 0). */
  total: number;
  /** How many of them have a TCGplayer market price of at least US$1, US$10 and US$100. */
  over1: number;
  over10: number;
  over100: number;
}

export interface SetBoard {
  set: SetLite;
  /** Listed printings with a market price, and their summed TCGplayer market price in US cents. */
  n: number;
  total: number;
  /** The set's five dearest cards. */
  top: CardMini[];
}

export interface PostContext {
  /** The day the prices are from; a title may quote its month. */
  cat: { pricesAt: string };
  stats: CatalogStats;
  site: SiteStats;
  index: IndexPoint[];
  sets: SetLite[];
  setById: Map<number, SetLite>;
  overview: MarketOverview;
  /** Cross-market store gaps for each market as the home market. */
  records: Record<Country, MarketRecords>;
  /** The 100 dearest listed cards by TCGplayer market price (headline unit), dearest first. */
  top: CardLite[];
  /** The 20 dearest foil units. */
  topFoil: CardLite[];
  rarities: RarityRow[];
  /** The newest released expansion, core, masters or Commander set that has priced cards, with its dearest cards. */
  newest: { set: SetLite; cards: CardLite[]; total: number; priced: number } | null;
  /** The sixteen most valuable released sets of the main kinds, with their dearest cards. */
  boards: SetBoard[];
  /** The dearest Booster Box products, dearest first (up to 40). */
  boxes: SealedLite[];
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
  /** May include the current month ("… (October 2026)") — computed per render. Takes only the day of the prices, so feeds and sitemaps can title a post without building it (postTitle in lib/seo.ts). */
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
