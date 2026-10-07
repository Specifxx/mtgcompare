// The price-history / index chart. Same props as ever (server pages pass a
// `format` function), but the drawing is now interactive (RiftCompare's
// PriceChart): a hover/touch crosshair with the day and every series' value,
// range tabs (7D / 30D / 90D / All, each offered only when the history is
// longer than it) and a Now / Low / High / change line.
//
// A function cannot cross into a client component, so this server half applies
// `format` here — to every point and to each range's axis ticks — and hands the
// client island plain strings. Series share one y-axis; nulls break the line.
import { chartRanges, ticks } from "@/lib/chart";
import { LineChartInteractive, type ChartData } from "./LineChartInteractive";

export interface Series {
  label: string;
  color: string;
  points: { x: string; y: number | null }[];
  dashed?: boolean;
}

export function LineChart({
  series,
  format,
  height = 240,
  width,
  empty,
}: {
  series: Series[];
  format: (v: number) => string;
  height?: number;
  /** Width drawn before the wrapper is measured (the QuickView passes its own); the chart then draws in real pixels. */
  width?: number;
  empty?: string;
}) {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort();
  const ys = series.map((s) => {
    const at = new Map(s.points.map((p) => [p.x, p.y]));
    return xs.map((x) => at.get(x) ?? null);
  });
  const ranges = chartRanges(xs, ys);
  if (xs.length < 2 || !ranges.length) {
    return <div className="grid h-40 place-items-center rounded-md border border-dashed border-ink-700 px-4 text-center text-sm text-slate-500">{empty ?? "Not enough history yet."}</div>;
  }
  const data: ChartData = {
    xs,
    height,
    width,
    series: series.map((s, i) => ({
      label: s.label,
      color: s.color,
      dashed: Boolean(s.dashed),
      ys: ys[i],
      labels: ys[i].map((v) => (v == null ? null : format(v))),
    })),
    ranges: ranges.map((r) => ({ ...r, ticks: ticks(r.lo, r.hi).map((v) => ({ v, label: format(v) })) })),
  };
  return <LineChartInteractive data={data} />;
}
