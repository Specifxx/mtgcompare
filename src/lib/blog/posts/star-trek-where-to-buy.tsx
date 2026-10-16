import Link from "next/link";
import { Callout, SimpleTable } from "@/components/blog/BlogBits";
import { COUNTRY_LIST } from "../../country";
import { andList, money } from "../../format";
import { STAR_TREK, attributed, commanderDeckNames, daysUntil, eventFacts, lineMsrp, longDateOf } from "../../preorders";
import type { Post, PostContext, ReleaseView } from "../types";
import { plural } from "../util";

// Where to buy Magic: The Gathering | Star Trek (RiftCompare's "where-to-buy-riftbound-radiance", built from MTG Compare's
// data): every market's cheapest live price for each Star Trek product the catalogue holds, and how many stores list it,
// from the sealed list (SealedLite.low / stores: the cheapest in-stock offer per market, TCGplayer's lowest listing
// counting in the US). Dated facts come from lib/preorders.ts; no price is typed. Wizards' US MSRPs (lib/preorders.ts, sourced
// and dated) are named once and listed in the release-date post: the tables here are what stores ask. From release day the
// same tables are live prices and the copy says so.
const ROWS_PER_MARKET = 12;
const STAR_TREK_PATH = STAR_TREK.path;

export const starTrekRelease = (ctx: Pick<PostContext, "releases">): ReleaseView | null => ctx.releases.find((r) => r.release.key === STAR_TREK.key) ?? null;
const today = () => new Date().toISOString().slice(0, 10);

export const whereToBuyStarTrek: Post = {
  slug: "where-to-buy-magic-star-trek",
  title: () => "Where to Buy MTG Star Trek: Pre-Order Prices by Market",
  description:
    "Where to pre-order Magic: The Gathering Star Trek in the US, Australia, the UK, Singapore, Canada and the EU: each market's cheapest price for every product we track, how many stores list it, and whether to pre-order or wait.",
  tags: ["star trek", "pre-orders", "sealed", "buying"],
  category: "blog",
  faq: [
    { q: "Where can I pre-order Magic: The Gathering Star Trek?", a: "From game stores that sell Magic and from online retailers in every market we track. This post lists, market by market, the cheapest price we track for each Star Trek product today and how many stores list it; the Star Trek pre-order page compares every store's price, product by product, in your currency." },
    { q: "When does Magic: The Gathering Star Trek come out?", a: "On 13 November 2026, according to Wizards of the Coast's Star Trek product page, read on 14 October 2026. Wizards' Collecting Star Trek article lists prerelease events from 6 to 12 November 2026 and the MTG Arena release on 10 November 2026; every date is in our [Star Trek release date guide](/blog/magic-star-trek-release-date-products)." },
    { q: "How much does a Star Trek Play Booster display cost?", a: "Wizards of the Coast sets a US MSRP of US$6.99 per Play Booster in its Collecting Star Trek article of 14 July 2026, but none for a display, so we quote none. Pre-order prices differ by market and by store: the tables in this post show today's cheapest in each market, and the pre-order page lists every store we track." },
    { q: "Should I pre-order Star Trek or wait for release?", a: "If you want to open product, pre-ordering at a good price is reasonable, because what runs out is a store's allocation. If you want particular cards, waiting is usually cheaper: singles are at their most volatile around the prerelease and release, and settle a few weeks later." },
    { q: "Can I buy Star Trek from a store in another country?", a: "Often, but a sealed box ships as a parcel: international postage and any import tax are not in the prices here and can remove a saving. Compare the delivered cost at the store's checkout before you order from abroad." },
  ],
  date: "2026-10-14",
  minutes: 6,
  related: [
    { href: STAR_TREK_PATH, label: "Star Trek pre-orders" },
    { href: "/release-dates", label: "Release dates" },
    { href: "/sealed", label: "Sealed prices" },
  ],
  build: (ctx) => {
    const rv = starTrekRelease(ctx);
    const products = rv?.sealed ?? [];
    const main = rv?.sets[0] ?? null;
    const date = rv?.releasedOn ?? STAR_TREK.announced;
    const out = rv?.out ?? false;
    const days = daysUntil(date, today());
    const word = out ? "price" : "pre-order";
    const here = COUNTRY_LIST.find((m) => m.code === ctx.country)!;
    const markets = COUNTRY_LIST.map((m) => ({ m, rows: products.filter((p) => p.low[m.code] != null).map((p) => ({ p, cents: p.low[m.code]!, stores: p.stores[m.code] })) }));
    const live = new Set(markets.flatMap((x) => x.rows.map((r) => r.p.id)));
    const display = products.find((p) => /play booster display/i.test(p.name) && p.kind !== "Case");
    const displayHere = display && display.low[ctx.country] != null ? { cents: display.low[ctx.country]!, stores: display.stores[ctx.country] } : null;
    const decks = commanderDeckNames(products);
    const deckProducts = products.filter((p) => p.kind === "Commander Deck").length;
    const events = attributed(eventFacts(STAR_TREK));
    const pack = lineMsrp(STAR_TREK, "Play Booster");
    const cards = (rv?.cards ?? []).flatMap((x) => x.items);
    const hero = [...cards].filter((c) => c.hasImage).sort((a, b) => (b.marketUsd ?? -1) - (a.marketUsd ?? -1)).slice(0, 3);
    const setLink = main ? (
      <Link href={`/sets/${main.slug}`}>
        {main.name} ({main.code}) card list
      </Link>
    ) : null;
    return {
      heroCards: hero,
      summary: [
        <>
          <strong>Magic: The Gathering Star Trek {out ? "released" : "releases"} on {longDateOf(date)}</strong>
          {!out && days > 0 ? `, ${plural(days, "day")} from today` : ""}.{" "}
          {pack ? (
            <>
              Wizards of the Coast&apos;s US MSRP is {money(pack.usdCents, "US")} for a Play Booster; every product&apos;s is in{" "}
              <Link href="/blog/magic-star-trek-release-date-products">our Star Trek release date and products guide</Link>. The prices below are what stores ask.
            </>
          ) : (
            "Wizards of the Coast has published no price for any of its products."
          )}
        </>,
        products.length ? (
          <>
            We track {plural(products.length, "Star Trek product")}
            {deckProducts ? (deckProducts === 1 ? ", one of them a Commander deck" : `, ${deckProducts} of them Commander decks`) : ""}; {live.size ? `${plural(live.size, "has", "have")} a live ${word} in at least one market today` : `none has a live ${word} at a store we track yet`}.
          </>
        ) : (
          <>No Star Trek product is in our catalogue yet; the tables fill in as TCGplayer lists them and stores open {out ? "stock" : "pre-orders"}.</>
        ),
        display ? (
          displayHere ? (
            <>
              In {here.place} the cheapest <Link href={`/sealed/${display.slug}`}>{display.name}</Link> we track is {money(displayHere.cents, ctx.country)}
              {displayHere.stores ? ` (${plural(displayHere.stores, "store")} list it)` : ""}.
            </>
          ) : (
            <>No store we track in {here.place} lists the {display.name} yet.</>
          )
        ) : null,
        <>
          The <Link href={STAR_TREK_PATH}>Star Trek pre-order page</Link> lists every store&apos;s price for every product, cheapest first, in your currency.
        </>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>Where can you buy Magic: The Gathering Star Trek, and what does it cost?</strong> Below is every market we track, with the cheapest {word} we can see for
          each Star Trek product today and how many stores list it. The figures are item prices from the stores we read once a day (in the United States TCGplayer&apos;s
          lowest listing counts too), in each market&apos;s own currency. Postage is not included.
        </p>
      ),
      sections: [
        {
          id: "products",
          title: `What comes out on ${longDateOf(date)}`,
          body: (
            <>
              <p>
                {STAR_TREK.productSource.label} (read {longDateOf(STAR_TREK.productSource.checked)}) lists {STAR_TREK.lines.length} product lines:{" "}
                {andList(STAR_TREK.lines.map((l) => l.name))}. {decks.length ? `TCGplayer lists the Commander decks as ${andList(decks)}.` : ""} What is in each, in
                Wizards&apos; words, is on the <Link href={STAR_TREK_PATH}>pre-order page</Link>
                {setLink ? <>, and the cards revealed so far are on the {setLink}</> : null}. Every product&apos;s contents and dates are in{" "}
                <Link href="/blog/magic-star-trek-release-date-products">the Star Trek release date and products guide</Link>, and the four decks in{" "}
                <Link href="/blog/magic-star-trek-commander-decks">the Star Trek Commander decks guide</Link>.
              </p>
              {STAR_TREK.msrp ? (
                <Callout title="List price and store price">
                  Wizards&apos; product page prints no price, but its Collecting Star Trek article of {longDateOf(STAR_TREK.msrp.source.published)} sets a US MSRP for each
                  product line, which our release date guide lists. An MSRP is a suggested price in US dollars, not what any store charges; every other figure in this post is what
                  a store or TCGplayer is asking today, in each market&apos;s currency, and stores change pre-order prices as their allocations firm up.
                </Callout>
              ) : (
                <Callout title="No list price yet">
                  Wizards&apos; product page prints no price for any Star Trek product, so we quote none. Every figure in this post is what a store or TCGplayer is asking
                  today, and stores change pre-order prices as their allocations firm up.
                </Callout>
              )}
            </>
          ),
        },
        ...markets.map(({ m, rows }) => ({
          id: `in-${m.code.toLowerCase()}`,
          title: `Buying Star Trek in ${m.place}`,
          body: rows.length ? (
            <>
              <p>
                {plural(rows.length, "Star Trek product")} with a live {word} in {m.place} today, in {m.currency}
                {m.code === "US" ? "; the cheapest may be TCGplayer's lowest listing, which is not counted as a store" : ""}.
              </p>
              <SimpleTable
                head={["Product", `Cheapest (${m.currency})`, "Stores"]}
                align={["l", "r", "r"]}
                rows={rows.slice(0, ROWS_PER_MARKET).map((r) => [
                  <Link key="p" href={`/sealed/${r.p.slug}`}>
                    {r.p.name}
                  </Link>,
                  money(r.cents, m.code),
                  r.stores ? String(r.stores) : "TCGplayer only",
                ])}
              />
              {rows.length > ROWS_PER_MARKET ? (
                <p>
                  And {plural(rows.length - ROWS_PER_MARKET, "more product")}: every one, store by store, is on the <Link href={STAR_TREK_PATH}>pre-order page</Link>.
                </p>
              ) : null}
            </>
          ) : (
            <p>
              No store we track in {m.place} lists a Star Trek {word} yet. The tables fill in once a day as stores open {out ? "stock" : "pre-orders"}; the{" "}
              <Link href={STAR_TREK_PATH}>pre-order page</Link> shows each product&apos;s stores as soon as one does.
            </p>
          ),
        })),
        {
          id: "pre-order-or-wait",
          title: out ? "Star Trek is out: what changes" : "Pre-order or wait?",
          body: out ? (
            <p>
              Star Trek released on {longDateOf(date)}, so the prices above are live prices, not pre-orders, and its singles are priced card by card
              {setLink ? <> on the {setLink}</> : null}. Sealed prices for every set are on <Link href="/sealed">the sealed page</Link>.
            </p>
          ) : (
            <>
              <p>
                {events ? <>{events} </> : null}
                Those are the days the first copies are opened and the first singles change hands; on release day stores ship their pre-orders.
              </p>
              <ul>
                <li>
                  <strong>Want to open product?</strong> Pre-ordering at a good price is reasonable: what runs out is a store&apos;s allocation, and it is the same box at every
                  store, so the spread in the tables above is the reason to compare.
                </li>
                <li>
                  <strong>Want particular cards?</strong> Waiting is usually cheaper. Singles are at their most volatile around the prerelease and release, and settle a few
                  weeks later once supply catches up. The <Link href="/blog/magic-star-trek-spoilers">Star Trek card list so far</Link> shows which cards are already priced.
                </li>
                <li>
                  <strong>Buying from another market?</strong> A sealed box ships as a parcel: international postage and any import tax are not in these prices.
                </li>
              </ul>
              <p>
                We do not forecast prices, and nothing here says a price is about to rise. Release dates for every set are on <Link href="/release-dates">the release
                calendar</Link>.
              </p>
              {STAR_TREK.trademark ? <p className="text-xs text-slate-500">{STAR_TREK.trademark}</p> : null}
            </>
          ),
        },
      ],
    };
  },
};
