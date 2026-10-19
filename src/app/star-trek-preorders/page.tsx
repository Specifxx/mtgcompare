import type { Metadata } from "next";
import { PreorderPage } from "@/components/PreorderPage";
import { getSetIndex } from "@/lib/data";
import { pageOgOwnImage } from "@/lib/og/meta";
import { STAR_TREK, isOut, longDateOf, releaseDateOf, releaseSets } from "@/lib/preorders";

// /star-trek-preorders: the shared pre-order page (components/PreorderPage.tsx) for Magic: The Gathering | Star Trek (TRK)
// and its Commander decks (TRC). The release is the STAR_TREK entry of lib/preorders.ts; from release day the page
// switches to its released state on its own. Reads the published data: force-dynamic, no revalidate (tests/build-no-data.test.ts).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const date = releaseDateOf(STAR_TREK, releaseSets(STAR_TREK, (await getSetIndex()).byTok));
  const out = isOut(date, new Date().toISOString().slice(0, 10));
  return {
    // No price in the title: the page renders in the visitor's currency.
    title: { absolute: "MTG Star Trek Pre-Order Prices: Boxes, Bundles, Decks" },
    description: out
      ? `Magic: The Gathering Star Trek released on ${longDateOf(date)}. Where its sealed products are priced now, and what each one is.`
      : `Magic: The Gathering Star Trek Play Booster and Collector Booster displays, bundles and Commander decks: every tracked store's pre-order price in your currency, refreshed daily. Out ${longDateOf(date)}.`,
    keywords: ["MTG Star Trek preorder", "Star Trek Play Booster display price", "Star Trek Collector Booster box", "Star Trek Commander decks", "Magic Star Trek release date", "TRK preorder"],
    alternates: { canonical: "/star-trek-preorders" },
    openGraph: pageOgOwnImage("/star-trek-preorders", { title: "Magic: The Gathering Star Trek Pre-Order Prices, Compared", description: "Play Booster and Collector Booster displays, bundles and Commander decks: every tracked store's pre-order price, cheapest first." }),
  };
}

export default function StarTrekPreordersPage() {
  return <PreorderPage release={STAR_TREK} />;
}
