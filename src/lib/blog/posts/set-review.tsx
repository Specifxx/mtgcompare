import Link from "next/link";
import { CardTable, Callout } from "@/components/blog/BlogBits";
import { SET_KINDS } from "../../constants";
import { money } from "../../format";
import type { Post } from "../types";
import { cardLabel, monthYear } from "../util";

// One review for the newest released set rather than one post per set: the page
// follows the release calendar by itself, so a new set does not need a new post.
export const setReview: Post = {
  slug: "newest-magic-set-chase-cards",
  title: ({ cat }) => `The Newest Magic Set: Chase Cards and Prices (${monthYear(cat.pricesAt)})`,
  description: "The dearest cards in the newest released Magic: The Gathering set, how much of its value they hold, and the set's priced total, from TCGplayer market prices.",
  tags: ["set review", "chase cards", "prices"],
  date: "2026-10-08",
  minutes: 5,
  related: [
    { href: "/sets", label: "All sets" },
    { href: "/movers", label: "Weekly movers" },
    { href: "/tools/box-ev", label: "Box EV calculator" },
  ],
  build: ({ newest, setById, country }) => {
    if (!newest) {
      return {
        heroCards: [],
        summary: [],
        lede: <p>No released set has enough priced cards to review yet. The latest sets are on the <Link href="/sets">sets page</Link>.</p>,
        sections: [],
      };
    }
    const { set, cards, total, priced } = newest;
    const top5 = cards.slice(0, 5).reduce((t, c) => t + (c.marketUsd ?? 0), 0);
    const share = total ? top5 / total : null;
    const first = cards[0];
    const over = (usd: number) => cards.filter((c) => (c.marketUsd ?? 0) >= usd * 100).length;
    const kind = SET_KINDS[set.kind]?.label.toLowerCase() ?? "set";
    return {
      heroCards: cards.slice(0, 3),
      summary: [
        first ? (
          <>
            <strong>The set&apos;s most expensive card</strong> is <Link href={`/card/${first.slug}`}>{cardLabel(first)}</Link> at {money(first.marketUsd, "US")}.
          </>
        ) : null,
        share != null ? (
          <>
            The five dearest cards hold <strong>{Math.round(share * 100)}%</strong> of the {money(total, "US")} that every priced printing in the set adds up to.
          </>
        ) : null,
        <>
          {priced.toLocaleString("en-US")} printings have a market price, in a {kind} released {set.releasedOn}.
        </>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>{set.name} is the newest {kind} with priced cards.</strong> This page follows the release calendar: when a newer set has enough prices, it takes this
          place. Everything below is TCGplayer market price, in US dollars, from our own data.
        </p>
      ),
      sections: [
        {
          id: "chase",
          title: `The most expensive cards in ${set.name}`,
          body: (
            <>
              <p>
                Each printing in the set ranked by market price, in its headline finish. A card with several treatments appears once per treatment. “Cheapest here” is
                the lowest in-stock listing in your market.
              </p>
              <CardTable cards={cards.slice(0, 15)} setById={setById} country={country} />
              {over(100) ? <p>{over(100)} of the top {Math.min(cards.length, 24)} printings are worth US$100 or more.</p> : null}
            </>
          ),
        },
        {
          id: "value",
          title: "Where the set's value sits",
          body: (
            <>
              <p>
                Adding the market price of every priced printing in the set gives {money(total, "US")} across {priced.toLocaleString("en-US")} printings, an average of{" "}
                {money(Math.round(total / Math.max(1, priced)), "US")} each. Most of it is concentrated: the top five cards alone are {money(top5, "US")}.
              </p>
              <Callout title="Singles or sealed">
                Compare the set&apos;s product prices on its <Link href={`/sets/${set.slug}`}>set page</Link>, and test whether a box beats buying the singles with the{" "}
                <Link href="/tools/box-ev">Box EV calculator</Link>.
              </Callout>
            </>
          ),
        },
        {
          id: "caveat",
          title: "How new-set prices behave",
          body: (
            <p>
              Prices in the first weeks of a set are the least settled: supply is still arriving and hype has not cooled. A figure here is a snapshot of today&apos;s market
              price, not a forecast. Watch a card from its page to be told when it moves.
            </p>
          ),
        },
      ],
    };
  },
};
