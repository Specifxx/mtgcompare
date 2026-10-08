import Link from "next/link";
import { Callout, SimpleTable } from "@/components/blog/BlogBits";
import type { Post } from "../types";

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

export const rarities: Post = {
  slug: "magic-card-rarities-explained",
  title: () => "Magic Card Rarities Explained: What Common to Mythic Rare Is Worth",
  description: "What common, uncommon, rare and mythic rare mean in Magic: The Gathering, how rarity relates to price, and how many cards of each rarity are worth US$1, US$10 or US$100, from our own data.",
  tags: ["guide", "rarity", "collecting", "beginners"],
  category: "guide",
  faq: [
    { q: "What are the rarities in Magic: The Gathering?", a: "Common, uncommon, rare and mythic rare are the four rarities of booster packs. Basic lands, tokens, promos and some special sets are marked separately. Rarity says how often a card is printed in a pack, not how good or how valuable it is." },
    { q: "Is a mythic rare always worth more than a rare?", a: "No. Mythic rares are printed less often than rares within a set, but price follows demand: many rares are worth more than most mythics, and plenty of commons are staples that cost a few dollars. The table in this guide shows how the price bands split by rarity." },
    { q: "Does a card's rarity change between printings?", a: "Yes. A card can be rare in one set and uncommon or mythic in another, so the same card can have different rarities on different printing pages. Each printing on MTG Compare shows its own rarity." },
    { q: "Is a foil rarer than the normal card?", a: "A foil copy is a different finish of the same card and usually costs more, because fewer are opened. It does not change the card's rarity. Foil and non-foil each have their own price on a card page." },
  ],
  date: "2026-10-08",
  minutes: 5,
  related: [
    { href: "/price-guide", label: "Price guide" },
    { href: "/browse", label: "Card database" },
    { href: "/learn", label: "Learn Magic" },
  ],
  build: ({ rarities: rows, stats, top }) => {
    const mythic = rows.find((r) => r.rarity === "M");
    const rare = rows.find((r) => r.rarity === "R");
    const common = rows.find((r) => r.rarity === "C");
    return {
      heroCards: top.slice(0, 3),
      summary: [
        <>
          <strong>Rarity is how often a card is printed in packs</strong>: common, uncommon, rare, mythic rare. It is a weak predictor of price on its own.
        </>,
        rare && mythic ? (
          <>
            {pct(mythic.over10, mythic.total)} of mythic printings and {pct(rare.over10, rare.total)} of rare printings are worth US$10 or more.
          </>
        ) : null,
        common ? <>{common.over1.toLocaleString("en-US")} common printings are worth US$1 or more: playable staples and sought-after treatments cost money at any rarity.</> : null,
        <>Counts come from the {stats.cards.toLocaleString("en-US")} printings in our catalogue, priced at TCGplayer market.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>A card&apos;s rarity tells you how often you will open it, not what it costs.</strong> Magic prints four rarities in booster packs, and the symbol on
          the card, usually a coloured set symbol, shows which one. This guide explains each and shows, from our own price data, how the prices of each rarity are
          actually spread.
        </p>
      ),
      sections: [
        {
          id: "the-rarities",
          title: "The four booster rarities",
          body: (
            <ul>
              <li>
                <strong>Common</strong> (black set symbol): the bulk of every pack and the cheapest by volume. Many commons are build-around staples.
              </li>
              <li>
                <strong>Uncommon</strong> (silver): several per pack; often the glue of a deck.
              </li>
              <li>
                <strong>Rare</strong> (gold): usually the one rare slot of a pack (which can also be a mythic), the powerful or splashy cards.
              </li>
              <li>
                <strong>Mythic rare</strong> (orange-red): introduced in 2008, replacing about one in eight rare slots with a rarer, usually more powerful card.
              </li>
            </ul>
          ),
        },
        {
          id: "price-by-rarity",
          title: "How the price bands split by rarity",
          body: (
            <>
              <p>
                Listed printings of each rarity, counted by TCGplayer market price. A printing is one set&apos;s version of a card (its headline finish); a foil or
                a special frame of the same card is a separate printing.
              </p>
              <SimpleTable
                head={["Rarity", "Printings", "US$1 or more", "US$10 or more", "US$100 or more"]}
                align={["l", "r", "r", "r", "r"]}
                rows={rows.map((r) => [
                  r.label,
                  r.total.toLocaleString("en-US"),
                  `${r.over1.toLocaleString("en-US")} (${pct(r.over1, r.total)})`,
                  `${r.over10.toLocaleString("en-US")} (${pct(r.over10, r.total)})`,
                  `${r.over100.toLocaleString("en-US")} (${pct(r.over100, r.total)})`,
                ])}
              />
              <p>
                Higher rarities are more likely to be expensive, but every row contains cheap cards, and the dearest cards in the game include printings of every
                rarity once age and special treatments are counted.
              </p>
            </>
          ),
        },
        {
          id: "beyond-rarity",
          title: "What moves a price more than rarity",
          body: (
            <>
              <p>
                Format demand, reprints, age, and the treatment of the printing matter more. A card legal in Commander or Modern gets bought by thousands of decks; a
                reprint in a later set lowers the price of the older versions; and a borderless, showcase or foil printing carries its own premium.
              </p>
              <Callout title="Look at the printing, not the card">
                Open any card on MTG Compare to see every printing and finish of it with their prices side by side. The{" "}
                <Link href="/price-guide">price guide</Link> lists the dearest cards overall.
              </Callout>
            </>
          ),
        },
      ],
    };
  },
};
