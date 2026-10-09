"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Constituent } from "@/lib/market-stats";

type SortKey = "rank" | "name" | "weight" | "price" | "d7";
type Dir = "asc" | "desc";
const DEFAULT_DIR: Record<SortKey, Dir> = { rank: "asc", name: "asc", weight: "desc", price: "desc", d7: "desc" };
const usd = (cents: number) => `US$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents >= 100000 ? 0 : 2, maximumFractionDigits: cents >= 100000 ? 0 : 2 })}`;

// The interactive constituents table (RiftCompare's IndexConstituents): a text
// filter, a gainers/fallers filter and a sort on every heading. The top rows of
// the basket by TCGplayer market price; weight is the card's share of the whole
// one-of-each basket.
export function IndexConstituents({ constituents }: { constituents: Constituent[] }) {
  const [q, setQ] = useState("");
  const [move, setMove] = useState<"all" | "up" | "down">("all");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [dir, setDir] = useState<Dir>("asc");
  const ranked = useMemo(() => constituents.map((c, i) => ({ c, rank: i + 1 })), [constituents]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = ranked.filter(({ c }) => {
      if (move === "up" && !(c.d7pct != null && c.d7pct > 0)) return false;
      if (move === "down" && !(c.d7pct != null && c.d7pct < 0)) return false;
      return !needle || `${c.name} ${c.variant ?? ""} ${c.setCode} ${c.number ?? ""}`.toLowerCase().includes(needle);
    });
    const val = (r: { c: Constituent; rank: number }): number | string | null =>
      sortKey === "rank" ? r.rank : sortKey === "name" ? r.c.name.toLowerCase() : sortKey === "weight" ? r.c.weightPct : sortKey === "price" ? r.c.priceCents : r.c.d7pct;
    const sign = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // missing values sort last in either direction
      if (vb == null) return -1;
      if (typeof va === "string" && typeof vb === "string") return (va < vb ? -1 : va > vb ? 1 : 0) * sign;
      return ((va as number) - (vb as number)) * sign;
    });
  }, [ranked, q, move, sortKey, dir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir(DEFAULT_DIR[key]);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">⌕</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by card or set…"
            aria-label="Filter constituents"
            className="min-h-11 w-full rounded-lg border border-ink-700 bg-ink-900 py-2 pl-9 pr-3 text-base text-white placeholder:text-slate-500 focus:border-brand-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/40 sm:min-h-0 sm:text-sm"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
          {([["all", "All"], ["up", "▲ Gainers"], ["down", "▼ Fallers"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMove(k)}
              aria-pressed={move === k}
              className={`inline-flex min-h-11 items-center rounded-md px-3 text-xs font-semibold transition-colors sm:min-h-0 sm:py-1.5 ${move === k ? "bg-ink-800 text-white" : "text-slate-400 hover:text-white"} ${k === "up" && move === k ? "text-up" : ""} ${k === "down" && move === k ? "text-down" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card-surface max-h-[34rem] overflow-auto overscroll-contain">
        <table className="w-full table-fixed text-sm sm:table-auto sm:min-w-[560px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500 [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:border-b [&>th]:border-ink-700 [&>th]:bg-ink-900">
              <SortTh label="#" col="rank" sortKey={sortKey} dir={dir} onSort={toggleSort} className="w-11 pl-3 pr-1 sm:w-auto sm:px-4" />
              <SortTh label="Card" col="name" sortKey={sortKey} dir={dir} onSort={toggleSort} className="px-2" />
              <SortTh label="Weight" col="weight" sortKey={sortKey} dir={dir} onSort={toggleSort} className="hidden px-2 sm:table-cell" align="right" />
              <SortTh label="Price" col="price" sortKey={sortKey} dir={dir} onSort={toggleSort} className="w-[6.75rem] pl-2 pr-3 sm:w-auto sm:px-2" align="right" />
              <SortTh label="7-day" col="d7" sortKey={sortKey} dir={dir} onSort={toggleSort} className="hidden px-4 sm:table-cell" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {rows.map(({ c, rank }) => (
              <tr key={c.id} className="hover:bg-ink-800">
                <td className="py-2 pl-3 pr-1 font-bold text-slate-500 sm:px-4">{rank <= 3 ? <span className="chip bg-gold/20 text-gold">{rank}</span> : rank}</td>
                <td className="px-2 py-2">
                  <Link href={`/card/${c.slug}`} className="flex min-h-11 items-center gap-2.5">
                    {c.hasImage && c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageUrl ?? ""} alt="" width={28} height={39} loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
                    ) : null}
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-white">
                        {c.name}
                        {c.variant ? <span className="font-normal text-slate-400"> · {c.variant}</span> : null}
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        {c.setCode} · {c.number ?? "—"}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="num hidden px-2 py-2 text-right text-xs text-slate-400 sm:table-cell">{c.weightPct}%</td>
                <td className="num py-2 pl-2 pr-3 text-right font-semibold text-white sm:px-2">
                  {usd(c.priceCents)}
                  <span className={`block text-[11px] font-semibold sm:hidden ${pctClass(c.d7pct)}`}>{fmtPct(c.d7pct)}</span>
                </td>
                <td className={`num hidden px-4 py-2 text-right font-semibold sm:table-cell ${pctClass(c.d7pct)}`}>{fmtPct(c.d7pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="px-4 py-10 text-center text-sm text-slate-500">No cards match that filter.</p> : null}
      </div>
      <p className="mt-2 text-[11px] text-slate-600">
        Showing {rows.length} of {constituents.length} · click a heading to sort ▲▼.
      </p>
    </div>
  );
}

function SortTh({ label, col, sortKey, dir, onSort, className = "", align = "left" }: { label: string; col: SortKey; sortKey: SortKey; dir: Dir; onSort: (k: SortKey) => void; className?: string; align?: "left" | "right" }) {
  const active = sortKey === col;
  return (
    <th className={`py-2.5 font-semibold ${className} ${align === "right" ? "text-right" : "text-left"}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button onClick={() => onSort(col)} className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-slate-200 ${active ? "text-brand-300" : ""}`} aria-label={`Sort by ${label}`}>
        {label}
        <span className={active ? "opacity-100" : "opacity-30"}>{active ? (dir === "asc" ? "▲" : "▼") : "▲▼"}</span>
      </button>
    </th>
  );
}

function pctClass(pct: number | null): string {
  return pct == null ? "text-slate-600" : pct > 0 ? "text-up" : pct < 0 ? "text-down" : "text-slate-400";
}
function fmtPct(pct: number | null): string {
  return pct == null ? "—" : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`;
}
