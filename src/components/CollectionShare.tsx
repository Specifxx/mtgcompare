"use client";

import { useEffect, useState } from "react";
import { CopyPostButton } from "./CopyPostButton";

type State = { shared: boolean; url: string | null };

/**
  * Opt-in public link for the signed-in user's collection.
 *
 * Three deliberate choices, all about the fact that a shared URL cannot be
 * un-shared once it is in somebody else's chat log:
 *
 *  • OFF by default, and the current state is read from the server on mount
 *    rather than assumed — a panel that renders "not shared" while a live link
 *    exists is the worst possible bug here.
 *  • "Stop sharing" needs no confirmation (it only ever makes things more
 *    private), but "New link" DOES, because it silently breaks a link the user
 *    may have posted somewhere they can no longer edit.
 *  • The panel states plainly what a visitor can see, so nobody has to guess
 *    whether their purchase prices travel with it. They do not.
 */
export function CollectionShare() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/collection/share")
      .then((r) => (r.ok ? r.json() : { shared: false, url: null }))
      .then((d: State) => { if (alive) setState({ shared: Boolean(d.shared), url: d.url ?? null }); })
      .catch(() => { if (alive) setState({ shared: false, url: null }); });
    return () => { alive = false; };
  }, []);

  async function call(init: RequestInit, action?: "enable" | "rotate") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/collection/share", {
        ...init,
        ...(action ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) } : {}),
      });
      const d = (await res.json().catch(() => null)) as (State & { error?: string }) | null;
      if (!res.ok || !d) return setError(d?.error ?? "Something went wrong.");
      setState({ shared: Boolean(d.shared), url: d.url ?? null });
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function rotate() {
    if (typeof window !== "undefined" && !window.confirm("Create a new link? Anyone using the old one will get a 404.")) return;
    void call({ method: "POST" }, "rotate");
  }

  // Render nothing at all until the real state is known — see the note above.
  if (!state) return null;

  return (
    <section className="card-surface p-5">
      <h2 className="font-bold text-white">Share your collection</h2>
      <p className="mt-1 text-sm text-slate-400">
        A read-only page anyone can open — your cards, their conditions and what they&apos;re worth today. What you paid and
        your notes are never included.
      </p>

      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

      {state.shared && state.url ? (
        <div className="mt-3 space-y-3">
          <CopyPostButton text={state.url} label="Copy link" />
          <div className="flex flex-wrap gap-2">
            <a href={state.url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs">
              Open it →
            </a>
            <button type="button" onClick={rotate} disabled={busy} className="btn-ghost text-xs">
              New link
            </button>
            <button
              type="button"
              onClick={() => void call({ method: "DELETE" })}
              disabled={busy}
              className="btn-ghost text-xs text-rose-300"
            >
              Stop sharing
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => void call({ method: "POST" }, "enable")} disabled={busy} className="btn-primary mt-3 text-sm">
          {busy ? "…" : "Create share link"}
        </button>
      )}
    </section>
  );
}
