// Card prices (2026-11-17, DECISIONS.md "Card prices: the most valuable cards of each set").
//
// The site is sealed-first. This adds the MOST VALUABLE single cards of the sets it sells sealed for, one page per card at
// /card-prices/<set>/<card>, priced by TCGplayer's market price (US$, its recent sales), with a "Check on eBay" search row first and
// the TCGplayer row second. No store prices, no eBay API calls, no database: scripts/card-import.ts reads TCGplayer's public price
// files (as mirrored daily by TCGCSV) in GitHub Actions and commits data/cards/mtg-cards.json; pages read that one file.
//
// Why capped and gated: the old singles site priced 99,079 products and Google indexed its homepage only (DECISIONS.md, 2026-10-19).
// So the list starts at START_CARDS, grows by at most DAILY_GROWTH a day, most valuable first, to CEILING, and only cards worth
// MIN_VALUE_CENTS or more are added. A card keeps its page for good once it has one (a URL never 404s): when its value falls under
// the gate it stays, noindex and out of the sitemap, until it climbs back.
//
// Pure functions first (selection, slugs, copy), pinned by tests/cards.test.ts; the file reader at the bottom.
import fs from "node:fs";
import path from "node:path";

export const START_CARDS = 1000;
export const DAILY_GROWTH = 100;
export const CEILING = 5000;
/** US$5: under it, a TCGplayer sale earns a few cents and the page is thin. */
export const MIN_VALUE_CENTS = 500;

export const CARDS_FILE = path.join("data", "cards", "mtg-cards.json");

/** One card as data/cards/mtg-cards.json holds it. Prices are US cents, TCGplayer's market price per printing finish. */
export interface CardRow {
  /** TCGplayer product id: the identity. */
  id: number;
  /** The card's slug inside its set: frozen once given (selectCards keeps the previous one). */
  slug: string;
  name: string;
  /** The collector number as TCGplayer prints it ("123", "123a", "T4"). */
  number: string;
  rarity: string | null;
  /** Scryfall-style set code, a key of SET_BY_CODE (lib/sets.ts). */
  set: string;
  imageUrl: string | null;
  /** TCGplayer's product page (plain; tagged at render). */
  url: string;
  normal: number | null;
  foil: number | null;
  etched: number | null;
  /** The day it was first given a page (YYYY-MM-DD). */
  since: string;
}

export interface CardsFile {
  generatedAt: string;
  source: string;
  cards: CardRow[];
}

/** A card as the import reads it today, before selection. */
export type CardCandidate = Omit<CardRow, "slug" | "since">;

/** The card's headline value: the highest market price among its finishes (null when TCGplayer has none). */
export function cardValue(c: Pick<CardRow, "normal" | "foil" | "etched">): number | null {
  const v = [c.normal, c.foil, c.etched].filter((x): x is number => typeof x === "number" && x > 0);
  return v.length ? Math.max(...v) : null;
}

/** Indexed (and in the sitemap) only at or over the value gate. */
export function cardIndexable(c: Pick<CardRow, "normal" | "foil" | "etched">): boolean {
  return (cardValue(c) ?? 0) >= MIN_VALUE_CENTS;
}

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** "<name>-<number>", the number kept so two printings of one card never share a URL; the id breaks any remaining tie. */
export function cardSlug(name: string, number: string, taken: Set<string>, id: number): string {
  const base = [slugify(name), slugify(number)].filter(Boolean).join("-") || String(id);
  return taken.has(base) ? `${base}-${id}` : base;
}

/** How many cards the list may hold today: START_CARDS on the first run, then DAILY_GROWTH more a day, never over CEILING. */
export function targetSize(previous: number): number {
  return Math.min(CEILING, previous === 0 ? START_CARDS : Math.max(START_CARDS, previous + DAILY_GROWTH));
}

/**
 * Today's list. Every card that already has a page keeps it (same slug, same `since`) while TCGplayer still lists it, with today's
 * prices; then new cards at or over the value gate, most valuable first, until targetSize. A card TCGplayer stopped listing drops
 * out, and its URL redirects to its set (the page route).
 */
export function selectCards(previous: readonly CardRow[], today: readonly CardCandidate[], day: string): CardRow[] {
  const byId = new Map(today.map((c) => [c.id, c]));
  const out: CardRow[] = [];
  const taken = new Map<string, Set<string>>(); // set code → slugs in use
  const use = (set: string) => taken.get(set) ?? taken.set(set, new Set()).get(set)!;
  for (const p of previous) {
    const now = byId.get(p.id);
    if (!now || use(now.set).has(p.slug)) continue;
    use(now.set).add(p.slug);
    out.push({ ...now, slug: p.slug, since: p.since });
  }
  const have = new Set(out.map((c) => c.id));
  const room = targetSize(previous.length) - out.length;
  const fresh = today
    .filter((c) => !have.has(c.id) && (cardValue(c) ?? 0) >= MIN_VALUE_CENTS)
    .sort((a, b) => (cardValue(b) ?? 0) - (cardValue(a) ?? 0) || a.id - b.id)
    .slice(0, Math.max(0, room));
  for (const c of fresh) {
    const slug = cardSlug(c.name, c.number, use(c.set), c.id);
    use(c.set).add(slug);
    out.push({ ...c, slug, since: day });
  }
  return out;
}

// ─── What the import keeps from TCGCSV ─────────────────────────────────────────

export interface TcgcsvCardProduct {
  productId: number;
  name: string;
  imageUrl?: string;
  url: string;
  extendedData?: { name: string; value: string }[];
}
export interface TcgcsvCardPrice {
  productId: number;
  marketPrice: number | null;
  subTypeName: string;
}

const ext = (p: TcgcsvCardProduct, key: string) => p.extendedData?.find((e) => e.name === key)?.value?.trim() || null;
const cents = (usd: number | null | undefined) => (typeof usd === "number" && usd > 0 ? Math.round(usd * 100) : null);

/**
 * The cards of one TCGplayer group: products with a collector number (sealed products have none), never a token, an emblem or an
 * art card, each with its market price per finish. A card with no market price at all is left out (the headline price is
 * TCGplayer's market price only, never a seller's ask).
 */
export function cardsOfGroup(set: string, products: readonly TcgcsvCardProduct[], prices: readonly TcgcsvCardPrice[]): CardCandidate[] {
  const byId = new Map<number, { normal: number | null; foil: number | null; etched: number | null }>();
  for (const pr of prices) {
    const row = byId.get(pr.productId) ?? { normal: null, foil: null, etched: null };
    const v = cents(pr.marketPrice);
    const t = pr.subTypeName.toLowerCase();
    if (t === "normal") row.normal = v;
    else if (t === "foil") row.foil = v;
    else if (t.includes("etched")) row.etched = v;
    byId.set(pr.productId, row);
  }
  const out: CardCandidate[] = [];
  for (const p of products) {
    const number = ext(p, "Number");
    if (!number) continue;
    const rarity = ext(p, "Rarity");
    if (rarity === "T" || /\b(?:token|emblem|art card|art series|checklist|substitute card)\b/i.test(p.name)) continue;
    const pr = byId.get(p.productId);
    if (!pr || cardValue(pr) == null) continue;
    out.push({
      id: p.productId,
      name: p.name,
      number,
      rarity,
      set,
      imageUrl: p.imageUrl || null,
      url: p.url,
      ...pr,
    });
  }
  return out;
}

// ─── Copy ─────────────────────────────────────────────────────────────────────

const RARITY: Record<string, string> = { C: "Common", U: "Uncommon", R: "Rare", M: "Mythic Rare", S: "Special", L: "Land", P: "Promo" };
export function rarityName(r: string | null): string | null {
  return r ? RARITY[r] ?? r : null;
}

export function usd(cents: number): string {
  return `US$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The page title, at most 60 characters with the site's " | MTG Compare" suffix counted: the card's name, its set code and number
 * (what a collector types to find one printing), then "Price". The name is never cut; the extras go first.
 */
export function cardTitle(c: Pick<CardRow, "name" | "number" | "set">, setName: string): string {
  const MAX = 60 - " | MTG Compare".length;
  const code = c.set.toUpperCase();
  const candidates = [`${c.name} (${setName} #${c.number}) Price`, `${c.name} (${code} #${c.number}) Price`, `${c.name} ${code} #${c.number} Price`, `${c.name} Price`, c.name];
  return candidates.find((t) => t.length <= MAX) ?? c.name;
}

export function cardImage(url: string | null, size: 400 | 1000 = 400): string | null {
  if (!url) return null;
  return url.replace(/_(?:\d+w|in_\d+x\d+)\.jpg$/, size === 1000 ? "_in_1000x1000.jpg" : "_400w.jpg");
}

export const cardPath = (setSlug: string, c: Pick<CardRow, "slug">) => `/card-prices/${setSlug}/${c.slug}`;
export const CARDS_HUB = "/card-prices";

// ─── The file ─────────────────────────────────────────────────────────────────

let memo: { at: number; rows: CardRow[]; generatedAt: string | null } | null = null;

/** Every card with a page, from the committed file (empty when it is missing or unreadable: the section is then off). */
export function readCards(): { rows: CardRow[]; generatedAt: string | null } {
  if (memo) return memo;
  try {
    // MTG_CARDS_FILE: tests point the reader at a fixture (tests/fixtures/cards.json); nothing sets it in production.
    const f = JSON.parse(fs.readFileSync(process.env.MTG_CARDS_FILE || path.join(process.cwd(), CARDS_FILE), "utf8")) as CardsFile;
    memo = { at: Date.now(), rows: Array.isArray(f.cards) ? f.cards : [], generatedAt: f.generatedAt ?? null };
  } catch {
    memo = { at: Date.now(), rows: [], generatedAt: null };
  }
  return memo;
}

export function cardsLive(): boolean {
  return readCards().rows.length > 0;
}

/** A set's cards, most valuable first. */
export function cardsOfSet(code: string): CardRow[] {
  return readCards()
    .rows.filter((c) => c.set === code)
    .sort((a, b) => (cardValue(b) ?? 0) - (cardValue(a) ?? 0) || a.id - b.id);
}

export function cardBySlug(code: string, slug: string): CardRow | null {
  return readCards().rows.find((c) => c.set === code && c.slug === slug) ?? null;
}

/** The most valuable cards across every set. */
export function topCards(n: number): CardRow[] {
  return [...readCards().rows].sort((a, b) => (cardValue(b) ?? 0) - (cardValue(a) ?? 0) || a.id - b.id).slice(0, n);
}

/** Set codes with at least one indexable card, with their count, most cards first. */
export function setsWithCards(): { code: string; count: number }[] {
  const n = new Map<string, number>();
  for (const c of readCards().rows) if (cardIndexable(c)) n.set(c.set, (n.get(c.set) ?? 0) + 1);
  return [...n].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
}
