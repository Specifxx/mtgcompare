// Matches a store's product title to a catalogue product. Pure (no I/O), so
// tests/match.test.ts can pin it against real store titles.
//
// The rule that matters most is the same one Rift Compare learned the hard way:
// a WRONG match is worse than no match. A wrong match puts a $3 common's price
// on a $300 Enchanted card's page with a buy button on it. So every match needs
// the card number AND the name, and a tie between two products is no match.
import type { Product, SetInfo } from "@/lib/site-types";
import { tokens } from "@/lib/slug";
import { sealedTypeOf } from "./tcgcsv";

const STOP = new Set([
  "the", "a", "of", "and", "disney", "lorcana", "tcg", "card", "game", "gundam", "single", "singles",
  "english", "en", "nm", "near", "mint", "foil", "holo", "holofoil", "cold", "normal", "non",
  "booster", "set", "chapter", "yu", "gi", "oh", "yugioh", "konami", "cyberpunk",
]);

// Words that mark a variant printing on the product name itself. A title that
// lacks the product's marker (or carries one the product lacks) is a different
// product — "Elsa (Enchanted)" vs "Elsa", "Gundam (LR+)" vs "Gundam".
const VARIANT_MARKERS = [
  "enchanted", "iconic", "epic", "promo", "alternate", "alt", "parallel", "lr+", "lr++", "r+", "u+",
  "c+", "c++", "oversized", "jumbo", "serialized", "signature", "showcase",
];

export interface MatchIndex {
  byNumber: Map<string, Product[]>;
  /** "setId|n" → products, for titles that give "(0017)" and name the set elsewhere. */
  bySetNumber: Map<string, Product[]>;
  /** "setId|full normalised name" → products, for titles with no number at all. */
  bySetName: Map<string, Product[]>;
  /** set code ("13", "Q1") and name initials ("TFC") → set ids */
  setByCode: Map<string, number[]>;
  sealed: Product[];
  setName: Map<number, string[]>;
  style: NumberStyle;
  /** Every rarity in the catalogue plus aliases, longest first (rarityMustAgree only). */
  rarities: { name: string; re: RegExp }[] | null;
  /** SITE.setEditions, or null when the game has none. */
  editions: SetEdition[] | null;
  /** set id → the edition word its name carries ("beta"), or null. */
  setEdition: Map<number, string | null>;
}

/** A game that prints one set in several editions with the same card and
 *  product names (Cyberpunk TCG's "Welcome to Night City - Beta" and
 *  "- Retail"). The edition word is taken out of the set's and the sealed
 *  product's names for matching, and a title must be read as the product's
 *  own edition: it names the word, or matches `implied` ("36 packs" is the
 *  Beta box), or names none and the product's edition is the `default` one.
 *  A title that points at two editions matches neither. */
export interface SetEdition {
  word: string;
  implied?: RegExp;
  default?: boolean;
}

export type NumberStyle = "fraction" | "code" | "ygo" | "plain" | "series";

// "series": the "code" numbers ("FB11-084", "BT25-104 SEC") plus series
// numbers, a title code, a print version and the number: "UE24BT/REZ-1-053",
// written "REZ-1-053" by stores, keyed without the set prefix ("REZ-1-053";
// action points "REZ-1-AP05"). The version stays in the key: "-1-" and "-2-"
// are different sets of one series.
const SERIES_NUM = /(?<![A-Z0-9])([A-Z]{2,4}\d?)-(\d)-(\d{3}|AP\d{2})(?![A-Z0-9])/g;
const CODE_NUM = /\b([A-Z]{1,4}\d{0,2}[A-Z]?)-(\d{2,3}[A-Z]?)\b/g;

// Yu-Gi-Oh! numbers: set code, an optional language, the number —
// "LOB-EN005", "RA01-EN008", "YGLD-ENA01", old "LOB-005" and European
// "LOB-E005". The language stays in the key: an "EN" card and an "E" or
// unmarked one are different printings, and any other language ("LOB-DE005",
// "RA01-AE008") never produces a key, so it can never match.
const YGO_NUM = /(?<![A-Z0-9])((?=[A-Z0-9]*[A-Z])[A-Z0-9]{2,5})-(EN|E)?([A-Z]?)(\d{2,3})(?![A-Z0-9])/g;
const ygoKey = (m: RegExpMatchArray) => `${m[1]}-${m[2] ?? ""}${m[3]}${m[4].padStart(3, "0")}`;

// Plain numbers (Cyberpunk TCG): "001" in the Retail print, "B001" in the
// Beta one, with no set code or total. The letter stays in the key; three
// digits only, so "24 packs", "ST01" and years never read as a number.
const PLAIN_NUM = /(?<![A-Z0-9/])([A-Z]?)(\d{3})(?![A-Z0-9/])/g;

export function numberKey(n: string, style: NumberStyle): string | null {
  if (style === "plain") {
    const m = n.trim().toUpperCase().match(/^([A-Z]?)(\d{1,3})$/);
    return m ? `${m[1]}${m[2].padStart(3, "0")}` : null;
  }
  if (style === "ygo") {
    const m = [...n.toUpperCase().matchAll(YGO_NUM)][0];
    return m ? ygoKey(m) : null;
  }
  if (style === "series") {
    const u = n.toUpperCase();
    const s = [...u.matchAll(SERIES_NUM)][0];
    if (s) return `${s[1]}-${s[2]}-${s[3]}`;
    const c = [...u.matchAll(CODE_NUM)][0];
    return c ? `${c[1]}-${c[2].padStart(3, "0")}` : null;
  }
  if (style === "code") {
    const m = n.toUpperCase().match(/\b([A-Z]{1,4}\d{0,2}[A-Z]?)-(\d{2,3}[A-Z]?)\b/);
    return m ? `${m[1]}-${m[2].padStart(3, "0")}` : null;
  }
  const m = n.match(/(\d{1,3})[a-z]?\s*\/\s*(P?\d{1,3})/i);
  if (m) return `${parseInt(m[1], 10)}/${m[2].toUpperCase().replace(/^0+/, "")}`;
  return null;
}

/** Every number-looking token in a store title. */
export function numbersInTitle(title: string, style: NumberStyle): string[] {
  const out = new Set<string>();
  if (style === "plain") {
    for (const m of title.toUpperCase().matchAll(PLAIN_NUM)) out.add(`${m[1]}${m[2]}`);
  } else if (style === "ygo") {
    for (const m of title.toUpperCase().matchAll(YGO_NUM)) out.add(ygoKey(m));
  } else if (style === "series") {
    const u = title.toUpperCase();
    for (const m of u.matchAll(SERIES_NUM)) out.add(`${m[1]}-${m[2]}-${m[3]}`);
    for (const m of u.matchAll(CODE_NUM)) out.add(`${m[1]}-${m[2].padStart(3, "0")}`);
  } else if (style === "code") {
    for (const m of title.toUpperCase().matchAll(/\b([A-Z]{1,4}\d{0,2}[A-Z]?)-(\d{2,3}[A-Z]?)\b/g))
      out.add(`${m[1]}-${m[2].padStart(3, "0")}`);
  } else {
    for (const m of title.matchAll(/(\d{1,3})[a-z]?\s*\/+\s*(P?\d{1,3}|[A-Z]{1,3}\d{0,3})(?![A-Za-z])/gi))
      out.add(`${parseInt(m[1], 10)}/${m[2].toUpperCase().replace(/^0+/, "")}`);
  }
  return [...out];
}

function baseName(name: string): string[] {
  const all = tokens(name.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " "));
  const kept = all.filter((t) => !STOP.has(t));
  // "Gundam" alone is a real card name: never let the stop list empty it.
  return kept.length ? kept : all;
}

function markers(s: string): Set<string> {
  const lower = s.toLowerCase();
  const out = new Set<string>();
  for (const m of VARIANT_MARKERS) {
    const re = m.includes("+")
      ? new RegExp(`(^|[^a-z+])${m.replace(/\+/g, "\\+")}(?!\\+)`)
      : new RegExp(`\\b${m}\\b`);
    if (re.test(lower)) out.add(m);
  }
  return out;
}

const GENERIC_ALT = ["parallel", "alt", "alternate"];

/** Do the title's variant words describe this product's variant? A generic
 *  "parallel" / "alt art" in the title stands for whichever "+" rarity the
 *  product carries (Gundam's LR+, R+…). */
export function markersAgree(productName: string, rarity: string | null, title: string): boolean {
  const pm = markers(productName);
  const tm = markers(title);
  const rarityWord = (rarity ?? "").toLowerCase();
  const generic = GENERIC_ALT.some((g) => tm.has(g));
  for (const g of GENERIC_ALT) tm.delete(g);
  const productPlus = [...pm].filter((m) => m.includes("+"));
  const productAlt = GENERIC_ALT.some((g) => pm.has(g));
  for (const g of GENERIC_ALT) pm.delete(g);
  if (generic) {
    if (!productPlus.length && !productAlt) return false;
    if (![...tm].some((m) => m.includes("+"))) for (const m of productPlus) tm.add(m);
  } else if (productAlt) {
    return false;
  }
  for (const m of pm) if (!tm.has(m)) return false;
  for (const m of tm) if (!pm.has(m) && m !== rarityWord && !rarityWord.split(" ").includes(m)) return false;
  return true;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Rarity names (and aliases) as whole-phrase patterns, longest first, so
 *  "Quarter Century Secret Rare" wins over "Secret Rare" and "Rare". Full
 *  names and multi-word aliases match in any case; one-word aliases ("QCSR",
 *  "UR") only as written. */
export function rarityPatterns(names: string[], aliases: Record<string, string[]> = {}): { name: string; re: RegExp }[] {
  const out: { name: string; text: string; re: RegExp }[] = [];
  for (const n of new Set(names)) out.push({ name: n, text: n, re: new RegExp(`(^|[^A-Za-z0-9])${esc(n)}(?![A-Za-z0-9])`, "i") });
  for (const [n, list] of Object.entries(aliases))
    for (const a of list) out.push({ name: n, text: a, re: new RegExp(`(^|[^A-Za-z0-9])${esc(a)}(?![A-Za-z0-9])`, /\s/.test(a) ? "i" : "") });
  return out.sort((a, b) => b.text.length - a.text.length).map(({ name, re }) => ({ name, re }));
}

/** The rarity a title names, with the card's own name taken out first (so
 *  "Rare Metal Dragon" names no rarity), or null. */
export function rarityInTitle(title: string, productName: string, rarities: { name: string; re: RegExp }[]): string | null {
  let t = ` ${title} `;
  const base = productName.replace(/\([^)]*\)/g, " ").trim();
  if (base) t = t.replace(new RegExp(esc(base), "ig"), " ");
  for (const r of rarities) if (r.re.test(t)) return r.name;
  return null;
}

/** For rarityMustAgree games: a title that names a rarity must name this one. */
export function rarityAgrees(p: Product, title: string, rarities: { name: string; re: RegExp }[] | null): boolean {
  if (!rarities || !p.rarity) return true;
  const named = rarityInTitle(title, p.name, rarities);
  return named == null || named.toLowerCase() === p.rarity.toLowerCase();
}

export interface IndexOptions {
  rarityMustAgree?: boolean;
  rarityAliases?: Record<string, string[]>;
  setEditions?: SetEdition[];
}

/** The edition a title points at: a word, null (none, and no default), or
 *  false when it points at more than one. */
export function titleEdition(title: string, editions: SetEdition[]): string | null | false {
  const have = new Set(tokens(title));
  const named = editions.filter((e) => have.has(e.word) || e.implied?.test(title)).map((e) => e.word);
  if (named.length > 1) return false;
  if (named.length === 1) return named[0];
  return editions.find((e) => e.default)?.word ?? null;
}

/** Is this product in the edition the title points at? Products of a set
 *  with no edition word always are. */
export function editionAgrees(p: Product, title: string, idx: MatchIndex): boolean {
  if (!idx.editions) return true;
  const own = idx.setEdition.get(p.setId) ?? null;
  if (own == null) return true;
  return titleEdition(title, idx.editions) === own;
}

export function buildIndex(products: Product[], sets: SetInfo[], style: NumberStyle, opts: IndexOptions = {}): MatchIndex {
  const byNumber = new Map<string, Product[]>();
  const bySetNumber = new Map<string, Product[]>();
  const bySetName = new Map<string, Product[]>();
  const sealed: Product[] = [];
  for (const p of products) {
    if (p.kind === "sealed") {
      sealed.push(p);
      continue;
    }
    const nk = `${p.setId}|${tokens(p.name).join(" ")}`;
    if (!bySetName.has(nk)) bySetName.set(nk, []);
    bySetName.get(nk)!.push(p);
    const k = p.number ? numberKey(p.number, style) : null;
    if (!k) continue;
    if (!byNumber.has(k)) byNumber.set(k, []);
    byNumber.get(k)!.push(p);
    const bare = parseInt(k, 10);
    if (style === "fraction" && bare) {
      const sk = `${p.setId}|${bare}`;
      if (!bySetNumber.has(sk)) bySetNumber.set(sk, []);
      bySetNumber.get(sk)!.push(p);
    }
  }
  const editions = opts.setEditions?.length ? opts.setEditions : null;
  const editionWords = new Set((editions ?? []).map((e) => e.word));
  const setEdition = new Map<number, string | null>(
    sets.map((s) => [s.id, tokens(s.name).find((t) => editionWords.has(t)) ?? null]),
  );
  const setName = new Map(sets.map((s) => [s.id, tokens(s.name).filter((t) => !STOP.has(t) && !editionWords.has(t))]));
  const setByCode = new Map<string, number[]>();
  const addCode = (c: string, id: number) => {
    const k = c.toUpperCase();
    if (!k) return;
    if (!setByCode.has(k)) setByCode.set(k, []);
    if (!setByCode.get(k)!.includes(id)) setByCode.get(k)!.push(id);
  };
  for (const st of sets) {
    addCode(st.code, st.id);
    const words = st.name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
    if (words.length >= 2) addCode(words.map((w) => w[0]).join(""), st.id);
  }
  const rarities = opts.rarityMustAgree
    ? rarityPatterns(products.map((p) => p.rarity).filter((r): r is string => !!r), opts.rarityAliases)
    : null;
  return { byNumber, bySetNumber, bySetName, setByCode, sealed, setName, style, rarities, editions, setEdition };
}

function overlap(need: string[], have: Set<string>): number {
  if (!need.length) return 0;
  return need.filter((t) => have.has(t)).length / need.length;
}

export interface MatchResult {
  product: Product;
  score: number;
}

// Non-English product. The catalogue (TCGplayer) is English; a Japanese box
// at a third of the price on an English box's page is the classic bad match.
const FOREIGN = /\b(japanese|japan|jp|chinese|simplified|traditional|french|fran[cç]ais|german|deutsch|italian|italiano|spanish|espa[nñ]ol|korean|portuguese|\(fr\)|\(de\)|\(it\)|\(jp\)|\(cn\))\b/i;
export const isForeign = (title: string) => FOREIGN.test(title);

// A store listing for a used, damaged or graded copy is not the card's
// near-mint price ("... - Used Super Rare card", "... PSA 9").
const UNFIT = /\b(used|damaged|heavily played|poor condition|psa\s?\d|bgs\s?\d|cgc\s?\d|beckett|graded|slab(bed)?)\b/i;
export const isUnfitListing = (title: string) => UNFIT.test(title);

// Multiples: "(Pair)", "Bundle of 2", "Set of 4", "x2". A title and a product
// must agree on whether they are a multiple.
const MULTI = /\b(pair|bundle of \d+|set of \d+|\d+\s*x|x\s*\d+|\d+[- ]pack bundle|lot of)\b/i;
const isMulti = (s: string) => MULTI.test(s.replace(/\b\d+\s*packs?\)/i, ""));

/** Titles that give the card's number in the set but not "n/total":
 *    "99 Puppies (3-024)"            set code - number
 *    "Ariel - On Human Legs [TFC-1]" set initials - number
 *    "1TFC-059, L, Ursula" / "[14HPC-132]"  code + initials - number
 *    "Elsa - The Fifth Spirit (48)"  bare number; the set comes from the
 *                                    tags / product type (its name or code)
 *  The name check in matchCard still has to pass. */
function fractionFallback(title: string, context: string, idx: MatchIndex): Product[] {
  const out: Product[] = [];
  const add = (setIds: number[] | undefined, n: number) => {
    for (const id of setIds ?? []) for (const p of idx.bySetNumber.get(`${id}|${n}`) ?? []) if (!out.includes(p)) out.push(p);
  };
  const coded = title.match(/(?:^|[\s(\[])(\d{1,2})?([A-Z]{2,5})?-(\d{1,3})(?=[\s)\],]|$)/);
  if (coded && (coded[1] || coded[2])) {
    const n = parseInt(coded[3], 10);
    if (coded[1]) add(idx.setByCode.get(coded[1]), n);
    if (!out.length && coded[2]) add(idx.setByCode.get(coded[2]), n);
    if (out.length) return out;
  }
  const bare = title.match(/\((\d{1,4})\)|#(\d{1,4})\b/);
  const n = bare ? parseInt(bare[1] ?? bare[2], 10) : 0;
  if (!n) return out;
  const ctxText = `${title} ${context}`;
  const ctx = new Set(tokens(ctxText));
  for (const [setId, setTokens] of idx.setName)
    if (setTokens.length && setTokens.every((t) => ctx.has(t))) add([setId], n);
  if (!out.length) {
    // A tag that is exactly a set code ("12"), as some stores tag the set.
    for (const tag of context.split(/\s{2,}|,|\|/).map((t) => t.trim())) add(idx.setByCode.get(tag.toUpperCase()), n);
    for (const t of context.split(/\s+/)) if (/^(\d{1,2}|Q\d)$/i.test(t)) add(idx.setByCode.get(t.toUpperCase()), n);
  }
  return out;
}

/** `context` is extra text that may name the set (Shopify product_type / tags). */
export function matchCard(title: string, idx: MatchIndex, context = ""): MatchResult | null {
  if (isForeign(title)) return null;
  const have = new Set(tokens(title));
  const scored: MatchResult[] = [];
  let candidates = [...new Set(numbersInTitle(title, idx.style).flatMap((n) => idx.byNumber.get(n) ?? []))];
  if (!candidates.length && idx.style === "fraction") candidates = fractionFallback(title, context, idx);
  if (!candidates.length && !numbersInTitle(title, idx.style).length) {
    // No number anywhere: only an EXACT full-name match inside a set the
    // tags / product type name, and only when exactly one product fits.
    const ctx = new Set(tokens(context));
    const want = tokens(title).join(" ");
    const hits: Product[] = [];
    for (const [setId, setTokens] of idx.setName)
      if (setTokens.length && setTokens.every((t) => ctx.has(t))) hits.push(...(idx.bySetName.get(`${setId}|${want}`) ?? []));
    const fit = hits.filter((p) => editionAgrees(p, title, idx));
    return fit.length === 1 ? { product: fit[0], score: 1 } : null;
  }
  {
    for (const p of candidates) {
      const nameScore = overlap(baseName(p.name), have);
      if (nameScore < 0.6) continue;
      if (!markersAgree(p.name, p.rarity, title)) continue;
      if (!rarityAgrees(p, title, idx.rarities)) continue;
      if (!editionAgrees(p, title, idx)) continue;
      const setScore = overlap(idx.setName.get(p.setId) ?? [], have);
      scored.push({ product: p, score: nameScore + 0.5 * setScore });
    }
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  if (scored.length > 1 && Math.abs(scored[0].score - scored[1].score) < 0.01) return null;
  return scored[0];
}

export function matchSealed(title: string, idx: MatchIndex): MatchResult | null {
  if (isForeign(title)) return null;
  const have = new Set(tokens(title).filter((t) => !STOP.has(t) || t === "booster"));
  const type = sealedTypeOf(title);
  const scored: MatchResult[] = [];
  for (const p of idx.sealed) {
    if (sealedTypeOf(p.name) !== type) continue;
    if (!editionAgrees(p, title, idx)) continue;
    if (isMulti(p.name) !== isMulti(title)) continue;
    // "Pack Bundle Magnificent Maestros" is several packs, not one.
    if (/\bbundle\b/i.test(title) && !/\bbundle\b/i.test(p.name)) continue;
    const setTokens = idx.setName.get(p.setId) ?? [];
    if (setTokens.length && overlap(setTokens, have) < 1) continue;
    const own = idx.editions ? idx.setEdition.get(p.setId) : null;
    const need = tokens(p.name).filter((t) => !STOP.has(t) && t !== own);
    const s = overlap(need, have);
    // Near-complete: "Collector Booster Display" must not take a plain
    // "Booster Display" (one missing word of four is 0.75).
    if (s < (need.length >= 6 ? 0.8 : 0.99)) continue;
    // Penalise title words the product name lacks (e.g. "case", "bundle of 4").
    const extra = [...have].filter((t) => !need.includes(t) && !/^\d+$/.test(t) && !STOP.has(t) && t !== own).length;
    scored.push({ product: p, score: s - 0.05 * extra });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  if (scored.length > 1 && Math.abs(scored[0].score - scored[1].score) < 0.01) return null;
  return scored[0];
}

// TCGplayer's edition printings (Yu-Gi-Oh!). When a product is sold in these,
// the title must say which; an unstated edition stays unknown, never guessed,
// unless the product exists in only one.
const EDITIONS: [string, RegExp][] = [
  ["1st Edition", /\b1st\b|first\s+edition/],
  ["Unlimited", /\bunlimited\b/],
  ["Limited", /\blimited\b/],
];

export const hasEditions = (printings: string[]) => printings.some((p) => EDITIONS.some(([e]) => e === p));

export function editionOf(text: string): string | null {
  const s = text.toLowerCase();
  for (const [name, re] of EDITIONS) if (re.test(s)) return name;
  return null;
}

export function printingOf(title: string, variantTitle = "", printings: string[] = []): string | undefined {
  if (hasEditions(printings)) {
    const named = editionOf(`${variantTitle} ${title}`);
    if (named) return printings.includes(named) ? named : undefined;
    return printings.length === 1 ? printings[0] : undefined;
  }
  const s = `${title} ${variantTitle}`.toLowerCase();
  if (/cold\s*foil/.test(s)) return "Cold Foil";
  if (/non[-\s]?foil/.test(s)) return "Normal";
  if (/\bfoil\b|holo/.test(s)) return "Foil";
  return "Normal";
}

export function isPreorder(title: string, tags: string[] = []): boolean {
  return /pre[-\s]?order|presale|pre[-\s]?sale/i.test(`${title} ${tags.join(" ")}`);
}

// "Card Name [Set Name]" is how TCGplayer-synced stores title a single; a
// starter-deck card ("MT0D12 Flathead [The Heist - Beta Starter Deck]") names
// a sealed product only inside the brackets, so the brackets don't count.
const SEALED_WORD = /booster|display|\bbox\b|\bcase\b|\bpack\b|starter|deck|trove|gift set|collection|bundle|prerelease|\btin\b|\bkit\b/i;

export function looksSealed(title: string, productType = "", style?: NumberStyle): boolean {
  const single = title.match(/^([^[\]]+)\[[^\]]+\]\s*$/);
  if (single && !SEALED_WORD.test(single[1])) return false;
  // A "plain" card number is a single, whatever set it came in:
  // "MT0D12 Flathead [B015 - Uncommon] - The Heist - Beta Starter Deck".
  if (style === "plain" && numbersInTitle(title, "plain").length) return false;
  return /booster|display|\bbox\b|\bcase\b|\bpack\b|starter|deck|trove|gift set|collection|bundle|prerelease|\btin\b/i.test(
    `${title} ${productType}`,
  ) && !numbersInTitle(title, "fraction").length && !numbersInTitle(title, "code").length && !numbersInTitle(title, "ygo").length && !numbersInTitle(title, "series").length;
}
