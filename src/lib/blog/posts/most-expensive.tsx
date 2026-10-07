import Link from "next/link";
import { CardTable, Callout } from "@/components/blog/BlogBits";
import { PRINTINGS } from "../../constants";
import { money } from "../../format";
import type { Post } from "../types";
import { byMarketDesc, monthYear, packPullable } from "../util";

export const mostExpensive: Post = {
  slug: "most-expensive-one-piece-cards",
  title: ({ cat }) => `Most Expensive One Piece Cards (${monthYear(cat.pricesAt)})`,
  description: "The priciest One Piece Card Game cards right now, in a table drawn from our own price data — the chase cards you can pull from packs, and the promos you can't.",
  tags: ["prices", "chase cards", "market"],
  date: "2026-10-03",
  minutes: 6,
  related: [
    { href: "/price-guide", label: "Price guide" },
    { href: "/movers", label: "Weekly movers" },
    { href: "/market", label: "OP Compare Index" },
  ],
  build: ({ cat, country }) => {
    const pullable = packPullable(cat).filter((c) => c.marketUsd != null).sort(byMarketDesc);
    const top = pullable.slice(0, 20);
    const promos = cat.cards.filter((c) => c.printing === "promo" && c.marketUsd != null).sort(byMarketDesc).slice(0, 10);
    const first = top[0];
    const set = (id: number) => cat.setById.get(id);
    const byPrinting = new Map<string, number>();
    for (const c of top) byPrinting.set(c.printing, (byPrinting.get(c.printing) ?? 0) + 1);
    const mix = [...byPrinting.entries()].sort((a, b) => b[1] - a[1]);
    const setsInTop = new Map<number, number>();
    for (const c of top) setsInTop.set(c.setId, (setsInTop.get(c.setId) ?? 0) + 1);
    const topSet = [...setsInTop.entries()].sort((a, b) => b[1] - a[1])[0];
    const tenth = top[9];
    const thousandPlus = pullable.filter((c) => (c.marketUsd ?? 0) >= 100000).length;
    const hundredPlus = pullable.filter((c) => (c.marketUsd ?? 0) >= 10000).length;
    return {
      heroCards: top.slice(0, 3),
      summary: [
        first ? (
          <>
            <strong>The most expensive card you can pull from a pack</strong> is <Link href={`/card/${first.slug}`}>{first.name}{first.variant ? ` (${first.variant})` : ""}</Link> from{" "}
            {set(first.setId)?.name}, at {money(first.marketUsd, "US")} on TCGplayer.
          </>
        ) : null,
        mix[0] ? (
          <>
            <strong>{mix[0][1]} of the top 20</strong> are {PRINTINGS[mix[0][0]]?.label ?? mix[0][0]} printings — value sits in alternate art, not in rarity alone.
          </>
        ) : null,
        <>
          <strong>{hundredPlus.toLocaleString("en-US")} pack-pullable printings</strong> are worth US$100 or more{thousandPlus ? `, and ${thousandPlus} are worth US$1,000+` : ""}.
        </>,
        <>Prices are TCGplayer market prices in US dollars, refreshed twice a day; open any card for every store&apos;s live price in your market.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>The One Piece Card Game&apos;s most expensive cards are almost all alternate-art printings</strong> — Manga rares, SP cards, Treasure Rares and
          Parallels of the game&apos;s most popular characters. This list ranks them by TCGplayer&apos;s market price, what each printing has recently sold for, so
          one stray high listing cannot put a card at the top. It is rebuilt from OP Compare&apos;s price database every time the page is generated.
        </p>
      ),
      sections: [
        {
          id: "top-20",
          title: "The 20 most expensive cards you can pull",
          body: (
            <>
              <p>
                Cards from booster sets, extra boosters and premium boosters only — the cards you can actually open. Promos and prize cards have their own
                table below. “Cheapest here” is the lowest in-stock listing we track in your market today.
              </p>
              <CardTable cards={top} setById={cat.setById} country={country} />
              {tenth ? (
                <p>
                  The cut-off for the top ten is {money(tenth.marketUsd, "US")}: {tenth.name}
                  {tenth.variant ? ` (${tenth.variant})` : ""}. {topSet ? `${set(topSet[0])?.name} has the most cards in the top 20, with ${topSet[1]}.` : ""}
                </p>
              ) : null}
            </>
          ),
        },
        {
          id: "why",
          title: "Why these cards cost so much",
          body: (
            <>
              <p>
                Three things put a One Piece card at the top of this list, and the cards above usually have all three. The first is the printing: a Manga or SP
                version of a card is printed in far smaller numbers than its standard print, and the same card number can cost a hundred times more in its
                scarcest art. The second is the character — Luffy, Shanks, Zoro, Nami and the Emperors draw collectors who never play. The third is
                playability: a Leader or staple that every deck of its colour runs keeps demand up for the standard print as well.
              </p>
              <Callout title="One card, several prices">
                Every printing has its own page on OP Compare. If a card in this table also exists as a standard print, its page lists the other printings with
                their prices — the difference is usually the clearest lesson in what drives One Piece prices.
              </Callout>
            </>
          ),
        },
        {
          id: "promos",
          title: "The most expensive promos and prize cards",
          body: (
            <>
              <p>
                Tournament prizes, championship cards and other promos cannot be pulled from packs. Many exist in tiny numbers, so their market prices rest on
                very few sales and move sharply — treat them as a guide, not a quote.
              </p>
              <CardTable cards={promos} setById={cat.setById} country={country} />
            </>
          ),
        },
        {
          id: "buying",
          title: "Buying a chase card without overpaying",
          body: (
            <ul>
              <li>Compare every store before you buy: the gap between the cheapest and dearest in-stock listing for the same chase card is often hundreds of dollars.</li>
              <li>Check the condition and the exact printing on the store&apos;s page — a standard print listed under a Manga card&apos;s name is a common mistake.</li>
              <li>For cards over a few hundred dollars, graded copies (PSA, BGS, CGC) trade at their own prices; our comparison covers raw cards only.</li>
              <li>
                Watch a card from its page and check <Link href="/movers">this week&apos;s movers</Link> before buying: new-set hype often cools within weeks.
              </li>
            </ul>
          ),
        },
      ],
    };
  },
};
