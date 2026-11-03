import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { StaticPage } from "@/components/StaticPage";

export const revalidate = 86400;
export const metadata: Metadata = { title: "How our prices work", description: `Where ${SITE.name}'s ${SITE.gameShort} prices come from and how often they update.`, ...canon("/methodology") };

export default function Methodology() {
  return (
    <StaticPage title="How our prices work">
      <ul>
        <li><b>TCGplayer market price</b> — the headline price on every card. It is TCGplayer&apos;s market price for the card&apos;s standard printing (or its cheapest printing), refreshed daily. Price history and the 7- and 30-day changes are built from it.</li>
        <li><b>Store prices</b> — read once a day from each store&apos;s public catalogue, in the store&apos;s own currency, for the Near Mint copy. A listing is shown only when we can match it to the exact card by number and name; when in doubt we leave it out.</li>
        <li><b>eBay</b> — the cheapest matching Buy It Now listing (ungraded, no lots or proxies). eBay limits how often we can search, so we check every sealed product and every card worth ${SITE.ebay.minPriceUsd} or more, and check the most valuable ones most often (daily for $100+ and booster boxes, every two to four days below that).</li>
        <li><b>Currencies</b> — store prices are shown as the store charges them. Converted figures (marked ≈) use the day&apos;s European Central Bank reference rate.</li>
      </ul>
      <p>The store&apos;s checkout price is always final. Shipping is shown where the listing publishes it.</p>
    </StaticPage>
  );
}
