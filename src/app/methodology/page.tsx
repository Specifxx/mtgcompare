import type { Metadata } from "next";
import Link from "next/link";
import { StaticPage } from "@/components/StaticPage";
import { getSiteStats } from "@/lib/data";
import { USD_TO } from "@/lib/fx";
import { pageOg } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: "How We Compare One Piece Card Prices",
  description:
    "Where OP Compare's prices come from, how listings are matched to printings, how markets and currencies work, and what the reference prices mean.",
  alternates: { canonical: "/methodology" },
  openGraph: pageOg("/methodology"),
};

export default async function Methodology() {
  // eBay copy follows the data: until the eBay pass has run, the page reads as before it existed.
  const ebayLive = (await getSiteStats().catch(() => null))?.ebayLive ?? false;
  return (
    <StaticPage title="How we compare prices" crumb="Methodology">
      <h2>Where prices come from</h2>
      <ul>
        <li>
          <strong>Stores.</strong> The public product listings of every store on{" "}
          <Link href="/stores">our stores page</Link>, read at 07:00 and 19:00
          UTC, in each store&apos;s own market and currency.
        </li>
        <li>
          <strong>TCGplayer.</strong> Its catalogue (every printing, set and
          card detail) and two prices per printing: the cheapest listing, shown
          as a US offer, and the market price, shown everywhere as a reference.
          Read daily from TCGCSV&apos;s public mirror of TCGplayer&apos;s data.
        </li>
        {ebayLive ? (
          <li>
            <strong>eBay.</strong> Twice a day we search eBay (US, UK, Australia,
            Spain for EU, and Canada for sealed) for cards worth US$20 or more on
            TCGplayer (US$50 in the EU) and sealed products worth US$30 or more;
            cards of US$100 and up daily, the rest every two days. We show the
            cheapest matching Buy It Now listing as an asking price, never
            re-ranked: it sits among the stores by item price. Canadian card rows
            are the US listing, shipped from the US. Every market also gets a
            search link to its own eBay. We are an eBay Partner Network affiliate.
          </li>
        ) : (
          <li>
            <strong>eBay.</strong> A search of your own eBay for the card — we
            build the search link, and never show an eBay price we have not seen.
          </li>
        )}
      </ul>
      <h2>Matching a listing to a printing</h2>
      <p>
        One card number can be several printings worth very different amounts —
        OP01-120 Shanks is a standard print, a Parallel and a Manga art. A store
        listing is matched only when exactly one printing fits it: the card
        number (or TCGplayer&apos;s exact name and set), the card&apos;s name,
        and the printing words in the title (Parallel, alternate art, Manga, SP,
        Treasure Rare, special foils, event stamps such as Pre-Release or
        Release Event). Anything ambiguous is left out. Graded slabs, playsets,
        lots, live breaks and non-English cards are never matched.
      </p>
      <p>
        A matched listing far under or far over the printing&apos;s TCGplayer
        market price is dropped as a probable mismatch, not shown as a deal.
      </p>
      <h2>Ranking</h2>
      <p>
        Offers are ranked cheapest first by item price. Postage is added at each
        store&apos;s checkout and is not included
        {ebayLive ? (
          <>
            ; an eBay row shows the postage eBay states, and says &ldquo;postage
            at checkout&rdquo; when it doesn&apos;t
          </>
        ) : null}
        . A listing&apos;s condition is
        the best condition the store has in stock (Near Mint first). Sold-out
        listings are folded below the comparison and never set a headline price.
      </p>
      <h2>Markets and currency</h2>
      <p>
        Each market shows its own stores in its own currency: US$, A$, £, S$, C$
        and € (eurozone stores are one market). The only conversions are
        reference prices — TCGplayer&apos;s market price shown in another
        currency is marked “≈” and uses indicative rates (US$1 = A${USD_TO.AUD},
        £{USD_TO.GBP}, S$
        {USD_TO.SGD}, C${USD_TO.CAD}, €{USD_TO.EUR}). A reference is never a
        price you can buy at.
      </p>
      <h2>History, movers and the index</h2>
      <p>
        Every printing&apos;s TCGplayer market price and cheapest US listing are
        recorded once a day. Weekly moves compare a card with itself about seven
        days earlier; the <Link href="/market">OP Compare Index</Link> chains
        day-to-day changes across every single worth US$1 or more.
      </p>
      <p>
        The whole history is open data: every day&apos;s prices, each
        product&apos;s series and the index are published as JSON files in{" "}
        <a
          href="https://github.com/Specifxx/OpCompare/tree/data/history"
          rel="noopener"
        >
          our GitHub repository
        </a>
        , updated with every import.
      </p>
    </StaticPage>
  );
}
