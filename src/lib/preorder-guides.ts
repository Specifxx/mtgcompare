// The pre-order pages (/<region>/preorders/<set slug>): one per upcoming set
// that has been announced in enough detail to say what each product IS, not
// just what stores ask for it. Ported from Rift Compare's /radiance-preorders,
// which became that site's biggest pre-release landing page.
//
// Facts only, each from Wizards of the Coast's own announcements (magic.wizards.com,
// the Wizards Play Network) and dated: no prices here. The page's prices are the
// stores' live pre-order listings (ProductStat + Offer), and US MSRP comes from
// lib/rrp.ts like everywhere else — never typed twice.
//
// SELF-RETIRING: a guide's set is a pre-order only until its releaseDate in
// lib/sets.ts (isPreorderSet). From release day the page says it is out, points
// at the set page, drops out of the sitemap and is noindexed. A guide can then
// be deleted at leisure; nothing else depends on it.
import { SET_BY_CODE, SET_BY_SLUG, type MtgSet as PokemonSet } from "./sets";
import type { TypeKey } from "./sealed-title";

export interface PreorderProduct {
  /** The product type the importer files it under (lib/sealed-title.ts). */
  type: TypeKey;
  /** What is in the box, from TPCi's product listing. */
  contents: string;
  /**
   * false: don't print lib/rrp.ts's US MSRP for this product on the pre-order
   * page, because the set's own announcement gives a different list price and
   * neither is confirmed yet. Default: printed (US page only).
   */
  msrp?: false;
}

/** A fact the guide prints with its source named beside it (a report, not TPCi's own words), so a reader can weigh it. */
export interface Attributed {
  text: string;
  /** "ICv2, 1 October 2026": who said it, and when. */
  source: string;
}

export interface PreorderGuide {
  setCode: string;
  /** "Mega Evolution—Delta Reign": the full English product-line name. */
  fullName: string;
  /** Prerelease events at participating stores (YYYY-MM-DD), when announced. */
  prereleaseFrom: string | null;
  /** Pokémon TCG Live, when announced (YYYY-MM-DD). */
  liveDate: string | null;
  /** "over 135 cards", as TPCi words it. */
  cardCount: string;
  /** The Pokémon the set is built around. */
  headliners: string[];
  /** What the set holds, line by line, as TPCi's set description lists it ("6 Pokémon ex"); `makeupSource` says who reported it. */
  makeup: string[];
  makeupSource: string;
  /** A card type or rule new with the set (Delta Reign: Legendary Stadiums), or null. */
  newFeature: { name: string; text: string; source: string } | null;
  /**
   * Prerelease: where it is played, the size of its Build & Battle Box's ready-to-play deck and the box's promo cards (the box's
   * contents are the build-battle product's), with who reported them.
   */
  prerelease: { where: string; deckCards: number; promos: string[]; source: string } | null;
  /** Dated reports about buying the set (a sold-out first wave, say), each attributed. Never a price. */
  notes: Attributed[];
  products: PreorderProduct[];
  /** Where the facts above come from. */
  sources: { label: string; url: string }[];
  /** When the facts were last checked against the sources (YYYY-MM-DD). */
  checked: string;
}

// Empty since the Magic port (2026-10-21): the one guide here was a Pokémon set's. A Magic set's guide needs its own sourced facts
// in this shape; until one is written, Star Trek's dates and products are in src/content/star-trek.ts (the guides and the blog).
export const PREORDER_GUIDES: PreorderGuide[] = [
  {
    // Wizards of the Coast's Star Trek product page (read 2026-10-14: the release date and the product line-up) and its "Collecting
    // Magic: The Gathering | Star Trek" article (published 2026-07-14, read 2026-10-16: the prerelease dates, the MTG Arena date,
    // the four Commander decks by name and every product's contents). Carried over from the old MTG Compare's lib/preorders.ts
    // and lib/blog/star-trek.ts, where each line is dated. Left out because Wizards has not published them: the card count, the
    // face commanders and the decklists. Pack counts are lib/packs.ts's, list prices lib/rrp.ts's.
    setCode: "trk",
    fullName: "Magic: The Gathering | Star Trek",
    prereleaseFrom: "2026-11-06",
    liveDate: "2026-11-10",
    cardCount: "",
    headliners: [],
    makeup: [],
    makeupSource: "Wizards of the Coast's Collecting Star Trek article, read 16 October 2026",
    newFeature: {
      name: "Assimilate",
      text: "The assimilate keyword action gives you control of a creature or puts a creature card onto the battlefield under your control. Either way, a +1/+1 counter is put on that creature, and it becomes a Borg artifact creature and loses its other creature types",
      source: "Wizards of the Coast, 14 July 2026",
    },
    prerelease: null,
    notes: [
      { text: "Wizards cancelled the Star Trek Beginner Box", source: "Wizards of the Coast, 14 July 2026" },
      { text: "Headliner Signed cards, autographed by the actors, can be pulled from Collector Boosters of every language, and are always in English", source: "Wizards of the Coast, 14 July 2026" },
    ],
    products: [
      { type: "play-booster-box", contents: "30 Play Boosters of 14 Magic cards (the Play Booster display)" },
      { type: "collector-booster-box", contents: "12 Collector Boosters of 15 cards" },
      {
        type: "bundle",
        contents: "9 Play Boosters, 30 basic lands (15 traditional foil and 15 non-foil), 1 traditional foil promo card, 2 reference cards, an oversized spindown life counter and a card-storage box",
      },
      { type: "special-bundle", contents: "The Beam Me Up Bundle: 8 Play Boosters and 1 Collector Booster, the Bundle's 30 basic lands, 2 of the 8 traditional foil Beam Me Up Bundle promo cards, 2 reference cards, a spindown life counter and a storage box" },
      { type: "draft-night", contents: "12 Play Boosters, 1 Collector Booster, 90 non-foil basic lands, 10 non-foil double-sided tokens and a draft insert: a kit for a Pick-Two Draft with four players" },
      { type: "commander-deck", contents: "Four ready-to-play 100-card decks, Federation Fleet, Landing Party, Klingon Fury and We Are the Borg, each also sold as a Collector's Edition in surge foil" },
      { type: "scene-box", contents: "Two boxes, Enterprise-Q and Divergent Timeline: 3 Play Boosters, 6 traditional foil borderless scene cards that make one picture, 6 art cards and a display easel" },
      { type: "prerelease-pack", contents: "6 Play Boosters, 1 traditional foil rare or mythic rare, a deck box and a spindown die: what you play with at a prerelease event", msrp: false },
      { type: "play-booster", contents: "One Play Booster of 14 Magic cards" },
      { type: "collector-booster", contents: "One Collector Booster of 15 cards" },
    ],
    sources: [
      { label: "Wizards of the Coast: Magic: The Gathering | Star Trek", url: "https://magic.wizards.com/en/products/star-trek" },
      { label: "Wizards of the Coast: Collecting Magic: The Gathering | Star Trek (14 July 2026)", url: "https://magic.wizards.com/en/news/feature/collecting-star-trek" },
      { label: "Wizards Play Network: Star Trek dates and details", url: "https://wpn.wizards.com/en/news/star-trek-dates-and-details" },
    ],
    checked: "2026-10-16",
  },
];

const BY_CODE = new Map(PREORDER_GUIDES.map((g) => [g.setCode, g]));

/** US MSRP may be printed for this product type on the guide's page (see PreorderProduct.msrp). */
export function guideShowsMsrp(guide: PreorderGuide, type: TypeKey): boolean {
  return guide.products.find((p) => p.type === type)?.msrp !== false;
}

export function preorderGuide(setCode: string | null | undefined): PreorderGuide | null {
  return setCode ? BY_CODE.get(setCode) ?? null : null;
}

/** The guide and its set for a URL slug, or null (the page 404s). */
export function preorderGuideBySlug(slug: string): { guide: PreorderGuide; set: PokemonSet } | null {
  const set = SET_BY_SLUG.get(slug);
  const guide = set ? BY_CODE.get(set.code) : undefined;
  return set && guide ? { guide, set } : null;
}

/** The path under a region: /<region>/preorders/<set slug>. */
export function preorderPath(region: string, setCode: string): string | null {
  const set = BY_CODE.has(setCode) ? SET_BY_CODE.get(setCode) : undefined;
  return set ? `/${region}/preorders/${set.slug}` : null;
}

/** Guides whose set has not released yet (by lib/sets.ts), soonest release first. */
export function openPreorderGuides(today = new Date().toISOString().slice(0, 10)): { guide: PreorderGuide; set: PokemonSet }[] {
  return PREORDER_GUIDES.map((guide) => ({ guide, set: SET_BY_CODE.get(guide.setCode) }))
    .filter((x): x is { guide: PreorderGuide; set: PokemonSet } => !!x.set && x.set.releaseDate > today)
    .sort((a, b) => a.set.releaseDate.localeCompare(b.set.releaseDate));
}
