"use client";

import { FINISH_INDEX, type Finish } from "@/lib/constants";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { COUNTRIES, type Country } from "@/lib/country";
import { ISSUE_LABELS, LIMITS, REPORT_ISSUES, type ReportIssue } from "@/lib/inbox-rules";

// "Spotted a wrong price?" under a price board. The price we showed is NOT
// sent: the server reads it from the Offer row. Sign-in is optional.
export function ReportPriceButton({ productId, market, offers, finish = "N" }: { productId: number; market: Country; offers: { source: string; label: string }[]; finish?: Finish }) {
  const page = (usePathname() ?? "").slice(0, 200) || undefined;
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(offers[0]?.source ?? "");
  const [issue, setIssue] = useState<ReportIssue>("PRICE_WRONG");
  const [claimed, setClaimed] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<{ status: "idle" | "busy" | "done" | "error"; error?: string }>({ status: "idle" });
  if (!offers.length) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ status: "busy" });
    const c = Number.parseFloat(claimed);
    const claimedCents = issue === "PRICE_WRONG" && claimed.trim() && Number.isFinite(c) ? Math.round(c * 100) : undefined;
    try {
      const res = await fetch("/api/price-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, finish: FINISH_INDEX[finish], source, market, issue, claimedCents, note, page, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setState(res.ok ? { status: "done" } : { status: "error", error: data.error ?? "Something went wrong. Try again later." });
    } catch {
      setState({ status: "error", error: "Network error. Try again." });
    }
  };

  if (state.status === "done") return <p className="px-5 py-3 text-sm text-emerald-300">Thanks — the owner reviews every report.</p>;
  if (!open) {
    return (
      <p className="px-5 py-3 text-center text-xs">
        <button type="button" onClick={() => setOpen(true)} className="text-slate-400 underline hover:text-slate-200">
          Spotted a wrong price or wrong printing? Report it
        </button>
      </p>
    );
  }
  const field = "mt-1 block w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-slate-100";
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-ink-800 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-400">
          Store
          <select value={source} onChange={(e) => setSource(e.target.value)} className={field}>
            {offers.map((o) => (
              <option key={o.source} value={o.source}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          What&apos;s wrong
          <select value={issue} onChange={(e) => setIssue(e.target.value as ReportIssue)} className={field}>
            {REPORT_ISSUES.map((k) => (
              <option key={k} value={k}>
                {ISSUE_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {issue === "PRICE_WRONG" ? (
        <label className="block text-xs text-slate-400">
          The price the store actually charges ({COUNTRIES[market].symbol}, optional)
          <input type="number" inputMode="decimal" min="0.01" step="0.01" value={claimed} onChange={(e) => setClaimed(e.target.value)} className={`${field} max-w-[12rem]`} />
        </label>
      ) : null}
      <label className="block text-xs text-slate-400">
        Note (optional)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.reportNote} rows={2} className={field} />
      </label>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} />
      {state.status === "error" ? <p className="text-sm text-red-300">{state.error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={state.status === "busy"} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">
          {state.status === "busy" ? "Sending…" : "Send report"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </form>
  );
}
