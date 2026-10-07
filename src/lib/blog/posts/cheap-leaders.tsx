import Link from "next/link";
import { Callout, CardTable } from "@/components/blog/BlogBits";
import { COLORS, COLOR_KEYS } from "../../constants";
import { COUNTRIES } from "../../country";
import { money } from "../../format";
import { headline, sortPrice } from "../../price";
import type { Post } from "../types";

export const cheapLeaders: Post = {
  slug: "cheapest-one-piece-leaders",
  title: () => "Cheapest One Piece Leaders to Start a Deck, by Colour",
  description: "The cheapest Leader cards in every One Piece colour, priced from live store listings — where to start a deck without spending much.",
  tags: ["guide", "leaders", "budget"],
  date: "2026-10-03",
  minutes: 5,
  related: [
    { href: "/leaders", label: "Every Leader" },
    { href: "/colors", label: "Cards by colour" },
    { href: "/sealed?kind=Starter+Deck", label: "Starter decks" },
  ],
  build: ({ cat, country }) => {
    const c = COUNTRIES[country];
    const leaders = cat.cards.filter((x) => x.cardType === "Leader" && x.printing === "standard" && x.low[country] != null);
    const by = COLOR_KEYS.map((k) => ({
      k,
      rows: leaders
        .filter((x) => x.colors.length === 1 && x.colors[0] === k)
        .sort((a, b) => (sortPrice(a, country) ?? Infinity) - (sortPrice(b, country) ?? Infinity))
        .slice(0, 3),
    }));
    const multi = leaders
      .filter((x) => x.colors.length > 1)
      .sort((a, b) => (sortPrice(a, country) ?? Infinity) - (sortPrice(b, country) ?? Infinity))
      .slice(0, 5);
    const cheapest = [...leaders].sort((a, b) => a.low[country]! - b.low[country]!)[0];
    const under1 = leaders.filter((x) => x.low[country]! < 100).length;
    return {
      heroCards: by.map((g) => g.rows[0]).filter(Boolean).slice(0, 3),
      summary: [
        <>
          <strong>{under1} Leaders</strong> have a standard print for under {c.symbol}1 in {c.place} today.
        </>,
        cheapest ? (
          <>
            The cheapest is <Link href={`/card/${cheapest.slug}`}>{cheapest.name}</Link> ({cheapest.number}) at {money(headline(cheapest, country).cents, country)}.
          </>
        ) : null,
        <>A Leader is only the start: the deck&apos;s 50 cards cost far more than its Leader. Starter decks are the cheapest complete decks.</>,
        <>Prices are the cheapest in-stock listing in your market, refreshed twice a day.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>Every One Piece deck is built around one Leader</strong>, which sets its colours and starts in play. Most Leaders&apos; standard prints are cheap —
          the money goes into the deck around them, and into alternate-art Leaders for collectors. Here are the cheapest standard-print Leaders in every colour,
          priced in {c.place}.
        </p>
      ),
      sections: [
        ...by
          .filter((g) => g.rows.length)
          .map((g) => ({
            id: g.k.toLowerCase(),
            title: `${g.k} Leaders`,
            body: (
              <>
                <p>
                  {COLORS[g.k].tagline} is {g.k.toLowerCase()}&apos;s usual identity. Its three cheapest Leaders right now:
                </p>
                <CardTable cards={g.rows} setById={cat.setById} country={country} />
              </>
            ),
          })),
        ...(multi.length
          ? [
              {
                id: "multicolour",
                title: "Multicolour Leaders",
                body: (
                  <>
                    <p>Two-colour Leaders open both colours&apos; cards to the deck. The cheapest:</p>
                    <CardTable cards={multi} setById={cat.setById} country={country} />
                  </>
                ),
              },
            ]
          : []),
        {
          id: "next",
          title: "From Leader to deck",
          body: (
            <>
              <p>
                A deck is the Leader plus 50 cards of its colours, with up to four copies of any card number. The cheapest route to a playable deck is usually
                a starter deck, which comes with a Leader and a full list; compare <Link href="/sealed?kind=Starter+Deck">starter deck prices</Link>, then buy
                singles to upgrade it.
              </p>
              <Callout title="Play the standard print">
                Alternate-art and Parallel Leaders play exactly like their standard prints. If you are building to play, the standard print is the same card for
                a fraction of the price.
              </Callout>
            </>
          ),
        },
      ],
    };
  },
};
