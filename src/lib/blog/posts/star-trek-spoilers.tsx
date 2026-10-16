import Link from "next/link";
import { CardGallery, Callout } from "@/components/blog/BlogBits";
import { COUNTRIES } from "../../country";
import { andList } from "../../format";
import { headline } from "../../price";
import { STAR_TREK, commanderDeckNames, daysUntil, factsCheckedOn, longDateOf, type PreorderFact } from "../../preorders";
import type { Post } from "../types";
import { plural } from "../util";
import { starTrekRelease } from "./star-trek-where-to-buy";

// The Star Trek card list so far (RiftCompare's "riftbound-radiance-spoilers", built from MTG Compare's data): a gallery of
// every listed single of the release's sets in the published catalogue, with each card's own image (TCGplayer's scan, else
// Scryfall's, hotlinked unmodified) and a price only where one exists. It updates itself with every daily import: a card
// appears once TCGplayer lists it. What is confirmed comes from lib/preorders.ts, dated and sourced; anything only fan trackers
// report is attributed (since 16 October 2026 Wizards' Collecting Star Trek article confirms the mechanics and the prerelease and
// Arena dates, so they moved to the confirmed list). No oracle text is quoted or invented here: each card's page carries Scryfall's,
// and the mechanics post explains the mechanics.
const today = () => new Date().toISOString().slice(0, 10);

export const starTrekSpoilers: Post = {
  slug: "magic-star-trek-spoilers",
  title: () => "MTG Star Trek Spoilers: The Card List So Far",
  description:
    "The Magic: The Gathering Star Trek cards already in our price data, with their images and any price they have, plus what Wizards of the Coast has confirmed about the set, with dates and sources.",
  tags: ["star trek", "spoilers", "new set", "card list"],
  category: "blog",
  faq: [
    { q: "How many Magic: The Gathering Star Trek cards have been revealed?", a: "More than are in this list: fan trackers that follow the spoilers count every reveal, while this list holds the cards TCGplayer has already listed as products, which is when a card can be priced. The count at the top of the gallery is today's, and it grows with every daily import." },
    { q: "When does Magic: The Gathering Star Trek release?", a: "On 13 November 2026, according to Wizards of the Coast's Star Trek product page, read on 14 October 2026. Wizards' Collecting Star Trek article lists prerelease events from 6 to 12 November 2026 and the MTG Arena release on 10 November 2026; the [Star Trek release date guide](/blog/magic-star-trek-release-date-products) has every date and product." },
    { q: "Why do most Star Trek cards have no price yet?", a: "Because the set is not out. Before release few stores list singles, and the ones that do are taking pre-orders at prices of their own choosing; TCGplayer's market price only forms once copies sell. A price in this list is a real listing we track, never an estimate." },
    { q: "What are the new mechanics in Star Trek?", a: "Wizards of the Coast's Collecting Star Trek article names three new mechanics, Assimilate, Face a Dilemma and Federation, and the return of Spacecraft and station from Edge of Eternities. Each card's page carries its text once Scryfall has it, and [Star Trek's mechanics explained](/blog/magic-star-trek-mechanics-explained) goes through each one." },
    { q: "What are the Star Trek Commander decks?", a: "Wizards of the Coast lists four Commander decks, Federation Fleet, Landing Party, Klingon Fury and We Are the Borg, and a Collector's Edition of each in Surge Foil. TCGplayer files them under Commander: Star Trek (TRC); the [Star Trek Commander decks guide](/blog/magic-star-trek-commander-decks) covers each one, and every store's pre-order price is on the Star Trek pre-order page." },
  ],
  date: "2026-10-14",
  minutes: 5,
  related: [
    { href: STAR_TREK.path, label: "Star Trek pre-orders" },
    { href: "/release-dates", label: "Release dates" },
    { href: "/sets", label: "Every set" },
  ],
  build: (ctx) => {
    const rv = starTrekRelease(ctx);
    const date = rv?.releasedOn ?? STAR_TREK.announced;
    const out = rv?.out ?? false;
    const days = daysUntil(date, today());
    const c = COUNTRIES[ctx.country];
    const groups = rv?.cards ?? [];
    const main = groups[0] ?? null;
    const all = groups.flatMap((g) => g.items);
    const total = groups.reduce((t, g) => t + g.total, 0);
    const pricedHere = all.filter((x) => headline(x, ctx.country).kind === "listing").length;
    const decks = commanderDeckNames(rv?.sealed ?? []);
    const official = STAR_TREK.facts.filter((f) => f.kind === "official"), reported = STAR_TREK.facts.filter((f) => f.kind === "reported");
    const hero = [...all].filter((x) => x.hasImage).sort((a, b) => (b.marketUsd ?? -1) - (a.marketUsd ?? -1)).slice(0, 3);
    const source = (f: PreorderFact) => (
      <>
        {" "}
        (
        <a href={f.source.url} target="_blank" rel="noopener noreferrer">
          {f.source.label}
        </a>
        , read {longDateOf(f.checked)})
      </>
    );
    return {
      heroCards: hero,
      summary: [
        total ? (
          <>
            <strong>{plural(total, "Star Trek card")} {total === 1 ? "is" : "are"} in our data so far</strong>
            {main && main.total !== total ? ` (${main.total} in ${main.set.name})` : ""}; {pricedHere ? `${plural(pricedHere, "has", "have")} a live price in ${c.place}` : `none has a live price in ${c.place} yet`}.
          </>
        ) : (
          <>
            <strong>No Star Trek cards revealed in our data yet.</strong> The list below fills in on its own as TCGplayer lists them.
          </>
        ),
        <>
          Magic: The Gathering Star Trek {out ? "released" : "releases"} on {longDateOf(date)}
          {!out && days > 0 ? `, ${plural(days, "day")} from today` : ""}, according to Wizards of the Coast&apos;s product page.
        </>,
        <>Every card links to its own page, with every store&apos;s price as stores list it; nothing in this list is a rumour or an estimate.</>,
        out ? null : (
          <>
            Buying sealed? The <Link href={STAR_TREK.path}>Star Trek pre-order page</Link> compares every store&apos;s pre-order price.
          </>
        ),
      ].filter(Boolean),
      lede: (
        <p>
          <strong>Which Magic: The Gathering Star Trek cards have been revealed?</strong> This page lists every Star Trek card already in MTG Compare&apos;s price data,
          straight from the catalogue, so it updates itself once a day without anyone editing it. A card appears here as soon as TCGplayer lists it; fan trackers that
          follow every reveal will often be a few cards ahead. Above the gallery is what Wizards of the Coast has confirmed about the set, dated
          {reported.length ? ", and what has only been reported" : ""}.
        </p>
      ),
      sections: [
        {
          id: "confirmed",
          title: `What is confirmed, as of ${longDateOf(factsCheckedOn(STAR_TREK))}`,
          body: (
            <>
              <ul>
                {official.map((f) => (
                  <li key={f.text}>
                    {f.text}
                    {source(f)}
                  </li>
                ))}
                {decks.length ? <li>TCGplayer lists the Commander decks as {andList(decks)} (our catalogue, today).</li> : null}
              </ul>
              {reported.length ? (
                <>
                  <p>Reported by fan trackers, not stated by Wizards:</p>
                  <ul>
                    {reported.map((f) => (
                      <li key={f.text}>
                        {f.text}
                        {source(f)}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p>
                What each product holds, with Wizards&apos; US MSRPs, is in <Link href="/blog/magic-star-trek-release-date-products">the release date and products guide</Link>;
                the new mechanics are explained in <Link href="/blog/magic-star-trek-mechanics-explained">Star Trek&apos;s mechanics explained</Link>, and the four decks in{" "}
                <Link href="/blog/magic-star-trek-commander-decks">the Commander decks guide</Link>.
              </p>
            </>
          ),
        },
        ...groups.map((g, i) => ({
          id: i === 0 ? "cards" : `cards-${g.set.tok}`,
          title: g.total ? `${g.set.name} (${g.set.code}): ${plural(g.total, "card")} so far` : `${g.set.name} (${g.set.code})`,
          body: g.total ? (
            <>
              <p>
                In collector number order{g.total > g.items.length ? `, the first ${g.items.length} of ${g.total}` : ""}. Prices are for {c.place}, in {c.currency}:
                most revealed cards have no store price yet, and a price that does show is a store&apos;s pre-release ask or TCGplayer&apos;s listing, not a settled
                market. <Link href={`/sets/${g.set.slug}`}>The {g.set.code} set page</Link> has the same cards with filters and the set&apos;s sealed products.
              </p>
              <CardGallery cards={g.items} country={ctx.country} />
            </>
          ) : (
            <p>
              {i === 0 ? "No Star Trek cards revealed in our data yet." : `No ${g.set.name} singles are in our data yet.`}{" "}
              {decks.length && i > 0 ? `TCGplayer lists its decks as sealed products for now: ${andList(decks)}.` : ""} This section fills in on its own once TCGplayer
              lists the cards. <Link href={`/sets/${g.set.slug}`}>The {g.set.code} set page</Link> updates the same way.
            </p>
          ),
        })),
        ...(groups.length
          ? []
          : [
              {
                id: "cards",
                title: "The Star Trek cards so far",
                body: <p>No Star Trek cards revealed in our data yet. This list fills in on its own as soon as TCGplayer lists the set.</p>,
              },
            ]),
        {
          id: "how",
          title: "How this list updates",
          body: (
            <>
              <p>
                MTG Compare&apos;s catalogue is TCGplayer&apos;s list of Magic products, read once a day; Scryfall says what each card is. A revealed card joins this list
                when TCGplayer lists it as a product, with its own image (TCGplayer&apos;s scan, or Scryfall&apos;s). Leaks and unconfirmed images are never added, and no
                price is ever estimated: a card shows a price only when a store we track or TCGplayer lists it.
              </p>
              <Callout title="Pre-order or wait?">
                Singles are at their most volatile around the prerelease and the first days after release, and usually settle a few weeks later. Sealed product is the
                same at every store, so compare before you pre-order: <Link href="/blog/where-to-buy-magic-star-trek">where to buy Star Trek, market by market</Link>.
              </Callout>
              {STAR_TREK.trademark ? <p className="text-xs text-slate-500">{STAR_TREK.trademark}</p> : null}
            </>
          ),
        },
      ],
    };
  },
};
