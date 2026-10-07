"use client";

import { useState } from "react";
import { COUNTRY_LIST } from "@/lib/country";
import { LIMITS } from "@/lib/inbox-rules";

const field = "mt-1 block w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-slate-100";

// /stores/suggest. Answers "already compared" for a store we read, without
// writing anything.
export function SuggestStoreForm() {
  const [form, setForm] = useState({ storeName: "", storeUrl: "", country: "US", note: "", website: "" });
  const [state, setState] = useState<{ status: "idle" | "busy" | "done" | "error"; text?: string }>({ status: "idle" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ status: "busy" });
    try {
      const res = await fetch("/api/stores/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; alreadyTracked?: boolean; alreadySuggested?: boolean };
      if (!res.ok) return setState({ status: "error", text: data.error ?? "Something went wrong. Try again later." });
      setState({
        status: "done",
        text: data.alreadyTracked
          ? "We already compare that store!"
          : data.alreadySuggested
            ? "Someone has already suggested that store — thanks, it's on the list."
            : "Thanks! The owner checks every suggestion against the criteria above.",
      });
    } catch {
      setState({ status: "error", text: "Network error. Try again." });
    }
  };

  if (state.status === "done") return <p className="card-surface p-5 text-emerald-300">{state.text}</p>;
  return (
    <form onSubmit={submit} className="card-surface space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-slate-300">
          Store name
          <input required minLength={LIMITS.storeNameMin} maxLength={LIMITS.storeNameMax} value={form.storeName} onChange={set("storeName")} className={field} />
        </label>
        <label className="text-sm text-slate-300">
          Web address
          <input required maxLength={LIMITS.storeUrl} value={form.storeUrl} onChange={set("storeUrl")} placeholder="example.com" inputMode="url" className={field} />
        </label>
      </div>
      <label className="block text-sm text-slate-300">
        Market it sells to
        <select value={form.country} onChange={set("country")} className={`${field} max-w-xs`}>
          {COUNTRY_LIST.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
          <option value="OTHER">Somewhere else</option>
        </select>
      </label>
      <label className="block text-sm text-slate-300">
        Anything we should know? (optional)
        <textarea maxLength={LIMITS.suggestionNote} rows={3} value={form.note} onChange={set("note")} className={field} />
      </label>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={form.website} onChange={set("website")} />
      {state.status === "error" ? <p className="text-sm text-red-300">{state.text}</p> : null}
      <button type="submit" disabled={state.status === "busy"} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">
        {state.status === "busy" ? "Sending…" : "Suggest this store"}
      </button>
    </form>
  );
}
