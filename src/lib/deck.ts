// The Magic decklist parser and the pure half of the pricer behind /deck, /api/deck/price, Best Basket's "paste a list", the published decks and the deck watch.
// Pure and client-safe: no database, no Next imports, no data layer, so the /deck page shares its line formatting and tests/deck.test.ts pins it. The server half
// (lib/deck-price.ts) resolves the lines to printings through the loaders; the rules a deck is judged by live in lib/commander-rules.ts.
//
// Lines it reads (every common Magic export, and hand-typed lists):
//   4 Lightning Bolt                        ← MTGO, Arena without set codes, hand-typed
//   4x Lightning Bolt (M11) 149             ← Moxfield, Archidekt, Arena: a set code and a collector number pick the printing
//   1 Sol Ring (C21) 263 *F*                ← a foil copy (*F*; *E* for Foil Etched; "(foil)" and "(etched)" read the same)
//   Delver of Secrets // Insectile Aberration (ISD) 51    ← a double-faced or split card: the whole name, or just the front face
//   SB: 2 Negate                            ← MTGO's sideboard line; a blank line between two blocks is the sideboard too
//   Commander / Companion / Deck / Sideboard / Maybeboard   ← section headers, with or without a count or a colon
//   1x Atraxa, Praetors' Voice (cmm) 8 [Commander{top}] ^Have,#37d67a^     ← Archidekt's category and tag suffixes
//   4 Lightning Bolt (M11) 149 #35427       ← an exact printing (TCGplayer product id), what /deck writes when it can't say it by set and number
// Section headers, totals and comments ("//", "#") are skipped, never priced as phantom cards; a maybeboard is read and dropped.
import { CARD_FLAGS, fold, nkey, type Finish } from "./constants";
import type { DeckZone } from "./commander-rules";

export { checkDeck, firstError, isDeckFormat, DECK_FORMATS, COMMANDER_DECK_SIZE, type DeckReport, type DeckIssue, type DeckEntry, type DeckZone } from "./commander-rules";

export interface DeckLine {
  raw: string;
  qty: number;
  /** The words left once the quantity, the set and number, the finish marker and the suffixes are taken out ("Lightning Bolt"). */
  name: string;
  /** Lower-case Scryfall set code from "(M11)" or "[M11]". */
  set?: string;
  /** The collector number as typed ("149", "251★"); the lookup key is constants.nkey of it. */
  number?: string;
  /** 1 for *F* or "(foil)" and for *E*; absent when the line says nothing (Normal, or the only finish the product has). */
  finish?: 0 | 1;
  /** *E* or "(etched)": the Foil Etched product of the printing. */
  etched?: boolean;
  /** "#35427": an exact printing (a TCGplayer product id). */
  productId?: number;
  zone: DeckZone;
}

// The caps: 200 card lines (what /deck, Best Basket and a deck watch price: a 100-card Commander list fits twice over) and 99 copies a line (a bulk list, not just a deck).
export const DECK_LINE_CAP = 200;
export const QTY_CAP = 99;
/** A constructed deck's minimum and its copy limit (lib/commander-rules.ts holds every format's own rule). */
export const DECK_SIZE = 60;
export const COPY_LIMIT = 4;

// ── Headers ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const ZONE_HEADERS: readonly (readonly [RegExp, DeckZone])[] = [
  [/^commanders?$/i, "commander"],
  [/^companions?$/i, "companion"],
  [/^(?:deck|main|main\s*deck|main\s*board|maindeck|mainboard)$/i, "main"],
  [/^(?:side|side\s*board|side\s*deck|sideboard|sb)$/i, "side"],
  [/^(?:maybe|maybe\s*board|maybeboard|considering|tokens?|ideas|wishlist)$/i, "maybe"],
];
// Type groups some exporters print above their lines; they change no zone.
const NEUTRAL_HEADER = /^(?:artifacts?|battles?|creatures?|enchantments?|instants?|lands?|planeswalkers?|sorcer(?:y|ies)|spells?|other|nonlands?|kindred|tribal|mana\s*base|cards?|about)$/i;
const COUNT_TAIL = /\s*[:(\[\-–—]?\s*[x×]?\d+\s*(?:cards?)?\s*[)\]]?\s*$/i;

/** The zone a header line opens ("Sideboard (15)", "COMMANDER:"), "neutral" for a type group or a total, null for anything else. */
export function zoneHeaderOf(text: string): DeckZone | "neutral" | null {
  const t = text.trim();
  if (!t) return null;
  if (/^total\b/i.test(t)) return "neutral";
  const core = t.replace(/\s*:\s*$/, "").replace(COUNT_TAIL, "").replace(/\s*:\s*$/, "").trim();
  for (const [re, zone] of ZONE_HEADERS) if (re.test(core)) return zone;
  if (NEUTRAL_HEADER.test(core)) return "neutral";
  return null;
}

/** "Sideboard (15)", "Creatures:", "Total: 75 cards", "COMMANDER" — not a card line. */
export function isSectionHeader(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (zoneHeaderOf(t) !== null) return true;
  return /:\s*$/.test(t);
}

/** A collector number as the lookup key ("029/281" -> "29", "251★" -> "251", "A39" -> "a39"); null when there is none. */
export const normalizeNumber = (text: string): string | null => nkey(text);

// ── Parsing ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const CATEGORY_ZONES: readonly (readonly [RegExp, DeckZone])[] = [
  [/^commander/i, "commander"], [/^companion/i, "companion"], [/^(?:side|sb)/i, "side"], [/^(?:maybe|considering)/i, "maybe"], [/^(?:main|deck)/i, "main"],
];
const zoneOfCategory = (c: string): DeckZone | undefined => CATEGORY_ZONES.find(([re]) => re.test(c.trim()))?.[1];
const NUMBER_TOKEN = /^[A-Za-z0-9★†*\-/]{1,14}$/;

interface Parsed { qty: number; name: string; set?: string; number?: string; finish?: 0 | 1; etched?: boolean; productId?: number; zone?: DeckZone }

function parseCardText(input: string): Parsed | null {
  let rest = input.trim();
  let qty = 1, finish: 0 | 1 | undefined, etched = false, zone: DeckZone | undefined, set: string | undefined, number: string | undefined, productId: number | undefined;

  // "4 ", "4x ", "4 x ", "4xName" — but "4 Xenagos" is a quantity and a name
  const lead = /^(\d{1,3})(?:[xX×]\s*|\s+[xX×]\s+|\s+)(\S.*)$/.exec(rest);
  if (lead) {
    qty = parseInt(lead[1]!, 10);
    rest = lead[2]!.trim();
  } else {
    const trail = /^(.*\S)\s+[xX×]\s*(\d{1,3})$/.exec(rest);
    if (trail) {
      qty = parseInt(trail[2]!, 10);
      rest = trail[1]!.trim();
    }
  }

  // the exact printing a /deck line was switched to
  const pin = /(^|\s)#(\d{4,9})\b/.exec(rest);
  if (pin) {
    productId = parseInt(pin[2]!, 10);
    rest = (rest.slice(0, pin.index) + rest.slice(pin.index + pin[0].length)).trim();
  }

  // trailing decorations, last one first: Archidekt tags ^..^, *F* *E* *CMDR*, (foil) (etched), [Category] or [SET]
  for (let guard = 0; guard < 12; guard++) {
    let m: RegExpExecArray | null;
    if ((m = /\s*\^[^^]*\^\s*$/.exec(rest))) { rest = rest.slice(0, m.index); continue; }
    if ((m = /\s*\*(F|E|CMDR)\*\s*$/i.exec(rest))) {
      const k = m[1]!.toUpperCase();
      if (k === "CMDR") zone = "commander";
      else { finish = 1; if (k === "E") etched = true; }
      rest = rest.slice(0, m.index);
      continue;
    }
    if ((m = /\s*[(\[](foil etched|etched|foil|nonfoil|non-foil|normal)[)\]]\s*$/i.exec(rest))) {
      const k = m[1]!.toLowerCase();
      if (k.includes("etched")) { finish = 1; etched = true; } else if (k === "foil") finish = 1;
      rest = rest.slice(0, m.index);
      continue;
    }
    if ((m = /\s*\[([^\]]*)\]\s*$/.exec(rest))) {
      const c = m[1]!;
      if (/^[A-Z0-9]{2,6}$/.test(c) && !set && !zoneOfCategory(c)) set = c.toLowerCase();
      else for (const part of c.split(",")) zone ??= zoneOfCategory(part.replace(/\{[^}]*\}/g, ""));
      rest = rest.slice(0, m.index);
      continue;
    }
    break;
  }

  // "(M11) 149": a Scryfall set code in parentheses, then the collector number
  const sn = /^(.*?)\s*\(([A-Za-z0-9]{2,6})\)(?:\s+(\S+))?$/.exec(rest);
  if (sn && (!sn[3] || (NUMBER_TOKEN.test(sn[3]) && /\d/.test(sn[3])))) {
    rest = sn[1]!;
    set = sn[2]!.toLowerCase();
    number = sn[3]?.replace(/^#/, "");
  }

  const name = rest.replace(/\s+/g, " ").replace(/^[\s\-–·|:,]+|[\s\-–·|:,]+$/g, "").trim();
  if (!name && !productId) return null;
  return { qty: Math.min(QTY_CAP, Math.max(1, qty || 1)), name, set, number, finish, etched: etched || undefined, productId, zone };
}

/** How many separate blocks (runs of blank lines between two lines of text) a list has. */
function blockGaps(rows: string[]): number {
  let gaps = 0, seen = false, blank = false;
  for (const r of rows) {
    if (!r.trim()) { if (seen) blank = true; continue; }
    if (blank) gaps++;
    blank = false;
    seen = true;
  }
  return gaps;
}

export function parseDeckList(text: string, opts: { keepMaybe?: boolean } = {}): DeckLine[] {
  const rows = text.replace(/^﻿/, "").replace(/ /g, " ").split(/\r?\n/);
  const headed = rows.some((r) => { const z = zoneHeaderOf(r); return z !== null && z !== "neutral" && !/^\s*\d/.test(r); });
  // No headers and exactly one blank line between two blocks: MTGO's export, the second block is the sideboard. More blocks are just spacing.
  const twoBlocks = !headed && blockGaps(rows) === 1;
  const out: DeckLine[] = [];
  let zone: DeckZone = "main", about = false;
  for (const rawLine of rows) {
    const line = rawLine.trim();
    if (!line) {
      about = false;
      if (twoBlocks && zone === "main" && out.length) zone = "side";
      continue;
    }
    if (line.startsWith("//") || /^#(?!\d)/.test(line)) continue;
    if (/^about$/i.test(line)) { about = true; continue; }
    if (about) continue; // Arena's "Name ..." line under About
    const h = zoneHeaderOf(line);
    if (h) {
      if (h !== "neutral") zone = h;
      continue;
    }

    let body = line, lineZone: DeckZone | undefined;
    const pre = /^(sb|sideboard|side|commanders?|companions?)\s*:\s*(\S.*)$/i.exec(line);
    if (pre) {
      body = pre[2]!;
      lineZone = /^c/i.test(pre[1]!) ? (/^commander/i.test(pre[1]!) ? "commander" : "companion") : "side";
    }
    const p = parseCardText(body);
    if (!p || isSectionHeader(p.name)) continue;
    const z = p.zone ?? lineZone ?? zone;
    if (z === "maybe" && !opts.keepMaybe) continue;
    if (out.length >= DECK_LINE_CAP) break;
    out.push({ raw: line, qty: p.qty, name: p.name, set: p.set, number: p.number, finish: p.finish, etched: p.etched, productId: p.productId, zone: z });
  }
  return out;
}

// ── Printings and finishes (pure rules the resolver applies) ─────────────────────────────────────────────────────────────────

/** The few card fields resolution needs (data CardLite satisfies it). */
export interface ResolvableCard {
  id: number;
  name: string;
  number: string | null;
  /** Upper-case Scryfall set code (CardLite.setCode). */
  setCode: string;
  flags: number;
  treat: readonly string[];
  marketUsd: number | null;
  headFinish: Finish;
  /** Both finishes' TCGplayer quotes; null when the finish has no row. */
  n?: { market: number | null; low: number | null } | null;
  f?: { market: number | null; low: number | null } | null;
}

export type MatchKind = "pinned" | "setnumber" | "set" | "name" | "none";

export interface ResolvedLine<C> {
  line: DeckLine;
  /** The unit-view card: its price fields describe `finish`. */
  card: C | null;
  finish: Finish;
  /** Other printings of the same card, for the printing switcher: cheapest first, the chosen one included. */
  options: C[];
  how: MatchKind;
  /** The line named a set (and number) that did not resolve: the cheapest printing was used. */
  setMissed: boolean;
  /** *E* asked for a Foil Etched product the printing does not have: its Foil was used. */
  etchedMissed: boolean;
  /** Several ordinary products share the set and number: the plainest was used. */
  ambiguous: boolean;
  /** The finish asked for does not exist on the printing: the one it has was used. */
  finishAdjusted: boolean;
}

const PLAIN_EXCLUDED = CARD_FLAGS.SERIAL | CARD_FLAGS.NOTPLAY | CARD_FLAGS.ETCHED;

/**
 * The printing a bare name means among the printings given: the cheapest regular Normal one (no serialized, gold-border, silver-border, oversized or Foil Etched
 * product) by MARKET price, ties to the lower id; with no priced Normal printing, the first by id. The importer marks the same printing CHEAP over the whole
 * catalogue (PRICE_MASK.CHEAP); this is the rule for a list already in hand.
 */
export function basePrinting<C extends Pick<ResolvableCard, "id" | "flags" | "marketUsd" | "headFinish">>(cards: readonly C[]): C | undefined {
  const regular = cards.filter((c) => !(c.flags & PLAIN_EXCLUDED) && c.headFinish === "N" && c.marketUsd != null);
  const pool = regular.length ? regular : cards;
  return [...pool].sort((a, b) => (regular.length ? a.marketUsd! - b.marketUsd! : 0) || a.id - b.id)[0];
}

/** Printings in a stable order for a switcher: ordinary ones first, then by market (cheapest first, unpriced last), then id. */
export function orderPrintings<C extends Pick<ResolvableCard, "id" | "flags" | "marketUsd">>(cards: readonly C[]): C[] {
  const odd = (c: C): number => (c.flags & PLAIN_EXCLUDED ? 1 : 0);
  return [...cards].sort((a, b) => odd(a) - odd(b) || (a.marketUsd ?? Infinity) - (b.marketUsd ?? Infinity) || a.id - b.id);
}

/**
 * Among the products that share a set and a collector number (a base product, its Foil Etched twin, a stamped variant: one to three), the one a line means.
 * `etched` asks for the Foil Etched product (rule E: the ETCHED flag); with none, the base product is used and `etchedMissed` says so. Several ordinary
 * products are `ambiguous` and the plainest (fewest treatments, then the lowest id) is used, never a guess presented as certain.
 */
export function pickFromSetNumber<C extends Pick<ResolvableCard, "id" | "flags" | "treat">>(candidates: readonly C[], etched: boolean): { card: C; ambiguous: boolean; etchedMissed: boolean } | null {
  const isEtched = (c: C): boolean => (c.flags & CARD_FLAGS.ETCHED) !== 0;
  const plainest = (list: readonly C[]): C => [...list].sort((a, b) => a.treat.length - b.treat.length || a.id - b.id)[0]!;
  const e = candidates.filter(isEtched), base = candidates.filter((c) => !isEtched(c));
  if (!candidates.length) return null;
  if (etched && e.length) return { card: plainest(e), ambiguous: false, etchedMissed: false };
  if (base.length) return { card: plainest(base), ambiguous: base.length > 1, etchedMissed: etched };
  return { card: plainest(e), ambiguous: false, etchedMissed: false };
}

/**
 * The finish a line prices. An unmarked line is Normal if the product has a Normal row, else the only finish it has; *F* is Foil, and a product with no Foil row
 * falls back to its Normal (and says `adjusted`). Foil Etched products have only a Foil row.
 */
export function chooseFinish(card: Pick<ResolvableCard, "flags" | "n" | "f">, want: 0 | 1 | undefined): { finish: Finish; adjusted: boolean } {
  const hasN = card.n != null, hasF = card.f != null;
  if (want === 1) return hasF || !hasN ? { finish: "F", adjusted: false } : { finish: "N", adjusted: true };
  if (!hasN && hasF) return { finish: "F", adjusted: false };
  if ((card.flags & CARD_FLAGS.FOILONLY) !== 0 && hasF) return { finish: "F", adjusted: false };
  return { finish: "N", adjusted: false };
}

export const unitKeyOf = (id: number, finish: Finish, zone: DeckZone): string => `${id}.${finish === "F" ? 1 : 0}.${zone}`;

/**
 * One line of a list, round-trippable through parseDeckList: "4 Lightning Bolt (M11) 149", " *F*" for a Foil copy (" *E*" for Foil Etched), " #35427"
 * when the set and number alone would not find this product again. `o` is `{ finish, pinned }`, or a boolean for `pinned` alone.
 */
export function formatDeckLine(qty: number, card: Pick<ResolvableCard, "id" | "name" | "number" | "setCode" | "flags">, o: boolean | { finish?: Finish; pinned?: boolean } = false): string {
  const opt = typeof o === "boolean" ? { pinned: o } : o;
  const where = card.number ? ` (${card.setCode.toUpperCase()}) ${card.number}` : "";
  const finish = opt.finish === "F" ? ((card.flags & CARD_FLAGS.ETCHED) !== 0 ? " *E*" : " *F*") : "";
  const pin = opt.pinned || !card.number ? ` #${card.id}` : "";
  return `${qty} ${card.name}${where}${finish}${pin}`;
}

const ZONE_TITLE: Record<DeckZone, string> = { commander: "Commander", companion: "Companion", main: "Deck", side: "Sideboard", maybe: "Maybeboard" };
/** A whole list as text: plain lines when everything is in the main deck, else Arena-style sections (Commander, Companion, Deck, Sideboard) that parseDeckList reads back. */
export function formatDeckList(items: readonly { zone: DeckZone; text: string }[]): string {
  const zones = (["commander", "companion", "main", "side"] as const).filter((z) => items.some((i) => i.zone === z));
  if (zones.length <= 1 && (zones[0] ?? "main") === "main") return items.filter((i) => i.zone === "main").map((i) => i.text).join("\n");
  return zones.map((z) => `${ZONE_TITLE[z]}\n${items.filter((i) => i.zone === z).map((i) => i.text).join("\n")}`).join("\n\n");
}

/** Folded name with no spaces: two spellings of one name compare equal. */
export const normName = (s: string): string => fold(s).replace(/\s+/g, "");

// ── Pricing ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Merge repeated lines for the same printing, finish and zone ("2 Sol Ring" twice = 4 copies). */
export function mergeLines<R extends ResolvedLine<{ id: number }>>(rows: R[]): R[] {
  const out: R[] = [];
  const at = new Map<string, number>();
  for (const r of rows) {
    if (!r.card) {
      out.push(r);
      continue;
    }
    const k = unitKeyOf(r.card.id, r.finish, r.line.zone);
    const i = at.get(k);
    if (i == null) {
      at.set(k, out.length);
      out.push({ ...r, line: { ...r.line } });
    } else {
      const prev = out[i]!;
      prev.line.qty = Math.min(QTY_CAP, prev.line.qty + r.line.qty);
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

// ── The ?list= parameter ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ?list= ← list text, as UTF-8-safe base64: the one encoding /deck, Best Basket, a published deck and the deck watch all share (a list with accented
 * names such as "Lim-Dûl's Vault" or "Æther Vial" survives the round trip). The caller still URI-encodes it ("+", "/" and "=" are base64 characters).
 */
export function encodeList(text: string): string {
  const bytes = new TextEncoder().encode(text.trim().slice(0, 6000));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * The list a ?list= value carries: base64 (encodeList), or — for plain URI-encoded
 * links — the text itself. Anything that is not clean base64 of valid UTF-8 is read as text.
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
