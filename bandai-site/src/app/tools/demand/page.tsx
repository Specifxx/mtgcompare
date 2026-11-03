import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { demandRows } from "@/lib/tools";
import { money } from "@/lib/format";
import { ToolTable } from "@/components/ToolTable";

export const revalidate = 86400; // data only changes with a release (DECISIONS.md, "Vercel cost")
export const metadata: Metadata = {
  title: `${SITE.gameShort} Demand Finder — the cards selling out`,
  description: `Which ${SITE.game} cards are selling out: listed at the most stores but in stock at the fewest. Free, updated daily from ${SITE.stores.length} stores.`,
  ...canon("/tools/demand"),
};

export default function Page() {
  const rows = demandRows(100);
  return (
    <div>
      <h1 className="font-display text-3xl font-black">{SITE.gameShort} Demand Finder</h1>
      <p className="mt-2 max-w-3xl text-muted">Cards listed at 10 or more of the {SITE.stores.length} stores we track, ranked by the share of those stores that have sold out. A high sold-out share on a card that is also rising is the clearest demand signal there is.</p>
      <ToolTable
        head={["Price", "Stores listing", "In stock", "Sold out"]}
        rows={rows.map((r) => ({ p: r.p, cells: [money(r.cents), r.listed, r.inStock, <b key="s" className={r.soldOutPct >= 80 ? "text-down" : ""}>{r.soldOutPct}%</b>] }))}
      />
    </div>
  );
}
