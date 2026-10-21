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
  | "magic-msrp";

export interface Guide {
  slug: GuideSlug;
  /** The H1, the Article headline and the <title>. With " | MTG Compare" it should fit in 65 characters; past that it goes out as title.absolute. */
  title: string;
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
const SEALED_EBAY = { heading: "Sealed Magic on eBay", query: "Magic the Gathering sealed" };

export const GUIDES: readonly Guide[] = [
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
    description: "Every kind of Magic sealed product, from Play and Collector Booster boxes to Bundles, Commander decks and Prerelease Packs: what each is, and what's in stock today.",
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
    updated: D,
    regions: ["us"],
    topic: { types: ["play-booster-box", "collector-booster-box", "bundle", "commander-deck"] },
    ebay: SEALED_EBAY,
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

/** The <title>: the template adds " | MTG Compare" (13 characters) when the whole still fits in 65; otherwise the title alone. */
export function guideMetaTitle(title: string): string | { absolute: string } {
  return title.length + " | MTG Compare".length <= 65 ? title : { absolute: title };
}
