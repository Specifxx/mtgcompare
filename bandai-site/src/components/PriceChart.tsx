// A dependency-free SVG line chart of a product's reference price.
import { dayToDate, type Series } from "@/lib/series";
import { money } from "@/lib/format";

export function PriceChart({ series, days }: { series: Series; days: number }) {
  if (series.length < 2)
    return <p className="text-sm text-muted">Price history starts building from the first daily import — check back in a few days.</p>;
  const lastDay = series[series.length - 1][0];
  const today = Math.max(lastDay, Math.floor(Date.now() / 86_400_000));
  const from = today - days;
  // Step series: carry the value in effect at the window's start.
  let start = series[0];
  for (const p of series) if (p[0] <= from) start = p;
  const pts: [number, number][] = [[Math.max(from, start[0]), start[1]], ...series.filter((p) => p[0] > from)];
  pts.push([today, pts[pts.length - 1][1]]);
  const W = 640, H = 200, P = 28;
  const minX = pts[0][0], maxX = today;
  const ys = pts.map((p) => p[1]);
  const minY = Math.min(...ys) * 0.95, maxY = Math.max(...ys) * 1.05 || 1;
  const x = (d: number) => P + ((d - minX) / Math.max(1, maxX - minX)) * (W - 2 * P);
  const y = (c: number) => H - P - ((c - minY) / Math.max(1, maxY - minY)) * (H - 2 * P);
  let d = `M${x(pts[0][0])},${y(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i][0])} V${y(pts[i][1])}`;
  const up = pts[pts.length - 1][1] >= pts[0][1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Price from ${money(pts[0][1])} to ${money(pts[pts.length - 1][1])}`}>
      <line x1={P} x2={W - P} y1={y(maxY / 1.05)} y2={y(maxY / 1.05)} stroke="currentColor" strokeOpacity="0.1" />
      <line x1={P} x2={W - P} y1={y(minY / 0.95)} y2={y(minY / 0.95)} stroke="currentColor" strokeOpacity="0.1" />
      <path d={d} fill="none" stroke={up ? "#3fb950" : "#f0506e"} strokeWidth="2.5" />
      <text x={P} y={14} fontSize="11" fill="currentColor" opacity="0.6">{money(Math.max(...ys))}</text>
      <text x={P} y={H - 6} fontSize="11" fill="currentColor" opacity="0.6">{dayToDate(minX)}</text>
      <text x={W - P} y={H - 6} fontSize="11" fill="currentColor" opacity="0.6" textAnchor="end">{dayToDate(maxX)}</text>
    </svg>
  );
}
