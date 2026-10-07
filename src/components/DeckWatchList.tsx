"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCountry } from "./CountryProvider";
import { moneyCode } from "@/lib/format";
import { currencyOf, type Country } from "@/lib/country";
import { DECK_WATCH_LIMIT } from "@/lib/tier-limits";
import { MIN_CONDITIONS, MIN_CONDITION_LABEL, MIN_CONDITION_PHRASE, storedMinCondition, toStoredMinCondition, type MinCondition } from "@/lib/basket-condition";

// The "Decks" section of /watching (Premium, 2026-09-29): every saved list
// the paid run prices (lib/deck-watch.ts), with its last delivered total,
// target edit, snooze and stop. Shown to a Premium member, and to an owner whose
// plan has lapsed (rows are kept; `lapsed` turns off the paid controls and says
// they resume on resubscribing — stop and snooze need no plan); the page teaches
// everyone else what a deck price watch is instead.
interface Row {
  id: string;
  market: string;
  name: string;
  listText: string;
  // "nm" | "lp" | null (any): lib/basket-condition.ts. Null is every watch saved before it.
  minCondition: string | null;
  targetCents: number | null;
  lastTotalCents: number | null;
  lastCheckedAt: string | null;
  lastEmailedCents: number | null;
  lastNotifiedAt: string | null;
  lastFlaggedAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// `emailOn` is getEmailStatus().enabled from the page: while email is off nothing
// here promises an email, the alert lands in the member's notifications.
export function DeckWatchList({ lapsed = false, emailOn = false }: { lapsed?: boolean; emailOn?: boolean }) {
  const { country } = useCountry();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/watches/deck", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { watches: Row[] }) => setRows(d.watches))
      .catch(() => setError("Couldn't load your deck watches."));
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/watches/deck/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const d = res ? ((await res.json().catch(() => null)) as { watch?: Row; error?: string } | null) : null;
    if (!res?.ok || !d?.watch) {
      setError(d?.error ?? "Couldn't save that.");
      return;
    }
    setError(null);
    setRows((prev) => (prev ?? []).map((r) => (r.id === id ? d.watch! : r)));
  }
  async function stop(id: string) {
    const res = await fetch(`/api/watches/deck/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setError("Couldn't stop that watch.");
      return;
    }
    setRows((prev) => (prev ?? []).filter((r) => r.id !== id));
  }

  if (error && !rows) return <p className="text-sm text-rose-400">{error}</p>;
  if (!rows) return <p className="text-sm text-slate-500">Loading…</p>;
  if (rows.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-slate-400">
        No lists yet. Price a deck in{" "}
        <Link href="/tools/best-basket" className="text-brand-400 hover:underline">
          Best Basket
        </Link>{" "}
        or the{" "}
        <Link href="/deck" className="text-brand-400 hover:underline">
          deck pricer
        </Link>{" "}
        and press &ldquo;Watch this list&rdquo;: we re-price it after every price update and {emailOn ? "email you" : "tell you in your notifications"} when its delivered total
        reaches your price. Up to {DECK_WATCH_LIMIT} lists.
      </p>
    );
  }
  return (
    <div>
      {lapsed && (
        <p className="mb-2 text-xs leading-relaxed text-amber-300" data-lapsed-note>
          Your plan has ended, so these lists are not being priced or alerted. They resume if you rejoin Premium; stop any you no longer want.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-2 text-xs text-rose-400">
          {error}
        </p>
      )}
      <ul className="divide-y divide-ink-800">
        {rows.map((r) => {
          const cur = currencyOf(r.market as Country);
          const m = (c: number) => moneyCode(c, cur);
          const snoozed = r.snoozedUntil && new Date(r.snoozedUntil).getTime() > Date.now();
          const lines = r.listText.split("\n").filter((l) => l.trim()).length;
          return (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{r.name}</span>
                  <span className="chip bg-ink-800 text-[10px] text-slate-400">{r.market}</span>
                  <span className="text-xs text-slate-500">
                    {lines} {lines === 1 ? "line" : "lines"}
                  </span>
                  {snoozed && <span className="chip bg-amber-500/15 text-[10px] text-amber-300">Snoozed until {day(r.snoozedUntil!)}</span>}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {r.lastTotalCents != null ? (
                    <>
                      Last check: <span className="num font-semibold text-white">{m(r.lastTotalCents)}</span> delivered
                      {r.lastCheckedAt ? ` (${day(r.lastCheckedAt)})` : ""}
                    </>
                  ) : (
                    "Not priced yet — it is checked after the next price update."
                  )}
                  {r.lastEmailedCents != null && (r.lastNotifiedAt || r.lastFlaggedAt)
                    ? ` · ${r.lastNotifiedAt ? "emailed" : "alerted"} at ${m(r.lastEmailedCents)} on ${day((r.lastNotifiedAt ?? r.lastFlaggedAt)!)}`
                    : ""}
                </div>
                {r.market !== country && <div className="mt-0.5 text-[11px] text-slate-500">Priced in its own market ({r.market}), not the one you are browsing.</div>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-slate-400">
                  Condition
                  <select
                    value={storedMinCondition(r.minCondition)}
                    disabled={lapsed}
                    onChange={(e) => {
                      const next = e.target.value as MinCondition;
                      if (toStoredMinCondition(next) !== (r.minCondition ?? null)) void patch(r.id, { minCondition: next });
                    }}
                    className="input py-1 text-xs"
                    aria-label={`Minimum condition for ${r.name}`}
                  >
                    {MIN_CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {MIN_CONDITION_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1 text-xs text-slate-400">
                  Target ({cur})
                  <TargetInput cents={r.targetCents} disabled={lapsed} onSave={(c) => patch(r.id, { targetCents: c })} />
                </label>
                {!lapsed && (
                  <Link href={`/tools/best-basket?watch=${encodeURIComponent(r.id)}`} className="btn-ghost text-xs">
                    Open plan
                  </Link>
                )}
                <button type="button" onClick={() => patch(r.id, { snoozeDays: snoozed ? 0 : 30 })} className="btn-ghost text-xs">
                  {snoozed ? "Unsnooze" : "Snooze 30 days"}
                </button>
                <button type="button" onClick={() => stop(r.id)} className="text-xs text-slate-500 hover:text-rose-300">
                  Stop
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">
        {rows.length} of {DECK_WATCH_LIMIT} lists. Empty the target to be {emailOn ? "emailed" : "alerted"} on any real drop (5% and a whole unit) instead.
        {rows.some((r) => r.minCondition) && (
          <>
            {" "}
            A list with a condition ({[...new Set(rows.filter((r) => r.minCondition).map((r) => MIN_CONDITION_PHRASE[storedMinCondition(r.minCondition)]))].join(", ")}) only uses listings at
            that condition, so if a card has none in stock it stays quiet until it does; Open plan shows which. Changing a list&apos;s condition starts its
            price history again.
          </>
        )}
      </p>
    </div>
  );
}

// A small "save on blur" money field: empty = no target.
export function TargetInput({ cents, onSave, disabled = false, className = "input w-28 text-xs" }: { cents: number | null; onSave: (cents: number | null) => void; disabled?: boolean; className?: string }) {
  const [v, setV] = useState(cents == null ? "" : (cents / 100).toFixed(2));
  useEffect(() => setV(cents == null ? "" : (cents / 100).toFixed(2)), [cents]);
  return (
    <input
      value={v}
      inputMode="decimal"
      disabled={disabled}
      placeholder="any drop"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const t = v.trim();
        if (!t) {
          if (cents != null) onSave(null);
          return;
        }
        const n = Number(t.replace(/[^\d.]/g, ""));
        if (!Number.isFinite(n) || n <= 0) return;
        const c = Math.round(n * 100);
        if (c !== cents) onSave(c);
      }}
      className={className}
    />
  );
}
