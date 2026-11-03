import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { dealRows } from "@/lib/tools";
import { shortName } from "@/lib/names";
import { DealFinder } from "./DealFinder";

export const revalidate = 86400; // data only changes with a release (DECISIONS.md, "Vercel cost")
export const metadata: Metadata = {
  title: `${SITE.gameShort} Deal Finder — cards selling below market`,
  description: `Every in-stock ${SITE.game} card and sealed product listed below its TCGplayer market price at stores and on eBay, in the US, UK, Canada, Australia and Europe. Free, updated daily.`,
  ...canon("/tools/deal-finder"),
};

export default function Page() {
  const rows = dealRows().map((r) => ({ ...r, name: shortName(r.name) }));
  return (
    <div>
      <h1 className="font-display text-3xl font-black">{SITE.gameShort} Deal Finder</h1>
      <p className="mt-2 text-muted">{rows.length} in-stock listings 8–60% below TCGplayer market right now. Prices converted to US$ for the comparison; the store charges its own currency.</p>
      <DealFinder rows={rows} />
    </div>
  );
}
