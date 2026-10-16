import type { ReactNode } from "react";
import type { Country } from "../country";
import type { CardLite, CardMini, CatalogStats, IndexPoint, KeywordRow, MarketOverview, MarketRecords, OracleMini, SealedLite, SetLite, SiteStats } from "../data";
import type { PreorderRelease } from "../preorders";
import type { StapleRow } from "./select";

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

/** A release with a pre-order page (lib/preorders.ts PREORDER_RELEASES), as the published data holds it today: what the release posts read. */
export interface ReleaseView {
  release: PreorderRelease;
  /** The release's sets in the catalogue, main set first. */
  sets: SetLite[];
  /** The main set's release date in the catalogue, else the announced one (YYYY-MM-DD). */
  releasedOn: string;
  /** Released on or before the day of the request. */
  out: boolean;
  /** The release's sealed products (every set), in display order (orderProducts). */
  sealed: SealedLite[];
  /** Per set, in `sets` order: its listed singles in collector order (at most 100) and how many it has. */
  cards: { set: SetLite; items: CardLite[]; total: number }[];
}

/** The free movers feeds the movers post reads (the /movers lists): the headline unit of each tracked card worth at least MOVER_FLOOR_CENTS, largest move first. Empty until the history holds a week (a month for the 30-day lists). */
export interface MoversView {
  up7: CardLite[];
  down7: CardLite[];
  up30: CardLite[];
  down30: CardLite[];
}

/** The newest released expansions and, per colour group (COLOUR_GROUPS), the cheapest printing of each of their cheapest mythic rares; `treated` is the same over the special frames only. `sets` is empty when no expansion qualifies. */
export interface MythicBoards {
  sets: SetLite[];
  groups: { key: string; cards: CardLite[] }[];
  treated: CardLite[];
}

/** What the Star Trek posts look up beyond the release view (blog/star-trek.ts): the Oracle cards they name, the main set's shock lands, the mechanics' keyword pages. */
export interface StarTrekView {
  /** fold(name) -> the Oracle card, for each of NAMED_CARDS the catalogue has: the post links its name page, /cards/name/<slug>. */
  oracles: Map<string, OracleMini>;
  /** The main set's printings of the ten shock lands in our data (every treatment), in collector order. */
  shocks: CardLite[];
  /** The Star Trek mechanics that have a keyword page (a card with them is in the catalogue), with how many Oracle cards carry each. */
  keywords: KeywordRow[];
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
  /** The releases with a pre-order page (lib/preorders.ts), for the release posts. */
  releases: ReleaseView[];
  // The five optional sections below are built once per instance and data commit (context.ts, `perCommit`). null means the section could not be
  // read on this request: the post says so and never presents it as "nothing to show".
  /** The movers post: this week's and this month's risers and fallers. */
  movers: MoversView | null;
  /** The colour post: the cheapest mythic rares of the newest expansions. */
  mythics: MythicBoards | null;
  /** The staples post: COMMANDER_STAPLES (select.ts), each with its Oracle card and the printing it is priced at. */
  staples: StapleRow[] | null;
  /** The cheapest-boxes post: every released Booster Box product we list, cheapest TCGplayer market first (unpriced last). */
  cheapBoxes: SealedLite[] | null;
  /** The Star Trek posts: the cards they name, the shock lands, the keyword pages. */
  starTrek: StarTrekView | null;
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
