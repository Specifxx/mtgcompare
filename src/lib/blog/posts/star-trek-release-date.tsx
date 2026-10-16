import Link from "next/link";
import { Callout, SimpleTable } from "@/components/blog/BlogBits";
import { UnitTable } from "@/components/blog/UnitTable";
import { COUNTRIES } from "../../country";
import { money } from "../../format";
import { STAR_TREK, attributed, dateRangeOf, daysUntil, eventFacts, lineMsrp, longDateOf } from "../../preorders";
import { CONTENTS, SEASON, STAR_TREK_CHECKED, TREATMENTS, WPN_STAR_TREK, starTrekView } from "../star-trek";
import type { Post } from "../types";
import { plural } from "../util";

// Magic: The Gathering | Star Trek: the dates, what each product holds and its US MSRP, in Wizards' words (lib/blog/star-trek.ts,
// lib/preorders.ts: every figure sourced and dated), beside the live prices of the release's products in the visitor's market and
// the main set's shock lands as the catalogue holds them today. No price is typed: the MSRPs are Wizards' published ones, labelled
// as such; every other figure comes from the published data and the sentence that needs it prints only when it exists.
const LIVE_ROWS = 14;
const SHOCK_ROWS = 20;
const today = () => new Date().toISOString().slice(0, 10);

export const starTrekReleaseDate: Post = {
  slug: "magic-star-trek-release-date-products",
  title: () => "MTG Star Trek Release Date, Prerelease & Every Product",
  description:
    "Magic: The Gathering Star Trek launches 13 November 2026. The prerelease and MTG Arena dates, what is in Play and Collector Boosters, the Beam Me Up Bundle and the Scene Boxes, with Wizards' US MSRPs and live prices.",
  tags: ["star trek", "release dates", "sealed", "new set"],
  category: "blog",
  date: "2026-10-16",
  minutes: 7,
  faq: [
    {
      q: "When does MTG Star Trek release?",
      a: "On 13 November 2026 for tabletop Magic, according to Wizards of the Coast's Star Trek product page and its Collecting Star Trek article. The same article lists prerelease events from 6 to 12 November 2026 and the MTG Arena release on 10 November 2026.",
    },
    {
      q: "Is Star Trek legal in Standard?",
      a: "Yes. Wizards' Collecting Star Trek article says the main set, TRK, is legal in all formats. The Commander deck cards (TRC) and the stardates cards (SDS) are legal in Commander, Legacy and Vintage, and a reprint stays legal wherever its earlier printings already were.",
    },
    {
      q: "What is in a Star Trek Collector Booster?",
      a: "Fifteen cards, per Wizards: five traditional foil commons, three traditional foil uncommons, a foil common or uncommon, a traditional foil basic land, a traditional foil rare or mythic rare, a non-foil extended-art rare or mythic rare, two Booster Fun rares or mythic rares, a foil Booster Fun rare or mythic rare, and an art card or a traditional foil double-sided token. The signed Headliner cards are found only in Collector Boosters.",
    },
    {
      q: "What is the Beam Me Up Bundle?",
      a: "A bundle with 8 Play Boosters and 1 Collector Booster, 30 basic lands, 2 of the 8 traditional foil Beam Me Up Bundle promo cards (Star Trek ships drawn as schematics), 2 reference cards, a spindown life counter and a storage box. Wizards' US MSRP for it is US$99.99, in its Collecting Star Trek article of 14 July 2026.",
    },
    {
      q: "Is there a Star Trek Beginner Box?",
      a: "No. One was announced, but an editor's note on Wizards of the Coast's Collecting Star Trek article says its details were removed because the product was cancelled.",
    },
    {
      q: "Can I buy Star Trek before release day?",
      a: "At a game store, possibly: Wizards Play Network's page for the set says WPN stores can begin selling the set's products during prerelease week, 6 to 12 November 2026. Pre-orders from other stores ship from release day; the [Star Trek pre-order page](/star-trek-preorders) compares them.",
    },
  ],
  related: [
    { href: STAR_TREK.path, label: "Star Trek pre-orders" },
    { href: "/release-dates", label: "Release dates" },
    { href: "/sealed", label: "Sealed prices" },
  ],
  build: (ctx) => {
    const rv = starTrekView(ctx);
    const date = rv?.releasedOn ?? STAR_TREK.announced;
    const out = rv?.out ?? false;
    const days = daysUntil(date, today());
    const here = COUNTRIES[ctx.country];
    const word = out ? "price" : "pre-order";
    const main = rv?.sets.find((s) => s.tok === STAR_TREK.toks[0]) ?? null;
    const products = rv?.sealed ?? [];
    const live = products.filter((p) => p.low[ctx.country] != null);
    const groups = rv?.cards ?? [];
    const total = groups.reduce((t, g) => t + g.total, 0);
    const shocks = ctx.starTrek?.shocks ?? [];
    const msrp = STAR_TREK.msrp;
    const pack = lineMsrp(STAR_TREK, "Play Booster"), dearest = msrp?.rows.reduce((a, b) => (b.usdCents > a.usdCents ? b : a));
    const pre = STAR_TREK.prerelease;
    const events = attributed(eventFacts(STAR_TREK));
    const hero = [...new Map([...groups.flatMap((g) => g.items), ...shocks].map((c) => [c.id, c] as const)).values()]
      .filter((c) => c.hasImage)
      .sort((a, b) => (b.marketUsd ?? -1) - (a.marketUsd ?? -1))
      .slice(0, 3);
    const setLink = main ? <Link href={`/sets/${main.slug}`}>{main.name} ({main.code}) set page</Link> : null;
    const wizards = (
      <a href={STAR_TREK.msrp?.source.url ?? STAR_TREK.productSource.url} target="_blank" rel="noopener noreferrer">
        Collecting Star Trek
      </a>
    );

    return {
      heroCards: hero,
      summary: [
        <>
          <strong>
            Magic: The Gathering Star Trek {out ? "released" : "releases"} on {longDateOf(date)}
          </strong>
          {!out && days > 0 ? `, ${plural(days, "day")} from today` : ""}. {pre ? `Prerelease events ${out ? "ran" : "run"} from ${dateRangeOf(pre.from, pre.to)}` : `Prerelease events ${out ? "ran" : "run"} the week before`}, and
          the MTG Arena release {out ? "was" : "is"} {longDateOf(SEASON.arena)}, according to Wizards of the Coast.
        </>,
        <>
          Wizards lists {CONTENTS.length} kinds of product, from single Play Boosters to Collector&apos;s Edition Commander decks
          {pack && dearest ? `; its US MSRPs run from ${money(pack.usdCents, "US")} for a Play Booster to ${money(dearest.usdCents, "US")} for a ${dearest.line}` : ""}.
        </>,
        <>
          The main set is TRK and is legal in every format, Standard included; the Commander decks are TRC and the stardates reprints SDS. The Beginner Box was cancelled.
        </>,
        products.length ? (
          <>
            We track {plural(products.length, "Star Trek product")}; {live.length ? `${plural(live.length, "has", "have")} a live ${word} in ${here.place} today` : `none has a live ${word} in ${here.place} yet`}.
          </>
        ) : (
          <>No Star Trek product is in our catalogue yet: the prices below fill in once TCGplayer lists them and stores open {out ? "stock" : "pre-orders"}.</>
        ),
      ],
      lede: (
        <p>
          <strong>When does Magic: The Gathering Star Trek come out, and what is in each product?</strong> The set is Magic&apos;s Universes Beyond visit to Star Trek,
          timed for the franchise&apos;s 60th anniversary. Below are the dates, the products and what each one holds, taken from Wizards of the Coast&apos;s own
          announcement, with its US MSRPs, and beside them the prices stores are asking in {here.place} today, from our daily import. For the cards themselves, see{" "}
          <Link href="/blog/magic-star-trek-spoilers">the Star Trek card list so far</Link>.
        </p>
      ),
      sections: [
        {
          id: "dates",
          title: out ? `Star Trek released on ${longDateOf(date)}` : "Star Trek release date and key dates",
          body: (
            <>
              <SimpleTable
                head={["Event", "Date"]}
                rows={[
                  ["First look at the set", longDateOf(SEASON.firstLook)],
                  ...(out ? [] : [["Full preview season", `Not announced by Wizards as of ${longDateOf(STAR_TREK_CHECKED)}`]]),
                  ...(pre ? [["Prerelease events, in stores", dateRangeOf(pre.from, pre.to)]] : []),
                  ["MTG Arena release", longDateOf(SEASON.arena)],
                  [<strong key="d">Tabletop release</strong>, <strong key="v">{longDateOf(date)}</strong>],
                  ["Magic Presents: To Boldly Go, a season-long Sealed league in stores", `${longDateOf(SEASON.league.from)} to ${longDateOf(SEASON.league.to)}`],
                ]}
              />
              <p>
                {events} The tabletop date is the one on Wizards&apos; <a href={STAR_TREK.productSource.url} target="_blank" rel="noopener noreferrer">Star Trek product page</a>
                {main?.releasedOn && main.releasedOn !== STAR_TREK.announced ? `, and TCGplayer now lists the set for ${longDateOf(main.releasedOn)}` : ""}. The league dates are on{" "}
                <a href={WPN_STAR_TREK.url} target="_blank" rel="noopener noreferrer">
                  {WPN_STAR_TREK.label}
                </a>
                , which also says that Wizards Play Network stores can begin selling the set&apos;s products during prerelease week.
              </p>
              <p>
                {total
                  ? `${plural(total, "Star Trek card")} ${total === 1 ? "is" : "are"} in our data so far; `
                  : "No Star Trek card is in our data yet; "}
                <Link href="/blog/magic-star-trek-spoilers">the Star Trek spoilers list</Link> adds each one as TCGplayer lists it, and the{" "}
                <Link href="/release-dates">release calendar</Link> has every upcoming set.
              </p>
            </>
          ),
        },
        {
          id: "set-codes",
          title: "Set codes and format legality",
          body: (
            <>
              <ul>
                <li>
                  <strong>TRK</strong>, Magic: The Gathering | Star Trek: the main set. Legal in all formats, Standard included.
                </li>
                <li>
                  <strong>TRC</strong>, the Star Trek Commander set: the cards of the four Commander decks. Legal in Commander, Legacy and Vintage.
                </li>
                <li>
                  <strong>SDS</strong>, the stardates cards: famous reprints with Star Trek art, found in Play and Collector Boosters. Legal in Commander, Legacy and Vintage.
                </li>
              </ul>
              <p>
                A reprint stays legal wherever its earlier printings already were, and the TRK and SDS cards opened from Play Boosters are playable in Star Trek Draft and
                Sealed. That is all from Wizards&apos; {wizards} article.{" "}
                {rv?.sets.length ? (
                  <>
                    Our set pages:{" "}
                    {rv.sets.map((s, i) => (
                      <span key={s.id}>
                        {i ? " and " : ""}
                        <Link href={`/sets/${s.slug}`}>
                          {s.name} ({s.code})
                        </Link>
                      </span>
                    ))}
                    .
                  </>
                ) : null}
              </p>
            </>
          ),
        },
        {
          id: "products",
          title: msrp ? "Every Star Trek product, with Wizards' US MSRP" : "Every Star Trek product",
          body: (
            <>
              <SimpleTable
                head={msrp ? ["Product", "US MSRP", "What is inside"] : ["Product", "What is inside"]}
                align={msrp ? ["l", "r", "l"] : ["l", "l"]}
                rows={CONTENTS.map((p) => {
                  const m = p.line ? lineMsrp(STAR_TREK, p.line) : null;
                  const cells = [<strong key="n">{p.name}</strong>, p.holds];
                  return msrp ? [cells[0], m ? `${money(m.usdCents, "US")} a ${m.each}` : "None published", cells[1]] : cells;
                })}
              />
              {msrp ? (
                <p>
                  The MSRPs are Wizards&apos; suggested US prices from its {wizards} article of {longDateOf(msrp.source.published)} (read {longDateOf(msrp.checked)}). Wizards
                  gives no MSRP for a sealed box or case of boosters, and an MSRP is not what stores charge: pre-order prices are set by each store, in each market&apos;s own
                  currency.
                </p>
              ) : null}
              <p>
                The four Commander decks are Federation Fleet, Landing Party, Klingon Fury and We Are the Borg; what is known about each is in{" "}
                <Link href="/blog/magic-star-trek-commander-decks">the Star Trek Commander decks guide</Link>.
              </p>
            </>
          ),
        },
        {
          id: "booster-fun",
          title: "Signed cards, stardates, LCARS and the other special cards",
          body: (
            <>
              <p>Wizards lists five kinds of special card in Star Trek boosters:</p>
              <ul>
                {TREATMENTS.map((t) => (
                  <li key={t.name}>
                    <strong>{t.name}:</strong> {t.what}
                  </li>
                ))}
              </ul>
              <p>
                With roughly 250 copies of each signed card, opening Collector Boosters to find one is a lottery, not a plan. Of the reprints, Wizards singles out the shock
                lands: all ten are in the main set, and Scryfall lists each in the regular frame and in the LCARS frame.
              </p>
              {shocks.length ? (
                <>
                  <p>
                    {plural(shocks.length, "shock land printing")} from {main ? main.code : "the main set"} {shocks.length === 1 ? "is" : "are"} in our data so far, in collector
                    number order. The TCGplayer market price is in US dollars; the last column is the cheapest listing we track in {here.place}, and a dash means no store
                    lists it there yet.
                  </p>
                  <UnitTable cards={shocks.slice(0, SHOCK_ROWS)} country={ctx.country} />
                  {shocks.length > SHOCK_ROWS ? (
                    <p>
                      And {plural(shocks.length - SHOCK_ROWS, "more printing")}: every one is on {setLink ?? "the set page"}.
                    </p>
                  ) : null}
                </>
              ) : (
                <p>
                  {ctx.starTrek ? "None of the Star Trek shock lands is in our data yet" : "The shock land prices could not be read just now"}; they appear on{" "}
                  {setLink ?? "the Star Trek set page"} as TCGplayer lists them.
                </p>
              )}
            </>
          ),
        },
        {
          id: "prices",
          title: out ? `Star Trek prices in ${here.place} today` : `Star Trek pre-order prices in ${here.place} today`,
          body: live.length ? (
            <>
              <p>
                {plural(live.length, "Star Trek product")} with a live {word} in {here.place} today, in {here.currency}, cheapest listing first
                {ctx.country === "US" ? "; the cheapest may be TCGplayer's lowest listing, which is not counted as a store" : ""}. Postage is not included.
              </p>
              <SimpleTable
                head={["Product", `Cheapest (${here.currency})`, "Stores"]}
                align={["l", "r", "r"]}
                rows={[...live]
                  .sort((a, b) => a.low[ctx.country]! - b.low[ctx.country]!)
                  .slice(0, LIVE_ROWS)
                  .map((p) => [
                    <Link key="p" href={`/sealed/${p.slug}`}>
                      {p.name}
                    </Link>,
                    money(p.low[ctx.country], ctx.country),
                    p.stores[ctx.country] ? String(p.stores[ctx.country]) : "TCGplayer only",
                  ])}
              />
              <p>
                {live.length > LIVE_ROWS ? `And ${plural(live.length - LIVE_ROWS, "more product")}. ` : ""}Every market, product by product, is in{" "}
                <Link href="/blog/where-to-buy-magic-star-trek">where to buy Star Trek</Link>, and every store&apos;s {word} is on the{" "}
                <Link href={STAR_TREK.path}>Star Trek pre-order page</Link>.
              </p>
            </>
          ) : (
            <p>
              No store we track in {here.place} lists a Star Trek {word} yet. This table fills in once a day as stores open {out ? "stock" : "pre-orders"}; meanwhile{" "}
              <Link href="/blog/where-to-buy-magic-star-trek">where to buy Star Trek</Link> shows every market we track, and the{" "}
              <Link href={STAR_TREK.path}>pre-order page</Link> every store.
            </p>
          ),
        },
        {
          id: "which-to-buy",
          title: "Which Star Trek product should you buy?",
          body: (
            <>
              <ul>
                <li>
                  <strong>To play Commander straight away:</strong> one of the four <Link href="/blog/magic-star-trek-commander-decks">Commander decks</Link>.
                </li>
                <li>
                  <strong>To chase signed cards or surge foils:</strong> Collector Boosters are the only source, and with about 250 copies of each signed card, treat them as a
                  lottery.
                </li>
                <li>
                  <strong>To try a Collector Booster without buying a box:</strong> the Beam Me Up Bundle includes one, with eight Play Boosters and two of its eight
                  schematic promo cards.
                </li>
                <li>
                  <strong>To play with the set at a table of friends:</strong> Draft Night, a four-player Pick-Two Draft in one box.
                </li>
                <li>
                  <strong>For particular cards, such as a shock land:</strong> buying the single is usually cheaper than opening packs for it, and singles usually settle a
                  few weeks after release. <Link href="/blog/magic-set-value-concentration">How concentrated a set&apos;s value is</Link> explains why.
                </li>
                <li>
                  <strong>As a display piece:</strong> a Scene Box, whose six foil cards make one picture on the included easel.
                </li>
              </ul>
              <p>
                To compare against boxes of sets already out, see <Link href="/blog/magic-booster-box-prices">Magic booster box prices</Link> and{" "}
                <Link href="/blog/cheapest-magic-booster-boxes">the cheapest booster boxes</Link>. We do not forecast prices, and nothing here says a price is about to rise.
              </p>
              <Callout title="Mechanics">
                Star Trek brings three new mechanics, assimilate, face a dilemma and federation, and the return of Spacecraft and station from Edge of Eternities:{" "}
                <Link href="/blog/magic-star-trek-mechanics-explained">Star Trek&apos;s mechanics explained</Link>.
              </Callout>
              {STAR_TREK.trademark ? <p className="text-xs text-slate-500">{STAR_TREK.trademark}</p> : null}
            </>
          ),
        },
      ],
    };
  },
};
