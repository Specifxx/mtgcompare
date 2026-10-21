// The pre-order pages (/<region>/preorders/<set slug>): one per upcoming set
// that has been announced in enough detail to say what each product IS, not
// just what stores ask for it. Ported from Rift Compare's /radiance-preorders,
// which became that site's biggest pre-release landing page.
//
// Facts only, each from The Pokémon Company's own announcement (pokemon.com,
// press.pokemon.com) and dated: no prices here. The page's prices are the
// stores' live pre-order listings (ProductStat + Offer), and US MSRP comes from
// lib/rrp.ts like everywhere else — never typed twice.
//
// SELF-RETIRING: a guide's set is a pre-order only until its releaseDate in
// lib/sets.ts (isPreorderSet). From release day the page says it is out, points
// at the set page, drops out of the sitemap and is noindexed. A guide can then
// be deleted at leisure; nothing else depends on it.
import { SET_BY_CODE, SET_BY_SLUG, type PokemonSet } from "./sets";
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

export const PREORDER_GUIDES: PreorderGuide[] = [
  {
    // The dates, card count and headliners: pokemon.com, "The Pokémon TCG: Mega Evolution—Delta Reign Expansion Arrives November 6,
    // 2026" (read 2026-10-14), and press.pokemon.com's product page (release date, read 2026-10-16). The set's make-up, the new
    // Legendary Stadiums and the product line-up (ETB contents) as PokéGuardian reported them from TPCi's press kit on 2026-08-20.
    // The prerelease (Build & Battle Box from 24 October at select Play! Pokémon stores, its 40-card deck and four promos) and the
    // Pokémon Center's first pre-order wave: ICv2, 2026-10-01. Pack counts per product are lib/packs.ts's, not restated here.
    // Read again 2026-10-16. Left out because no source we could reach confirms them: the English secret-rare list, the Pokémon
    // Center ETB's contents, the 18-pack display's and the blisters' list prices, and the checklane blisters' promos.
    setCode: "me6",
    fullName: "Mega Evolution—Delta Reign",
    prereleaseFrom: "2026-10-24",
    liveDate: "2026-11-05",
    cardCount: "over 135 cards",
    headliners: ["Mega Rayquaza ex", "Mega Golurk ex", "Mega Malamar ex", "Mega Golisopod ex"],
    makeup: [
      "4 Mega Evolution Pokémon ex: Mega Rayquaza ex, Mega Golurk ex, Mega Malamar ex and Mega Golisopod ex",
      "6 other Pokémon ex",
      "6 Stadium cards that make three Legendary Stadiums",
      "14 illustration rare Pokémon",
      "17 ultra rare Pokémon and Trainer cards",
      "6 special illustration rare Pokémon and Supporter cards",
    ],
    makeupSource: "The Pokémon Company’s set description, as PokéGuardian reported it on 20 August 2026",
    newFeature: {
      name: "Legendary Stadiums",
      text: "A new kind of Stadium: two Stadium cards played as a pair, whose artwork joins up when they sit side by side. A booster pack that holds a Legendary Stadium holds both halves. Legendary Summit is the first one revealed",
      source: "PokéGuardian, 20 August 2026",
    },
    prerelease: {
      where: "participating Play! Pokémon stores",
      deckCards: 40,
      promos: ["Masquerain", "Magmortar", "Enamorus", "Kommo-o"],
      source: "ICv2, 1 October 2026",
    },
    notes: [
      {
        text: "Pokémon Center opened pre-orders for the booster display, the Elite Trainer Box and the booster bundle, and its first wave sold out quickly",
        source: "ICv2, 1 October 2026",
      },
    ],
    products: [
      { type: "booster-box", contents: "36 Delta Reign booster packs of 10 cards (the booster display)" },
      {
        type: "etb",
        contents:
          "9 booster packs, a full-art foil Kyogre promo, 65 card sleeves, 40 Energy cards, a player's guide, 6 damage-counter dice, a coin-flip die, a plastic coin, a collector's box with 6 dividers and a Pokémon TCG Live code card",
      },
      { type: "pc-etb", contents: "The Pokémon Center edition of the Elite Trainer Box, sold by Pokémon Center and resold by stores" },
      { type: "booster-bundle", contents: "6 booster packs" },
      // Reported at US$21.99 for this set (PokéGuardian, 2026-08-20); lib/rrp.ts's Mega Evolution tier says $29.99, and neither
      // pokemon.com nor Pokémon Center could be read to settle it (2026-10-16). Not printed until one is confirmed.
      {
        type: "build-battle",
        contents: "4 Delta Reign booster packs, a 40-card ready-to-play deck and one of four foil promo cards: the kit Prerelease events are played with",
        msrp: false,
      },
      { type: "blister", contents: "1-pack and 3-pack blisters, plus checklane blisters" },
      { type: "sleeved-booster", contents: "One 10-card booster pack in a sleeve" },
      { type: "booster-pack", contents: "One 10-card booster pack" },
    ],
    sources: [
      {
        label: "pokemon.com: the Mega Evolution—Delta Reign expansion arrives November 6, 2026",
        url: "https://www.pokemon.com/us/news/the-pokemon-tcg-mega-evolution-delta-reign-expansion-arrives-november-6-2026",
      },
      { label: "press.pokemon.com: Pokémon TCG: Mega Evolution—Delta Reign (release date)", url: "https://press.pokemon.com/en/products/Pokemon-TCG-Mega-EvolutionDelta-Reign" },
      { label: "PokéGuardian: Mega Evolution—Delta Reign revealed (20 August 2026)", url: "https://www.pokeguardian.com/3231721_pokemon-tcg-mega-evolution-delta-reign-revealed" },
      { label: "ICv2: Pokémon TCG moves right on to Mega Evolution—Delta Reign (1 October 2026)", url: "https://icv2.com/articles/news/view/63514" },
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
