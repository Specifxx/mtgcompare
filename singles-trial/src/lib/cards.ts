// The rules of the card catalogue, pure (no fs): what a card is, its URL, its release to Google, search, history and movers.
// The engine is MTG Compare's card engine (Specifxx/mtgcompare, lib/cards.ts, 2026-11-17) made game-agnostic.
//
// Every card TCGplayer lists for a live game gets a page at /<game>/<set>/<card>, priced by TCGplayer's market price (US$, recent
// sales) per printing. No store prices, no eBay API, no database: scripts/import.ts reads TCGplayer's public price files (as TCGCSV
// mirrors them daily) in GitHub Actions and commits data/; pages read the files.
//
// GOOGLE, NOT THE CATALOGUE, IS RATIONED. Two earlier card sites put tens of thousands of card URLs in a sitemap and Google indexed
// almost none (DECISIONS.md). A card is INDEXED (indexable, in the sitemap) only once the import has released it (`ix`): cards
// worth MIN_INDEX_CENTS or more, most valuable first, INDEX_START per game on its first run, then INDEX_GROWTH more a day (the
// repository variable CARD_INDEX_GROWTH; 0 pauses it). Every other card page is live, linked and noindex.

export const MIN_INDEX_CENTS = 100;
export const INDEX_START = 1000;
export const INDEX_GROWTH = 250;

/** TCGplayer's market price in US cents per printing as TCGplayer names it ("Normal", "Holofoil", "1st Edition"…). */
export type Prices = Record<string, number>;

export interface CardRow {
  /** TCGplayer product id. */
  id: number;
  /** The card's slug inside its set, frozen once given. */
  s: string;
  n: string;
  /** Collector number as TCGplayer prints it ("004/102", "LOB-001"); "" when it has none. */
  no: string;
  /** Rarity as TCGplayer names it, or null. */
  r: string | null;
  p: Prices;
  /** Released to Google (indexable while worth MIN_INDEX_CENTS). */
  ix: 0 | 1;
  /** The day it got its page (YYYY-MM-DD). */
  since: string;
}

export interface CardSet {
  slug: string;
  name: string;
  abbr: string | null;
  groupId: number;
  released: string | null;
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
/** search.json: [setSlug, cardSlug, name, number, valueCents|0, indexable 0|1, TCGplayer id]. */
export type SearchRow = [string, string, string, string, number, 0 | 1, number];
export interface CardLite {
  set: string;
  s: string;
  n: string;
  no: string;
  r: string | null;
  id: number;
  v: number;
}
export interface Mover extends CardLite {
  /** Value `days` ago, in cents. */
  was: number;
  days: number;
}
export interface TopFile {
  top: CardLite[];
  up: Mover[];
  down: Mover[];
}

// ─── Value, slugs, order ───────────────────────────────────────────────────────

export function cardValue(p: Prices): number | null {
  const v = Object.values(p).filter((x) => typeof x === "number" && x > 0);
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
/** Collector-number order: 2 before 10, 10 before 10a, letters-first numbers last. */
export function numberOrder(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  const fa = Number.isFinite(na);
  const fb = Number.isFinite(nb);
  if (fa && fb && na !== nb) return na - nb;
  if (fa !== fb) return fa ? -1 : 1;
  return a.localeCompare(b, "en", { numeric: true });
}

export interface CardCandidate {
  id: number;
  n: string;
  no: string;
  r: string | null;
  p: Prices;
}

/** One set's cards today: a card keeps the slug and first day it had; a new card gets a fresh slug. `ix` is carried over. */
export function mergeSet(previous: readonly CardRow[], today: readonly CardCandidate[], day: string): CardRow[] {
  const prev = new Map(previous.map((c) => [c.id, c]));
  const taken = new Set<string>();
  const out: CardRow[] = [];
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

/**
 * Today's release to Google for ONE game, in place: a released card stays released while it is worth MIN_INDEX_CENTS; then the most
 * valuable unreleased cards at or over the gate, up to `growth` (enough to reach INDEX_START while fewer are released).
 */
export function releaseForIndexing(all: CardRow[], growth: number): number {
  for (const c of all) if (c.ix && (cardValue(c.p) ?? 0) < MIN_INDEX_CENTS) c.ix = 0;
  const released = all.filter((c) => c.ix).length;
  const room = growth <= 0 ? 0 : released < INDEX_START ? Math.max(INDEX_START - released, growth) : growth;
  const next = all
    .filter((c) => !c.ix && (cardValue(c.p) ?? 0) >= MIN_INDEX_CENTS)
    .sort((a, b) => (cardValue(b.p) ?? 0) - (cardValue(a.p) ?? 0) || a.id - b.id)
    .slice(0, room);
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
export interface TcgcsvProduct {
  productId: number;
  name: string;
  extendedData?: { name: string; value: string }[];
}
export interface TcgcsvPrice {
  productId: number;
  marketPrice: number | null;
  subTypeName: string;
}

const NOT_A_CARD = /\b(?:token|emblem|art card|checklist|substitute card|code card|energy pack|booster|box|bundle|deck|tin|collection|case|display|blister|sleeves?|playmat|binder|portfolio)\b/i;
const ext = (p: TcgcsvProduct, key: string) => p.extendedData?.find((e) => e.name === key)?.value?.trim() || null;
const cents = (usd: number | null | undefined) => (typeof usd === "number" && usd > 0 ? Math.round(usd * 100) : null);

/**
 * The cards of one TCGplayer group. A card has a collector number or a rarity (sealed product has neither). A product with
 * neither is never a card; a product with a rarity but no number is a card unless its name says it is something else
 * (a numbered card named "Deck Box Dragon" stays: the name rule applies only without a number). Tokens and code cards are out.
 */
export function cardsOfGroup(products: readonly TcgcsvProduct[], prices: readonly TcgcsvPrice[]): CardCandidate[] {
  const byId = new Map<number, Prices>();
  for (const pr of prices) {
    const v = cents(pr.marketPrice);
    if (v == null) continue;
    const row = byId.get(pr.productId) ?? {};
    row[pr.subTypeName?.trim() || "Normal"] = v;
    byId.set(pr.productId, row);
  }
  const out: CardCandidate[] = [];
  for (const p of products) {
    const number = ext(p, "Number");
    const rarity = ext(p, "Rarity");
    if (!number && !rarity) continue;
    if (rarity && /^(?:t|token|code card)$/i.test(rarity)) continue;
    if (/\b(?:token|code card)\b/i.test(p.name)) continue;
    if (!number && NOT_A_CARD.test(p.name)) continue;
    out.push({ id: p.productId, n: cleanName(p.name, number), no: number ?? "", r: rarity && !/^unconfirmed$/i.test(rarity) ? rarity : null, p: byId.get(p.productId) ?? {} });
  }
  return out;
}

/**
 * TCGplayer prints many names as "Name - 70/106 (Cosmos Holo)": the number is its own field here, so it leaves the name, and only
 * when it IS this card's number ("Basic Fire Energy - Armarouge 10" and a name whose number disagrees with the field stay whole).
 */
export function cleanName(name: string, number: string | null): string {
  const n = name.trim();
  if (!number) return n;
  const m = /\s+-\s+(#?[A-Za-z]{0,4}\d+[a-z]?)(?:\/[A-Za-z]{0,4}\d+[a-z]?)?(?=\s|\(|\[|$)/.exec(n);
  if (!m || numberKey(m[1]) !== numberKey(number)) return n;
  return (n.slice(0, m.index) + " " + n.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
}

/** Groups that hold no cards of their own. */
export function skipGroup(g: Pick<TcgcsvGroup, "name">): boolean {
  return /\bart series\b|\btokens?\b|\bsubstitute cards?\b|\bmemorabilia\b|\bsupplies\b|\bsleeves\b/i.test(g.name);
}

// ─── Copy ─────────────────────────────────────────────────────────────────────

/** The page title, at most 60 characters with the brand: name, set and number (what a collector types), then "Price". */
export function cardTitle(c: { n: string; no: string }, set: { name: string; abbr: string | null }, brand: string): string {
  const MAX = 60 - ` | ${brand}`.length;
  const num = c.no ? ` #${c.no}` : "";
  const candidates = [
    `${c.n} (${set.name}${num}) Price`,
    set.abbr ? `${c.n} (${set.abbr}${num}) Price` : null,
    `${c.n}${num} Price`,
    `${c.n} Price`,
    c.n,
  ].filter((t): t is string => !!t);
  return candidates.find((t) => t.length <= MAX) ?? c.n;
}
export function tcgplayerCardUrl(id: number): string {
  return `https://www.tcgplayer.com/product/${id}`;
}

// ─── Search ───────────────────────────────────────────────────────────────────

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
/** The part of a collector number people type: "004/102" → "4", "LOB-EN001" → "en001", "TG01/TG30" → "tg1". */
export function numberKey(no: string): string {
  const last = normalise(no).split("/")[0].split(" ").filter(Boolean).pop() ?? "";
  return last.replace(/^#/, "").replace(/^([a-z]*)0+(?=\d)/, "$1");
}
const NUM_TOKEN = /^#?[a-z]{0,5}\d+[a-z]?(?:\/[a-z]{0,5}\d+)?$/;

export interface SearchHit {
  set: string;
  s: string;
  n: string;
  no: string;
  v: number;
  id: number;
}
type SetNames = ReadonlyMap<string, { name: string; abbr: string | null }>;

/**
 * Cards for a query: a card name (all words, any order; whole-name and prefix matches first), optionally with a set (its
 * abbreviation or words of its name) and a collector number ("4", "#4", "004/102", "LOB-001"). A token can be read as a set code
 * or a number, or as part of the name ("Porygon2", "The One Ring"): every reading is tried and the best name match wins.
 */
export function searchCards(rows: readonly SearchRow[], sets: SetNames, query: string, limit = 12): { hits: SearchHit[]; total: number } {
  const q = normalise(query);
  if (q.length < 2) return { hits: [], total: 0 };
  const readings = [score(rows, sets, q, true, true), score(rows, sets, q, false, true), score(rows, sets, q, true, false), score(rows, sets, q, false, false)];
  let pick = readings[0];
  for (const r of readings.slice(1)) {
    // A plainer reading wins only when it finds a card by its name (whole or from the start) and the richer one does no better.
    if ((r.best >= 3 && r.best > pick.best) || (!pick.scored.length && r.scored.length)) pick = r;
  }
  return { hits: pick.scored.slice(0, limit).map(({ r }) => ({ set: r[0], s: r[1], n: r[2], no: r[3], v: r[4], id: r[6] })), total: pick.scored.length };
}

function score(rows: readonly SearchRow[], sets: SetNames, q: string, useSet: boolean, useNum: boolean) {
  let words = q.split(" ").filter(Boolean);
  let num: string | null = null;
  if (useNum) {
    // The last number-shaped token: "pikachu 58", "lob 001", "#tg01".
    let idx = -1;
    words.forEach((w, i) => {
      if (NUM_TOKEN.test(w)) idx = i;
    });
    if (idx >= 0) {
      num = numberKey(words[idx]);
      words = words.filter((_, i) => i !== idx);
    }
  }
  // TCGplayer gives several sets one abbreviation ("PR" for 19 Pokémon promo sets): a code names all of them.
  const abbrToSets = new Map<string, Set<string>>();
  for (const [slug, s] of sets) {
    if (!s.abbr) continue;
    const k = s.abbr.toLowerCase();
    (abbrToSets.get(k) ?? abbrToSets.set(k, new Set()).get(k)!).add(slug);
  }
  let set: Set<string> | null = null;
  const setIdx = useSet ? words.findIndex((w) => abbrToSets.has(w)) : -1;
  if (setIdx >= 0) {
    set = abbrToSets.get(words[setIdx])!;
    words = words.filter((_, i) => i !== setIdx);
  }
  const name = words.join(" ");
  const scored: { r: SearchRow; score: number }[] = [];
  for (const r of rows) {
    if (set && !set.has(r[0])) continue;
    if (num && numberKey(r[3]) !== num) continue;
    const n = normalise(r[2]);
    let sc: number;
    if (!name) {
      if (!set && !num) continue;
      sc = set && num ? 3 : 1;
    } else if (n === name) sc = 4;
    else if (n.startsWith(name)) sc = 3;
    else if (words.every((w) => n.includes(w))) sc = n.split(" ").some((t) => t.startsWith(words[0])) ? 2 : 1;
    else if (!set && words.length > 1) {
      // The last words may name the set: "charizard base set".
      const s = sets.get(r[0]);
      if (!s || !n.includes(words[0]) || !words.slice(1).every((w) => normalise(s.name).includes(w))) continue;
      sc = 1.5;
    } else continue;
    scored.push({ r, score: sc });
  }
  scored.sort((a, b) => b.score - a.score || b.r[4] - a.r[4] || a.r[2].localeCompare(b.r[2]));
  return { scored, best: scored[0]?.score ?? 0 };
}

// ─── Price history and movers ──────────────────────────────────────────────────
//
// data/history/<game>/<set>.json: { "<TCGplayer id>": [[day, cents], …] }, the card's headline value on the days it moved. `day` is
// days since HISTORY_EPOCH. Only cards worth HISTORY_MIN_CENTS or more are followed, and a point is added only when the value
// moved 2% (and at least 5 cents) from the last point, so a quiet card costs one point, not one a day.

export const HISTORY_EPOCH = "2026-01-01";
export const HISTORY_MIN_CENTS = 100;
export const HISTORY_MAX_POINTS = 400;
export type Point = [number, number];
export type HistoryFile = Record<string, Point[]>;

export function dayIndex(day: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${HISTORY_EPOCH}T00:00:00Z`)) / 86_400_000);
}
export function dayOfIndex(i: number): string {
  return new Date(Date.parse(`${HISTORY_EPOCH}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
}

/** Today's points added to one set's history. Cards no longer listed keep their history. */
export function addHistory(prev: HistoryFile, cards: readonly CardRow[], day: string): HistoryFile {
  const d = dayIndex(day);
  const out: HistoryFile = { ...prev };
  for (const c of cards) {
    const v = cardValue(c.p);
    const key = String(c.id);
    const pts = out[key];
    if (v == null || (v < HISTORY_MIN_CENTS && !pts)) continue;
    if (!pts) {
      out[key] = [[d, v]];
      continue;
    }
    const [ld, lv] = pts[pts.length - 1];
    if (ld >= d) continue;
    if (Math.abs(v - lv) >= Math.max(5, lv * 0.02)) out[key] = [...pts, [d, v] as Point].slice(-HISTORY_MAX_POINTS);
  }
  return out;
}

/** The value on or before `d`, or null when the history starts later. */
export function valueAt(pts: readonly Point[], d: number): number | null {
  let v: number | null = null;
  for (const [pd, pv] of pts) {
    if (pd > d) break;
    v = pv;
  }
  return v;
}

export const MOVER_MIN_CENTS = 500;
export const MOVER_DAYS = 7;

/**
 * The week's biggest rises and falls by percent among cards worth MOVER_MIN_CENTS now or then. A card needs a point at least a
 * day old; the window is MOVER_DAYS, or as far back as the history goes while it is younger (`days` says which).
 */
export function movers(cards: readonly (CardLite & { pts: readonly Point[] })[], day: string, limit = 30): { up: Mover[]; down: Mover[] } {
  const d = dayIndex(day);
  const rows: (Mover & { pct: number })[] = [];
  for (const c of cards) {
    if (!c.pts.length) continue;
    const first = c.pts[0][0];
    const days = Math.min(MOVER_DAYS, d - first);
    if (days < 1) continue;
    const was = valueAt(c.pts, d - days);
    if (was == null || was <= 0 || c.v <= 0 || Math.max(was, c.v) < MOVER_MIN_CENTS || was === c.v) continue;
    const { pts: _pts, ...lite } = c;
    rows.push({ ...lite, was, days, pct: (c.v - was) / was });
  }
  const strip = ({ pct: _pct, ...m }: Mover & { pct: number }): Mover => m;
  const up = rows.filter((r) => r.pct > 0).sort((a, b) => b.pct - a.pct || b.v - a.v).slice(0, limit).map(strip);
  const down = rows.filter((r) => r.pct < 0).sort((a, b) => a.pct - b.pct || b.was - a.was).slice(0, limit).map(strip);
  return { up, down };
}
