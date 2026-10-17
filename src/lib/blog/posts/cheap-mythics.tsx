import Link from "next/link";
import { Callout } from "@/components/blog/BlogBits";
import { UnitTable } from "@/components/blog/UnitTable";
import type { CardLite } from "../../data";
import { money } from "../../format";
import { COLOUR_GROUPS, MYTHIC_SETS, TRACKED_FROM_CENTS, type ColourGroup } from "../select";
import type { Post, PostSection } from "../types";
import { cardLabel, monthYear } from "../util";

/** "A, B and C". */
const andList = (xs: readonly React.ReactNode[]): React.ReactNode[] => xs.flatMap((x, i) => (i === 0 ? [x] : [i === xs.length - 1 ? " and " : ", ", x]));

// "Cheapest X by colour", the Magic way: the cheapest mythic rares of each colour in the newest expansions (the Magic counterpart of a
// budget alternate-art list, with the alternate frames as their own table). One row per card at its cheapest printing in those sets, ranked
// by TCGplayer MARKET price; the colour is Scryfall's, and a card without a Scryfall match has none and is left out, never guessed.
export const cheapMythics: Post = {
  slug: "cheapest-magic-mythic-rares-by-colour",
  title: ({ cat }) => `Cheapest Magic Mythic Rares by Colour (${monthYear(cat.pricesAt)})`,
  description:
    "The cheapest mythic rares in every colour from the newest Magic: The Gathering expansions, by TCGplayer market price: one printing per card with its finish named, plus the cheapest borderless, showcase and extended-art mythics.",
  tags: ["budget", "prices", "mythic rare"],
  date: "2026-10-14",
  minutes: 5,
  related: [
    { href: "/colors", label: "Cards by colour" },
    { href: "/cards/rarity/mythic", label: "Mythic rares" },
    { href: "/sets", label: "All sets" },
  ],
  faq: [
    {
      q: "Why are some mythic rares so cheap?",
      a: "Rarity says how often a card is opened in a booster, not how many players want it. A mythic built for a casual or Limited role, or one that no Constructed or Commander deck plays, can sell for less than a popular common. The tables rank by TCGplayer market price, which follows recent sales.",
    },
    {
      q: "Which sets does this list cover?",
      a: `The ${MYTHIC_SETS} newest Magic expansions that have been released and priced, read from our data each time the page is generated. When a new expansion is out and priced it replaces the oldest of them, with no change to the post. All the sets are on the [sets page](/sets).`,
    },
    {
      q: "Is the cheapest printing always the regular non-foil card?",
      a: "Usually, but not always. Each card is shown at whichever of its printings in these sets has the lowest market price, and the row names that printing and its finish. Borderless, showcase and extended-art printings are separate products with their own prices.",
    },
    {
      q: "How is a card's colour decided?",
      a: "From Scryfall: a card of one colour sits under that colour, a card of two or more under Multicolor, and a card with no colour under Colorless. Colour identity, which Commander uses, can differ. A product without a Scryfall match has no colour data and is left out rather than guessed. Browse every colour on the [colours page](/colors).",
    },
    {
      q: "Are these prices the same in my market?",
      a: `TCGplayer's market price is a US dollar figure. The last column of each table is the cheapest in-stock listing we track in your market, which exists for the printings we price-track (the most relevant quarter of Magic, from about ${money(TRACKED_FROM_CENTS, "US")}); for the rest it is a reference converted from the US price.`,
    },
  ],
  build: ({ mythics, country }) => {
    if (!mythics) {
      return {
        heroCards: [],
        summary: [],
        lede: (
          <p>
            The mythic rare prices could not be read just now, so this post has no tables on this page load. Every mythic is listed on the{" "}
            <Link href="/cards/rarity/mythic">mythic rares page</Link>.
          </p>
        ),
        sections: [],
      };
    }
    if (!mythics.sets.length) {
      return {
        heroCards: [],
        summary: [],
        lede: (
          <p>
            No released expansion has enough priced cards to read yet. The newest sets are on the <Link href="/sets">sets page</Link>.
          </p>
        ),
        sections: [],
      };
    }
    const sets = mythics.sets;
    const groups = COLOUR_GROUPS.map((g) => ({ g, cards: mythics.groups.find((x) => x.key === g.key)?.cards ?? [] }));
    const filled = groups.filter((x) => x.cards.length);
    const empty = groups.filter((x) => !x.cards.length);
    const firsts = filled.map((x) => ({ g: x.g, c: x.cards[0]! }));
    const cents = (c: CardLite): number => c.marketUsd ?? 0;
    const cheapest = [...firsts].sort((a, b) => cents(a.c) - cents(b.c) || a.c.id - b.c.id)[0];
    const dearest = [...firsts].sort((a, b) => cents(b.c) - cents(a.c) || a.c.id - b.c.id)[0];
    const under1 = firsts.filter((x) => cents(x.c) < 100).length;
    const treated = mythics.treated;
    const setLinks = sets.map((s) => (
      <Link key={s.id} href={`/sets/${s.slug}`}>
        {s.name}
      </Link>
    ));
    const colourName = (g: ColourGroup): string => g.label.toLowerCase();

    const sections: PostSection[] = filled.map(({ g, cards }) => ({
      id: g.key,
      title: `The cheapest ${colourName(g)} mythic rares`,
      body: (
        <>
          <p>
            {g.colors.mode === "multi"
              ? "Gold cards: two colours or more."
              : g.colors.mode === "colorless"
                ? "No colour: artifacts, lands and colourless spells."
                : `Cards that are ${colourName(g)} and no other colour.`}{" "}
            {cards.length === 1 ? "The one priced mythic rare" : `The ${cards.length} cheapest mythic rares`} of the {sets.length === 1 ? "set" : `${sets.length} sets`}, at each
            card&apos;s cheapest printing:
          </p>
          <UnitTable cards={cards} country={country} />
          <p>
            <Link href={`/colors/${g.key}`}>Every {colourName(g)} card</Link>, with prices.
          </p>
        </>
      ),
    }));
    if (treated.length) {
      sections.push({
        id: "special-frames",
        title: "Special frames on a budget",
        body: (
          <>
            <p>
              Borderless, showcase and extended-art printings are the alternate frames Magic sets print their mythics in, and they are often the dearest version of
              a card. Not always: these are the cheapest of them in the same sets, any colour, one row per card.
            </p>
            <UnitTable cards={treated} country={country} />
          </>
        ),
      });
    }
    sections.push(
      {
        id: "why",
        title: "Why a mythic can cost less than a common",
        body: (
          <>
            <p>
              Mythic rare is a pack rarity: it says how rarely a card is opened, not how many players want it (the <Link href="/guides/magic-card-rarities-explained">rarity
              guide</Link> explains the four). Every set has mythics that are big and exciting in a booster draft and have no place in a Constructed or Commander deck, and
              with no buyers beyond collectors their price sinks to a little above bulk. Meanwhile a common that every Commander deck plays can cost more, and the
              newest set&apos;s <Link href="/blog/newest-magic-set-chase-cards">chase cards</Link> sit at the other end of the same rarity.
            </p>
            <p>
              Price also moves after release. New mythics usually start high, while supply is short, and settle as boxes are opened; the cheapest mythics of a new
              set are often cheaper a month later. The <Link href="/blog/magic-card-price-movers">weekly price movers</Link> show which cards are moving now.
            </p>
          </>
        ),
      },
      {
        id: "buying",
        title: "Buying cheap mythics",
        body: (
          <>
            <ul>
              <li>Check the printing in the row: a set&apos;s regular, borderless and showcase versions of a card are separate products with separate prices.</li>
              <li>Postage can cost more than a cheap card. Buy several from the same store, and compare the stores on each card&apos;s page.</li>
              <li>Foil and non-foil are priced separately; every row names the finish its price is for.</li>
            </ul>
            <Callout title="Building on a budget">
              For the cards a Commander deck needs whatever its colours, see the <Link href="/blog/commander-staples-prices">Commander staples price list</Link>; paste
              a whole list into the <Link href="/deck">deck pricer</Link> to price it in your market.
            </Callout>
          </>
        ),
      },
    );
    if (empty.length) {
      sections.push({
        id: "coverage",
        title: "What the tables leave out",
        body: (
          <p>
            {andList(empty.map((x) => x.g.label))}: no mythic rare of these sets has a TCGplayer market price today, so {empty.length === 1 ? "that table is" : "those tables are"}{" "}
            left out rather than filled with guesses. A printing priced only by a single listing is never ranked.
          </p>
        ),
      });
    }

    return {
      heroCards: firsts.map((x) => x.c).filter((c) => c.hasImage).slice(0, 3),
      summary: [
        cheapest ? (
          <>
            <strong>The cheapest mythic rare</strong> in these sets is <Link href={`/card/${cheapest.c.slug}`}>{cardLabel(cheapest.c)}</Link> ({colourName(cheapest.g)}),
            at {money(cheapest.c.marketUsd, "US")} on TCGplayer.
          </>
        ) : null,
        firsts.length ? (
          <>
            {under1 === firsts.length
              ? `In every colour group with a priced mythic, the cheapest costs under ${money(100, "US")}`
              : `In ${under1} of the ${firsts.length} colour groups with a priced mythic, the cheapest costs under ${money(100, "US")}`}
            {dearest && dearest !== cheapest ? `; ${colourName(dearest.g)}'s cheapest mythic costs the most, at ${money(dearest.c.marketUsd, "US")}` : ""}.
          </>
        ) : null,
        treated[0] ? (
          <>
            The cheapest borderless, showcase or extended-art mythic is <Link href={`/card/${treated[0].slug}`}>{cardLabel(treated[0])}</Link>, at{" "}
            {money(treated[0].marketUsd, "US")}.
          </>
        ) : null,
        <>Covers {andList(setLinks)}: the {sets.length === 1 ? "newest expansion" : `${sets.length} newest expansions`}, read again with every daily import.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>A mythic rare does not have to be expensive.</strong> Mythics are the rarest cards in a booster, but price follows demand, and every set has mythics few
          decks want. We took the {sets.length === 1 ? "newest Magic expansion" : `${sets.length} newest Magic expansions`} ({andList(setLinks)}) and, for each colour,
          found the mythic rares with the lowest TCGplayer market price. Each card appears once, at its cheapest printing in those sets (usually the regular non-foil,
          sometimes a special frame or a foil, named in the row). A card&apos;s colour is Scryfall&apos;s: gold cards are under Multicolor, colourless artifacts and
          lands under Colorless, and a card with no Scryfall match has no colour and is left out.
        </p>
      ),
      sections,
    };
  },
};
