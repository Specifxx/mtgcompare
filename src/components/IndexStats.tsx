import { money } from "@/lib/format";
import type { MarketStats } from "@/lib/market-stats";

// The "key statistics" panel for the MTG Compare Index (RiftCompare's IndexStats):
// the stats a real market reports: basket value (one of each card), average and
// median price, the index's range, breadth (advancers against decliners) and
// recent realised volatility. A server component. US dollars: TCGplayer's market.
function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-950/60 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num mt-0.5 text-lg font-extrabold ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-white"}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function compact(cents: number): string {
  const v = cents / 100;
  if (v >= 1_000_000) return `US$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `US$${Math.round(v / 1000)}k`;
  return money(cents, "US");
}

export function IndexStats({ stats, startDay }: { stats: MarketStats; startDay: string }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Key statistics</div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Basket value" value={compact(stats.basketValueCents)} sub="1 of each card" />
        <Stat label="Avg card" value={money(stats.avgPriceCents, "US")} sub={`median ${money(stats.medianPriceCents, "US")}`} />
        <Stat label="Range" value={`${stats.low.toFixed(1)}–${stats.high.toFixed(1)}`} sub={`since ${startDay}`} />
        <Stat label="Advancing" value={String(stats.advancing)} sub="up over 7 days" tone={stats.advancing > 0 ? "up" : undefined} />
        <Stat label="Declining" value={String(stats.declining)} sub="down over 7 days" tone={stats.declining > 0 ? "down" : undefined} />
        <Stat label="Volatility" value={stats.volatilityPct == null ? "—" : `${stats.volatilityPct.toFixed(2)}%`} sub="recent, per snapshot" />
      </div>
    </div>
  );
}
