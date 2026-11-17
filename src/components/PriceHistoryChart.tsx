"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { money, plural } from "@/lib/format";
import { isoOfDay, MIN_DAYS, type DayValue } from "@/lib/price-history-days";
import { formatRelease } from "@/lib/release";

// The product page's and the quick view's price history (lib/price-history.ts): the cheapest in-stock price at the region's stores, one
// value a day, as a step line. Ported from RiftCompare's chart (owner, 2026-11-17: "the price history can get significantly improved ...
// data points, hover for the exact price, in the quick view as well"): range pills, a hover/touch crosshair with the exact price and
// day, a dot on every day the price changed, themed through tokens. The first paint is the SAME server-rendered SVG as before (no
// script needed to read it, a fixed height so nothing shifts); the pointer layer only adds the tooltip. Nothing at all under MIN_DAYS of
// snapshots (no partial chart). Days with nothing in stock are a gap in the line, said so under it. Never a store's own line: the history
// is the cheapest price, nothing else (lib/price-history.ts).

const FALLBACK_W = 640;
const PAD = { l: 8, r: 8, t: 14, b: 14 };
const RANGES = [
  { key: "30D", days: 30 },
  { key: "90D", days: 90 },
  { key: "All", days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

export function PriceHistoryChart({ values, market, compact = false }: { values: DayValue[]; market: string; compact?: boolean }) {
  const priced0 = values.filter((v) => v.cents != null);
  const span0 = values.length ? values[values.length - 1].day - values[0].day + 1 : 0;
  // A pill is drawn only when it would show something different from the others.
  const ranges = RANGES.filter((r) => (r.days === Infinity ? span0 > 30 : span0 > r.days));
  const [range, setRange] = useState<RangeKey>(span0 > 90 ? "90D" : "All");
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [measuredW, setMeasuredW] = useState<number | null>(null);
  const W = measuredW ?? FALLBACK_W;
  const H = compact ? 104 : 160;
  const ok = values.length >= MIN_DAYS && priced0.length >= 2;

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

  const data = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    if (days === Infinity || !values.length) return values;
    const from = values[values.length - 1].day - days + 1;
    const f = values.filter((v) => v.day >= from);
    return f.filter((v) => v.cents != null).length >= 2 ? f : values;
  }, [values, range]);

  if (!ok) return null;
  const priced = data.filter((v): v is DayValue & { cents: number } => v.cents != null);
  const lo = Math.min(...priced.map((v) => v.cents));
  const hi = Math.max(...priced.map((v) => v.cents));
  const span = Math.max(1, hi - lo);
  const first = data[0].day;
  const last = data[data.length - 1].day;
  const x = (d: number) => PAD.l + ((d - first) / Math.max(1, last - first)) * (W - PAD.l - PAD.r);
  const y = (c: number) => PAD.t + (1 - (c - lo) / span) * (H - PAD.t - PAD.b);
  // A step path, broken where nothing was in stock.
  let d = "";
  let open = false;
  data.forEach((v, i) => {
    if (v.cents == null) {
      open = false;
      return;
    }
    const xs = x(v.day);
    const xe = i + 1 < data.length ? x(data[i + 1].day) : x(v.day) + 0.01;
    d += `${open ? `L${xs.toFixed(1)} ${y(v.cents).toFixed(1)}` : `M${xs.toFixed(1)} ${y(v.cents).toFixed(1)}`} L${xe.toFixed(1)} ${y(v.cents).toFixed(1)} `;
    open = true;
  });
  // A dot on each day the price (or the gap) began: the real data points, never a dot per day.
  const changes = data.filter((v, i) => v.cents != null && (i === 0 || data[i - 1].cents !== v.cents));
  const low = priced.find((v) => v.cents === lo)!;
  const high = priced.find((v) => v.cents === hi)!;
  const today = data[data.length - 1];
  const gaps = data.filter((v) => v.cents == null).length;
  const days = last - first + 1;
  const hp = hover != null ? data[hover] : null;

  function at(clientX: number) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const u = ((clientX - rect.left) / rect.width) * W;
    const ratio = Math.min(1, Math.max(0, (u - PAD.l) / (W - PAD.l - PAD.r)));
    setHover(Math.round(ratio * (data.length - 1)));
  }
  const text = (i: number) => (data[i].cents != null ? `${money(data[i].cents, market)}, ${formatRelease(isoOfDay(data[i].day))}` : `Nothing in stock, ${formatRelease(isoOfDay(data[i].day))}`);

  return (
    <figure className={compact ? "rounded-xl border border-line p-3" : "card p-4 sm:p-5"} data-price-history="">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className={compact ? "text-sm font-semibold" : "font-semibold"}>Cheapest in-stock price, daily</span>
        {ranges.length > 1 ? (
          <span className="flex gap-1" role="group" aria-label="Date range">
            {ranges.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={range === r.key}
                onClick={() => {
                  setRange(r.key);
                  setHover(null);
                }}
                className={`inline-flex min-h-8 items-center rounded-md px-2.5 text-xs font-semibold ${range === r.key ? "bg-brand/15 text-brand" : "text-muted hover:text-ink"}`}
              >
                {r.key}
              </button>
            ))}
          </span>
        ) : (
          <span className="text-xs text-muted">{plural(days, "day")}</span>
        )}
      </figcaption>
      <div
        ref={wrapRef}
        className="relative mt-3 select-none"
        style={{ height: H, touchAction: "pan-y" }}
        tabIndex={0}
        aria-label={`Price history: ${text(data.length - 1)}. Use the arrow keys to read each day.`}
        onMouseMove={(e) => at(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => at(e.touches[0].clientX)}
        onTouchMove={(e) => at(e.touches[0].clientX)}
        onFocus={() => setHover((h) => h ?? data.length - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? data.length - 1) - 1));
          else if (e.key === "ArrowRight") setHover((h) => Math.min(data.length - 1, (h ?? data.length - 1) + 1));
          else return;
          e.preventDefault();
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height: H }} role="img" aria-label={`Cheapest in-stock price each day: from ${money(lo, market)} to ${money(hi, market)}`} preserveAspectRatio={measuredW == null ? "none" : undefined}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(lo)} y2={y(lo)} className="stroke-line" strokeDasharray="4 4" />
          <line x1={PAD.l} x2={W - PAD.r} y1={y(hi)} y2={y(hi)} className="stroke-line" strokeDasharray="4 4" />
          <path d={d} fill="none" className="stroke-brand" strokeWidth={2.5} strokeLinejoin="round" />
          {measuredW != null && changes.length <= 60 && changes.map((v) => <circle key={v.day} cx={x(v.day)} cy={y(v.cents!)} r={3} className="fill-brand stroke-surface" strokeWidth={1.5} />)}
          {hp && (
            <g>
              <line x1={x(hp.day)} x2={x(hp.day)} y1={PAD.t} y2={H - PAD.b} className="stroke-muted" strokeOpacity={0.6} strokeDasharray="3 3" />
              {hp.cents != null && <circle cx={x(hp.day)} cy={y(hp.cents)} r={4.5} className="fill-brand stroke-surface" strokeWidth={2} />}
            </g>
          )}
        </svg>
        {hp && (
          <div className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1.5 text-center shadow-xl" style={{ left: `clamp(4rem, ${(x(hp.day) / W) * 100}%, calc(100% - 4rem))` }} role="status">
            <div className="tabular text-sm font-bold">{hp.cents != null ? money(hp.cents, market) : "None in stock"}</div>
            <div className="text-[11px] text-muted">
              {formatRelease(isoOfDay(hp.day))}
              {hp.cents != null && hp.stores > 0 && ` · ${plural(hp.stores, "store")}`}
            </div>
          </div>
        )}
      </div>
      <dl className={`mt-3 grid grid-cols-3 gap-3 ${compact ? "text-xs" : "text-sm"}`}>
        <div>
          <dt className="text-xs text-muted">Lowest in this period</dt>
          <dd className="tabular font-semibold">
            {money(lo, market)} <span className={`text-xs font-normal text-muted ${compact ? "hidden sm:block" : ""}`}>{formatRelease(isoOfDay(low.day))}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Highest in this period</dt>
          <dd className="tabular font-semibold">
            {money(hi, market)} <span className={`text-xs font-normal text-muted ${compact ? "hidden sm:block" : ""}`}>{formatRelease(isoOfDay(high.day))}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Latest snapshot</dt>
          <dd className="tabular font-semibold">
            {today.cents != null ? money(today.cents, market) : "None in stock"}{" "}
            <span className={`text-xs font-normal text-muted ${compact ? "block" : ""}`}>{today.stores ? plural(today.stores, "store") : ""}</span>
          </dd>
        </div>
      </dl>
      {!compact && (
        <p className="mt-3 text-xs leading-5 text-muted">
          One snapshot a day of the cheapest in-stock price at the stores we compare, excluding shipping.
          {gaps > 0 && ` ${plural(gaps, "day")} with nothing in stock ${gaps === 1 ? "is a gap" : "are gaps"} in the line.`} Today’s prices are in the table above.
        </p>
      )}
    </figure>
  );
}
