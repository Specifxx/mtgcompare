"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { money, plural } from "@/lib/format";
import { isoOfDay, MIN_DAYS, type DayValue } from "@/lib/price-history-days";
import { formatRelease } from "@/lib/release";
import { regionOfMarket } from "@/lib/regions";

// The product page's price history, OP Compare's two-line chart (owner, 2026-11-19: "I really really like
// opcompare's price history where you have the tcgplayer market price as well as the cheapest price locally"): the cheapest in-stock
// price at the region's stores, one value a day (lib/price-history.ts, solid red), against TCGplayer's market price converted to the
// region's currency (lib/tcg-market.ts, dashed gold, labelled "converted" outside the US). Now / Low / High and the change read the
// store line; 7D / 30D / 90D / All tabs only where the history is longer; a hover, touch or arrow-key crosshair reads both lines.
// Days with nothing in stock are a gap, said so under the chart. Nothing at all under MIN_DAYS of snapshots of either line (no partial
// chart). Either line draws alone where the other has no data. The first paint is server SVG at a fixed height, so nothing shifts.
// The quick view keeps PriceHistoryChart until the quick view A/B test ends (3 Dec 2026): nothing changes there during it.

const LOCAL = "#ff6b6b";
const TCG = "#e9b73a";
const FALLBACK_W = 640;
const PAD = { r: 12, t: 12, b: 24 };
const TIP_W = 230;
const RANGES = [
  { key: "7D", days: 7 },
  { key: "30D", days: 30 },
  { key: "90D", days: 90 },
  { key: "All", days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const shortDay = (d: number) => new Date(d * 86_400_000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function tipStyle(hx: number, w: number): React.CSSProperties {
  if (hx + 10 + TIP_W <= w) return { left: hx + 10 };
  if (hx - 10 - TIP_W >= 0) return { right: w - hx + 10 };
  return { left: Math.max(4, Math.min(w - TIP_W - 4, hx - TIP_W / 2)) };
}

function linePath(ys: (number | null)[], X: (i: number) => number, Y: (v: number) => number): string {
  let d = "";
  let pen = false;
  ys.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

export function PriceHistoryTwoLine({ values, market, compact = false, tcg = [] }: { values: DayValue[]; market: string; compact?: boolean; tcg?: DayValue[] }) {
  // One day axis across both lines.
  const axis = useMemo(() => {
    const local = new Map(values.map((v) => [v.day, v]));
    const ref = new Map(tcg.filter((v) => v.cents != null).map((v) => [v.day, v.cents!]));
    const all = [...local.keys(), ...ref.keys()];
    if (!all.length) return { days: [] as number[], local: [] as (DayValue | null)[], ref: [] as (number | null)[] };
    const from = Math.min(...all);
    const to = Math.max(...all);
    const days = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    return { days, local: days.map((d) => local.get(d) ?? null), ref: days.map((d) => ref.get(d) ?? null) };
  }, [values, tcg]);
  const pricedLocal = values.filter((v) => v.cents != null).length;
  const pricedRef = axis.ref.filter((v) => v != null).length;
  const span0 = axis.days.length;
  const ranges = RANGES.filter((r) => (r.days === Infinity ? true : span0 > r.days + 1));
  const [range, setRange] = useState<RangeKey>(span0 > 91 ? "90D" : "All");
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [measuredW, setMeasuredW] = useState<number | null>(null);
  const W = measuredW ?? FALLBACK_W;
  const H = compact ? 180 : 220;
  const ok = (values.length >= MIN_DAYS && pricedLocal >= 2) || pricedRef >= MIN_DAYS;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0) setMeasuredW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ok]);

  if (!ok) return null;
  const r = RANGES.find((x) => x.key === range)!.days;
  const start = r === Infinity ? 0 : Math.max(0, span0 - r - 1);
  const days = axis.days.slice(start);
  const loc = axis.local.slice(start).map((v) => v?.cents ?? null);
  const stores = axis.local.slice(start).map((v) => v?.stores ?? 0);
  const ref = axis.ref.slice(start);
  const n = days.length;
  const region = regionOfMarket(market);
  const adjective = region?.adjective ?? market;
  const lines = [
    { label: `Cheapest ${adjective} listing`, color: LOCAL, dashed: false, ys: loc },
    { label: market === "US" ? "TCGplayer market" : "TCGplayer market (converted)", color: TCG, dashed: true, ys: ref },
  ].filter((l) => l.ys.some((v) => v != null));
  const vals = lines.flatMap((l) => l.ys).filter((v): v is number => v != null);
  if (n < 2 || !vals.length) return null;
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) {
    lo *= 0.9;
    hi = hi * 1.1 || 1;
  }
  const pad = (hi - lo) * 0.08;
  lo = Math.max(0, lo - pad);
  hi += pad;
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const fmt = (v: number) => money(Math.round(v), market);
  const padL = Math.max(44, Math.ceil(Math.max(...ticks.map((t) => fmt(t).length)) * 6.6) + 10);
  const plotW = Math.max(1, W - padL - PAD.r);
  const X = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const Y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const xLabels = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, n - 1];

  // The headline line (the store line where it has data): now, low, high and change in this range.
  const head = lines[0];
  let iLo = -1;
  let iHi = -1;
  let iLast = -1;
  let iFirst = -1;
  head.ys.forEach((v, i) => {
    if (v == null) return;
    if (iFirst < 0) iFirst = i;
    if (iLo < 0 || v < head.ys[iLo]!) iLo = i;
    if (iHi < 0 || v > head.ys[iHi]!) iHi = i;
    iLast = i;
  });
  const first = head.ys[iFirst]!;
  const pct = iLast > iFirst && first > 0 ? ((head.ys[iLast]! - first) / first) * 100 : null;
  const gaps = head === lines.find((l) => l.color === LOCAL) ? loc.filter((v, i) => v == null && axis.local[start + i] != null).length : 0;

  function at(clientX: number) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const u = ((clientX - rect.left) / rect.width) * W;
    setHover(Math.round(Math.min(1, Math.max(0, (u - padL) / plotW)) * (n - 1)));
  }
  const hx = hover != null ? X(hover) : 0;

  return (
    <figure className={compact ? "rounded-xl border border-line p-3" : "card p-4 sm:p-5"} data-price-history="">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className={compact ? "text-xs font-semibold uppercase tracking-wider text-muted" : "text-xs font-semibold uppercase tracking-wider text-muted"}>
          Price history ({region?.currency ?? "USD"} · lowest price)
        </span>
        {ranges.length > 1 && (
          <span className="flex gap-1" role="group" aria-label="Date range">
            {ranges.map((x) => (
              <button
                key={x.key}
                type="button"
                aria-pressed={range === x.key}
                onClick={() => {
                  setRange(x.key);
                  setHover(null);
                }}
                className={`inline-flex min-h-8 items-center rounded-md px-2.5 text-xs font-semibold ${range === x.key ? "bg-brand/15 text-brand" : "text-muted hover:text-ink"}`}
              >
                {x.key}
              </button>
            ))}
          </span>
        )}
      </figcaption>
      {iLast >= 0 && (
        <p className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm tabular">
          {iLast === n - 1 ? (
            <span>
              Now <b className="font-bold">{fmt(head.ys[iLast]!)}</b>
            </span>
          ) : (
            <span className="text-muted">
              Last recorded <b className="font-semibold">{fmt(head.ys[iLast]!)}</b> · {shortDay(days[iLast])}
            </span>
          )}
          <span className="text-muted">Low {fmt(head.ys[iLo]!)}</span>
          <span className="text-muted">High {fmt(head.ys[iHi]!)}</span>
          {pct != null && Math.abs(pct) >= 0.05 && (
            <span className={`font-semibold ${pct > 0 ? "text-up" : "text-down"}`}>
              {pct > 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
            </span>
          )}
        </p>
      )}
      <div
        ref={wrapRef}
        className="relative select-none"
        style={{ height: H, touchAction: "pan-y" }}
        tabIndex={0}
        aria-label={`${lines.map((l) => l.label).join(" and ")}, ${isoOfDay(days[0])} to ${isoOfDay(days[n - 1])}. Use the arrow keys to read each day.`}
        onPointerMove={(e) => at(e.clientX)}
        onPointerDown={(e) => at(e.clientX)}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHover(null);
        }}
        onFocus={() => setHover((h) => h ?? n - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n - 1) - 1));
          else if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? n - 1) + 1));
          else if (e.key === "Escape") setHover(null);
          else return;
          e.preventDefault();
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full text-muted" style={{ height: H }} role="img" aria-label={`Price from ${fmt(lo)} to ${fmt(hi)}`} preserveAspectRatio={measuredW == null ? "none" : undefined}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - PAD.r} y1={Y(t)} y2={Y(t)} className="stroke-line" strokeWidth="1" />
              <text x={padL - 6} y={Y(t) + 4} textAnchor="end" fill="currentColor" fontSize="11">
                {fmt(t)}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text key={i} x={X(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fill="currentColor" fontSize="11">
              {shortDay(days[i])}
            </text>
          ))}
          {lines.map((l) => (
            <path key={l.label} d={linePath(l.ys, X, Y)} fill="none" stroke={l.color} strokeWidth="2.2" strokeDasharray={l.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {measuredW != null && n <= 45 && lines.map((l) => l.ys.map((v, i) => (v == null ? null : <circle key={`${l.label}-${i}`} cx={X(i)} cy={Y(v)} r="2.5" fill={l.color} />)))}
          {hover != null && (
            <g>
              <line x1={hx} x2={hx} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" strokeOpacity="0.6" strokeDasharray="3 3" />
              {lines.map((l) => (l.ys[hover] == null ? null : <circle key={l.label} cx={hx} cy={Y(l.ys[hover]!)} r="4.5" fill={l.color} className="stroke-surface" strokeWidth="1.5" />))}
            </g>
          )}
        </svg>
        {hover != null && (
          <div className="pointer-events-none absolute top-1 z-10 max-w-[calc(100%-8px)] rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-xl" style={tipStyle(hx, W)} role="status">
            <p className="whitespace-nowrap text-[11px] font-semibold text-muted">
              {formatRelease(isoOfDay(days[hover]))}
              {loc[hover] != null && stores[hover] > 0 && ` · ${plural(stores[hover], "store")}`}
            </p>
            {lines.map((l) => (
              <p key={l.label} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.color }} />
                <span className="text-muted">{l.label}</span>
                <span className="tabular ml-auto pl-2 font-bold">{l.ys[hover] != null ? fmt(l.ys[hover]!) : l.color === LOCAL ? "None in stock" : "—"}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        {lines.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="inline-block w-4" style={{ borderTop: `2px ${l.dashed ? "dashed" : "solid"} ${l.color}` }} />
            {l.label}
          </span>
        ))}
      </div>
      {!compact && (
        <p className="mt-3 text-xs leading-5 text-muted">
          One snapshot a day of the cheapest in-stock price at the stores we compare, excluding shipping.
          {gaps > 0 && ` ${plural(gaps, "day")} with nothing in stock ${gaps === 1 ? "is a gap" : "are gaps"} in the line.`}
          {market !== "US" && lines.some((l) => l.dashed) && " TCGplayer’s market price is its US price at the day’s exchange rate, for reference only."} Today’s prices are in the table above.
        </p>
      )}
    </figure>
  );
}
