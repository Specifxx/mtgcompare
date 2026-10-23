import { money, plural } from "@/lib/format";
import { isoOfDay, MIN_DAYS, type DayValue } from "@/lib/price-history";
import { formatRelease } from "@/lib/release";

// The product page's price history (lib/price-history.ts): the cheapest in-stock price at the region's stores, one value a day, as a
// step line. Server-rendered SVG: no script, no layout shift, a few hundred bytes. Nothing at all under MIN_DAYS of snapshots (the
// page shows no chart rather than a partial one). Days with nothing in stock are a gap in the line, said so under it.

const W = 640;
const H = 160;
const PAD = { l: 8, r: 8, t: 12, b: 12 };

export function PriceHistoryChart({ values, market }: { values: DayValue[]; market: string }) {
  if (values.length < MIN_DAYS) return null;
  const priced = values.filter((v): v is DayValue & { cents: number } => v.cents != null);
  if (priced.length < 2) return null;
  const lo = Math.min(...priced.map((v) => v.cents));
  const hi = Math.max(...priced.map((v) => v.cents));
  const span = Math.max(1, hi - lo);
  const first = values[0].day;
  const last = values[values.length - 1].day;
  const x = (d: number) => PAD.l + ((d - first) / Math.max(1, last - first)) * (W - PAD.l - PAD.r);
  const y = (c: number) => PAD.t + (1 - (c - lo) / span) * (H - PAD.t - PAD.b);
  // A step path, broken where nothing was in stock.
  let d = "";
  let open = false;
  values.forEach((v, i) => {
    if (v.cents == null) {
      open = false;
      return;
    }
    const xs = x(v.day);
    const xe = i + 1 < values.length ? x(values[i + 1].day) : x(v.day) + 0.01;
    d += `${open ? `L${xs.toFixed(1)} ${y(v.cents).toFixed(1)}` : `M${xs.toFixed(1)} ${y(v.cents).toFixed(1)}`} L${xe.toFixed(1)} ${y(v.cents).toFixed(1)} `;
    open = true;
  });
  const low = priced.find((v) => v.cents === lo)!;
  const high = priced.find((v) => v.cents === hi)!;
  const today = values[values.length - 1];
  const gaps = values.filter((v) => v.cents == null).length;
  const days = last - first + 1;
  return (
    <figure className="card p-4 sm:p-5" data-price-history="">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-semibold">Cheapest in-stock price, daily</span>
        <span className="text-xs text-muted">
          {formatRelease(isoOfDay(first))} – {formatRelease(isoOfDay(last))} · {plural(days, "day")}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-36 w-full sm:h-40" role="img" aria-label={`Cheapest in-stock price each day: from ${money(lo, market)} to ${money(hi, market)}`} preserveAspectRatio="none">
        <line x1={PAD.l} x2={W - PAD.r} y1={y(lo)} y2={y(lo)} className="stroke-line" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <line x1={PAD.l} x2={W - PAD.r} y1={y(hi)} y2={y(hi)} className="stroke-line" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={d} fill="none" className="stroke-brand" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Lowest in this period</dt>
          <dd className="tabular font-semibold">
            {money(lo, market)} <span className="text-xs font-normal text-muted">{formatRelease(isoOfDay(low.day))}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Highest in this period</dt>
          <dd className="tabular font-semibold">
            {money(hi, market)} <span className="text-xs font-normal text-muted">{formatRelease(isoOfDay(high.day))}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Latest snapshot</dt>
          <dd className="tabular font-semibold">
            {today.cents != null ? money(today.cents, market) : "None in stock"}{" "}
            <span className="text-xs font-normal text-muted">{today.stores ? plural(today.stores, "store") : ""}</span>
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-5 text-muted">
        One snapshot a day of the cheapest in-stock price at the stores we compare, excluding shipping.
        {gaps > 0 && ` ${plural(gaps, "day")} with nothing in stock ${gaps === 1 ? "is a gap" : "are gaps"} in the line.`} Today’s prices are in the table above.
      </p>
    </figure>
  );
}
