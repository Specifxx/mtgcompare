import Link from "next/link";
import { Callout, SimpleTable } from "@/components/blog/BlogBits";
import { COUNTRY_LIST } from "../../country";
import { STALE_HOURS } from "../../constants";
import { sourceLabel, STORES } from "../../stores";
import type { Post } from "../types";

export const whereToBuy: Post = {
  slug: "where-to-buy-magic-cards",
  title: () => "Where to Buy Magic: The Gathering Cards: 6 Markets Compared",
  description: "How many stores sell Magic singles in the US, Australia, the UK, Singapore, Canada and the EU, how many listings each market has in stock today, and which stores carry the most.",
  tags: ["guide", "stores", "buying"],
  category: "guide",
  marketData: true,
  faq: [
    { q: "Where is the cheapest place to buy Magic cards?", a: "It depends on the card and your market. MTG Compare ranks every in-stock listing by item price on each card page, so the cheapest store for a given card is the first row; this guide compares the markets as a whole." },
    { q: "Do these stores ship internationally?", a: "Generally within their own market. A price in another market is a fact about listings, not an instruction to import: postage, duty and import tax are not included, which is why Best Basket prices whole orders with each store's measured postage." },
    { q: "How often are the prices updated?", a: `TCGplayer market prices are published once a day, and each store is read on its own schedule. A listing not refreshed for ${STALE_HOURS} hours is treated as sold out rather than shown as a live price.` },
    { q: "Is TCGplayer counted as a store?", a: "TCGplayer's own listings are shown in the comparison, because it is a real marketplace you can buy from, but they are kept apart from the store counts on this page. eBay listings are shown beside the stores and never counted as a store." },
  ],
  date: "2026-10-08",
  minutes: 5,
  related: [
    { href: "/stores", label: "Stores we track" },
    { href: "/methodology", label: "How we compare" },
    { href: "/tools/deal-finder", label: "Deal finder" },
  ],
  build: ({ site, top, stats }) => {
    const offers = site.storeOffers.filter((s) => s.source !== "tcgplayer" && !s.source.startsWith("ebay"));
    const rows = COUNTRY_LIST.map((m) => {
      const stores = STORES.filter((s) => s.country === m.code).length;
      const inStock = offers.filter((o) => o.market === m.code).reduce((t, o) => t + o.inStock, 0);
      return { m, stores, inStock, priced: stats.pricedByMarket[m.code] };
    });
    const best = [...rows].filter((r) => r.inStock).sort((a, b) => b.inStock - a.inStock)[0];
    const biggest = [...offers].sort((a, b) => b.inStock - a.inStock).slice(0, 5);
    return {
      heroCards: top.slice(0, 3),
      summary: [
        <>
          <strong>MTG Compare reads {STORES.length} stores</strong> across six markets, plus TCGplayer, with every listing matched to the exact printing and finish it
          is.
        </>,
        best ? (
          <>
            <strong>{best.m.label}</strong> has the most store listings in stock today: {best.inStock.toLocaleString("en-US")}.
          </>
        ) : null,
        <>Local stores often beat importing once postage and duty are counted: compare delivered totals, not item prices.</>,
        <>Every card page ranks every store in your market, cheapest first.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>Where you should buy Magic cards depends mostly on where you live.</strong> TCGplayer is the largest marketplace and is US-based; the United States also
          has many hobby stores, Australia, Canada and the UK have local stores of their own, the eurozone shares one market, and Singapore is thin. This guide compares
          the six markets MTG Compare tracks: how many stores, and how many listings are in stock now.
        </p>
      ),
      sections: [
        {
          id: "markets",
          title: "The six markets at a glance",
          body: (
            <>
              <p>
                “Listings in stock” counts store listings (not TCGplayer) that were read within the last {STALE_HOURS} hours and are in stock today. “Cards priced” is how
                many units have a price in that market, including a TCGplayer reference where no store has the card.
              </p>
              <SimpleTable
                head={["Market", "Stores", "Listings in stock", "Cards priced"]}
                align={["l", "r", "r", "r"]}
                rows={rows.map((r) => [`${r.m.flag} ${r.m.label}`, r.stores, r.inStock.toLocaleString("en-US"), r.priced.toLocaleString("en-US")])}
              />
            </>
          ),
        },
        {
          id: "us",
          title: "United States: TCGplayer plus the hobby stores",
          body: (
            <p>
              TCGplayer is the largest Magic marketplace in the US and usually has the widest choice, but individual stores regularly undercut its cheapest listing on
              specific cards, and sell sealed product at or near retail. MTG Compare shows TCGplayer&apos;s cheapest listing as one row among the stores, so you can see
              when a store is cheaper.
            </p>
          ),
        },
        {
          id: "outside-us",
          title: "Australia, Canada, the UK, the EU and Singapore",
          body: (
            <>
              <p>
                Outside the US, the cheapest card is usually at a local store: buying from the US adds international postage, and often import tax, to every order.
                Prices on MTG Compare stay in each market&apos;s own currency (A$, C$, £, € and S$), and TCGplayer&apos;s US market price appears only as a reference,
                marked ≈.
              </p>
              <p>
                The eurozone is one market: stores across the single market quote euro prices and ship without customs. Singapore has few stores with an online Magic
                catalogue, so many cards there show only a reference price.
              </p>
            </>
          ),
        },
        ...(biggest.length
          ? [
              {
                id: "biggest",
                title: "The stores with the most in stock",
                body: (
                  <>
                    <p>The five stores with the most listings in stock today, across all markets:</p>
                    <SimpleTable
                      head={["Store", "Market", "In stock"]}
                      align={["l", "l", "r"]}
                      rows={biggest.map((b) => [sourceLabel(b.source, b.market), b.market, b.inStock.toLocaleString("en-US")])}
                    />
                    <p>
                      The full list, with every store&apos;s matched listings, is on <Link href="/stores">the stores page</Link>.
                    </p>
                  </>
                ),
              },
            ]
          : []),
        {
          id: "tips",
          title: "How to get the best price",
          body: (
            <>
              <ul>
                <li>Search the card on MTG Compare and pick your market: offers are ranked cheapest first by item price.</li>
                <li>Bundle cards from one store to share the postage: two cheap singles from two stores can cost more than both from one.</li>
                <li>Check the condition: a Lightly Played copy is often cheaper than near mint and fine for play.</li>
                <li>Check the finish. Foil and non-foil are separate prices, and some printings exist only in foil.</li>
              </ul>
              <Callout title="Your market, your currency">
                Switch market with the flag in the header. Every page then shows that market&apos;s stores in its own currency.
              </Callout>
            </>
          ),
        },
      ],
    };
  },
};
