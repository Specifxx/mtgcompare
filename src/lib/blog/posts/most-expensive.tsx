import Link from "next/link";
import { CardTable, Callout } from "@/components/blog/BlogBits";
import { CARD_FLAGS, treatmentLabel } from "../../constants";
import { money } from "../../format";
import type { Post } from "../types";
import { cardLabel, monthYear } from "../util";

export const mostExpensive: Post = {
  slug: "most-expensive-magic-cards",
  title: ({ cat }) => `Most Expensive Magic: The Gathering Cards (${monthYear(cat.pricesAt)})`,
  description: "The priciest Magic: The Gathering cards right now, ranked by TCGplayer market price from our own data: the dearest printings overall, the dearest foils, and which sets they come from.",
  tags: ["prices", "chase cards", "market"],
  date: "2026-10-08",
  minutes: 6,
  related: [
    { href: "/price-guide", label: "Price guide" },
    { href: "/movers", label: "Weekly movers" },
    { href: "/market", label: "MTG Compare Index" },
  ],
  build: ({ top, topFoil, setById, country, stats }) => {
    const list = top.slice(0, 20);
    const first = list[0];
    const set = (id: number) => setById.get(id);
    const setsInTop = new Map<number, number>();
    for (const c of list) setsInTop.set(c.setId, (setsInTop.get(c.setId) ?? 0) + 1);
    const topSet = [...setsInTop.entries()].sort((a, b) => b[1] - a[1])[0];
    const foilTreat = list.filter((c) => c.treat.length > 0).length;
    const tenth = list[9];
    const over = (usd: number) => top.filter((c) => (c.marketUsd ?? 0) >= usd * 100).length;
    const notPlay = list.filter((c) => (c.flags & CARD_FLAGS.NOTPLAY) !== 0).length;
    return {
      heroCards: list.slice(0, 3),
      summary: [
        first ? (
          <>
            <strong>The most expensive Magic card on TCGplayer</strong> is <Link href={`/card/${first.slug}`}>{cardLabel(first)}</Link> from {set(first.setId)?.name}, at{" "}
            {money(first.marketUsd, "US")} market.
          </>
        ) : null,
        tenth ? <>It takes {money(tenth.marketUsd, "US")} to make the top ten, and {money(list[19]?.marketUsd ?? null, "US")} to make the top twenty.</> : null,
        topSet ? (
          <>
            <strong>{set(topSet[0])?.name}</strong> has the most cards in the top 20, with {topSet[1]}.
          </>
        ) : null,
        <>
          Of the {stats.units.toLocaleString("en-US")} priced units we track, the dearest 100 start at {money(top[99]?.marketUsd ?? null, "US")}; {over(1000)} of them are
          worth US$1,000 or more.
        </>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>The most expensive Magic cards are almost all old, scarce or both.</strong> This list ranks printings by TCGplayer&apos;s market price, which is what
          each has recently sold for, so one stray high listing cannot put a card at the top. Each printing is its own entry: a card appears once per printing, in its
          headline finish (non-foil first). It is rebuilt from MTG Compare&apos;s price data every time the page is generated.
        </p>
      ),
      sections: [
        {
          id: "top-20",
          title: "The 20 most expensive cards",
          body: (
            <>
              <p>
                Ranked by market price. “Cheapest here” is the lowest in-stock listing we track in your market today; when no store has the card it is shown as a
                reference converted from the US price.
              </p>
              <CardTable cards={list} setById={setById} country={country} />
              {foilTreat ? (
                <p>
                  {foilTreat} of these 20 are a special treatment, such as {treatmentLabel(list.find((c) => c.treat.length)!.treat).toLowerCase()}, rather than the
                  original frame.{notPlay ? ` ${notPlay} are not tournament-legal as printed (collector's, international or gold-border editions).` : ""}
                </p>
              ) : null}
            </>
          ),
        },
        ...(topFoil.length
          ? [
              {
                id: "foils",
                title: "The 10 most expensive foils",
                body: (
                  <>
                    <p>The same ranking, looking only at each card&apos;s foil price. A foil is its own product with its own price, often several times the non-foil.</p>
                    <CardTable cards={topFoil.slice(0, 10)} setById={setById} country={country} />
                  </>
                ),
              },
            ]
          : []),
        {
          id: "why",
          title: "Why these cards cost so much",
          body: (
            <>
              <p>
                Three things recur. Scarcity: the oldest sets were printed in small numbers and many copies have not survived in playable condition. The Reserved List:
                Wizards of the Coast has promised never to reprint a fixed list of cards, so their supply can only shrink. And demand from play: a card that every
                Vintage or Commander deck wants keeps its price even when it is not scarce.
              </p>
              <Callout title="One card, many prices">
                Every printing, finish and treatment has its own page on MTG Compare. If a card in this table also exists in a cheaper printing, its page lists the other
                printings with their prices, which is usually the quickest way to the version you actually want.
              </Callout>
            </>
          ),
        },
        {
          id: "buying",
          title: "Buying an expensive card without overpaying",
          body: (
            <ul>
              <li>Compare every store before you buy: the gap between the cheapest and dearest in-stock listing for the same card can be hundreds of dollars.</li>
              <li>Check the condition and the exact printing on the store&apos;s page. Near mint and lightly played copies of an expensive card are priced far apart.</li>
              <li>Above a few hundred dollars, graded copies trade at their own prices; our comparison covers raw cards only.</li>
              <li>
                Watch a card from its page and look at <Link href="/movers">this week&apos;s movers</Link> before buying: spikes after a ban, a reprint rumour or a new
                set often cool within weeks.
              </li>
            </ul>
          ),
        },
      ],
    };
  },
};
