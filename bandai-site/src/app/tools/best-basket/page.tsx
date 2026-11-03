import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { Basket } from "./Basket";

export const revalidate = 86400;
export const metadata: Metadata = {
  title: `${SITE.gameShort} Best Basket — price a whole deck or want list`,
  description: `Paste a ${SITE.game} deck list or want list and get the cheapest price for every card across ${SITE.stores.length} stores, TCGplayer and eBay, plus which store can fill most of it. Free.`,
  ...canon("/tools/best-basket"),
};

export default function Page() {
  return (
    <div>
      <h1 className="font-display text-3xl font-black">Best Basket</h1>
      <p className="mt-2 max-w-3xl text-muted">Paste a deck or want list, one card per line (&ldquo;4 Card Name&rdquo; or &ldquo;Card Name x2&rdquo;; add the card number if a name has several printings). You get the cheapest in-stock price for every card in your market, and the stores that can fill the most of it in one order. Postage isn&apos;t included.</p>
      <Basket />
    </div>
  );
}
