import Link from "next/link";
import { Callout, SimpleTable } from "@/components/blog/BlogBits";
import { COUNTRIES, COUNTRY_LIST, MARKETS, type Country } from "../../country";
import { money } from "../../format";
import { toUsdCents } from "../../fx";
import type { Post } from "../types";
import { byMarketDesc, medianOf } from "../util";

export const cheaperAbroad: Post = {
  slug: "are-one-piece-cards-cheaper-abroad",
  title: () => "Are One Piece Cards Cheaper Abroad? US vs AU, UK, CA, EU",
  description: "The same One Piece cards priced in six markets and converted to US dollars: which market is cheapest for singles, and whether importing still saves money once postage is added.",
  tags: ["prices", "markets", "analysis"],
  marketData: true,
  date: "2026-10-03",
  minutes: 6,
  related: [
    { href: "/methodology", label: "How we compare" },
    { href: "/stores", label: "Stores we track" },
    { href: "/price-guide", label: "Price guide" },
  ],
  build: ({ cat }) => {
    const usd = (c: (typeof cat.cards)[number], m: Country) => (c.low[m] != null ? toUsdCents(c.low[m]!, COUNTRIES[m].currency) : null);
    // Cards with a US price and at least one other market, worth US$2+.
    const comparable = cat.cards.filter((c) => c.low.US != null && c.low.US >= 200 && MARKETS.some((m) => m !== "US" && c.low[m] != null));
    const rows = COUNTRY_LIST.filter((m) => m.code !== "US").map((m) => {
      const ratios = comparable.filter((c) => c.low[m.code] != null).map((c) => usd(c, m.code)! / c.low.US!);
      const r = medianOf(ratios);
      const cheaper = ratios.filter((x) => x < 1).length;
      return { m, n: ratios.length, r, cheaperShare: ratios.length ? cheaper / ratios.length : null };
    });
    const ranked = rows.filter((r) => r.r != null && r.n >= 50).sort((a, b) => a.r! - b.r!);
    const examples = comparable.filter((c) => MARKETS.filter((m) => c.low[m] != null).length >= 4).sort(byMarketDesc).slice(0, 10);
    return {
      heroCards: examples.slice(0, 3),
      summary: [
        ranked[0] ? (
          <>
            <strong>{ranked[0].m.label}</strong> is the cheapest market for singles against the US: its typical card costs {ranked[0].r!.toFixed(2)}× the US price in
            US dollars.
          </>
        ) : null,
        ranked.length > 1 ? (
          <>
            The dearest is <strong>{ranked[ranked.length - 1].m.label}</strong> at {ranked[ranked.length - 1].r!.toFixed(2)}×.
          </>
        ) : null,
        <>A small saving per card rarely survives international postage and import tax — buy locally unless the order is large.</>,
        <>Comparisons use each market&apos;s cheapest in-stock listing, converted at indicative exchange rates.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>Is it cheaper to buy One Piece cards from another country?</strong> We took every card worth US$2 or more that is in stock in the US and in at
          least one other market, converted each market&apos;s cheapest listing to US dollars, and compared. The answer changes card by card, but the typical
          gaps are below.
        </p>
      ),
      sections: [
        {
          id: "by-market",
          title: "Each market against the US",
          body: (
            <>
              <p>
                “Typical price” is the median, across the cards compared, of the market&apos;s cheapest listing in US dollars divided by the cheapest US listing.
                1.10× means a card typically costs 10% more there; 0.90×, 10% less.
              </p>
              <SimpleTable
                head={["Market", "Cards compared", "Typical price vs US", "Cards cheaper than US"]}
                align={["l", "r", "r", "r"]}
                rows={rows.map((r) => [
                  `${r.m.flag} ${r.m.label}`,
                  r.n.toLocaleString("en-US"),
                  r.r != null && r.n >= 50 ? `${r.r.toFixed(2)}×` : "too few",
                  r.cheaperShare != null && r.n >= 50 ? `${Math.round(r.cheaperShare * 100)}%` : "—",
                ])}
              />
            </>
          ),
        },
        ...(examples.length
          ? [
              {
                id: "examples",
                title: "Ten chase cards in every market",
                body: (
                  <>
                    <p>The most valuable cards in stock in at least four markets, each market&apos;s cheapest listing shown in US dollars:</p>
                    <SimpleTable
                      head={["Card", ...MARKETS]}
                      align={["l", "r", "r", "r", "r", "r", "r"]}
                      rows={examples.map((c) => [
                        <Link key="c" href={`/card/${c.slug}`}>
                          {c.name}
                          {c.variant ? ` (${c.variant})` : ""}
                        </Link>,
                        ...MARKETS.map((m) => (usd(c, m) != null ? money(usd(c, m), "US") : "—")),
                      ])}
                    />
                  </>
                ),
              },
            ]
          : []),
        {
          id: "postage",
          title: "Postage and import tax change the answer",
          body: (
            <>
              <p>
                An item price is not a delivered price. Tracked international postage for a few singles commonly costs more than the saving on them, and
                many countries add GST or VAT to imports. The cheaper market only wins for big orders or single expensive cards — and then customs and
                insurance matter too.
              </p>
              <Callout title="How to check a specific card">
                Open the card on OP Compare and switch market with the flag in the header: each market&apos;s board shows its own stores in its own currency.
                The cheapest-elsewhere line under an empty board lists the other markets&apos; cheapest prices.
              </Callout>
            </>
          ),
        },
      ],
    };
  },
};
