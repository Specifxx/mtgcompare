"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { linePath, nearestIndex, seriesChange } from "@/lib/chart";

export interface ChartData {
  xs: string[];
  height: number;
  /** Width before the wrapper is measured (default 800). */
  width?: number;
  series: { label: string; color: string; dashed: boolean; ys: (number | null)[]; labels: (string | null)[] }[];
  ranges: { key: string; label: string; start: number; lo: number; hi: number; ticks: { v: number; label: string }[] }[];
}

const FALLBACK_W = 800;
const TIP_W = 200; // the tooltip's widest measured box, in px

function tipStyle(hx: number, w: number): React.CSSProperties {
  if (hx + 10 + TIP_W <= w) return { left: hx + 10 };
  if (hx - 10 - TIP_W >= 0) return { right: w - hx + 10 };
  return { left: Math.max(4, Math.min(w - TIP_W - 4, hx - TIP_W / 2)) };
}
const PAD = { r: 14, t: 14, b: 26 };
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const longDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// The drawing half of LineChart (see that file). Drawn in real pixels once the
// wrapper is measured (RiftCompare's lesson: a fixed viewBox squashes 11px
// labels to half size on a phone). Pointer, touch and arrow keys move the
// crosshair; Esc or leaving the chart clears it.
export function LineChartInteractive({ data }: { data: ChartData }) {
  const { xs, series, ranges, height: H } = data;
  const [rangeKey, setRangeKey] = useState(ranges[ranges.length - 1].key);
  const [hover, setHover] = useState<number | null>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0) setMeasured(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const range = ranges.find((r) => r.key === rangeKey) ?? ranges[ranges.length - 1];
  const view = useMemo(
    () => ({
      xs: xs.slice(range.start),
      series: series.map((s) => ({ ...s, ys: s.ys.slice(range.start), labels: s.labels.slice(range.start) })),
    }),
    [xs, series, range.start],
  );
  const n = view.xs.length;
  const W = measured ?? data.width ?? FALLBACK_W;
  const padL = Math.max(44, Math.ceil(Math.max(...range.ticks.map((t) => t.label.length)) * 6.6) + 12);
  const plotW = Math.max(1, W - padL - PAD.r);
  const X = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const Y = (v: number) => PAD.t + (1 - (v - range.lo) / (range.hi - range.lo || 1)) * (H - PAD.t - PAD.b);
  const xLabels = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, n - 1];

  // The headline series (the first with data in this range): now, low, high, change.
  const head = view.series.find((s) => s.ys.some((v) => v != null));
  const stats = useMemo(() => {
    if (!head) return null;
    let lo = -1;
    let hi = -1;
    let last = -1;
    head.ys.forEach((v, i) => {
      if (v == null) return;
      if (lo < 0 || v < head.ys[lo]!) lo = i;
      if (hi < 0 || v > head.ys[hi]!) hi = i;
      last = i;
    });
    return { now: head.labels[last], low: head.labels[lo], high: head.labels[hi], change: seriesChange(head.ys) };
  }, [head]);

  const moveTo = (clientX: number) => {
    const el = wrap.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const u = ((clientX - rect.left) / rect.width) * W;
    setHover(nearestIndex((u - padL) / plotW, n));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setHover((h) => {
        const cur = h ?? (e.key === "ArrowLeft" ? n : -1);
        return Math.min(n - 1, Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1)));
      });
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setHover(e.key === "Home" ? 0 : n - 1);
    } else if (e.key === "Escape") setHover(null);
  };

  const hx = hover != null ? X(hover) : 0;
  const pct = stats?.change?.pct;

  return (
    <figure>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {stats && head ? (
          <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="text-slate-300">
              Now <span className="num font-bold text-accent">{stats.now}</span>
            </span>
            <span className="text-slate-500">
              Low <span className="num">{stats.low}</span>
            </span>
            <span className="text-slate-500">
              High <span className="num">{stats.high}</span>
            </span>
            {pct != null && Math.abs(pct) >= 0.05 ? (
              <span className={`num font-semibold ${pct > 0 ? "text-up" : "text-down"}`}>
                {pct > 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
              </span>
            ) : null}
          </p>
        ) : (
          <span />
        )}
        {ranges.length > 1 ? (
          <div className="flex gap-1" role="group" aria-label="Chart range">
            {ranges.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={r.key === range.key}
                onClick={() => {
                  setRangeKey(r.key);
                  setHover(null);
                }}
                className={`inline-flex min-h-11 items-center rounded-md px-3 text-xs [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:px-2.5 font-semibold transition-colors ${
                  r.key === range.key ? "bg-brand-500/15 text-brand-400" : "text-slate-500 hover:bg-ink-800 hover:text-slate-200"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        ref={wrap}
        className="relative touch-pan-y select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        tabIndex={0}
        aria-label={`${series.map((s) => s.label).join(" and ")} chart. Use the left and right arrow keys to read each day.`}
        onPointerMove={(e) => moveTo(e.clientX)}
        onPointerDown={(e) => moveTo(e.clientX)}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHover(null);
        }}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          style={{ height: H }}
          preserveAspectRatio={measured == null ? "none" : undefined}
          role="img"
          aria-hidden="true"
        >
          {range.ticks.map((t) => (
            <g key={t.v}>
              <line x1={padL} x2={W - PAD.r} y1={Y(t.v)} y2={Y(t.v)} stroke="currentColor" className="text-ink-700" strokeWidth="1" />
              <text x={padL - 8} y={Y(t.v) + 4} textAnchor="end" className="fill-slate-500 font-mono" fontSize="11">
                {t.label}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text key={i} x={X(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-slate-500" fontSize="11">
              {shortDay(view.xs[i])}
            </text>
          ))}
          {view.series.map((s) => (
            <path key={s.label} d={linePath(s.ys, X, Y)} fill="none" stroke={s.color} strokeWidth="2.2" strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {n <= 45
            ? view.series.map((s) =>
                s.ys.map((v, i) => (v == null ? null : <circle key={`${s.label}-${i}`} cx={X(i)} cy={Y(v)} r="2.5" fill={s.color} className="stroke-ink-900" strokeWidth="1" />)),
              )
            : null}
          {hover != null ? (
            <g>
              <line x1={hx} x2={hx} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" className="text-slate-400" strokeOpacity="0.6" strokeWidth="1" strokeDasharray="3 3" />
              {view.series.map((s) => {
                const v = s.ys[hover];
                return v == null ? null : <circle key={s.label} cx={hx} cy={Y(v)} r="4.5" fill={s.color} className="stroke-ink-900" strokeWidth="1.5" />;
              })}
            </g>
          ) : null}
        </svg>
        {hover != null ? (
          <div
            className="pointer-events-none absolute top-1 z-10 max-w-[calc(100%-8px)] rounded-md border border-ink-700 bg-ink-950/95 px-2.5 py-1.5 shadow-glow"
            // Beside the crosshair, on the side with room, so it never covers
            // the point being read or hangs off the chart; centred and clamped
            // when neither side fits (a narrow phone).
            style={tipStyle(hx, measured ?? W)}
            role="status"
          >
            <p className="whitespace-nowrap text-[11px] font-semibold text-slate-400">{longDay(view.xs[hover])}</p>
            {view.series.map((s) => (
              <p key={s.label} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="text-slate-400">{s.label}</span>
                <span className="num ml-auto pl-2 font-bold text-white">{s.labels[hover] ?? "—"}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
