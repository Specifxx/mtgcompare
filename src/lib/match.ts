// src/lib/match.ts (owner WP03; the entry points and their types are FROZEN by the contract, the bodies are WP03's, specified by design/stores-brief.md section 5 and pinned by tests/match.test.ts against real titles).
//
// Matching a store's listing to ONE (TCGplayer product, finish) or to nothing. The rule is RiftCompare's: understated, never wrong. A listing that two products fit, that names
// a card the key does not hold, that states a treatment or a set the product lacks, or whose finish the store does not state is SKIPPED with a reason; nothing is guessed.
//
// THE KEY, in this order (the first that exists wins; a name alone is never a key, 83% of printings share their name):
//   1. the structured SKU      "SLD-7181-EN-NF-1", "MTG-FIN-353-HASH-2", "FDN258Normal", "cc-hob-...-249-nm-f"      -> (set code, collector number)
//   2. SET-NUM in the title    "[USG - 321]", "(FIN-353)", a bare "FDN-107", "- #112 MID"                           -> (set code, collector number)
//   3. number + set NAME       "Snap 66 - Dominaria Remastered", "Biorhythm (231) (9ED)", "Rook Turret 69/309 (FINAL FANTASY)" -> (set code of that name, collector number)
//   4. name + set              "Carnivorous Cultivator (Extended Art) [Reality Fracture]"                            -> (name, set code of that name)
// The set code and the number a store prints are Scryfall's: they resolve through MatchRow.(sc, nkey), then through TCGplayer's group abbreviation (MatchRow.abbr: "[BABP - 278]"). A SKU with extra segments
// ("MUL-5-SERIALIZED-EN-FO-1", "M3C-218-RIPPLE-EN-FO-1") names the BASE card's number and a treatment: when that number finds no card it may be read from the title instead (name + set), the extras still counting as
// treatment words. The index is built IN MEMORY from the published catalogue (buildCardIndex); this module reads no database.
//
// THE GATES run before the finish step and never guess: the card NAME the title states must be one of the product's names (translated names, typo'd numbers, store typos); a SET the title names must be the product's set;
// the TREATMENT words (borderless, showcase, surge foil, ...) of a number- or SKU-keyed title must be a subset of the product's treatments (the number decides, stores often drop the treatment), those of a
// name-keyed title must be exactly the ones the product's NAME states (MatchRow.label; TCGplayer names are what stores copy; `treat` also holds what Scryfall implies, which a title may state but need not);
// a bracket the vocabulary cannot read (an unknown set label, an unknown art word the product's own name does not carry) is a skip.
//
// THE FINISH is part of the key and is decided PER VARIANT, in this order: the variant's own words ("Near Mint Foil", "Foil / Near Mint", "English / Foil Normal") and SKU suffix (-NF / -F, Normal / Foil, -nm-f), which
// must agree; then the title ("Foil", "Non-Foil", "Foil Etched", a foil pattern such as "Surge Foil"); and only for a store that prints Foil on every foil product (explicitFoil) or a product whose OTHER variants carry
// foil words, an unmarked variant is non-foil. A Foil TAG never decides (40 of 67 stores tag more than 30% of their products Foil). TCGplayer models a finish two ways, one product with Normal and Foil rows or a
// separate foil-only product ("Surge Foil", "Foil Etched"); the finish picks the product that sells it, and when two products sell the foil the title cannot tell apart (a plain foil and a "Surge Foil" at one number,
// or a "Borderless" title beside a "Borderless · Surge Foil" product, or a numberless title whose SKU number is the Surge Foil's while another product states exactly what the title says) the foil is skipped.
//
// CALLING CONVENTION. matchStoreProduct decides ONE VARIANT: pass the product's title, tags and type, the variant's title and option values, `skus` with the variant's OWN sku first (the other variants' skus may follow;
// they must agree on one (set, number)), and `siblingTitles` (the other variants' titles) so that an unmarked variant beside marked ones reads as non-foil. A product with Normal and Foil variants therefore yields TWO
// offers, one per finish, and collapseOffers keeps one row per (product, finish). matchStoreVariants does that loop for a whole product. Variants in a language other than English are misses ("language-option"), so a
// product that sells English and German variants keeps its English ones. A title that names sealed product (a booster box, a bundle, a commander deck) is answered from `ix.sealed` with finish N.
//
// MISS REASONS (the `miss` string; stable, counted per store by the importer): language-option language-tag language-title language-sku graded-lot-proxy not-a-single accessory art-card-token-oversize nokey
// sku-key-not-in-catalogue title-key-not-in-catalogue num-setname-not-in-catalogue name-setname-not-in-catalogue sku-numbers-disagree sku-title-disagree name-mismatch set-conflict treatment-not-in-product
// treatment-differs unknown-label finish-unknown finish-conflict finish-not-offered ambiguous sealed-no-product sealed-ambiguous.
import { FOIL_PATTERN_KEYS, IGNORED_FINISH_WORDS, TREATMENT_BY_SYNONYM, fold, nkey, sealedKind, type Finish, type TreatmentKey } from "./constants";

// ── The frozen entry points: types ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** One row per catalogue product the matcher may emit. Built by the importer from the TCGCSV + Scryfall files it already holds IN MEMORY (the importer reads nothing from Neon). */
export interface MatchRow {
  id: number;                          // productId
  groupId: number;
  /** folded name forms of nameForms(): TCG base name, Scryfall name, front face, each face, flavor name. */
  names: readonly string[];
  sc: string | null;                   // Scryfall set code (the group's majority code for an unjoined product)
  setNames: readonly string[];         // Scryfall set name and TCG group name with prefix variants, folded
  nkey: string | null;                 // Scryfall collector number key (TCG Number only as a fallback)
  treat: readonly TreatmentKey[];
  /** which finishes the product has (PRICE_MASK.HASN / HASF) and whether it is the etched family member */
  hasN: boolean;
  hasF: boolean;
  etched: boolean;
  rootId: number | null;
  cls: number;
  /**
   * Additive (amendment W03-2): the catalogue label of the product, "Borderless · Dwarvish" (the treatments and the unknown words its TCG name states). `treat` also carries what Scryfall implies (a Secret Lair frame is "inverted"
   * although no name says so); the label says what the NAME states, which is what a store copies. Absent: the matcher compares against `treat` alone and an unknown word in a title is a skip.
   */
  label?: string | null;
  /** Additive (amendment W03-2): the TCGplayer group abbreviation, lower-cased ("ump", "ppsos", "ac2"). Stores that print TCGplayer's abbreviation instead of Scryfall's code ("[BABP - 278]", "MTG-EN-AC2-36-NO-1") resolve through it. */
  abbr?: string | null;
  /** Additive (contract 8.2, the public feeds key on Scryfall ids): the Scryfall id of the printing and of the star twin's Foil printing. Absent where the importer cannot say; the matcher never reads them. */
  scryId?: string | null;
  starScryId?: string | null;
}
export interface SealedRef { id: number; name: string; setCode: string | null; kind: string }
export type CardIndex = ReadonlyMap<string, readonly unknown[]>;        // opaque to callers; built only by buildCardIndex
export type NameIndex = ReadonlyMap<string, number>;                    // -1 = more than one product
export interface StoreMatchIndexes { cards: CardIndex; names: NameIndex; sealed: readonly SealedRef[] }
export interface StoreListingInput {
  title: string;
  /** The variant's OWN sku first; the product's other variants' skus may follow (they must agree on one (set, number)). */
  skus: readonly (string | null | undefined)[];
  tags?: readonly string[] | string | null;
  productType?: string | null;
  /** the variant's option values / title, for finish and language ("Near Mint Foil", "English / Foil") */
  variantTitle?: string | null;
  options?: readonly string[];
  /** the store's explicitFoil convention */
  explicitFoil?: boolean;
  /** Additive (amendment W03-1): the titles of the product's OTHER variants. An unmarked variant beside variants that carry foil words is the non-foil one. */
  siblingTitles?: readonly string[];
}
export type StoreMatchPath = "sku" | "set-number" | "name-set" | "sealed";
/** The matched unit: a product AND the finish the LISTING sells (decided from the variant, the SKU, then the title; never from the headline). */
export interface StoreMatch { id: number; finish: Finish; path: StoreMatchPath }
/** `detail` (additive, amendment W03-1) names what the miss hangs on where that helps the store's health table: the unknown words of a title, the sealed words. */
export interface StoreMiss { miss: string; detail?: string }

// ── Text ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: "-", mdash: " - ", hellip: "..." };
function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const ZERO_WIDTH = /[\u200b-\u200f\u2060-\u2064\ufeff]/g;
const RARITY_W = "common|uncommon|rare|mythic(?: rare)?|special|bonus|land|enchantment|creature|artifact|instant|sorcery|planeswalker";
const RARITY_TAIL = new RegExp(`\\s+-\\s+(?:${RARITY_W})\\s*$`, "i");
const RARITY_PAREN = new RegExp(`\\s*\\((?:${RARITY_W})\\)`, "gi");
const RARITY_MID = new RegExp(`\\s+-\\s+(?:${RARITY_W})(?=\\s+-\\s+)`, "gi");
/** The title as the matcher reads it: HTML entities, zero-width characters, dashes, a leading rarity marker "{R}", a trailing "- uncommon" / "(Common)" / "(Land)", "Name No 379", "Surge-Foil", "[RTR 213]" -> "[RTR - 213]". */
export function cleanTitle(raw: string): string {
  let t = decodeEntities(raw).replace(ZERO_WIDTH, "").replace(/\u2014/g, " - ").replace(/\u2013/g, "-").replace(/\u00a0/g, " ");
  t = t.replace(/^\{@?[CURMS]\}\s*/, "");
  t = t.replace(/\[([A-Za-z0-9]{2,6}) (\d{1,4}[A-Za-z]?)\]/g, "[$1 - $2]");
  t = t.replace(RARITY_TAIL, "").replace(RARITY_PAREN, "");
  t = t.replace(/\s+No\.?\s*(\d{1,4})\b/g, " ($1)");
  t = t.replace(/\b(surge|fracture|galaxy|rainbow|halo|ripple|confetti|textured|etched|neon ink|oil slick)-foil\b/gi, "$1 foil");
  t = t.replace(RARITY_MID, "");
  return t.replace(/\s+/g, " ").trim();
}
const baseOf = (n: string): string => n.replace(/\s*\([^()]*\)/g, "").replace(/\s*\[[^[\]]*\]/g, "").trim();

// ── Languages, graded lots, sealed products, tokens ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Folded language word -> ISO-ish code. A variant says "Inglese" or "Near Mint French"; English is the only language the site prices. */
const LANGUAGE_WORDS: ReadonlyMap<string, string> = new Map([
  ["english", "en"], ["inglese", "en"], ["anglais", "en"], ["englisch", "en"], ["ingles", "en"], ["ingl s", "en"], ["eng", "en"],
  ["german", "de"], ["deutsch", "de"], ["allemand", "de"], ["tedesco", "de"], ["aleman", "de"], ["alem o", "de"],
  ["french", "fr"], ["francais", "fr"], ["fran ais", "fr"], ["francese", "fr"], ["frances", "fr"], ["franzosisch", "fr"],
  ["italian", "it"], ["italiano", "it"], ["italien", "it"], ["italienisch", "it"], ["italiana", "it"],
  ["spanish", "es"], ["espanol", "es"], ["spagnolo", "es"], ["spanisch", "es"], ["espa ol", "es"],
  ["portuguese", "pt"], ["portugues", "pt"], ["portoghese", "pt"], ["portugiesisch", "pt"],
  ["japanese", "ja"], ["giapponese", "ja"], ["japonais", "ja"], ["japanisch", "ja"], ["japones", "ja"],
  ["korean", "ko"], ["coreano", "ko"], ["koreanisch", "ko"],
  ["chinese", "zh"], ["cinese", "zh"], ["chinesisch", "zh"], ["simplified", "zh"], ["traditional", "zh"],
  ["russian", "ru"], ["russo", "ru"], ["russisch", "ru"],
  ["phyrexian", "ph"], ["hebrew", "he"], ["latin", "la"], ["greek", "grc"], ["arabic", "ar"], ["sanskrit", "sa"],      // the other languages Scryfall lists for a printing
]);
const SKU_LANGUAGES: ReadonlyMap<string, string> = new Map([["EN", "en"], ["ENG", "en"], ["DE", "de"], ["GER", "de"], ["FR", "fr"], ["IT", "it"], ["ES", "es"], ["SP", "es"], ["PT", "pt"], ["JA", "ja"], ["JP", "ja"], ["JPN", "ja"], ["KO", "ko"], ["KR", "ko"], ["ZH", "zh"], ["CS", "zh"], ["CT", "zh"], ["CN", "zh"], ["RU", "ru"]]);
/** The language a variant states: "en" (an English word and no other), "other", or null (it states none). */
export function languageOfVariant(text: string): "en" | "other" | null {
  let en = false, other = false;
  for (const token of text.split("/")) {
    const f = fold(token);
    if (!f) continue;
    if (/^(en|eng)$/.test(f)) { en = true; continue; }
    if (/^(de|ger|fr|it|es|pt|ja|jp|jpn|ko|kr|zh|cn|ru)$/.test(f)) { other = true; continue; }
    for (const w of f.split(" ")) { const l = LANGUAGE_WORDS.get(w); if (l === "en") en = true; else if (l) other = true; }
  }
  return other ? "other" : en ? "en" : null;
}
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0400-\u04ff]/;
const FOREIGN_TITLE = /\b(japanese|japan|chinese|korean|russian|italian|german|french|spanish|portuguese|deutsch|italiano|francais|espanol|jpn|simplified chinese|traditional chinese|non[\s-]?english)\b|[(\[]\s*(?:jp|kr|cn|ja)\s*[)\]]/i;
/** Treatment names that carry a language word but are English printings: the Japan showcase frames. */
const FOREIGN_OK = /\bjapan(?:ese)? showcase\b|\bjp (?:alternate art|exclusive|showcase)\b/gi;
const FOREIGN_TAG = /^(?:japanese|japan|jp|jpn|chinese|simplified chinese|traditional chinese|korean|korea|thai|french|german|italian|spanish|portuguese|russian|deutsch|italiano|francais|espanol)$/i;
/**
 * A store's own language tag: Shopify products carry "Japanese" / "German" in `tags` (or `product_type`) even when the title says neither. A foreign tag is a foreign card unless the variant states English
 * itself (matchStoreProduct reads this beside the variant's language); a tag list that names English too is a mixed listing and is not safe to price on the tag alone. Pure.
 */
export function foreignByTags(tags: readonly string[] | string | null | undefined, productType?: string | null): boolean {
  const list = (Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(",") : []).concat(productType ?? "").map((t) => t.trim()).filter(Boolean);
  return list.some((t) => FOREIGN_TAG.test(t));
}
const tagList = (tags: StoreListingInput["tags"]): string[] => (Array.isArray(tags) ? [...tags] : typeof tags === "string" ? tags.split(",") : []).map((t) => String(t).trim()).filter(Boolean);
const GRADED = /\b(?:psa|bgs|cgc|sgc|beckett|graded|slab|gem mint)\b\s*\d*|\bplayset\b|\blot of\b|\bx[2-9]\b|\b[2-9]x\b|\bbulk (?:lots?|mtg|commons?|uncommons?|rares?|mythics?|cards?|tokens?|foils?)\b|\bmystery (?:box|boxes|pack|bag|bundle|lot|deck)\b/i;
/** Proxies, replicas and signed or altered copies: judged like sealed words, because "Nim Replica" and "Theorist's Proxy" are cards. */
const PROXYISH = /\b(?:proxy|proxies|custom|replica|signed|artist proof|altered)\b/i;
const NOT_SINGLE = /\b(?:boosters?|bundle|display|prerelease (?:pack|kit)|fat pack|starter (?:kit|deck)|commander decks?|theme deck|intro pack|collector pack|case|tin|scene box|gift|box set|sealed|booster box|jumpstart pack)\b/i;
const ACCESSORY = /\b(?:sleeves?|playmat|play mat|deck box|binder|toploader|top loader|dice|album|storage|card case|mat|(?:life|loyalty|poison) counters?|protector)\b/i;
const ART_TOKEN = /\bart (?:series|card)s?\b|\btokens?\b|\bemblems?\b|\boversize[d]?\b/i;

// ── Finish words ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type FinishWord = "nonfoil" | "foil" | "etched";
/** The finish a piece of text states: etched, foil (a foil pattern such as "Surge Foil" counts), non-foil ("Normal", "Regolare", "Regulär", "Non-Foil"), null (none) or "conflict" (both). "Foil Normal" is Foil. */
export function finishOfText(text: string): FinishWord | "conflict" | null {
  const f = ` ${fold(text)} `;
  if (/ etched /.test(f)) return / non foil | nonfoil /.test(f) ? "conflict" : "etched";
  const stripped = f.replace(/ non foil | nonfoil /g, " ");
  const hadNon = stripped !== f;
  const foil = / (?:foil|foiled|holofoil|holo) /.test(stripped);
  if (foil && hadNon) return "conflict";
  if (foil) return "foil";
  if (hadNon || / (?:normal|regular|regolare|nf) /.test(f)) return "nonfoil";
  return null;
}
const merge = (a: FinishWord | "conflict" | null, b: FinishWord | "conflict" | null): FinishWord | "conflict" | null => {
  if (a === null) return b;
  if (b === null) return a;
  if (a === "conflict" || b === "conflict") return "conflict";
  if (a === b) return a;
  if ((a === "foil" && b === "etched") || (a === "etched" && b === "foil")) return "etched";
  return "conflict";
};
const CONDITION_WORD = /\b(?:near mint|nm|lightly played|light played|slightly played|lp|moderately played|mp|heavily played|hp|damaged|dmg|played|pl|excellent|mint|good|poor|new|sp|ex)\b/gi;

/** What a variant says: language, finish, graded / signed. The text is the Shopify variant title ("Near Mint / English / Foil") and its option values. */
export interface VariantFacts { lang: "en" | "other" | null; fin: FinishWord | "conflict" | null; graded: boolean }
export function variantFacts(variantTitle: string | null | undefined, options: readonly string[] | undefined): VariantFacts {
  const text = [variantTitle ?? "", ...(options ?? [])].join(" / ");
  if (!text.trim() || /^default title$/i.test(text.trim())) return { lang: null, fin: null, graded: false };
  let fin: FinishWord | "conflict" | null = null;
  for (const token of text.split(/\s*\/\s*/)) {
    // "Near Mint - Foil", "Italian - Moderately Played": a dash inside a token separates two statements
    for (const part of token.split(/\s+-\s+/)) fin = merge(fin, finishOfText(part.replace(CONDITION_WORD, " ")));
  }
  return { lang: languageOfVariant(text), fin, graded: /\b(?:graded|psa|bgs|cgc|sgc|beckett|signed)\b/i.test(text) };
}

// ── Treatment words ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const FINISH_WORDS: ReadonlySet<string> = new Set(IGNORED_FINISH_WORDS.map((w) => fold(w)).concat(["foiled", "etched foil"]));
const PREFIX_SYNONYMS: readonly (readonly [string, TreatmentKey])[] = [...TREATMENT_BY_SYNONYM].filter(([s]) => s.endsWith(" *")).map(([s, k]) => [s.slice(0, -2), k] as const).sort((a, b) => b[0].length - a[0].length);
/** Greedy longest-phrase consumption of the closed vocabulary (catalog.ts parseTcgName does the same on the TCG side): the keys a piece of text states and the words it leaves over. Finish words and version marks are dropped. */
export function treatmentWords(text: string): { keys: Set<TreatmentKey>; left: string[] } {
  const words = fold(text.replace(/\bv(?:er(?:sion)?)?\.?\s*\d+\b/gi, " ")).replace(/\bnon foil\b|\bnonfoil\b/g, " ").split(" ").filter(Boolean);
  const keys = new Set<TreatmentKey>(); const left: string[] = [];
  let i = 0;
  while (i < words.length) {
    let hit: { key: TreatmentKey; end: number } | null = null;
    for (let j = words.length; j > i && !hit; j--) { const k = TREATMENT_BY_SYNONYM.get(words.slice(i, j).join(" ")); if (k) hit = { key: k, end: j }; }
    if (!hit) { const rest = words.slice(i).join(" "); for (const [p, k] of PREFIX_SYNONYMS) if (rest === p || rest.startsWith(`${p} `)) { hit = { key: k, end: words.length }; break; } }
    if (hit) { keys.add(hit.key); i = hit.end; continue; }
    if (!FINISH_WORDS.has(words[i]!)) left.push(words[i]!);
    i++;
  }
  const kept = left.filter((w) => !/^\d{1,4}$/.test(w));
  return { keys, left: kept };
}

// ── Set vocabulary: store label aliases ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Store set labels the catalogue's own vocabulary does not know, learned from SKU consensus (the label is read beside a structured SKU whose set agrees with the card's name and number in at least three listings of
 * the 19,993-listing corpus at 95% or more, then reviewed by hand; tests/match.test.ts pins a real title for each). Folded label -> Scryfall set code. Never extended to raise the match count: an entry needs real titles.
 */
export const STORE_SET_ALIASES: Readonly<Record<string, string>> = {
  "the lord of the rings tales of middle earth commander": "ltc",         // 57 listings: "[The Lord of the Rings: Tales of Middle-Earth Commander]"
  "dungeons dragons adventures in the forgotten realms": "afr",           // 21: "[Dungeons & Dragons: Adventures in the Forgotten Realms]"
  "guilds of ravnica guild kit": "gk1",                                   // 13: "[Guilds of Ravnica Guild Kit]"
  "ravnica allegiance guild kit": "gk2",                                  // 4
  "teenage mutant ninja turtles commander": "tmc",                        // 9
  "marvel eternal legal": "mar",                                          // 11
  "international collectors edition": "cei",                              // 5: "[International Collectors' Edition]"
  "secret lair drop promos": "sld",                                       // 12: "[Secret Lair Drop Promos]" with PSLD-688 style skus; the numbers are Secret Lair's
};

// ── The index ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

interface Entry {
  id: number; groupId: number; sc: string | null; abbr: string | null; nkey: string | null; names: readonly string[];
  treat: ReadonlySet<TreatmentKey>; hasN: boolean; hasF: boolean; etched: boolean;
  stated: ReadonlySet<string> | null;           // the treatment keys the TCG name states (from the label); null when the row carries no label
  words: ReadonlySet<string> | null;            // the unknown words the TCG name states (from the label)
}
interface IndexMeta {
  byNum: Map<string, Entry[]>;                  // `${sc}|${nkey}`
  byAbbrNum: Map<string, Entry[]>;              // `${abbr}|${nkey}` (the TCGplayer group abbreviation)
  abbrs: Set<string>;
  byNameSet: Map<string, Entry[]>;              // `${name}|${sc}`
  bySc: Map<string, Entry[]>;
  codes: Set<string>;                           // every sc
  setCodes: Map<string, Set<string>>;           // folded set name (and its canonical form) -> codes
  names: Set<string>;                           // every folded name
  setNameOf: Map<string, string[]>;             // sc -> folded set names (titleNamesSet)
}
const META = new WeakMap<object, IndexMeta>();
const EMPTY_META: IndexMeta = { byNum: new Map(), byAbbrNum: new Map(), abbrs: new Set(), byNameSet: new Map(), bySc: new Map(), codes: new Set(), setCodes: new Map(), names: new Set(), setNameOf: new Map() };
const metaOf = (idx: CardIndex): IndexMeta => META.get(idx) ?? EMPTY_META;
/** The products at (set code, collector number): Scryfall's code first, then TCGplayer's group abbreviation. */
const lookup = (m: IndexMeta, code: string, num: string): Entry[] => m.byNum.get(`${code}|${num}`) ?? m.byAbbrNum.get(`${code}|${num}`) ?? [];

/** A set name in the one form every catalogue generation shares: folded, a leading "the" and "magic the gathering" dropped. */
export function canonSet(name: string): string {
  return fold(name).replace(/^(?:magic the gathering|magic|mtg)\s+/, "").replace(/^the\s+/, "").trim();
}
/** What a catalogue label states: its treatment keys and its unknown words ("Retro Frame · Serialized", "Borderless · Dwarvish"). null for a row without a label. */
function labelOf(label: string | null | undefined): { keys: Set<string>; words: Set<string> } | null {
  if (label === undefined) return null;
  const keys = new Set<string>(), words = new Set<string>();
  for (const part of (label ?? "").split(" · ")) { if (!part.trim()) continue; const w = treatmentWords(part); for (const k of w.keys) keys.add(k); for (const x of fold(part).split(" ")) if (x && !TREATMENT_BY_SYNONYM.has(x)) words.add(x); }
  return { keys, words };
}
const SET_PREFIX = /^(?:commander|art series|promo pack|universes beyond|secret lair drop|planechase|archenemy|duel decks?|jumpstart)\s*:\s*/;
const pushTo = <K, V>(m: Map<K, V[]>, k: K, v: V): void => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

/** Built once per run from the catalogue's match rows; products that are not cards (tokens, art cards, oversized, helpers) are never candidates. */
export function buildCardIndex(rows: readonly MatchRow[]): CardIndex {
  const m: IndexMeta = { byNum: new Map(), byAbbrNum: new Map(), abbrs: new Set(), byNameSet: new Map(), bySc: new Map(), codes: new Set(), setCodes: new Map(), names: new Set(), setNameOf: new Map() };
  const addSet = (name: string, sc: string): void => {
    for (const k of new Set([fold(name), canonSet(name), canonSet(name.replace(SET_PREFIX, ""))])) {
      if (!k) continue;
      const s = m.setCodes.get(k); if (s) s.add(sc); else m.setCodes.set(k, new Set([sc]));
    }
  };
  for (const r of rows) {
    if (r.cls !== 0 || !r.names.length) continue;
    const lab = labelOf(r.label);
    const e: Entry = { id: r.id, groupId: r.groupId, sc: r.sc ? r.sc.toLowerCase() : null, abbr: r.abbr ? r.abbr.toLowerCase() : null, nkey: r.nkey, names: r.names, treat: new Set(r.treat), hasN: r.hasN, hasF: r.hasF, etched: r.etched, stated: lab ? lab.keys : null, words: lab ? lab.words : null };
    for (const n of r.names) m.names.add(n);
    if (e.abbr) { m.abbrs.add(e.abbr); if (e.nkey) pushTo(m.byAbbrNum, `${e.abbr}|${e.nkey}`, e); for (const n of r.names) pushTo(m.byNameSet, `${n}|${e.abbr}`, e); }
    if (e.sc) {
      m.codes.add(e.sc); pushTo(m.bySc, e.sc, e);
      if (e.nkey) pushTo(m.byNum, `${e.sc}|${e.nkey}`, e);
      for (const n of r.names) pushTo(m.byNameSet, `${n}|${e.sc}`, e);
      for (const s of r.setNames) addSet(s, e.sc);
      const have = m.setNameOf.get(e.sc); if (!have) m.setNameOf.set(e.sc, r.setNames.map((s) => canonSet(s)).filter(Boolean));
    }
  }
  // the entries of one key are distinct objects, but two names of a row can name the same key twice
  for (const [k, v] of m.byNameSet) if (v.length > 1) m.byNameSet.set(k, [...new Set(v)]);
  const idx: CardIndex = m.byNum;
  META.set(idx, m);
  return idx;
}

// ── Structured SKUs ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SkuKey { code: string; num: string; lang: string | null; fin: FinishWord | null; extra: string[]; dialect: string }
const BINDERPOS = /^([A-Za-z0-9]{2,6})-(\d{1,4}[A-Za-z★]?)(?:\/\/\d+)?((?:-[A-Za-z0-9]+)*?)-([A-Z]{2})-(NF|F|FO|NN)-\d+$/;
const CC_SKU = /^cc-([a-z0-9]{2,6})-.*?-(\d{1,4}[a-z]?)(?:-[0-9a-f]{3,32})?-(?:nm|ex|lp|mp|hp|dm|dmg|sp|vg|g|pl)-(f|nf)$/;
const MTG_FAMILY = /^MTG-([A-Za-z0-9]{2,6})-(\d{1,4}[A-Za-z★]?)(?:-(F))?-[A-Z0-9]{10}-\d$/;
const FACE_TO_FACE = /^SIN-MTG-([A-Za-z0-9]{2,6})-(\d{1,4}[A-Za-z★]?)-([A-Z]{2,3})-[A-Z]{2}-(NF|F)$/;
const MTG_LANG_FIRST = /^MTG-([A-Z]{2})-([A-Za-z0-9]{2,6})-(\d{1,4}[A-Za-z]?)-(NO|FO|NF|F)-\d$/;
const MTG_PLAIN = /^MTG-([A-Za-z0-9]{2,6})-(\d{1,4}[A-Za-z]?)(?:-(F))?-\d$/;
const GLUED_FINISH = /^([A-Za-z0-9]{3,9})(Foil|Normal)$/;
const GLUED_ID = /^([A-Za-z0-9]{3,9})-\d{6,}$/;
/** Splits "FDN258" / "30A501" / "XMSC657" into a known set code and a collector number; null when no split, or more than one split, names a known code. */
function splitGlued(s: string, known: (c: string) => string | null): { code: string; num: string } | null {
  const hits: { code: string; num: string }[] = [];
  for (let n = 2; n <= 5 && n < s.length; n++) {
    const code = s.slice(0, n), rest = s.slice(n);
    if (!/^\d{1,4}$/.test(rest)) continue;
    const c = known(code.toLowerCase()); if (c) hits.push({ code: c, num: rest });
  }
  return hits.length === 1 ? hits[0]! : null;
}
const FIN_OF_SKU = (t: string): FinishWord => (/^(?:F|FO|f|Foil)$/.test(t) ? "foil" : "nonfoil");
/** The (set code, number) a store SKU states, the language it states and a finish suffix it carries, or null when the SKU is not one of the structured dialects. `known` resolves a code to a Scryfall code (null: unknown). */
export function parseSku(raw: string | null | undefined, known: (code: string) => string | null = (c) => c): SkuKey | null {
  const sku = (raw ?? "").trim();
  if (!sku) return null;
  const N = (n: string): string => nkey(n) ?? n;
  let m = BINDERPOS.exec(sku);
  if (m) return { code: m[1]!.toLowerCase(), num: N(m[2]!), lang: SKU_LANGUAGES.get(m[4]!) ?? m[4]!, fin: FIN_OF_SKU(m[5]!), extra: m[3]!.split("-").filter(Boolean), dialect: "binderpos" };
  m = CC_SKU.exec(sku);
  if (m) return { code: m[1]!, num: N(m[2]!), lang: "en", fin: m[3] === "f" ? "foil" : "nonfoil", extra: [], dialect: "cc" };
  m = MTG_FAMILY.exec(sku);
  if (m) return { code: m[1]!.toLowerCase(), num: N(m[2]!), lang: "en", fin: m[3] === "F" ? "foil" : null, extra: [], dialect: "mtg" };
  m = FACE_TO_FACE.exec(sku);
  if (m) return { code: m[1]!.toLowerCase(), num: N(m[2]!), lang: SKU_LANGUAGES.get(m[3]!) ?? m[3]!, fin: FIN_OF_SKU(m[4]!), extra: [], dialect: "face-to-face" };
  m = MTG_LANG_FIRST.exec(sku);
  if (m) return { code: m[2]!.toLowerCase(), num: N(m[3]!), lang: SKU_LANGUAGES.get(m[1]!) ?? m[1]!, fin: m[4] === "FO" || m[4] === "F" ? "foil" : "nonfoil", extra: [], dialect: "mtg-lang" };
  m = MTG_PLAIN.exec(sku);
  if (m && known(m[1]!.toLowerCase())) return { code: m[1]!.toLowerCase(), num: N(m[2]!), lang: "en", fin: m[3] === "F" ? "foil" : null, extra: [], dialect: "mtg-plain" };
  m = GLUED_FINISH.exec(sku);
  if (m) { const g = splitGlued(m[1]!, known); if (g) return { code: g.code, num: N(g.num), lang: "en", fin: m[2] === "Foil" ? "foil" : "nonfoil", extra: [], dialect: "glued" }; }
  m = GLUED_ID.exec(sku);
  if (m) { const g = splitGlued(m[1]!, known); if (g) return { code: g.code, num: N(g.num), lang: "en", fin: null, extra: [], dialect: "glued" }; }
  return null;
}

// ── Reading a title ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What a title says, apart from the card name: the set code and number it prints, the sets it names, the treatments, the words nothing in the vocabulary explains and the finish words OUTSIDE the card's name. */
export interface TitleReading {
  name: string;
  code: string | null;                          // a set code printed with the number: "[USG - 321]"
  num: string | null;                           // nkey of the collector number
  codes: Set<string>;                           // sets named by name or by a bare code
  treat: Set<TreatmentKey>;
  unknown: string[];
  fin: FinishWord | "conflict" | null;
  lead: boolean;                                // the reading that took leading treatment words ("Showcase Gisa") off the name
  setTexts: string[];                           // the texts that resolved as set names or set codes
}
/** The spellings a store's set label may have of the catalogue's name for it: the label, without a rarity word at its end, without the game or franchise prefix a store adds, with "Commander" moved from the end to the front
 *  ("Streets of New Capenna: Commander" is TCGplayer's "Commander: Streets of New Capenna"), and "Prerelease Promos" read as "Promos" ("Gatecrash Prerelease Promos" is Scryfall's "Gatecrash Promos"). */
function setNameForms(t: string): string[] {
  const out = new Set<string>([t]);
  const add = (x: string): void => { const y = x.replace(/\s+/g, " ").trim(); if (y) out.add(y); };
  add(t.replace(/\s*\b(?:common|uncommon|rare|mythic|special)$/, ""));
  for (const x of [...out]) add(x.replace(/^(?:dungeons dragons|universes beyond|magic the gathering|mtg) /, ""));
  for (const x of [...out]) { if (/ commander$/.test(x)) add(`commander ${x.slice(0, -10)}`); if (/ prerelease promos$/.test(x)) add(x.replace(/ prerelease promos$/, " promos")); }
  return [...out];
}
export interface Vocab { code(raw: string): string | null; setName(text: string): Set<string>; /** is this folded text the name of a card in the index? */ isName(folded: string): boolean }
function vocabOf(m: IndexMeta): Vocab {
  const code = (raw: string): string | null => {
    const c = raw.toLowerCase();
    if (m.codes.has(c) || m.abbrs.has(c)) return c;
    if (c.length >= 3 && c[0] === "x" && (m.codes.has(c.slice(1)) || m.abbrs.has(c.slice(1)))) return c.slice(1);    // TCGplayer's "Extras" groups: XMSC for msc
    return null;
  };
  const setName = (text: string): Set<string> => {
    const t = fold(text).replace(/\b(?:foil|non foil|normal|etched)\b/g, " ").replace(/\s+/g, " ").trim();
    if (!t) return new Set();
    for (const k of setNameForms(t)) {
      const out = m.setCodes.get(k) ?? m.setCodes.get(canonSet(k));
      if (out) return new Set(out);
      const a = STORE_SET_ALIASES[k]; if (a && m.codes.has(a)) return new Set([a]);
    }
    const sg = /^(.+) special guests$/.exec(t);                                       // "[Tarkir: Dragonstorm Special Guests]": the set's guests live in TCGplayer's one "Special Guests" group
    if (sg && m.setCodes.has(canonSet(sg[1]!))) return new Set(m.setCodes.get("special guests") ?? []);
    return new Set();
  };
  return { code, setName, isName: (folded) => m.names.has(folded) };
}
/** The set vocabulary of an index: a code (or a store's spelling of one) to a Scryfall code, a set name to its codes. */
export const indexVocab = (idx: CardIndex): Vocab => vocabOf(metaOf(idx));
const BR = /\[([^[\]]*)\]|\(([^()]*)\)/g;
const LEAD = /^((?:(?:foil|etched|showcase|extended|borderless|galaxy|surge|rainbow|textured|retro|full art)\s+)+)(?=[A-Za-z])/i;
const BARE_SETNUM = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]{1,4})-0*(\d{1,4}[A-Za-z★]?)(?![A-Za-z0-9])/g;
const TRAILING_FINISH = /\b(?:foil|non-foil|nonfoil|normal|etched foil|foil etched|etched)\s*$/i;
const IGNORED_GROUP_WORDS = /^(?:english|eng|en|[a-f]|\d-\d-\d|version [a-f\d]+)$/i;     // a language mark, a version mark ("(a)", "(2-3-6)", "[Version 2]")

/** One reading of a cleaned title. `stripLead` takes leading treatment words off the name ("Foil Clown Car"), which is a second reading only when the first one fails the name gate. */
export function readTitle(clean: string, v: Vocab, stripLead: boolean): TitleReading | null {
  let t = clean;
  const r: TitleReading = { name: "", code: null, num: null, codes: new Set(), treat: new Set(), unknown: [], fin: null, lead: stripLead, setTexts: [] };
  if (stripLead) {
    const m = LEAD.exec(t); if (!m) return null;
    for (const k of treatmentWords(m[1]!).keys) r.treat.add(k);
    r.fin = finishOfText(m[1]!); t = t.slice(m[0].length);
  }
  const groups: string[] = [];
  for (const m of t.matchAll(BR)) groups.push((m[1] ?? m[2] ?? "").trim());
  const rest = t.replace(BR, " | ");
  for (const g of groups) {
    if (!g || IGNORED_GROUP_WORDS.test(g)) continue;
    let m = /^([A-Za-z0-9]{2,6})\s*[-:#]\s*0*(\d{1,4}[A-Za-z★]?)$/.exec(g);
    if (m) { const c = v.code(m[1]!); if (c) { r.code = c; r.num = nkey(m[2]!); continue; } }
    m = /^#?\s*0*(\d{1,4}[A-Za-z★]?)(?:\s*\/\s*\d+)?$/.exec(g);
    if (m) { r.num ??= nkey(m[1]!); continue; }
    m = /^([A-Za-z0-9]{2,6})\s*[-:#]$/.exec(g);                                       // "(3ED-)": a set code whose number the store left out
    if (m) { const c = v.code(m[1]!); if (c) { r.codes.add(c); r.setTexts.push(g); continue; } }
    const fin = finishOfText(g);
    if (fin !== null) r.fin = merge(r.fin, fin);
    const words = treatmentWords(g.replace(CONDITION_WORD, " "));
    if (fin !== null && words.keys.size === 0 && words.left.length === 0) continue;       // "Foil", "Near Mint Foil": a finish group
    const names = v.setName(g);
    if (names.size) { for (const c of names) r.codes.add(c); r.setTexts.push(g); continue; }
    if (TREATMENT_BY_SYNONYM.has(fold(g))) { for (const k of words.keys) r.treat.add(k); continue; }
    if (/^[A-Za-z0-9]{3,6}$/.test(g) && !/^\d+$/.test(g)) { const c = v.code(g); if (c) { r.codes.add(c); r.setTexts.push(g); continue; } }
    for (const k of words.keys) r.treat.add(k);
    r.unknown.push(...words.left);
  }
  const parts = rest.replace(/\|/g, " ").split(/\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  let name = parts[0] ?? rest.replace(/\|/g, " ").trim();
  if (parts.length > 1) {
    const tailRaw = parts.slice(1).join(" - ");
    r.fin = merge(r.fin, finishOfText(tailRaw));
    const tail = tailRaw.replace(/\b(?:foil|non-foil|nonfoil|normal|etched foil|foil etched)\b/gi, "").trim().replace(/^[\s-]+|[\s-]+$/g, "");
    const cs = new Set<string>();
    const texts: string[] = [];
    for (const seg of tail.split(/\s+-\s+/)) {
      const before = cs.size;
      const sn = /^#?\s*0*(\d{1,4}[A-Za-z★]?)\s+([A-Za-z0-9]{2,6})$/.exec(seg.trim());                          // "- #112 MID", "- 326 ICE": the number, then the set code
      const sc = sn ? v.code(sn[2]!) : null;
      if (sn && sc && !r.num) { r.code = sc; r.num = nkey(sn[1]!); texts.push(seg); cs.add(sc); continue; }
      const rl = /^(?:MTG\s+)?(.+?)\s+[CURMS]\s+0*(\d{1,4}[A-Za-z]?)$/.exec(seg.trim());                          // "- MTG Born of the Gods U 155": the set name, a rarity letter, the number
      const rlSet = rl ? v.setName(rl[1]!) : new Set<string>();
      if (rl && rlSet.size && !r.num) { for (const c of rlSet) cs.add(c); r.num = nkey(rl[2]!); texts.push(seg); continue; }
      const bare = seg.replace(/^(?:common|uncommon|rare|mythic(?: rare)?|special|land)\s+/i, "");                  // "- Rare Dominaria United"
      for (const c of v.setName(seg)) cs.add(c);
      if (cs.size === before && bare !== seg) for (const c of v.setName(bare)) cs.add(c);
      if (cs.size === before && !TREATMENT_BY_SYNONYM.has(fold(seg)) && /^[A-Za-z0-9]{2,6}$/.test(seg.trim())) { const c = v.code(seg.trim()); if (c) cs.add(c); }
      if (cs.size > before) texts.push(seg);
    }
    if (!cs.size && tail) { for (const c of v.setName(tail)) cs.add(c); if (cs.size) texts.push(tail); }
    if (cs.size) { for (const c of cs) r.codes.add(c); r.setTexts.push(...texts); } else if (tail) name = parts.join(" - ");       // a tail of finish words only ("- Foil") is dropped; one the vocabulary cannot read stays in the name
  }
  const tf = TRAILING_FINISH.exec(name);
  if (tf) { r.fin = merge(r.fin, finishOfText(tf[0])); name = name.slice(0, tf.index).trim(); }
  if (!r.num) {
    const pre = /^(.+?)\s+0*(\d{1,4}[a-z]?)\s*\/\s*\d{2,4}\s+(.+)$/.exec(name);                // "Adventures in the Forgotten Realms 142/281 Farideh's Fireball"
    const preSet = pre ? v.setName(pre[1]!) : new Set<string>();
    if (pre && preSet.size) { for (const c of preSet) r.codes.add(c); r.setTexts.push(pre[1]!); r.num = nkey(pre[2]!); name = pre[3]!; }
  }
  if (!r.num && !v.isName(fold(name))) {                                           // a card whose own name carries a number ("Spider-Man 2099", "1996 World Champion") keeps it
    let m = /^0*(\d{2,4})\s+(.+)$/.exec(name);                                   // "0109 Project Deathlok Soldier"
    if (m) { r.num = nkey(m[1]!); name = m[2]!; }
    else { m = /^(.+?)\s+0*(\d{1,4}[a-z]?)(?:\s*\/\s*\d+)?$/.exec(name); if (m) { r.num = nkey(m[2]!); name = m[1]!; } }      // "Abjure 31", "Vampire Nocturnus 118/249"
  }
  if (!(r.code && r.num)) {                                                      // a bare "FDN-107 Rare Near Mint"
    const ms = [...t.matchAll(BARE_SETNUM)].filter((x) => v.code(x[1]!));
    if (ms.length === 1 && !r.num) { r.code = v.code(ms[0]![1]!); r.num = nkey(ms[0]![2]!); name = t.slice(0, ms[0]!.index).replace(/[\s-]+$/g, "").replace(/\|/g, " ").trim(); }
  }
  // a hyphen tail that is only treatment words: "Name (92) - Surge Foil"
  const segs = name.split(/\s+-\s+/);
  const keep = [segs[0] ?? ""];
  for (const seg of segs.slice(1)) {
    const w = treatmentWords(seg);
    if (w.keys.size && !w.left.length) for (const k of w.keys) r.treat.add(k); else keep.push(seg);
  }
  name = keep.join(" - ");
  if (r.num) name = name.replace(new RegExp(`\\s+0*${r.num.replace(/[a-z★]+$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[a-z]?$`, "i"), "");     // a number repeated after the name: "Secret Rendezvous 217"
  r.name = name.replace(/\s+/g, " ").trim().replace(/^[\s-]+|[\s-]+$/g, "");
  return r;
}

// ── Candidates, gates, finish ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Treatment keys that come from the GROUP, not from any word a store could write: they never separate two products in one set. */
const GROUP_ONLY: ReadonlySet<string> = new Set(["thelist", "specialguest", "secretlair"]);
const visibleKeys = (k: Iterable<string>): Set<string> => { const out = new Set<string>(); for (const x of k) if (x !== "etched" && !GROUP_ONLY.has(x)) out.add(x); return out; };
const isSubset = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => { for (const x of a) if (!b.has(x)) return false; return true; };
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && isSubset(a, b);
const unique = <T,>(xs: readonly T[]): T[] => [...new Set(xs)];

/** The folded forms of a title's card name the product's names may equal: the name, its front face, without brackets; a number-keyed title may also carry an unread " - tail" ("Charge of Eternia - Full Throttle"). */
function nameForms(name: string, allowTail: boolean): string[] {
  const forms = new Set<string>([fold(name), fold(name.split(" // ")[0]!), fold(baseOf(name))]);
  if (allowTail && name.includes(" - ")) forms.add(fold(baseOf(name.split(" - ")[0]!)));
  forms.delete("");
  return [...forms];
}
const hasName = (e: Entry, forms: readonly string[]): boolean => forms.some((f) => e.names.includes(f));

/** The treatment keys a structured SKU's extra segments state: "M3C-218-RIPPLE-EN-FO-1" says ripple, "SLD-1637-RAINBOW-..." says rainbow. Tokens the vocabulary does not know are ignored (the number decided). */
function skuTreatments(extra: readonly string[]): Set<TreatmentKey> {
  const out = new Set<TreatmentKey>();
  for (const x of extra) { const f = fold(x); const k = TREATMENT_BY_SYNONYM.get(f) ?? TREATMENT_BY_SYNONYM.get(`${f} foil`); if (k) out.add(k); }
  return out;
}
interface Resolved { cands: Entry[]; path: StoreMatchPath; keyed: "num" | "name"; reading: TitleReading; treat: Set<TreatmentKey>; rivalFoil: boolean }

/** Treatment keys a group can give a product without any word in its name: a title that leaves them out (the group is its "[Set]" part) still states the same product. */
const DERIVABLE: ReadonlySet<string> = new Set(["prerelease", "promopack", "gameday", "fnm", "judge", "buyabox", "launch", "wpn", "arenaleague", "ce", "ie"]);
/**
 * Name-keyed, tier 1: does the title state the treatments the product's NAME states (its label; a group may add its own, which a "[Set]" part of the title leaves out)? A store copies TCGplayer's name, so this is the
 * normal case. Without a label, exactly the treatments the product has.
 */
function statesTreatments(e: Entry, stated: ReadonlySet<string>): boolean {
  if (e.stated === null) return sameSet(stated, visibleKeys(e.treat));
  const s = visibleKeys(e.stated);
  if (!isSubset(stated, s)) return false;
  for (const k of s) if (!stated.has(k) && !DERIVABLE.has(k)) return false;
  return true;
}
/** Name-keyed, tier 2: the title states everything the name states and may add what Scryfall implies ("Retro" on a "(Serialized)" product). Used only when no product states exactly the title. */
function statesAndImplies(e: Entry, stated: ReadonlySet<string>): boolean {
  if (e.stated === null || !isSubset(stated, visibleKeys(e.treat))) return false;
  for (const k of visibleKeys(e.stated)) if (!stated.has(k) && !DERIVABLE.has(k)) return false;
  return true;
}
/** A foil-capable product that states the title's treatments plus a foil pattern only ("Borderless" and "Borderless · Surge Foil"). */
function foilRival(e: Entry, stated: ReadonlySet<string>): boolean {
  if (!e.hasF || e.etched) return false;
  const s = visibleKeys(e.stated ?? e.treat);
  if (!isSubset(stated, s) || s.size <= stated.size) return false;
  for (const k of s) if (!stated.has(k) && !FOIL_PATTERN_KEYS.has(k)) return false;
  return true;
}
/** One reading of the title, through the key and the three gates. `key` is the SKU's (set code, number) when it is used as the key; `extra` its extra segments, which state treatments. */
function resolveReading(r: TitleReading, key: { code: string; num: string } | null, extra: readonly string[], m: IndexMeta, v: Vocab): Resolved | StoreMiss {
  let cands: Entry[]; let path: StoreMatchPath; let keyed: "num" | "name" = "num";
  const treat = new Set<TreatmentKey>(r.treat);
  for (const k of skuTreatments(extra)) treat.add(k);
  if (key) {
    const code = v.code(key.code);
    if (r.num && r.num !== key.num) return { miss: "sku-title-disagree" };
    if (r.code && code && r.code !== code) return { miss: "sku-title-disagree" };
    // a code the vocabulary does not know cannot be checked; the SKU's NUMBER still counts beside the set the title names ("PSLD-688" and "[Secret Lair Drop Promos]")
    cands = code ? lookup(m, code, key.num) : [...r.codes].flatMap((c) => lookup(m, c, key.num));
    if (!cands.length) return { miss: "sku-key-not-in-catalogue" };
    path = "sku";
  } else if (r.code && r.num) {
    cands = lookup(m, r.code, r.num);
    if (!cands.length) return { miss: "title-key-not-in-catalogue" };
    path = "set-number";
  } else if (r.num && r.codes.size) {
    cands = [...r.codes].flatMap((c) => lookup(m, c, r.num!));
    if (!cands.length) return { miss: "num-setname-not-in-catalogue" };
    path = "set-number";
  } else if (r.codes.size && r.name) {
    keyed = "name"; path = "name-set";
    const forms = nameForms(r.name, false);
    cands = [...r.codes].flatMap((c) => forms.flatMap((f) => m.byNameSet.get(`${f}|${c}`) ?? []));
    if (!cands.length) return { miss: "name-setname-not-in-catalogue" };
  } else return { miss: "nokey" };
  cands = unique(cands);
  // gate 1 (hard): the card the title names must be the card the key points at
  const forms = nameForms(r.name, keyed === "num");
  cands = cands.filter((e) => hasName(e, forms));
  if (!cands.length) return { miss: "name-mismatch" };
  // gate 2: a set the title names must be the product's set
  if (r.codes.size && keyed === "num") { cands = cands.filter((e) => (e.sc !== null && r.codes.has(e.sc)) || (e.abbr !== null && r.codes.has(e.abbr))); if (!cands.length) return { miss: "set-conflict" }; }
  // gate 3: treatments. Number- or SKU-keyed: the title may omit a treatment (the number decides) but may not state one the product lacks; name-keyed: it must state exactly the product's, either the ones its
  // name states or all it has (Scryfall implies a frame the name does not say). A word the vocabulary does not know must be one the product's own name states.
  const stated = visibleKeys(treat);
  if (r.unknown.length) {
    cands = cands.filter((e) => e.words !== null && r.unknown.every((w) => e.words!.has(w)));
    if (!cands.length) return { miss: "unknown-label", detail: r.unknown.join(" ") };
  }
  let rivalFoil = false;
  if (keyed === "name") {
    let ok = cands.filter((e) => statesTreatments(e, stated));
    // a foil sold under a pattern name ("Surge Foil") that the title does not mention is a rival of the plain foil: the title cannot tell which one the foil variant is
    rivalFoil = ok.length > 0 && cands.some((e) => !ok.includes(e) && foilRival(e, stated));
    if (!ok.length) ok = cands.filter((e) => statesAndImplies(e, stated));
    cands = ok;
    if (!cands.length) return { miss: "treatment-differs" };
  } else {
    cands = cands.filter((e) => isSubset(stated, visibleKeys(e.treat)));
    if (!cands.length) return { miss: "treatment-not-in-product" };
    // a title with no number of its own, whose SKU number points at a foil sold under a pattern name the title leaves out ("Surge Foil"), while another product of that card and set states exactly what the title says:
    // the SKU number is then the store's merge of the two ("Gleaming Splendor (Borderless)" with SKU #275, the surge foil, at the prices of #239) and the foil cannot be placed
    if (path === "sku" && !r.num) rivalFoil = cands.some((e) => foilRival(e, stated) && e.names.some((n) => (m.byNameSet.get(`${n}|${e.sc ?? e.abbr}`) ?? []).some((q) => q !== e && statesTreatments(q, stated))));
  }
  return { cands, path, keyed, reading: r, treat, rivalFoil };
}
const isMiss = (x: unknown): x is StoreMiss => typeof x === "object" && x !== null && "miss" in x;
/** Misses of a SKU key that a SKU with extra segments may still recover from the title: its number is then the base card's, not the product's ("MUL-5-SERIALIZED-..." is the serialized twin of #5). */
const SKU_RECOVERABLE: ReadonlySet<string> = new Set(["sku-key-not-in-catalogue", "name-mismatch", "treatment-not-in-product", "set-conflict"]);

/** The key, the name gate, the set gate and the treatment gate over the readings of a title (the second one only when the first fails the name gate). */
function candidatesOf(clean: string, sku: { code: string; num: string; extra: readonly string[] } | null, m: IndexMeta, v: Vocab): Resolved | StoreMiss {
  const run = (key: { code: string; num: string } | null): Resolved | StoreMiss => {
    const first = readTitle(clean, v, false);
    const a = first ? resolveReading(first, key, sku?.extra ?? [], m, v) : ({ miss: "nokey" } as StoreMiss);
    if (!isMiss(a) || a.miss !== "name-mismatch") return a;
    const second = readTitle(clean, v, true);
    if (!second) return a;
    const b = resolveReading(second, key, sku?.extra ?? [], m, v);
    return isMiss(b) ? a : b;
  };
  const a = run(sku);
  if (!isMiss(a) || !sku || !sku.extra.length || !SKU_RECOVERABLE.has(a.miss)) return a;
  const b = run(null);
  return isMiss(b) ? a : b;
}

/**
 * The finish a listing sells. The variant's own evidence comes first: its words and its SKU suffix, which must agree; the title speaks only when the variant is silent (a title that says "Normal" on a product that
 * also sells a Foil variant is the default printing's label, not a contradiction), except that an Etched title makes a Foil variant the etched finish. A foil pattern word (Surge Foil) is foil by definition; the store's
 * convention ("unmarked is non-foil") is the last resort.
 */
function decideFinish(variant: FinishWord | "conflict" | null, sku: FinishWord | null, title: FinishWord | "conflict" | null, treat: ReadonlySet<TreatmentKey>, unmarkedIsNonfoil: boolean): FinishWord | StoreMiss {
  const primary = merge(variant, sku);
  if (primary === "conflict") return { miss: "finish-conflict" };
  let verdict: FinishWord | "conflict" | null = primary ?? title;
  if (primary !== null && title === "etched") verdict = primary === "foil" || primary === "etched" ? "etched" : "conflict";
  if (verdict === "conflict") return { miss: "finish-conflict" };
  if (treat.has("etched") && verdict !== null) verdict = verdict === "foil" || verdict === "etched" ? "etched" : "conflict";
  if (verdict === "conflict") return { miss: "finish-conflict" };
  const pattern = [...treat].some((k) => FOIL_PATTERN_KEYS.has(k));
  if (pattern) { if (verdict === "nonfoil") return { miss: "finish-conflict" }; if (verdict === null) verdict = "foil"; }
  if (verdict === null) return unmarkedIsNonfoil ? "nonfoil" : { miss: "finish-unknown" };
  return verdict;
}
/** The product that sells the finish: exactly one, else a skip. */
function pickByFinish(cands: readonly Entry[], fin: FinishWord): { e: Entry; finish: Finish } | StoreMiss {
  const sel = fin === "nonfoil" ? cands.filter((c) => c.hasN && !c.etched) : fin === "foil" ? cands.filter((c) => c.hasF && !c.etched) : cands.filter((c) => c.etched);
  if (sel.length === 1) return { e: sel[0]!, finish: fin === "nonfoil" ? "N" : "F" };
  return { miss: sel.length ? "ambiguous" : "finish-not-offered" };
}

// ── One variant of a store listing ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The skus of a listing that are structured, resolved to ONE (code, number), or why not. The first sku is the variant's own: its language is the variant's (a German sibling's sku does not reject the English variant). */
function skuKeyOf(skus: readonly (string | null | undefined)[], v: Vocab): { own: SkuKey | null; key: SkuKey | null } | StoreMiss {
  const keys = skus.map((s) => parseSku(s, v.code));
  const own = keys[0] ?? null;
  const real = keys.filter((k): k is SkuKey => k !== null);
  if (own && own.lang !== null && own.lang !== "en") return { miss: "language-sku" };
  const pairs = new Set(real.map((k) => `${v.code(k.code) ?? k.code}|${k.num}`));
  if (pairs.size > 1) return { miss: "sku-numbers-disagree" };
  return { own, key: own ?? real[0] ?? null };
}
const stripPiece = (title: string, piece: string): string => (piece ? title.replace(piece, " ") : title);
const SET_NUM_TOKEN = /(?<![A-Za-z0-9])([A-Za-z0-9]{2,6})\s*[-:#]\s*#?0*\d{1,4}[A-Za-z★]?(?![A-Za-z0-9])/g;

/**
 * What the title alone rules out: another language, a graded slab, a lot or a proxy, an accessory, an art card or a token, a sealed product ("sealed": the caller may still match it from the sealed list). Sealed words,
 * "Token" and the like are judged on what is left of the title once the card's name and its set are taken out, because "Booster Tutor", "Gift of Orzhova", "Tin Street Hooligan", "Case of the Locked Hothouse", "Nim Replica",
 * "Slab Hammer" and "Admiral Beckett Brass" are cards (the grading words too: 7 of the 77,751 card-and-printing titles of the catalogue carry one).
 */
function titleRejects(title: string, m: IndexMeta, v: Vocab): StoreMiss | "sealed" | null {
  if (CJK.test(title) || FOREIGN_TITLE.test(title.replace(FOREIGN_OK, " "))) return { miss: "language-title" };
  if (GRADED.test(title) || NOT_SINGLE.test(title) || ACCESSORY.test(title) || ART_TOKEN.test(title) || PROXYISH.test(title)) {
    const rd = readTitle(title, v, false);
    let residue = title;
    const lead = title.split(/\s+-\s+|\s*[[(]/)[0]!.trim();                       // the card's name, even when the rest of the title is a set label nobody reads
    if (m.names.has(fold(lead))) residue = stripPiece(residue, lead);
    if (rd) { if (m.names.has(fold(rd.name))) residue = stripPiece(residue, rd.name); for (const s of rd.setTexts) residue = stripPiece(residue, s); }
    residue = residue.replace(SET_NUM_TOKEN, (all, code: string) => (v.code(code) ? " " : all));            // "[MAT - 187]": MAT is March of the Machine: The Aftermath, not a mat
    if (GRADED.test(residue) || PROXYISH.test(residue)) return { miss: "graded-lot-proxy" };
    if (ACCESSORY.test(residue)) return { miss: "accessory" };
    if (ART_TOKEN.test(residue)) return { miss: "art-card-token-oversize" };
    if (NOT_SINGLE.test(residue)) return "sealed";
  }
  return null;
}

/**
 * The (product, finish) ONE VARIANT of a store listing is, by the strict paths in order (SKU, SET-NUM, number + set name, name + set), or why it is none. A product is only ever its one finish here: the caller asks
 * once per variant, and collapseOffers keeps one row per (product, finish). The sealed path (path "sealed") answers sealed titles from `ix.sealed` with finish N.
 */
export function matchStoreProduct(listing: StoreListingInput, ix: StoreMatchIndexes): StoreMatch | StoreMiss {
  const m = metaOf(ix.cards); const v = vocabOf(m);
  const title = cleanTitle(listing.title ?? "");
  if (!title) return { miss: "nokey" };
  const vf = variantFacts(listing.variantTitle, listing.options);
  // languages: a variant in another language is not the English card (a product that sells both keeps its English variants)
  if (vf.lang === "other") return { miss: "language-option" };
  if (foreignByTags(listing.tags, listing.productType) && vf.lang !== "en") return { miss: "language-tag" };
  if (vf.graded) return { miss: "graded-lot-proxy" };
  const shape = titleRejects(title, m, v);
  if (shape === "sealed") {
    const s = matchSealedTitle(title, ix.sealed);
    return "id" in s ? { id: s.id, finish: "N", path: "sealed" } : { miss: s.miss === "no-product" || s.miss === "ambiguous" ? `sealed-${s.miss}` : "not-a-single" };
  }
  if (shape) return shape;
  const sk = skuKeyOf(listing.skus, v);
  if (isMiss(sk)) return sk;
  const res = candidatesOf(title, sk.key, m, v);
  if (isMiss(res)) return res;
  const reading = res.reading;
  const sibling = (listing.siblingTitles ?? []).some((t) => { const f = variantFacts(t, undefined).fin; return f === "foil" || f === "etched"; });
  const fin = decideFinish(vf.fin, sk.own?.fin ?? null, reading.fin, res.treat, listing.explicitFoil === true || sibling);
  if (typeof fin === "object") return fin;
  if (res.rivalFoil && fin === "foil") return { miss: "ambiguous" };
  const pick = pickByFinish(res.cands, fin);
  if (isMiss(pick)) return pick;
  return { id: pick.e.id, finish: pick.finish, path: res.path };
}

/** A whole product: one answer per variant, with the siblings and the shared skus filled in. `variants[i].options` are that variant's option values. */
export interface StoreProductInput {
  title: string; tags?: readonly string[] | string | null; productType?: string | null; explicitFoil?: boolean;
  variants: readonly { title: string; sku?: string | null; options?: readonly string[] }[];
}
export function matchStoreVariants(p: StoreProductInput, ix: StoreMatchIndexes): (StoreMatch | StoreMiss)[] {
  return p.variants.map((v, i) => {
    const others = p.variants.filter((_, j) => j !== i);
    return matchStoreProduct({ title: p.title, skus: [v.sku, ...others.map((o) => o.sku)], tags: p.tags, productType: p.productType, variantTitle: v.title, options: v.options, explicitFoil: p.explicitFoil, siblingTitles: others.map((o) => o.title) }, ix);
  });
}

// ── Other entry points: eBay titles, SKU-only, names, numbers, set codes ────────────────────────────────────────────────────────────────────────────────────

/** Collector numbers a title prints, as nkeys, in the order it prints them: "[USG - 321]", "(FIN-353)", "FDN-107", "#129", "(129)", "129/332". Years and counts are not numbers. */
export function cardNumbersIn(title: string): string[] {
  const t = cleanTitle(title); const out: string[] = [];
  const add = (n: string | undefined): void => { const k = nkey(n); if (k && !out.includes(k)) out.push(k); };
  for (const x of t.matchAll(/[[(]\s*[A-Za-z0-9]{2,6}\s*[-:#]\s*0*(\d{1,4}[A-Za-z★]?)\s*[\])]/g)) add(x[1]);
  for (const x of t.matchAll(/(?<![A-Za-z0-9])[A-Z][A-Z0-9]{1,4}-0*(\d{1,4}[A-Za-z★]?)(?![A-Za-z0-9])/g)) add(x[1]);
  for (const x of t.matchAll(/(?:^|[\s([])#\s*0*(\d{1,4}[A-Za-z★]?)\b/g)) add(x[1]);
  for (const x of t.matchAll(/[[(]\s*#?0*(\d{1,4}[A-Za-z★]?)(?:\s*\/\s*\d+)?\s*[\])]/g)) add(x[1]);
  for (const x of t.matchAll(/(?<![\d/])0*(\d{1,4})\s*\/\s*\d{2,4}(?![\d/])/g)) add(x[1]);
  return out;
}
const NOT_A_CODE = /^(?:NM|LP|MP|HP|DMG|EX|VG|SP|PL|FOIL|EN|ENG|JP|DE|FR|IT|ES|PT|KO|ZH|RU|US|UK|CA|AU|MTG|TCG|CCG|NEW|USA)$/;
/** Set codes a title prints in the places a code stands ("[MH3]", "(2XM)", "MH3-123", "[USG - 321]"), upper case as typed; a plain word is never read as a code. */
export function setCodesIn(title: string): string[] {
  const t = cleanTitle(title); const out = new Set<string>();
  for (const x of t.matchAll(/[[(]\s*([A-Z0-9]{2,6})\s*(?:[-:#]\s*0*\d{1,4}[A-Za-z★]?)?\s*[\])]/g)) if (/[A-Z]/.test(x[1]!) && !NOT_A_CODE.test(x[1]!)) out.add(x[1]!);
  for (const x of t.matchAll(/(?<![A-Za-z0-9])([A-Z0-9]{2,5})-0*\d{1,4}[A-Za-z★]?(?![A-Za-z0-9])/g)) if (/[A-Z]/.test(x[1]!) && !NOT_A_CODE.test(x[1]!)) out.add(x[1]!);
  return [...out];
}
/** The one (set code, collector number) a product's variant skus agree on, or null. */
export function skuSetNumber(skus: readonly (string | null | undefined)[]): { sc: string; nkey: string } | null {
  const keys = skus.map((s) => parseSku(s)).filter((k): k is SkuKey => k !== null);
  if (!keys.length || keys.some((k) => k.lang !== null && k.lang !== "en")) return null;
  const pairs = new Set(keys.map((k) => `${k.code}|${nkey(k.num) ?? k.num}`));
  if (pairs.size !== 1) return null;
  const k = keys[0]!; return { sc: k.code, nkey: nkey(k.num) ?? k.num };
}
/** The collector number a product's variant skus agree on (nkey), or null. */
export function skuCardNumber(skus: (string | null | undefined)[]): string | null {
  return skuSetNumber(skus)?.nkey ?? null;
}
/** A numberless title matched through the (set, number) its SKUs carry, strictly: the title must still name the card, and a set it names must be the product's. The finish is not asked. */
export function matchCardBySku(title: string, skus: (string | null | undefined)[], idx: CardIndex): { id: number } | StoreMiss {
  const m = metaOf(idx); const v = vocabOf(m);
  const clean = cleanTitle(title);
  const sk = skuKeyOf(skus, v);
  if (isMiss(sk)) return sk;
  if (!sk.key) return { miss: "no-sku-number" };
  const shape = titleRejects(clean, m, v);
  if (shape) return shape === "sealed" ? { miss: "not-a-single" } : shape;
  const res = candidatesOf(clean, sk.key, m, v);
  if (isMiss(res)) return res;
  return res.cands.length === 1 ? { id: res.cands[0]!.id } : { miss: "ambiguous" };
}

/** Does the title name this set, by code ("MH3", "2XM") or by name ("Modern Horizons 3")? The same test matchCardTitle uses; exported for lib/ebay-match.ts. */
export function titleNamesSet(title: string, setCode: string | null | undefined, setName: string | null | undefined): boolean {
  const flat = ` ${fold(title)} `;
  const names = new Set([fold(setName ?? ""), canonSet(setName ?? ""), canonSet((setName ?? "").replace(SET_PREFIX, ""))]);
  for (const n of [...names]) if (n.startsWith("commander ")) names.add(`${n.slice(10)} commander`);                       // "Streets of New Capenna Commander" for TCGplayer's "Commander: Streets of New Capenna"
  for (const name of names) if (name.length >= 6 && flat.includes(` ${name} `)) return true;
  const code = (setCode ?? "").toUpperCase();
  if (!code) return false;
  if (setCodesIn(title).includes(code)) return true;
  return title.split(/[^A-Za-z0-9]+/).some((w) => w === code && (code.length >= 3 || /\d/.test(code)));
}

/**
 * eBay (WP05) title matching: the card, its set and the finish words, WITHOUT a store's SKU or variant paths. An eBay title is free text, so the card's name must OCCUR in it (as whole words), the set is read from a
 * code ("2XM", "[MH3]") or a set name, and the number from the usual places; a title that names no set, or fits two products, is a miss. `finish` is the finish the title states (null: it states none).
 */
export function matchCardTitle(title: string, idx: CardIndex): { id: number; finish: Finish | null } | StoreMiss {
  const m = metaOf(idx); const v = vocabOf(m);
  const clean = cleanTitle(title);
  const shape = titleRejects(clean, m, v);
  if (shape) return shape === "sealed" ? { miss: "not-a-single" } : shape;
  const flat = ` ${fold(clean)} `;
  // the set: codes printed as codes, set names printed as names (the longest name wins)
  const codes = new Set<string>();
  for (const c of setCodesIn(clean)) { const k = v.code(c); if (k) codes.add(k); }
  for (const w of clean.split(/[^A-Za-z0-9]+/)) if (w && w === w.toUpperCase() && (w.length >= 3 || /\d/.test(w)) && /[A-Z]/.test(w) && !NOT_A_CODE.test(w)) { const k = m.codes.has(w.toLowerCase()) ? w.toLowerCase() : null; if (k) codes.add(k); }
  let setText = "";
  const named: (readonly [string, ReadonlySet<string>])[] = [...m.setCodes, ...Object.entries(STORE_SET_ALIASES).filter(([, c]) => m.codes.has(c)).map(([k, c]) => [k, new Set([c])] as const)];       // the longest name wins, and a store's spelling counts ("International Collectors Edition" is not "Collectors Edition")
  let named1: ReadonlySet<string> = new Set();
  for (const [name, cs] of named) if (name.length >= 6 && flat.includes(` ${name} `) && name.length > setText.length) { setText = name; named1 = cs; }
  for (const c of named1) codes.add(c);
  if (!codes.size) return { miss: "nokey" };
  const nums = cardNumbersIn(clean);
  for (const x of clean.matchAll(/(?<![A-Za-z0-9])([A-Z0-9]{2,5})\s+0*(\d{1,4}[A-Za-z\u2605]?)(?:\s*\/\s*\d{2,4})?(?![A-Za-z0-9])/g)) {      // a seller's "OTJ 149" and "MH2 176/303": the number after a set code the catalogue knows
    const k = nkey(x[2]);
    if (k && /[A-Z]/.test(x[1]!) && !NOT_A_CODE.test(x[1]!) && v.code(x[1]!) && !nums.includes(k)) nums.push(k);
  }
  let cands: Entry[];
  if (nums.length) cands = [...codes].flatMap((c) => nums.flatMap((n) => lookup(m, c, n)));
  else cands = [...codes].flatMap((c) => m.bySc.get(c) ?? []);
  cands = unique(cands).filter((e) => e.names.some((n) => n.length >= 3 && flat.includes(` ${n} `)));
  if (!cands.length) return { miss: nums.length ? "name-mismatch" : "name-setname-not-in-catalogue" };
  if (codes.size && nums.length === 0 && setText) cands = cands.filter((e) => e.sc !== null && codes.has(e.sc));
  // the words that are neither the card's name nor the set's: treatments and the finish
  let rest = flat; for (const e of cands) for (const n of e.names) rest = rest.split(` ${n} `).join(" ");
  if (setText) rest = rest.split(` ${setText} `).join(" ");
  const t = treatmentWords(rest).keys;
  const stated = visibleKeys(t);
  const printings = cands.length;
  cands = cands.filter((e) => isSubset(stated, visibleKeys(e.treat)));
  if (!cands.length) return { miss: "treatment-not-in-product" };
  // Without a number, several printings of the card in the set can only be told apart by treatment words the title states; a title that states none cannot be placed (sellers leave "Borderless" out)
  if (!nums.length && printings > 1) {
    const exact = stated.size > 0 ? cands.filter((e) => statesTreatments(e, stated)) : [];
    if (exact.length !== 1) return { miss: "ambiguous" };
    cands = exact;
  }
  const fin = merge(finishOfText(rest), t.has("etched") ? "etched" : null);
  if (fin === "conflict") return { miss: "finish-conflict" };
  const word = fin === null && [...t].some((k) => FOIL_PATTERN_KEYS.has(k)) ? "foil" : fin;
  if (word === null) return cands.length === 1 ? { id: cands[0]!.id, finish: null } : { miss: "ambiguous" };
  const pick = pickByFinish(cands, word);
  return isMiss(pick) ? pick : { id: pick.e.id, finish: pick.finish };
}

// ── The name path (kept for the call sites) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const nameKey = (name: string, set: string, treat: Iterable<string>): string => `${fold(name)}|${canonSet(set)}|${[...visibleKeys(treat)].sort().join(" ")}`;
/** name | set | treatments -> the one product that has them, -1 when more than one does. */
export function buildNameIndex(rows: readonly MatchRow[]): NameIndex {
  const idx = new Map<string, number>();
  for (const r of rows) {
    if (r.cls !== 0) continue;
    const sets = unique(r.setNames.flatMap((s) => [canonSet(s), canonSet(s.replace(SET_PREFIX, ""))]).filter(Boolean));
    for (const n of r.names) for (const s of sets) { const k = nameKey(n, s, r.treat); const prev = idx.get(k); idx.set(k, prev === undefined || prev === r.id ? r.id : -1); }
  }
  return idx;
}
/** A product id from "Name (Treatments) [Set]" or "Name (Treatments) - Set Foil", or null. Strict: name, set and treatments must all agree and only one product may have them. */
export function matchByName(title: string, idx: NameIndex): number | null {
  const clean = cleanTitle(title);
  if (CJK.test(clean) || FOREIGN_TITLE.test(clean) || GRADED.test(clean) || NOT_SINGLE.test(clean) || ART_TOKEN.test(clean)) return null;
  const t = clean.replace(/\s+(?:foil|non-foil|normal)\s*$/i, "").trim();
  let mm = /^(.+?)\s*\[([^\]]+)\]\s*$/.exec(t);
  if (!mm) mm = /^(.+?)\s+-\s+(.+)$/.exec(t);
  if (!mm) return null;
  const keys = new Set<TreatmentKey>(); let name = mm[1]!;
  for (const g of [...name.matchAll(/\(([^()]*)\)/g)]) { const w = treatmentWords(g[1]!); if (w.left.length) return null; for (const k of w.keys) keys.add(k); }
  if (keys.has("etched") || finishOfText(t) === "etched") return null;                  // the name index cannot tell an etched product from its plain twin
  name = baseOf(name);
  const id = idx.get(nameKey(name, mm[2]!, keys));
  return id !== undefined && id > 0 ? id : null;
}

// ── Sealed products ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const SEALED_NOISE = new Set(["the", "a", "of", "and", "magic", "gathering", "mtg", "tcg", "english", "eng", "en", "sealed", "new", "factory", "trading", "card", "game", "wizards", "coast"]);
const SEALED_NOT_FOR_US = /\b(?:empty|opened|open box|damaged|storage box|deck box|sleeves?|playmat|binder|card case|toploader|acrylic|protector|magnetic|lot of|bundle of|repack|break|mystery|random|bulk|ita|italiano|german|deutsch|de|fr|jp|jpn|spanish|french|italian|japanese)\b/i;
/**
 * The words that tell sealed products apart: noise and a parenthesised pack count dropped ("(12 Packs)"), "display" read as "box", "Booster Pack" as "booster", plural forms singular. Equal sets of words are the same
 * product ("Play Pack" is not a "Play Booster": the pack stays a word there).
 */
export function sealedWords(text: string): string[] {
  let t = fold(decodeEntities(text).replace(/\([^)]*\b\d+\s*(?:packs?|boosters?|buste|boxes|ct|count|cards?)\b[^)]*\)/gi, " ")).replace(/\buniverses beyond\b(?!\s+booster)/g, " ");
  t = t.replace(/\bbooster packs?\b/g, "booster").replace(/\bminimal packaging\b/g, " minimal ");
  const out = new Set<string>();
  for (let w of t.split(" ")) {
    if (!w || SEALED_NOISE.has(w)) continue;
    if (w === "display" || w === "boxes") w = "box"; else if (w === "boosters") w = "booster"; else if (w === "decks") w = "deck"; else if (w === "bundles") w = "bundle"; else if (w === "packs") w = "pack";
    out.add(w);
  }
  return [...out].sort();
}
const SEALED_SIGS = new WeakMap<readonly SealedRef[], Map<string, SealedRef[]>>();
/** The sealed product a store title names: its words (noise, pack counts and the "Magic: The Gathering" prefix dropped; "display" read as "box") must equal those of exactly one product of the same kind. */
export function matchSealedTitle(title: string, sealed: readonly SealedRef[]): { id: number } | StoreMiss {
  const clean = cleanTitle(title);
  if (CJK.test(clean) || FOREIGN_TITLE.test(clean)) return { miss: "language-title" };
  if (SEALED_NOT_FOR_US.test(clean) || GRADED.test(clean) || ACCESSORY.test(clean)) return { miss: "not-sealed" };
  let sigs = SEALED_SIGS.get(sealed);
  if (!sigs) { sigs = new Map(); for (const s of sealed) { const k = sealedWords(s.name).join(" "); const a = sigs.get(k); if (a) a.push(s); else sigs.set(k, [s]); } SEALED_SIGS.set(sealed, sigs); }
  const words = sealedWords(clean);
  const hits = (sigs.get(words.join(" ")) ?? []).filter((s) => s.kind === sealedKind(clean));
  if (!hits.length) return { miss: "no-product" };
  return hits.length === 1 ? { id: hits[0]!.id } : { miss: "ambiguous" };
}

// ── Conditions ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The condition a label states, 0 = Near Mint ... 4 = Damaged, or null when it states none. */
function conditionOf(label: string): number | null {
  const t = label.toLowerCase();
  if (/damaged|\bdmg\b|\bpoor\b/.test(t)) return 4;
  if (/heav(?:il)?y|\bhp\b/.test(t)) return 3;
  if (/very good|\bvg\b/.test(t)) return 1;
  if (/moderate|\bmp\b|\bpl\b|\bgood\b|\bgd\b/.test(t) || (/played/.test(t) && !/light|slight/.test(t))) return 2;
  if (/light|slight|\blp\b|\bsp\b|excellent|\bex\b/.test(t)) return 1;
  if (/near mint|\bnm\b|\bmint\b|\bnew\b|like new/.test(t)) return 0;
  return null;
}
/** OP's, kept: 0 = Near Mint / unstated ... 4 = Damaged. */
export function conditionRank(label: string): number { return conditionOf(label) ?? 0; }
/** OP's, kept: NM, LP, MP, HP, DMG; a store that states none ("Default Title", "Foil", "Regolare") is `null`, never NM. */
export function conditionLabel(label: string | null | undefined): string | null {
  if (!label || /default title/i.test(label)) return null;
  const r = conditionOf(label);
  return r === null ? null : (["NM", "LP", "MP", "HP", "DMG"][r] ?? null);
}

/** KEPT from OP with their signatures (imported by store-import, import, the eBay modules and basket-condition). */
export interface StoreVariant { title: string; price: string; available: boolean }
/** Best condition first, then cheapest, among in-stock variants of another language or grade excluded. Null = nothing buyable. */
export function bestVariant(variants: StoreVariant[]): { priceCents: number; condition: string | null } | null {
  const ok = variants.filter((v) => v.available && parseFloat(v.price) > 0 && languageOfVariant(v.title) !== "other" && !/\b(?:graded|psa|bgs|cgc|sgc|beckett|signed)\b/i.test(v.title));
  if (!ok.length) return null;
  const best = ok.reduce((a, b) => {
    const ra = conditionRank(a.title), rb = conditionRank(b.title);
    if (ra !== rb) return ra < rb ? a : b;
    return parseFloat(a.price) <= parseFloat(b.price) ? a : b;
  });
  return { priceCents: Math.round(parseFloat(best.price) * 100), condition: conditionLabel(best.title) };
}
/** Cheapest variant of any condition (for out-of-stock listings we still show greyed). */
export function anyVariant(variants: StoreVariant[]): number | null {
  const ps = variants.map((v) => parseFloat(v.price)).filter((p) => p > 0);
  return ps.length ? Math.round(Math.min(...ps) * 100) : null;
}

// ── Sanity against TCGplayer's market price ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A matched single far below or far above the market price of the FINISH it was matched to is a wrong match (a plain card priced as its serialized twin, or the other way round) far more often than a deal.
 * Dropped, not shown. Measured on the corpus: 98.3% of matched offers in US stores sit within 0.3x to 4x of the market of their finish.
 */
export function plausibleSinglePrice(priceUsdCents: number, marketUsdCents: number | null): boolean {
  if (marketUsdCents == null) return true;
  if (marketUsdCents >= 300 && priceUsdCents < marketUsdCents * 0.3) return false;
  if (priceUsdCents > marketUsdCents * 4 + 500) return false;
  return true;
}
export function plausibleSealedPrice(priceUsdCents: number, marketUsdCents: number | null): boolean {
  if (marketUsdCents == null) return true;
  return priceUsdCents >= marketUsdCents * 0.5 && priceUsdCents <= marketUsdCents * 3;
}

// ── One row per (store, product, finish) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The one-row-per-(store, product, finish) rule applied BEFORE any batch write (critique budget 5): in stock first, best condition first, lowest price, lowest path. */
export interface OfferDraft { productId: number; finish: Finish; priceCents: number; inStock: boolean; condition: string | null; path: string }
const betterDraft = (a: OfferDraft, b: OfferDraft): boolean => {
  if (a.inStock !== b.inStock) return a.inStock;
  const ra = conditionRank(a.condition ?? ""), rb = conditionRank(b.condition ?? "");
  if (ra !== rb) return ra < rb;
  if (a.priceCents !== b.priceCents) return a.priceCents < b.priceCents;
  return a.path < b.path;
};
export function collapseOffers(drafts: readonly OfferDraft[]): { rows: OfferDraft[]; collapsed: number } {
  const best = new Map<string, OfferDraft>();
  for (const d of drafts) { const k = `${d.productId}.${d.finish}`; const cur = best.get(k); if (!cur || betterDraft(d, cur)) best.set(k, d); }
  return { rows: [...best.values()], collapsed: drafts.length - best.size };
}
