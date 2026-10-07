// A tiny trend line for mover and watchlist rows (RiftCompare's Sparkline).
// Not interactive and not a price claim: it only shows the SHAPE of the last
// month of TCGplayer market prices. Colour follows the site's Delta
// convention (rising = text-up, falling = text-down). Server- or client-safe.
export function Sparkline({ values, className = "h-7 w-16", label }: { values: number[] | null | undefined; className?: string; label?: string }) {
  if (!values || values.length < 2) return <span className={`inline-block ${className}`} aria-hidden="true" />;
  const w = 64;
  const h = 28;
  const pad = 2.5;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const n = values.length;
  const pts = values.map((v, i) => `${(pad + (i / (n - 1)) * (w - 2 * pad)).toFixed(1)},${(pad + (1 - (v - lo) / span) * (h - 2 * pad)).toFixed(1)}`).join(" ");
  const first = values[0];
  const last = values[n - 1];
  const tone = last > first ? "text-up" : last < first ? "text-down" : "text-slate-500";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`${className} ${tone} shrink-0`} preserveAspectRatio="none" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
