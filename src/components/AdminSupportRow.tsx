"use client";

import { useState } from "react";
import { SUPPORT_STATUSES } from "@/lib/inbox-rules";

// One ticket's inline editor: status and an internal note, saved to
// /api/admin/support as JSON (POST, same-origin) as each is changed.
export function AdminSupportRow({ id, initialStatus, initialNote }: { id: string; initialStatus: string; initialNote: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: { status?: string; adminNote?: string }) {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...next }) });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? `Failed (${res.status})`);
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-800 pt-3">
      <select
        aria-label="Ticket status"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          void save({ status: e.target.value });
        }}
        className="input w-auto py-1 text-xs"
        disabled={busy}
      >
        {SUPPORT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== initialNote && void save({ adminNote: note })} placeholder="Internal note…" aria-label="Internal note" maxLength={4000} className="input min-w-[160px] flex-1 py-1 text-xs" disabled={busy} />
      {saved ? <span className="text-[11px] text-emerald-400">✓ saved</span> : null}
      {error ? <span className="text-[11px] text-rose-300">{error}</span> : null}
    </div>
  );
}
