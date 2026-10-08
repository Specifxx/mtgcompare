// The SEO landing pages' URL vocabulary: /cards/treatment/[key], /cards/rarity/[rarity] and /cards/type/[type]. Each slug maps to the catalogue
// field it filters on (Card.treat, Card.rarity, Card.ptype), so a page lists exactly what /browse would with the same filter. Pure, and built on
// constants.ts: the treatment facets ARE the non-hidden entries of TREATMENTS, the rarity facets RARITIES, the type facets PRIMARY_TYPES, so a key
// added there is a facet here the same day (tests/tools-pure.test.ts fails on a facet with no intro). The OP names are kept as aliases where the
// meaning survives: PRINTING_FACETS is TREATMENT_FACETS, printingFacetHref is treatmentFacetHref, UNFACETED_PRINTINGS is UNFACETED_TREATMENTS.
import { PRIMARY_TYPES, PRIMARY_TYPE_LABEL, RARITIES, RARITY_KEYS, RARITY_SLUGS, TREATMENTS, type Rarity } from "./constants";

export interface Facet {
  slug: string;
  key: string; // the catalogue value: a treatment key, a rarity letter or a primary type
  label: string;
  title: string; // the page's H1 noun: "Borderless cards"
  intro: string;
}

/** One authored sentence or two per treatment key that has a page (every key that is not hidden). Facts here are read from the product names of the real catalogue; none is a ruling. */
export const TREATMENT_INTRO: Record<string, string> = {
  borderless: "Borderless printings: the art runs to the edge of the card with no black frame. Recent sets print them as chase versions of their best cards, and Universes Beyond and Commander products add more.",
  extended: "Extended-art printings: the art is stretched into the side margins of the frame. A staple alternate version in premium boosters, Commander decks and promo products.",
  showcase: "Showcase printings: a special frame and art treatment designed around the set's theme, sold as an alternate version of the card.",
  scroll: "Showcase Scrolls: showcase versions framed as scrolls, printed for The Lord of the Rings: Tales of Middle-earth.",
  sketch: "Sketch printings: the card drawn as a sketch on the page, a showcase treatment from Secret Lair drops.",
  retro: "Retro-frame printings: a modern card in the look of the 1993 or 1997 frame, loved by players who prefer the original design.",
  inverted: "Inverted frames: the light and dark parts of the card frame swapped round.",
  fullart: "Full-art printings: the art covers the whole card face, the classic look of full-art basic lands and of some promos.",
  futuresight: "Future Sight frame: the futureshifted card frame of the Future Sight expansion, reused in Mystery Booster 2, Mystery Booster Commander Edition and MagicFest cards.",
  anime: "Anime printings: the card redrawn in an anime style, a borderless alternate version in Enchanting Tales, Ravnica Remastered, Foundations Jumpstart and other sets.",
  poster: "Poster printings: borderless art composed like a poster, an alternate version of cards in The Lord of the Rings: Tales of Middle-earth.",
  concept: "Concept Praetor printings: the Phyrexia: All Will Be One alternate art that shows the Praetors as early concept paintings.",
  stainedglass: "Stained Glass printings: the card shown as a stained-glass window, from Secret Lair drops.",
  shatteredglass: "Shattered Glass printings: art seen through broken glass panes, from the Transformers set.",
  jp: "Japan showcase and Japanese alternate-art printings: the same card with new art by Japanese artists, found in Strixhaven Mystical Archive, War of the Spark and in promo products.",
  phyrexian: "Phyrexian printings: the rules text is written in Phyrexian script, an alternate art version of cards in Phyrexia: All Will Be One and Secret Lair.",
  schematic: "Schematic printings: artifacts drawn as blueprints, the Retro Frame Artifacts of The Brothers' War.",
  whiteborder: "White-border printings: cards with a white border instead of black, such as the white-border versions of the reprints in Mystery Booster 2.",
  display: "Display Commander printings: the thick-stock commander cards that come with Commander decks, also found in Secret Lair drops and Warhammer 40,000 products.",
  ce: "Collector's Edition printings: the 1993 gold-bordered boxed set for collectors. Not legal for tournament play.",
  ie: "International Edition printings: the gold-bordered international sister of Collector's Edition. Not legal for tournament play.",
  prerelease: "Prerelease cards: the stamped promo copies handed out at Prerelease events.",
  promopack: "Promo Pack cards: the stamped cards from a set's Promo Packs.",
  thelist: "The List reprints: older cards reprinted in booster packs and The List products.",
  specialguest: "Special Guests: guest reprints inserted into a set's boosters.",
  secretlair: "Secret Lair cards: the limited-run special drops, with their own art, foils and treatments.",
  buyabox: "Buy-a-Box promos: the promo card that comes in every booster box purchase.",
  bundle: "Bundle promos: the promo card that comes with a set's Bundle.",
  launch: "Launch party and release event promos: cards given to players at a set's launch events.",
  gameday: "Game Day and Store Championship promos: prizes for these events.",
  fnm: "Friday Night Magic promos: the prize cards of the weekly store events.",
  judge: "Judge Gift promos: cards awarded through the judge program, often with new art.",
  arenaleague: "Arena League promos: the foil prize cards of the Arena League.",
  wpn: "WPN and Gateway promos: cards given to players through Wizards Play Network stores.",
  datestamped: "Date-stamped promos: cards stamped with the date of the event they were given at.",
  stamped: "Stamped printings: cards carrying a gold stamp or a planeswalker stamp, mostly promos.",
  planechase: "Planechase cards: the planes and cards of the Planechase products.",
  archenemy: "Archenemy cards: the schemes and cards of the Archenemy products.",
  serial: "Serialized cards: every copy carries its own number out of a small print run, among the scarcest pulls of a set.",
  etched: "Foil etched printings: a metallic etched foil finish. Each one is its own product with a foil price only.",
  surge: "Surge Foil printings: foil with a surge of light running across the card, the usual foil of Universes Beyond Commander decks.",
  galaxy: "Galaxy Foil printings: foil sprinkled with a field of stars, from Unfinity and Edge of Eternities.",
  ripple: "Ripple Foil printings: foil with concentric ripples, the Commander and Modern Horizons 3 pattern.",
  rainbow: "Rainbow Foil printings: foil that shifts through the colours of the rainbow.",
  doublerainbow: "Double Rainbow Foil printings: a denser rainbow foil, mostly in Secret Lair drops.",
  textured: "Textured Foil printings: foil with a raised, tactile surface, from Dominaria United, Commander Masters and Secret Lair.",
  halo: "Halo Foil printings: foil with a ring of light, from March of the Machine and Secret Lair.",
  fracture: "Fracture Foil printings: foil broken into shards, from Reality Fracture, Edge of Eternities, Lorwyn Eclipsed and Teenage Mutant Ninja Turtles.",
  confetti: "Confetti Foil printings: foil scattered with confetti, from Enchanting Tales and Secret Lair.",
  raised: "Raised Foil printings: the foil stands above the surface of the card.",
  compleat: "Step-and-Compleat Foil printings: the textured foil of the compleated planeswalkers of Phyrexia: All Will Be One.",
  gilded: "Gilded Foil printings: foil with gold highlights, from Streets of New Capenna.",
  silverscroll: "Silver Scroll Foil printings: the foil of the Japanese alternate-art cards in Mystical Archive.",
  silverfoil: "Silver Foil printings: foil with a silver sheen.",
  manafoil: "Mana Foil printings: foil patterned with mana symbols, from Foundations.",
  neon: "Neon Ink Foil printings: foil printed with a neon ink, in yellow and other colours.",
  oilslick: "Oil Slick Raised Foil printings: a raised foil with an oil-slick sheen, from Phyrexia: All Will Be One.",
  invisible: "Invisible Ink Foil printings: foil with an invisible-ink layer, from Murders at Karlov Manor.",
  facet: "Facet Foil printings: foil with a faceted, gem-like pattern, from Reality Fracture.",
  firstplace: "First-Place Foil printings: a special foil used in Aetherdrift and Special Guests.",
  embossed: "Embossed Foil printings: foil with an embossed surface.",
};

/** The page of each treatment that is not hidden, in TREATMENTS order (the order of the vocabulary). `standard` has no page: it is every card without a treatment. */
export const TREATMENT_FACETS: Facet[] = TREATMENTS.filter((t) => !t.hidden).map((t) => ({ slug: t.key, key: t.key, label: t.label, title: `${t.label} cards`, intro: TREATMENT_INTRO[t.key] ?? "" }));
/** The OP name for the same list. */
export const PRINTING_FACETS: Facet[] = TREATMENT_FACETS;
/** Treatments that should have a page and have none: always empty (the list is derived), kept so a test states it. */
export const UNFACETED_TREATMENTS: string[] = TREATMENTS.filter((t) => !t.hidden && !TREATMENT_FACETS.some((f) => f.key === t.key)).map((t) => t.key);
export const UNFACETED_PRINTINGS: string[] = UNFACETED_TREATMENTS;

const RARITY_INTRO: Record<Rarity, string> = {
  M: "Mythic rares: the rarest rarity of a booster set, home of its flagship cards and planeswalkers.",
  R: "Rares: the rarity of many of a set's strongest and most played cards.",
  U: "Uncommons: a step up from commons, and a large part of most decks.",
  C: "Commons: the most printed cards of a set and the backbone of Draft and Pauper decks.",
  S: "Special: cards printed outside the normal rarity ladder, such as bonus sheets and Masterpiece-style inserts.",
  P: "Promos: cards whose rarity TCGplayer files under Promo, given out at events and with products.",
  L: "Basic lands: Plains, Island, Swamp, Mountain and Forest, in every art and treatment the catalogue knows.",
  T: "Tokens: the cards that stand for creatures and objects a spell makes, plus emblems and helper cards.",
};
export const RARITY_FACETS: Facet[] = RARITY_KEYS.map((k) => ({ slug: RARITY_SLUGS[k], key: k, label: RARITIES[k]!.label, title: `${RARITIES[k]!.label} cards`, intro: RARITY_INTRO[k] }));

const TYPE_INTRO: Record<(typeof PRIMARY_TYPES)[number], string> = {
  creature: "Creatures: the cards that attack and block. Artifact creatures, enchantment creatures and the like are filed here too.",
  planeswalker: "Planeswalkers: permanents with loyalty counters whose abilities you activate once each turn.",
  battle: "Battles: the card type introduced in March of the Machine, attacked to be defeated for a reward.",
  land: "Lands: the cards that make mana. Includes basic lands, dual lands and every artifact land.",
  artifact: "Artifacts: permanents such as Sol Ring, equipment and vehicles, most of them colourless. Artifact creatures are listed under Creature and artifact lands under Land.",
  enchantment: "Enchantments: permanents that stay in play and change the rules or your board, from auras to sagas.",
  instant: "Instants: spells you can cast at any time, the home of counterspells, burn and tricks.",
  sorcery: "Sorceries: spells you can only cast in your own main phase, such as sweepers and tutors.",
  kindred: "Kindred: the card type once called Tribal, for spells that carry a creature type.",
  other: "Other card types: planes, phenomena, schemes, vanguards, conspiracies and dungeons.",
};
export const TYPE_FACETS: Facet[] = PRIMARY_TYPES.map((t) => ({ slug: t, key: t, label: PRIMARY_TYPE_LABEL[t], title: `${PRIMARY_TYPE_LABEL[t]} cards`, intro: TYPE_INTRO[t] }));

export function facetBySlug(list: Facet[], slug: string): Facet | undefined {
  const s = slug.toLowerCase();
  return list.find((f) => f.slug === s);
}

export function treatmentFacetHref(key: string): string {
  const f = TREATMENT_FACETS.find((x) => x.key === key);
  return f ? `/cards/treatment/${f.slug}` : "/cards";
}
/** The OP name for the same link. */
export const printingFacetHref = treatmentFacetHref;
export function rarityFacetHref(rarity: string): string {
  const f = RARITY_FACETS.find((x) => x.key === rarity);
  return f ? `/cards/rarity/${f.slug}` : "/cards/rarity";
}
export function typeFacetHref(primaryType: string): string {
  const f = TYPE_FACETS.find((x) => x.key === primaryType);
  return f ? `/cards/type/${f.slug}` : "/cards";
}

/** Page through a list: the clamped page number and its slice. */
export function paginate<T>(items: T[], pageParam: string | undefined, per: number): { page: number; pages: number; slice: T[] } {
  const pages = Math.max(1, Math.ceil(items.length / per));
  const page = Math.min(Math.max(1, parseInt(pageParam ?? "1", 10) || 1), pages);
  return { page, pages, slice: items.slice((page - 1) * per, page * per) };
}

/** "?page=N" for a page past the first (its canonical and pager links), else "". */
export function pageSuffix(pageParam: string | undefined): string {
  const n = parseInt(pageParam ?? "1", 10);
  return Number.isFinite(n) && n > 1 ? `?page=${n}` : "";
}
