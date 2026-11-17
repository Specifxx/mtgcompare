// Card prices: every Magic card (owner, 2026-11-17: "we want all the cards"; DECISIONS.md "Card prices: every card").
//
// Every card TCGplayer lists gets a page at /card-prices/<set>/<card>, priced by TCGplayer's market price (US$, recent sales) per
// finish, with a "Check on eBay" search row first and the TCGplayer row second. No store prices, no eBay API calls, no database:
// scripts/card-import.ts reads TCGplayer's public price files (as TCGCSV mirrors them daily) in GitHub Actions and commits the files
// in data/cards/; pages read them.
//
// GOOGLE, NOT THE CATALOGUE, IS RATIONED. The old singles site put ~42,000 card URLs in its sitemap and Google indexed its homepage
// (DECISIONS.md, 2026-10-19). So a card is INDEXED (indexable, and in the sitemap) only once the import has released it (`ix`):
// cards worth MIN_INDEX_CENTS or more, most valuable first, INDEX_START on the first run, then INDEX_GROWTH more a day (the
// repository variable CARD_INDEX_GROWTH; 0 pauses it). Released stays released while the card is worth MIN_INDEX_CENTS. Every other
// card page is live, linked and noindex.
//
// Files (data/cards/): sets.json (every set, the release counter), sets/<set>.json (each set's cards), search.json (the search
// index), top.json (small: the hub's and each sealed set's most valuable cards; the only card file every page bundles).
import fs from "node:fs";
import path from "node:path";

export const MIN_INDEX_CENTS = 100;
export const INDEX_START = 2000;
export const INDEX_GROWTH = 500;
/** The 2026-11-17 first release (capped at US$5+) used this; kept so its 1,000 URLs stay released. */
export const LEGACY_FILE = path.join("data", "cards", "mtg-cards.json");
export const CARDS_DIR = path.join("data", "cards");

/** Prices in US cents per finish: [normal, foil, etched]; null = no recent TCGplayer sale. */
export type Prices = [number | null, number | null, number | null];

/** One card in a set file. Short keys: ~100,000 of them are bundled with the card routes. */
export interface CardRow {
  /** TCGplayer product id. */
  id: number;
  /** The card's slug inside its set, frozen once given. */
  s: string;
  /** Name. */
  n: string;
  /** Collector number as TCGplayer prints it ("123", "123a", "T4"); "" when it has none. */
  no: string;
  /** Rarity letter (C, U, R, M, S, L, P) or null. */
  r: string | null;
  p: Prices;
  /** Released to Google (indexable while worth MIN_INDEX_CENTS). */
  ix: 0 | 1;
  /** The day it got its page (YYYY-MM-DD). */
  since: string;
}

export interface CardSet {
  /** URL slug: the sealed set's own slug when we sell the set sealed, else from TCGplayer's group name. Frozen once given. */
  slug: string;
  name: string;
  /** TCGplayer's abbreviation ("FDN"), the code people type with a number. */
  abbr: string | null;
  groupId: number;
  /** TCGplayer's publishedOn day. */
  released: string | null;
  /** lib/sets.ts code when this site compares the set's sealed product. */
  sealed: string | null;
  cards: number;
  indexed: number;
}

export interface SetsFile {
  generatedAt: string;
  source: string;
  sets: CardSet[];
}

export interface SetFile {
  slug: string;
  cards: CardRow[];
}

/** search.json: one tuple per card. [setSlug, cardSlug, name, number, valueCents|0, indexable 0|1, TCGplayer id]. */
export type SearchRow = [string, string, string, string, number, 0 | 1, number];

/** A small card for tiles: what top.json holds. */
export interface CardLite {
  set: string;
  s: string;
  n: string;
  no: string;
  r: string | null;
  id: number;
  v: number;
}
export interface TopFile {
  hub: CardLite[];
  /** lib/sets.ts code → that set's five most valuable cards. */
  bySealed: Record<string, CardLite[]>;
}

// ─── Pure rules ────────────────────────────────────────────────────────────────

export function cardValue(p: Prices): number | null {
  const v = p.filter((x): x is number => typeof x === "number" && x > 0);
  return v.length ? Math.max(...v) : null;
}

export function cardIndexable(c: Pick<CardRow, "p" | "ix">): boolean {
  return c.ix === 1 && (cardValue(c.p) ?? 0) >= MIN_INDEX_CENTS;
}

export function slugify(s: string): string {
  return s
    .replace(/æ/gi, "ae").replace(/œ/gi, "oe")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** "<name>-<number>", so two printings never share a URL; the id breaks any remaining tie. */
export function cardSlug(name: string, number: string, taken: Set<string>, id: number): string {
  const base = [slugify(name), slugify(number)].filter(Boolean).join("-") || String(id);
  return taken.has(base) ? `${base}-${id}` : base;
}

/** A card as the import reads it today. */
export interface CardCandidate {
  id: number;
  n: string;
  no: string;
  r: string | null;
  p: Prices;
}

/**
 * One set's cards today: every card TCGplayer lists keeps the slug and first day it had (previous), a new card gets a fresh slug.
 * `ix` is carried over here; releaseForIndexing sets new ones afterwards.
 */
export function mergeSet(previous: readonly CardRow[], today: readonly CardCandidate[], day: string): CardRow[] {
  const prev = new Map(previous.map((c) => [c.id, c]));
  const taken = new Set<string>();
  const out: CardRow[] = [];
  // Previous slugs first, so a new card can never take one.
  for (const c of today) {
    const p = prev.get(c.id);
    if (p && !taken.has(p.s)) {
      taken.add(p.s);
      out.push({ ...c, s: p.s, ix: p.ix, since: p.since });
    }
  }
  const have = new Set(out.map((c) => c.id));
  for (const c of today) {
    if (have.has(c.id)) continue;
    const s = cardSlug(c.n, c.no, taken, c.id);
    taken.add(s);
    out.push({ ...c, s, ix: 0, since: day });
  }
  return out.sort((a, b) => numberOrder(a.no, b.no) || a.n.localeCompare(b.n) || a.id - b.id);
}

/** Collector-number order: 2 before 10, 10 before 10a, letters-only numbers last. */
export function numberOrder(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  const fa = Number.isFinite(na);
  const fb = Number.isFinite(nb);
  if (fa && fb && na !== nb) return na - nb;
  if (fa !== fb) return fa ? -1 : 1;
  return a.localeCompare(b);
}

/**
 * Today's release to Google, in place: a released card stays released while it is worth MIN_INDEX_CENTS (it loses `ix` under it, so
 * climbing back means waiting its turn again); then the most valuable unreleased cards at or over the gate, up to `growth` of them
 * (enough to reach INDEX_START while fewer are released). Returns how many it released.
 */
export function releaseForIndexing(all: CardRow[], growth: number): number {
  for (const c of all) if (c.ix && (cardValue(c.p) ?? 0) < MIN_INDEX_CENTS) c.ix = 0;
  const released = all.filter((c) => c.ix).length;
  const room = released < INDEX_START ? Math.max(INDEX_START - released, growth) : growth;
  const next = all
    .filter((c) => !c.ix && (cardValue(c.p) ?? 0) >= MIN_INDEX_CENTS)
    .sort((a, b) => (cardValue(b.p) ?? 0) - (cardValue(a.p) ?? 0) || a.id - b.id)
    .slice(0, Math.max(0, room));
  for (const c of next) c.ix = 1;
  return next.length;
}

// ─── What the import keeps from TCGCSV ─────────────────────────────────────────

export interface TcgcsvGroup {
  groupId: number;
  name: string;
  abbreviation?: string | null;
  publishedOn?: string | null;
}
export interface TcgcsvCardProduct {
  productId: number;
  name: string;
  extendedData?: { name: string; value: string }[];
}
export interface TcgcsvCardPrice {
  productId: number;
  marketPrice: number | null;
  subTypeName: string;
}

/** Groups that hold no playable cards of their own. */
export function skipGroup(g: Pick<TcgcsvGroup, "name">): boolean {
  return /\bart series\b|\btokens?\b|\bsubstitute cards?\b|\bmemorabilia\b/i.test(g.name);
}

const ext = (p: TcgcsvCardProduct, key: string) => p.extendedData?.find((e) => e.name === key)?.value?.trim() || null;
const cents = (usd: number | null | undefined) => (typeof usd === "number" && usd > 0 ? Math.round(usd * 100) : null);

/**
 * The cards of one TCGplayer group: products with a rarity or a collector number (sealed products have neither), never a token, an
 * emblem, an art card or a checklist (a card named "Pack Rat" is a card: sealed products are told apart by having
 * no rarity and no number), each with TCGplayer's market price per finish (null = no recent sale).
 */
export function cardsOfGroup(products: readonly TcgcsvCardProduct[], prices: readonly TcgcsvCardPrice[]): CardCandidate[] {
  const byId = new Map<number, Prices>();
  for (const pr of prices) {
    const row = byId.get(pr.productId) ?? ([null, null, null] as Prices);
    const v = cents(pr.marketPrice);
    const t = pr.subTypeName.toLowerCase();
    if (t === "normal") row[0] = v;
    else if (t.includes("etched")) row[2] = v;
    else if (t.includes("foil")) row[1] = v;
    byId.set(pr.productId, row);
  }
  const out: CardCandidate[] = [];
  for (const p of products) {
    const number = ext(p, "Number");
    const rarity = ext(p, "Rarity");
    if (!number && !rarity) continue;
    if (rarity === "T" || /\b(?:token|emblem|art card|checklist|substitute card)\b/i.test(p.name)) continue;
    out.push({ id: p.productId, n: p.name, no: number ?? "", r: rarity, p: byId.get(p.productId) ?? [null, null, null] });
  }
  return out;
}

// ─── Copy ─────────────────────────────────────────────────────────────────────

const RARITY: Record<string, string> = { C: "Common", U: "Uncommon", R: "Rare", M: "Mythic Rare", S: "Special", L: "Land", P: "Promo" };
export function rarityName(r: string | null): string | null {
  return r ? RARITY[r] ?? r : null;
}

export { usd, cardImage } from "./cards-client";

/**
 * The page title, at most 60 characters with " | MTG Compare": the name, the set and number (what a collector types to find one
 * printing), then "Price". The name is never cut; the extras go first.
 */
export function cardTitle(c: { n: string; no: string }, set: { name: string; abbr: string | null }): string {
  const MAX = 60 - " | MTG Compare".length;
  const num = c.no ? ` #${c.no}` : "";
  const candidates = [
    `${c.n} (${set.name}${num}) Price`,
    set.abbr ? `${c.n} (${set.abbr}${num}) Price` : null,
    set.abbr ? `${c.n} ${set.abbr}${num} Price` : null,
    `${c.n}${num} Price`,
    `${c.n} Price`,
    c.n,
  ].filter((t): t is string => !!t);
  return candidates.find((t) => t.length <= MAX) ?? c.n;
}


export function tcgplayerCardUrl(id: number): string {
  return `https://www.tcgplayer.com/product/${id}`;
}

export const CARDS_HUB = "/card-prices";
export const cardPath = (setSlug: string, cardSlug: string) => `${CARDS_HUB}/${setSlug}/${cardSlug}`;

// ─── Search (pure: the route and the tests share it) ───────────────────────────

export function normalise(s: string): string {
  return s
    .replace(/æ/gi, "ae").replace(/œ/gi, "oe")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9#/]+/g, " ")
    .trim();
}

export interface SearchHit {
  set: string;
  s: string;
  n: string;
  no: string;
  v: number;
  id: number;
}

/**
 * Cards for a query: a card name (all words, any order; whole-name and prefix matches first), optionally with a set (its
 * abbreviation, "FDN", or words of its name) and a collector number ("101", "#101", "101/281"): "sheoldred dmu 107", "FDN 101",
 * "atraxa 196". With a set and a number alone, that one printing. Ties go to the more valuable card.
 */
export function searchCards(rows: readonly SearchRow[], sets: ReadonlyMap<string, { name: string; abbr: string | null }>, query: string, limit = 12): { hits: SearchHit[]; total: number } {
  const q = normalise(query);
  if (q.length < 2) return { hits: [], total: 0 };
  // A set code can also be a word of a name ("ONE" in "The One Ring"): read the query both ways, and keep the name reading when it
  // matches a card name whole or from its start and the set reading does no better.
  const withSet = scoreCards(rows, sets, q, true);
  const plain = withSet.setUsed ? scoreCards(rows, sets, q, false) : null;
  const pick = plain && plain.best >= 3 && plain.best > withSet.best ? plain : withSet;
  return { hits: pick.scored.slice(0, limit).map(({ r }) => ({ set: r[0], s: r[1], n: r[2], no: r[3], v: r[4], id: r[6] })), total: pick.scored.length };
}

function scoreCards(rows: readonly SearchRow[], sets: ReadonlyMap<string, { name: string; abbr: string | null }>, q: string, useSet: boolean): { scored: { r: SearchRow; score: number }[]; best: number; setUsed: boolean } {
  let words = q.split(" ").filter(Boolean);
  // A number: "#101", "101/281", or a bare token with a digit that is not part of the name.
  let num: string | null = null;
  const numIdx = words.findIndex((w) => /^#?\d+[a-z]?(?:\/\d+)?$/.test(w) || /^#\w+$/.test(w));
  if (numIdx >= 0) {
    num = words[numIdx].replace(/^#/, "").replace(/\/\d+$/, "");
    words = words.filter((_, i) => i !== numIdx);
  }
  // A set: an abbreviation token ("fdn"), or set-name words when they follow a number query.
  const abbrToSet = new Map<string, string>();
  for (const [slug, s] of sets) if (s.abbr) abbrToSet.set(s.abbr.toLowerCase(), slug);
  let set: string | null = null;
  const setIdx = useSet ? words.findIndex((w) => abbrToSet.has(w)) : -1;
  if (setIdx >= 0) {
    set = abbrToSet.get(words[setIdx])!;
    words = words.filter((_, i) => i !== setIdx);
  }
  const name = words.join(" ");
  const scored: { r: SearchRow; score: number }[] = [];
  for (const r of rows) {
    if (set && r[0] !== set) continue;
    if (num && normalise(r[3]) !== num) continue;
    const n = normalise(r[2]);
    let score: number;
    if (!name) {
      if (!set && !num) continue;
      score = 3;
    } else if (n === name) score = 4;
    else if (n.startsWith(name)) score = 3;
    else if (words.every((w) => n.includes(w))) score = (n.split(" ").some((t) => t.startsWith(words[0])) ? 2 : 1);
    else if (!set && !num && words.length > 1) {
      // The last words may name the set: "sheoldred dominaria united".
      const setWords = words.slice(1);
      const nameWord = words[0];
      const s = sets.get(r[0]);
      if (!s || !n.includes(nameWord) || !setWords.every((w) => normalise(s.name).includes(w))) continue;
      score = 1.5;
    } else continue;
    scored.push({ r, score });
  }
  scored.sort((a, b) => b.score - a.score || b.r[4] - a.r[4] || a.r[2].localeCompare(b.r[2]));
  return { scored, best: scored[0]?.score ?? 0, setUsed: set != null };
}

// ─── Reading the files (server only) ───────────────────────────────────────────

const dir = () => process.env.MTG_CARDS_DIR || path.join(process.cwd(), CARDS_DIR);
const memo = new Map<string, unknown>();
function read<T>(file: string, fallback: T): T {
  if (memo.has(file)) return memo.get(file) as T;
  let v: T = fallback;
  try {
    v = JSON.parse(fs.readFileSync(path.join(dir(), file), "utf8")) as T;
  } catch {
    // Missing or unreadable: the section shows nothing rather than an error.
  }
  memo.set(file, v);
  return v;
}

export function readSets(): SetsFile {
  return read<SetsFile>("sets.json", { generatedAt: "", source: "", sets: [] });
}
export function readTop(): TopFile {
  return read<TopFile>("top.json", { hub: [], bySealed: {} });
}
export function cardsLive(): boolean {
  return readTop().hub.length > 0;
}
export function setBySlug(slug: string): CardSet | null {
  return readSets().sets.find((s) => s.slug === slug) ?? null;
}
export function readSet(slug: string): CardRow[] {
  if (!/^[a-z0-9-]+$/.test(slug)) return [];
  return read<SetFile>(`sets/${slug}.json`, { slug, cards: [] }).cards;
}
export function readSearch(): SearchRow[] {
  return read<SearchRow[]>("search.json", []);
}
/** For tests: forget what was read. */
export function resetCardsCache(): void {
  memo.clear();
}
