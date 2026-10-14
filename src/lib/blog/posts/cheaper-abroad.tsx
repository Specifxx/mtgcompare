import Link from "next/link";
import { Callout, SimpleTable } from "@/components/blog/BlogBits";
import { COUNTRIES, COUNTRY_LIST, MARKETS } from "../../country";
import { money } from "../../format";
import { GAP_AWAY_MIN_MARKET, GAP_HOME_MAX_MARKET, GAP_MAX_PCT, GAP_MIN_HOME_CENTS, GAP_MIN_PCT, GAP_MIN_SAVING_CENTS } from "../../market-gaps";
import type { Post } from "../types";
import { unitHref, unitLabel } from "../util";

// Every row is ONE unit (a printing in one finish) compared with itself in two markets (src/lib/market-gaps.ts): the table
// names the finish when it is Foil and links that finish's tab, so the row, the card page it opens and the shop strip
// (ArticleView picks the same unit from the link) quote the same thing. The thresholds below are the publisher's own.
const half = GAP_AWAY_MIN_MARKET === 0.5 ? "half" : `${GAP_AWAY_MIN_MARKET} times`;

export const cheaperAbroad: Post = {
  slug: "are-magic-cards-cheaper-abroad",
  title: () => "Are Magic Cards Cheaper Abroad? The Biggest Cross-Market Gaps",
  description: "The Magic cards with the biggest price gaps between markets today: where a store in another market undercuts your own on the same printing and finish after currency conversion, and whether importing survives postage.",
  tags: ["prices", "markets", "analysis"],
  category: "guide",
  marketData: true,
  faq: [
    { q: "Are Magic cards cheaper in another country?", a: "Sometimes, for particular cards. The gap tables show today's largest differences for the same printing in the same finish: the cheapest price you can pay at home against the cheapest store in another market, after currency conversion. Postage and import tax are not in those figures and often remove the saving." },
    { q: "Do the gaps include TCGplayer?", a: "Only as a local option in the United States. A US buyer can order from TCGplayer, so in the US the local price is the cheaper of the cheapest store and TCGplayer's own lowest listing. The cheaper market is always a store's in-stock listing, never a TCGplayer price converted from US dollars." },
    { q: "How do you keep one store's odd price out of the tables?", a: `Every row is checked against TCGplayer's market price for the same printing and finish. A card whose cheapest local price is more than ${GAP_HOME_MAX_MARKET} times that market price is left out, because that is one store's asking price rather than what the card sells for, and so is a cheaper market whose price is under ${half} of it, which is usually a played copy or another printing. In the United States a card does not count as cheaper abroad when its TCGplayer market price is already at or below the overseas price.` },
    { q: "How are the exchange rates chosen?", a: "Conversions use indicative exchange rates, not what your bank or card charges. Treat any saving smaller than the likely fee as no saving." },
    { q: "Should I order Magic cards from overseas?", a: "Only when the saving on the whole order is larger than the postage, any import tax and the risk of a lost parcel. For a handful of singles it almost never is; for one expensive card or a large order it can be. Best Basket prices a whole order with each store's postage." },
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
            <strong>The widest gap today:</strong> <Link href={unitHref(biggest.card.slug, biggest.finish)}>{unitLabel(biggest.card, biggest.finish)}</Link> costs {biggest.pct}% less at a store in{" "}
            {COUNTRIES[biggest.away].label} than in {biggest.homeMarket.label}, before postage and tax.
          </>
        ) : null,
        <>A saving on one card rarely survives international postage and import tax: buy locally unless the order is large.</>,
        <>Each row compares the same printing in the same finish in both markets, leaves out single-store outlier asks, and converts at indicative exchange rates.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>Is it cheaper to buy Magic cards from another country?</strong> For each of our six markets we looked for cards where the cheapest store in another
          market sells the same printing, in the same finish, for at least {GAP_MIN_PCT}% less than the cheapest price at home, after converting currencies, and kept the
          five largest savings. The answer changes card by card; today&apos;s biggest gaps are below.
        </p>
      ),
      sections: [
        ...sections.map(({ m, gaps }) => ({
          id: `home-${m.code.toLowerCase()}`,
          title: `If you buy in ${m.place}`,
          body: (
            <>
              <p>
                Cards worth at least {money(GAP_MIN_HOME_CENTS, m.code)} at the cheapest local {m.code === "US" ? "store or TCGplayer listing" : "store"}, with the cheapest
                store in another market for the same printing and finish, and the saving in {m.currency}. A foil row names its finish; every other row is the non-foil card.
              </p>
              <SimpleTable
                head={["Card", `Local (${m.currency})`, "Cheaper in", "Converted", "Saving"]}
                align={["l", "r", "l", "r", "r"]}
                rows={gaps.map((g) => [
                  <Link key="c" href={unitHref(g.card.slug, g.finish)}>
                    {unitLabel(g.card, g.finish)}
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
          id: "how",
          title: "How the gaps are found",
          body: (
            <>
              <p>
                A row is one printing in one finish, compared with itself: a foil copy is only ever compared with foil copies, and a non-foil copy with non-foil ones. The
                local price is the cheapest in-stock copy at the stores we track in that market; in the United States TCGplayer&apos;s own lowest listing counts too, because
                a US buyer can order there. The cheaper market is the cheapest in-stock copy at a store in another market, converted into the local currency.
              </p>
              <p>
                Each row is then checked against TCGplayer&apos;s market price for the same printing and finish. A card whose cheapest local price is more than{" "}
                {GAP_HOME_MAX_MARKET} times that market price is left out (one store&apos;s asking price is not a market), and so is a cheaper market whose price is under {half}{" "}
                of it. In the United States, a card is not cheaper abroad when its TCGplayer market price is already at or below the converted overseas price. A row needs a
                gap of {GAP_MIN_PCT}% to {GAP_MAX_PCT}% and a saving of at least {money(GAP_MIN_SAVING_CENTS, "US")}, {money(GAP_MIN_SAVING_CENTS, "UK")} and so on in each
                local currency.
              </p>
              <p>
                Condition is not part of the comparison: each side is the cheapest in-stock copy its stores list, so open the card and check the condition before you order.
              </p>
            </>
          ),
        },
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
