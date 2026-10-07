"use client";

import { useState } from "react";

const EXAMPLE = `[
  {
    "title": "Red Luffy — 1st, Example Regional",
    "author": "Player name",
    "description": "Optional notes.",
    "list": "1xOP01-001\\n4xOP01-016\\n..."
  }
]`;

// /admin/decks' JSON import (RiftCompare's AdminDeckImport). Each item runs
// through the same resolution and checks as a player's publish; the results
// say which imported and why any did not.
export function AdminDeckImport() {
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<string>("");

  async function run() {
    let decks: unknown;
    try {
      decks = JSON.parse(json);
    } catch {
      setOut("That isn't valid JSON.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decks }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setOut(
      Array.isArray(data?.results)
        ? data.results.map((r: { title: string; ok: boolean; slug?: string; error?: string }) => (r.ok ? `✓ ${r.title} → /decks/${r.slug}` : `✗ ${r.title}: ${r.error}`)).join("\n")
        : (data?.error ?? "Import failed."),
    );
  }

  return (
    <div className="card-surface p-4">
      <label htmlFor="deck-json" className="text-sm font-semibold text-white">
        Import decks (JSON array)
      </label>
      <textarea id="deck-json" rows={10} value={json} onChange={(e) => setJson(e.target.value)} placeholder={EXAMPLE} className="input mt-2 w-full font-mono text-xs" />
      <button type="button" onClick={run} disabled={busy || !json.trim()} className="btn-primary mt-2">
        {busy ? "Importing…" : "Import"}
      </button>
      {out && <pre className="mt-3 whitespace-pre-wrap text-xs text-slate-300">{out}</pre>}
    </div>
  );
}

export function AdminDeckToggle({ id, status }: { id: string; status: string }) {
  const [s, setS] = useState(status);
  async function flip() {
    const action = s === "live" ? "hide" : "show";
    const res = await fetch("/api/admin/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id }) });
    if (res.ok) setS(action === "hide" ? "hidden" : "live");
  }
  return (
    <button type="button" onClick={flip} className="btn-ghost text-xs">
      {s === "live" ? "Hide" : "Show"}
    </button>
  );
}
