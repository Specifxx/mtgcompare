"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Line = { ok: boolean; text: string; notes?: string[] };

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "Network error" } };
  }
}

// /admin/accounts: manual grant/revoke and "sync Stripe now". Every call goes
// to an admin-gated, audited /api/admin route; none of them calls Stripe
// except the sync, which runs the same reconcile as the daily cron.
export function BillingRepair() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(365);
  const [busy, setBusy] = useState<string | null>(null);
  const [line, setLine] = useState<Line | null>(null);
  const [sync, setSync] = useState<Line | null>(null);

  const grant = async (tier: "plus" | "premium") => {
    setBusy(tier);
    const { ok, data } = await post("/api/admin/grant-premium", { email, days, tier });
    setBusy(null);
    if (!ok) return setLine({ ok: false, text: String(data.error ?? "Failed") });
    const name = data.tier === "plus" ? "Plus" : "Premium";
    setLine({
      ok: true,
      text: `${String(data.email)} is ${name} until ${fmt(String(data.premiumUntil))}`,
      notes: !data.tierChanged && data.tier !== tier ? [`They already had an active ${name} membership, so the days were added at ${name}.`] : undefined,
    });
    router.refresh();
  };

  const revoke = async () => {
    if (!email.trim()) return setLine({ ok: false, text: "Enter the account's email" });
    if (!window.confirm(`Remove ${email.trim()}'s membership date? This does not cancel Stripe.`)) return;
    setBusy("revoke");
    const { ok, data } = await post("/api/admin/revoke-premium", { email });
    setBusy(null);
    if (!ok) return setLine({ ok: false, text: String(data.error ?? "Failed") });
    const notes: string[] = [];
    if (data.stillAdmin) notes.push("Still an admin, so it still reads as Premium.");
    if (data.hasStripeCustomer) {
      notes.push("Has a Stripe customer. If they still have a live subscription, the next webhook or the daily reconcile re-grants it. Cancel in the Stripe dashboard first.");
    }
    setLine({ ok: true, text: `${String(data.email)}: membership date removed${data.was ? ` (was ${fmt(String(data.was))})` : ""}`, notes });
    router.refresh();
  };

  const runSync = async () => {
    setBusy("sync");
    const { ok, data } = await post("/api/admin/stripe-reconcile", {});
    setBusy(null);
    if (!ok) return setSync({ ok: false, text: String(data.error ?? "Failed") });
    if (data.skipped) return setSync({ ok: false, text: String(data.skipped) });
    const unmatched = Array.isArray(data.unmatched) ? (data.unmatched as string[]) : [];
    const stamped = Number(data.stamped ?? 0);
    setSync({
      ok: true,
      text: stamped || unmatched.length ? `Checked ${Number(data.seen ?? 0)} · ${stamped} updated` : "Everything already in sync",
      notes: unmatched.length ? [`No OP Compare account for: ${unmatched.join(", ")}`] : undefined,
    });
    router.refresh();
  };

  const Result = ({ l }: { l: Line }) => (
    <div className="mt-3 text-sm">
      <p className={l.ok ? "text-emerald-300" : "text-red-300"}>
        {l.ok ? "✓" : "✗"} {l.text}
      </p>
      {l.notes?.map((n) => (
        <p key={n} className="mt-1 text-xs text-gold">
          {n}
        </p>
      ))}
    </div>
  );

  return (
    <section className="card-surface p-5">
      <h2 className="text-lg text-white">Premium &amp; billing repair</h2>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1 text-xs text-slate-400">
          Account email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-slate-100" />
        </label>
        <label className="w-28 text-xs text-slate-400">
          Days
          <input type="number" min={1} max={1830} value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-slate-100" />
        </label>
        <button type="button" disabled={busy != null} onClick={() => grant("premium")} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">
          {busy === "premium" ? "…" : "Grant Premium"}
        </button>
        <button type="button" disabled={busy != null} onClick={() => grant("plus")} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-ink-800 disabled:opacity-50">
          {busy === "plus" ? "…" : "Grant Plus"}
        </button>
        <button type="button" disabled={busy != null} onClick={revoke} className="rounded-lg border border-red-400/50 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-400/10 disabled:opacity-50">
          {busy === "revoke" ? "…" : "Revoke"}
        </button>
      </div>
      {line ? <Result l={line} /> : null}
      <ul className="mt-3 space-y-0.5 text-xs text-slate-400">
        <li>Grants stack on the current date.</li>
        <li>Granting Premium to someone with an active Plus subscription adds days at Plus.</li>
        <li>Revoke never cancels Stripe and never removes admin.</li>
      </ul>
      <div className="mt-4 border-t border-ink-800 pt-4">
        <button type="button" disabled={busy != null} onClick={runSync} className="btn-ghost min-h-9 text-xs">
          {busy === "sync" ? "Syncing…" : "Sync Stripe subscriptions now"}
        </button>
        {sync ? <Result l={sync} /> : null}
      </div>
    </section>
  );
}
