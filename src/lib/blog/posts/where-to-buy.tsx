import Link from "next/link";
import { Callout, SimpleTable } from "@/components/blog/BlogBits";
import { COUNTRY_LIST } from "../../country";
import { usdCentsToCountry } from "../../fx";
import { STORES } from "../../stores";
import type { Post } from "../types";
import { byMarketDesc, medianOf } from "../util";

export const whereToBuy: Post = {
  slug: "where-to-buy-one-piece-cards",
  title: () => "Where to Buy One Piece Cards: 6 Markets Compared",
  description: "How many stores sell One Piece singles in the US, Australia, the UK, Singapore, Canada and the EU, how much of the card list each market has in stock, and how its prices compare.",
  tags: ["guide", "stores", "buying"],
  category: "guide",
  marketData: true,
  faq: [
    { q: "Where is the cheapest place to buy One Piece cards?", a: "It depends on the card and your market. OP Compare ranks every in-stock listing by item price on each card page, so the cheapest store for a given card is the first row; this guide compares the markets as a whole." },
    { q: "Do these stores ship internationally?", a: "Generally within their own market. A price in another market is a fact about listings, not an instruction to import: postage, duty and import tax are not included, which is why Best Basket prices whole orders with each store's measured postage." },
    { q: "How often are the prices updated?", a: "Every store is read twice a day. A listing not refreshed for 72 hours is treated as sold out rather than shown as a live price." },
    { q: "Is TCGplayer counted as a store?", a: "TCGplayer's own listings are shown in the comparison and counted, because it is a real seller you can buy from. eBay listings are shown beside the stores but never counted as a store." },
  ],
  date: "2026-10-03",
  minutes: 7,
  related: [
    { href: "/stores", label: "Stores we track" },
    { href: "/methodology", label: "How we compare" },
    { href: "/tools/deal-finder", label: "Deal finder" },
  ],
  build: ({ cat, stats }) => {
    const priced = cat.cards.filter((c) => c.marketUsd != null && c.marketUsd >= 100);
    const rows = COUNTRY_LIST.map((m) => {
      const stores = STORES.filter((s) => s.country === m.code).length + (m.code === "US" ? 1 : 0);
      const inStock = cat.cards.filter((c) => c.low[m.code] != null).length;
      const ratios = priced.filter((c) => c.low[m.code] != null).map((c) => c.low[m.code]! / usdCentsToCountry(c.marketUsd!, m.code));
      const r = medianOf(ratios);
      return { m, stores, inStock, ratio: r, n: ratios.length };
    });
    const best = [...rows].filter((r) => r.inStock).sort((a, b) => b.inStock - a.inStock)[0];
    const offers = stats.storeOffers.filter((s) => s.source !== "tcgplayer");
    const biggest = [...offers].sort((a, b) => b.inStock - a.inStock).slice(0, 5);
    const storeName = (src: string) => STORES.find((s) => `store:${s.key}` === src)?.name ?? src;
    const total = cat.cards.length;
    return {
      heroCards: [...cat.cards].sort(byMarketDesc).slice(0, 3),
      summary: [
        <>
          <strong>OP Compare reads {STORES.length} stores</strong> across six markets, plus TCGplayer in the US — every One Piece listing matched to the exact
          printing it is.
        </>,
        best ? (
          <>
            <strong>{best.m.label}</strong> has the most of the card list in stock: {best.inStock.toLocaleString("en-US")} of {total.toLocaleString("en-US")} printings.
          </>
        ) : null,
        <>Local stores often beat importing once postage and duty are counted — compare delivered totals, not item prices.</>,
        <>Every card page ranks every store in your market, cheapest first.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>Where you should buy One Piece cards depends mostly on where you live.</strong> The United States has TCGplayer and dozens of hobby stores;
          Australia, Canada and the UK have deep local stores of their own; the eurozone shares one market; Singapore is thin. This guide compares the six
          markets OP Compare tracks — how many stores, how much of the card list is in stock, and how local prices sit against TCGplayer&apos;s market price.
        </p>
      ),
      sections: [
        {
          id: "markets",
          title: "The six markets at a glance",
          body: (
            <>
              <p>
                “In stock” counts printings with at least one in-stock listing today. “Price vs TCGplayer” is the median of each card&apos;s cheapest local
                listing divided by TCGplayer&apos;s market price converted to local currency — below 1.00× means local stores are cheaper than the US market
                price, before postage.
              </p>
              <SimpleTable
                head={["Market", "Stores", "Printings in stock", "Price vs TCGplayer"]}
                align={["l", "r", "r", "r"]}
                rows={rows.map((r) => [
                  `${r.m.flag} ${r.m.label}`,
                  r.stores,
                  r.inStock.toLocaleString("en-US"),
                  r.ratio != null && r.n >= 50 ? `${r.ratio.toFixed(2)}×` : "—",
                ])}
              />
            </>
          ),
        },
        {
          id: "us",
          title: "United States: TCGplayer plus the hobby stores",
          body: (
            <p>
              TCGplayer is the largest One Piece marketplace in the US and usually has the widest choice, but individual hobby stores regularly undercut its
              cheapest listing on specific cards — and sell sealed product at or near retail. OP Compare shows TCGplayer&apos;s cheapest listing as one row
              among the stores, so you can see when a store is cheaper.
            </p>
          ),
        },
        {
          id: "outside-us",
          title: "Australia, Canada, the UK, the EU and Singapore",
          body: (
            <>
              <p>
                Outside the US, the cheapest card is usually at a local store: buying from the US adds international postage, and often import tax, to every
                order. Prices on OP Compare stay in each market&apos;s own currency — A$, C$, £, € and S$ — and TCGplayer&apos;s US market price appears only as a
                reference, marked ≈.
              </p>
              <p>
                The eurozone is one market: stores across the single market quote the same euro prices and ship without customs. Singapore has few stores
                with an online One Piece catalogue, so many cards there show only a reference price.
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
                    <p>The five stores with the most One Piece listings in stock today, across all markets:</p>
                    <SimpleTable
                      head={["Store", "Market", "In stock"]}
                      align={["l", "l", "r"]}
                      rows={biggest.map((b) => [storeName(b.source), b.market, b.inStock.toLocaleString("en-US")])}
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
                <li>Search the card on OP Compare and pick your market: offers are ranked cheapest first by item price.</li>
                <li>Bundle cards from one store to share the postage — two cheap singles from two stores can cost more than both from one.</li>
                <li>Check the condition: a Lightly Played copy is often a third cheaper and fine for play.</li>
                <li>For a card no store has, the eBay button on its page searches your own eBay.</li>
              </ul>
              <Callout title="Your market, your currency">
                Switch market with the flag in the header. Every page — cards, sets, sealed, the price guide — then shows that market&apos;s stores in its own
                currency.
              </Callout>
            </>
          ),
        },
      ],
    };
  },
};
