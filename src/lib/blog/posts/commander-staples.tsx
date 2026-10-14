import Link from "next/link";
import { Callout } from "@/components/blog/BlogBits";
import { UnitTable } from "@/components/blog/UnitTable";
import type { CardLite } from "../../data";
import { longDate, money } from "../../format";
import { COLOUR_GROUPS, COMMANDER_STAPLES, STAPLES_CHOSEN_ON, STAPLE_GROUP_ORDER, identityGroup, stapleStatus, stapleSummary, type StapleRow } from "../select";
import type { Post, PostSection } from "../types";
import { cardLabel, monthYear } from "../util";

const groupLabel = (key: string): string => COLOUR_GROUPS.find((g) => g.key === key)?.label ?? key;
const nameList = (rows: readonly StapleRow[]): string => rows.map((r) => r.staple.name).join(", ");
const DEAREST = 5;

// A curated list priced from the data: the cards nearly every Commander deck plays (COMMANDER_STAPLES in select.ts, with how and when it
// was chosen), each resolved by name to its Oracle card and priced at its ORDINARY printing, the cheapest plain printing by TCGplayer MARKET
// price (the printing the site's search opens for the name). One row per card, the printing and finish named. A card Scryfall marks banned in
// Commander drops out of the tables; a name that stops resolving is named, never guessed.
export const commanderStaples: Post = {
  slug: "commander-staples-prices",
  title: ({ cat }) => `Commander Staples Prices: What the Cards Every Deck Plays Cost (${monthYear(cat.pricesAt)})`,
  description: `What ${COMMANDER_STAPLES.length} of the most widely played Commander staples cost right now, from Sol Ring and Arcane Signet to Rhystic Study and Cyclonic Rift: each at its cheapest ordinary printing by TCGplayer market price, grouped by colour identity, with the cheapest listing in your market.`,
  tags: ["commander", "prices", "budget"],
  date: "2026-10-14",
  minutes: 6,
  related: [
    { href: "/commanders", label: "Commanders" },
    { href: "/deck", label: "Deck pricer" },
    { href: "/decks", label: "Deck library" },
  ],
  faq: [
    {
      q: "What is a Commander staple?",
      a: "A card that suits almost any Commander deck of its colours, so it turns up in a large share of decks: mana rocks such as Sol Ring, removal such as Swords to Plowshares and card draw such as Rhystic Study. The list in this post is a hand-picked set of the most widely played.",
    },
    {
      q: "Are any of these cards banned in Commander?",
      a: `The post checks rather than assumes: each card's Commander legality is read from Scryfall with every import, and a card that is banned or not legal drops out of the tables and is named under "How we chose the list". The cards banned in September 2024, such as Dockside Extortionist and Mana Crypt, were left off the list when it was chosen in ${monthYear(STAPLES_CHOSEN_ON)}.`,
    },
    {
      q: "Why is the printing shown not the cheapest copy I can find?",
      a: "Each card is priced at its cheapest ordinary printing by TCGplayer market price: the plain version from a main set or a Commander deck. A promo, The List or Secret Lair copy can occasionally sell for less, and a store in your market may undercut the market price; each card's page compares every printing and every store we track.",
    },
    {
      q: "How much does it cost to buy every staple on the list?",
      a: "The first point of the short version adds up the market price of each card's cheapest ordinary printing, and it changes with every daily import. Postage and tax are extra; buying several cards from one store usually saves more than chasing the cheapest copy of each. The [deck pricer](/deck) prices a whole list in your market.",
    },
    {
      q: "What are Game Changers?",
      a: "Game Changers are cards Wizards of the Coast lists as having an outsized effect on a Commander game; the Commander brackets limit how many of them a deck in the lower brackets may play. We read the list from Scryfall's card data, so it follows Wizards' updates.",
    },
  ],
  build: ({ staples, country }) => {
    const chosen = (
      <p>
        The list was chosen by hand on {longDate(STAPLES_CHOSEN_ON)} from the cards Commander players meet in deck after deck, spread over the five colours and
        colourless and over the jobs every deck has to do: ramp, card draw, removal, board wipes, counterspells, protection, tutors and lands. They are names a
        Commander player recognises on sight; Reserved List cards and collectibles priced in the hundreds are left out, because a staple is a card people actually
        buy for their decks. The cards banned in Commander in September 2024 (Dockside Extortionist, Jeweled Lotus, Mana Crypt and Nadu, Winged Wisdom) are left
        out on purpose, and the list does not rely on a check made once: each card&apos;s Commander legality is read from Scryfall with every import, and a card
        that is banned drops out of the tables.
      </p>
    );
    if (!staples) {
      return {
        heroCards: [],
        summary: [],
        lede: (
          <p>
            The staple prices could not be read just now, so this post has no tables on this page load. Every card is on its own page, and the{" "}
            <Link href="/deck">deck pricer</Link> prices a whole list.
          </p>
        ),
        sections: [{ id: "how-chosen", title: "How we chose the list", body: chosen }],
      };
    }
    const s = stapleSummary(staples);
    const roleOf = new Map(s.shown.filter((r) => r.card).map((r) => [r.card!.id, r.staple.role] as const));
    const groups = STAPLE_GROUP_ORDER.map((key) => ({ key, rows: s.shown.filter((r) => identityGroup(r.oracle!.identity) === key) })).filter((g) => g.rows.length);
    const top = s.dearest.slice(0, DEAREST);
    const topCents = top.reduce((t, r) => t + (r.card!.marketUsd ?? 0), 0);
    const dearest = s.dearest[0];
    const sol = s.priced.find((r) => r.staple.name === "Sol Ring");
    const heroCards = [...(sol ? [sol] : []), ...s.dearest]
      .map((r) => r.card!)
      .filter((c, i, a) => c.hasImage && a.findIndex((x) => x.id === c.id) === i)
      .slice(0, 3);

    const sections: PostSection[] = groups.map((g) => {
      const cards = g.rows.flatMap((r) => (r.card ? [r.card] : []));
      const missing = g.rows.filter((r) => stapleStatus(r) === "unpriced");
      return {
        id: `staples-${g.key}`,
        title: `${groupLabel(g.key)} staples`,
        body: (
          <>
            {cards.length ? (
              <UnitTable cards={cards} country={country} extra={{ head: "Role", cell: (c: CardLite) => roleOf.get(c.id) ?? "", align: "l" }} />
            ) : null}
            {missing.length ? <p>No printing of {nameList(missing)} could be priced today; the card page shows what is listed.</p> : null}
          </>
        ),
      };
    });
    if (top.length >= 2 && s.totalCents > 0) {
      sections.push({
        id: "where-the-money-goes",
        title: "Where the money goes",
        body: (
          <>
            <p>
              {s.under5 * 2 >= s.priced.length ? "Most of the list is cheap: " : ""}
              {s.under1} of the {s.priced.length} priced staples cost under {money(100, "US")} at their cheapest ordinary printing, and {s.under5} under{" "}
              {money(500, "US")}. The {top.length} dearest add up to {money(topCents, "US")}, which is {Math.round((topCents / s.totalCents) * 100)}% of the{" "}
              {money(s.totalCents, "US")} the whole list costs:
            </p>
            <ul>
              {top.map((r) => (
                <li key={r.card!.id}>
                  <Link href={`/card/${r.card!.slug}`}>{cardLabel(r.card!)}</Link>: {money(r.card!.marketUsd, "US")} ({r.staple.role.toLowerCase()})
                </li>
              ))}
            </ul>
            <p>
              If you are building on a budget, these are the cards to look at last: most of them have cheaper cards that do a similar job.
            </p>
          </>
        ),
      });
    }
    if (s.gameChangers.length) {
      sections.push({
        id: "game-changers",
        title: "Which of these are Game Changers",
        body: (
          <p>
            Scryfall marks {s.gameChangers.length === 1 ? "one card on this list" : `${s.gameChangers.length} cards on this list`} as Game Changers:{" "}
            {nameList(s.gameChangers)}. Wizards of the Coast keeps that list for the Commander brackets, which limit how many Game Changers a deck in the lower
            brackets may play, so check your playgroup&apos;s bracket before adding them.
          </p>
        ),
      });
    }
    sections.push(
      {
        id: "how-chosen",
        title: "How we chose the list",
        body: (
          <>
            {chosen}
            {s.banned.length ? (
              <p>Banned or not legal in Commander today, and left out of the tables: {nameList(s.banned)}.</p>
            ) : s.shown.length ? (
              <p>Scryfall marks none of the cards on the list as banned in Commander today.</p>
            ) : null}
            {s.unknown.length ? <p>Not found in our card data today, and left out: {nameList(s.unknown)}.</p> : null}
            <p>
              Each card is priced at its cheapest ordinary printing: the plain-frame printing from a main set or a Commander deck with the lowest TCGplayer market
              price, the one our search opens when you type the card&apos;s name. Promos, The List, Secret Lair and the special frames are left out of the price,
              and each card&apos;s page lists them.
            </p>
          </>
        ),
      },
      {
        id: "saving",
        title: "Saving money on staples",
        body: (
          <>
            <ul>
              <li>Recent preconstructed Commander decks include several of these cards, Sol Ring, Arcane Signet and Command Tower above all, so check what a precon already gives you before buying singles.</li>
              <li>A reprint lowers the price of every printing of a card. A staple that has just been reprinted is usually at its cheapest for a while.</li>
              <li>Postage can cost more than a cheap card: buy several from one store, and compare the stores on each card&apos;s page.</li>
              <li>
                Watch the dearer cards rather than buying in a week they spike: the <Link href="/blog/magic-card-price-movers">weekly price movers</Link> show which
                cards are moving.
              </li>
            </ul>
            <Callout title="Price your own list">
              Paste a deck list into the <Link href="/deck">deck pricer</Link> to price every card in your market; a line with no set is priced at the card&apos;s
              cheapest regular printing. For cheap cards from the newest sets, see the <Link href="/blog/cheapest-magic-mythic-rares-by-colour">cheapest mythic rares by
              colour</Link>.
            </Callout>
          </>
        ),
      },
    );

    return {
      heroCards,
      summary: [
        s.priced.length ? (
          <>
            <strong>Buying one of each of the {s.priced.length} priced staples</strong> at its cheapest ordinary printing costs {money(s.totalCents, "US")} at TCGplayer
            market prices.
          </>
        ) : null,
        s.priced.length ? (
          <>
            {s.under1} of them cost under {money(100, "US")} and {s.under5} under {money(500, "US")}
            {dearest ? (
              <>
                ; the dearest is <Link href={`/card/${dearest.card!.slug}`}>{dearest.card!.name}</Link> at {money(dearest.card!.marketUsd, "US")}
              </>
            ) : null}
            .
          </>
        ) : null,
        s.gameChangers.length ? <>{s.gameChangers.length} of them are on Wizards&apos; Game Changers list, which the lower Commander brackets limit.</> : null,
        <>Each card is priced at one printing, named in its row with its finish; every card page lists the others and compares the stores in your market.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>Some cards turn up in almost every Commander deck:</strong> the mana rocks, the removal and the card draw that work whatever the commander. We picked{" "}
          {COMMANDER_STAPLES.length} of the most widely played (how, and when, is below) and priced each at its cheapest ordinary printing: the plain printing from a
          main set or a Commander deck with the lowest TCGplayer market price. They are grouped by colour identity, colourless first, since those fit every deck.
          Prices are rebuilt from the newest import each time the page is generated.
        </p>
      ),
      sections,
    };
  },
};
