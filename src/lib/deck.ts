// The One Piece decklist parser, resolver and pricer behind /deck, the
// /api/deck/price route and the Buy List Planner's "paste a list" (RiftCompare's
// lib/deck.ts, adapted to One Piece). Pure: no database, no Next imports, so
// the /deck client shares its line formatting and tests/deck.test.ts pins it.
//
// Lines it reads (every common One Piece export, and hand-typed lists):
//   4xOP01-016                 ← the deck builders' export (egman, OPTCGSim…)
//   4 x OP01-016  /  4 OP01-016  /  OP01-016 x4  /  OP01-016 (one copy)
//   4 Nami (OP01-016)          ← name plus number: the number decides
//   4 Nami                     ← name only: matched by name, flagged as a guess
//   Leader: OP01-001  /  1 Leader Roronoa Zoro (OP01-001)
//   4xOP01-120_p1              ← a "_p1"/"_p2" suffix: the 1st/2nd parallel
//   4xOP01-120 #512345         ← an exact printing (TCGplayer product id), what
//                                 /deck writes when you switch a line's printing
// Section headers ("Leader", "Characters (32)", "Events", "DON!!", "Total: 51")
// and comments ("//", "#") are skipped, never priced as phantom cards.

export interface DeckLine {
  raw: string;
  qty: number;
  /** "OP01-016", normalised; absent for a name-only line. */
  number?: string;
  /** The words left once quantity and number are taken out ("Nami"). */
  name: string;
  /** "_p1" → 1: the Nth parallel/alternate printing of the number. */
  parallel?: number;
  /** "#512345": an exact printing. */
  productId?: number;
  /** The line sat under a "Leader" header or said "Leader:". */
  leader: boolean;
}

// RiftCompare's caps: 200 card lines (what /deck, Best Basket and a deck watch
// price) and 99 copies a line (a bulk list, not just a deck).
export const DECK_LINE_CAP = 200;
export const QTY_CAP = 99;

// A card number anywhere in a line: OP01-016, ST-01-001 style typos, EB01-001,
// PRB01-001, P-001, OP01016. Group 1 the prefix, 2 the set digits, 3 the card.
const NUMBER = /\b(OP|ST|EB|PRB)\s?-?\s?(\d{2})\s?-?\s?(\d{3})(?!\d)/i;
const PROMO = /\bP\s?-\s?(\d{3})(?!\d)/i;

const HEADER_WORDS =
  /^(?:leaders?|characters?|events?|stages?|don!*|don!!\s*cards?|main(?:\s*deck)?|deck(?:\s*list)?|side\s*(?:deck|board)|sideboard|total|cards?|counters?)$/i;

/** "Characters (32)", "Events:", "Total: 51 cards", "DON!! x10" — not a card line. */
export function isSectionHeader(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/:\s*$/.test(t)) return true;
  if (/^total\b/i.test(t)) return true;
  if (/^don!*\s*(?:cards?)?\s*[x×]?\s*\d*$/i.test(t)) return true;
  const core = t.replace(/\s*[:(\[\-–—]?\s*[x×]?\d+\s*(?:cards?)?\s*[)\]]?\s*$/i, "").trim();
  return HEADER_WORDS.test(core);
}

/** "op01016" / "OP-01-016" → "OP01-016"; "p-7" is not a number. */
export function normalizeNumber(text: string): string | null {
  const m = NUMBER.exec(text);
  if (m) return `${m[1].toUpperCase()}${m[2]}-${m[3]}`;
  const p = PROMO.exec(text);
  return p ? `P-${p[1]}` : null;
}

export function parseDeckList(text: string): DeckLine[] {
  const out: DeckLine[] = [];
  let inLeader = false;
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("//") || /^#(?!\d)/.test(line)) continue;
    if (out.length >= DECK_LINE_CAP) break;

    // "Leader: OP01-001" — a header and a card on one line.
    let leader = false;
    const inline = /^leader\s*[:\-–]\s*(.+)$/i.exec(line);
    if (inline) {
      leader = true;
      line = inline[1].trim();
    } else if (isSectionHeader(line)) {
      inLeader = /^leaders?\b/i.test(line);
      continue;
    }

    let qty = 1;
    let rest = line;
    const lead = /^(\d{1,3})\s*[xX×]?\s*(.+)$/.exec(rest);
    // "4xOP01-016" and "4 Nami"; but not "01-016" eaten as a quantity — a
    // leading number glued to a set prefix is part of the card number.
    if (lead && !/^\d{2}-\d{3}/.test(rest)) {
      qty = parseInt(lead[1], 10);
      rest = lead[2].trim();
    } else {
      const trail = /^(.*\S)\s*[xX×]\s*(\d{1,3})$/.exec(rest);
      if (trail) {
        qty = parseInt(trail[2], 10);
        rest = trail[1].trim();
      }
    }
    if (/^leader\b/i.test(rest)) {
      leader = true;
      rest = rest.replace(/^leader\s*[:\-–]?\s*/i, "");
    }
    qty = Math.min(QTY_CAP, Math.max(1, qty || 1));

    let productId: number | undefined;
    const pin = /#(\d{1,9})\b/.exec(rest);
    if (pin) {
      productId = parseInt(pin[1], 10);
      rest = rest.replace(pin[0], " ");
    }
    let parallel: number | undefined;
    const par = /_p(\d)\b/i.exec(rest);
    if (par) {
      parallel = parseInt(par[1], 10);
      rest = rest.replace(par[0], " ");
    }

    const number = normalizeNumber(rest) ?? undefined;
    if (number) {
      const m = NUMBER.exec(rest) ?? PROMO.exec(rest);
      if (m) rest = rest.replace(m[0], " ");
    }
    const name = rest
      .replace(/[\[(]\s*[\])]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s\-–·|:,]+|[\s\-–·|:,]+$/g, "")
      .trim();
    if (!number && !productId && (!name || isSectionHeader(name))) continue;
    out.push({ raw: rawLine.trim(), qty, number, name, parallel, productId, leader: leader || inLeader });
    inLeader = false; // a Leader section holds one card
  }
  return out;
}

// ── Resolving lines to printings ─────────────────────────────────────────────

/** The few card fields resolution needs (data.ts CardLite satisfies it). */
export interface ResolvableCard {
  id: number;
  name: string;
  number: string | null;
  printing: string;
  variant: string | null;
  cardType: string | null;
}

export type MatchKind = "pinned" | "number" | "name" | "none";

export interface ResolvedLine<C> {
  line: DeckLine;
  card: C | null;
  /** Every printing the line could mean, the chosen one included (switcher). */
  options: C[];
  how: MatchKind;
  /** Matched by name only and other card numbers share that name. */
  ambiguous: boolean;
  /**
   * Matched only because the card's name CONTAINS the line's words (RiftCompare's
   * name-contains fallback: "Luffy" → Monkey.D.Luffy). A guess the page must
   * show as one ("guessed from …"), never count silently.
   */
  fuzzy: boolean;
}

export function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const PRINT_ORDER: Record<string, number> = { standard: 0, reprint: 1, alt: 2, foil: 3, sp: 4, manga: 5, treasure: 6, promo: 7, don: 8 };

/** Base printing first, then the other printings in a stable order (TCGplayer id). */
export function orderPrintings<C extends ResolvableCard>(cards: C[]): C[] {
  return [...cards].sort((a, b) => (PRINT_ORDER[a.printing] ?? 9) - (PRINT_ORDER[b.printing] ?? 9) || a.id - b.id);
}

/** The printing a bare number means: the standard print, else the first by id. */
export function basePrinting<C extends ResolvableCard>(cards: C[]): C | undefined {
  return orderPrintings(cards)[0];
}

/** "_p1" → the first parallel/alt printing of the number, by TCGplayer id. */
function nthParallel<C extends ResolvableCard>(cards: C[], n: number): C | undefined {
  const alts = cards.filter((c) => c.printing === "alt" || c.printing === "manga" || c.printing === "sp").sort((a, b) => a.id - b.id);
  return alts[n - 1];
}

export interface CardIndex<C> {
  byId: Map<number, C>;
  byNumber: Map<string, C[]>;
  byName: Map<string, C[]>;
}

export function indexCards<C extends ResolvableCard>(cards: C[]): CardIndex<C> {
  const byId = new Map<number, C>();
  const byNumber = new Map<string, C[]>();
  const byName = new Map<string, C[]>();
  for (const c of cards) {
    byId.set(c.id, c);
    if (c.printing === "don") continue; // DON!! cards are not deck cards
    if (c.number) (byNumber.get(c.number) ?? byNumber.set(c.number, []).get(c.number)!).push(c);
    const k = normName(c.name);
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(c);
  }
  return { byId, byNumber, byName };
}

/**
 * One line to a printing. An exact pin (#id) wins; then the card number (base
 * printing, or the "_pN" parallel); then the exact name — the base printing of
 * the number most printings share, flagged `ambiguous` when other numbers carry
 * the same name, so the page says it guessed. A Leader line prefers a Leader.
 */
export function resolveLine<C extends ResolvableCard>(line: DeckLine, idx: CardIndex<C>): ResolvedLine<C> {
  if (line.productId) {
    const c = idx.byId.get(line.productId);
    if (c && c.printing !== "don") {
      const options = c.number ? orderPrintings(idx.byNumber.get(c.number) ?? [c]) : [c];
      return { line, card: c, options, how: "pinned", ambiguous: false, fuzzy: false };
    }
  }
  if (line.number) {
    const prints = idx.byNumber.get(line.number) ?? [];
    if (prints.length) {
      const options = orderPrintings(prints);
      const card = (line.parallel ? nthParallel(prints, line.parallel) : undefined) ?? basePrinting(prints)!;
      return { line, card, options, how: "number", ambiguous: false, fuzzy: false };
    }
  }
  if (line.name) {
    const key = normName(line.name);
    let named = idx.byName.get(key) ?? [];
    let fuzzy = false;
    // No exact name: the name-contains fallback, bounded (a line of three or
    // more letters; the first 40 names that contain it), flagged fuzzy.
    if (!named.length && key.length >= 3) {
      const hits: C[] = [];
      let names = 0;
      for (const [k, cards] of idx.byName) {
        if (!k.includes(key)) continue;
        hits.push(...cards);
        if (++names >= 40) break;
      }
      named = hits;
      fuzzy = hits.length > 0;
    }
    if (line.leader && named.some((c) => c.cardType === "Leader")) named = named.filter((c) => c.cardType === "Leader");
    if (named.length) {
      const numbers = new Map<string, C[]>();
      for (const c of named) {
        const k = c.number ?? `#${c.id}`;
        (numbers.get(k) ?? numbers.set(k, []).get(k)!).push(c);
      }
      // The number with the most printings is usually the card people mean
      // (reprinted, alt-arted); ties go to the oldest (lowest TCGplayer id).
      const groups = [...numbers.values()].sort((a, b) => b.length - a.length || Math.min(...a.map((c) => c.id)) - Math.min(...b.map((c) => c.id)));
      const card = basePrinting(groups[0])!;
      const options = groups.flatMap((g) => orderPrintings(g)).slice(0, 40);
      return { line, card, options, how: "name", ambiguous: groups.length > 1, fuzzy };
    }
  }
  return { line, card: null, options: [], how: "none", ambiguous: false, fuzzy: false };
}

export function resolveDeck<C extends ResolvableCard>(lines: DeckLine[], idx: CardIndex<C>): ResolvedLine<C>[] {
  return lines.slice(0, DECK_LINE_CAP).map((l) => resolveLine(l, idx));
}

/**
 * One line of a list, round-trippable through parseDeckList: "4xOP01-016" for
 * the base printing, "4xOP01-120 #512345" for any other, "1xLeader OP01-001"
 * never (the Leader is just the Leader card's number).
 */
export function formatDeckLine(qty: number, card: Pick<ResolvableCard, "id" | "number">, pinned: boolean): string {
  if (!card.number) return `${qty}x #${card.id}`;
  return pinned ? `${qty}x${card.number} #${card.id}` : `${qty}x${card.number}`;
}

// ── Pricing ──────────────────────────────────────────────────────────────────

/** Merge repeated lines for the same printing ("2xOP01-016" twice = 4 copies). */
export function mergeLines<C extends ResolvableCard>(rows: ResolvedLine<C>[]): ResolvedLine<C>[] {
  const out: ResolvedLine<C>[] = [];
  const at = new Map<number, number>();
  for (const r of rows) {
    if (!r.card) {
      out.push(r);
      continue;
    }
    const i = at.get(r.card.id);
    if (i == null) {
      at.set(r.card.id, out.length);
      out.push({ ...r, line: { ...r.line } });
    } else {
      const prev = out[i];
      prev.line.qty = Math.min(QTY_CAP, prev.line.qty + r.line.qty);
      prev.line.leader ||= r.line.leader;
    }
  }
  return out;
}

export interface MarketTotal {
  /** Sum of qty × the cheapest in-stock listing, over the lines that have one. */
  cents: number;
  /** Copies with a listing in this market, and copies in all. */
  pricedQty: number;
  totalQty: number;
}

/** Per-market list totals from each card's cheapest listing (`low`). */
export function marketTotals<M extends string>(
  lines: { qty: number; low: Partial<Record<M, number | null>> }[],
  markets: readonly M[],
): Record<M, MarketTotal> {
  const out = {} as Record<M, MarketTotal>;
  for (const m of markets) {
    const t: MarketTotal = { cents: 0, pricedQty: 0, totalQty: 0 };
    for (const l of lines) {
      t.totalQty += l.qty;
      const p = l.low[m];
      if (p != null) {
        t.cents += p * l.qty;
        t.pricedQty += l.qty;
      }
    }
    out[m] = t;
  }
  return out;
}

/**
 * Each market's cheapest in-stock STORE listing (TCGplayer counts, eBay does
 * not) from a card's offers. The catalogue's low<M> also folds in eBay asks
 * (lib/import.ts), so pricing a deck from it could quote an eBay price beside
 * a link to a dearer store, and put an eBay ask into a "buy at the cheapest
 * store" total: eBay is never counted as a store (CLAUDE.md).
 */
export function storeLows<M extends string>(
  offers: { source: string; market: string; priceCents: number; inStock: boolean }[],
  markets: readonly M[],
): Record<M, number | null> {
  const out = Object.fromEntries(markets.map((m) => [m, null])) as Record<M, number | null>;
  for (const o of offers) {
    if (!o.inStock || o.source.startsWith("ebay") || !(markets as readonly string[]).includes(o.market)) continue;
    const m = o.market as M;
    const cur = out[m];
    if (cur == null || o.priceCents < cur) out[m] = o.priceCents;
  }
  return out;
}

export interface StoreOffer {
  source: string;
  priceCents: number;
  url: string;
  condition: string | null;
}

export interface SplitPick {
  key: string;
  qty: number;
  unitCents: number;
  url: string;
  condition: string | null;
}

export interface StoreGroup {
  source: string;
  picks: SplitPick[];
  totalCents: number;
  copies: number;
}

/**
 * "Buy each card where it is cheapest": the cheapest in-stock offer per line,
 * grouped by store, biggest basket first. Item prices only — stores' postage
 * is not modelled, and a store is assumed to have every copy asked for (stores
 * publish availability, not quantities), which the page says.
 */
export function splitByCheapestStore(lines: { key: string; qty: number; offers: StoreOffer[] }[]): { groups: StoreGroup[]; totalCents: number; missing: string[] } {
  const groups = new Map<string, StoreGroup>();
  const missing: string[] = [];
  for (const l of lines) {
    const best = [...l.offers].sort((a, b) => a.priceCents - b.priceCents || a.source.localeCompare(b.source))[0];
    if (!best) {
      missing.push(l.key);
      continue;
    }
    const g = groups.get(best.source) ?? groups.set(best.source, { source: best.source, picks: [], totalCents: 0, copies: 0 }).get(best.source)!;
    g.picks.push({ key: l.key, qty: l.qty, unitCents: best.priceCents, url: best.url, condition: best.condition });
    g.totalCents += best.priceCents * l.qty;
    g.copies += l.qty;
  }
  const list = [...groups.values()].sort((a, b) => b.copies - a.copies || b.totalCents - a.totalCents || a.source.localeCompare(b.source));
  return { groups: list, totalCents: list.reduce((s, g) => s + g.totalCents, 0), missing };
}

// ── Deck checks ──────────────────────────────────────────────────────────────

export interface DeckCheck {
  leaders: number;
  mainCards: number;
  /** Card numbers with more than four copies. */
  overLimit: string[];
}

/**
 * The tournament deck shape, as a hint and never a gate: one Leader, 50 cards
 * in the main deck, at most four copies of a card number. (A pasted "list" that
 * is not a deck simply shows the counts.)
 */
export function checkDeck(lines: { qty: number; number: string | null; isLeader: boolean }[]): DeckCheck {
  let leaders = 0;
  let mainCards = 0;
  const perNumber = new Map<string, number>();
  for (const l of lines) {
    if (l.isLeader) {
      leaders += l.qty;
      continue;
    }
    mainCards += l.qty;
    if (l.number) perNumber.set(l.number, (perNumber.get(l.number) ?? 0) + l.qty);
  }
  return { leaders, mainCards, overLimit: [...perNumber.entries()].filter(([, n]) => n > 4).map(([k]) => k).sort() };
}

export const DECK_SIZE = 50;
export const COPY_LIMIT = 4;

/**
 * ?list= ← list text, as UTF-8-safe base64: RiftCompare's encodeList, the one
 * encoding /deck, Best Basket, a published deck and the deck watch all share
 * (a list with accented or "!!" names survives the round trip). The caller
 * still URI-encodes it ("+", "/" and "=" are base64 characters).
 */
export function encodeList(text: string): string {
  const bytes = new TextEncoder().encode(text.trim().slice(0, 6000));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * The list a ?list= value carries: base64 (encodeList), or — for the plain
 * URI-encoded links wave 1 wrote (Leader pages, older shares) — the text
 * itself. Anything that is not clean base64 of valid UTF-8 is read as text.
 */
export function decodeList(code: string): string {
  const v = code.trim();
  if (v && v.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(v)) {
    try {
      const bin = atob(v);
      const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!/[\u0000-\u0008\u000e-\u001f]/.test(text)) return text.slice(0, 6000);
    } catch {
      // not base64 of UTF-8: a plain list
    }
  }
  return v.slice(0, 6000);
}

/** The ?list= query value for a list: base64, URI-encoded. */
export function encodeDeckParam(text: string): string {
  return encodeURIComponent(encodeList(text));
}
