// Store title → Magic: The Gathering sealed product identity.
//
// Every price on the site passes through identify(). It answers three questions about a store's product title, in order, and
// refuses rather than guesses:
//
//   1. Is this English Magic SEALED product? (not a single, a graded slab, an accessory, another game, another language, a
//      store-made bundle, an event ticket or a damaged box)
//   2. What type of product is it? (Play Booster Box, Collector Booster Box, Bundle, Commander Deck, …)
//   3. Which product is it, across stores? (the groupKey)
//
// Wrongly merging two products is worse than failing to merge them: a merge puts a $30 product's price on a $150 product's page
// as its "cheapest". So identity is strict. Set products ("Bloomburrow Play Booster Box") are identified by set + type and dropped
// when the set can't be read. Everything else (Commander decks, Secret Lair drops, Scene Boxes, Prerelease Packs, …) is identified
// by type + set + the distinctive words in its title (the deck's or drop's name), so two stores' wordings merge and two different
// decks never do.
//
// A bare "Booster Box" is read through the set's booster lines (sets.ts `boosters`): a 2024+ set's is its Play Booster Box, a
// 2018 set's its Draft Booster Box, and a 2020–2023 set (sold in Draft AND Set Boosters) leaves it ambiguous, so it is refused.
//
// Pure module (no DB, no fetch) so it is unit-tested directly (tests/sealed-title.test.ts) and shared by the importer and the
// store probe.
import { SETS, type BoosterLine, type MtgSet } from "./sets";

// ── product types ────────────────────────────────────────────────────────────

export type TypeKey =
  | "play-booster-box"
  | "collector-booster-box"
  | "draft-booster-box"
  | "set-booster-box"
  | "jumpstart-booster-box"
  | "bundle"
  | "gift-bundle"
  | "special-bundle"
  | "commander-deck"
  | "commander-deck-set"
  | "prerelease-pack"
  | "draft-night"
  | "scene-box"
  | "starter"
  | "secret-lair"
  | "play-booster"
  | "collector-booster"
  | "draft-booster"
  | "set-booster"
  | "jumpstart-booster"
  | "deck"
  | "collection"
  | "play-booster-box-case"
  | "collector-booster-box-case"
  | "bundle-case";

export interface ProductTypeInfo {
  key: TypeKey;
  label: string; // singular, as it reads in a product name
  plural: string; // for headings and category pages
  slug: string; // URL segment for /<region>/type/<slug>
  // "set": one product per set (identity = set + type).
  // "multi": several products per set (identity also needs the title's words).
  kind: "set" | "multi";
  // Lowest believable price, in US cents, converted per market (FLOOR_FX). A listing below it is a deposit variant, a single card
  // or a mis-listing.
  floorUsdCents: number;
}

export const PRODUCT_TYPES: ProductTypeInfo[] = [
  { key: "play-booster-box", label: "Play Booster Box", plural: "Play Booster Boxes", slug: "play-booster-boxes", kind: "set", floorUsdCents: 7000 },
  { key: "collector-booster-box", label: "Collector Booster Box", plural: "Collector Booster Boxes", slug: "collector-booster-boxes", kind: "set", floorUsdCents: 12000 },
  { key: "draft-booster-box", label: "Draft Booster Box", plural: "Draft Booster Boxes", slug: "draft-booster-boxes", kind: "set", floorUsdCents: 6000 },
  { key: "set-booster-box", label: "Set Booster Box", plural: "Set Booster Boxes", slug: "set-booster-boxes", kind: "set", floorUsdCents: 6000 },
  { key: "jumpstart-booster-box", label: "Jumpstart Booster Box", plural: "Jumpstart Booster Boxes", slug: "jumpstart-booster-boxes", kind: "set", floorUsdCents: 5000 },
  { key: "bundle", label: "Bundle", plural: "Bundles", slug: "bundles", kind: "set", floorUsdCents: 2500 },
  { key: "gift-bundle", label: "Gift Bundle", plural: "Gift Bundles", slug: "gift-bundles", kind: "set", floorUsdCents: 4000 },
  { key: "special-bundle", label: "Special Bundle", plural: "Special Bundles", slug: "special-bundles", kind: "multi", floorUsdCents: 3000 },
  { key: "commander-deck", label: "Commander Deck", plural: "Commander Decks", slug: "commander-decks", kind: "multi", floorUsdCents: 2500 },
  { key: "commander-deck-set", label: "Commander Deck Set", plural: "Commander Deck Sets", slug: "commander-deck-sets", kind: "set", floorUsdCents: 10000 },
  { key: "prerelease-pack", label: "Prerelease Pack", plural: "Prerelease Packs", slug: "prerelease-packs", kind: "multi", floorUsdCents: 1800 },
  { key: "draft-night", label: "Draft Night", plural: "Draft Night Boxes", slug: "draft-night", kind: "set", floorUsdCents: 6000 },
  { key: "scene-box", label: "Scene Box", plural: "Scene Boxes", slug: "scene-boxes", kind: "multi", floorUsdCents: 2500 },
  { key: "starter", label: "Starter Kit", plural: "Starter Kits & Beginner Boxes", slug: "starter-kits", kind: "multi", floorUsdCents: 1000 },
  { key: "secret-lair", label: "Secret Lair Drop", plural: "Secret Lair Drops", slug: "secret-lair", kind: "multi", floorUsdCents: 2000 },
  { key: "play-booster", label: "Play Booster Pack", plural: "Play Booster Packs", slug: "play-booster-packs", kind: "set", floorUsdCents: 300 },
  { key: "collector-booster", label: "Collector Booster Pack", plural: "Collector Booster Packs", slug: "collector-booster-packs", kind: "set", floorUsdCents: 1000 },
  { key: "draft-booster", label: "Draft Booster Pack", plural: "Draft Booster Packs", slug: "draft-booster-packs", kind: "set", floorUsdCents: 250 },
  { key: "set-booster", label: "Set Booster Pack", plural: "Set Booster Packs", slug: "set-booster-packs", kind: "set", floorUsdCents: 300 },
  { key: "jumpstart-booster", label: "Jumpstart Booster Pack", plural: "Jumpstart Booster Packs", slug: "jumpstart-booster-packs", kind: "set", floorUsdCents: 300 },
  { key: "deck", label: "Deck", plural: "Decks (Challenger, Duel, Starter)", slug: "decks", kind: "multi", floorUsdCents: 1000 },
  { key: "collection", label: "Collection", plural: "Collections & Gift Boxes", slug: "collections", kind: "multi", floorUsdCents: 1500 },
  { key: "play-booster-box-case", label: "Play Booster Box Case", plural: "Play Booster Box Cases", slug: "play-booster-box-cases", kind: "set", floorUsdCents: 40000 },
  { key: "collector-booster-box-case", label: "Collector Booster Box Case", plural: "Collector Booster Box Cases", slug: "collector-booster-box-cases", kind: "set", floorUsdCents: 60000 },
  { key: "bundle-case", label: "Bundle Case", plural: "Bundle Cases", slug: "bundle-cases", kind: "set", floorUsdCents: 15000 },
];

export const TYPE_BY_KEY = new Map(PRODUCT_TYPES.map((t) => [t.key, t]));
export const TYPE_BY_SLUG = new Map(PRODUCT_TYPES.map((t) => [t.slug, t]));
export const TYPE_BY_LABEL = new Map(PRODUCT_TYPES.map((t) => [t.label, t]));

/** Display order: the order PRODUCT_TYPES is written in (chase products first). */
export function typeRank(label: string): number {
  const i = PRODUCT_TYPES.findIndex((t) => t.label === label);
  return i < 0 ? 99 : i;
}

// Rough units-per-USD, used ONLY to scale the per-type price floors into each market's currency, and to size up a marketplace
// ask against other markets' prices (roughUsdCents, the importer's placeholder check). Never used to show a price: every price on
// the site is the store's own, in the store's own currency.
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

/** Working form: entities decoded, accents and ligatures folded (Æther → Aether), dashes and quotes unified. */
export function normalizeTitle(title: string): string {
  return decodeEntities(title)
    .replace(/Æ/g, "Ae")
    .replace(/æ/g, "ae")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‐-―]/g, " - ")
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ── gates ────────────────────────────────────────────────────────────────────

const MAGIC_WORD = /\bmagic\b|\bmtg\b|\bwizards\s*of\s*the\s*coast\b/i;
// Product words only Magic uses: a title carrying one is Magic whatever collection it sits in.
const MAGIC_PRODUCT = /\b(?:play|collector'?s?|set|draft|jumpstart)\s*boosters?\b|\bcommander\s*decks?\b|\bsecret\s*lair\b|\bdraft\s*night\b|\bscene\s*box\b/i;

// Other games, always: a title naming one is never Magic.
const OTHER_GAME =
  /\b(?:pokemon|pkmn|ptcg|one\s*piece|lorcana|yu-?gi-?oh|digimon|dragon\s*ball|flesh\s*(?:and|&)\s*blood|riftbound|league\s*of\s*legends|star\s*wars\s*(?:unlimited|destiny)|weiss\s*schwarz|union\s*arena|gundam|sorcery\s*(?:contested|tcg)|metazoo|grand\s*archive|battle\s*spirits|cardfight|vanguard|shadowverse|altered\s*tcg|keyforge|universus|duel\s*masters|marvel\s*(?:champions|snap)|fftcg|opus\s*[ivxl\d]+|topps|panini|upper\s*deck|nba|nfl|nhl|mlb|ufc|wwe)\b/i;
// Universes Beyond names that are ALSO other games: the Final Fantasy TCG, The Lord of the Rings LCG. Refused only when the title
// says it is that game and names nothing of Magic's.
const OTHER_GAME_UB = /\bfinal\s*fantasy\s*(?:tcg|trading\s*card\s*game)\b|\blord\s*of\s*the\s*rings\s*(?:lcg|living\s*card\s*game|(?:the\s*)?card\s*game)\b/i;

// The language named in English, French, German, Italian, Spanish or Dutch, or a bracketed code. Magic sells every set in up to
// eleven languages and stores list them side by side ("The Hobbit - Play Booster Pack - French").
const LANG_NAMES =
  "\\b(?:japanese|japan|jpn|jap|japonais|japonaise|japanisch\\w*|giapponese|japones|japans|japanse" +
  "|korean|kor|coreen|coreenne|koreanisch\\w*|coreano|koreaans" +
  "|chinese|chn|chs|cht|chinois|chinoise|chinesisch\\w*|cinese|chino|chinees|simplified|traditional\\s*chinese|mandarin" +
  "|russian|russe|russisch\\w*|russo|ruso" +
  "|german|deutsch\\w*|allemand|tedesco|aleman|duits" +
  "|french|francais|francaise|franzosisch\\w*|francese|frances|frans" +
  "|italian|italiano|italiana|italienisch\\w*|italien|italiaans" +
  "|spanish|espanol|castellano|spanisch\\w*|espagnol|spagnolo|spaans" +
  "|portuguese|portugues|brazilian|dutch|nederlands|polish|polski)\\b";
const FOREIGN = new RegExp(
  [
    // CJK / Cyrillic script anywhere.
    "[\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af\\u0400-\\u04ff]",
    LANG_NAMES,
    // A language code in brackets, or after a dash at the end: "(JP)", "[DE]", "- FR".
    "[(\\[]\\s*(?:jp|jpn|jap|kr|kor|cn|cs|ct|ru|de|ger|fr|fra|it|ita|es|spa|pt|ptbr|nl|pl)\\s*[)\\]]",
    "\\s-\\s*(?:jp|jpn|jap|kr|cn|ru|de|fr|it|es|pt|nl|pl)\\s*$",
    "\\s(?:jp|jpn|jap|kr|cn|ru|de|fr|pt|nl|pl)\\s*$",
    // Other languages' product words: a German "Spiel-Booster", a French "Booster de jeu", an Italian "busta", a Spanish "sobre".
    "\\b(?:spiel\\s*-?\\s*booster|sammler\\s*-?\\s*booster|sammelkartenspiel|vorpremiere|booster\\s*de\\s*(?:jeu|collection|extension)|boite\\s*de|coffret|busta|buste|bustine|mazzo|sobres?\\s*de|caja\\s*de|mazo|verzamel\\w*)\\b",
  ].join("|"),
  "i",
);

// Singles, slabs and anything that isn't a factory-sealed product. Also a product that was sealed and isn't quite any more ("no
// shrink", "box wear", "minor damage"), an event ticket, a box topper, a sample or omega pack, a store's break or repack.
const NOT_SEALED =
  /\b(?:psa|cgc|bgs|beckett|sgc|graded|slab|slabbed)\b|\bgem\s*mint\b|\bsingles\b|\bsingle\s*cards?\b|\bnear\s*mint\b|\blightly\s*played\b|\b(?:nm|lp|mp|hp)\b(?!\s*-?\s*\d)|\b\d{1,4}\s*\/\s*\d{2,4}\b|#\s*\d{1,4}\b|\bproxy\b|\bproxies\b|\b(?:prerelease|buy\s*-?\s*a\s*-?\s*box|bundle|launch|store\s*championship|stamped)\s*promos?\b|\bpromo\s*packs?\b|\bbox\s*toppers?\b|\bsample\s*packs?\b|\bomega\b|\btickets?\b|\bevent\s*entry\b|\bentry\s*fee\b|\bregistration\b|\bunshrink(?:ed)?\b|\bno\s*shrink\b|\bloose\s*wrap\b|\bbox\s*wear\b|\bimperfections?\b|\bminor\s*damage\b|\bopened\b|\bempty\b|\bbox\s*only\b|\bcase\s*only\b|\bwrappers?\b|\bdamaged\b|\bdented\b|\bcrushed\b|\b(?:torn|creased|ripped)\b|\bdent\b|\bresealed\b|\brepack(?:ed|s)?\b|\bmystery\s*(?:box|bag|pack|bundle)\b|\blucky\s*(?:dip|bag|box)\b|\bgrab\s*bag\b|\bcustom\b|\blive\s*break\b|\b(?:box|case|group|pack)\s*breaks?\b|\brip\s*(?:&|and)\s*ship\b|\bvalue\s*(?:lot|box|pack)\b|\binstant\s*collection\b|\bcodes?\b|\bonline\s*code\b|\bdigital\s*(?:code|copy)\b|\barena\s*code\b|\bmtgo\b/i;

// Accessories and merchandise: a title naming one of these is never the sealed product itself ("Bloomburrow Bundle Sleeves" is
// sleeves; "Pre Release Playmat" is a playmat).
const ACCESSORY =
  /\bsleeves\b|\bdeck\s*shields?\b|\bdeck\s*(?:box|boxes|case|vault|protectors?)\b|\bultra\s*pro\b|\bdragon\s*shield\b|\bultimate\s*guard\b|\bgamegenic\b|\bgamermats?\b|\bbcw\b|\balcove\b|\bflip\s*box\b|\bcard\s*(?:case|holder|protectors?|saver)\b|\btop\s*-?\s*loaders?\b|\bplay\s*-?\s*mats?\b|\bportfolio\b|\bbinders?\b|\balbums?\b|\bstorage\b|\bacrylic\b|\bprotectors?\b|\bmagnetic\b|\buv\s*(?:case|protection|resistant)\b|\bdisplay\s*(?:stand|frame)\b|\bcarry(?:ing)?\s*case\b|\bdice\b|\bd20\b|\bspindown\b|\blife\s*counters?\b|\bwall\s*scroll\b|\bposters?\b|\bart\s*prints?\b|\btoken\s*sets?\b|\bbeadle\b|\bplush(?:ie)?s?\b|\bfunko\b|\blego\b|\bkeychains?\b|\blanyards?\b|\bbackpacks?\b|\bt-?\s*shirts?\b|\bhoodie\b|\bmug\b|\bpuzzle\b|\bfigur(?:e|es|ine|ines)\b|\bnovel\b|\bbook\b|\bstickers?\b|\bbooster\s*box\s*protector\b/i;

// Store-made multiples and lots: priced for several units, so never comparable with one. "Commander Deck - Set of 5" and
// TCGplayer's "Commander Decks [Set of 5]" are the set's Commander Deck Set, read before this gate.
const MULTIPLE =
  /\(\s*pair\s*\)|\bpairs?\b|\bone\s*of\s*each\b|\bdisplay\s*of\s*\d|\b(?:set|bundle|lot)\s*of\s*(?:[2-9]|[1-9]\d|two|three|four|five|six)\b|\blots?\s*of\b|\bbundle\s*deal\b|\bcombo\b|\bmulti\s*-?\s*pack\b|\bbulk\b|\bjob\s*lot\b|\b(?:complete|full)\s*(?:set|collection)\b|^\s*[2-9]\d?\s*x\b|\bx\s*[2-9]\d?\s*\)?\s*$|[([]\s*[2-9]\d?\s*x\s*[)\]]|[([]\s*x\s*[2-9]\d?\s*[)\]]|\b(?:[2-9]|[1-9]\d)\s*x\s*(?:play|collector|set|draft)?\s*(?:booster\s*)?(?:packs?|boxes|bundles?|decks?)\b|\b(?:[2-9]|1\d)\s*(?:booster\s*)?packs?\s*per\s*sleeve\b|\bdeluxe\b|\bbundle\s*(?:&|and|\+)\s*(?:collector|play)\b|\s\+\s/i;

// A single card's treatment ("Sheoldred (Borderless)", "Extended Art Foil"): never on a sealed title, except a Secret Lair drop's or a
// Collector's Edition deck's, which name the foil they are printed in.
const SINGLE_TREATMENT = /\b(?:borderless|extended\s*art|showcase|full\s*art|retro\s*frame|serialized|step\s*-?\s*and\s*-?\s*compleat)\b/i;
const TREATMENT_OK = /\bsecret\s*lair\b|\bcommander\s*decks?\b|\bcollector'?s?\s*edition\b|\bscene\s*box\b/i;

/** "36 Booster Packs" is a lot of loose packs unless the title names the box, bundle or kit that holds them. */
function countedPacks(t: string): boolean {
  const s = t.toLowerCase();
  if (!/\b(?:[2-9]|[1-9]\d)\s*(?:x\s*)?(?:play|collector'?s?|set|draft|jumpstart)?\s*(?:booster\s*)?packs?\b|\b(?:[2-9]|[1-9]\d)\s*(?:play|collector|set|draft)\s*boosters\b/.test(s)) return false;
  return !/\bbox\b|\bdisplay\b|\bbundle\b|\bkit\b|\bnight\b|\bpre\s*-?\s*release\b|\bcase\b|\bcollection\b/.test(s);
}

const RETAIL_EDITION = /\bcostco\b|\bsam'?s\s*club\b|\bwalmart\b|\btarget\s*exclusive\b|\bgamestop\b|\bbest\s*buy\b|\bretail\s*exclusive\b|\bamazon\s*exclusive\b/i;

// ── set detection ────────────────────────────────────────────────────────────

interface SetMatcher {
  set: MtgSet;
  re: RegExp;
  len: number;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Between the words of a set name: spaces, colons, dashes, commas, apostrophes, or nothing ("MiddleEarth", "Spider Man").
const SEP = "[\\s:,.'\\-]*";

/** A set name as a pattern: "The Brothers' War" matches "Brothers War", "Brothers' War" and "The Brothers' War". */
function nameRe(name: string): string {
  const words = normalizeTitle(name)
    .toLowerCase()
    .split(/[\s:,.'\-]+/)
    .filter(Boolean);
  const lead = words[0] === "the" ? "(?:the" + SEP + ")?" : "";
  const body = (words[0] === "the" ? words.slice(1) : words).map((w) => (w === "&" ? "(?:&|and)" : escapeRe(w))).join(SEP);
  return `\\b${lead}${body}\\b`;
}

let MATCHERS: SetMatcher[] | null = null;

function matchers(): SetMatcher[] {
  if (MATCHERS) return MATCHERS;
  const out: SetMatcher[] = [];
  for (const set of SETS) {
    const sources = [set.pattern ?? nameRe(set.name), ...(set.aliases ?? [])];
    out.push({ set, re: new RegExp(sources.map((s) => `(?:${s})`).join("|"), "i"), len: set.name.length });
  }
  // Longest name first, so "Secrets of Strixhaven" beats "Strixhaven" and "Modern Horizons 3" beats "Modern Horizons".
  out.sort((a, b) => b.len - a.len);
  MATCHERS = out;
  return out;
}

/** The set a title names, or null. Secret Lair titles name other properties ("Secret Lair x Final Fantasy"), so they never carry a set. */
export function detectSet(title: string): MtgSet | null {
  const t = normalizeTitle(title);
  if (/\bsecret\s*lair\b/i.test(t) && !/\bbundle\b/i.test(t)) return null;
  for (const s of matchers()) if (s.re.test(t)) return s.set;
  return null;
}

// ── classification ───────────────────────────────────────────────────────────

type Line = BoosterLine;

const BOX_WORD = /\bbooster\s*(?:box(?:es)?|displays?)\b|\bdisplay\s*box\b|\b(?:play|collector'?s?|set|draft|jumpstart)\s*(?:box|display)\b/;
const PACK_WORD = /\bboosters?\b|\bbooster\s*packs?\b|\bpacks?\b/;

/**
 * Which booster line a title names, or, when it names none, the set's only one. "vague" when the title names none and the set was
 * sold in two (2020–2023 sets: Draft and Set Boosters), or names one the set never had. null: not a booster product at all.
 */
function boosterLine(t: string, set: MtgSet | null): Line | "vague" {
  const lines = set?.boosters;
  let named: Line | null = null;
  if (/\bcollector'?s?\s*(?:booster|box|display|pack)/.test(t)) named = "collector";
  else if (/\bjump\s*start\b/.test(t) && !(lines && lines.length === 1 && lines[0] === "jumpstart")) named = "jumpstart";
  else if (/\bplay\s*(?:booster|box|display|pack)/.test(t)) named = "play";
  else if (/\bdraft\s*(?:booster|box|display|pack)/.test(t)) named = "draft";
  else if (/\bset\s*(?:booster|box|display)/.test(t)) named = "set";
  // Jumpstart boosters are their own product whatever else the set sold.
  if (named) return !set || named === "jumpstart" || (lines && lines.includes(named)) ? named : "vague";
  // No set: the type is still a booster product, and identify() refuses it as "no-set".
  if (!set) return "play";
  if (!lines) return "vague";
  const main = lines.filter((l) => l !== "collector" && (lines.length === 1 || l !== "jumpstart"));
  return main.length === 1 ? main[0] : "vague";
}

const BOX_OF: Record<Line, TypeKey> = {
  play: "play-booster-box",
  collector: "collector-booster-box",
  draft: "draft-booster-box",
  set: "set-booster-box",
  jumpstart: "jumpstart-booster-box",
};
const PACK_OF: Record<Line, TypeKey> = {
  play: "play-booster",
  collector: "collector-booster",
  draft: "draft-booster",
  set: "set-booster",
  jumpstart: "jumpstart-booster",
};

/** The product type a title describes, "vague" when it is a booster product of an unreadable line, or null when it isn't one we compare. */
function classifyIn(title: string, set: MtgSet | null): TypeKey | "vague" | null {
  const t = normalizeTitle(title).toLowerCase();
  const caseWord = /\bcases?\b/.test(t) && !/\bdeck\s*case\b/.test(t);

  if (/\bsecret\s*lair\b/.test(t) && !/\bbundle\b/.test(t)) return caseWord ? null : "secret-lair";
  if (/\bdraft\s*night\b/.test(t)) return caseWord ? null : "draft-night";
  if (/\bscene\s*box(?:es)?\b/.test(t)) return caseWord || /\bdisplay\b/.test(t) ? null : "scene-box";
  if (/\bpre\s*-?\s*release\b/.test(t)) return caseWord || /\bdisplay\b/.test(t) ? null : "prerelease-pack";

  // Commander: a deck, the set's decks together ("Set of 5", "[Set of 4]", "All 4 Decks"), never a display or case of decks.
  if (/\bcommander\s*decks?\b|\bcommander\s*20\d\d\s*decks?\b|\bcommander\s*(?:-\s*)?(?:precon|pre-?constructed)\b/.test(t)) {
    if (caseWord || /\bdisplay\b/.test(t)) return null;
    if (/\bset\s*of\s*(?:[2-9]|two|three|four|five)\b|\ball\s*(?:[2-9]|four|five)\b|\bcomplete\s*set\b|\bdecks\s*bundle\b/.test(t)) {
      return /\bcollector'?s?\s*edition\b/.test(t) ? null : "commander-deck-set";
    }
    return /\bstarter\s*commander\b/.test(t) ? "deck" : "commander-deck";
  }

  // Bundles. The Fat Pack is the Bundle's old name. "Gift Bundle" is its own product; a bundle with a name of its own (Codex,
  // Nightmare, Beam Me Up, Chocobo, Secret Lair Bundle) is a special bundle, decided by identify() from the title's words.
  if (/\bbundles?\b|\bfat\s*packs?\b/.test(t)) {
    if (caseWord) return /\bgift\b/.test(t) ? null : "bundle-case";
    if (/\bdisplay\b/.test(t)) return null;
    return /\bgift\s*bundle\b|\bbundle\s*-?\s*gift\s*edition\b/.test(t) ? "gift-bundle" : "bundle";
  }

  if (/\bbeginner\s*box\b|\bstarter\s*(?:kit|collection|set)\b|\bwelcome\s*(?:deck|booster)\b/.test(t)) return caseWord ? null : "starter";
  if (/\bchallenger\s*decks?\b|\bduel\s*decks?\b|\bplaneswalker\s*decks?\b|\bstarter\s*decks?\b|\bgame\s*night\b|\bintro\s*packs?\b|\btheme\s*decks?\b|\bplanechase\b|\barchenemy\b|\bcommander\s*anthology\b/.test(t)) {
    return caseWord || /\bdisplay\b/.test(t) ? null : "deck";
  }
  if (/\bcommander\s*collection\b|\bsignature\s*spellbook\b|\bfrom\s*the\s*vault\b|\bspellbook\b/.test(t)) return caseWord ? null : "collection";

  // Variant boxes with their own contents: never the set's box.
  if (/\bspecial\s*edition\b|\bvip\b|\bhalf\s*(?:box|display)\b|\bmini\s*(?:box|display)\b|\bsampler\b/.test(t)) return null;

  const box = BOX_WORD.test(t) || (/\bdisplay\b/.test(t) && PACK_WORD.test(t));
  if (box || (caseWord && PACK_WORD.test(t))) {
    const line = boosterLine(t, set);
    if (line === "vague") return "vague";
    if (caseWord) return line === "play" ? "play-booster-box-case" : line === "collector" ? "collector-booster-box-case" : null;
    return BOX_OF[line];
  }
  if (caseWord) return null;
  // A single booster: "Play Booster", "Collector Booster Pack", "Draft Booster", "Sleeved Play Booster".
  if (PACK_WORD.test(t)) {
    const line = boosterLine(t, set);
    return line === "vague" ? "vague" : PACK_OF[line];
  }
  return null;
}

/** The product type a title describes, or null when it isn't one we compare (or its booster line can't be read). */
export function classify(title: string): TypeKey | null {
  const c = classifyIn(title, detectSet(title));
  return c === "vague" ? null : c;
}

// ── identity ─────────────────────────────────────────────────────────────────

// Words that say nothing about WHICH product a title is. Removed before the remaining words become the identity of a Commander
// deck, a Secret Lair drop, a Scene Box, …
const BUNDLE_SELLER_WORDS = new Set([
  "factory", "fast", "ship", "ships", "shipping", "shipped", "free", "hand", "brand", "new", "nib", "ready", "now", "stock", "instock",
  "mint", "official", "authentic", "genuine", "wotc", "wizards", "coast", "release", "presale", "preorder", "pre", "order", "box",
]);

const NOISE = new Set(
  (
    "magic the gathering mtg tcg trading card cards game games wizards coast of a an and with w for to on by from in english eng en " +
    "sealed new brand official product products pre order preorder preorders presale release released releases date dated stock " +
    "instock limited universes beyond ub au us uk nz ca eu sg version ver item items sale free shipping ship ships only each " +
    "includes including contains featuring feat ft store online available now coming soon " +
    "commander deck decks precon preconstructed booster boosters pack packs box boxes display kit bundle bundles scene " +
    "prerelease pre x edition " +
    "max per customer household person account local pickup pick up livestream live stream msrp vat deal webstore tbd " +
    "jan feb mar apr may jun jul aug sep sept oct nov dec play draft set"
  ).split(" "),
);
// Words that describe a KIND of product rather than which one it is: a title left with only these names no particular product.
const DESCRIPTORS = new Set("foil nonfoil regular collector collectors starter beginner collection gift special".split(" "));

// SKU brackets stores append: "[MKM]", "(BLB-PB)". Upper-case codes only, read before the title is lowercased.
const SKU_BRACKET = /\[\s*[A-Z][A-Z0-9-]{1,7}\s*\]|\(\s*[A-Z][A-Z0-9]{1,4}(?:-[A-Z0-9]{1,4})?\s*\)/g;
// Unbracketed store notes, removed before tokenising.
const STORE_NOTE =
  /\b(?:max(?:imum)?\s*)?\d*\s*(?:x\s*)?per\s*(?:customer|client|household|person|order|account)\b|\blimit(?:ed)?\s*(?:of\s*)?\d+\b|\b(?:local|in[\s-]*store)\s*pick[\s-]*ups?(?:\s*only)?\b|\bpick[\s-]*up\s*only\b|\blive\s*-?\s*stream(?:\s*only)?\b|\b\d{1,2}%\s*vat\b|\b(?:read|see)\s*(?:item\s*)?description\b|\bdate\s*tbd\b|\bmsrp\s*deal\b|\b(?:release|releases|releasing|ships?|shipping|limit|max|eta|due|arriving)\b[^)\]]*[)\]]/g;

function signatureTokens(title: string, set: MtgSet | null, type: TypeKey): string[] {
  let t = normalizeTitle(title).replace(SKU_BRACKET, " ").replace(/\*+[^*]*\*+/g, " ").toLowerCase().replace(STORE_NOTE, " ");
  const markers: string[] = [];
  // A Collector's Edition Commander deck (the same 100 cards in foil) is a different product from the deck.
  if (type === "commander-deck" && /\bcollector'?s?\s*edition\b|\bcollectors?\s*ed\b/.test(t)) markers.push("collector");
  if (type === "secret-lair") {
    // Foil and non-foil editions of a drop are different products. A title naming neither stays apart from both.
    if (/\bnon\s*-?\s*foil\b|\bregular\s*edition\b|\bnon\s*-?\s*foil\s*edition\b/.test(t)) markers.push("nonfoil");
    else if (/\b(?:rainbow|traditional|galaxy|etched|textured|step|halo|surge)?\s*foil\b/.test(t)) markers.push("foil");
    t = t.replace(/\b(?:non\s*-?\s*foil|regular|rainbow|traditional|galaxy|etched|textured|halo|surge)\b|\bfoil\b/g, " ");
    t = t.replace(/\bsecret\s*lair\b|\bdrop\s*series\b|\bsuperdrop\b|\bdrops?\b/g, " ");
  }
  if (type === "starter") {
    // A Beginner Box, a Starter Collection and a Starter Kit of one set are three products.
    if (/\bbeginner\s*box\b/.test(t)) markers.push("beginner");
    else if (/\bstarter\s*collection\b/.test(t)) markers.push("collection");
    else if (/\bwelcome\b/.test(t)) markers.push("welcome");
    else markers.push("kit");
    t = t.replace(/\bbeginner\b|\bstarter\b|\bcollection\b|\bwelcome\b/g, " ");
  }
  if (set) {
    const own = matchers().find((x) => x.set.code === set.code);
    if (own) t = t.replace(new RegExp(own.re.source, "gi"), " ");
  }
  t = t
    .replace(/\bcollector'?s?\s*edition\b|\bcollectors?\s*ed\b/g, " ")
    // "Commander 2019", "Commander: Bloomburrow" leftovers, trailing ISO dates.
    .replace(/\bcommander\b/g, " ")
    .replace(/\b(?:19|20)\d\d\s*-\s*\d\d\s*-\s*\d\d\b/g, " ")
    // Possessives: "Marvel's" and "Marvels" tokenise alike.
    .replace(/'s\b/g, "")
    .replace(/[^a-z0-9]+/g, " ");
  const yearly = type === "deck" || type === "secret-lair" || type === "starter";
  const words = new Set<string>();
  for (const w of t.split(" ")) {
    if (!w || NOISE.has(w)) continue;
    // Counts are not identity; years are only for the lines that repeat every year (Challenger decks, Secret Lair drops).
    // A Secret Lair drop keeps every number: "Vol. 1" and "Vol. 2", "City Styles 2", "Beyond Vault 33" are different drops.
    if (/^\d+$/.test(w) && type !== "secret-lair" && !(yearly && /^(?:19|20)\d\d$/.test(w))) continue;
    if (w.length < 2 && !/^[ivx]$/.test(w) && !(type === "secret-lair" && /^\d$/.test(w))) continue;
    words.add(w);
  }
  return [...new Set([...words, ...markers])].sort();
}

export interface SealedIdentity {
  groupKey: string;
  type: TypeKey;
  typeLabel: string;
  set: MtgSet | null;
  name: string; // display name for a NEW product row
  slugBase: string; // preferred slug for a NEW product row
}

export type Rejection =
  | "foreign"
  | "not-sealed"
  | "accessory"
  | "multiple"
  | "retail-edition"
  | "not-magic"
  | "unclassified"
  | "no-set"
  | "vague";

/** Never produced since the Magic port; kept so code that names the Pokémon-era rejection keeps compiling. */
export type LegacyRejection = "not-pokemon";

export function slugify(s: string): string {
  return normalizeTitle(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
}

/**
 * A title without its filler: trailing " | …" segments that name no product ("| Magic: The Gathering", "| Good Games").
 * Leading segments stay, and so does any segment with a product word or a set name in it.
 */
function stripFiller(t: string): string {
  let segs = t.split(/\s\|\s/);
  if (segs.length > 1) {
    let last = segs.length - 1;
    while (last > 0 && classifyIn(segs[last], detectSet(segs[last])) === null && !detectSet(segs[last])) last--;
    segs = segs.slice(0, last + 1);
  }
  return segs.join(" ");
}

// Store notes that appear unbracketed in names.
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
    "\\bin[\\s-]*store\\s*only\\b",
    "\\b\\d{1,2}%\\s*vat\\b",
    "\\bbrand\\s*new\\b",
    "\\b(?:official\\s*)?factory\\s*sealed\\b",
    "\\bsealed\\b",
    "\\benglish\\s*ver(?:sion)?\\b",
    "\\b(?:19|20)\\d\\d-\\d\\d-\\d\\d\\b",
  ].join("|"),
  "gi",
);
const NAME_BRACKET_NOISE = /\s*[([]\s*(?:english|eng|en|sealed|new|live|presale|pre[\s-]?orders?|in\s*stock|mtg|magic|(?:19|20)\d\d-\d\d-\d\d)\s*[)\]]\s*/gi;
// A trailing segment that is the store's category, not the product: "- Magic: The Gathering", "| MTG", "- English".
const NAME_TAIL = /\s*[-–—|:]\s*(?:magic(?:\s*:?\s*the\s*gathering)?|mtg|tcg|english|new|sealed|pre-?order|tbd)\s*$/i;

const ACRONYMS = new Set(["MTG", "TCG", "UB", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "XIII", "XIV", "XV", "XVI", "MH3", "MH2", "SLD", "VIP", "TMNT"]);
const SMALL_WORDS = new Set(["of", "and", "the", "a", "an", "in", "on", "with", "&", "vs", "x"]);

/** An ALL-CAPS name in title case ("BLOOMBURROW BUNDLE" → "Bloomburrow Bundle"), keeping the game's acronyms. */
export function titleCase(t: string): string {
  return t.replace(/[\p{L}\p{N}'’]+/gu, (w, i: number) => {
    const up = w.toUpperCase();
    if (ACRONYMS.has(up)) return up;
    const low = w.toLowerCase();
    if (i > 0 && SMALL_WORDS.has(low) && !/[-–—:(\[|]\s*$/.test(t.slice(0, i))) return low;
    return low.replace(/^\p{L}/u, (c) => c.toUpperCase());
  });
}

/** Is a name shouted? Two or more words of three letters in capitals, and most such words are. ("FINAL FANTASY" alone is a name.) */
function isAllCaps(t: string): boolean {
  const words = (t.match(/\p{L}{3,}/gu) ?? []).filter((w) => !ACRONYMS.has(w.toUpperCase()) && !/^(?:final|fantasy)$/i.test(w));
  const caps = words.filter((w) => w === w.toUpperCase());
  return caps.length >= 2 && caps.length >= words.length * 0.6;
}

/** The store's title, tidied into a product name (for Commander decks, Secret Lair drops, …). Idempotent. */
export function cleanName(title: string): string {
  let t = decodeEntities(title)
    .replace(/[\u2063\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  t = t
    .replace(SKU_BRACKET, " ")
    .replace(NAME_BRACKET_NOISE, " ")
    .replace(/\s*[([][^)\]]*(?:\bpre[-\s]?orders?|\breleas|\bships?\b|\beta\b|\blimit|\barriv|\bper\s*(?:customer|household|order|person)\b|\bpick[\s-]*up|\bmsrp|\bmax\s*\d)[^)\]]*[)\]]\s*/gi, " ")
    .replace(/\*+[^*]*\*+/g, " ")
    .replace(NAME_NOTE, " ")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // "Magic: The Gathering -", "MTG:", "Magic " lead-ins go ("Magic Secret Lair - …", "Magic The Hobbit - Bundle").
  t = t
    .replace(/^\s*(?:magic\s*:?\s*the\s*gathering|magic\s*the\s*gatherig|mtg|magic)\s*(?:tcg|trading\s*card\s*game)?\s*[:\-–—|]?\s*/i, "")
    .replace(/^\s*universes\s*beyond\s*:\s*/i, "")
    .replace(/\s+/g, " ");
  const segs = t.split(/\s\|\s/);
  if (segs.length > 1) {
    let last = segs.length - 1;
    while (last > 0 && classify(segs[last]) === null) last--;
    t = segs.slice(0, last + 1).join(" | ");
  }
  t = t.replace(NAME_TAIL, "").replace(NAME_TAIL, "");
  t = t
    .replace(/(?:\s*[-–—|:]\s*){2,}/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/^[\s:\-–—|,]+|[\s:\-–—|,]+$/g, "")
    .trim();
  if (isAllCaps(t)) t = titleCase(t);
  return t.length >= 4 ? t : decodeEntities(title).trim();
}

/** Multi-kind types that may stand without a set: their own names say which product (a Secret Lair drop, a Duel Deck). */
const SETLESS_OK = new Set<TypeKey>(["secret-lair", "deck", "collection", "starter"]);

/**
 * Identify a store title as a comparable Magic sealed product.
 *
 * `strict` is for titles read from a collection that isn't Magic-specific ("pre-orders", "booster-boxes"): those must say Magic
 * ("MTG", "Magic: The Gathering") or use a product word only Magic has ("Play Booster", "Commander Deck", "Secret Lair"), since a
 * set name alone ("Final Fantasy", "Star Trek", "The Hobbit") could be another game's or another product's.
 */
export function identify(title: string, opts: { strict?: boolean } = {}): SealedIdentity | Rejection {
  const t = stripFiller(normalizeTitle(title));
  if (!t) return "unclassified";
  if (FOREIGN.test(t) || new RegExp(LANG_NAMES, "i").test(normalizeTitle(title))) return "foreign";
  if (OTHER_GAME.test(t)) return "not-magic";
  if (OTHER_GAME_UB.test(t) && !MAGIC_WORD.test(t) && !MAGIC_PRODUCT.test(t)) return "not-magic";
  if (NOT_SEALED.test(t)) return "not-sealed";
  if (ACCESSORY.test(t)) return "accessory";
  if (SINGLE_TREATMENT.test(t) && !TREATMENT_OK.test(t)) return "not-sealed";
  if (opts.strict && !MAGIC_WORD.test(t) && !MAGIC_PRODUCT.test(t)) return "not-magic";

  let set = detectSet(t);
  const c = classifyIn(t, set);
  if (c === "vague") return "vague";
  if (!c) return "unclassified";
  // The set's Commander decks together are one product; any other multiple is a store's lot. Judged without the set's name, whose
  // digits are not a count ("Masters 25 Booster Pack", "Modern Horizons 3 Play Booster").
  const own = set ? matchers().find((x) => x.set.code === set!.code) : undefined;
  // A booster box's own pack count in brackets ("Play Booster Box (30x Packs)", tcgdragon) says what is inside, not a lot.
  const boxCount = /-booster-box$/.test(c) ? /\(\s*\d{1,2}\s*x?\s*(?:booster\s*)?packs\s*\)/gi : null;
  const bare = (own ? t.replace(new RegExp(own.re.source, "gi"), " ") : t).replace(boxCount ?? /$^/, " ");
  if (c !== "commander-deck-set" && (MULTIPLE.test(bare) || countedPacks(bare))) return "multiple";
  if (c === "commander-deck-set" && /\b(?:[2-9]|[1-9]\d)\s*x\b|\blots?\s*of\b|\bcombo\b/i.test(bare)) return "multiple";

  let type: TypeKey = c;
  if (type === "secret-lair") set = null;
  // A store's own combination sold as a "bundle" is not a product: "BUNDLE: Reality Fracture Collector Pack, Marvel Play Booster,
  // Reality Fracture Play Booster" (a "BUNDLE:" prefix, or a list naming two or more boosters, packs or decks).
  if ((type === "bundle" || type === "special-bundle") && (/^\s*bundle\s*[:\-–]/i.test(t) || (t.match(/\b(?:boosters?|packs?|decks?)\b/gi)?.length ?? 0) >= 2 && /,/.test(t))) return "multiple";
  // A bundle with a name of its own is not the set's Bundle: "Secrets of Strixhaven - Codex Bundle", "Duskmourn Nightmare Bundle",
  // "Star Trek - Beam Me Up Bundle". Whatever words are left once the set and the noise are gone name it.
  if (type === "bundle" && set) {
    // Seller words never name a bundle ("Aetherdrift Bundle - Factory Sealed - Fast Ship", "IN HAND … Bundle").
    const rest = signatureTokens(t.replace(/\bfat\s*packs?\b/gi, " "), set, "bundle").filter((w) => w !== "fat" && !BUNDLE_SELLER_WORDS.has(w) && w !== set!.code);
    if (rest.length) type = "special-bundle";
  }
  const info = TYPE_BY_KEY.get(type)!;

  if (info.kind === "set") {
    if (!set) return "no-set";
    if (RETAIL_EDITION.test(t)) return "retail-edition";
    return {
      groupKey: `${set.code}|${type}`,
      type,
      typeLabel: info.label,
      set,
      name: `${set.name} ${info.label}`,
      slugBase: slugify(`${set.slug} ${info.label}`),
    };
  }

  if (!set && !SETLESS_OK.has(type)) return "no-set";
  const tokens = signatureTokens(t, set, type);
  const named = tokens.some((w) => !DESCRIPTORS.has(w));
  // A Commander deck, Scene Box or special bundle must say which; a Prerelease Pack may be the set's only one.
  if (!named && type !== "prerelease-pack" && type !== "starter") return "vague";
  if (!set && !named) return "vague";
  // A Starter Kit with no set is a yearly one ("Starter Kit 2023", "2021 Arena Starter Kit"): without its year it is any of them.
  if (!set && type === "starter" && !tokens.some((w) => /^(?:19|20)\d\d$/.test(w))) return "vague";
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

/** The fixed name of a curated product key, or null. No Magic product has one yet; the importer calls it on full runs. */
export function canonicalName(groupKey: string): string | null {
  void groupKey;
  return null;
}

export function isIdentity(x: SealedIdentity | Rejection): x is SealedIdentity {
  return typeof x === "object";
}
