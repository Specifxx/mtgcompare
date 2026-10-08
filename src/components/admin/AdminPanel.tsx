import type { ReactNode } from "react";
import type { Level } from "@/lib/admin-alarms";

// Small pieces the admin panels share: a traffic light (never colour alone: the word is printed too), a labelled row table and a bar strip. Pure rendering, no data access.
const DOT: Record<Level, string> = { ok: "bg-emerald-400", warn: "bg-amber-400", bad: "bg-red-500", unknown: "bg-slate-500" };
const WORD: Record<Level, string> = { ok: "OK", warn: "Watch", bad: "Act", unknown: "Unknown" };

export function Light({ level, label }: { level: Level; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-300" data-level={level}>
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${DOT[level]}`} />
      {label ?? WORD[level]}
    </span>
  );
}

export function Rows({ rows }: { rows: { label: string; value: ReactNode; level?: Level; note?: ReactNode }[] }) {
  return (
    <dl className="card-surface divide-y divide-ink-700">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
          <dt className="w-44 shrink-0 text-slate-400">{r.label}</dt>
          <dd className="min-w-0 flex-1 break-words text-white">
            {r.value}
            {r.note ? <span className="ml-2 text-xs text-slate-400">{r.note}</span> : null}
          </dd>
          {r.level ? <Light level={r.level} /> : null}
        </div>
      ))}
    </dl>
  );
}

export function Bars({ points, label }: { points: { k: string; n: number }[]; label: string }) {
  const max = Math.max(1, ...points.map((p) => p.n));
  return (
    <div role="img" aria-label={label} className="flex h-16 items-end gap-0.5">
      {points.map((p) => (
        <span key={p.k} title={`${p.k}: ${p.n}`} className="min-w-[3px] flex-1 rounded-sm bg-brand-500/70" style={{ height: `${Math.max(2, Math.round((p.n / max) * 100))}%` }} />
      ))}
    </div>
  );
}

export function RollupList({ title, rows, empty = "No clicks yet" }: { title: string; rows: { k: string; n: number }[]; empty?: string }) {
  return (
    <div className="card-surface p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.k} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-slate-300">{r.k}</span>
              <span className="num text-white">{r.n.toLocaleString("en-US")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
