// owner: WP10
// src/lib/data/decks.ts: C0 STUB (contract 9.3 step 2), the section "decks.ts" of api.ts. Every function below throws until WP10 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
import type { Country } from "../country";
import type { Finish } from "../constants";

export interface LibraryDeckRow { id: string; slug: string; title: string; authorName: string | null; commanderName: string; commanderSlug: string; commanderCardId: number; partnerCardId: number | null; identity: number; lines: { cardId: number; qty: number; finish?: Finish }[]; cardCount: number; publishedTotals: Partial<Record<Country, number | null>>; createdAt: string }
export const LIBRARY_DECKS_MAX: 200 = 200;
export function getLibraryDecks(): Promise<LibraryDeckRow[]> { throw new Error("not implemented: WP10"); }                               // N tag DECKS_TAG; THROWS inside the cache (a failed read is never stored as an empty library), pages catch outside
export function getPublishedDeck(slug: string): Promise<LibraryDeckRow | null> { throw new Error("not implemented: WP10"); }             // N
export function getDecksUsingCard(cardId: number): Promise<{ slug: string; title: string; commanderName: string }[]> { throw new Error("not implemented: WP10"); }   // N
