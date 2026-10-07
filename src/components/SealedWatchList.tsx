"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSealedWatches } from "@/lib/use-sealed-watches";
import { money } from "@/lib/format";
import { COUNTRIES, isCountry } from "@/lib/country";
import { SEALED_CHECK_CADENCE, SEALED_WATCH_LIMIT_PLUS } from "@/lib/alert-limits";

// The "Sealed" section of /watching (Plus and Premium) — RiftCompare's
// SealedWatchList, ported in wave 2 (2026-10-03): every sealed product the
// alert run checks, with its target, snooze and stop. `names` come from the
// page's own cached getSealedCatalog read (keyed by Sealed.id). Snooze is an
// email control, so it shows only once email is on (`snooze`).
export interface SealedWatchName {
  name: string;
  slug: string;
  /** The cheapest listing in each market, in that market's currency. */
  low: Record<string, number | null>;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

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

export function SealedWatchList({ names, limit, lapsed = false, snooze = false }: { names: Record<number, SealedWatchName>; limit: number | null; lapsed?: boolean; snooze?: boolean }) {
  const { rows, update, unwatch } = useSealedWatches({ force: lapsed });
  const [error, setError] = useState<string | null>(null);
  if (!rows) return <p className="text-sm text-slate-500">Loading…</p>;
  if (rows.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-slate-400">
        No sealed products yet. Tap the heart on any product on{" "}
        <Link href="/sealed" className="text-brand-400 hover:underline">
          /sealed
        </Link>{" "}
        and we {snooze ? "email you" : "flag it here"} when it is back in stock after selling out everywhere, at your target, or on a real drop — checked{" "}
        {SEALED_CHECK_CADENCE}.{limit != null ? ` Plus watches up to ${SEALED_WATCH_LIMIT_PLUS}; Premium has no limit.` : ""}
      </p>
    );
  }
  return (
    <div>
      {lapsed && (
        <p className="mb-2 text-xs leading-relaxed text-amber-300" data-lapsed-note>
          Your plan has ended, so these are not being checked. They resume if you rejoin Plus; stop any you no longer want.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-2 text-xs text-rose-400">
          {error}
        </p>
      )}
      <ul className="divide-y divide-ink-800">
        {rows.map((r) => {
          const mkt = isCountry(r.market) ? r.market : "US";
          const cur = COUNTRIES[mkt].currency;
          const info = names[r.sealedId];
          const low = info?.low[mkt] ?? null;
          const snoozed = r.snoozedUntil && new Date(r.snoozedUntil).getTime() > Date.now();
          return (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {info ? (
                    <Link href={`/sealed/${info.slug}`} className="font-semibold text-white hover:text-brand-400">
                      {info.name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-white">Product {r.sealedId}</span>
                  )}
                  <span className="chip bg-ink-800 text-[10px] text-slate-400">{r.market}</span>
                  {snooze && snoozed && <span className="chip bg-amber-500/15 text-[10px] text-amber-300">Snoozed until {day(r.snoozedUntil!)}</span>}
                  {r.targetCents != null && low != null && low <= r.targetCents ? (
                    <span className="chip border border-up/40 bg-up/10 text-[10px] font-semibold text-up">At your target</span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {info
                    ? low != null
                      ? `Cheapest in stock now: ${money(low, mkt)}`
                      : "Not in stock at any store we track right now."
                    : "No longer in our sealed catalogue — we keep checking."}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-slate-400">
                  Target ({cur})
                  <TargetInput
                    cents={r.targetCents}
                    disabled={lapsed}
                    onSave={async (c) => {
                      const out = await update(r.id, { targetCents: c });
                      setError(out.ok ? null : ((out.body?.error as string | undefined) ?? "Couldn't save that."));
                    }}
                  />
                </label>
                {snooze ? (
                  <button type="button" onClick={() => void update(r.id, { snoozeDays: snoozed ? 0 : 30 })} className="btn-ghost text-xs">
                    {snoozed ? "Unsnooze" : "Snooze 30 days"}
                  </button>
                ) : null}
                <button type="button" onClick={() => void unwatch(r.id)} className="tap-link text-xs text-slate-500 hover:text-rose-300">
                  Stop
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">
        {rows.length} {rows.length === 1 ? "product" : "products"}
        {limit != null ? ` of ${limit}` : ""}. A target {snooze ? "emails you" : "is flagged"} at or under that price; without one, restocks and real drops still are.
      </p>
    </div>
  );
}
