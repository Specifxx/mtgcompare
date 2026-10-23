// Guide: MTG booster box prices in a region. The cheapest open Play Booster boxes today, the cheapest box of each recent set (newest
// first), the older Draft and Set Booster lines, and the spread of prices (more-data.ts cheapestBySet, priceSpread). Pack counts are
// lib/packs.ts's alone (CardTable): a box that does not state its count gets no per-pack price.
import Link from "@/components/Link";
import type { RegionInfo } from "@/lib/regions";
import { money, plural } from "@/lib/format";
import { formatRelease } from "@/lib/release";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { GuideBody, guideHref, Lede, LiveBlock, NextLinks, NoneYet, productHref, Prose, StackTable, storesPhrase, typeHref, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { CardTable, faqSection, SetLink } from "./kit-more";
import { cheapestBySet, priceSpread } from "./more-data";
import { whereText } from "../families";

const GUIDE = GUIDE_BY_SLUG.get("mtg-booster-box-prices")!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const play = data.byType?.["Play Booster Box"] ?? [];
  const draft = data.byType?.["Draft Booster Box"] ?? [];
  const setBox = data.byType?.["Set Booster Box"] ?? [];
  const n = data.openByType?.["Play Booster Box"] ?? play.length;
  const older = (data.openByType?.["Draft Booster Box"] ?? draft.length) + (data.openByType?.["Set Booster Box"] ?? setBox.length);
  const low = play[0] ?? null;
  const spread = priceSpread(play);
  const bySet = cheapestBySet(play, 12);
  const m = (c: number) => money(c, r.market);
  const playHref = typeHref(r, "play-booster-box");
  return {
    intro: (
      <Lede>
        {low && spread ? (
          <>
            {storesPhrase(r)} have <strong>{plural(n, "Magic Play Booster box", "Magic Play Booster boxes")}</strong> in stock or on pre-order today. The cheapest is{" "}
            <Link href={productHref(r, low)} prefetch={false} className="font-semibold text-brand underline-offset-2 hover:underline">
              {low.name}
            </Link>{" "}
            at <strong>{m(low.lowestPriceCents!)}</strong>, and the middle of the {spread.n} we read is {m(spread.median)}. Prices are in {r.currency}, before shipping.
          </>
        ) : (
          <>A Magic booster box is a sealed display of booster packs from one set. No Play Booster box is in stock at {storesPhrase(r)} right now; the tables below fill in as soon as one is.</>
        )}
      </Lede>
    ),
    sections: [
      {
        id: "cheapest",
        title: `The cheapest booster boxes in ${r.inName} today`,
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              <CardTable r={r} caption={`The cheapest Magic Play Booster boxes in ${r.inName} today`} products={play.slice(0, 8)} />
            </LiveBlock>
            {playHref && <NextLinks links={[{ href: playHref, label: `Every Play Booster box in ${r.inName}, cheapest first`, icon: "arrow-right" }]} />}
          </>
        ),
      },
      {
        id: "by-set",
        title: "The cheapest box of each recent set",
        body: (
          <>
            <Prose>
              <p>
                Newest set first. Each row is the cheapest Play Booster box of that set open at {storesPhrase(r)} today, so you can see how much a box of the set you want costs
                against the sets either side of it. A new set’s box is usually among the dearest for its first weeks, and an older set’s box can cost less or more depending on
                how many stores still hold it.
              </p>
            </Prose>
            <LiveBlock r={r} checked={data.checked}>
              {bySet.length ? (
                <StackTable
                  caption={`The cheapest Play Booster box of each set in ${r.inName} today`}
                  head={["Set", "Released", "Cheapest box", "Open at"]}
                  rows={bySet.map((x) => ({
                    key: x.code,
                    th: <SetLink r={r} slug={x.slug}>{x.name}</SetLink>,
                    cells: [
                      <span key="d">{formatRelease(x.releaseDate)}</span>,
                      <Link key="p" href={productHref(r, x.p)} prefetch={false} className="font-semibold text-brand underline-offset-2 hover:underline">
                        {m(x.p.lowestPriceCents!)} <span className="sr-only">for the {x.name} Play Booster box</span>
                      </Link>,
                      <span key="w" className="text-muted">{whereText(x.p)}</span>,
                    ],
                  }))}
                />
              ) : (
                <NoneYet />
              )}
            </LiveBlock>
          </>
        ),
      },
      {
        id: "spread",
        title: "How far apart booster box prices are",
        body: (
          <Prose>
            {spread ? (
              <p>
                Across the {plural(spread.n, "Play Booster box", "Play Booster boxes")} we read in {r.inName} today, the cheapest open price is {m(spread.low)}, the middle one {m(spread.median)} and the
                dearest {m(spread.high)}. The gap is mostly the set: a box of a popular Universes Beyond set or of a set that has left most shelves sits at the top, while the
                newest main set is often in stock at many stores at once, which keeps its cheapest price close to the next store’s.
              </p>
            ) : (
              <p>There are no open Play Booster boxes in {r.inName} to compare right now.</p>
            )}
            <p>
              The same box can also differ between stores by more than you would expect on the same day. Compare the box you want across every store on its own page before you
              buy, and add each store’s delivery: the prices here are before shipping.
            </p>
          </Prose>
        ),
      },
      {
        id: "older-boxes",
        title: "Draft and Set Booster boxes",
        body: (
          <>
            <Prose>
              <p>
                Play Boosters replaced Draft and Set Boosters from <em>Murders at Karlov Manor</em> (February 2024). Older sets still sell as Draft Booster boxes (36 packs) and
                Set Booster boxes (30 packs); {storesPhrase(r)} have {older.toLocaleString("en")} of them open today.
              </p>
            </Prose>
            <LiveBlock r={r} checked={data.checked}>
              <CardTable r={r} caption={`The cheapest Draft and Set Booster boxes in ${r.inName} today`} products={[...draft.slice(0, 4), ...setBox.slice(0, 4)].sort((a, b) => (a.lowestPriceCents ?? 0) - (b.lowestPriceCents ?? 0))} empty="No Draft or Set Booster box is in stock at the stores we compare right now." />
            </LiveBlock>
          </>
        ),
      },
      faqSection([
        {
          q: `How much is a Magic booster box in ${r.inName}?`,
          a: low && spread ? `From ${m(low.lowestPriceCents!)} today (${low.name}) at the stores MTG Compare checks; the middle of ${spread.n} open Play Booster boxes is ${m(spread.median)}.` : "No Play Booster box is in stock at the stores we compare right now.",
        },
        { q: "How many packs are in a Play Booster box?", a: "36 in the first Play Booster sets and 30 in later ones: the product's own name says which, and MTG Compare gives a per-pack price only when it does." },
        { q: "Are the prices with shipping?", a: `No. Each price is the store's own listed price in ${r.currency}, before shipping. Add delivery before you compare two stores.` },
      ]),
      whereToBuy(r, {
        tcg: { query: "Magic Play Booster Box", label: "Play Booster boxes" },
        links: [
          { href: guideHref(r, "cheapest-way-to-buy-magic-packs"), label: "Cheapest way to buy packs" },
          { href: guideHref(r, "collector-booster-box-prices"), label: "Collector Booster box prices" },
        ],
      }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
