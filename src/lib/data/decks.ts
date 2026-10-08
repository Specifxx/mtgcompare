// owner: WP10
// src/lib/data/decks.ts: the published-deck library (contract 7.12 "decks.ts", kind N). User content in Neon, the only Neon-backed read a public render may make
// besides the decks of a commander page and the deck sitemap (contract 7.13): the callbacks below only query Neon, a failed read THROWS inside (an empty library is
// never stored) and the pages catch outside it, so a Neon outage shows no decks and nothing else. The names, arguments, result types, cache kinds and tags are
// FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
//
// Prices are NOT in these rows beyond the total each market paid the day the deck was published: a page prices a deck now from getCardsByIds
// (lib/deck-price.ts deckUnitCards), so a price import moves every total without a deck read.
// This module reads no plane file, so it may hold unstable_cache (tests/nested-cache.test.ts RULE 5).
import { unstable_cache } from "next/cache";
import type { Country } from "../country";
import type { Finish } from "../constants";
import { prisma } from "../db";
import { DECKS_TAG, TTL } from "./core";

export interface LibraryDeckRow { id: string; slug: string; title: string; authorName: string | null; commanderName: string; commanderSlug: string; commanderCardId: number; partnerCardId: number | null; identity: number; lines: { cardId: number; qty: number; finish?: Finish }[]; cardCount: number; publishedTotals: Partial<Record<Country, number | null>>; createdAt: string }
export const LIBRARY_DECKS_MAX: 200 = 200;

/** A deck page's row: the library row, the format, the partner's name, the description and the canonical list text. */
export type PublishedDeckPage = LibraryDeckRow & { format: string; partnerName: string | null; description: string | null; list: string };

const ROW_SELECT = {
  id: true, slug: true, title: true, authorName: true, commanderName: true, commanderSlug: true, commanderCardId: true, partnerCardId: true, identity: true,
  lines: true, cardCount: true, publishedTotals: true, createdAt: true,
} as const;

interface DbRow { id: string; slug: string; title: string; authorName: string | null; commanderName: string; commanderSlug: string; commanderCardId: number; partnerCardId: number | null; identity: number; lines: unknown; cardCount: number; publishedTotals: unknown; createdAt: Date }

/** [{ cardId, qty, finish?: 0 | 1 }] as stored -> the frozen row's lines ({ finish?: "N" | "F" }); a malformed entry is dropped, never thrown on. Pure. */
export function deckLinesOf(json: unknown): LibraryDeckRow["lines"] {
  if (!Array.isArray(json)) return [];
  const out: LibraryDeckRow["lines"] = [];
  for (const l of json) {
    const o = (l ?? {}) as { cardId?: unknown; qty?: unknown; finish?: unknown };
    if (typeof o.cardId !== "number" || !Number.isInteger(o.cardId) || o.cardId <= 0 || typeof o.qty !== "number" || !Number.isInteger(o.qty) || o.qty <= 0) continue;
    out.push(o.finish === 1 || o.finish === "F" ? { cardId: o.cardId, qty: o.qty, finish: "F" } : { cardId: o.cardId, qty: o.qty });
  }
  return out;
}

/** A PublishedDeck row as the frozen LibraryDeckRow. Pure. */
export function deckRowOf(d: DbRow): LibraryDeckRow {
  return {
    id: d.id, slug: d.slug, title: d.title, authorName: d.authorName, commanderName: d.commanderName, commanderSlug: d.commanderSlug, commanderCardId: d.commanderCardId, partnerCardId: d.partnerCardId,
    identity: d.identity, lines: deckLinesOf(d.lines), cardCount: d.cardCount,
    publishedTotals: (d.publishedTotals && typeof d.publishedTotals === "object" && !Array.isArray(d.publishedTotals) ? d.publishedTotals : {}) as Partial<Record<Country, number | null>>,
    createdAt: d.createdAt.toISOString(),
  };
}

/** Every live deck, newest first (at most LIBRARY_DECKS_MAX: about 4 KB a deck, far under the 2 MB entry ceiling). */
export const getLibraryDecks = unstable_cache(
  async (): Promise<LibraryDeckRow[]> => (await prisma.publishedDeck.findMany({ where: { status: "live" }, orderBy: { createdAt: "desc" }, take: LIBRARY_DECKS_MAX, select: ROW_SELECT })).map(deckRowOf),
  ["library-decks-v1"],
  { tags: [DECKS_TAG], revalidate: TTL.hours6 },
);

/** One live deck by slug, with its format, description and list text; null when there is none. */
export const getPublishedDeck = unstable_cache(
  async (slug: string): Promise<PublishedDeckPage | null> => {
    const d = await prisma.publishedDeck.findFirst({ where: { slug, status: "live" }, select: { ...ROW_SELECT, format: true, partnerName: true, description: true, list: true } });
    return d ? { ...deckRowOf(d), format: d.format, partnerName: d.partnerName, description: d.description, list: d.list } : null;
  },
  ["published-deck-v1"],
  { tags: [DECKS_TAG], revalidate: TTL.hours6 },
);

/** Up to six live decks that play a printing (the card page's "Decks using this card", loaded in the browser). `cardId` is a product id; a deck holds the product ids of its lines. */
export const getDecksUsingCard = unstable_cache(
  async (cardId: number): Promise<{ slug: string; title: string; commanderName: string }[]> =>
    prisma.publishedDeck.findMany({
      where: { status: "live", cardIds: { has: cardId } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { slug: true, title: true, commanderName: true },
    }),
  ["decks-using-card-v1"],
  { tags: [DECKS_TAG], revalidate: TTL.hours6 },
);
