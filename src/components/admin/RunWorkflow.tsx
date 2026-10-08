"use client";

import { useState } from "react";

// The "Run" button of an admin panel. With no dispatch token configured the server renders `url` only and this shows a plain link to the workflow page. Every press goes to an
// admin-gated, audited /api/admin route; the token never reaches the browser (it is read in src/lib/admin-dispatch.ts only).
export function RunWorkflow({ endpoint, label, url, enabled, warn, fields }: { endpoint: string; label: string; url: string; enabled: boolean; warn?: string; fields?: { name: string; label: string; placeholder?: string; required?: boolean }[] }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!enabled) {
    return (
      <p className="text-sm text-slate-400">
        Dispatch is off (no <code>GITHUB_DISPATCH_TOKEN</code>).{" "}
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">
          Open the workflow page and press Run workflow
        </a>
        .
      </p>
    );
  }
  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, string> = {};
      for (const f of fields ?? []) if (vals[f.name]) body[f.name] = vals[f.name]!;
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      setMsg({ ok: res.ok, text: data.message ?? data.error ?? (res.ok ? "Dispatched." : "Failed") });
    } catch {
      setMsg({ ok: false, text: "Network error" });
    }
    setBusy(false);
  };
  return (
    <div className="space-y-2">
      {warn ? <p className="text-sm text-gold">{warn}</p> : null}
      <div className="flex flex-wrap items-end gap-3">
        {(fields ?? []).map((f) => (
          <label key={f.name} className="text-xs text-slate-400">
            {f.label}
            <input className="mt-1 block rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-sm text-white" placeholder={f.placeholder} value={vals[f.name] ?? ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />
          </label>
        ))}
        <button type="button" onClick={run} disabled={busy || (fields ?? []).some((f) => f.required && !vals[f.name])} className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Dispatching..." : label}
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-400 hover:underline">
          Workflow page
        </a>
      </div>
      {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p> : null}
    </div>
  );
}
