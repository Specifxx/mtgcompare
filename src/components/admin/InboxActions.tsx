"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface StatusOption {
  value: string; // the `action` posted
  label: string;
  destructive?: boolean; // asks destructiveConfirm first (Delete)
}

// One row of inbox actions: each button POSTs {id, action} as JSON to an
// /api/admin/* route, then refreshes the server-rendered page. The current
// status is shown disabled.
export function StatusButtons({
  endpoint,
  id,
  current,
  options,
  destructiveConfirm = "Delete this for good?",
}: {
  endpoint: string;
  id: string;
  current: string;
  options: StatusOption[];
  destructiveConfirm?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (o: StatusOption) => {
    if (o.destructive && !window.confirm(destructiveConfirm)) return;
    setBusy(o.value);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: o.value }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? `Failed (${res.status})`);
      else router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={busy != null || o.value === current}
          onClick={() => run(o)}
          className={`rounded border px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
            o.destructive ? "border-red-400/50 text-red-300 hover:bg-red-400/10" : o.value === current ? "border-brand-500 bg-brand-500/15 text-white" : "border-ink-700 text-slate-300 hover:bg-ink-800"
          }`}
        >
          {busy === o.value ? "…" : o.label}
        </button>
      ))}
      {error ? <span className="text-xs text-red-300">✗ {error}</span> : null}
    </div>
  );
}

/** Copies a listing title for tests/match.test.ts. */
export function CopyText({ text, label = "Copy title" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        })
      }
      className="rounded border border-ink-700 px-2 py-1 text-xs text-slate-300 hover:bg-ink-800"
    >
      {done ? "✓ Copied" : label}
    </button>
  );
}
