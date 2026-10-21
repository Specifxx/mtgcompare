// The guides: evergreen, plain-English answers to what people ask before they buy Pokémon sealed product, each backed by the
// site's own data. A guide is a typed module, not MDX: src/content/guides/<slug>.tsx holds its prose and its live blocks, which
// render the region's current prices at ISR time (src/content/guides/data.ts). This file is the registry. It is pure (no
// database, no React), so the sitemap (src/lib/sitemap.ts) and the tests read it as it stands.
//
// The writing rules (tests/guides.test.ts checks what can be checked):
//   • Facts come only from packs.ts (pack counts, attributed as "pack counts from the publisher's product listings, as recorded
//     in our data"), rrp.ts (US MSRP, always with RRP_NOTE), sets.ts (names, release dates, the sets sold without a booster box),
//     type-about.ts (what a product holds) and the live loaders.
//   • No pull rates, expected value, investment, trend or "best time to buy" claims, no quotes, no invented dates or numbers.
//   • Live numbers say "today" or "right now", with when the prices were checked. Nothing may match BANNED_COPY.
//   • `published` and `updated` are editorial dates, set by hand when a guide is written or substantively edited. They are never
//     the data refresh time: that is the byline's "prices checked".
//
// ADDING A GUIDE: an entry here, a module beside this file (export `outline` and `Body`, see kit.tsx), its line in modules.ts and,
// if it needs data, a case in data.ts (scoped, capped reads only: src/lib/db.ts). The page, the index, the sitemap and the
// tests pick it up from here.
import type { Region } from "../../lib/regions";
import { REGION_LIST } from "../../lib/regions";
import type { TypeKey } from "../../lib/sealed-title";

export type GuideSlug =
  | "how-many-packs-in-pokemon-products"
  | "booster-box-vs-etb-vs-booster-bundle"
  | "are-pokemon-booster-boxes-worth-it"
  | "pokemon-sealed-products-explained"
  | "pokemon-tcg-msrp"
  | "how-to-preorder-pokemon-tcg"
  | "whats-in-a-pokemon-elite-trainer-box"
  | "pokemon-center-etb-vs-elite-trainer-box"
  | "cheapest-way-to-buy-pokemon-packs"
  | "where-to-buy-pokemon-cards-online"
  | "how-to-avoid-resealed-pokemon-products"
  | "pokemon-build-and-battle-box";

export interface Guide {
  slug: GuideSlug;
  /** The H1, the Article headline and the <title>. With " | DexCompare" it should fit in 65 characters; past that it goes out as title.absolute. */
  title: string;
  /** Meta description, Article description and the index card's text: at most 160 characters. */
  description: string;
  /** The index card's eyebrow: two or three words. */
  kicker: string;
  /** Editorial dates (YYYY-MM-DD). */
  published: string;
  updated: string;
  /** Where the guide is offered: every region, or a list (the MSRP guide is US-only: rrp.ts has no other region's list price). */
  regions: "all" | readonly Region[];
  /** What the guide is about: the types (TypeKey) and sets (sets.ts slugs) its Related block links to. */
  topic: { types?: readonly TypeKey[]; sets?: readonly string[] };
  /** The guide's one eBay strip: the feed it asks for (type:<type slug> cascades to sealed) and its heading. */
  ebay: { context: "sealed" | `type:${string}`; heading: string };
}

export const GUIDES: readonly Guide[] = [
  {
    slug: "how-many-packs-in-pokemon-products",
    title: "How many packs are in a Pokémon booster box, ETB or bundle?",
    description: "Pack counts for every Pokémon TCG sealed product, from booster boxes and cases to ETBs, bundles and Build & Battle, with what a pack costs today.",
    kicker: "Pack counts",
    published: "2026-10-14",
    updated: "2026-10-14",
    regions: "all",
    topic: { types: ["booster-box", "etb", "booster-bundle", "pc-etb", "build-battle"] },
    ebay: { context: "type:booster-boxes", heading: "Pokémon booster boxes on eBay" },
  },
  {
    slug: "booster-box-vs-etb-vs-booster-bundle",
    title: "Pokémon booster box vs ETB vs booster bundle",
    description: "What a Pokémon booster box, Elite Trainer Box and booster bundle each hold, what a pack costs in each today, and which one suits how you buy.",
    kicker: "Comparison",
    published: "2026-10-14",
    updated: "2026-10-14",
    regions: "all",
    topic: { types: ["booster-box", "etb", "booster-bundle"] },
    ebay: { context: "type:elite-trainer-boxes", heading: "Elite Trainer Boxes on eBay" },
  },
  {
    slug: "are-pokemon-booster-boxes-worth-it",
    title: "Are Pokémon booster boxes worth it? The cost per pack",
    description: "What a Pokémon booster box holds, and what each pack costs against a bundle or single packs of the same set today, so you can decide for yourself.",
    kicker: "Buying a box",
    published: "2026-10-14",
    updated: "2026-10-14",
    regions: "all",
    topic: { types: ["booster-box", "booster-bundle", "booster-pack"] },
    ebay: { context: "type:booster-boxes", heading: "Pokémon booster boxes on eBay" },
  },
  {
    slug: "pokemon-sealed-products-explained",
    title: "Pokémon TCG sealed products explained",
    description: "Every kind of Pokémon TCG sealed product, from booster boxes and Elite Trainer Boxes to tins and collections: what each holds, and what's in stock today.",
    kicker: "Product types",
    published: "2026-10-14",
    updated: "2026-10-14",
    regions: "all",
    topic: { types: ["booster-box", "etb", "collection", "tin"] },
    ebay: { context: "sealed", heading: "Sealed Pokémon on eBay" },
  },
  {
    slug: "pokemon-tcg-msrp",
    title: "Pokémon TCG MSRP: US list prices for sealed product",
    description: "The US MSRP of Pokémon TCG booster packs, boxes, bundles and Elite Trainer Boxes for Scarlet & Violet and Mega Evolution, against today's prices.",
    kicker: "US list prices",
    published: "2026-10-14",
    updated: "2026-10-14",
    regions: ["us"],
    topic: { types: ["booster-box", "etb", "booster-bundle", "pc-etb"] },
    ebay: { context: "type:elite-trainer-boxes", heading: "Elite Trainer Boxes on eBay" },
  },
  {
    slug: "how-to-preorder-pokemon-tcg",
    title: "How to pre-order Pokémon TCG sets",
    description: "What a Pokémon TCG pre-order means, how to compare pre-order prices across stores, what to check before you pay, and which sets you can pre-order now.",
    kicker: "Pre-orders",
    published: "2026-10-14",
    updated: "2026-10-14",
    regions: "all",
    topic: { types: ["booster-box", "etb", "booster-bundle"] },
    ebay: { context: "sealed", heading: "Sealed Pokémon on eBay" },
  },
  {
    slug: "whats-in-a-pokemon-elite-trainer-box",
    title: "What’s in a Pokémon Elite Trainer Box?",
    description: "Everything inside a Pokémon Elite Trainer Box: how many packs by series, the extras, the sets that differ, and the cheapest ETB of each new set today.",
    kicker: "Elite Trainer Boxes",
    published: "2026-10-15",
    updated: "2026-10-15",
    regions: "all",
    topic: { types: ["etb", "pc-etb", "etb-case"] },
    ebay: { context: "type:elite-trainer-boxes", heading: "Elite Trainer Boxes on eBay" },
  },
  {
    slug: "pokemon-center-etb-vs-elite-trainer-box",
    title: "Pokémon Center ETB vs Elite Trainer Box: the difference",
    description: "A Pokémon Center Elite Trainer Box against the retail ETB: the extra packs, the promo, and what a pack costs in each today, set by set.",
    kicker: "Pokémon Center ETBs",
    published: "2026-10-15",
    updated: "2026-10-15",
    regions: "all",
    topic: { types: ["pc-etb", "etb"] },
    ebay: { context: "type:pokemon-center-elite-trainer-boxes", heading: "Pokémon Center ETBs on eBay" },
  },
  {
    slug: "cheapest-way-to-buy-pokemon-packs",
    title: "The cheapest way to buy Pokémon packs",
    description: "Which Pokémon TCG product gives the cheapest booster pack today: boxes, bundles, ETBs and loose packs ranked by price per pack, plus ways to pay less.",
    kicker: "Price per pack",
    published: "2026-10-15",
    updated: "2026-10-15",
    regions: "all",
    topic: { types: ["booster-box", "booster-bundle", "etb", "booster-pack"] },
    ebay: { context: "sealed", heading: "Sealed Pokémon on eBay" },
  },
  {
    slug: "where-to-buy-pokemon-cards-online",
    title: "Where to buy Pokémon cards online: sealed product",
    description: "The independent stores that sell Pokémon TCG sealed product online in your region, who has the most in stock today, and what to check before you order.",
    kicker: "Where to buy",
    published: "2026-10-15",
    updated: "2026-10-15",
    regions: "all",
    topic: { types: ["booster-box", "etb", "booster-bundle", "collection"] },
    ebay: { context: "sealed", heading: "Sealed Pokémon on eBay" },
  },
  {
    slug: "how-to-avoid-resealed-pokemon-products",
    title: "How to avoid resealed or fake Pokémon sealed product",
    description: "How to spot a resealed or fake Pokémon booster box or ETB: what to check on the listing, the price and the wrap, with today’s typical prices to compare.",
    kicker: "Buying safely",
    published: "2026-10-15",
    updated: "2026-10-15",
    regions: "all",
    topic: { types: ["booster-box", "etb", "booster-bundle"] },
    ebay: { context: "type:booster-boxes", heading: "Pokémon booster boxes on eBay" },
  },
  {
    // The growth pack's Build & Battle piece (2026-10-16). Its eBay strip is generic sealed: Build & Battle Boxes have no feed of
    // their own (ebay-import.ts TYPE_FEEDS), and a type context without one would show only the compact CTA.
    slug: "pokemon-build-and-battle-box",
    title: "Pokémon Build & Battle Box: what’s inside, and is it worth it?",
    description: "What’s in a Pokémon Build & Battle Box, how it’s used at a Prerelease, and what a pack in one costs today against a bundle or ETB of the same set.",
    kicker: "Build & Battle",
    published: "2026-10-16",
    updated: "2026-10-16",
    regions: "all",
    topic: { types: ["build-battle", "booster-bundle", "etb", "build-battle-stadium"], sets: ["delta-reign"] },
    ebay: { context: "sealed", heading: "Sealed Pokémon on eBay" },
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

/** The <title>: the template adds " | DexCompare" (13 characters) when the whole still fits in 65; otherwise the title alone. */
export function guideMetaTitle(title: string): string | { absolute: string } {
  return title.length + " | DexCompare".length <= 65 ? title : { absolute: title };
}
