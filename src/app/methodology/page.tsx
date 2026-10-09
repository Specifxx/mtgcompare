import type { Metadata } from "next";
import Link from "next/link";
import { StaticPage } from "@/components/StaticPage";
import { getSiteStats } from "@/lib/data";
import { RELEASE_COPY } from "@/lib/release-schedule";
import { DATA_ATTRIBUTION, SCRYFALL_URL, SITE_NAME } from "@/lib/site";
import { USD_TO } from "@/lib/fx";
import { pageOg } from "@/lib/og/meta";

// Reads the eBay-live flag from the published data: rendered per request, never at build (CLAUDE.md, contract C26).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How We Compare Magic Card Prices",
  description: `Where ${SITE_NAME}'s prices come from, how listings are matched to printings and finishes, how markets and currencies work, and what the reference prices mean.`,
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
          <Link href="/stores">our stores page</Link>, read once a day in each
          store&apos;s own market and currency. A listing that has not been
          refreshed for 72 hours counts as sold out.
        </li>
        <li>
          <strong>TCGplayer.</strong> Its catalogue (every printing, set and
          card detail) and two prices per printing and finish: the cheapest
          listing, shown as a US offer, and the market price, shown everywhere
          as a reference. Read daily from TCGCSV&apos;s public mirror of
          TCGplayer&apos;s data.
        </li>
        <li>
          <strong>Scryfall.</strong> What each card is — its name, rules text
          and legalities — comes from <a href={SCRYFALL_URL}>Scryfall</a>. {DATA_ATTRIBUTION}
        </li>
        {ebayLive ? (
          <li>
            <strong>eBay.</strong> We search eBay four times a day (US, UK,
            Australia and Spain for EU for singles, and Canada for sealed too)
            for cards worth US$10 or more on TCGplayer, and for sealed products
            worth US$60 to US$100 or more depending on the kind; cards of US$50
            and up daily, the rest every three days. We show the
            cheapest matching Buy It Now listing as an asking price, never
            re-ranked: it sits in its own labelled block, apart from the stores.
            Canadian card rows are the US listing, shipped from the US. Every
            market also gets a
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
        One card name can be dozens of printings worth very different amounts —
        Lightning Bolt has been printed in set after set, in normal and foil,
        with borderless and showcase frames. A price belongs to a printing and
        a finish together. A store listing is matched only when exactly one
        printing and finish fit it: the set and collector number (from the SKU
        or the title), the card&apos;s name, the finish, and the treatment words
        in the title (borderless, extended art, showcase, surge foil, etched,
        prerelease and other stamps). Anything ambiguous is left out. Graded
        slabs, lots, sealed-product contents and non-English cards are never
        matched to a card.
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
      <h2>When things update</h2>
      <p>
        {RELEASE_COPY}
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
        Every printing&apos;s TCGplayer market price is recorded once a day.
        Weekly moves compare a card with itself about seven days earlier; the{" "}
        <Link href="/market">{SITE_NAME} Index</Link> chains day-to-day changes
        across every single worth US$1 or more. A price that rests on a single
        thin listing is shown as &ldquo;low only&rdquo; and never ranked.
      </p>
    </StaticPage>
  );
}
