"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchMe } from "@/lib/use-me";
import { trackEvent } from "@/lib/analytics";
import { FREE_LIMIT_STATUS, parseFreeLimit, type FreeLimitBody } from "@/lib/free-limits";
import type { OwnedMap } from "@/lib/set-scope";
import { PortfolioLimitNotice as FreeLimitPanel } from "./PortfolioLimitNotice";

// THE SET TRACKER'S OWNED OVERLAY — RiftCompare's SetOwned, ported in wave 2
// (2026-10-03; DECISIONS.md, "Set checklist"). OP Compare's card ids are
// numbers (Card.id) and a set is named by its slug ("op-01").
//
// A one-tap "I own this" tick on a released /sets/[slug] page's tiles, and on
// the /portfolio/sets/[set] list. It adds ONE copy at Near
// Mint through the same route every other add uses (POST
// /api/collection, so the free 50-card limit and its 402 are the route's, not
// this file's), and shows the free-limit panel inline where the tick was tapped.
//
// WHY CLIENT-SIDE. /sets/[slug] is shared by every visitor. Reading the session there would break that shared
// memo and add a per-request read for everyone, so the page reads NEITHER
// cookies nor the user (tests/set-tracker.test.ts pins it). This provider learns
// who is looking from /api/me (one shared request per page, use-me.ts) and, for
// a signed-in visitor only, makes one no-store GET /api/collection/owned?set=SLUG
// (use-watchlist's pattern). A signed-out visitor makes no request at all.
//
// On the tracker page the server has already read the owned map, so it hands it
// in as `initial`: no fetch, and a tick then refreshes the page so the progress
// and cost numbers (all computed on the server) follow.

interface Ctx {
  setSlug: string;
  /** null until known. */
  owned: OwnedMap | null;
  /** null until /api/me answers. */
  signedIn: boolean | null;
  busyId: number | null;
  limit: FreeLimitBody | null;
  clearLimit: () => void;
  tick: (cardId: number) => Promise<void>;
  /** Cards ticked with nothing loaded yet still count for the summary. */
  ownedCount: number;
}

const OwnedContext = createContext<Ctx | null>(null);

export function SetOwnedProvider({
  setSlug,
  enabled = true,
  initial,
  refreshOnChange = false,
  children,
}: {
  setSlug: string;
  /** False on a set that has not released: the ticks and the summary are not offered. */
  enabled?: boolean;
  /** The server's own read of the owned map (the tracker page), skipping the fetch. */
  initial?: OwnedMap;
  refreshOnChange?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [owned, setOwned] = useState<OwnedMap | null>(initial ?? null);
  const [signedIn, setSignedIn] = useState<boolean | null>(initial ? true : null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [limit, setLimit] = useState<FreeLimitBody | null>(null);

  // The tracker page re-renders with a fresh owned map after router.refresh().
  useEffect(() => {
    if (initial) setOwned(initial);
  }, [initial]);

  useEffect(() => {
    if (!enabled || initial) return;
    let alive = true;
    fetchMe().then(async (me) => {
      if (!alive) return;
      if (!me.user) {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);
      try {
        const res = await fetch(`/api/collection/owned?set=${encodeURIComponent(setSlug)}`, { cache: "no-store" });
        const d = res.ok ? ((await res.json()) as { owned?: OwnedMap }) : null;
        if (alive) setOwned(d?.owned ?? {});
      } catch {
        if (alive) setOwned({});
      }
    });
    return () => {
      alive = false;
    };
  }, [enabled, initial, setSlug]);

  const tick = useCallback(
    async (cardId: number) => {
      if (busyId) return;
      if (signedIn === false) {
        const next = typeof window !== "undefined" ? window.location.pathname : "/portfolio/sets";
        router.push(`/login?next=${encodeURIComponent(next)}&src=set_tracker`);
        return;
      }
      setBusyId(cardId);
      setLimit(null);
      try {
        const res = await fetch("/api/collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId, quantity: 1 }),
        });
        if (res.status === 401) {
          setSignedIn(false);
          return;
        }
        if (res.status === FREE_LIMIT_STATUS) {
          const l = parseFreeLimit(await res.json().catch(() => null));
          if (l) {
            trackEvent("free_limit_hit", { kind: "portfolio", card_id: cardId, surface: "set_tracker" });
            setLimit(l);
          }
          return;
        }
        if (!res.ok) return; // 409 (row full / busy) and 5xx: nothing was added, and the tick does not say it was
        setOwned((o) => ({ ...(o ?? {}), [String(cardId)]: ((o ?? {})[String(cardId)] ?? 0) + 1 }));
        trackEvent("collection_add", { card_id: cardId, surface: "set_tracker" });
        if (refreshOnChange) router.refresh();
      } catch {
        // Network: nothing was added; the tick stays as it was.
      } finally {
        setBusyId(null);
      }
    },
    [busyId, signedIn, router, refreshOnChange],
  );

  const state = useMemo<Ctx>(
    () => ({
      setSlug,
      owned,
      signedIn,
      busyId,
      limit,
      clearLimit: () => setLimit(null),
      tick,
      ownedCount: owned ? Object.keys(owned).length : 0,
    }),
    [setSlug, owned, signedIn, busyId, limit, tick],
  );

  return <OwnedContext.Provider value={enabled ? state : null}>{children}</OwnedContext.Provider>;
}

/** The overlay's state, or null outside a provider (or on a set that has not released). */
export function useSetOwned(): Ctx | null {
  return useContext(OwnedContext);
}

const check = (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
    <path d="M5 12.5 10 17.5 19 7.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The tick. `tile` sits over the bottom-left of a card image (the parent is
 * `relative`); `row` is an inline control for a list row; `compact` is the same
 * in a dense table row (the price guide's), so a row stays about as tall as it was.
 */
export function OwnedTick({ cardId, cardName, variant = "row" }: { cardId: number; cardName?: string; variant?: "tile" | "row" | "compact" }) {
  const ctx = useSetOwned();
  // Nothing renders until the visitor is known (and, when signed in, their
  // owned map): the server HTML of a set page carries no tick at all, so the
  // page's weight and its indexed content are exactly what they were, and a
  // tick never flashes into the wrong state.
  if (!ctx || ctx.signedIn === null || (ctx.signedIn && ctx.owned === null)) return null;
  const qty = ctx.owned?.[String(cardId)] ?? 0;
  const busy = ctx.busyId === cardId;
  const label = cardName ?? "this card";
  const tile = variant === "tile";
  // A tile is one link (CardQuickLink): a tap on the tick must not open the card.
  const onTick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void ctx.tick(cardId);
  };
  // A dense table row keeps its height: 26px there, 32px (a comfortable tap) elsewhere.
  const h = variant === "compact" ? "min-h-[26px]" : "min-h-[32px]";
  const w = variant === "compact" ? "min-w-[26px]" : "min-w-[32px]";
  const base = tile
    ? `pointer-events-auto absolute bottom-2 left-2 z-30 ${h} rounded-full border px-2.5 text-[11px] font-bold shadow-md backdrop-blur`
    : `${h} whitespace-nowrap rounded-full border px-2.5 font-sans text-xs font-bold`;
  const on = "border-brand-400/60 bg-brand-500/25 text-brand-200";
  const off = "border-ink-600 bg-ink-900/85 text-slate-300 hover:border-brand-400 hover:text-white";

  if (qty > 0) {
    return (
      <span className={tile ? "pointer-events-none absolute bottom-2 left-2 z-30 flex items-center gap-1" : variant === "compact" ? "ml-3 inline-flex items-center gap-1 align-middle" : "inline-flex items-center gap-1"}>
        <span className={`inline-flex ${h} items-center gap-1 rounded-full border px-2.5 text-xs font-bold ${on}`} data-owned={qty}>
          {check}
          <span>{qty > 1 ? `Own ×${qty}` : "Own"}</span>
        </span>
        <button
          type="button"
          onClick={onTick}
          disabled={busy}
          aria-label={`Add another copy of ${label}`}
          title="Add another copy"
          className={`pointer-events-auto grid ${h} ${w} place-items-center rounded-full border border-ink-600 bg-ink-900/85 text-sm font-bold text-slate-300 hover:border-brand-400 hover:text-white disabled:opacity-50`}
        >
          +
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onTick}
      disabled={busy}
      aria-pressed={false}
      aria-label={ctx.signedIn === false ? `Sign in to track ${label}` : `I own ${label}`}
      title={ctx.signedIn === false ? "Sign in free to tick the cards you own" : "Add one copy to your binder"}
      className={`${base} ${variant === "compact" ? "ml-3 align-middle " : ""}${off} disabled:opacity-60`}
    >
      {busy ? "…" : "+ I own this"}
    </button>
  );
}

/**
 * The line above a released set's grid: what the tick is for, and the inline
 * free-limit panel when a tap hit the 50-card limit. No fraction and no
 * percentage here (the tracker page owns the numbers, with its scope choice).
 */
export function SetOwnedStatus({ setName, trackerHref, freeLimit }: { setName: string; trackerHref: string; freeLimit: number }) {
  const ctx = useSetOwned();
  if (!ctx || ctx.signedIn === null || (ctx.signedIn && ctx.owned === null)) return null;
  return (
    <div data-set-owned-status className="mb-4 rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-3 text-sm text-slate-300">
      {ctx.signedIn === false ? (
        <p>
          Tick the cards in your binder to see what {setName} is missing and the cheapest listing for each. Free for your first{" "}
          {freeLimit} cards.{" "}
          <Link
            href={`/login?next=${encodeURIComponent(trackerHref)}&src=set_tracker`}
            rel="nofollow"
            className="font-semibold text-brand-300 underline-offset-2 hover:underline"
          >
            Sign up free
          </Link>
        </p>
      ) : ctx.owned && ctx.ownedCount > 0 ? (
        <p>
          You have {ctx.ownedCount} {ctx.ownedCount === 1 ? "card" : "cards"} from {setName} in your binder.{" "}
          <Link href={trackerHref} className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            See what&apos;s missing →
          </Link>
        </p>
      ) : (
        <p>
          Tick the cards you own with <span className="font-semibold text-white">+ I own this</span>, then see what {setName} is
          missing and the cheapest listing for each.{" "}
          <Link href={trackerHref} className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Open the set checklist →
          </Link>
        </p>
      )}
      <SetLimitPanel className="mt-3" />
    </div>
  );
}

/**
 * The existing limit:portfolio upgrade panel, inline where a tick was refused at
 * the free limit (the set page's status line, the tracker's list header). Never
 * a popup. Nothing renders until a tap has actually hit the limit.
 */
export function SetLimitPanel({ className = "" }: { className?: string }) {
  const ctx = useSetOwned();
  if (!ctx?.limit) return null;
  return <FreeLimitPanel kind="portfolio" context="set" count={ctx.limit.count} onClose={ctx.clearLimit} className={className} />;
}

interface TickHost {
  /** Where the tick is portalled: a tile's root, or a price-guide row's last cell. */
  el: HTMLElement;
  id: number;
  tile: boolean;
  name: string;
}

/**
 * Puts the ticks onto a server-rendered set page WITHOUT adding to its HTML.
 *
 * The page adds two empty marker attributes (`data-tick-grid` on the tile grid's
 * wrapper, `data-tick-rows` on the price guide's tbody) and hands this component
 * the card ids in the order the tiles and rows are drawn. Once the visitor is
 * known, it pairs them by position and portals a tick into each tile and row.
 * The server HTML and flight payload therefore carry no tick markup and no
 * per-card attributes: an earlier draft that rendered a tick component per tile
 * added 147 KB (+14%) to Origins' one-megabyte page, the page that ranks, and a
 * `data-c` attribute per node still added 101 KB. Ids are sent once, as props.
 *
 * If the DOM's count differs from the ids' (a layout this component was not
 * written for), it adds nothing rather than guess. The label for a tick's
 * aria-label is read from the tile's own heading or the row's own link.
 * `scanKey` changes when the server re-renders a different grid (page, filter,
 * sort), so the new nodes are found; the old ones are gone with the old DOM.
 */
export function SetTickLayer({ tileIds, rowIds, scanKey }: { tileIds: number[]; rowIds: number[]; scanKey: string }) {
  const ctx = useSetOwned();
  const ready = !!ctx && ctx.signedIn !== null && !(ctx.signedIn && ctx.owned === null);
  const [hosts, setHosts] = useState<TickHost[]>([]);

  useEffect(() => {
    if (!ready) return;
    const found: TickHost[] = [];
    const tiles = Array.from(document.querySelector("[data-tick-grid]")?.children ?? []) as HTMLElement[];
    if (tiles.length === tileIds.length) {
      // OP Compare's CardTile is one link; its first child is the art box
      // (relative), which the tick sits in, bottom-left of the art.
      tiles.forEach((el, i) =>
        found.push({ el: (el.firstElementChild as HTMLElement | null) ?? el, id: tileIds[i], tile: true, name: el.querySelector("h3")?.textContent?.trim() || "this card" }),
      );
    }
    const rows = Array.from(document.querySelector("[data-tick-rows]")?.children ?? []) as HTMLElement[];
    if (rows.length === rowIds.length) {
      rows.forEach((tr, i) => {
        const cell = tr.lastElementChild as HTMLElement | null;
        if (cell) found.push({ el: cell, id: rowIds[i], tile: false, name: tr.querySelector("a")?.textContent?.trim() || "this card" });
      });
    }
    setHosts(found);
    // tileIds and rowIds are new arrays on every server render; scanKey says when the grid really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, scanKey]);

  return (
    <>
      {hosts.map((h) =>
        createPortal(
          h.tile ? (
            <OwnedTick cardId={h.id} cardName={h.name} variant="tile" />
          ) : (
            <OwnedTick cardId={h.id} cardName={h.name} variant="compact" />
          ),
          h.el,
          `${h.tile ? "t" : "r"}-${h.id}`,
        ),
      )}
    </>
  );
}
