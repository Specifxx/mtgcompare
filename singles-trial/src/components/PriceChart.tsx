import { dayOfIndex, type Point } from "@/lib/cards";
import { shortDate, usd } from "@/lib/format";

/** The card's price history as a server-drawn step line (a point is recorded only on a day the price moved). */
export function PriceChart({ pts, today }: { pts: Point[]; today: number }) {
  if (pts.length < 2) return null;
  const W = 480, H = 150, P = 6;
  const x0 = pts[0][0];
  const x1 = Math.max(today, pts[pts.length - 1][0]);
  const vs = pts.map((p) => p[1]);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const X = (d: number) => P + ((d - x0) / Math.max(1, x1 - x0)) * (W - 2 * P);
  const Y = (v: number) => H - P - ((v - lo) / Math.max(1, hi - lo)) * (H - 2 * P);
  let d = `M${X(pts[0][0]).toFixed(1)},${Y(pts[0][1]).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${X(pts[i][0]).toFixed(1)} V${Y(pts[i][1]).toFixed(1)}`;
  d += ` H${X(x1).toFixed(1)}`;
  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Price history from ${shortDate(dayOfIndex(x0))}: low ${usd(lo)}, high ${usd(hi)}`}>
        <path d={d} fill="none" stroke="var(--brand)" strokeWidth="2" />
      </svg>
      <figcaption className="small">
        Since {shortDate(dayOfIndex(x0))}: low {usd(lo)}, high {usd(hi)}
      </figcaption>
    </figure>
  );
}
