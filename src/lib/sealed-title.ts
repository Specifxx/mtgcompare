// Store title → Pokémon sealed product identity.
//
// Every price on the site passes through identify(). It answers three questions
// about a store's product title, in order, and refuses rather than guesses:
//
//   1. Is this English Pokémon SEALED product? (not a single, a graded slab, an
//      accessory, another game, another language, or a store-made bundle)
//   2. What type of product is it? (booster box, ETB, tin, …)
//   3. Which product is it, across stores? (the groupKey)
//
// Wrongly merging two products is worse than failing to merge them: a merge
// puts a $30 tin's price on a $150 collection's page as its "cheapest". So
// identity is strict. Set products ("Surging Sparks Elite Trainer Box") are
// identified by set + type and dropped when the set can't be read. Everything
// else (collections, tins, blisters, decks) is identified by type + set + the
// distinctive words in its title (usually the featured Pokémon), so two stores'
// different wordings merge and two different tins never do.
//
// Pure module (no DB, no fetch) so it is unit-tested directly
// (tests/sealed-title.test.ts) and shared by the importer and the store probe.
import { SETS, type PokemonSet } from "./sets";

// ── product types ────────────────────────────────────────────────────────────

export type TypeKey =
  | "booster-box"
  | "booster-box-case"
  | "etb"
  | "pc-etb"
  | "etb-case"
  | "booster-bundle"
  | "booster-bundle-case"
  | "build-battle"
  | "build-battle-stadium"
  | "sleeved-booster"
  | "booster-pack"
  | "upc"
  | "collection"
  | "tin"
  | "blister"
  | "deck";

export interface ProductTypeInfo {
  key: TypeKey;
  label: string; // singular, as it reads in a product name
  plural: string; // for headings and category pages
  slug: string; // URL segment for /<region>/type/<slug>
  // "set": one product per set (identity = set + type).
  // "multi": several products per set (identity also needs the title's words).
  kind: "set" | "multi";
  // Lowest believable price, in US cents, converted per market (FLOOR_FX). A
  // listing below it is a $1 deposit variant, a single card or a mis-listing.
  floorUsdCents: number;
}

export const PRODUCT_TYPES: ProductTypeInfo[] = [
  { key: "booster-box", label: "Booster Box", plural: "Booster Boxes", slug: "booster-boxes", kind: "set", floorUsdCents: 7000 },
  { key: "etb", label: "Elite Trainer Box", plural: "Elite Trainer Boxes", slug: "elite-trainer-boxes", kind: "set", floorUsdCents: 2500 },
  { key: "pc-etb", label: "Pokémon Center Elite Trainer Box", plural: "Pokémon Center Elite Trainer Boxes", slug: "pokemon-center-elite-trainer-boxes", kind: "set", floorUsdCents: 4000 },
  { key: "booster-bundle", label: "Booster Bundle", plural: "Booster Bundles", slug: "booster-bundles", kind: "set", floorUsdCents: 1500 },
  { key: "upc", label: "Ultra-Premium Collection", plural: "Ultra-Premium Collections", slug: "ultra-premium-collections", kind: "multi", floorUsdCents: 5000 },
  { key: "collection", label: "Collection", plural: "Collections & Boxes", slug: "collections", kind: "multi", floorUsdCents: 800 },
  { key: "tin", label: "Tin", plural: "Tins", slug: "tins", kind: "multi", floorUsdCents: 400 },
  { key: "build-battle", label: "Build & Battle Box", plural: "Build & Battle Boxes", slug: "build-and-battle-boxes", kind: "set", floorUsdCents: 1000 },
  { key: "build-battle-stadium", label: "Build & Battle Stadium", plural: "Build & Battle Stadiums", slug: "build-and-battle-stadiums", kind: "set", floorUsdCents: 3000 },
  { key: "blister", label: "Blister", plural: "Blister Packs", slug: "blisters", kind: "multi", floorUsdCents: 500 },
  { key: "sleeved-booster", label: "Sleeved Booster", plural: "Sleeved Boosters", slug: "sleeved-boosters", kind: "set", floorUsdCents: 300 },
  { key: "booster-pack", label: "Booster Pack", plural: "Booster Packs", slug: "booster-packs", kind: "set", floorUsdCents: 250 },
  { key: "deck", label: "Deck", plural: "Decks", slug: "decks", kind: "multi", floorUsdCents: 500 },
  { key: "booster-box-case", label: "Booster Box Case", plural: "Booster Box Cases", slug: "booster-box-cases", kind: "set", floorUsdCents: 40000 },
  { key: "etb-case", label: "Elite Trainer Box Case", plural: "Elite Trainer Box Cases", slug: "elite-trainer-box-cases", kind: "set", floorUsdCents: 20000 },
  { key: "booster-bundle-case", label: "Booster Bundle Case", plural: "Booster Bundle Cases", slug: "booster-bundle-cases", kind: "set", floorUsdCents: 8000 },
];

export const TYPE_BY_KEY = new Map(PRODUCT_TYPES.map((t) => [t.key, t]));
export const TYPE_BY_SLUG = new Map(PRODUCT_TYPES.map((t) => [t.slug, t]));
export const TYPE_BY_LABEL = new Map(PRODUCT_TYPES.map((t) => [t.label, t]));

/** Display order: the order PRODUCT_TYPES is written in (chase products first). */
export function typeRank(label: string): number {
  const i = PRODUCT_TYPES.findIndex((t) => t.label === label);
  return i < 0 ? 99 : i;
}

// Rough units-per-USD, used ONLY to scale the per-type price floors into each
// market's currency, and to size up a marketplace ask against other markets'
// prices (roughUsdCents, the importer's placeholder check). Never used to show
// a price: every price on the site is the store's own, in the store's own
// currency.
const FLOOR_FX: Record<string, number> = { AU: 1.5, NZ: 1.65, US: 1, UK: 0.78, CA: 1.37, EU: 0.9, SG: 1.3 };

export function floorCents(type: TypeKey, market: string): number {
  const t = TYPE_BY_KEY.get(type);
  if (!t) return 0;
  return Math.round(t.floorUsdCents * (FLOOR_FX[market] ?? 1));
}

/** A price in a market's currency, very roughly in US cents. For comparisons only, never for display. */
export function roughUsdCents(cents: number, market: string): number {
  return cents / (FLOOR_FX[market] ?? 1);
}

/** The inverse: US cents in a market's currency, very roughly. For thresholds only (the eBay import's eligibility), never for display. */
export function fromRoughUsdCents(usdCents: number, market: string): number {
  return usdCents * (FLOOR_FX[market] ?? 1);
}

// ── normalisation ────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", eacute: "é", rsquo: "’", lsquo: "‘" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Lowercase-insensitive working form: entities decoded, accents folded, dashes and brackets spaced. */
export function normalizeTitle(title: string): string {
  return decodeEntities(title)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // é → e (Pokémon → Pokemon)
    .replace(/[‐-―]/g, " - ")
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ── gates ────────────────────────────────────────────────────────────────────

const POKEMON_WORD = /\bpokemon\b|\bpkmn\b|\bptcg\b/i;

// Other games' sealed product, misfiled in a store's Pokémon collection.
// One Piece singles and decks carry their card codes ("ST01-015", "OP-09"),
// "(Leader)", "(Parallel)" and "DON!!" whatever else the title says.
const OTHER_GAME =
  /\b(?:st|op|eb|prb)\d{2}\s*-\s*\d{3}\b|\bstraw\s*hat\b|\(\s*leader\s*\)|\(\s*parallel\s*\)|\bdon!!|\b(one\s*piece|lorcana|magic\s*the\s*gathering|\bmtg\b|yu-?gi-?oh|digimon|dragon\s*ball|flesh\s*(?:and|&)\s*blood|star\s*wars|weiss\s*schwarz|union\s*arena|gundam|riftbound|league\s*of\s*legends|sorcery|metazoo|grand\s*archive|battle\s*spirits|cardfight|vanguard|final\s*fantasy|disney|marvel|dc\s*comics|naruto|hololive|shadowverse|altered|topps|panini|upper\s*deck|nba|nfl|nhl|mlb|ufc|wwe|hockey|baseball|basketball|football|soccer)\b/i;

// The language named in English, French, German, Italian, Spanish or Dutch
// (EU stores name the edition in their own language: "Japonais", "Koreanisch",
// "Vereinfachtes Chinesisch", "giapponese", "Coreano"). Also read from the
// segments stripFiller drops: "Booster Box Black Bolt | POKÉMON | Coreano" is
// a Korean box, not a title with filler.
const LANG_NAMES =
  "\\b(?:japanese|japan|jpn|jap|japonais|japonaise|japanisch|japanische[nrs]?|giapponese|japones|japons|japans|japanse" +
  "|korean|kor|coreen|coreenne|koreanisch|koreanische[nrs]?|coreano|koreaans" +
  "|chinese|chn|chs|cht|chinois|chinoise|chinesisch|chinesische[nrs]?|cinese|chino|chinees|vereinfacht\\w*|simplified|traditional|traditionnel|mandarin|cantonese" +
  "|thai|indonesian|indonesisch" +
  "|german|deutsch\\w*|allemand|tedesco|aleman|duits" +
  "|french|francais|francaise|franzosisch\\w*|francese|frances|frans|vf" +
  "|italian|italiano|italiana|italienisch\\w*|italien|italiaans" +
  "|spanish|espanol|castellano|spanisch\\w*|espagnol|spagnolo|spaans" +
  "|portuguese|portugues|dutch|nederlands|niederlandisch\\w*|polish|polski|asia|asian|jp|kr|cn)\\b";
const LANG_NAMES_RE = new RegExp(LANG_NAMES, "i");

// Not English. CJK script anywhere, a language word, or a bracketed language
// code ("(JP)", "[DE]"). Bare two-letter codes are only trusted in brackets or
// after a dash at the end — "IT" and "ES" are also English words.
const FOREIGN = new RegExp(
  [
    // CJK / Thai script anywhere.
    "[\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af\\u0e00-\\u0e7f]",
    LANG_NAMES,
    // A language code in brackets, or after a dash at the end: "(JAP)", "[DE]", "- FR".
    "[(\\[]\\s*(?:jp|jpn|jap|kr|kor|cn|sc|tc|th|id|de|ger|dt|fr|fra|it|ita|es|spa|pt|nl|pl)\\s*[)\\]]",
    "\\s-\\s*(?:jp|jpn|jap|kr|cn|de|fr|it|es|pt|nl|pl)\\s*$",
    // A bare code at the very end ("Mew's Revenge FR"); not IT or ES, which are words.
    "\\s(?:jp|jpn|jap|kr|cn|de|fr|pt|nl|pl)\\s*$",
    // Japanese set codes (English sets are "SV4.5", never "SV4a"): SV2A, SV11B, M6A, S12a.
    "\\b(?:sv|s|m|sm)\\d{1,2}[a-z]\\b",
    // Asia-only product lines.
    "\\bslim\\b|\\bgem\\s*packs?\\b|\\bmid-?\\s*autumn\\b",
    // Pokémon Center Japan's regional boxes ("Pokémon Center Hiroshima Special
    // Box", "Fukuoka Pikachu Pokémon Center Exclusive Box"), Japanese promo
    // numbers ("289/SV-P") and the Worlds Yokohama deck: Japanese product, in
    // English titles. "Pokémon Center Elite Trainer Box" is not touched.
    "\\b(?:fukuoka|hiroshima|tohoku|yokohama|osaka|kyoto|nagoya|sapporo|okinawa|shibuya|kanazawa)\\b|/sv-p\\)|\\bpokemon\\s*cent(?:er|re)\\s*(?:tokyo\\s*(?:dx\\s*)?)?(?:special|exclusive)\\s*box",
    // Other languages' product words: a German "Kollektion", a French "coffret",
    // an Italian "buste" is that language's edition, whatever set name it quotes.
    "\\b(?:kollektion|sammelkartenspiel|kampf\\s*-?\\s*deck|kampfdeck|karten|karte|sammlung|sammelkoffer|koffer|coffret|dresseur|boite|buste|bustine|championnat|monde|mazzo|collezione|coppia|scatola|destino|ita|sobres?|caja|lata|mazo|coleccion|verzameldoos)\\b",
    // …and their series names: "Karmesin & Purpur", "Schwert & Schild",
    // "Écarlate et Violet", "Épée et Bouclier", "Scarlatto e Violetto",
    // "Escarlata y Púrpura".
    "\\b(?:karmesin|purpur|schwert|schild|ecarlate|epee|bouclier|scarlatto|violetto|spada|scudo|escarlata|purpura|espada|escudo)\\b|\\bsonne\\s*(?:&|und)\\s*mond\\b|\\bsoleil\\s*(?:&|et)\\s*lune\\b|\\bsole\\s*e\\s*luna\\b|\\bsol\\s*y\\s*luna\\b",
  ].join("|"),
  "i",
);

// Singles, slabs and anything that isn't a factory-sealed product. Also a
// product that was sealed and isn't quite any more ("unshrinked", "no shrink",
// "box wear", "minor damage", "small tear", "torn wrap", "corner dent", "*may* have
// imperfections"): its price is not
// the product's. TCGplayer's single cards from collections read "Charizard 004
// - Holofoil Celebrations Classic Collection" and "(XY88) [XY: Black Star
// Promos]"; a store's "SWSH145" is a promo card's number, never a set code
// (those have two digits) — but "3 Pack Blister with Regigigas SWSH247" names
// the blister's promo, not a single; "20 x Basic Fire Energy" is an energy lot;
// "Arceus Figure (from Arceus V Figure Collection)" is a part of one.
const NOT_SEALED =
  /\bholofoil\b|\(\s*from\b|\bblack\s*star\s*promos?\b|\b\d{3}\s*-\s*(?:holo|rare|common|uncommon)\b|\bunshrink(?:ed)?\b|\bno\s*shrink\b|\bloose\s*wrap\b|\bbox\s*wear\b|\bimperfections?\b|\bminor\s*damage\b|\bcode\s*cards?\b|\b\d+\s*x\s*basic\s*\w+\s*energy\b|(?<!\bwith\s+[a-z'.-]+\s+|\bwith\s+)\b(?:swsh|svp|sv|sm|xy|bw)\s*-?\s*(?!151\b)\d{3}\b|\b\d{1,3}[a-z]?\s*\/\s*\d{2,3}\b|\b[a-z]{1,4}\d{1,3}\s*\/\s*[a-z]{0,4}\d{2,3}\b|\b(?:ultra|secret|holo|illustration|hyper|double|shiny|amazing|radiant)\s*rare\b|\breverse\s*holo\b|\bfull\s*art\b|\b(psa|cgc|bgs|beckett|ace\s*grading|tag\s*grading|graded|slab|slabbed)\b|\bgem\s*mint\b|\bsingles\b|\bsingle\s*cards?\b|\bnear\s*mint\b|\blightly\s*played\b|\b(nm|lp|mp|hp)\b(?!\s*-?\s*\d)|\bopened\b|\bempty\b|\bbox\s*only\b|\bcase\s*only\b|\bwrappers?\b|\bdamaged\b|\bdented\b|\bcrushed\b|\b(?:torn|creased|ripped|rips)\b|\bdent\b|\bseal\s+(?:has\s+)?cut\b|\b(?:box|seal|wrap|corner|plastic|packaging|cardboard)\s+(?:tears?|rips?|dents?|creases?|cuts?|damage)\b|\b(?:tears?|rips?|dents?|creases?|cuts?)\s+(?:in|on|to|of)\s+(?:the\s+)?(?:wrap|plastic|seal|box|cardboard|shrink|packaging)\b|\b(?:small|slight|slightly|minor|major|mild|tiny|light)\s+(?:\d+\s*cm\s+)?(?:(?:box|seal|corner|packaging)\s+)?(?:tears?|rips?|dents?|creases?|damage|cuts?)\b|\bimperfect\b|\bresealed\b|\brepack(?:ed|s)?\b|\bmystery\b|\blucky\s*(?:dip|bag|box)\b|\bgrab\s*bag\b|\bcustom\b|\bproxy\b|\blive\s*break\b|\bbreaks?\b|\brip\s*(?:&|and)\s*ship\b|\b\d+\s*-?\s*cards?\s*(?:box|lot|hit|pack|bundle)\b|\bvalue\s*(?:lot|box|pack)\b|\bhit\s*pack\b|\bpound\s*of\b|\bmoonshot\b|\bgod\s*pack\b|\bcodes?\b|\bptcgl\b|\bptcgo\b|\bonline\b|\bdigital\b/i;

// Accessories and merchandise. Hard exclusions: a title naming one of these is
// never the sealed product itself ("Elite Trainer Box Sleeves" is sleeves).
// Figures and toys sold in TCG collections: Moncolle and Takara Tomy figures,
// Re-Ment and gashapon blind boxes, Bandai model kits, bath bombs. Figures,
// pencils and erasers are judged by merch(): the TCG's own Figure Collections,
// Pencil Tins and Eraser Blisters (boosters inside) stay.
const ACCESSORY =
  /\bmoncolle\b|\btakara\s*tomy\b|\bre-?ment\b|\bgashapon\b|\bblind\s*box\b|\bbath\s*bomb\b|\bwith\s*(?:sweets|candy|candies|gum|chewing\s*gum|snacks?)\b|\bpokepla\b|\bmodel\s*kit\b|\bquick\s*model\b|\bbandai\b|\bmetallic\s*figure\b|\bvinyl\b|\bbuilding\s*toy\b|\bmega\s*bloks\b|\bbox\s*sign\b|\bplastic\s*model\b|\bplamo\b|\bsleeves\b|\bdeck\s*shields?\b|\bdeck\s*(?:box|case|protectors?)\b|\bd-?\s*box\b|\bultra\s*pro\b|\balcove\b|\bflip\s*box\b|\bcard\s*(?:case|holder|protectors?|saver)\b|\btop\s*-?\s*loaders?\b|\bplay\s*-?\s*mats?\b|\bportfolio\b|\balbums?\b|\bstorage\b|\bacrylic\b|\bprotectors?\b|\bmagnetic\b|\buv\s*(?:case|protection|resistant)\b|\bdisplay\s*(?:stand|frame)\b|\bcarry(?:ing)?\s*case\b|\bdice\b|\bdamage\s*counters?\b|\bplush(?:ie)?s?\b|\bfunko\b|\blego\b|\bmega\s*construx\b|\bkeychains?\b|\blanyards?\b|\bbackpacks?\b|\bt-?\s*shirts?\b|\bhoodie\b|\bmug\b|\bpuzzle\b|\bnintendo\b|\bswitch\b|\bvideo\s*game\b|\bstickers?\s*(?:book|sheet|pack)\b|\bbooster\s*box\s*protector\b/i;
// "Binder" is an accessory unless it's the sealed Binder Collection.
const BINDER = /\bbinder\b/i;

/**
 * A figure, pencil or eraser is merchandise unless it's inside a TCG product:
 * "Premium Figure Collection", "Figure Box", "Figure Blister" (the B&W
 * blisters), "Back to School Pencil Tin" / "Pencil Box", "Eraser Blister".
 * "Mega Lucario ex Premium Figure Collection with Promo Cards and Figure" names
 * the product and its figure; "Arceus Figure (from …)" is NOT_SEALED's.
 */
function merch(t: string): boolean {
  const s = t.toLowerCase();
  if (/\bfigur(?:es?|ines?)\b/.test(s) && !/\bpremium\s*figure\b|\bfigure\s*(?:&\s*pin\s*)?(?:collection|box|blister)\b/.test(s)) return true;
  if (/\bpencils?\b|\berasers?\b/.test(s) && !/\b(?:pencil|eraser)s?\s*(?:tin|box|case|blister)\b|\bblister\b|\btin\b|\bbooster/.test(s)) return true;
  return false;
}

// Store-made multiples ("3x Elite Trainer Box", "Booster Pack x5", "set of 4",
// "combo"): priced for several units, so never comparable with one. TCGplayer
// names them "[Set of 10]", "[Bundle of 2]" and "4 Mini Tins".
//
// Also (2026-09 import): "(Pair)", "Tin (3 Set)", "One of Each", "Display of
// 8", "Booster Pack x 50 (LIVE)", "24 Pack Bundle", "36 Booster Pack Bundle",
// "Complete Artwork of 4 packs", "Day and Night Bundle", "Tech Sticker
// Display", "3 Premium Checklane Blister Set". A "3-Pack Bundle" is only the
// 3-pack blister when the title says "blister" (see twoProducts).
const MULTIPLE =
  /\(\s*pair\s*\)|\bpairs?\b|\b(?:[2-9]|1\d)\s*sets?\b|\bone\s*of\s*each\b|\bdisplay\s*of\s*\d|\bx\s*(?:[2-9]|[1-9]\d)\s*\((?!\s*(?:sealed\s*)?case)|\b(?:[4-9]|[1-9]\d)\s*(?:booster\s*)?packs?\s*(?:bundle|lot|set)\b|\b(?:decks|tins|boxes|blisters|collections)\s*bundle\b|\bcomplete\s*artwork\b|\bday\s*(?:and|&|\/|\+)\s*night\s*bundle\b|\bsticker\s*(?:collection\s*)?display\b|\bdisplay\s*\(\s*(?!36\b)\d+\b|\b(?:[2-9]|1\d)\s*(?:premium\s*)?(?:checklane|blisters?|decks?|boxes|collections?)\b[^|]*\b(?:set|bundle|lot)\b|^\s*[2-9]\d?\s*x\b|\bx\s*[2-9]\d?\s*\)?\s*$|[([]\s*[2-9]\d?\s*x\s*[)\]]|[([]\s*x\s*[2-9]\d?\s*[)\]]|\b(?:set|bundle)\s*of\s*(?:[2-9]|[1-9]\d)|\b(?:[2-9]|1\d)\s*-?\s*(?:pack\s*)?(?:mini\s*)?tins\b|\btins\s*-?\s*(?:[2-9]|1\d)\s*-?\s*packs?\b|\blots?\s*of\b|\bbundle\s*deal\b|\bcombo\b|\bbulk\b|\bjob\s*lot\b|\bart\s*(?:bundle|set)\b/i;

// A retailer's own edition or bundle of a set product ("Elite Trainer Box and
// Pokeball (Sam's Club)", "Costco 2-Pack Trainer Box and Booster Bundle",
// "(Dollar General Exclusive)"). A set product's identity is only set + type,
// so without this it would be filed as the plain product at the bundle's price.
/**
 * A counted lot: "5 x Tins", "Display of 10x Tins", "x 36 Booster Packs",
 * "2 x Blisters". Not the product's own contents — a booster box "(36x
 * Packs)", a case "[6x Boxes]" or "25x Booster Bundle Sealed Case", a "3x
 * Booster Pack Blister", a tin "x4 Packs".
 */
function countedUnits(t: string): boolean {
  const s = t.toLowerCase();
  const m =
    s.match(/\b(?:[2-9]|[1-9]\d)\s*x\s*(?:booster\s*)?(tins?|packs?|boxes|blisters?|bundles?)\b/) ??
    s.match(/\bx\s*(?:[2-9]|[1-9]\d)\s*(?:booster\s*)?(tins?|packs?|boxes|blisters?|bundles?)\b/);
  if (!m) return false;
  if (m[1].startsWith("pack")) return !/booster\s*box|\bdisplay\b|\bblister|\bbundle\b|\bcase\b|\btins?\b/.test(s);
  if (m[1].startsWith("box") || m[1].startsWith("bundle")) return !/\bcase\b/.test(s);
  return true;
}

// Words that name a kind of product, for twoProducts.
const PRODUCT_WORD = "(?:elite\\s*trainer\\s*box|etb|booster\\s*box|booster\\s*bundle|booster\\s*packs?|display|tins?|blisters?|decks?|collection|calendar|pin|box|kit)";
const PRODUCT_WORD_RE = new RegExp(`\\b${PRODUCT_WORD}\\b`, "g");
// A whole product on one side of a "+": what a store bundles, never a pack or a promo.
const SIDE_PRODUCT = /\b(?:booster\s*box|booster\s*bundle|elite\s*trainer\s*box|etb|(?:premium|special|collection|ultra[\s-]*premium)\s*collection|collection\s*box|tins?|battle\s*(?:decks?|box)|build\s*(?:&|and)\s*battle|blisters?)\b/;

/**
 * Two products sold as one listing: "Pitch Black Booster Box + Prismatic
 * Evolutions Bundle", "Elite Trainer Box & Booster Box Bundle", "Victini +
 * Gardevoir - V Battle Decks Bundle", "Surging Sparks 2-Pack Bundle" (a
 * store's two packs; "3-Pack Bundle" without "blister" is the same). The
 * set's own Booster Bundle is a product and never counts.
 */
function twoProducts(t: string): boolean {
  // "Chilling Reign Booster Box + Crobat Premium Collection Box": a "+" with a
  // product on both sides. "Surprise Box (Promo + 4 Booster Packs)" and "Tin –
  // Darkrai Promo + Booster Packs" have one product and its contents.
  const plus = t.toLowerCase().split(/\s\+\s/);
  if (plus.length > 1 && plus.filter((x) => SIDE_PRODUCT.test(x)).length >= 2) return true;
  const s = t.toLowerCase().replace(/booster\s*bundles?/g, " ");
  if (/\bpacks?\s*bundle\b/.test(s) && !/\bblister/.test(s)) return true;
  if (!/\bbundle\b/.test(s)) return false;
  if (/\+/.test(s)) return true;
  // "<product> & <product> … Bundle" (an "&" inside one product's name, like
  // "Espeon & Umbreon Battle Deck Bundle", names one product word).
  return (s.match(PRODUCT_WORD_RE) ?? []).length >= 2 && new RegExp(`${PRODUCT_WORD}s?\\s*(?:&|\\band\\b)\\s*`).test(s);
}

const RETAIL_EDITION =
  /\bcostco\b|\bsam'?s\s*club\b|\bdollar\s*general\b|\bwalmart\b|\btarget\b|\bgamestop\b|\bbest\s*buy\b|\bmeijer\b|\bwalgreens\b|\bkmart\b|\bretail\s*exclusive\b/i;

// ── set detection ────────────────────────────────────────────────────────────

interface SetMatcher {
  set: PokemonSet;
  re: RegExp;
  len: number;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameRe(name: string): string {
  return escapeRe(normalizeTitle(name))
    .replace(/&/g, "(?:&|and)")
    .replace(/'/g, "'?")
    .replace(/\s+/g, "[\\s:\\-]*");
}

// ("3x Booster Pack Blister" and "Single Booster Blister" are product words too.)
const GENERIC_TAIL =
  "(?=(?:\\s*(?:me|sv|swsh|sm)\\s*-?\\s*0?1\\b)?\\s*(?:[:|-]\\s*)?(?:base\\b|regular\\b|standard\\b|booster|elite|etb|trainer|build|sleeved|blister|checklane|single|one\\b|two|three|\\d\\s*x?\\s*-?\\s*(?:pack|booster)|packs?\\b|display|bundle|case|premium|collection|tin|mini|ultra|pokemon\\s*center\\s*(?:elite|etb)|\\(|\\[|$))";

let MATCHERS: { specific: SetMatcher[]; generic: SetMatcher[] } | null = null;

function matchers() {
  if (MATCHERS) return MATCHERS;
  const specific: SetMatcher[] = [];
  const generic: SetMatcher[] = [];
  for (const set of SETS) {
    // A series-named set only counts when nothing but a product word follows
    // it: "Mega Evolution Elite Trainer Box" is the Mega Evolution set, but
    // "Mega Evolution: Pitch Black Booster Box" is Pitch Black — and if Pitch
    // Black weren't in SETS yet, it must come out as "no set", never as the
    // series' first set.
    const tail = set.generic ? GENERIC_TAIL : "";
    const sources = [`\\b${nameRe(set.name)}\\b${tail}`, ...(set.aliases ?? [])];
    const re = new RegExp(sources.map((s) => `(?:${s})`).join("|"), "i");
    (set.generic ? generic : specific).push({ set, re, len: set.name.length });
  }
  // Longest name first, so "Prismatic Evolutions" beats "Evolutions".
  specific.sort((a, b) => b.len - a.len);
  MATCHERS = { specific, generic };
  return MATCHERS;
}

/**
 * The set a title names, or null. Series-named sets ("Scarlet & Violet") are
 * only returned when no other set matches, because every set in a series is
 * sold as "Scarlet & Violet—<set>".
 */
export function detectSet(title: string): PokemonSet | null {
  const t = normalizeTitle(title);
  const m = matchers();
  for (const s of m.specific) if (s.re.test(t)) return s.set;
  for (const s of m.generic) if (s.re.test(t)) return s.set;
  return null;
}

// ── classification ───────────────────────────────────────────────────────────

/** The product type a title describes, or null when it isn't one we compare. */
export function classify(title: string): TypeKey | null {
  const t = normalizeTitle(title).toLowerCase();
  const etb = /elite\s*trainer\s*box(?:es)?|\betbs?\b|\btrainer\s*box\b/.test(t);
  const bundle = /booster\s*bundle/.test(t);
  const box = /booster\s*(?:box|display)|display\s*box|\b36\s*(?:booster\s*)?packs?\b/.test(t);
  const caseWord = /\bcase\b|\bcases\b/.test(t);

  // Wholesale displays of small products (10 tins, 24 sleeved packs, …). Real
  // products, but priced per display, and rarely stocked by more than one store.
  if (/\b(?:sleeved|blister|tin|tins|build\s*(?:&|and|n)?\s*battle|collection|checklane|decks?|pre-?release)\b[^|]*\b(?:display|case)\b/.test(t) && !etb && !bundle && !/booster\s*box/.test(t)) {
    return null;
  }
  // A display of booster bundles, a case of those displays, a distributor's
  // master carton: none is the set's bundle or its standard case.
  if (/booster\s*bundles?\s*(?:sealed\s*)?display|\bdisplay\s*(?:of\s*)?booster\s*bundles?|\bcartons?\b/.test(t)) return null;
  // Two products in one listing ("Elite Trainer Box and Booster Bundle").
  if (etb && bundle && !caseWord) return null;
  // The 25th-anniversary First Partner Packs (an oversize card and two
  // boosters) are a collection-style product, not a set's booster pack.
  if (/\bfirst\s*partner\s*packs?\b/.test(t)) return "collection";

  // Promotional and miniature packs (Fun Packs, Mini Packs, McDonald's and
  // cereal-box packs, POP Series): a few cards each, not the set's booster pack.
  if (/\bfun\s*packs?\b|\bmini\s*(?:booster\s*)?packs?\b|\bpromo\s*(?:booster\s*)?packs?\b|\bpop\s*series\b|\bmcdonald'?s\b|\bgeneral\s*mills\b/.test(t)) {
    return null;
  }

  // Half boxes and "enhanced" displays are different pack counts from the
  // set's real booster box, so they can't share its price.
  // Plurals too: Team Card Game (SG) titles one "Pitch Black Half Booster Boxes",
  // which the singular-only rule let through as the set's booster box at S$135
  // (2026-10-16).
  if (/\bhalf\s*(?:booster\s*)?(?:box(?:es)?|displays?)\b|\benhanced\s*(?:booster\s*)?(?:box(?:es)?|displays?)\b/.test(t)) return null;
  // An 18-pack box or display is the half display under another name: a
  // eurozone store's "Pitch Black Booster Box (18 Boosters)" was ranked as the
  // set's €132.99 booster box (2026-10-16).
  if (/booster\s*(?:box|display)|display\s*box/.test(t) && /\b18\s*x?\s*(?:booster\s*)?(?:packs?|boosters?)\b|\(\s*18\s*\)/.test(t)) return null;

  // "Elite Trainer Box Plus" (more packs, a different price) and cases of
  // Pokémon Center ETBs are not the plain ETB or its case.
  const etbVariant = /\bplus\b/.test(t) ? "plus" : /pokemon\s*center|\bpc\b/.test(t) ? "pc" : null;
  if (caseWord) {
    if (etb) return etbVariant ? null : "etb-case";
    if (bundle) return "booster-bundle-case";
    if (box || /\bdisplay\b|booster\s*case/.test(t)) return "booster-box-case";
    return null;
  }
  // A title naming both an ETB and a booster box is whichever it names first:
  // "Booster Box 151 Pokemon Center Elite Trainer Box (Exclusive)" sells the box.
  if (etb && box && t.search(/booster\s*(?:box|display)|display\s*box|\b36\s*(?:booster\s*)?packs?\b/) < t.search(/elite\s*trainer\s*box|\betbs?\b|\btrainer\s*box\b/)) return "booster-box";
  if (etb) return etbVariant === "plus" ? null : etbVariant === "pc" ? "pc-etb" : "etb";
  if (box) return "booster-box";
  if (bundle) return "booster-bundle";
  if (/build\s*(?:&|and|n)?\s*battle\s*stadium/.test(t)) return "build-battle-stadium";
  if (/build\s*(?:&|and|n)?\s*battle|pre-?release\s*(?:kit|box|pack)/.test(t)) return "build-battle";
  if (/ultra\s*-?\s*premium/.test(t)) return "upc";
  if (/\bmini\s*tins?\b|\btins?\b/.test(t)) return "tin";
  // "Tech Sticker Blister Collection" is the Tech Sticker Collection, sold in a
  // blister: the product's own name wins over its packaging.
  if (/\bcollections?\b/.test(t)) return "collection";
  // "Sleeved Blister" is a sleeved booster on a blister card, not a 3-pack.
  if (/\bsleeved\b/.test(t)) return "sleeved-booster";
  // ("Base Set 2 Booster Pack" is a pack of the set Base Set 2.)
  if (/\bblisters?\b|\bcheck\s*-?\s*lane\b|(?<!\b(?:set|series)\s)\b[23]\s*-?\s*(?:booster\s*)?packs?\b|\b(?:two|three)\s*-?\s*(?:booster\s*)?packs?\b/.test(t)) return "blister";
  if (/battle\s*deck|league\s*battle|theme\s*deck|starter\s*deck|trainer\s*kit|battle\s*academy|world\s*championships?\s*deck|\bdecks?\b/.test(t)) return "deck";
  if (
    /\bcollections?\b|\bshowcase\b|\bex\s*box\b|\bv\s*box\b|\bvmax\s*box\b|\bvstar\s*box\b|\bgx\s*box\b|premium\s*box|special\s*box|surprise\s*box|\bcalendar\b|trainer'?s\s*toolkit|gift\s*box|\bchest\b/.test(
      t,
    )
  ) {
    return "collection";
  }
  if (/booster\s*packs?|\bboosters?\b|\bpacks?\b/.test(t)) return "booster-pack";
  // Any other named box ("Morpeko V Union Box", "Paldea Box", "Let's Play
  // Box") is a collection-style product.
  if (/\bbox(?:es)?\b|\bbox\s*sets?\b/.test(t)) return "collection";
  // A bare display ("Surging Sparks Display") is a booster box.
  if (/\bdisplay\b/.test(t)) return "booster-box";
  return null;
}

// ── identity ─────────────────────────────────────────────────────────────────

// Words that say nothing about WHICH product a title is. Removed before the
// remaining words become the identity of a collection, tin, blister or deck.
const NOISE = new Set(
  (
    "pokemon pkmn ptcg tcg trading card cards game games the a an of and with w for to on by from english eng en " +
    "sealed new brand box boxes official product products pre order preorder preorders presale release released releases date " +
    "dated in stock instock limited edition series sv swsh sm xy me promo promos exclusive au us uk nz ca eu sg australian " +
    "version ver wave restock item items collection collections premium special tin tins blister blisters booster boosters " +
    "pack packs deck decks kit display factory retail genuine authentic sale free shipping ship ships only each piece pcs " +
    "includes including contains featuring feat ft tcgp store online available now coming soon assorted random varies various design designs styles style choice two three four bundle " +
    // English-edition markers in several languages, and store filler.
    "english anglais englisch ingles inglese engels single x1 1x pick choose your or at br " +
    // Store notes and retailer names (2026-09 import): "[ENGLISH VER]", "(Random
    // Select)", "Willekeurige", "Neu & OVP", "Collectors Item", "(Sam's Club)",
    // "Wave 2", "Date TBD", "Nov 6", "MAX 1 PER CUSTOMER", "Local Pickup Only",
    // "(LIVE)", "MSRP DEAL", "0% VAT", "Flygon Line", "Box Set", "Base Set".
    "upc ver version random assorted willekeurig willekeurige zufallig aleatorio aleatoire ovp neu collectors item sams sam club costco target walmart " +
    "wave tbd jan feb mar apr jun jul aug sep sept oct nov dec max per customer household person account limit local pickup pick up store livestream " +
    "live stream msrp vat deal webstore presale gvms select see description line set base artwork artworks collectible collectable variant both unit units"
  ).split(" "),
);
// Kept: they distinguish real products (mini tin ≠ tin, checklane ≠ 3-pack,
// super-premium ≠ premium, ex ≠ V).
const KEEP_SHORT = new Set(["ex", "v", "gx", "mega", "mini", "super"]);

// "Special Collection" is usually just a name: stores list the Morpeko V-UNION
// Special Collection as "V-Union Box - Morpeko" too, so "special" is noise. But
// these Pokémon were sold as BOTH a Special and a Premium Collection, at
// different prices (TCGplayer lists both of each), so for them "Special
// Collection" is part of the identity. Keys are the rest of the signature.
const SPECIAL_AND_PREMIUM = new Set(["charizard-ex", "kleavor-vstar", "lucario-vstar", "pikachu-vmax"]);

// Set-less titles that name a Pokémon but no product, as `<type>|<signature>`:
// refused, never given a page of their own (Beaches TCG, 2026-10-19). "Pokemon
// Kyurem ex box": Kyurem's ex boxes are Black Kyurem's and White Kyurem's (the
// store's photo is the Black). "Mega Gengar tin": Mega Gengar's tin is the Mega
// Moonlit Tin; no tin is called "Mega Gengar". Exact signatures, not a rule for
// every Pokémon: "Mega Charizard Tin" is a tin's own name, and "Mega Gengar ex
// Tin" already has a page of its own.
const UNQUALIFIED = new Set(["collection|ex-kyurem", "tin|gengar-mega"]);

// Mega Charizard Y and Mega Mewtwo Y are different products from their X
// forms. "y" marks the Y form only in a Charizard or Mewtwo title that names no
// X ("Mega Charizard X & Y Tin", "X/Y", "(X & Y Assorted)" are the assorted
// listing), since a lone "y" is also the Spanish "and" ("Cyrus y Klara") and
// the "X & Y" series. X stays unmarked: a lone "x" is also a quantity, a collab
// ("Re-Ment x Pokémon") or "Lv.X". ("XY Furious Fists … Mega Charizard Y" says
// "xy", not "x", so it is still Y.)
function megaY(t: string): boolean {
  return /\b(?:charizard|mewtwo|glurak)\b/.test(t) && /\by\b/.test(t) && !/\bx\b/.test(t) && !/\b(?:assorted|random)\b/.test(t);
}

/**
 * An "assorted" listing of a line sold as one product per featured Pokémon,
 * naming none of them: the store ships one of several products, so it is none
 * of them. Two lines only, both kept here as separate products: an ex Box that
 * names no Pokémon ("Pokemon 30th anniversary ex box assorted": the 30th
 * Celebration Greninja ex and Sylveon ex Boxes; Ascended Heroes' three Mega ex
 * Boxes), and a Mega Charizard or Mega Mewtwo product that is X or Y ("Mega
 * Charizard Tin - Assorted", which the unmarked key filed as the X tin). Beaches
 * TCG, 2026-10-19. A set's assorted mini tins and blisters still file as the
 * set's mini tin or blister, as the "either" blisters do: here each of those is
 * one product.
 */
function assortedOfDistinct(t: string, type: TypeKey, tokens: string[]): boolean {
  const s = t.toLowerCase();
  if (!/\bassorted\b/.test(s)) return false;
  if (type === "collection" && tokens.length > 0 && tokens.every((w) => w === "ex" || w === "mega")) return true;
  return /\bmega\b/.test(s) && /\b(?:charizard|mewtwo|glurak)\b/.test(s);
}

// Words that describe a KIND of product rather than which one it is. A title
// whose only remaining words are these ("Pokémon Mini Tin", "Poster
// Collection") could be any of a dozen products, so without a set it is too
// vague to merge with anything.
const DESCRIPTORS = new Set(
  (
    "ex v gx vmax vstar mega mini super ultra stacking figure figures poster pin pins binder sticker stickers tech " +
    "surprise accessory pouch checklane holiday advent calendar toolkit trainer trainers gift chest battle league " +
    "starter theme kit portfolio lunch special 1pack 2pack y"
  ).split(" "),
);

// SKU brackets stores append: "[CRI - 3]", "[MCAP - 0]", "[ASC]", "[30C]",
// "(UPC)", "(SBC)". Upper-case codes only, read before the title is
// lowercased: "[Day]", "(151)" and "(2025)" are part of the name, and so are
// the capitalised words that say which product ("(IONO)", "(SINGLE)",
// "[BLUE]"). A set's code in capitals ("[MEW]", "[MEW - 000]" for 151,
// "[MEGA]") goes — the curated UPC list names the Pokémon.
const SKU_WORD = "(?!(?:IONO|SINGLE|BLUE|PINK|PURPLE|RED|GOLD|DAY|NIGHT|MINI|PLUS)\\s*[)\\]])";
const SKU_BRACKET = new RegExp(`\\[\\s*${SKU_WORD}[A-Z][A-Z0-9]{1,5}(?:\\s*-\\s*\\d{1,4})?\\s*\\]|\\(\\s*${SKU_WORD}[A-Z][A-Z0-9]{1,5}\\s*\\)`, "g");
// Unbracketed store notes, removed before tokenising: "MAX 1 PER CUSTOMER",
// "Limit 2", "Local Pick-Up Only", "Livestream Only", "Wave 2 - Date TBD",
// "(Ships 12/9)", "0% VAT".
const STORE_NOTE =
  /\b(?:max(?:imum)?\s*)?\d*\s*(?:x\s*)?per\s*(?:customer|client|household|person|order|account)\b|\blimit(?:ed)?\s*(?:of\s*)?\d+\b|\b(?:local|in[\s-]*store)\s*pick[\s-]*ups?(?:\s*only)?\b|\bpick[\s-]*up\s*only\b|\blive\s*-?\s*stream(?:\s*only)?\b|\bstream\s*only\b|\b\d{1,2}%\s*vat\b|\b(?:read|see)\s*(?:item\s*)?description\b|\bdate\s*tbd\b|\bwave\s*\d\b|\bmsrp\s*deal\b|\b(?:release|releases|releasing|ships?|shipping|limit|max|eta|due|arriving)\b[^)\]]*[)\]]/g;
// Years say which product only for the lines that repeat every year: the Poké
// Ball tins ("Pokeball Tin 2025" is not the 2022 one), the seasonal tins and
// chests, the Enhanced 2-Pack Blisters (2023, 2026).
const YEARLY =
  /world\s*championships?|collect(?:or'?s?|ion)\s*chest|trick\s*or\s*trade|calendar|advent|back\s*to\s*school|pencil|eraser|toolkit|battle\s*academy|stacking|pokemon\s*day|\bballs?\s*tins?\b|\bpok[eé]\s*-?\s*balls?\b|\bpokeball|\benhanced\b|\b(?:spring|summer|fall|autumn|winter|q[1-4])\b/;

function signatureTokens(title: string, set: PokemonSet | null, type: TypeKey): string[] {
  const yearly = YEARLY.test(normalizeTitle(title).toLowerCase());
  // "*Limit Two per Client*", "*See Pictures for Condition*": a store's note in stars.
  let t = normalizeTitle(title).replace(SKU_BRACKET, " ").replace(/\*+[^*]*\*+/g, " ").toLowerCase();
  // Synonyms, so one product's wordings tokenise alike: "3PK" / "Triple" /
  // "Three" / "3x Booster Pack" blisters, "Collector's Box", "Collection
  // Chest" (the Collector Chest), "S&V". A blister "with either Latias/Tinkaton
  // Promo" or "Manaphy or Togetic Promo" is the assorted one: the store ships
  // one, so the choices aren't its identity.
  t = t
    .replace(/\b3\s*-?\s*pk\b|\bthree\b/g, " 3 pack ")
    .replace(/\btriple\s*(?=(?:booster\s*|pack\s*)*blister|pack|booster)/g, " 3 pack ")
    .replace(/\b([23])\s*x\s*(?=(?:booster\s*)?(?:packs?\s*)?blister)/g, " $1 pack ")
    // A product's own pack count ("Great Tusk x4 Packs", "(36x Packs)"): countedUnits let it through.
    .replace(/\bx\s*(\d{1,2})\s*(?=(?:booster\s*)?packs?\b)|\b(\d{1,2})\s*x\s*(?=(?:booster\s*)?packs?\b)/g, " $1$2 ")
    .replace(/\beither\b(?:(?!\bpromo\b|\bcards?\b|\s-\s|\|).)*/g, " ")
    .replace(/\b[a-z0-9'-]+\s+or\s+[a-z0-9'-]+\s+(?=promo\b)/g, " ")
    // The promo card's number ("3 Pack Blister with Regigigas SWSH247").
    .replace(/\b(?:swsh|svp|sv|sm|xy|bw)\s*-?\s*\d{3}\b/g, " ")
    .replace(/\bcollector'?s?\s*box\b/g, " box ")
    .replace(/\bcollect(?:or'?s?|ion)\s*chest\b/g, " collector chest ")
    .replace(/\bpok[eé]\s*-?\s*balls?\b/g, " pokeball ")
    .replace(/\brocket'?s\b/g, " rocket ")
    .replace(/\bs\s*(?:&|and)\s*v\b/g, " scarlet & violet ")
    .replace(STORE_NOTE, " ");
  // Markers read from the whole title, before its punctuation goes.
  const markers: string[] = [];
  // A blister's pack count when it isn't the usual three: a single-pack, a
  // 2-pack and a 3-pack blister of the same Pokémon are three products. Both
  // word orders: "Single Pack Blister [Wooper]" and "Blister Pack - Single
  // Booster - Wooper", "2 Pack Blister" and "Two-Booster Blister". A checklane
  // is a single pack by definition and has its own token.
  if (type === "blister") {
    if (!/check\s*-?\s*lane/.test(t) && /\bsingle\b|\b(?:one|1)\s*-?\s*(?:booster\s*)?(?:pack\s*)?blister|\b(?:1|one)\s*-?\s*booster\b/.test(t)) {
      markers.push("1pack");
    } else if (/\b(?:two|2)\s*-?\s*(?:booster\s*)?packs?\b|\b(?:two|2)\s*-?\s*boosters?\b/.test(t)) {
      markers.push("2pack");
    }
  }
  if (megaY(t)) markers.push("y");
  const special = /\bspecial\s+collection\b/.test(t);
  if (set) {
    const m = matchers();
    const own = [...m.specific, ...m.generic].find((x) => x.set.code === set.code);
    if (own) t = t.replace(new RegExp(own.re.source, "gi"), " ");
  }
  // Series prefixes and bracketed store notes ("(Release 12/9)", "[Limit 1]").
  t = t
    .replace(/scarlet\s*(?:&|and)\s*violet|sword\s*(?:&|and)\s*shield|sun\s*(?:&|and)\s*moon|mega\s*evolution/g, " ")
    .replace(/check\s*-?\s*lane/g, "checklane")
    // A numbered series is its own product: "First Partner Illustration Collection (Series 2)".
    .replace(/\bseries\s*-?\s*(\d{1,2})\b/g, " series$1 ")
    // Set codes stores prefix titles with: "ME02", "SV4.5", "SWSH12.5", "(SV8)", "[Mega ME4.0]".
    .replace(/\b(?:mega\s*)?(?:me|sv|swsh|sm|xy|s)\s*-?\s*\d{1,2}(?:\.\d|pt\d|a)?\b/g, " ")
    // Trailing dates: "- 2026-11-06", "May 22, 2026".
    .replace(/\b(?:19|20)\d\d\s*-\s*\d\d\s*-\s*\d\d\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ");
  const words = new Set<string>();
  for (const w of t.split(" ")) {
    if (!w || NOISE.has(w)) continue;
    // Counts are not identity. Nor are years ("2025 Mega Charizard X ex UPC"),
    // except for the products that come out every year (YEARLY).
    if (/^\d+$/.test(w) && !(yearly && /^(?:19|20)\d\d$/.test(w))) continue;
    if (w.length < 2 && !KEEP_SHORT.has(w)) continue;
    words.add(w);
  }
  if (special && SPECIAL_AND_PREMIUM.has([...words].sort().join("-"))) markers.push("special");
  return [...new Set([...words, ...markers])].sort();
}

// The Ultra-Premium Collections, by the Pokémon on the box. Twelve products
// were 93 pages in the 2026-09 import, split by store noise ("[MEW - 000]",
// "(Cassius Marsh Stream Only)", "Verzegeld & Authentiek"), so a UPC is
// identified by this list first and by its title's words only when no entry
// matches. Order matters: "Mega Charizard X" before "Charizard". A 30th
// Celebration UPC that names neither Day nor Night (or both) is too vague to
// file. `sets`: the set whose only UPC this is, for titles that name the set
// but not the Pokémon ("Phantasmal Flames Ultra Premium Collection").
const UPC_CANON: { key: string; name: string; re: RegExp; sets?: string[] }[] = [
  { key: "30th-day", name: "30th Celebration Ultra-Premium Collection (Day)", re: /\b(?:30th|celebration)\b[^|]*\b(?:day|espeon)\b|\b(?:day|espeon)\b[^|]*\b30th\b/ },
  { key: "30th-night", name: "30th Celebration Ultra-Premium Collection (Night)", re: /\b(?:30th|celebration)\b[^|]*\b(?:night|umbreon)\b|\b(?:night|umbreon)\b[^|]*\b30th\b/ },
  { key: "mega-charizard-x", name: "Mega Charizard X ex Ultra-Premium Collection", re: /\bmega\s*-?\s*(?:charizard|glurak)|\b(?:charizard|glurak)\s*-?\s*x\b/, sets: ["me2"] },
  { key: "charizard", name: "Charizard Ultra-Premium Collection", re: /\bcharizard\b|\bglurak\b/, sets: ["swsh11"] },
  { key: "zacian-zamazenta", name: "Zacian & Zamazenta Ultra-Premium Collection", re: /\bzacian\b|\bzamazenta\b/ },
  { key: "arceus", name: "Arceus VSTAR Ultra-Premium Collection", re: /\barceus\b/ },
  { key: "mew", name: "Scarlet & Violet—151 Ultra-Premium Collection", re: /\bmew\b/, sets: ["sv3pt5"] },
  { key: "terapagos", name: "Terapagos ex Ultra-Premium Collection", re: /\bterapagos\b/ },
  { key: "greninja", name: "Greninja ex Ultra-Premium Collection", re: /\bgreninja\b/ },
  { key: "moltres", name: "Team Rocket's Moltres ex Ultra-Premium Collection", re: /\bmoltres|\brocket/ },
  { key: "celebrations", name: "Celebrations Ultra-Premium Collection", re: /\bcelebrations\b|\b25th\b/, sets: ["cel25"] },
  { key: "hidden-fates", name: "Hidden Fates Ultra-Premium Collection", re: /\bhidden\s*fates\b|\brayquaza\b/, sets: ["sm115"] },
];
const UPC_30TH = /\b30th\b|\bcelebration\b(?!s)/;

/** The curated UPC a title names, "vague" for a 30th Celebration UPC that doesn't say which, or null. */
function canonicalUpc(t: string, set: PokemonSet | null): (typeof UPC_CANON)[number] | "vague" | null {
  const s = t.toLowerCase().replace(SKU_BRACKET, " ");
  const thirtieth = set?.code === "cel30" || UPC_30TH.test(s);
  if (thirtieth) {
    const day = UPC_CANON[0].re.test(s) || /\b(?:day|espeon)\b/.test(s);
    const night = UPC_CANON[1].re.test(s) || /\b(?:night|umbreon)\b/.test(s);
    if (day !== night) return day ? UPC_CANON[0] : UPC_CANON[1];
    return "vague";
  }
  for (const c of UPC_CANON.slice(2)) if (c.re.test(s) || (set && c.sets?.includes(set.code))) return c;
  return null;
}

/** The fixed name of a curated product key (a UPC), or null. The importer applies it on full runs. */
export function canonicalName(groupKey: string): string | null {
  return UPC_CANON.find((c) => `upc|${c.key}` === groupKey)?.name ?? null;
}

export interface SealedIdentity {
  groupKey: string;
  type: TypeKey;
  typeLabel: string;
  set: PokemonSet | null;
  name: string; // display name for a NEW product row
  slugBase: string; // preferred slug for a NEW product row
}

export type Rejection =
  | "foreign"
  | "not-sealed"
  | "accessory"
  | "multiple"
  | "retail-edition"
  | "not-pokemon"
  | "unclassified"
  | "no-set"
  | "vague";

export function slugify(s: string): string {
  return normalizeTitle(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
}

// SEO tails some stores append after a dash: "… – Chaos Rising Expansion, 3
// Booster Packs with Charmeleon Promo Card, Collectible Trading Card Game Set".
const SEO_TAIL = /\b(?:collectible|collectable|expansion|card\s*game\s*set|great\s*gift|for\s*(?:kids|fans|collectors))\b/i;

/**
 * A title without its filler: trailing " | …" segments that name no product
 * ("| Pokemon TCG", "| Hobby Collectors Australia", "| 30th Anniversary") and
 * SEO tails after a dash. Leading segments stay ("Pokemon TCG | Kingdra ex
 * Special Collection"), and so does any segment with a product word in it.
 */
function stripFiller(t: string): string {
  let segs = t.split(/\s\|\s/);
  if (segs.length > 1) {
    let last = segs.length - 1;
    while (last > 0 && classify(segs[last]) === null && !detectSet(segs[last])) last--;
    segs = segs.slice(0, last + 1);
  }
  const parts = segs.join(" ").split(/\s-\s/);
  while (parts.length > 1 && parts[parts.length - 1].length >= 20 && SEO_TAIL.test(parts[parts.length - 1]) && classify(parts.slice(0, -1).join(" - "))) parts.pop();
  return parts.join(" - ");
}

// Store notes that appear unbracketed in names: "MAX 1 PER CUSTOMER", "Pre
// Order", "Presale", "WEBSTORE", "Date TBD", "Local Pickup Only", "Livestream
// Only", "In-Store Only", "Brand New", "Factory Sealed", "English Ver", a
// trailing ISO date, "Wave 2", "0% VAT".
const NAME_NOTE = new RegExp(
  [
    "\\b(?:max(?:imum)?\\s*)?\\d*\\s*(?:x\\s*)?per\\s*(?:customer|household|person|order|account)\\b",
    "\\blimit\\s*(?:of\\s*)?\\d+\\b",
    "\\bpre[\\s-]?orders?\\b",
    "\\bpresale\\b",
    "\\bwebstore\\b",
    "\\bdate\\s*tbd\\b",
    "\\btbd\\b",
    "\\b(?:local|in[\\s-]*store)\\s*pick[\\s-]*ups?(?:\\s*only)?\\b",
    "\\bpick[\\s-]*up\\s*only\\b",
    "\\blive\\s*-?\\s*stream(?:\\s*only)?\\b",
    "\\bstream\\s*only\\b",
    "\\bin[\\s-]*store\\s*only\\b",
    "\\bmsrp\\s*deal\\b",
    "\\b\\d{1,2}%\\s*vat\\b",
    "\\b(?:read|see)\\s*(?:item\\s*)?description\\b",
    "\\bwave\\s*\\d\\b",
    "\\bbrand\\s*new\\b",
    "\\b(?:official\\s*)?factory\\s*sealed\\b",
    "\\bsealed\\b",
    "\\benglish\\s*ver(?:sion)?\\b",
    "\\b(?:19|20)\\d\\d-\\d\\d-\\d\\d\\b",
  ].join("|"),
  "gi",
);
// Brackets that hold nothing but an edition marker or a store note.
const NAME_BRACKET_NOISE =
  /\s*[([]\s*(?:pok[eé]mon|english|eng|en|anglais|ingl[eé]s|englisch|inglese|english\s*ver(?:sion)?|sealed|new|upc|live|presale|pre[\s-]?orders?|in\s*stock|instock|(?:19|20)\d\d-\d\d-\d\d)\s*[)\]]\s*/gi;
// A trailing segment that is the store's category, not the product: "- Pokemon
// TCG", "- Pokémon Products", "- Scarlet & Violet Products English / No".
const NAME_TAIL =
  /\s*[-–—|:]\s*(?:(?:the\s+)?pok[eé]mon(?:\s*tcg)?|tcg|(?:(?:scarlet\s*&\s*violet|sword\s*&\s*shield|sun\s*&\s*moon|mega\s*evolution|pok[eé]mon(?:\s*tcg)?)\s*)?products?\b[^-–—|]*|english|new|sealed|pre-?order|tbd)\s*$/i;

const ACRONYMS = new Set(["TCG", "ETB", "UPC", "GX", "V", "VMAX", "VSTAR", "PC", "XY", "SV", "ME", "SWSH", "SM", "HS", "BW", "DX", "II", "III"]);
const SMALL_WORDS = new Set(["of", "and", "the", "a", "an", "in", "on", "with", "&"]);

/**
 * An ALL-CAPS name in title case ("PALDEA PALS MINI TIN" → "Paldea Pals Mini
 * Tin"), keeping the game's acronyms. "EX" is upper-case in the XY era (an XY
 * set, or "XY" in the name: "XY Mega Mewtwo EX Box") and "ex" since Scarlet &
 * Violet.
 */
export function titleCase(t: string): string {
  const xyEra = detectSet(t)?.series === "XY" || /\bxy\b/i.test(t);
  return t.replace(/[\p{L}\p{N}'’]+/gu, (w, i: number) => {
    const up = w.toUpperCase();
    if (ACRONYMS.has(up)) return up;
    // A set code inside a name: "SV3.5 Zapdos ex Collection".
    if (/^(?:SV|ME|SWSH|SM|XY|BW|HS)\d+$/.test(up)) return up;
    if (up === "EX") return xyEra ? "EX" : "ex";
    const low = w.toLowerCase();
    // "of", "the"… stay small except at the start or after a separator ("- The Don").
    if (i > 0 && SMALL_WORDS.has(low) && !/[-–—:(\[|]\s*$/.test(t.slice(0, i))) return low;
    return low.replace(/^\p{L}/u, (c) => c.toUpperCase());
  });
}

/** Is a name shouted? Two or more words of three letters in capitals, and most such words are. */
function isAllCaps(t: string): boolean {
  const words = (t.match(/\p{L}{3,}/gu) ?? []).filter((w) => !ACRONYMS.has(w.toUpperCase()));
  const caps = words.filter((w) => w === w.toUpperCase());
  return caps.length >= 2 && caps.length >= words.length * 0.6;
}

/**
 * The store's title, tidied into a product name (for collections, tins, …).
 * Idempotent: the importer re-runs it over every stored name on a full run.
 */
export function cleanName(title: string): string {
  let t = decodeEntities(title)
    .replace(/[\u2063\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Store notes first, so a lead-in they hid ("(Local Pickup Only) Pokemon
  // Scarlet & Violet: …", "WEBSTORE 1 PER CUSTOMER Pokémon TCG: …") is at the
  // start when the lead-in strips run.
  t = t
    .replace(SKU_BRACKET, " ")
    .replace(NAME_BRACKET_NOISE, " ")
    // Bracketed store notes: "(Pre-Order)", "(Ships 12/9)", "[Limit 2]", "(One Per Customer)".
    // Whole words only: "[Unlimited Edition]", "(Metal Coin)" and
    // "(World Championships 2023)" are part of the name.
    .replace(/\s*[([][^)\]]*(?:\bpre[-\s]?orders?|\breleas|\bships?\b|\beta\b|\blimit|\barriv|\bper\s*(?:customer|household|order|person)\b|\bstream\s*only|\bpick[\s-]*up|\bmsrp|\bmax\s*\d)[^)\]]*[)\]]\s*/gi, " ")
    .replace(/\*+[^*]*\*+/g, " ")
    .replace(NAME_NOTE, " ")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  t = t
    // "Pokémon TCG:" / "Pokémon -" lead-ins go; "Pokémon GO", "Pokémon Center",
    // "Pokémon Collector Chest", "Pokémon Day", "Pokémon World Championships"
    // and "Pokémon Trainer's Toolkit" are names.
    .replace(/^\s*(?:the\s+)?pok[eé]mon(?!\s*(?:go|center|centre|collector|day|world|trainer)\b)\s*(?:tcg|trading\s*card\s*game)?\s*[:\-–—|]?\s*/i, "")
    .replace(/^\s*(?:tcg|ptcg)\s*[:\-–—|]\s*/i, "")
    // A leading set code or series name: "(SV4.5) …", "ME02 - …", "ME Lumiose
    // City …", "Scarlet & Violet - …". ("XY Elite Trainer Box" is a name.)
    .replace(/^\s*[([]?\s*(?:me|sv|swsh|sm|xy)\s*-?\s*\d{1,2}(?:\.\d|pt\d)?\s*[)\]]?\s*[:\-–—|]?\s*/i, "")
    .replace(/^\s*(?:me|sv|swsh|sm)\s*[:\-–—|]?\s+(?=[a-z])/i, "")
    .replace(/^\s*(?:scarlet\s*(?:&|and)\s*violet|sword\s*(?:&|and)\s*shield|sun\s*(?:&|and)\s*moon|mega\s*evolution|xy)\s*(?:(?:me|sv|swsh|sm|xy)?\s*-?\s*\d{1,2}(?:\.\d)?)?\s*[:\-–—|]\s*/i, "")
    .replace(/\s+/g, " ");
  // Trailing " | Pokemon TCG" / " | <store name>": segments after a bar that
  // name no product.
  const segs = t.split(/\s\|\s/);
  if (segs.length > 1) {
    let last = segs.length - 1;
    while (last > 0 && classify(segs[last]) === null) last--;
    t = segs.slice(0, last + 1).join(" | ");
  }
  t = t.replace(NAME_TAIL, "").replace(NAME_TAIL, "");
  // A set named twice ("Paradox Rift 3 Pack Blister - Paradox Rift", "… Radiant
  // Eevee — Pokémon GO"): the trailing repeat is a store's category suffix.
  const set = detectSet(t);
  if (set) {
    const own = [...matchers().specific, ...matchers().generic].find((x) => x.set.code === set.code);
    if (own && (normalizeTitle(t).match(new RegExp(own.re.source, "gi")) ?? []).length >= 2) {
      // The matcher reads accent-folded text; the name still has its "é".
      t = t.replace(new RegExp(`\\s*[-–—|:]\\s*(?:pok[eé]mon\\s*)?(?:tcg\\s*)?(?:${own.re.source.replace(/e/g, "[eé]")})\\s*$`, "i"), "");
    }
  }
  t = t
    .replace(/(?:\s*[-–—|:]\s*){2,}/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/^[\s:\-–—|,]+|[\s:\-–—|,]+$/g, "")
    .trim();
  if (isAllCaps(t)) t = titleCase(t);
  return t.length >= 4 ? t : decodeEntities(title).trim();
}

/**
 * Identify a store title as a comparable Pokémon sealed product.
 *
 * `strict` is for titles read from a collection that isn't Pokémon-specific
 * ("pre-orders", "booster-boxes"): those must say "Pokémon" outright, since a
 * set name alone could be another game's.
 */
export function identify(title: string, opts: { strict?: boolean } = {}): SealedIdentity | Rejection {
  // "S&V" is Scarlet & Violet; a trailing " | Pokemon TCG" / " | <store>" is
  // filler (stripFiller) that would otherwise read as the title's words.
  // ("Mega Evolutions Mini Tin" is the Mega Evolution series, not XY Evolutions.)
  const t = stripFiller(normalizeTitle(title).replace(/\bS\s*(?:&|and)\s*V\b/gi, "Scarlet & Violet").replace(/\bMega\s*Evolutions\b/gi, "Mega Evolution"));
  if (!t) return "unclassified";
  if (FOREIGN.test(t) || LANG_NAMES_RE.test(normalizeTitle(title))) return "foreign";
  if (NOT_SEALED.test(t)) return "not-sealed";
  if (ACCESSORY.test(t)) return "accessory";
  if (BINDER.test(t) && !/binder\s*collection/i.test(t)) return "accessory";
  if (merch(t)) return "accessory";
  if (MULTIPLE.test(t) || twoProducts(t) || countedUnits(t)) return "multiple";

  // In a store's Pokémon collection the collection itself says it's Pokémon
  // (stores routinely drop the word: "Charizard ex Premium Collection"). In any
  // other collection the title must say so.
  if (OTHER_GAME.test(t)) return "not-pokemon";
  if (opts.strict && !POKEMON_WORD.test(t)) return "not-pokemon";
  let set = detectSet(t);

  const type = classify(t);
  if (!type) return "unclassified";
  const info = TYPE_BY_KEY.get(type)!;

  if (info.kind === "set") {
    if (!set) return "no-set";
    if (RETAIL_EDITION.test(t)) return "retail-edition";
    // "Prismatic Evolutions Booster Box (36 Packs)": the set has no booster
    // box, so this is a store's bundle of loose packs.
    if ((type === "booster-box" || type === "booster-box-case") && set.noBoosterBox) return "multiple";
    return {
      groupKey: `${set.code}|${type}`,
      type,
      typeLabel: info.label,
      set,
      name: `${set.name} ${info.label}`,
      slugBase: slugify(`${set.slug} ${info.label}`),
    };
  }

  // A series name on a collection, tin, blister or deck ("Sword & Shield
  // Checklane Blister - Grookey", "Scarlet & Violet Ultra Premium Collection -
  // Terapagos") is the era, not the set: stores add it and drop it at random,
  // and the same product then split into two pages. Nor does "Base" keep it:
  // "Scarlet & Violet Base Set 3 Pack Blister - Arcanine" and "Scarlet &
  // Violet 3 Pack Blister - Arcanine" are one product, filed by its Pokémon.
  // It stays when the title names nothing else ("Mega Evolution 3 Pack
  // Blister", "Scarlet & Violet Checklane Blister" are the base set's, not
  // vague).
  if (set?.generic && signatureTokens(t, set, type).some((w) => !DESCRIPTORS.has(w))) set = null;
  if (type === "upc") {
    const canon = canonicalUpc(t, set);
    if (canon === "vague") return "vague";
    if (canon) {
      return { groupKey: `upc|${canon.key}`, type, typeLabel: info.label, set, name: canon.name, slugBase: slugify(canon.name) };
    }
  }
  const tokens = signatureTokens(t, set, type);
  // "Mega Evolution Ultra Premium Collection" names a series, not which UPC.
  if ((!set || (type === "upc" && set.generic)) && !tokens.some((w) => !DESCRIPTORS.has(w))) return "vague";
  if (assortedOfDistinct(t, type, tokens)) return "vague";
  // For the Pokémon sold as both a Special and a Premium Collection, a
  // collection naming neither, and no set, could be either: Beaches TCG's
  // "Pokemon - Charizard Ex Box" is, by its photo, the Special Collection, and
  // four "Charizard EX Box" listings at C$360 and up were filed as the Premium
  // Collection with it (2026-10-19). ("Special Collection" adds a marker, so the
  // key no longer matches; "Super-Premium" keeps the word "super"; a set's own
  // box, "Evolutions Charizard EX Box" or "Crown Zenith Pikachu VMAX Box", is
  // named by its set.)
  if (type === "collection" && !set && SPECIAL_AND_PREMIUM.has(tokens.join("-")) && !/\bpremium\b/i.test(t)) return "vague";
  if (!set && UNQUALIFIED.has(`${type}|${tokens.join("-")}`)) return "vague";
  const name = cleanName(title);
  return {
    groupKey: `${type}|${set?.code ?? "-"}|${tokens.join("-")}`,
    type,
    typeLabel: info.label,
    set,
    name,
    slugBase: slugify(name),
  };
}

export function isIdentity(x: SealedIdentity | Rejection): x is SealedIdentity {
  return typeof x === "object";
}
