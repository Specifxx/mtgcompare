// The public deck library (RiftCompare's lib/published-decks.ts, for One
// Piece): pure rules shared by the publish API, the admin import, the library
// and deck pages. Client-safe (no Prisma).
//
// Every deck here is one a player published, or the owner imported, attributed
// to them. Nothing is seeded.
//
// ONE PIECE RULES (wave2-plan Track 3 item 8): a deck is exactly ONE Leader plus
// 50 cards (DECK_MIN_CARDS 51, Leader included), at most four copies of a card
// number, and DON!! cards are not deck cards (they are never resolved). A
// deck's colours are its Leader's; its library page is filed under the Leader
// (name + number, "/decks/leader/monkey-d-luffy-op01-001").

import { MARKETS, type Country } from "./country";
import { slugify } from "./catalog";

export const DECK_TITLE_MIN = 4;
export const DECK_TITLE_MAX = 80;
export const DECK_DESC_MAX = 1000;
/** A published deck: the Leader plus 50 cards. */
export const DECK_MAIN_CARDS = 50;
export const DECK_MIN_CARDS = DECK_MAIN_CARDS + 1;
/** At most this many copies of one card number. */
export const DECK_COPY_LIMIT = 4;
/** Lines the list may leave unmatched and still publish. */
export const DECK_MAX_UNMATCHED = 3;
/** Per account: at most this many publishes in 24 hours (DB-counted, global). */
export const DECK_DAILY_LIMIT = 10;
/** Cache tag for the library loaders; publish/hide revalidate it. */
export const PUBLISHED_DECKS_TAG = "published-decks";

export type MarketTotals = Partial<Record<Country, number | null>>;

/** Each market's cheapest price for a card (the catalogue's low<MKT>). */
export interface PricedCard {
  low: Partial<Record<Country, number | null>>;
}

/**
 * A deck's total in every market: Σ qty × the card's cheapest price there. A
 * market where any card has no price is `null`, never a partial sum passed off
 * as the deck's cost.
 */
export function deckTotals(lines: { qty: number; card: PricedCard | null | undefined }[]): MarketTotals {
  const out: MarketTotals = {};
  for (const code of MARKETS) {
    let total = 0;
    let complete = lines.length > 0;
    for (const l of lines) {
      const p = l.card?.low[code] ?? null;
      if (p == null) {
        complete = false;
        break;
      }
      total += p * l.qty;
    }
    out[code] = complete ? total : null;
  }
  return out;
}

export type PriceBand = "all" | "u50" | "u100" | "200plus";
export const PRICE_BANDS: { value: PriceBand; label: string }[] = [
  { value: "all", label: "Any price" },
  { value: "u50", label: "Under $50" },
  { value: "u100", label: "Under $100" },
  { value: "200plus", label: "$200+" },
];

/** Whether a total (minor units of the viewer's currency) falls in a band. Unpriced decks only match "all". */
export function inPriceBand(totalCents: number | null | undefined, band: PriceBand): boolean {
  if (band === "all") return true;
  if (totalCents == null) return false;
  if (band === "u50") return totalCents < 5000;
  if (band === "u100") return totalCents < 10000;
  return totalCents >= 20000;
}

/** Percentage change from the published total to now, or null when either side is missing. */
export function changeSincePublished(published: number | null | undefined, now: number | null | undefined): number | null {
  if (published == null || now == null || published <= 0) return null;
  return Math.round(((now - published) / published) * 1000) / 10;
}

/** TCGplayer Mass Entry: one "qty Name [number]" per line. */
export function massEntry(lines: { qty: number; name: string; number?: string | null }[]): string {
  return lines.map((l) => `${l.qty} ${l.name}${l.number ? ` [${l.number}]` : ""}`).join("\n");
}

/** "/decks/<title>-<short id>" — the id suffix keeps two same-titled decks apart. */
export function deckSlug(title: string, id: string): string {
  const base = slugify(title).slice(0, 60).replace(/-$/, "") || "deck";
  return `${base}-${id.slice(-6).toLowerCase()}`;
}

/** The Leader's library slug: its name and number, "Monkey.D.Luffy" OP01-001 → "monkey-d-luffy-op01-001". */
export function leaderSlugFrom(name: string, number: string | null): string {
  return slugify([name, number].filter(Boolean).join(" ")) || "leader";
}

export interface DeckShape {
  leaders: { id: number; name: string; number: string | null }[];
  mainCards: number;
  overLimit: string[];
}

/** The deck-shape check publishing enforces: exactly one Leader, 50 main-deck cards, at most 4 of a number. */
export function deckShapeError(shape: DeckShape): string | null {
  if (!shape.leaders.length) return "Add your Leader to the list first (for example “1xOP01-001”).";
  if (shape.leaders.length > 1) return "A deck has exactly one Leader — pick the one this deck is built around.";
  if (shape.mainCards !== DECK_MAIN_CARDS) return `A published deck is a Leader and ${DECK_MAIN_CARDS} cards (this list has ${shape.mainCards} besides the Leader).`;
  if (shape.overLimit.length) return `At most ${DECK_COPY_LIMIT} copies of a card number: ${shape.overLimit.join(", ")}.`;
  return null;
}

export type PublishCheck = { ok: true; title: string; description: string | null } | { ok: false; error: string };

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|gg|xyz|ru|shop|store|co|app)\b)/i;

/**
 * Title/description checks — basic spam protection on top of the rate limit
 * and the per-account daily cap. No links anywhere (the commonest spam), no
 * shouting, no one character repeated to pad a field.
 */
export function checkPublishText(titleRaw: unknown, descRaw: unknown): PublishCheck {
  const title = typeof titleRaw === "string" ? titleRaw.trim().replace(/\s+/g, " ") : "";
  const description = typeof descRaw === "string" ? descRaw.trim() : "";
  if (title.length < DECK_TITLE_MIN || title.length > DECK_TITLE_MAX) {
    return { ok: false, error: `Give the deck a title of ${DECK_TITLE_MIN}–${DECK_TITLE_MAX} characters.` };
  }
  if (description.length > DECK_DESC_MAX) return { ok: false, error: `Keep the description under ${DECK_DESC_MAX} characters.` };
  if (LINK.test(title) || LINK.test(description)) return { ok: false, error: "Links aren't allowed in deck titles or descriptions." };
  if (/(.)\1{9,}/.test(title + description)) return { ok: false, error: "That text looks like padding — please write it out." };
  const letters = title.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 8 && letters === letters.toUpperCase()) return { ok: false, error: "Please don't write the title in capitals." };
  return { ok: true, title, description: description || null };
}

/** The viewer's figure from a totals object (client side). */
export function totalFor(totals: MarketTotals | null | undefined, country: Country): number | null {
  return totals?.[country] ?? null;
}
