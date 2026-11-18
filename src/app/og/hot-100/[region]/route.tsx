import { ogCard } from "@/lib/og-card";
import { hotChart, hotName } from "@/lib/hot100";
import { readPriceHistory } from "@/lib/price-history";
import { REGION_LIST, regionOrNotFound } from "@/lib/regions";
import { formatRelease } from "@/lib/release";

// /og/hot-100/<region>: the Hot 100's share card (lib/hot100.ts): the week, the chart's length and its top rise. Static, one PNG per
// region at build, from the price history file alone; a release redraws it, which is when the chart changes.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return REGION_LIST.map((r) => ({ region: r.region }));
}

export function GET(_req: Request, { params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const c = hotChart(readPriceHistory(), r.market);
  const n = c?.rows.length ?? 0;
  const top = c?.rows[0];
  return ogCard({
    tag: `This week · ${r.name}`,
    lines: [
      ["Magic sealed", false],
      [n ? hotName(n) : "Hot 100", true],
      [c ? `week to ${formatRelease(c.through)}` : "this week", false],
    ],
    size: 56,
    sub: top ? `#1 up ${top.pct}% · ${n} prices rose this week` : "The prices that rose most this week",
    chips: [`Prices in ${r.currency}`, "Real store prices"],
  });
}
