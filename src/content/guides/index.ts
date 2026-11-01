// The guides: evergreen, plain-English answers to what people ask before they buy Magic: The Gathering sealed product, each backed by
// the site's own live prices. A guide is a typed module, not MDX: src/content/guides/<slug>.tsx holds its prose and its live blocks,
// which render the region's current prices (src/content/guides/data.ts). This file is the registry. It is pure (no database, no
// React), so the sitemap (src/lib/sitemap.ts) and the tests read it as it stands.
//
// The writing rules (tests/guides.test.ts checks what can be checked):
//   • Facts are only those we are sure of: what a product holds as Wizards of the Coast lists it, pack counts only where every
//     product of the kind has the same one (src/content/live.ts FAMILIES), US MSRPs only with their source (src/content/star-trek.ts).
//     If a figure is not certain, the guide leaves it out.
//   • No pull rates, expected value, investment, trend or "best time to buy" claims, no quotes, no invented dates or numbers.
//   • Live numbers say "today" or "right now", with when the prices were checked. Nothing may match BANNED_COPY.
//   • `published` and `updated` are editorial dates, set by hand when a guide is written or substantively edited.
//
// ADDING A GUIDE: an entry here, a module beside this file (export `outline` and `Body`, see kit.tsx), its line in modules.ts and its
// reads in data.ts (READS). The page, the index, the sitemap and the tests pick it up from here.
import type { Region } from "../../lib/regions";
import { REGION_LIST } from "../../lib/regions";

export type GuideSlug =
  | "play-booster-vs-collector-booster-vs-bundle"
  | "how-many-packs-in-magic-products"
  | "magic-sealed-products-explained"
  | "is-a-collector-booster-box-worth-it"
  | "where-to-buy-magic-sealed-online"
  | "how-to-preorder-magic-sets"
  | "how-to-avoid-resealed-magic-products"
  | "magic-msrp"
  | "cheapest-way-to-buy-magic-packs"
  | "play-vs-collector-booster-box-value-by-set"
  | "universes-beyond-sealed-price-guide"
  | "commander-precon-price-guide"
  | "secret-lair-drops-explained"
  | "magic-sealed-gifts-under-50"
  | "magic-release-dates-preorder-calendar"
  | "magic-sealed-market-wrap"
  | "mtg-booster-box-prices"
  | "collector-booster-box-prices"
  | "mtg-bundle-prices"
  | "best-commander-precons-australia"
  | "where-to-buy-mtg-booster-boxes-australia"
  | "best-magic-product-for-beginners";

export interface Guide {
  slug: GuideSlug;
  /** The H1, the Article headline and the <title>. With " | MTG Compare" it should fit in 60 characters; past that it goes out as title.absolute. */
  title: string;
  /**
   * The title as the region's copy says it, with "{in}" for the region ("MTG booster box prices in {in}" → "… in Australia"): the
   * H1, the <title> and the Article headline of /<region>/guides/<slug>, for guides that answer a "… price <country>" query. Absent:
   * `title` everywhere.
   */
  titleIn?: string;
  /** Meta description, Article description and the index card's text: at most 160 characters. */
  description: string;
  /** The index card's eyebrow: two or three words. */
  kicker: string;
  /** Editorial dates (YYYY-MM-DD). */
  published: string;
  updated: string;
  /** Where the guide is offered: every region, or a list (the MSRP guide is US-only: Wizards sets US list prices). */
  regions: "all" | readonly Region[];
  /** The product type keys (lib/sealed-title.ts) its Related block links to; a key the type table does not have is skipped. */
  topic: { types?: readonly string[] };
  /** The guide's one eBay strip: its heading, and the words of its eBay search. */
  ebay: { heading: string; query: string };
}

const D = "2026-10-21";
/** The data-driven guides' first edition, and the MSRP guide's refresh. */
const D2 = "2026-10-23";
/** The sealed price guides (booster box, Collector Booster box, Bundle), first edition. */
const D3 = "2026-10-23";
/** The Australian guides, first edition. */
const D4 = "2026-10-25";
const SEALED_EBAY = { heading: "Sealed Magic on eBay", query: "Magic the Gathering sealed" };

export const GUIDES: readonly Guide[] = [
  {
    slug: "best-magic-product-for-beginners",
    title: "Best Magic: The Gathering product for beginners",
    description: "The best first Magic product to buy: Starter Kits, Commander decks or a few packs, what each is for, and what they cost in your region today.",
    kicker: "Getting started",
    published: "2026-11-01",
    updated: "2026-11-01",
    regions: "all",
    topic: { types: ["starter", "commander-deck", "play-booster"] },
    ebay: { heading: "Magic Starter Kits on eBay", query: "MTG starter kit" },
  },
  {
    slug: "play-booster-vs-collector-booster-vs-bundle",
    title: "Play Booster vs Collector Booster vs Bundle: which to buy",
    description: "What a Magic Play Booster, Collector Booster and Bundle each hold, what they cost in your region today, and which one suits how you play or collect.",
    kicker: "Comparison",
    published: D,
    updated: D,
    regions: "all",
    topic: { types: ["play-booster-box", "collector-booster-box", "bundle"] },
    ebay: { heading: "Magic booster boxes on eBay", query: "MTG booster box" },
  },
  {
    slug: "how-many-packs-in-magic-products",
    title: "How many packs are in each Magic sealed product?",
    description: "Pack counts for Magic: The Gathering booster boxes, Collector Booster boxes, Bundles and more, with what a pack costs in your region today.",
    kicker: "Pack counts",
    published: D,
    updated: D,
    regions: "all",
    topic: { types: ["play-booster-box", "collector-booster-box", "bundle"] },
    ebay: { heading: "Magic booster boxes on eBay", query: "MTG booster box" },
  },
  {
    slug: "magic-sealed-products-explained",
    title: "Magic: The Gathering sealed products explained",
    description: "Every kind of Magic sealed product, from Play and Collector Booster boxes to Bundles and Commander decks: what each is, and what's in stock today.",
    kicker: "Product types",
    published: D,
    updated: D,
    regions: "all",
    topic: { types: ["play-booster-box", "collector-booster-box", "bundle", "commander-deck"] },
    ebay: SEALED_EBAY,
  },
  {
    slug: "is-a-collector-booster-box-worth-it",
    title: "Is a Magic Collector Booster box worth it?",
    description: "What a Collector Booster box holds, what one costs per pack in your region today against loose Collector Boosters, and the questions to ask before you buy.",
    kicker: "Collector Boosters",
    published: D,
    updated: D,
    regions: "all",
    topic: { types: ["collector-booster-box", "collector-booster"] },
    ebay: { heading: "Collector Booster boxes on eBay", query: "MTG collector booster box" },
  },
  {
    slug: "where-to-buy-magic-sealed-online",
    title: "Where to buy Magic: The Gathering sealed product online",
    description: "The independent stores that sell Magic sealed product online in your region, who has the most in stock today, and what to check before you order.",
    kicker: "Where to buy",
    published: D,
    updated: D,
    regions: "all",
    topic: { types: ["play-booster-box", "collector-booster-box", "bundle", "commander-deck"] },
    ebay: SEALED_EBAY,
  },
  {
    slug: "how-to-preorder-magic-sets",
    title: "How to pre-order Magic: The Gathering sets",
    description: "What a Magic pre-order means, how to compare pre-order prices across stores, what to check before you pay, and the next set's dates.",
    kicker: "Pre-orders",
    published: D,
    updated: D,
    regions: "all",
    topic: { types: ["play-booster-box", "collector-booster-box", "bundle"] },
    ebay: SEALED_EBAY,
  },
  {
    slug: "how-to-avoid-resealed-magic-products",
    title: "How to avoid resealed or fake Magic sealed product",
    description: "How to spot a resealed or fake Magic booster box or pack: what to check on the listing, the price and the wrap, with today's typical prices to compare.",
    kicker: "Buying safely",
    published: D,
    updated: D,
    regions: "all",
    topic: { types: ["play-booster-box", "collector-booster-box"] },
    ebay: { heading: "Magic booster boxes on eBay", query: "MTG booster box" },
  },
  {
    slug: "magic-msrp",
    title: "Magic: The Gathering MSRP: US list prices for sealed product",
    description: "The US MSRP Wizards of the Coast set for the newest Magic set's boosters, Bundles and Commander decks, against what US stores charge today.",
    kicker: "US list prices",
    published: D,
    updated: D2,
    regions: ["us"],
    topic: { types: ["play-booster-box", "collector-booster-box", "bundle", "commander-deck"] },
    ebay: SEALED_EBAY,
  },
  {
    slug: "cheapest-way-to-buy-magic-packs",
    title: "Cheapest way to buy Magic packs: cost per pack",
    description: "What a Magic booster pack costs in each kind of product today, from Play and Collector Booster boxes to Bundles and loose packs, ranked by price per pack.",
    kicker: "Price per pack",
    published: D2,
    updated: D2,
    regions: "all",
    topic: { types: ["play-booster-box", "collector-booster-box", "bundle", "play-booster"] },
    ebay: { heading: "Magic booster boxes on eBay", query: "MTG booster box" },
  },
  {
    slug: "play-vs-collector-booster-box-value-by-set",
    title: "Play vs Collector Booster box: price per pack by set",
    description: "Set by set, what a pack costs in the cheapest Play Booster box and the cheapest Collector Booster box at the stores we compare today, side by side.",
    kicker: "Set by set",
    published: D2,
    updated: D2,
    regions: "all",
    topic: { types: ["play-booster-box", "collector-booster-box"] },
    ebay: { heading: "Magic booster boxes on eBay", query: "MTG booster box" },
  },
  {
    slug: "universes-beyond-sealed-price-guide",
    title: "Universes Beyond sealed price guide",
    description: "Every Universes Beyond Magic set, from Warhammer 40,000 to Star Trek: release dates, what stores have in stock today and the cheapest sealed product of each.",
    kicker: "Universes Beyond",
    published: D2,
    updated: D2,
    regions: "all",
    topic: { types: ["play-booster-box", "collector-booster-box", "commander-deck", "bundle"] },
    ebay: { heading: "Universes Beyond on eBay", query: "MTG Universes Beyond sealed" },
  },
  {
    slug: "commander-precon-price-guide",
    title: "Commander precon price guide: Magic decks today",
    description: "What Magic Commander precons cost at the stores we compare today: the cheapest decks in stock, how many are open, and what to check before you buy one.",
    kicker: "Commander decks",
    published: D2,
    updated: D2,
    regions: "all",
    topic: { types: ["commander-deck", "commander-deck-set"] },
    ebay: { heading: "Commander decks on eBay", query: "MTG Commander deck sealed" },
  },
  {
    slug: "secret-lair-drops-explained",
    title: "Secret Lair drops explained, with today’s prices",
    description: "What a Magic Secret Lair drop is, how it is sold, and what Secret Lair drops cost at the stores we compare today, from the cheapest in stock up.",
    kicker: "Secret Lair",
    published: D2,
    updated: D2,
    regions: "all",
    topic: { types: ["secret-lair"] },
    ebay: { heading: "Secret Lair on eBay", query: "MTG Secret Lair sealed" },
  },
  {
    slug: "magic-sealed-gifts-under-50",
    title: "Magic sealed gifts under $50: what’s in stock",
    description: "Magic: The Gathering sealed gifts under a round local price cap ($50 in the US): Bundles, Commander decks, starter kits and packs in stock today.",
    kicker: "Gift ideas",
    published: D2,
    updated: D2,
    regions: "all",
    topic: { types: ["bundle", "commander-deck", "starter", "play-booster"] },
    ebay: SEALED_EBAY,
  },
  {
    slug: "magic-release-dates-preorder-calendar",
    title: "Magic release dates & pre-order calendar",
    description: "Magic: The Gathering English release dates for every upcoming set and the last twelve months, with what's open for pre-order or in stock today.",
    kicker: "Release calendar",
    published: D2,
    updated: D2,
    regions: "all",
    topic: { types: ["play-booster-box", "collector-booster-box", "bundle"] },
    ebay: SEALED_EBAY,
  },
  {
    slug: "magic-sealed-market-wrap",
    title: "Magic sealed market wrap: this week’s price moves",
    description: "This week's real moves in Magic sealed prices: products whose cheapest in-stock price is lower or higher than seven days ago, from our daily snapshots.",
    kicker: "Weekly wrap",
    published: D2,
    updated: D2,
    regions: "all",
    topic: { types: ["play-booster-box", "collector-booster-box", "bundle", "commander-deck"] },
    ebay: SEALED_EBAY,
  },
  {
    slug: "mtg-booster-box-prices",
    title: "MTG booster box prices today, set by set",
    titleIn: "MTG booster box prices in {in}",
    description: "What a Magic Play Booster box costs today at the stores we compare: the cheapest in stock, the cheapest box of every recent set and the price per pack.",
    kicker: "Booster boxes",
    published: D3,
    updated: D3,
    regions: "all",
    topic: { types: ["play-booster-box", "draft-booster-box", "set-booster-box"] },
    ebay: { heading: "Magic booster boxes on eBay", query: "MTG booster box" },
  },
  {
    slug: "collector-booster-box-prices",
    title: "Collector Booster box prices, set by set",
    titleIn: "MTG Collector Booster box prices in {in}",
    description: "What a Magic Collector Booster box costs today: the cheapest and dearest in stock, and each recent set's cheapest box with its price per pack.",
    kicker: "Collector boxes",
    published: D3,
    updated: D3,
    regions: "all",
    topic: { types: ["collector-booster-box", "collector-booster"] },
    ebay: { heading: "Collector Booster boxes on eBay", query: "MTG collector booster box" },
  },
  {
    slug: "mtg-bundle-prices",
    title: "Magic Bundle prices: every set's Bundle today",
    titleIn: "MTG Bundle prices in {in}",
    description: "What a Magic: The Gathering Bundle costs today at the stores we compare: the cheapest Bundles in stock, each recent set's Bundle and how many are open.",
    kicker: "Bundles",
    published: D3,
    updated: D3,
    regions: "all",
    topic: { types: ["bundle", "play-booster-box"] },
    ebay: { heading: "Magic Bundles on eBay", query: "MTG bundle sealed" },
  },
  // Australia-only guides (2026-10-25): AU stores' live prices, each product row with an Amazon AU link (lib/amazon.ts).
  {
    slug: "best-commander-precons-australia",
    title: "Best Commander precon decks in Australia",
    description: "The Magic Commander precon decks Australian stores have in stock today, cheapest first, with each deck's lowest AUD price and how many stores carry it.",
    kicker: "Commander decks",
    published: D4,
    updated: D4,
    regions: ["au"],
    topic: { types: ["commander-deck", "commander-deck-set"] },
    ebay: { heading: "Commander decks on eBay", query: "MTG Commander deck sealed" },
  },
  {
    slug: "where-to-buy-mtg-booster-boxes-australia",
    title: "Where to buy MTG booster boxes in Australia",
    description: "Which Australian stores have Magic booster boxes in stock today, the cheapest Play and Collector Booster boxes in AUD, and what to check before you order.",
    kicker: "Where to buy",
    published: D4,
    updated: D4,
    regions: ["au"],
    topic: { types: ["play-booster-box", "collector-booster-box"] },
    ebay: { heading: "Magic booster boxes on eBay", query: "MTG booster box" },
  },
];

export const GUIDE_BY_SLUG: ReadonlyMap<string, Guide> = new Map(GUIDES.map((g) => [g.slug, g]));

/** The regions a guide is offered in, in REGION_LIST order (hreflang, the sitemap, the index pages). */
export function guideRegions(g: Guide): Region[] {
  return REGION_LIST.map((r) => r.region).filter((r) => g.regions === "all" || g.regions.includes(r));
}

/** The guides offered in a region, in registry order. */
export function guidesFor(region: Region): Guide[] {
  return GUIDES.filter((g) => guideRegions(g).includes(region));
}

/** The guide at /<region>/guides/<slug>, or null: an unknown slug, or a guide not offered in that region. */
export function guideFor(slug: string, region: Region): Guide | null {
  const g = GUIDE_BY_SLUG.get(slug);
  return g && guideRegions(g).includes(region) ? g : null;
}

/** The <title>: the template adds " | MTG Compare" (13 characters) when the whole still fits in 60; otherwise the title alone. */
export function guideMetaTitle(title: string): string | { absolute: string } {
  return title.length + " | MTG Compare".length <= 60 ? title : { absolute: title };
}

/** A guide's title in one region's copy: `titleIn` with the region's "in" name, else `title`. */
export function guideTitleIn(g: Pick<Guide, "title" | "titleIn">, r: { inName: string }): string {
  return g.titleIn ? g.titleIn.replace("{in}", r.inName) : g.title;
}
