// The public deck library: pure rules shared by the publish API, the admin import, the library and the deck pages. Client-safe (no Prisma, no data layer).
//
// Every deck here is one a player published, or the owner imported, attributed to them. Nothing is seeded.
//
// MAGIC RULES: a published deck leads with a commander (or two partners), so it is a Commander-style deck: Commander, Pauper Commander, Duel Commander, PreDH,
// Brawl, Standard Brawl or Oathbreaker. The list must satisfy the format's own rules (lib/commander-rules.ts: size, singleton, colour identity, legality), and
// at most DECK_MAX_UNMATCHED lines may be left unmatched. A deck's colours are its commander's identity (a WUBRG mask); its library page is filed under the
// commander's Oracle slug ("/decks/commander/atraxa-praetors-voice").

import { DECK_FORMATS, COMMANDER_FORMATS, firstError, type DeckReport } from "./commander-rules";
import type { Format } from "./constants";
import { MARKETS, type Country } from "./country";
import { slugify } from "./catalog";

export const DECK_TITLE_MIN = 4;
export const DECK_TITLE_MAX = 80;
export const DECK_DESC_MAX = 1000;
/** Lines the list may leave unmatched and still publish. */
export const DECK_MAX_UNMATCHED = 3;
/** Per account: at most this many publishes in 24 hours (DB-counted, global). */
export const DECK_DAILY_LIMIT = 10;
/** Cache tag for the library loaders (data/core.ts DECKS_TAG); publish/hide revalidate it. */
export const PUBLISHED_DECKS_TAG = "published-decks";

/** The formats a deck may be published in: the ones that lead with a commander and whose rules are confirmed. */
export const PUBLISH_FORMATS: readonly Format[] = COMMANDER_FORMATS.filter((f) => DECK_FORMATS[f].verified);
export const isPublishFormat = (v: unknown): v is Format => typeof v === "string" && (PUBLISH_FORMATS as readonly string[]).includes(v);
export const DEFAULT_PUBLISH_FORMAT: Format = "commander";

export type MarketTotals = Partial<Record<Country, number | null>>;

/** Each market's cheapest price for a unit (the catalogue's low per market), and its TCGplayer low or market in USD cents (what the US total falls back to when no store lists it). */
export interface PricedCard {
  low: Partial<Record<Country, number | null>>;
  usd?: number | null;
}

/**
 * A deck's total in every market: Σ qty × the unit's cheapest price there. A market where any card has no price is `null`, never a partial sum passed off as
 * the deck's cost. The US also counts the unit's TCGplayer price (`usd`) when no listing is tracked for it, so a deck of cheap cards still has a US total;
 * other markets have store rows only for cards worth $5 and up, so their total exists only when every card has one.
 */
export function deckTotals(lines: { qty: number; card: PricedCard | null | undefined }[]): MarketTotals {
  const out: MarketTotals = {};
  for (const code of MARKETS) {
    let total = 0;
    let complete = lines.length > 0;
    for (const l of lines) {
      const p = l.card?.low[code] ?? (code === "US" ? (l.card?.usd ?? null) : null);
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

/**
 * TCGplayer Mass Entry: one "qty Name [SET]" per line, the printing's Scryfall set code in brackets when the line has one. (The bracketed set code is
 * TCGplayer's documented form for Magic; the owner checks it once on the live Mass Entry page.)
 */
export function massEntry(lines: { qty: number; name: string; setCode?: string | null }[]): string {
  return lines.map((l) => `${l.qty} ${l.name}${l.setCode ? ` [${l.setCode.toUpperCase()}]` : ""}`).join("\n");
}

/** "/decks/<title>-<short id>" — the id suffix keeps two same-titled decks apart. */
export function deckSlug(title: string, id: string): string {
  const base = slugify(title).slice(0, 60).replace(/-$/, "") || "deck";
  return `${base}-${id.slice(-6).toLowerCase()}`;
}

/** A commander's library page: "/decks/commander/<Oracle slug>". */
export const commanderDeckPath = (commanderSlug: string): string => `/decks/commander/${commanderSlug}`;

/**
 * The shape check publishing enforces, as a sentence or null: a commander-style format, at most DECK_MAX_UNMATCHED unmatched lines, and a list that breaks
 * none of the format's rules (the first error of the report: no commander, a wrong size, a copy of a singleton card, a card outside the commander's colours,
 * a banned card ...).
 */
export function deckShapeError(s: { format: Format | null; report: DeckReport | null; unmatched: number }): string | null {
  if (!s.format || !isPublishFormat(s.format)) return `Decks are published in a Commander-style format: ${PUBLISH_FORMATS.map((f) => DECK_FORMATS[f].label).join(", ")}.`;
  if (s.unmatched > DECK_MAX_UNMATCHED) return `${s.unmatched} lines didn't match a card — fix them in the deck builder first.`;
  if (!s.report) return "That list couldn't be checked right now — please try again in a minute.";
  return firstError(s.report);
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
