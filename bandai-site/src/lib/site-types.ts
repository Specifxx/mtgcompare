// Types shared by the engine and src/site.config.ts.
import type { FamilySiteId } from "./family-network";
import type { SetEdition } from "@/lib/import/match";

export type Market = "US" | "UK" | "CA" | "AU" | "EU" | "SG";
export const MARKETS: Market[] = ["US", "UK", "CA", "AU", "EU", "SG"];
export const CURRENCY: Record<Market, string> = {
  US: "USD",
  UK: "GBP",
  CA: "CAD",
  AU: "AUD",
  EU: "EUR",
  SG: "SGD",
};
export const MARKET_LABEL: Record<Market, string> = {
  US: "United States",
  UK: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  EU: "Europe",
  SG: "Singapore",
};

export interface StoreConfig {
  key: string;
  name: string;
  /** Origin, no trailing slash. */
  base: string;
  market: Market;
  /** Shopify collection handles that hold this game's products. */
  collections: string[];
  kind: "singles" | "sealed" | "both";
  /** Shopify Markets country to request prices in (defaults from market). */
  country?: string;
}

export interface SisterSite {
  name: string;
  url: string;
  game: string;
  /** Link text: what a searcher types ("Riftbound card prices"), the site's
   *  name after it. Without one the name is the link. */
  anchor?: string;
  /** The sister site's own search for a query, `{q}` replaced by it (its
   *  SearchAction target). Card games only: the "Searching another game?"
   *  line under /cards search results (components/FamilySearch.tsx). */
  search?: string;
}

export interface GameLine {
  /** Short stable id, stored on each set ("ua"). */
  id: string;
  /** Display name ("Dragon Ball Super Fusion World"). */
  name: string;
  /** Menu label ("Fusion World"). */
  short: string;
  /** URL segment of its hub: /games/<slug>. */
  slug: string;
  tcgcsvCategoryId: number;
  tcgplayerSlug: string;
  /** Words every eBay search for this game starts with. */
  ebayQuery: string;
  /** One or two sentences for the hub and the homepage tile. */
  blurb: string;
  /** Accent colour of the game's tile and chips. */
  color: string;
}

export interface SiteConfig {
  key: string;
  name: string;
  shortName: string;
  wordmark: [string, string];
  game: string;
  gameShort: string;
  domain: string;
  /** Serve and link the bare domain (no `www.`); the default is www. */
  apexHost?: boolean;
  /** Open the homepage with the big sealed hero (components/SealedHero.tsx) instead of the plain shelf: for sites whose
   *  earnings come from sealed and pre-orders. Off by default. */
  homeSealedHero?: boolean;
  tagline: string;
  description: string;
  keywords: string[];
  /** Hard-coded admins (owner request). ADMIN_EMAILS env adds to it. */
  adminEmails: string[];
  /** Public contact address, shown on the site. */
  supportEmail: string;
  /** Private: where the ops monitor and form notifications go. Never rendered. */
  ownerEmail: string;
  /** Impact (affiliate network) site-verification id, rendered in every page's <head>. */
  impactSiteVerification?: string;
  /** Price alerts through RiftCompare's shared alert service (DECISIONS.md, 2026-11-02): the card page's
   *  "Email me when the price drops" form and /alert-feed.json. The site's `key` must be registered there. */
  priceAlerts?: boolean;
  /** The site's own Amazon US tracking ID (hard-coded, owner 2026-11-02); riftcompare-20 when unset. */
  amazonUsTag?: string;
  /** The site's own Amazon AU tracking ID in the owner's AU account (hard-coded, owner 2026-11-03); compareempire-22 when unset. */
  amazonAuTag?: string;
  tcgcsvCategoryId: number;
  tcgplayerSlug: string;
  ebay: {
    query: string;
    singlesCategoryId: string;
    sealedCategoryId: string;
    /** Never spend a call on a CARD the market prices under this (USD). Sealed is always eligible. */
    minPriceUsd: number;
    /** This site's share of the eBay app's daily Browse quota. */
    dailyBudget: number;
    runHourUtc: number;
  };
  /** "fraction" 42/204 (Lorcana), "code" GD02-048 (Gundam), "plain" 001 / B001
   *  (Cyberpunk TCG: three digits, an optional letter, nothing else), "ygo" LOB-EN005
   *  (set code, language, number; the language is part of the key). */
  numberStyle: "fraction" | "code" | "ygo" | "plain" | "series";
  /** Several games on one site (off by default): each is its own TCGplayer
   *  category, imported together into one catalogue. A set carries its game's
   *  `id` (SetInfo.line); each game gets a hub at /games/<slug>, and eBay
   *  searches and TCGplayer links use the game's own words. When set,
   *  `tcgcsvCategoryId`, `tcgplayerSlug` and `ebay.query` are only defaults. */
  lines?: GameLine[];
  /** A sentence naming the rights holder ("BandaiCompare is not affiliated with…"), shown in
   *  the footer, /about and /terms when the brand names a company (WargameCompare's rule). Off by default. */
  disclaimer?: string;
  /** "name" (default): the first product of a name keeps the bare slug.
   *  "name-number": every card's slug carries its number ("dark-magician-lob-en005"),
   *  for games that reprint one card in dozens of sets. Slugs are decided
   *  from the whole TCGplayer listing, before any catalogue floor, so they
   *  never change when a card crosses it. */
  slugStyle?: "name" | "name-number";
  /** Leave out cards (never sealed) whose every TCGplayer price is under
   *  this many US cents, except in sets released in the last 120 days.
   *  For games with tens of thousands of printings (data size, build size). */
  catalogMinCardCents?: number;
  /** Cards under this TCGplayer price (US cents) stay out of the sitemap but
   *  remain crawlable through set pages. Default 50. A new domain with tens of
   *  thousands of card URLs gets few of them crawled; this points Google at
   *  the ones people search for. */
  sitemapMinCardCents?: number;
  /** TCGplayer extended fields shown on card pages, besides the engine's own. */
  extraAttrs?: string[];
  /** Game-specific sealed types, checked before the engine's defaults.
   *  Return "Insert" for anything that isn't sealed product (accessories). */
  sealedTypes?: [RegExp, string][];
  /** A store or eBay title that names a rarity must name the product's own
   *  (games where one card number exists in several rarities). */
  rarityMustAgree?: boolean;
  /** Extra ways sellers write a rarity: { "Quarter Century Secret Rare": ["QCSR", "QCScR"] }. */
  rarityAliases?: Record<string, string[]>;
  /** TCGplayer's rarity codes spelled out on the site and in matching:
   *  { C: "Common", IL: "Iconic Legend" }. A code not listed stays as is. */
  rarityNames?: Record<string, string>;
  /** One set printed in several editions under the same names (Cyberpunk
   *  TCG's Beta and Retail): see SetEdition in lib/import/match.ts. Off unless set. */
  setEditions?: SetEdition[];
  /** Markets outside the US where TCGplayer Direct ships this game's singles
   *  (the TCGplayer ad strip says so there). Off by default: say nothing we
   *  have not checked. TCGplayer Direct: AU since 2026-10-07 for Magic,
   *  Pokémon and Yu-Gi-Oh! singles. */
  tcgplayerDirectMarkets?: Market[];
  rarityOrder: string[];
  chaseRarities: string[];
  theme: {
    brand: string;
    brandLight: string;
    brandDark: string;
    accent: string;
    pageDark: string;
    /** ink-950 … ink-600, darkest first. */
    inkDark: [string, string, string, string, string, string];
    wordmarkGradient: string;
    /** Google Fonts family for headings, e.g. "Cinzel". */
    displayFont: string;
  };
  halloween: { headline: string; blurb: string };
  /** The Christmas line at the top of the home hero (1 November to Boxing Day): a short headline and the rest of the sentence, to /sealed. */
  christmas: { headline: string; blurb: string };
  stores: StoreConfig[];
  sisterSites: SisterSite[];
  /** This site in the Compare Empire network (lib/family-network.ts): which
   *  clusters its footer and "Also in this cluster" blocks draw from. */
  family: { id: FamilySiteId };
  social: { reddit?: string; discord?: string };
  /** A model-kit section (/kits, /kit/<slug>), off unless set: plastic model
   *  kits compared across hobby shops by their JAN barcode (lib/kits.ts,
   *  scripts/import-kits.ts). Gundam Compare's Gunpla. */
  kits?: KitsConfig;
  /** Crawlable card hubs by one card attribute (/cards/<facet>/<slug>, with an
   *  index at /cards/<facet>): colour, card type, franchise, faction… Off unless
   *  set. Only values with at least `minItems` cards get a page (thin pages slow
   *  indexing of the rest), so the sitemap never lists a near-empty hub. */
  cardHubs?: CardHubConfig[];
}

export interface CardHubConfig {
  /** URL segment, e.g. "color". Never "rarity" (that hub is the engine's own). */
  facet: string;
  /** The key in Product.attrs, e.g. "Color". */
  attr: string;
  /** Singular and plural nouns for headings: ["colour", "colours"]. */
  noun: [string, string];
  /** Regex source that splits a multi-valued attribute ("Amethyst;Sapphire"); each
   *  part is trimmed and loses wrapping parentheses ("(Zeon)" → "Zeon"). */
  split?: string;
  /** Show "DARK" as "Dark". */
  titleCase?: boolean;
  /** Fewest cards a value needs for its own page (default 12). */
  minItems?: number;
  /** Values that never get a page (catch-alls like "Standard Characters"). */
  exclude?: string[];
  /** Page title wording, {v} = the value, {game} = SITE.gameShort. Default "{v} {game} cards". */
  title?: string;
  /** One sentence for the index page and the hub intro, e.g. "Every card belongs to one of five colours." */
  blurb?: string;
}

export interface KitsConfig {
  /** Nav and heading word: "Gunpla". */
  label: string;
  /** What the section is, in a sentence's middle: "Gunpla model kits". */
  noun: string;
  /** The kits' maker, for structured data and the disclaimer: "Bandai Spirits". */
  maker: string;
  /** JAN prefixes the maker's kits carry (Bandai: 4573102, 4549660, 4543112). */
  janPrefixes: string[];
  /** The JAN prefix the maker's own item numbers map to (lib/import/kits.ts
   *  janFromItemCode), so a shop that keys kits by item number still matches.
   *  Bandai Spirits: "4573102". */
  itemCodeJanPrefix?: string;
  /** eBay and Amazon search words put before a kit's name ("gunpla"). */
  searchPrefix: string;
  /** The section's link preview (a 2400×1260 file under public/), so a shared
   *  /kits link shows kits, not the card site. Unset: the site's image. */
  shareImage?: { url: string; alt: string };
  stores: KitStoreConfig[];
}

export interface KitStoreConfig {
  key: string;
  name: string;
  base: string;
  market: Market;
  /** Shopify collection handles holding the kits; for a Neto store, its
   *  category paths ("model-building/gundam-plastic-models/high-grade"). */
  collections: string[];
  country?: string;
  /** The shop's platform: Shopify (the default) or Neto/Maropost, read from
   *  its public category pages (lib/import/kits-neto.ts). */
  platform?: "shopify" | "neto";
}

// ── Pre-order pages (src/content/preorders.ts) ──────────────────────────────

export interface QA { q: string; a: string }

/** One release's copy for /preorders/<set slug>. Facts only from a dated source; anything unsure is left out. */
export interface PreorderSetCopy {
  /** HTML intro under the heading; a plain generated line when unset. */
  intro?: string;
  facts: { label: string; value: string }[];
  faq: QA[];
}

export interface PreorderCopy {
  /** The /preorders hub's intro (HTML). */
  intro: string;
  /** The hub's FAQ: questions about pre-ordering in general. */
  faq: QA[];
  /** Per release, keyed by the set's slug. A set without copy still gets a page from its data. */
  sets: Record<string, PreorderSetCopy>;
}

// ── Public data (data/public/*.json) ────────────────────────────────────────

export interface SetInfo {
  id: number; // TCGplayer groupId
  name: string;
  code: string; // abbreviation or slug
  slug: string;
  releasedOn: string | null; // ISO date
  productCount: number;
  upcoming: boolean;
  /** SITE.lines id of the set's game, on multi-game sites only. */
  line?: string;
}

export interface Product {
  id: number; // TCGplayer productId
  slug: string;
  name: string;
  kind: "card" | "sealed";
  setId: number;
  number: string | null;
  rarity: string | null;
  /** Extended fields worth showing (ink colour, type, cost…). */
  attrs: Record<string, string>;
  sealedType: string | null;
  image: string | null;
  tcgUrl: string;
  printings: string[];
}

export interface Offer {
  source: string; // store key, "ebay" or "tcgplayer"
  market: Market;
  currency: string;
  cents: number;
  inStock: boolean;
  url: string;
  title: string;
  printing?: string; // "Foil", "Normal"…
  preorder?: boolean;
  shippingCents?: number | null;
}

export interface TcgPrice {
  market: number | null; // USD cents
  low: number | null;
  mid: number | null;
}

export interface PriceEntry {
  tcg: Record<string, TcgPrice>; // by printing
  offers: Offer[];
  /** 7-day change of the reference price, percent. */
  change7d: number | null;
  change30d: number | null;
}

export interface Catalog {
  generatedAt: string;
  sets: SetInfo[];
  products: Product[];
}

export interface Prices {
  generatedAt: string;
  byId: Record<string, PriceEntry>;
}

export interface StoreStatus {
  ok: boolean;
  products: number;
  matched: number;
  at: string;
  error?: string;
}

export interface Meta {
  updatedAt: string;
  fx: Record<string, number>; // 1 USD = x currency
  stores: Record<string, StoreStatus>;
  ebay: { day: string; calls: number; budget: number; eligible: number; refreshed: number; at: string } | null;
  counts: { cards: number; sealed: number; offers: number; sets: number };
}

export interface EbayPick {
  productId: number;
  name: string;
  image: string | null;
  cents: number;
  currency: string;
  url: string;
  title: string;
  marketCents: number | null;
}

// ── Model kits (data/public/kits/*.json) ─────────────────────────────────────

export interface Kit {
  /** The JAN (EAN-13) barcode, the one key every store shares. */
  jan: string;
  slug: string;
  name: string;
  /** "HG", "RG", "MG", "PG", "EG", "SD", "MGSD", "MGEX", "RE/100", "FM", or null. */
  grade: string | null;
  /** "1/144", "1/100", "1/60", or null. */
  scale: string | null;
  image: string | null;
  /** First day any store listed it (ISO date). */
  firstSeen: string;
}

