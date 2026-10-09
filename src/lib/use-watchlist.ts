"use client";

import { useEffect, useState } from "react";
import type { Country } from "./country";
import { trackEvent } from "./analytics";
import { fetchMe } from "./use-me";
import { FREE_LIMIT_STATUS, parseFreeLimit, wouldHitFreeLimit, type FreeLimitBody } from "./free-limits";

// Shared client-side view of "which cards am I watching?" — RiftCompare's
// lib/use-watchlist.ts, ported in wave 2 (2026-10-03).
//
// MODULE-LEVEL, like use-me.ts, and for the same reason: the heart renders on
// every tile of /browse and every set gallery, so a per-component fetch would
// mean one request per card. One shared promise means one request per page load.
//
// Unlike use-me it also keeps a SUBSCRIBER list, because this state changes while
// the page is open: unwatching from a tile's own heart has to make that tile
// disappear from the watchlist drawer immediately, without a refetch.
//
// ── Two branches (MTG Compare) ───────────────────────────────────────────────
// SIGNED IN ("account"): RiftCompare's behaviour — GET /api/alerts/watchlist?ids=1
//   once (ids only), optimistic POST /api/alerts/watchlist and DELETE
//   /api/alerts/watchlist/[cardId], the free limit decided by the route's 402.
//   Until the wave-2 member track ships those routes, a 404 means "no server
//   list": the set is empty and a watch fails (and rolls back).
// SIGNED OUT ("local"): MTG Compare keeps its no-account hearts (RiftCompare
//   asks for an email instead, which OP cannot honour while email is off). The
//   watched set is the card items of localStorage `mc:watchlist` — the format of
//   components/WatchButton.tsx — and watch/unwatch write it and publish. No
//   request at all. Older local items carry only a slug, so a card counts as
//   watched when its id OR its slug is in the list (`isWatched`).
//
// Card ids are numbers here (Card.id, the TCGplayer productId). watch() takes
// the card's id, slug and name because the local branch stores all three.
//
// The localStorage → account merge on first sign-in: mergeLocal() below
// (member track, wave2-plan §4).

/** localStorage key and change event of the signed-out list (components/WatchButton.tsx WATCH_KEY). */
export const LOCAL_WATCHLIST_KEY = "mc:watchlist";
export const LOCAL_WATCHLIST_EVENT = "mc:watchlist";
/** The signed-out list keeps the newest this many items (WatchButton's cap). */
export const LOCAL_WATCHLIST_MAX = 200;

export interface WatchCard {
  id: number;
  slug: string;
  name: string;
}

interface LocalItem {
  slug: string;
  kind: "card" | "sealed";
  name: string;
  added: string;
  id?: number;
}

export type WatchlistMode = "account" | "local";

export interface WatchlistState {
  mode: WatchlistMode;
  /** Watched card ids (account: from the server; local: the items that carry one). */
  ids: Set<number>;
  /** Local branch only: watched card slugs (every local card item has one). */
  slugs: Set<string>;
  /** What the header heart counts: account → watched cards; local → every saved card and sealed item. */
  count: number;
}

let state: WatchlistState | null = null; // null = not loaded yet
let inflight: Promise<WatchlistState> | null = null;
const subscribers = new Set<(s: WatchlistState | null) => void>();
let localListening = false;

function copy(s: WatchlistState | null): WatchlistState | null {
  // Hand out a COPY: React bails out of a re-render when the new state is
  // reference-equal to the old, so mutating the shared Sets in place would
  // update nothing on screen.
  return s ? { ...s, ids: new Set(s.ids), slugs: new Set(s.slugs) } : null;
}

function publish() {
  const snapshot = copy(state);
  for (const fn of subscribers) fn(copy(snapshot));
}

// ── The signed-out (localStorage) branch ────────────────────────────────────

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null; // Safari private mode, blocked site data
  }
}

function readLocal(): LocalItem[] {
  try {
    const v: unknown = JSON.parse(storage()?.getItem(LOCAL_WATCHLIST_KEY) || "[]");
    return Array.isArray(v) ? (v as LocalItem[]).filter((i) => i && typeof i.slug === "string") : [];
  } catch {
    return [];
  }
}

function writeLocal(items: LocalItem[]): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(LOCAL_WATCHLIST_KEY, JSON.stringify(items.slice(0, LOCAL_WATCHLIST_MAX)));
  } catch {
    return false;
  }
  try {
    window.dispatchEvent(new Event(LOCAL_WATCHLIST_EVENT));
  } catch {
    /* no window events (tests) */
  }
  return true;
}

function localState(): WatchlistState {
  const items = readLocal();
  const cards = items.filter((i) => i.kind === "card");
  return {
    mode: "local",
    ids: new Set(cards.map((i) => i.id).filter((id): id is number => typeof id === "number")),
    slugs: new Set(cards.map((i) => i.slug)),
    count: items.length,
  };
}

// WatchButton (and other tabs) write the same key; follow them while signed out.
function listenLocal() {
  if (localListening || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  localListening = true;
  const sync = () => {
    if (state?.mode !== "local") return;
    state = localState();
    publish();
  };
  window.addEventListener(LOCAL_WATCHLIST_EVENT, sync);
  window.addEventListener("storage", sync);
}

// ── The merge on first sign-in (member track, wave 2) ───────────────────────
// A visitor who hearted cards while signed out keeps them when they make an
// account or sign in: the card items of `mc:watchlist` are posted to
// /api/alerts/watchlist/merge, which resolves them through the cached
// catalogue, imports at most 200 and GRANDFATHERS them (no free-limit check;
// the limit applies to adds after the merge). On success the merged card
// items leave localStorage and `mc:watchlist-merged` records the account, so
// nothing is posted twice. Sealed items stay local (sealed watches are Plus,
// lib/use-sealed-watches.ts). A failed merge leaves the local list intact
// for the next load.
export const LOCAL_MERGED_KEY = "mc:watchlist-merged";

function cookieMarket(): string {
  try {
    const m = document.cookie.split("; ").find((c) => c.startsWith("country="));
    return m ? decodeURIComponent(m.slice("country=".length)) : "US";
  } catch {
    return "US";
  }
}

async function mergeLocal(userId: string | null): Promise<void> {
  const cards = readLocal().filter((i) => i.kind === "card");
  if (!cards.length) return;
  const res = await fetch("/api/alerts/watchlist/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: cards.map((i) => ({ slug: i.slug, id: i.id })), market: cookieMarket() }),
  }).catch(() => null);
  if (!res?.ok) return;
  const merged = new Set(cards.map((i) => i.slug));
  const rest = readLocal().filter((i) => !(i.kind === "card" && merged.has(i.slug)));
  writeLocal(rest);
  try {
    if (userId) storage()?.setItem(LOCAL_MERGED_KEY, userId);
  } catch {
    /* blocked */
  }
  trackEvent("watchlist_merged", { cards: cards.length });
}

// ── Loading ─────────────────────────────────────────────────────────────────

function load(): Promise<WatchlistState> {
  if (!inflight) {
    // Signed-out is known from /api/me (one shared request per page, and none
    // at all without the mc_auth hint; see use-me.ts), so an anonymous visitor
    // makes NO watchlist request. IDS ONLY (?ids=1): this runs on every
    // signed-in page view and builds nothing but a Set of card ids.
    inflight = fetchMe()
      .then(async (me): Promise<WatchlistState> => {
        if (!me.user) {
          listenLocal();
          return localState();
        }
        // The signed-out list joins the account first (member track), so the
        // ids fetch below already includes what was just merged.
        await mergeLocal(me.userId ?? null);
        const d = await fetch("/api/alerts/watchlist?ids=1", { cache: "no-store" })
          .then((r) => (r.ok ? (r.json() as Promise<{ items?: { cardId: number | string }[] }>) : null))
          .catch(() => null);
        const ids = new Set((d?.items ?? []).map((i) => Number(i.cardId)).filter((n) => Number.isInteger(n)));
        return { mode: "account", ids, slugs: new Set(), count: ids.size };
      })
      .catch((): WatchlistState => localState())
      .then((s) => {
        state = s;
        publish();
        return s;
      });
  }
  return inflight;
}

/** Re-fetch on next use — call beside invalidateMe() on login/logout. */
export function invalidateWatchlist() {
  inflight = null;
  state = null;
  publish();
}

// invalidateMe() (use-me.ts) fires `mc:me` on sign-in, sign-out and plan
// changes. Follow it so a mounted heart or header count never keeps the old
// account's list (or the local list after signing in) until a reload: drop the
// cached state and, when anything is listening, load again (one ids request,
// or none signed out).
let meListening = false;
function listenMe() {
  if (meListening || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  meListening = true;
  window.addEventListener("mc:me", () => {
    if (state === null && inflight === null) return;
    invalidateWatchlist();
    if (subscribers.size) void load();
  });
}

/** Watched cards + saved sealed items right now (0 before the first load). */
export function watchCount(): number {
  return state?.count ?? 0;
}

/** Is this card watched? Account: by id. Local: by id or slug (older items carry no id). */
export function isWatched(s: WatchlistState | null, card: { id: number; slug?: string }): boolean {
  if (!s) return false;
  return s.ids.has(card.id) || (s.mode === "local" && card.slug != null && s.slugs.has(card.slug));
}

// ── Mutations ───────────────────────────────────────────────────────────────

function postWatch(cardId: number, market: Country): Promise<Response | null> {
  return fetch("/api/alerts/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId, market }),
  }).catch(() => null);
}

/** A 402 from the route is the free limit: hand it to the control that was tapped. */
async function reportLimit(res: Response | null, cardId: number, onLimit?: (limit: FreeLimitBody) => void) {
  if (res?.status !== FREE_LIMIT_STATUS) return;
  const limit = parseFreeLimit(await res.json().catch(() => null));
  if (!limit) return;
  trackEvent("free_limit_hit", { kind: "watchlist", card_id: cardId });
  onLimit?.(limit);
}

function setAccountIds(ids: Set<number>) {
  state = { mode: "account", ids, slugs: new Set(), count: ids.size };
}

/**
 * The store's operations, outside React (the hook below wraps them; tests call
 * them directly). Both resolve false when nothing was saved.
 */
export const watchlistStore = {
  load,
  get: (): WatchlistState | null => copy(state),
  subscribe(fn: (s: WatchlistState | null) => void): () => void {
    listenMe();
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  },

  // OPTIMISTIC (RiftCompare, 2026-09-16). The heart flips the instant a visitor
  // taps it — mutate + publish() FIRST, fetch second — and rolls back to the
  // pre-click snapshot if the request fails, so a silent failure is never a
  // silent LIE: the UI always converges on what the server actually has.
  async watch(card: WatchCard, market: Country, opts?: { onLimit?: (limit: FreeLimitBody) => void }): Promise<boolean> {
    const s = await load();
    if (s.mode === "local") {
      const items = readLocal();
      if (!items.some((i) => i.kind === "card" && (i.id === card.id || i.slug === card.slug))) {
        const ok = writeLocal([{ slug: card.slug, kind: "card", name: card.name, added: new Date().toISOString(), id: card.id }, ...items]);
        if (!ok) return false;
      }
      state = localState();
      publish();
      trackEvent("watch_add", { card_id: card.id });
      return true;
    }
    const cardId = card.id;
    // THE FREE LIMIT. The shared id Set is NOT the whole truth (only the newest
    // 500, and a card already watched is always allowed — grandfathering), so a
    // pre-check block is never final: at the limit the tap goes to the route
    // WITHOUT the optimistic flip, and the route's 402 — or its success — decides.
    const me = await fetchMe();
    const paid = me.tier != null;
    const watched = state?.mode === "account" ? state.ids : new Set<number>();
    if (wouldHitFreeLimit("watchlist", { paid, held: watched, cardId })) {
      const res = await postWatch(cardId, market);
      if (res?.ok) {
        setAccountIds(new Set([...(state?.ids ?? []), cardId]));
        publish();
        trackEvent("watch_add", { card_id: cardId });
        trackEvent("alert_created", { signed_in: true });
        return true;
      }
      await reportLimit(res, cardId, opts?.onLimit);
      return false;
    }
    const prev = new Set(watched);
    setAccountIds(new Set([...prev, cardId]));
    publish();
    trackEvent("watch_add", { card_id: cardId });
    const res = await postWatch(cardId, market);
    if (!res?.ok) {
      setAccountIds(prev);
      publish();
      await reportLimit(res, cardId, opts?.onLimit);
      return false;
    }
    trackEvent("alert_created", { signed_in: true });
    return true;
  },

  async unwatch(card: { id: number; slug?: string }): Promise<boolean> {
    const s = await load();
    if (s.mode === "local") {
      const items = readLocal();
      const next = items.filter((i) => !(i.kind === "card" && (i.id === card.id || (card.slug != null && i.slug === card.slug))));
      if (next.length !== items.length && !writeLocal(next)) return false;
      state = localState();
      publish();
      trackEvent("watch_remove", { card_id: card.id });
      return true;
    }
    const prev = new Set(state?.mode === "account" ? state.ids : []);
    const next = new Set(prev);
    next.delete(card.id);
    setAccountIds(next);
    publish();
    trackEvent("watch_remove", { card_id: card.id });
    const res = await fetch(`/api/alerts/watchlist/${encodeURIComponent(String(card.id))}`, { method: "DELETE" }).catch(() => null);
    // 404 means it was already gone — treat as success so the UI converges.
    if (!res || (!res.ok && res.status !== 404)) {
      setAccountIds(prev);
      publish();
      return false;
    }
    return true;
  },
};

export interface WatchlistApi {
  /** The whole state, or null while loading. */
  state: WatchlistState | null;
  /** Account-mode watched ids (RiftCompare's `watched`); null while loading or signed out. */
  watched: Set<number> | null;
  loaded: boolean;
  /** Header count: watched cards (account) or saved cards + sealed (local). */
  count: number;
  isWatched(card: { id: number; slug?: string }): boolean;
  /**
   * Watch a card. Resolves false when nothing was saved. At the free watchlist
   * limit it calls `onLimit` with the structured limit, so the control that
   * was tapped can show the upgrade panel right there.
   */
  watch(card: WatchCard, market: Country, opts?: { onLimit?: (limit: FreeLimitBody) => void }): Promise<boolean>;
  unwatch(card: { id: number; slug?: string }): Promise<boolean>;
}

export function useWatchlist(): WatchlistApi {
  const [s, setS] = useState<{ state: WatchlistState | null; loaded: boolean }>({ state: copy(state), loaded: state !== null });

  useEffect(() => {
    const fn = (next: WatchlistState | null) => setS({ state: next, loaded: next !== null });
    const off = watchlistStore.subscribe(fn);
    void load().then(() => setS({ state: copy(state), loaded: true }));
    return off;
  }, []);

  const cur = s.state;
  return {
    state: cur,
    watched: cur?.mode === "account" ? cur.ids : null,
    loaded: s.loaded,
    count: cur?.count ?? 0,
    isWatched: (card) => isWatched(cur, card),
    watch: watchlistStore.watch,
    unwatch: watchlistStore.unwatch,
  };
}

/** Just the watched ids, for a list that filters or marks by id ("only my cards"). Null while loading. */
export function useWatchedIds(): Set<number> | null {
  return useWatchlist().state?.ids ?? null;
}
