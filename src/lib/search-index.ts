// The browse index and the search over it. Pure (no database, no React): the /api/browse route builds the index on the server,
// and the header typeahead, the browse grid's filters and the recently-viewed rail read it in the browser (lib/index-client.ts).
//
// One index per region: every COMPARABLE product (what /<region>/sealed lists) as CompactCard tuples, in the browse page's
// "relevance" order. It is an ISR route handler, so it is read from the database once per region per import (the importer's
// revalidatePath purges it with the pages) and served from the CDN in between. A keystroke never reaches the database.
import { cardOpen, compactCard } from "./compact";
import type { ProductCardData } from "./data";
import { INDEX_VERSION, type BrowseIndex } from "./index-client";
import { isRegion, type Region } from "./regions";
import { PRODUCT_TYPES } from "./sealed-title";
import { SETS } from "./sets";

// ─── Relevance: the browse order ───────────────────────────────────────────────
// One definition for the SQL that pages /<region>/sealed (lib/browse-data.ts marketPage, ORDER BY with array_position over these
// two arrays) and the browser that sorts the index (BrowseGrid): open first, then the newest set, then the chase products first
// (PRODUCT_TYPES order), then name and slug in code-point order (the SQL sorts them COLLATE "C"), so a page is the same rows in the
// same order wherever it is computed.

/** Set codes, newest release first (sets.ts order breaks a tie: Black Bolt before White Flare). */
export const SET_CODES_NEWEST_FIRST: string[] = SETS.map((s, i) => ({ s, i }))
  .sort((a, b) => b.s.releaseDate.localeCompare(a.s.releaseDate) || a.i - b.i)
  .map(({ s }) => s.code);

/** Product type labels in display rank (PRODUCT_TYPES order: booster boxes and ETBs first). */
export const TYPE_LABELS_BY_RANK: string[] = PRODUCT_TYPES.map((t) => t.label);

const SET_POS = new Map(SET_CODES_NEWEST_FIRST.map((c, i) => [c, i]));
const TYPE_POS = new Map(TYPE_LABELS_BY_RANK.map((l, i) => [l, i]));
// Not Infinity: Infinity − Infinity is NaN, which breaks a comparator. Unknown sorts last, as NULLS LAST does in the SQL.
const LAST = Number.MAX_SAFE_INTEGER;
export const setPosition = (code: string | null | undefined): number => (code ? SET_POS.get(code) ?? LAST : LAST);
export const typePosition = (label: string): number => TYPE_POS.get(label) ?? LAST;

/** Compare by Unicode code point, as Postgres orders text COLLATE "C" (UTF-8 bytes). JS `<` compares UTF-16 units instead. */
export function codePointCompare(a: string, b: string): number {
  if (a === b) return 0;
  let i = 0;
  while (i < a.length && i < b.length && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  if (i === a.length) return -1;
  if (i === b.length) return 1;
  return a.codePointAt(i)! - b.codePointAt(i)!;
}

type RelevanceKey = Pick<ProductCardData, "slug" | "name" | "productType" | "setCode" | "inStockStores" | "marketplaceOpen">;

/** The browse page's "Recommended" order. marketPage's ORDER BY is this, in SQL. */
export function relevanceCompare(a: RelevanceKey, b: RelevanceKey): number {
  return (
    Number(cardOpen(b)) - Number(cardOpen(a)) ||
    setPosition(a.setCode) - setPosition(b.setCode) ||
    typePosition(a.productType) - typePosition(b.productType) ||
    codePointCompare(a.name, b.name) ||
    codePointCompare(a.slug, b.slug)
  );
}

// ─── The index ─────────────────────────────────────────────────────────────────
// Its shape (BrowseIndex, INDEX_VERSION, isBrowseIndex) lives in lib/index-client.ts, the light half every page's search box loads;
// re-exported here with the rest of the search API.
export { BROWSE_QUERY_EVENT, INDEX_VERSION, isBrowseIndex, isBrowsePath, searchHref, searchOptions } from "./index-client";
export type { BrowseIndex, SearchOption } from "./index-client";

export function buildIndex(region: Region, cards: readonly ProductCardData[], checkedAt: Date | null): BrowseIndex {
  return { v: INDEX_VERSION, region, checkedAt: checkedAt ? checkedAt.toISOString() : null, rows: [...cards].sort(relevanceCompare).map(compactCard) };
}

/**
 * GET /api/browse/<region>, minus Next: a 404 for anything but the seven regions, else the index `load` builds. The route file
 * (src/app/api/browse/[region]/route.ts) wires it to the database; tests call it with a fake loader. Standard Response, so this
 * module stays importable in the browser.
 */
export async function browseIndexResponse(regionParam: string, load: (region: Region) => Promise<BrowseIndex>): Promise<Response> {
  if (!isRegion(regionParam)) {
    return new Response(JSON.stringify({ error: "unknown region" }), { status: 404, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  const body = await load(regionParam);
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": INDEX_CACHE_CONTROL } });
}

/**
 * The index's Cache-Control: the header Next gives every ISR page of this site (revalidate = 86400), which `next start` leaves off
 * a route handler. The CDN keeps it a day or until the importer's revalidatePath purges it; the browser asks again on its next page
 * load (within one, lib/index-client.ts keeps it in memory).
 */
export const INDEX_CACHE_CONTROL = "s-maxage=86400, stale-while-revalidate";

// ─── Search ────────────────────────────────────────────────────────────────────
// Every word typed must match the product: its name, its type, its set's name and code, and the words collectors use for them
// ("etb", "pc etb", "upc", "b&b", "bb" for booster box). A word matches the start of a word ("pitch" → Pitch Black), and from
// three letters on, anywhere ("zard" → Charizard). Accents never matter ("pokemon" finds "Pokémon").

/** Lower case, accents stripped (NFKD without the combining marks). */
export function foldText(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function words(s: string): string[] {
  return foldText(s).split(/[^a-z0-9]+/).filter(Boolean);
}

/** What collectors type for a product type, beyond the words of its label. */
const TYPE_ALIASES: Record<string, string[]> = {
  "Booster Box": ["bb", "display"],
  "Booster Box Case": ["bb"],
  "Elite Trainer Box": ["etb"],
  "Elite Trainer Box Case": ["etb"],
  "Pokémon Center Elite Trainer Box": ["etb", "pc", "pcetb"],
  "Ultra-Premium Collection": ["upc"],
  "Build & Battle Box": ["bnb"],
  "Build & Battle Stadium": ["bnb"],
  "Booster Pack": ["packs"],
};

// Two-letter abbreviations with an "&" in them, folded to one word before the query is split ("b&b" → bnb, "s&v" → sv).
const QUERY_PHRASES: [RegExp, string][] = [
  [/\bb\s*(?:&|and|n)\s*b\b/g, " bnb "],
  [/\bs\s*(?:&|and)\s*v\b/g, " sv "],
  [/\bpc\s*-?\s*etb/g, " pc etb "],
];

// Words that say nothing about which product: every product here is Pokémon, sealed, TCG, and "&" is not a word of any name.
// Dropped from a query as whole words only ("po" still finds "Pokémon Center"), and only when other words remain.
const STOP = new Set(["pokemon", "tcg", "sealed", "english", "and", "the"]);

function allQueryWords(q: string): string[] {
  let s = foldText(q);
  for (const [re, to] of QUERY_PHRASES) s = s.replace(re, to);
  return s.split(/[^a-z0-9]+/).filter(Boolean);
}

/** A query as the words every product must match. */
export function queryWords(q: string): string[] {
  const all = allQueryWords(q);
  const kept = all.filter((w) => !STOP.has(w));
  return kept.length ? kept : all;
}

/** "boxes" → "box", "etbs" → "etb", "tins" → "tin": a plural typed for a singular label. */
function singular(w: string): string | null {
  if (w.length < 4) return null;
  if (/(?:x|s|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return null;
}

interface Entry {
  tokens: string[];
  hay: string;
  setTokens: string[];
}

// Built once per card object (the index's cards live for the page session).
const ENTRIES = new WeakMap<ProductCardData, Entry>();
const SET_NAME = new Map(SETS.map((s) => [s.code, s.name]));

function entry(p: ProductCardData): Entry {
  let e = ENTRIES.get(p);
  if (!e) {
    const setName = p.setCode ? SET_NAME.get(p.setCode) ?? "" : "";
    const setTokens = words(setName);
    const tokens = [...new Set([...words(p.name), ...words(p.productType), ...setTokens, ...(p.setCode ? [p.setCode.toLowerCase()] : []), ...(TYPE_ALIASES[p.productType] ?? [])])];
    e = { tokens, hay: ` ${tokens.join(" ")}`, setTokens };
    ENTRIES.set(p, e);
  }
  return e;
}

function wordMatches(w: string, tokens: string[], hay: string): boolean {
  const one = singular(w);
  for (const t of tokens) if (t.startsWith(w) || (one && t.startsWith(one))) return true;
  return w.length >= 3 && hay.includes(w);
}

function prefixMatches(w: string, tokens: string[]): boolean {
  const one = singular(w);
  return tokens.some((t) => t.startsWith(w) || (!!one && t.startsWith(one)));
}

/** Does the product match every word of the query? */
export function matchesQuery(p: ProductCardData, ws: readonly string[]): boolean {
  if (!ws.length) return false;
  const e = entry(p);
  return ws.every((w) => wordMatches(w, e.tokens, e.hay));
}

/**
 * Every product matching the query, best first: buyable now first; then the products whose SET the query names (the more of its
 * words, the better: "pitch black" → Pitch Black's products before a Black Bolt one); then the newest set; within a set the chase
 * products first (a set's booster box and ETB before its blisters, so "pitch black" lists the box, not eight blisters), and the
 * cheaper first; then name.
 */
export function searchCards(cards: readonly ProductCardData[], q: string): ProductCardData[] {
  const ws = queryWords(q);
  if (!ws.length) return [];
  const hits: { p: ProductCardData; setHits: number }[] = [];
  for (const p of cards) {
    if (!matchesQuery(p, ws)) continue;
    const { setTokens } = entry(p);
    hits.push({ p, setHits: setTokens.length ? ws.filter((w) => prefixMatches(w, setTokens)).length : 0 });
  }
  hits.sort(
    (a, b) =>
      Number(cardOpen(b.p)) - Number(cardOpen(a.p)) ||
      b.setHits - a.setHits ||
      setPosition(a.p.setCode) - setPosition(b.p.setCode) ||
      typePosition(a.p.productType) - typePosition(b.p.productType) ||
      price(a.p) - price(b.p) ||
      codePointCompare(a.p.name, b.p.name) ||
      codePointCompare(a.p.slug, b.p.slug),
  );
  return hits.map((h) => h.p);
}

const price = (p: ProductCardData) => (cardOpen(p) && p.lowestPriceCents != null ? p.lowestPriceCents : LAST);

/** The typeahead's list: the best `limit` matches, and how many there are in all. */
export function rankSearch(cards: readonly ProductCardData[], q: string, limit = 8): { products: ProductCardData[]; total: number } {
  const all = searchCards(cards, q);
  return { products: all.slice(0, limit), total: all.length };
}

/**
 * Where the query's words start in `text` (accents folded), for bold highlighting: [start, end) ranges in `text`'s own indices,
 * merged and sorted. Only word starts are marked, the way the list matches them.
 */
export function highlightRanges(text: string, q: string): [number, number][] {
  const ws = allQueryWords(q); // "pokemon center" marks "Pokémon" too, though it doesn't have to match
  if (!ws.length) return [];
  // Fold character by character so every folded index maps back to the original one ("é" folds to one "e", "ﬁ" to two letters).
  let folded = "";
  const at: number[] = [];
  for (let i = 0; i < text.length; ) {
    const ch = String.fromCodePoint(text.codePointAt(i)!);
    const f = foldText(ch);
    for (let k = 0; k < f.length; k++) at.push(i);
    folded += f;
    i += ch.length;
  }
  at.push(text.length);
  const out: [number, number][] = [];
  const isWordStart = (i: number) => i === 0 || !/[a-z0-9]/.test(folded[i - 1]);
  for (const full of ws) {
    for (const w of [full, singular(full)]) {
      if (!w) continue;
      for (let i = folded.indexOf(w); i >= 0; i = folded.indexOf(w, i + 1)) {
        if (isWordStart(i)) out.push([at[i], at[i + w.length]]);
      }
    }
  }
  out.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}
