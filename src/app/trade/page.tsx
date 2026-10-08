import type { Metadata } from "next";
import { HubIntro } from "@/components/HubIntro";
import { TradeCalculator } from "@/components/TradeCalculator";
import { Breadcrumbs } from "@/components/ui";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";
import { pageOg } from "@/lib/og/meta";
import { SITE_URL } from "@/lib/site";

// /trade — RiftCompare's trade calculator, for One Piece. Every claim in the
// description, intro and JSON-LD is what components/TradeCalculator.tsx does:
// each card valued at the cheapest in-stock store price for the visitor's
// market and currency, with a per-card override or a specific store's price.
const TITLE = "Magic: The Gathering Trade Calculator: Fair Trade Values";
const DESCRIPTION =
  "Compare Magic: The Gathering trade values: both sides priced at the cheapest in-stock store price in your market and currency, so you know a trade is fair.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | MTG Compare` },
  description: DESCRIPTION,
  alternates: { canonical: "/trade" },
  openGraph: pageOg("/trade", { title: `${TITLE} | MTG Compare`, description: DESCRIPTION }),
};

// Static shell; the calculator itself is client-side (reads the market from the
// CountryProvider and fetches prices on demand).
export default function TradePage() {
  const appLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${SITE_URL}/trade#app`,
    name: "MTG Compare Trade Calculator",
    url: `${SITE_URL}/trade`,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description:
      "A free Magic: The Gathering trade calculator: add the cards on each side of a trade and compare their total value at the cheapest in-stock store price in your market and currency.",
    featureList: [
      "Add Magic cards to each side of a trade and compare the two totals",
      "Each card valued at the cheapest in-stock store price in your market",
      "Prices in USD, AUD, GBP, SGD, CAD or EUR",
      "Type your own value for any card, or pick a specific store's price",
    ],
  };
  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs trail={[{ href: "/tools", name: "Tools" }, { name: "Trade Calculator" }]} />
      <header className="mb-5">
        <h1 className="font-display text-3xl font-extrabold text-white">Magic: The Gathering Trade Calculator</h1>
        <p className="mt-1 text-slate-400">
          Trading cards at locals? Add each side&apos;s cards below to compare their total value at a glance. Every
          card is priced at the cheapest in-stock store price in your market and currency — tap a value to type your
          own or pick a specific store&apos;s price — so you can trade with confidence.
        </p>
      </header>
      <HubIntro path="/trade" />
      <TradeCalculator />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <RelatedGuides guides={guidesForTool("/trade")} className="card-surface mt-8 p-5" />
    </div>
  );
}
