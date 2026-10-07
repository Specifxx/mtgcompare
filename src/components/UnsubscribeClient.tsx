"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Summary {
  active: boolean;
  email?: string;
  paused: boolean;
  count: number;
  cards: { id: string; name: string; setCode: string; number: string | null; market: string; snoozedUntil: string | null }[];
}

type State =
  | { phase: "loading" }
  | { phase: "ready"; summary: Summary }
  | { phase: "deleted"; removed: number }
  | { phase: "invalid" };

type Mode = "pause" | "resume" | "delete" | "remove";

const until = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// RiftCompare's UnsubscribeClient, ported in wave 2 (2026-10-03).
//
// The token-addressed page every price-alert email's footer links to
// (/unsubscribe?token=…) and anonymous watchers' "Manage your watchlist"
// button (/alerts/manage?token=…). Since 2026-09-25 it PAUSES by default:
// "Pause alert emails" keeps every watch (AlertMute, lib/alert-mute.ts), and
// deleting every watch is a separate, explicit button — the old single button
// deleted everything, targets included. `focus="delete"` (the footer's
// "Delete all my watches" link) opens with the delete confirmation shown.
export function UnsubscribeClient({ token, focus = "pause", emailOn = false }: { token: string; focus?: "pause" | "delete" | "manage"; emailOn?: boolean }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [working, setWorking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(focus === "delete");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState({ phase: "invalid" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/alerts/unsubscribe?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const data: Summary = await res.json();
        if (cancelled) return;
        if (!data.active) setState({ phase: "deleted", removed: 0 });
        else setState({ phase: "ready", summary: { ...data, cards: data.cards ?? [] } });
      } catch {
        if (!cancelled) setState({ phase: "invalid" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function post(mode: Mode, alertId?: string): Promise<{ ok?: boolean; removed?: number; paused?: boolean } | null> {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, mode, alertId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError("That didn't work — try again in a moment.");
        return null;
      }
      return data;
    } catch {
      setError("That didn't work — try again in a moment.");
      return null;
    } finally {
      setWorking(false);
    }
  }

  async function setPaused(paused: boolean) {
    if (state.phase !== "ready") return;
    const data = await post(paused ? "pause" : "resume");
    if (data) setState({ phase: "ready", summary: { ...state.summary, paused } });
  }

  async function deleteAll() {
    const data = await post("delete");
    if (data) setState({ phase: "deleted", removed: data.removed ?? 0 });
  }

  async function removeOne(id: string) {
    if (state.phase !== "ready") return;
    const data = await post("remove", id);
    if (!data) return;
    const cards = state.summary.cards.filter((c) => c.id !== id);
    if (cards.length === 0) setState({ phase: "deleted", removed: 1 });
    else setState({ phase: "ready", summary: { ...state.summary, cards, count: cards.length } });
  }

  return (
    <div className="card-surface p-6">
      {state.phase === "loading" && <p className="text-sm text-slate-400">Loading…</p>}

      {state.phase === "invalid" && (
        <>
          <h1 className="font-display text-xl font-bold text-white">Link not valid</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            This link looks broken.{emailOn ? " If you keep getting emails, reply to one and we'll sort it out." : ""}
          </p>
          <Link href="/" className="btn-ghost mt-4">
            Back to OP Compare
          </Link>
        </>
      )}

      {state.phase === "ready" && (
        <>
          <h1 className="font-display text-xl font-bold text-white">
            {state.summary.paused ? "Alert emails are paused" : "Your price-alert emails"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            <strong className="text-white">{state.summary.email}</strong> is watching{" "}
            <strong className="text-white">{state.summary.count === 1 ? "1 card" : `${state.summary.count} cards`}</strong>.{" "}
            {state.summary.paused
              ? "We keep checking their prices but send no alert emails until you resume. Nothing piles up: when you resume, you hear about news from then on."
              : "Pausing stops every price-alert email to this address and keeps your watchlist, so you can resume any time."}
          </p>

          {state.summary.paused ? (
            <button onClick={() => setPaused(false)} disabled={working} className="btn-primary mt-4 w-full">
              {working ? "Resuming…" : "Resume alert emails"}
            </button>
          ) : (
            <button onClick={() => setPaused(true)} disabled={working} className="btn-primary mt-4 w-full">
              {working ? "Pausing…" : "Pause alert emails, keep my watchlist"}
            </button>
          )}

          {state.summary.cards.length > 0 && (
            <ul className="mt-4 max-h-64 overflow-auto rounded-xl border border-ink-700 bg-ink-950/50 p-2 text-xs text-slate-400">
              {state.summary.cards.map((c) => (
                <li key={c.id} className="flex min-w-0 items-center gap-2 py-1 pl-1">
                  <span className="min-w-0 flex-1 truncate">
                    {c.name} <span className="text-slate-600">· {c.number ?? c.setCode} · {c.market}</span>
                    {c.snoozedUntil && new Date(c.snoozedUntil).getTime() > Date.now() && (
                      <span className="ml-1 text-slate-500">· snoozed until {until(c.snoozedUntil)}</span>
                    )}
                  </span>
                  <button
                    onClick={() => removeOne(c.id)}
                    disabled={working}
                    className="min-h-8 shrink-0 rounded-md px-2 text-slate-500 hover:bg-ink-800 hover:text-slate-200"
                    aria-label={`Stop watching ${c.name}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 border-t border-ink-800 pt-4">
            {confirmDelete ? (
              <>
                <p className="text-sm leading-relaxed text-slate-300">
                  Delete every watch on this address? This removes all {state.summary.count}{" "}
                  {state.summary.count === 1 ? "card" : "cards"} and any target prices, and can&apos;t be undone.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={deleteAll} disabled={working} className="btn-ghost border-red-500/40 text-red-300">
                    {working ? "Deleting…" : "Delete all my watches"}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} disabled={working} className="btn-ghost">
                    Keep them
                  </button>
                </div>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-slate-500 underline hover:text-slate-300">
                Delete all my watches instead
              </button>
            )}
          </div>
          {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
        </>
      )}

      {state.phase === "deleted" && (
        <>
          <h1 className="font-display text-xl font-bold text-white">No watches left</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {state.removed > 0
              ? "We've deleted your watches. You won't get any more price-alert emails for them."
              : "There are no watches on this link any more, so there's nothing to email you about."}
          </p>
          <Link href="/" className="btn-ghost mt-4">
            Back to OP Compare
          </Link>
        </>
      )}
    </div>
  );
}
