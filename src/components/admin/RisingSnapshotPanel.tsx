"use client";

import { useEffect, useState } from "react";

// Mints a public OP Compare Hot 40 snapshot and lists the ones already minted
// (RiftCompare's RisingSnapshotPanel). Every call is same-origin JSON through
// /api/admin/rising-snapshot (requireAdminApi); deleting is a POST too.
//
// The generated TITLE is the point of the panel, not a label on the button —
// it is what makes one link distinguishable from another, and the operator
// needs to see it before sending the link anywhere. So it is shown large,
// immediately, next to the URL it belongs to.
//
// The URL is a capability: anyone holding it sees the snapshot. Unlike a store
// report there is nothing private in it (the same frozen public numbers for
// every viewer), so it is safe to list every past link here rather than show
// each once.
//
// DELETE (2026-09-28) asks first, naming the snapshot: the link dies for
// everyone who has it, and there is no undo. Movement never reads a snapshot
// (it compares with the ranking a week ago), so deleting one changes no arrow.
interface Snapshot {
  id: string;
  token: string;
  scope: string;
  title: string;
  createdAt: string;
  url: string;
}

export function RisingSnapshotPanel({ scope }: { scope: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<Snapshot[] | null>(null);
  const [justMade, setJustMade] = useState<{
    title: string;
    url: string;
    picks: number;
    comparedWith: { asOf: string } | null;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/admin/rising-snapshot", { cache: "no-store" });
      const d = await r.json();
      setList(d.snapshots ?? []);
    } catch {
      setList([]);
    }
  }
  useEffect(() => {
    void load();
    // Once, on mount: load() reads nothing from props or state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mint() {
    setBusy(true);
    setError(null);
    setJustMade(null);
    try {
      const r = await fetch("/api/admin/rising-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mint", scope }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error ?? "Could not generate the snapshot");
        return;
      }
      setJustMade({ title: d.title, url: d.url, picks: d.picks, comparedWith: d.comparedWith ?? null });
      void load();
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Snapshot) {
    const ok = window.confirm(
      `Delete this snapshot?\n\n${s.title}\n\nIts link stops working for everyone who has it. This can't be undone.`,
    );
    if (!ok) return;
    setDeleting(s.id);
    setError(null);
    try {
      const r = await fetch("/api/admin/rising-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: s.id }),
      });
      const d = await r.json().catch(() => ({}));
      // 404 means it is already gone: drop it from the list either way.
      if (!r.ok && r.status !== 404) {
        setError(d.error ?? "Could not delete the snapshot");
        return;
      }
      setList((cur) => (cur ?? []).filter((x) => x.id !== s.id));
      if (justMade?.url === s.url) setJustMade(null);
    } catch {
      setError("Could not reach the server");
    } finally {
      setDeleting(null);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — the URL is selectable on screen either way */
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-ink-700 bg-ink-850 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white">Public Hot 40 snapshot</h2>
          <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-slate-400">
            Freezes the <strong className="text-slate-300">{scope}</strong> ranking exactly as it is now and mints a
            link anyone can open — no account, no Premium. The numbers never change after this; the live screener
            keeps moving.
          </p>
        </div>
        <button onClick={mint} disabled={busy} className="btn-primary shrink-0 text-sm">
          {busy ? "Generating…" : `Generate ${scope} snapshot`}
        </button>
      </div>

      {error && <p className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}

      {justMade && (
        <div className="mt-3 rounded-lg border border-brand-500/40 bg-brand-500/10 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand-400">Generated title</p>
          <p className="mt-1 text-sm font-bold leading-snug text-white">{justMade.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-ink-950 px-2 py-1.5 text-[11px] text-slate-300">{justMade.url}</code>
            <button onClick={() => copy(justMade.url)} className="btn-ghost shrink-0 px-2 py-1 text-xs">
              {copied === justMade.url ? "Copied" : "Copy"}
            </button>
            <a href={justMade.url} target="_blank" rel="noopener noreferrer" className="btn-ghost shrink-0 px-2 py-1 text-xs">
              Open
            </a>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {justMade.picks} cards frozen into this link.{" "}
            {justMade.comparedWith
              ? `Movement ▲▼ is against the same ranking a week earlier (${new Date(`${justMade.comparedWith.asOf}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}).`
              : "The ranking a week earlier couldn't be rebuilt, so this one carries no movement."}
          </p>
        </div>
      )}

      {list && list.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-white">
            Previous snapshots ({list.length})
          </summary>
          <ul className="mt-2 divide-y divide-ink-800 border-t border-ink-800">
            {list.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-slate-200">{s.title}</span>
                  <span className="num block text-[10px] text-slate-500">
                    {s.scope} · {new Date(s.createdAt).toLocaleString()}
                  </span>
                </span>
                <button onClick={() => copy(s.url)} className="btn-ghost shrink-0 px-2 py-1 text-[11px]">
                  {copied === s.url ? "Copied" : "Copy link"}
                </button>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn-ghost shrink-0 px-2 py-1 text-[11px]">
                  Open
                </a>
                <button
                  onClick={() => remove(s)}
                  disabled={deleting === s.id}
                  className="btn-ghost shrink-0 px-2 py-1 text-[11px] text-rose-300 hover:text-rose-200"
                  aria-label={`Delete snapshot: ${s.title}`}
                >
                  {deleting === s.id ? "Deleting…" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
