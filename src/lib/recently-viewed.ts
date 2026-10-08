"use client";

// Client-only memory of this browser: the cards you've looked at, and what you
// typed into the search box (RiftCompare's lib/recently-viewed.ts and its
// SearchBar recent searches). No server read, no account. Written by the card
// page's RecentlyViewed island and by the search box; read by the search
// dropdown's empty state, the card page's rail and the watchlist page.
import { useSyncExternalStore } from "react";

export const RECENT_CARDS_KEY = "mc:recent-cards";
export const RECENT_SEARCHES_KEY = "mc:recent-searches";
const EVENT = "mc:recent";
export const MAX_RECENT_CARDS = 12;
export const MAX_RECENT_SEARCHES = 5;

export interface RecentCard {
  slug: string;
  name: string;
  /** "Borderless", "Showcase" … or null for the standard print. */
  variant: string | null;
  setCode: string;
  number: string | null;
  /** Our own CDN thumb URL (lib/images cardImage.thumb), never a raw column. */
  img: string | null;
}

// ── Pure list rules (tests/recently-viewed.test.ts) ──────────────────────────

/** Newest first, one entry per slug (a re-view moves it to the front), capped. */
export function withRecentCard(list: RecentCard[], entry: RecentCard, max = MAX_RECENT_CARDS): RecentCard[] {
  return [entry, ...list.filter((c) => c.slug !== entry.slug)].slice(0, max);
}

/** Newest first, case-insensitive dedupe, blank terms ignored, capped. */
export function withRecentSearch(list: string[], term: string, max = MAX_RECENT_SEARCHES): string[] {
  const t = term.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!t) return list.slice(0, max);
  return [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, max);
}

function isCard(v: unknown): v is RecentCard {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return typeof c.slug === "string" && c.slug.length > 0 && typeof c.name === "string" && typeof c.setCode === "string";
}

/** Parse a stored value defensively: anything malformed reads as an empty list. */
export function parseRecentCards(raw: string | null): RecentCard[] {
  try {
    const v: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(v)
      ? v.filter(isCard).map((c) => ({ ...c, variant: c.variant ?? null, number: c.number ?? null, img: typeof c.img === "string" ? c.img : null }))
      : [];
  } catch {
    return [];
  }
}

export function parseRecentSearches(raw: string | null): string[] {
  try {
    const v: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

// ── Storage (best-effort: private mode or a full store just means no rail) ───

function read(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage full or blocked */
  }
}

export function pushRecentCard(entry: RecentCard) {
  write(RECENT_CARDS_KEY, withRecentCard(parseRecentCards(read(RECENT_CARDS_KEY)), entry));
}

export function pushRecentSearch(term: string): string[] {
  const next = withRecentSearch(parseRecentSearches(read(RECENT_SEARCHES_KEY)), term);
  write(RECENT_SEARCHES_KEY, next);
  return next;
}

export function clearRecent(key: typeof RECENT_CARDS_KEY | typeof RECENT_SEARCHES_KEY) {
  write(key, []);
}

function subscribe(on: () => void): () => void {
  // "storage" fires cross-tab; our own event fires in this tab.
  window.addEventListener("storage", on);
  window.addEventListener(EVENT, on);
  return () => {
    window.removeEventListener("storage", on);
    window.removeEventListener(EVENT, on);
  };
}

// Snapshots are cached by the raw string so useSyncExternalStore sees a stable
// reference while nothing changed.
const EMPTY_CARDS: RecentCard[] = [];
const EMPTY_SEARCHES: string[] = [];
let cardsRaw: string | null | undefined;
let cardsSnap: RecentCard[] = EMPTY_CARDS;
let searchRaw: string | null | undefined;
let searchSnap: string[] = EMPTY_SEARCHES;

function cardsSnapshot(): RecentCard[] {
  const raw = read(RECENT_CARDS_KEY);
  if (raw !== cardsRaw) {
    cardsRaw = raw;
    cardsSnap = parseRecentCards(raw);
  }
  return cardsSnap;
}
function searchesSnapshot(): string[] {
  const raw = read(RECENT_SEARCHES_KEY);
  if (raw !== searchRaw) {
    searchRaw = raw;
    searchSnap = parseRecentSearches(raw);
  }
  return searchSnap;
}

/** Recently viewed cards; [] on the server and on a first visit. */
export function useRecentCards(): RecentCard[] {
  return useSyncExternalStore(subscribe, cardsSnapshot, () => EMPTY_CARDS);
}

/** Recent searches; [] on the server and on a first visit. */
export function useRecentSearches(): string[] {
  return useSyncExternalStore(subscribe, searchesSnapshot, () => EMPTY_SEARCHES);
}
