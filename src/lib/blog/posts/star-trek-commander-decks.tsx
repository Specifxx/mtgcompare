import Link from "next/link";
import { Callout, CardGallery, SimpleTable } from "@/components/blog/BlogBits";
import { COUNTRIES } from "../../country";
import { money } from "../../format";
import { STAR_TREK, daysUntil, lineMsrp, longDateOf } from "../../preorders";
import { PRECONS, PRECONS_REPORTED, STAR_TREK_CHECKED, deckProducts, liveIn, namedOracle, starTrekView } from "../star-trek";
import type { Post } from "../types";
import { plural } from "../util";

// The four Star Trek Commander decks: what Wizards says each box holds and costs (US MSRP, sourced and dated in lib/preorders.ts),
// what fan trackers report about each deck's colours and theme (attributed, lib/blog/star-trek.ts), and, from the published data,
// each deck's cheapest live price in the visitor's market and the Commander: Star Trek (TRC) cards TCGplayer has listed. It fills in
// on its own: a deck the catalogue lists gets its prices, a TRC card its tile. No face commander or decklist is named until Wizards
// publishes one; no price is typed.
const CARD_ROWS = 24;
const today = () => new Date().toISOString().slice(0, 10);
const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const starTrekCommanderDecks: Post = {
  slug: "magic-star-trek-commander-decks",
  title: () => "MTG Star Trek Commander Decks: All 4 Precons Explained",
  description:
    "Federation Fleet, Landing Party, Klingon Fury and We Are the Borg: what is in each Star Trek Commander deck, the colours and themes reported so far, Wizards' US MSRP and today's cheapest price in your market.",
  tags: ["star trek", "commander", "precons", "sealed"],
  category: "blog",
  date: "2026-10-16",
  minutes: 7,
  faq: [
    {
      q: "How many Star Trek Commander decks are there?",
      a: "Four, according to Wizards of the Coast's Collecting Star Trek article: Federation Fleet, Landing Party, Klingon Fury and We Are the Borg, each also sold as a Collector's Edition in surge foil. Fan trackers report their colours as Jeskai, Bant, Mardu and Esper respectively (playgroup.gg, read 16 October 2026); Wizards' article does not give them.",
    },
    {
      q: "How much do the Star Trek Commander decks cost?",
      a: "Wizards of the Coast's US MSRP is US$74.99 for a Commander deck and US$159.99 for a Collector's Edition, in its Collecting Star Trek article of 14 July 2026. Stores set their own prices in each market: this post shows today's cheapest in yours, and the [Star Trek pre-order page](/star-trek-preorders) compares every store.",
    },
    {
      q: "When are the Star Trek Commander decks released?",
      a: "With the rest of the set, on 13 November 2026, according to Wizards of the Coast. Prerelease week, when Wizards Play Network stores may begin selling the set's products, runs from 6 to 12 November 2026.",
    },
    {
      q: "Are the Star Trek Commander decklists revealed?",
      a: "Not as of 16 October 2026. Wizards has named the four decks and listed what each box holds, but not their face commanders or their 100-card lists. The Commander: Star Trek cards in this post fill in as TCGplayer lists them.",
    },
    {
      q: "What is the difference between a Star Trek Commander deck and its Collector's Edition?",
      a: "The finish and the price. Wizards lists the same contents for both: a 100-card deck with 32 new-to-Magic cards, a face commander with borderless art, 10 double-sided tokens, a reference card and a deck box. In the Collector's Edition the face commander, the other 99 cards and the tokens are surge foil.",
    },
  ],
  related: [
    { href: STAR_TREK.path, label: "Star Trek pre-orders" },
    { href: "/commanders", label: "Commanders" },
    { href: "/deck", label: "Deck pricer" },
  ],
  build: (ctx) => {
    const rv = starTrekView(ctx);
    const date = rv?.releasedOn ?? STAR_TREK.announced;
    const out = rv?.out ?? false;
    const days = daysUntil(date, today());
    const here = COUNTRIES[ctx.country];
    const word = out ? "price" : "pre-order";
    const decks = deckProducts(rv?.sealed ?? []);
    const listed = decks.filter((d) => d.deck || d.collectors);
    const priced = decks.flatMap((d) => (d.deck && liveIn(d.deck, ctx.country) ? [{ name: d.name, p: d.deck, live: liveIn(d.deck, ctx.country)! }] : []));
    const cheapest = [...priced].sort((a, b) => a.live.cents - b.live.cents)[0] ?? null;
    const regular = lineMsrp(STAR_TREK, "Commander Deck"), collectors = lineMsrp(STAR_TREK, "Collector's Edition Commander Deck");
    const commanderSet = rv?.sets.find((s) => s.tok === STAR_TREK.toks[1]) ?? null;
    const trc = rv?.cards.find((g) => g.set.tok === STAR_TREK.toks[1]) ?? null;
    const caseProduct = (rv?.sealed ?? []).find((p) => p.kind === "Case" && /commander deck/i.test(p.name) && !/collector['’]?s edition/i.test(p.name)) ?? null;
    const caseLive = liveIn(caseProduct, ctx.country);
    const fourSum = priced.length === 4 && decks.length === 4 ? priced.reduce((t, x) => t + x.live.cents, 0) : null;
    const borgQueen = namedOracle(ctx.starTrek, "Borg Queen, Perfection Manifest"), kirk = namedOracle(ctx.starTrek, "Captain Kirk, Boldly Going");
    const reported = PRECONS_REPORTED;
    const reportedSource = (
      <>
        (
        <a href={reported.source.url} target="_blank" rel="noopener noreferrer">
          {reported.source.label}
        </a>
        , read {longDateOf(reported.checked)})
      </>
    );
    const productLink = (p: { slug: string; name: string } | null, text: string) => (p ? <Link href={`/sealed/${p.slug}`}>{text}</Link> : text);
    const cardName = (o: { slug: string; name: string } | null, name: string) => (o ? <Link href={`/cards/name/${o.slug}`}>{name}</Link> : <em>{name}</em>);
    const hero = [...(trc?.items ?? [])].filter((c) => c.hasImage).sort((a, b) => (b.marketUsd ?? -1) - (a.marketUsd ?? -1)).slice(0, 3);

    return {
      heroCards: hero,
      summary: [
        <>
          <strong>Wizards of the Coast lists four Star Trek Commander decks:</strong> Federation Fleet, Landing Party, Klingon Fury and We Are the Borg, each also in a surge
          foil Collector&apos;s Edition. They {out ? "released" : "release"} with the set on {longDateOf(date)}
          {!out && days > 0 ? `, ${plural(days, "day")} from today` : ""}.
        </>,
        regular && collectors ? (
          <>
            Wizards&apos; US MSRP is {money(regular.usdCents, "US")} a deck and {money(collectors.usdCents, "US")} for a Collector&apos;s Edition.
          </>
        ) : null,
        cheapest ? (
          <>
            In {here.place} the cheapest regular deck we track today is {productLink(cheapest.p, cheapest.name)} at {money(cheapest.live.cents, ctx.country)}
            {cheapest.live.stores ? ` (${plural(cheapest.live.stores, "store")} ${cheapest.live.stores === 1 ? "lists" : "list"} it)` : " (TCGplayer's lowest listing)"}.
          </>
        ) : listed.length ? (
          <>No store we track in {here.place} lists a Star Trek Commander deck {out ? "" : "pre-order "}yet; the table below fills in once one does.</>
        ) : (
          <>No Star Trek Commander deck is in our catalogue yet; the table below fills in as TCGplayer lists them.</>
        ),
        <>
          Face commanders and decklists are not public yet (as of {longDateOf(STAR_TREK_CHECKED)}); the colours and themes below are what fan trackers report.
        </>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>What are the Star Trek Commander decks, and which should you buy?</strong> Magic: The Gathering Star Trek comes with four ready-to-play Commander decks,
          each built around a different corner of the Star Trek universe. Here is what Wizards of the Coast has confirmed about them, what has only been reported so far,
          and what each costs in {here.place} today, from our daily import. The set&apos;s other products are in{" "}
          <Link href="/blog/magic-star-trek-release-date-products">the Star Trek release date and products guide</Link>.
        </p>
      ),
      sections: [
        {
          id: "in-the-box",
          title: "What is in every Star Trek Commander deck",
          body: (
            <>
              <p>Per Wizards of the Coast&apos;s Collecting Star Trek article, each Commander deck holds:</p>
              <ul>
                <li>a ready-to-play 100-card Commander deck;</li>
                <li>a traditional foil face commander with borderless art;</li>
                <li>99 non-foil cards, 32 of them new to Magic;</li>
                <li>10 double-sided tokens, a reference card and a deck box.</li>
              </ul>
              <p>
                Each <strong>Collector&apos;s Edition</strong> holds the same named deck in surge foil: a surge foil face commander, 99 surge foil cards (again 32 new to Magic)
                and 10 tokens that are surge foil on one side, with a reference card and a deck box.
                {regular && collectors && STAR_TREK.msrp
                  ? ` Wizards' US MSRPs are ${money(regular.usdCents, "US")} and ${money(collectors.usdCents, "US")} (${longDateOf(STAR_TREK.msrp.source.published)}).`
                  : ""}
              </p>
            </>
          ),
        },
        {
          id: "decks",
          title: "The four decks at a glance",
          body: (
            <>
              <SimpleTable
                head={["Deck", "Colours (reported)", "Theme (reported)", `Cheapest in ${here.code}`, `Collector's Edition in ${here.code}`]}
                align={["l", "l", "l", "r", "r"]}
                rows={decks.map((d) => {
                  const r = PRECONS.find((x) => x.name === d.name);
                  const a = liveIn(d.deck, ctx.country), b = liveIn(d.collectors, ctx.country);
                  return [
                    <strong key="n">{productLink(d.deck, d.name)}</strong>,
                    r ? `${r.colours} (${r.identity})` : "Not reported",
                    r?.theme ?? "Not reported",
                    a ? money(a.cents, ctx.country) : d.deck ? "No listing yet" : "Not in our data yet",
                    b ? productLink(d.collectors, money(b.cents, ctx.country)) : d.collectors ? "No listing yet" : "Not in our data yet",
                  ];
                })}
              />
              <p>
                Wizards&apos; article names the four decks and nothing more about them. The colours and themes are what fan trackers report {reportedSource}, which also notes
                that no face commander or decklist has been published. Prices are the cheapest {word} we track in {here.place} today, in {here.currency}
                {ctx.country === "US" ? ", TCGplayer's lowest listing included" : ""}; postage is not included. Every store, deck by deck, is on the{" "}
                <Link href={STAR_TREK.path}>Star Trek pre-order page</Link>.
              </p>
            </>
          ),
        },
        ...decks
          .filter((d) => PRECONS.some((p) => p.name === d.name))
          .map((d) => {
            const r = PRECONS.find((p) => p.name === d.name)!;
            const a = liveIn(d.deck, ctx.country);
            return {
              id: slugOf(d.name),
              title: `${d.name} (${r.colours}, reported)`,
              body: (
                <>
                  <p>
                    Reported as a {r.identity} deck about {r.theme} {reportedSource}.{" "}
                    {d.name === "Federation Fleet" ? (
                      <>
                        Starships in Magic are Spacecraft, which grow into creatures through the station mechanic, back from Edge of Eternities:{" "}
                        <Link href="/blog/magic-star-trek-mechanics-explained#station">how station works</Link>.
                      </>
                    ) : d.name === "Landing Party" ? (
                      <>Landfall rewards you each time a land enters the battlefield under your control, so a landfall deck plays extra lands and ways to fetch them.</>
                    ) : d.name === "Klingon Fury" ? (
                      <>Warrior is an old creature type in Magic, so a Warrior deck has a long list of past cards to upgrade with.</>
                    ) : (
                      <>
                        Assimilate gains you control of a creature or puts a creature card onto the battlefield, depending on the card, and makes it a Borg artifact creature:{" "}
                        <Link href="/blog/magic-star-trek-mechanics-explained#assimilate">how assimilate works</Link>.
                      </>
                    )}
                  </p>
                  <p>
                    {a ? (
                      <>
                        Cheapest in {here.place} today: {productLink(d.deck, d.name)} at {money(a.cents, ctx.country)}
                        {a.stores ? ` from ${plural(a.stores, "store")}` : ", TCGplayer's lowest listing"}.
                      </>
                    ) : d.deck ? (
                      <>No store we track in {here.place} lists {productLink(d.deck, d.name)} yet.</>
                    ) : (
                      <>{d.name} is not in our catalogue yet; its prices appear here once TCGplayer lists it.</>
                    )}{" "}
                    Its face commander and decklist are not public yet.
                  </p>
                </>
              ),
            };
          }),
        {
          id: "commander-cards",
          title: commanderSet ? `${commanderSet.name} (${commanderSet.code}) cards revealed so far` : "Commander set cards revealed so far",
          body: (
            <>
              <p>
                The cards of the four decks are filed as their own set, TRC. Scryfall already lists some revealed TRC legends: {cardName(kirk, "Captain Kirk, Boldly Going")}, a
                green-white-blue legend that gives your Spacecraft creatures +3/+3 and finds basic lands, and {cardName(borgQueen, "Borg Queen, Perfection Manifest")}, a black
                legend that assimilates a creature card from an opponent&apos;s graveyard. Wizards has not said which product each comes in, so we do not assign them to a deck.
              </p>
              {trc && trc.total ? (
                <>
                  <p>
                    {plural(trc.total, `${trc.set.code} card`)} {trc.total === 1 ? "is" : "are"} in our data so far
                    {trc.total > CARD_ROWS ? `; the first ${CARD_ROWS} in collector number order` : ", in collector number order"}, with the cheapest price we track in{" "}
                    {here.place} where there is one.
                  </p>
                  <CardGallery cards={trc.items.slice(0, CARD_ROWS)} country={ctx.country} />
                  <p>
                    Every one is on <Link href={`/sets/${trc.set.slug}`}>the {trc.set.code} set page</Link>.
                  </p>
                </>
              ) : (
                <p>
                  No {commanderSet ? commanderSet.name : "Commander: Star Trek"} singles are in our data yet: TCGplayer lists the decks as sealed products for now. This section
                  fills in on its own once it lists the cards
                  {commanderSet ? (
                    <>
                      , as does <Link href={`/sets/${commanderSet.slug}`}>the {commanderSet.code} set page</Link>
                    </>
                  ) : null}
                  .
                </p>
              )}
            </>
          ),
        },
        {
          id: "regular-or-collectors",
          title: "Regular or Collector's Edition?",
          body: (
            <>
              <p>
                Wizards lists the same contents for both, and the Collector&apos;s Edition swaps the finish to surge foil, commander and tokens included. That is a cosmetic
                upgrade, so the choice depends on what the deck is for:
              </p>
              <ul>
                <li>
                  <strong>To play at your table:</strong> the regular deck
                  {regular && collectors ? `, at ${regular.usdCents * 2 < collectors.usdCents ? "less than half" : "a fraction of"} the Collector's Edition's US MSRP` : ""}.
                </li>
                <li>
                  <strong>To own a fully foiled deck:</strong> the Collector&apos;s Edition is the simplest way to get one without buying foil singles one by one.
                </li>
                <li>
                  <strong>As an investment:</strong> we do not forecast prices, and nothing here says a deck will rise.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "all-four",
          title: "Should you buy all four?",
          body: (
            <p>
              Only if you want Star Trek decks to play against each other, or all four for a collection: each deck is sold on its own.
              {fourSum != null ? ` Bought separately at today's cheapest in ${here.place}, the four regular decks come to ${money(fourSum, ctx.country)}.` : ""}
              {caseProduct ? (
                <>
                  {" "}
                  Some stores also sell a {productLink(caseProduct, caseProduct.name)}
                  {caseLive ? `, cheapest in ${here.place} today at ${money(caseLive.cents, ctx.country)}` : ""}; the listing does not say how many decks it holds, so check the
                  store&apos;s description before you compare.
                </>
              ) : null}
            </p>
          ),
        },
        {
          id: "upgrades",
          title: "Upgrading a Star Trek precon on a budget",
          body: (
            <>
              <ol>
                <li>
                  <strong>Lands first.</strong> The main set reprints all ten shock lands, which suit three-colour decks; their prices are in{" "}
                  <Link href="/blog/magic-star-trek-release-date-products#booster-fun">the Star Trek products guide</Link>.
                </li>
                <li>
                  <strong>Staples you already own.</strong> Ramp, card draw and removal from your collection usually do more than new cards:{" "}
                  <Link href="/blog/commander-staples-prices">what the Commander staples cost</Link>.
                </li>
                <li>
                  <strong>Cheap printings.</strong> <Link href="/blog/cheapest-magic-mythic-rares-by-colour">The cheapest mythic rares by colour</Link> lists budget upgrades,
                  and the <Link href="/deck">deck pricer</Link> prices a whole list in your market.
                </li>
              </ol>
              <Callout title="Which precon is the best value?">
                We will not guess before the decklists are out: a precon&apos;s value is mostly its reprints, and none is known yet. When they are, every card is priced on its
                own page, and <Link href="/commanders">the commanders page</Link> lists every legal commander.
              </Callout>
              {STAR_TREK.trademark ? <p className="text-xs text-slate-500">{STAR_TREK.trademark}</p> : null}
            </>
          ),
        },
      ],
    };
  },
};
