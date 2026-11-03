import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { Fees } from "./Fees";

export const revalidate = 86400;
export const metadata: Metadata = {
  title: `${SITE.gameShort} selling fee calculator — TCGplayer and eBay`,
  description: `How much you keep when you sell a ${SITE.game} card on TCGplayer or eBay, after fees. Free calculator.`,
  ...canon("/tools/selling-fees"),
};

export default function Page() {
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl font-black">Selling fee calculator</h1>
      <p className="mt-2 text-muted">Estimates for a US seller using standard rates. Your actual fees depend on your seller level, store category and promotions, so check the marketplace&apos;s own fee page before relying on them.</p>
      <Fees />
    </div>
  );
}
