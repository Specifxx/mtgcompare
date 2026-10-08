import Link from "next/link";
import { Callout, SimpleTable } from "@/components/blog/BlogBits";
import { COUNTRIES, COUNTRY_LIST, MARKETS } from "../../country";
import { money } from "../../format";
import type { Post } from "../types";
import { cardLabel } from "../util";

export const cheaperAbroad: Post = {
  slug: "are-magic-cards-cheaper-abroad",
  title: () => "Are Magic Cards Cheaper Abroad? The Biggest Cross-Market Gaps",
  description: "The Magic cards with the biggest price gaps between markets today: where a store in another market undercuts your own after currency conversion, and whether importing survives postage.",
  tags: ["prices", "markets", "analysis"],
  category: "guide",
  marketData: true,
  faq: [
    { q: "Are Magic cards cheaper in another country?", a: "Sometimes, for particular cards. The gap table shows today's largest differences between a market's own stores and the cheapest store in another market, after currency conversion. Postage and import tax are not in those figures and often remove the saving." },
    { q: "Do the gaps include TCGplayer?", a: "No. The cross-market comparison uses store listings only, so a gap is a real difference between stores and never a reference price converted from TCGplayer's US market." },
    { q: "How are the exchange rates chosen?", a: "Conversions use indicative exchange rates, not what your bank or card charges. Treat any saving smaller than the likely fee as no saving." },
  ],
  date: "2026-10-08",
  minutes: 5,
  related: [
    { href: "/methodology", label: "How we compare" },
    { href: "/stores", label: "Stores we track" },
    { href: "/price-guide", label: "Price guide" },
  ],
  build: ({ records, top }) => {
    const sections = COUNTRY_LIST.map((m) => ({ m, gaps: records[m.code].gaps.slice(0, 5) })).filter((x) => x.gaps.length);
    const all = sections.flatMap((x) => x.gaps.map((g) => ({ ...g, homeMarket: x.m })));
    const biggest = [...all].sort((a, b) => b.pct - a.pct)[0];
    return {
      heroCards: all.slice(0, 3).map((g) => g.card).concat(top).slice(0, 3),
      summary: [
        biggest ? (
          <>
            <strong>The widest gap today:</strong> <Link href={`/card/${biggest.card.slug}`}>{cardLabel(biggest.card)}</Link> costs {biggest.pct}% less at a store in{" "}
            {COUNTRIES[biggest.away].label} than in {biggest.homeMarket.label}, before postage and tax.
          </>
        ) : null,
        <>A saving on one card rarely survives international postage and import tax: buy locally unless the order is large.</>,
        <>Comparisons use store listings only, each market&apos;s cheapest in-stock store, converted at indicative exchange rates.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>Is it cheaper to buy Magic cards from another country?</strong> For each of our six markets we looked for cards where the cheapest store in another
          market costs at least 15% less than the cheapest store at home, after converting currencies, and kept the five largest savings. The answer changes card by card;
          today&apos;s biggest gaps are below.
        </p>
      ),
      sections: [
        ...sections.map(({ m, gaps }) => ({
          id: `home-${m.code.toLowerCase()}`,
          title: `If you buy in ${m.place}`,
          body: (
            <>
              <p>
                Cards worth at least {money(500, m.code)} at the cheapest local store, with the cheapest store in another market and the saving in {m.currency}.
              </p>
              <SimpleTable
                head={["Card", `Local (${m.currency})`, "Cheaper in", "Converted", "Saving"]}
                align={["l", "r", "l", "r", "r"]}
                rows={gaps.map((g) => [
                  <Link key="c" href={`/card/${g.card.slug}`}>
                    {cardLabel(g.card)}
                  </Link>,
                  money(g.home, m.code),
                  COUNTRIES[g.away].label,
                  money(g.awayConverted, m.code),
                  `${money(g.saving, m.code)} (${g.pct}%)`,
                ])}
              />
            </>
          ),
        })),
        {
          id: "postage",
          title: "Postage and import tax change the answer",
          body: (
            <>
              <p>
                An item price is not a delivered price. Tracked international postage for a few singles commonly costs more than the saving on them, and many countries add
                GST or VAT to imports. A cheaper market only wins for big orders or single expensive cards, and then customs and insurance matter too. We list {MARKETS.length}{" "}
                markets and keep each store&apos;s prices in its own currency; the conversion here is for comparison only.
              </p>
              <Callout title="How to check a specific card">
                Open the card on MTG Compare and switch market with the flag in the header: each market&apos;s board shows its own stores in its own currency. Best Basket
                prices a whole order with each store&apos;s postage.
              </Callout>
            </>
          ),
        },
      ],
    };
  },
};
