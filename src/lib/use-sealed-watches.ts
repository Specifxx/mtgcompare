"use client";

import { useEffect, useState } from "react";
import { fetchMe } from "./use-me";
import { trackEvent } from "./analytics";

// Shared client-side view of "which sealed products am I watching?" — the
// sealed twin of use-watchlist.ts (RiftCompare's lib/use-sealed-watches.ts,
// ported in wave 2). Module-level for the same reason: a watch button sits on
// every /sealed tile, so one request per page, not per tile, and only for a
// signed-in PAID viewer (/api/me first; a free account or a signed-out visitor
// makes no request — their sealed hearts stay in this browser, and the button
// offers Plus).
//
// Keys are `${market}|${sealedId}`: a watch is per product per market.

export interface SealedWatchRow {
  id: string;
  market: string;
  sealedId: number;
  targetCents: number | null;
  lastPriceCents?: number | null;
  snoozedUntil: string | null;
  createdAt?: string;
}

let rows: SealedWatchRow[] | null = null; // null = not loaded, or not entitled
let inflight: Promise<SealedWatchRow[] | null> | null = null;
const subscribers = new Set<(r: SealedWatchRow[] | null) => void>();

function publish() {
  const snapshot = rows ? [...rows] : null;
  for (const fn of subscribers) fn(snapshot);
}

function load(force = false): Promise<SealedWatchRow[] | null> {
  if (!inflight) {
    inflight = fetchMe()
      .then((me) => (me.user && (me.tier != null || force) ? fetch("/api/watches/sealed", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)) : null))
      .then((d: { watches?: SealedWatchRow[] } | null) => (d ? (d.watches ?? []) : null))
      .catch(() => null)
      .then((r) => {
        rows = r;
        publish();
        return r;
      });
  }
  return inflight;
}

export function invalidateSealedWatches() {
  inflight = null;
  rows = null;
  publish();
}

export const sealedWatchKey = (market: string, sealedId: number) => `${market}|${sealedId}`;

export interface SealedWatchOutcome {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
}

// `force` (the /watching list only): read the account's rows even when it is
// not entitled now, so a lapsed member can see and stop them.
export function useSealedWatches(opts: { force?: boolean } = {}) {
  const force = opts.force === true;
  const [state, setState] = useState<SealedWatchRow[] | null>(rows);
  useEffect(() => {
    subscribers.add(setState);
    void load(force).then(setState);
    return () => {
      subscribers.delete(setState);
    };
  }, [force]);
  const keys = state ? new Set(state.map((r) => sealedWatchKey(r.market, r.sealedId))) : null;
  return {
    rows: state,
    keys,
    loaded: state != null || inflight != null,
    rowFor(market: string, sealedId: number): SealedWatchRow | null {
      return state?.find((r) => r.market === market && r.sealedId === sealedId) ?? null;
    },
    async watch(sealedId: number, targetCents: number | null = null): Promise<SealedWatchOutcome> {
      const res = await fetch("/api/watches/sealed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(targetCents == null ? { sealedId } : { sealedId, targetCents }),
      }).catch(() => null);
      const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
      const ok = !!res?.ok;
      if (ok && body?.watch) {
        const w = body.watch as SealedWatchRow;
        rows = [...(rows ?? []).filter((r) => r.id !== w.id), w];
        publish();
        trackEvent("sealed_watch_add", { product: sealedId });
      }
      return { ok, status: res?.status ?? 0, body };
    },
    async unwatch(id: string): Promise<boolean> {
      const res = await fetch(`/api/watches/sealed/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
      if (!res?.ok) return false;
      rows = (rows ?? []).filter((r) => r.id !== id);
      publish();
      return true;
    },
    async update(id: string, patch: { targetCents?: number | null; snoozeDays?: number }): Promise<SealedWatchOutcome> {
      const res = await fetch(`/api/watches/sealed/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => null);
      const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
      if (res?.ok && body?.watch) {
        const w = body.watch as SealedWatchRow;
        rows = (rows ?? []).map((r) => (r.id === w.id ? w : r));
        publish();
      }
      return { ok: !!res?.ok, status: res?.status ?? 0, body };
    },
  };
}
