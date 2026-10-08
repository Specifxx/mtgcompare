// src/lib/catalog.ts (owner WP01a, FROZEN signatures). Pure: no I/O, no clock. TCGCSV parsing, slugs, the name grammar. OP names are kept where the meaning is unchanged.
import { CARD_CLASS, IGNORED_FINISH_WORDS, TREATMENTS, TREATMENT_BY_SYNONYM, TREATMENT_KEYS, fold, nkey, sealedKind, type Finish, type SetKind, type TreatmentKey } from "./constants";
export type { SetKind } from "./constants";                         // OP importers of `SetKind` from "./catalog" keep compiling
export { fold } from "./constants";

export const TCGCSV_CATEGORY = 1;                                    // Magic (OP: 68)
export const TCGCSV_BASE = `https://tcgcsv.com/tcgplayer/${TCGCSV_CATEGORY}`;
export interface TcgcsvGroup { groupId: number; name: string; abbreviation: string; publishedOn: string; isSupplemental?: boolean }
export interface TcgcsvProduct { productId: number; name: string; imageUrl: string; imageCount?: number; groupId: number; url: string; presaleInfo?: { isPresale: boolean; releasedOn: string | null } | null; extendedData?: { name: string; value: string }[] }
export interface TcgcsvPrice { productId: number; lowPrice: number | null; midPrice?: number | null; highPrice?: number | null; marketPrice: number | null; directLowPrice?: number | null; subTypeName: string }
export interface PriceRowLike { marketCents: number | null; lowCents: number | null }

/** OP's slugify plus ONE addition (critique 12): the Latin ligatures and letters NFKD does not decompose are transliterated BEFORE it, so "Æther Vial" is `aether-vial`, not `ther-vial` (and "Ætherling" is `aetherling`, not `therling`).
 *  Then as in OP: NFKD, ASCII, "&" -> " and ", quotes dropped, [^a-z0-9]+ -> "-", trimmed, capped at 90. Greenfield: nothing to migrate. */
const LIGATURES: Readonly<Record<string, string>> = { "Æ": "Ae", "æ": "ae", "Œ": "Oe", "œ": "oe", "ß": "ss", "ẞ": "SS", "Ø": "O", "ø": "o", "Đ": "D", "đ": "d", "Ł": "L", "ł": "l", "Þ": "Th", "þ": "th", "Ð": "D", "ð": "d" };
export function slugify(s: string): string {
  return s.replace(/[ÆæŒœßẞØøĐđŁłÞþÐð]/g, (c) => LIGATURES[c] ?? c).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/['\u2019"\u201d\u201c]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90).replace(/-+$/g, "");
}
export const toCents = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100));   // OP's, unchanged
/** OP's guard, unchanged: a low under 25% of a market >= $5 is dropped (thin-market single listings). */
export function plausibleLow(lowCents: number | null, marketCents: number | null): number | null {
  if (lowCents == null) return null;
  if (marketCents != null && marketCents >= 500 && lowCents < marketCents * 0.25) return null;
  return lowCents;
}
/** OP's pickPrice (highest market wins) is DELETED: it would headline the Foil row for 89.8% of dual-finish printings. One row per finish, other subtypes ignored and counted. */
export function finishPrices(rows: readonly TcgcsvPrice[]): { n: PriceRowLike | null; f: PriceRowLike | null; unknownSubtypes: string[] } {
  const out: { n: PriceRowLike | null; f: PriceRowLike | null; unknownSubtypes: string[] } = { n: null, f: null, unknownSubtypes: [] };
  for (const r of rows) {
    const row: PriceRowLike = { marketCents: toCents(r.marketPrice), lowCents: null };
    row.lowCents = plausibleLow(toCents(r.lowPrice), row.marketCents);
    if (r.subTypeName === "Normal") out.n = row; else if (r.subTypeName === "Foil") out.f = row; else out.unknownSubtypes.push(r.subTypeName);
  }
  return out;
}
/** A product is a single iff its extendedData has Rarity; otherwise sealed/other (3,725 of 119,147). */
export const isSealedProduct = (p: TcgcsvProduct): boolean => !(p.extendedData ?? []).some((e) => e.name === "Rarity");

// ── names, slugs ──
/** "Soldier // Angel (0007) Double-Sided Token (Foil)" -> core "Soldier // Angel Double-Sided Token", tokens ["0007", "Foil"]. Non-nested "(...)" and "[...]" groups, in order. */
export function splitGroups(name: string): { core: string; tokens: string[] } {
  const tokens: string[] = [];
  const core = name.replace(/\s*[(\[]([^)\]]*)[)\]]/g, (_m, t: string) => { tokens.push(t.trim()); return ""; });
  return { core: core.replace(/\s+/g, " ").trim(), tokens };
}
/** The number part of a slug from TCGplayer's `Number`: "029/281" -> "29", "7 // 2" -> "7", "A39" -> "a39", "551a" -> "551a", "" / null -> "". */
export function numberToken(number: string | null): string {
  if (!number) return "";
  let s = number.trim().toLowerCase();
  if (!s) return "";
  s = s.includes(" // ") ? s.split(" // ")[0]! : s.replace(/\s*\/\s*\d+$/, "");
  return s.replace(/^0+(?=\d)/, "");
}
/** A card's URL is a function of what TCGplayer calls the product, never of Scryfall. Measured: 3 collisions in all 111,839 included singles. */
export function slugBase(p: { productId: number; name: string; number: string | null }, setTok: string): string {
  const { core, tokens } = splitGroups(p.name);
  let digit: string | null = null; const rest: string[] = [];
  for (const raw of tokens) {
    const t = raw.trim();
    if (/^\d{1,4}$/.test(t)) { const d = t.replace(/^0+(?=\d)/, ""); if (digit === null) digit = d; else rest.push(d); }   // "(0205)" is the collector number; later digit groups (double-sided token faces) stay as text
    else rest.push(t);                                                                                                  // EVERY other parenthetical word keeps its TEXT, not a canonical key
  }
  const num = digit ?? numberToken(p.number);
  const base = slugify([core, setTok, num, rest.join(" ")].filter(Boolean).join(" "));
  return base || `card-${p.productId}`;
}
export const withProductSuffix = (base: string, productId: number): string => `${base.slice(0, 80).replace(/-+$/, "")}-p${productId}`;   // the collision form
export interface GroupRef { groupId: number; abbreviation: string | null; kind: SetKind }
const KIND_RANK = (k: SetKind): number => (k === "expansion" || k === "core" || k === "masters" ? 0 : k === "commander" ? 1 : 2);
/** The write-once slug token of every group (Set.tok). `frozen` = tokens already stored: returned unchanged and counted as taken. WHO and MOC are shared by two groups each. */
export function chooseSetToks(groups: readonly GroupRef[], frozen: ReadonlyMap<number, string>): Map<number, string> {
  const out = new Map<number, string>(frozen);
  const taken = new Set<string>(frozen.values());
  const byAbbr = new Map<string, GroupRef[]>();
  for (const g of groups) {
    if (frozen.has(g.groupId)) continue;
    const a = slugify(g.abbreviation ?? "");
    if (!a) { out.set(g.groupId, `g${g.groupId}`); taken.add(`g${g.groupId}`); continue; }
    const list = byAbbr.get(a); if (list) list.push(g); else byAbbr.set(a, [g]);
  }
  for (const [a, list] of byAbbr) {
    list.sort((x, y) => KIND_RANK(x.kind) - KIND_RANK(y.kind) || x.groupId - y.groupId);
    list.forEach((g, i) => { const t = i === 0 && !taken.has(a) ? a : `g${g.groupId}`; out.set(g.groupId, t); taken.add(t); });
  }
  return out;
}
/** Set.slug: bucket groups are named by the group alone; every other group by "<tok> <name>". On a unique violation the importer retries with `${slug}-g${groupId}`. */
export const setSlugOf = (g: { name: string; bucket: boolean }, tok: string): string => slugify(g.bucket ? g.name : `${tok} ${g.name}`);
/** Oracle.slug at write time; the importer feeds new oracles ordered by (released_at ASC, id ASC) so the oldest card keeps the bare slug. Empty -> "card-<8>". */
export function oracleSlugOf(o: { id: string; name: string }, bareTaken: boolean): string {
  const base = slugify(o.name).slice(0, 80).replace(/-+$/, "");
  if (!base) return `card-${o.id.slice(0, 8)}`;
  return bareTaken ? `${base}-${o.id.slice(0, 8)}` : base;
}
/** Sealed.slug at write time (Secret Lair Drop names run past 100 characters). Rows are inserted in ascending productId order. */
export function sealedSlugOf(name: string, productId: number, bareTaken: boolean): string {
  const base = slugify(name).slice(0, 80).replace(/-+$/, "") || `sealed-${productId}`;
  return bareTaken ? `${base}-${productId}` : base;
}

// ── product class (decided once at import; called before the join with sf = null and again after a link) ──
export type ProductClass = (typeof CARD_CLASS)[keyof typeof CARD_CLASS];
export function productClass(p: { name: string; rarity: string | null }, kind: SetKind | "foreign" | "non-card", sf: { layout: string; oversized: boolean } | null): ProductClass {
  if (kind === "art-series" || sf?.layout === "art_series" || /\bArt Card\b/i.test(p.name)) return CARD_CLASS.ART;
  if (kind === "oversized" || sf?.oversized) return CARD_CLASS.OVERSIZED;
  if (p.rarity === "T" || (sf && ["token", "double_faced_token", "emblem"].includes(sf.layout))) return /\b(Helper|Rules|Theme) Card\b|Insert Card$/i.test(p.name) ? CARD_CLASS.HELPER : CARD_CLASS.TOKEN;
  return CARD_CLASS.CARD;
}

// ── the product-name grammar (bodies: WP01a, ported at C0 from the executable reference design/magic-tools/parse_name.py; acceptance: tests/fixtures/magic-products.json) ──
export interface ParsedName {
  core: string;                          // the name with every (...) and [...] group removed, whitespace collapsed; keeps " - tail" and " // " (slug input)
  base: string;                          // core without a recognised dash tail
  dash: { head: string; tail: string; kind: "event" | "pack" | "thick" | "foreign" | "fullart" | "emblem" | "reskin?" | "word" } | null;
  tokens: string[];                      // every group's text, in order
  digit: string | null;                  // first token that is 1-4 digits: the collector number written in the name ("0205" -> "205")
  faceDigits: string[];                  // further digit tokens (double-sided token faces)
  index: string | null;                  // "2/54", "1 of 9", "1 // 2": an art-card or token index, NOT a collector number
  src: string | null;                    // a token equal to a known Scryfall set code or abbreviation (4ED, KHC, BRO): the SOURCE set in bucket groups
  version: string | null;                // (A)..(F), (a)/(b), (2-3-6), [Version 2]
  event: { year: number; player: string } | null;   // "Name - 1996 Bertrand Lestree (4ED)" in World Championship Decks
  pack: string | null;                   // "Clear Pack" (APAC Lands)
  sideboard: boolean;                    // "(SB)"
  lang: string | null;                   // a language word
  treat: TreatmentKey[];                 // closed keys, TREATMENTS order
  words: string[];                       // leftover words, in name order: the unknown vocabulary
}
// The port of design/magic-tools/parse_name.py (C0, WP01a). The token classes, their ORDER and the greedy longest-phrase treatment consumption are the reference's; the treatment KEYS come from the
// closed vocabulary of constants.ts (TREATMENT_BY_SYNONYM), not from the reference's own table. What the reference does not have (the dash layer, and gating the source-set token by group kind) is decided here:
//   * a " - tail" is classified once, by this order: event ("1996 Bertrand Lestree"), pack ("Clear Pack"), "Thick Stock", "Full Art"/"JP Full Art", emblem (head ends in "Emblem" or the tail ends in
//     "Double-Sided Token"), a language word ("foreign"), treatment words only ("word"), a basic land's variant word ("word": "Forest - Guru"), else "reskin?": a possible flavor-name pair, which only the Scryfall
//     join may resolve (the grammar never decides which side is the oracle name). `base` drops the tail of event, pack, thick, fullart and word; every other kind keeps it (it is part of the name).
//   * a token equal to a Scryfall set code is the SOURCE set (`src`) only in bucket kinds (promo, promo-pack, list, secret-lair, gold-border): in an expansion "(Man)" is an art word, not a code. An exact
//     treatment synonym wins over a code ("CE" is Collector's Edition; "FNM" is the promo stamp).
//   * everything the vocabulary does not know is kept as text in `words` (never a raw: key), in name order, one entry per token.
const BUCKET_KINDS: readonly SetKind[] = ["promo", "promo-pack", "list", "secret-lair", "gold-border"];
const LANGUAGES: ReadonlySet<string> = new Set(["spanish", "french", "italian", "german", "japanese", "portuguese", "korean", "chinese", "russian", "greek", "hebrew", "sanskrit", "latin", "arabic", "english"]);   // the reference's LANGS minus "phyrexian": an art key of the vocabulary, not a language
const TAIL_KINDS_DROPPED_FROM_BASE: ReadonlySet<string> = new Set(["event", "pack", "thick", "fullart", "word"]);   // the dash kinds whose tail is not part of the name; the others keep it in `base`
const BASIC_LAND = /^(?:Snow-Covered )?(?:Plains|Island|Swamp|Mountain|Forest)$|^Wastes$/;
const PREFIX_SYNONYMS: readonly (readonly [string, TreatmentKey])[] = [...TREATMENT_BY_SYNONYM].filter(([s]) => s.endsWith(" *")).map(([s, k]) => [s.slice(0, -2), k] as const).sort((a, b) => b[0].length - a[0].length);
const IGNORED_WORDS: ReadonlySet<string> = new Set(IGNORED_FINISH_WORDS.map((w) => fold(w)));
const LANGUAGE_KEY = new Map<string, TreatmentKey>(TREATMENTS.filter((t) => t.kind === "language").flatMap((t) => t.syn.map((s) => [fold(s), t.key as TreatmentKey] as const)));
/** The reference's greedy consumption: from each word the longest phrase that is a synonym; a prefix synonym ("neon ink*") takes the rest of the token; finish words are dropped; the rest is leftover. */
function consumeWords(text: string): { keys: TreatmentKey[]; leftover: string[] } {
  const words = text.split(/\s+/).filter(Boolean);
  const keys: TreatmentKey[] = []; const leftover: string[] = [];
  let i = 0;
  while (i < words.length) {
    let hit: { key: TreatmentKey; end: number } | null = null;
    for (let j = words.length; j > i && !hit; j--) { const k = TREATMENT_BY_SYNONYM.get(fold(words.slice(i, j).join(" "))); if (k) hit = { key: k, end: j }; }
    if (!hit) { const rest = fold(words.slice(i).join(" ")); for (const [p, k] of PREFIX_SYNONYMS) if (rest === p || rest.startsWith(p + " ")) { hit = { key: k, end: words.length }; break; } }
    if (hit) { keys.push(hit.key); i = hit.end; continue; }
    if (!IGNORED_WORDS.has(fold(words[i]))) leftover.push(words[i]!);
    i++;
  }
  return { keys, leftover };
}
export function parseTcgName(name: string, ctx: { setCodes: ReadonlySet<string>; groupKind: SetKind }): ParsedName {
  const { core, tokens } = splitGroups(name);
  const p: ParsedName = { core, base: core, dash: null, tokens, digit: null, faceDigits: [], index: null, src: null, version: null, event: null, pack: null, sideboard: false, lang: null, treat: [], words: [] };
  const keys = new Set<TreatmentKey>();
  const bucket = BUCKET_KINDS.includes(ctx.groupKind);
  const isCode = (t: string): boolean => /^[A-Za-z0-9]{2,5}$/.test(t) && (ctx.setCodes.has(t.toLowerCase()) || ctx.setCodes.has(t));
  const addWords = (leftover: string[]): void => { if (leftover.length) p.words.push(leftover.join(" ")); };
  const grammarToken = (raw: string): void => {                       // classify_token of the reference, in its order
    const t = raw.trim();
    if (!t) return;
    if (/^\d{1,4}$/.test(t)) { const d = t.replace(/^0+(?=\d)/, ""); if (p.digit === null) p.digit = d; else p.faceDigits.push(d); return; }
    if (/^\d+\s*\/\s*\d+$/.test(t) || /^\d+\s+of\s+\d+$/i.test(t) || /^\d+\s*\/\/\s*\d+$/.test(t)) { p.index ??= t.replace(/\s+/g, ""); return; }
    if (t.toUpperCase() === "SB") { p.sideboard = true; keys.add("sb"); return; }
    if (LANGUAGES.has(t.toLowerCase())) { p.lang ??= t.toLowerCase(); const k = LANGUAGE_KEY.get(fold(t)); if (k) keys.add(k); else p.words.push(t); return; }
    if (/^[A-Fa-f]$/.test(t) || /^\d-\d-\d$/.test(t) || /^version \d+$/i.test(t)) { p.version ??= t; return; }
    const exact = TREATMENT_BY_SYNONYM.get(fold(t));
    if (exact) { keys.add(exact); return; }                           // "CE", "FNM", "Showcase": a treatment beats a set code
    if (bucket && isCode(t)) { p.src ??= t.toLowerCase(); return; }
    const compound = /^([A-Za-z0-9]{2,4})\s+bundle$/i.exec(t);       // "WAR Bundle": the Bundle key plus the source set
    if (compound && isCode(compound[1]!)) { keys.add("bundle"); p.src ??= compound[1]!.toLowerCase(); return; }
    const c = consumeWords(t);
    for (const k of c.keys) keys.add(k);
    addWords(c.leftover);
  };
  // the pieces in the order they stand in the name: the groups, and the dash tail where the first top-level " - " is
  type Piece = { pos: number; run: () => void };
  const pieces: Piece[] = [];
  for (const m of name.matchAll(/[(\[]([^)\]]*)[)\]]/g)) pieces.push({ pos: m.index ?? 0, run: () => grammarToken(m[1]!) });
  const dashAt = core.indexOf(" - ");
  if (dashAt > 0) {
    const head = core.slice(0, dashAt).trim(); const tail = core.slice(dashAt + 3).trim();
    let depth = 0; let pos = name.length;
    for (let i = 0; i < name.length; i++) { const c = name[i]!; if (c === "(" || c === "[") depth++; else if (c === ")" || c === "]") depth = Math.max(0, depth - 1); else if (depth === 0 && name.startsWith(" - ", i)) { pos = i; break; } }
    pieces.push({ pos, run: () => {
      let kind: NonNullable<ParsedName["dash"]>["kind"];
      const ev = /^(\d{4})\s+(\S.*)$/.exec(tail); const f = fold(tail);
      if (ev) { p.event = { year: Number(ev[1]), player: ev[2]! }; kind = "event"; }
      else if (/^[A-Z][A-Za-z]*\s+Pack$/.test(tail)) { p.pack = tail; kind = "pack"; }
      else if (f === "thick stock") { keys.add("display"); kind = "thick"; }
      else if (/^(?:jp\s+)?full[\s-]?art$/i.test(tail)) { for (const k of consumeWords(tail).keys) keys.add(k); kind = "fullart"; }
      else if (/(?:^|\s)Emblem$/.test(head) || /Double-Sided Token$/i.test(tail)) kind = "emblem";
      else if (/^\d+\s*(?:\/\/?|of)\s*\d+$/i.test(tail)) { p.index ??= tail.replace(/\s+/g, ""); kind = "word"; }
      else if (LANGUAGES.has(f)) { grammarToken(tail); kind = "foreign"; }
      else {
        const c = consumeWords(tail);
        if (c.keys.length > 0 && c.leftover.length === 0) { for (const k of c.keys) keys.add(k); kind = "word"; }
        else if (BASIC_LAND.test(head)) { for (const k of c.keys) keys.add(k); addWords(c.leftover); kind = "word"; }
        else kind = "reskin?";
      }
      p.dash = { head, tail, kind };
      if (TAIL_KINDS_DROPPED_FROM_BASE.has(kind)) p.base = head;
    } });
  }
  pieces.sort((a, b) => a.pos - b.pos);
  for (const piece of pieces) piece.run();
  p.treat = TREATMENT_KEYS.filter((k) => keys.has(k));
  return p;
}
/** Treatment labels (TREATMENTS order, the group's own treatment added when absent), then version, event, pack, "from KHC", sideboard, words; " · "-joined; null when empty. The exact text of a placing
 *  ("3rd Place") and of a special foil stays in the label (the generic key label would lose it); language keys and the sideboard key are shown through their own field. */
export function labelOf(p: ParsedName, groupTreat: TreatmentKey | null): string | null {
  const keys = new Set<TreatmentKey>(p.treat); if (groupTreat) keys.add(groupTreat);
  const parts: string[] = [];
  for (const t of TREATMENTS) {
    if (!keys.has(t.key)) continue;
    if (t.key === "sb") continue;
    if (t.key === "placing" || t.key === "otherfoil") {
      const tokenText = [...p.tokens, p.dash?.tail ?? ""].filter((x) => TREATMENT_BY_SYNONYM.get(fold(x)) === t.key || consumeWords(x).keys.includes(t.key));
      parts.push(...(tokenText.length ? tokenText : [t.label])); continue;
    }
    parts.push(t.label);
  }
  if (p.version) parts.push(`Version ${p.version.replace(/^version\s+/i, "").toUpperCase()}`);
  if (p.event) parts.push(`${p.event.year} ${p.event.player}`);
  if (p.pack) parts.push(p.pack);
  if (p.src) parts.push(`from ${p.src.toUpperCase()}`);
  if (p.sideboard) parts.push("Sideboard");
  parts.push(...p.words);
  return parts.length ? parts.join(" · ") : null;
}

// ── set / sealed helpers (bodies: WP01) ──
export interface ScrySetRef { code: string; name: string; setType: string; tcgplayerId: number | null; releasedAt: string | null; parentSetCode: string | null; digital: boolean }
export function setDisplayName(g: Pick<TcgcsvGroup, "name">): string { return g.name; }          // the group name, verbatim today (the one place to add a tidy rule)
export function setCodeOf(g: Pick<TcgcsvGroup, "abbreviation" | "groupId">, sf?: ScrySetRef | null): string {   // dominant Scryfall code (>= 60% of the group's joined products, chosen by the importer) upper-cased, else the abbreviation, else "G<groupId>"
  const code = sf?.code?.trim() || g.abbreviation?.trim();
  return code ? code.toUpperCase() : `G${g.groupId}`;
}
export interface CatalogSealed { id: number; name: string; setId: number | null; kind: string; packCount: number | null; releasedOn: string | null; presale: boolean; contents: string | null }
/** Packs inside, only where the name SAYS so: one pack for a plain "<Set> - ... Booster Pack", N for "Nx Booster Packs" and "N-Pack". "3-Booster Draft Pack", "2 - Booster Pack" and every box stay null: the count of a box depends on the era (36, 30, 12). */
function sealedPackCount(name: string): number | null {
  const x = /\b(\d{1,2})x\s+(?:[A-Za-z]+\s+)?Booster Packs?\b/i.exec(name) ?? /\b(\d{1,2})-Pack\b/i.exec(name);
  if (x) return Number(x[1]);
  return !/\d/.test(name) && /\bBooster Pack$/i.test(name) && !/\bCase\b|\bBox\b/i.test(name) ? 1 : null;
}
/** The "Contents:" list of the cleaned OracleText when there is one (else its start), at most 600 characters, cut at a word. */
function sealedContents(text: string | null): string | null {
  if (!text) return null;
  const at = text.search(/\bContents:/i);
  const s = (at >= 0 ? text.slice(at) : text).trim();
  if (s.length <= 600) return s || null;
  const cut = s.slice(0, 599); const sp = cut.lastIndexOf(" ");
  return `${(sp > 400 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}
export function parseSealed(p: TcgcsvProduct, setKind: SetKind | null): CatalogSealed {     // contents = cleaned OracleText <= 600 chars; packCount parsed only where certain; setId is null when the group is not an included set
  const name = p.name.replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  return {
    id: p.productId, name, setId: setKind === null ? null : p.groupId, kind: sealedKind(p.name), packCount: sealedPackCount(name),
    releasedOn: p.presaleInfo?.releasedOn?.slice(0, 10) ?? null, presale: Boolean(p.presaleInfo?.isPresale),
    contents: sealedContents(cleanEffect((p.extendedData ?? []).find((e) => e.name === "OracleText")?.value)),
  };
}
function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
/** OP's, unchanged (TCGCSV OracleText; unjoined rows and sealed contents only): card text without HTML, errata links or the reminder-text <em> markup. */
export function cleanEffect(html: string | undefined | null): string | null {
  if (!html) return null;
  const t = decode(html.replace(/<a\b[^>]*>[^<]*errata[^<]*<\/a>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").trim();
  return t || null;
}
export function largeImage(productId: number): string { return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`; }   // OP's, unchanged

export type { Finish };
export { nkey };
