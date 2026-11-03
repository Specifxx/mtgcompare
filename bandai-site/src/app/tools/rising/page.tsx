import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { risingRows } from "@/lib/tools";
import { money, pct } from "@/lib/format";
import { ToolTable } from "@/components/ToolTable";

export const revalidate = 86400; // data only changes with a release (DECISIONS.md, "Vercel cost")
export const metadata: Metadata = {
  title: `Rising ${SITE.gameShort} cards — prices climbing this week`,
  description: `${SITE.game} cards whose prices are rising this week and holding over the month, ranked with how thin in-stock supply is. Free, updated daily.`,
  ...canon("/tools/rising"),
};

export default function Page() {
  const rows = risingRows(100);
  return (
    <div>
      <h1 className="font-display text-3xl font-black">Rising {SITE.gameShort} cards</h1>
      <p className="mt-2 max-w-3xl text-muted">Up more than 2% this week and not down over the month, worth $2+. Ranked by the rise, how long it has lasted and how few stores still have the card in stock. Based on TCGplayer market prices recorded daily.</p>
      <ToolTable
        head={["Price", "7 days", "30 days", "In stock"]}
        rows={rows.map((r) => ({ p: r.p, cells: [money(r.cents), <span key="a" className="text-up">{pct(r.c7)}</span>, <span key="b" className={(r.c30 ?? 0) >= 0 ? "text-up" : "text-down"}>{pct(r.c30)}</span>, `${r.inStock}/${r.listed}`] }))}
      />
    </div>
  );
}
