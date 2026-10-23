// Guide: Collector Booster box prices in a region. The cheapest and dearest open Collector Booster boxes today, the cheapest box of
// each recent set (newest first) and its price per pack: every Collector Booster box holds 12 packs (families.ts, lib/packs.ts), the
// one count this guide states. No value claim: what a Collector Booster holds differs by set, and the page says to check the set.
import Link from "@/components/Link";
import type { RegionInfo } from "@/lib/regions";
import { money, plural } from "@/lib/format";
import { perPackCents } from "@/lib/packs";
import { formatRelease } from "@/lib/release";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { GuideBody, guideHref, Lede, LiveBlock, NextLinks, NoneYet, productHref, Prose, StackTable, storesPhrase, typeHref, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { CardTable, faqSection, packsOfCard, SetLink } from "./kit-more";
import { cheapestBySet, priceSpread } from "./more-data";

const GUIDE = GUIDE_BY_SLUG.get("collector-booster-box-prices")!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const boxes = data.byType?.["Collector Booster Box"] ?? [];
  const dear = data.byType?.dearest ?? [];
  const n = data.openByType?.["Collector Booster Box"] ?? boxes.length;
  const low = boxes[0] ?? null;
  const spread = priceSpread(boxes);
  const bySet = cheapestBySet(boxes, 12);
  const m = (c: number) => money(c, r.market);
  const pp = (p: (typeof boxes)[number]) => perPackCents(p.lowestPriceCents, packsOfCard(p));
  const lowPack = low ? pp(low) : null;
  const href = typeHref(r, "collector-booster-box");
  return {
    intro: (
      <Lede>
        {low && spread ? (
          <>
            {storesPhrase(r)} have <strong>{plural(n, "Collector Booster box", "Collector Booster boxes")}</strong> open today. The cheapest is{" "}
            <Link href={productHref(r, low)} prefetch={false} className="font-semibold text-brand underline-offset-2 hover:underline">
              {low.name}
            </Link>{" "}
            at <strong>{m(low.lowestPriceCents!)}</strong>
            {lowPack != null ? <> ({m(lowPack)} a pack)</> : null}, and the middle of the {spread.n} we read is {m(spread.median)}, in {r.currency} before shipping.
          </>
        ) : (
          <>A Collector Booster box holds 12 Collector Boosters, Magic’s premium packs. None is in stock at {storesPhrase(r)} right now; the tables below fill in as soon as one is.</>
        )}
      </Lede>
    ),
    sections: [
      {
        id: "cheapest",
        title: `The cheapest Collector Booster boxes in ${r.inName}`,
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              <CardTable r={r} caption={`The cheapest Collector Booster boxes in ${r.inName} today`} products={boxes.slice(0, 8)} />
            </LiveBlock>
            {href && <NextLinks links={[{ href, label: `Every Collector Booster box in ${r.inName}`, icon: "arrow-right" }]} />}
          </>
        ),
      },
      {
        id: "by-set",
        title: "Each recent set’s cheapest Collector Booster box",
        body: (
          <>
            <Prose>
              <p>
                Newest set first: the cheapest Collector Booster box of each set open at {storesPhrase(r)} today, with what a pack costs when you buy the box. What a
                Collector Booster holds differs from set to set, so read the set’s own page before you compare two of them on price alone.
              </p>
            </Prose>
            <LiveBlock r={r} checked={data.checked}>
              {bySet.length ? (
                <StackTable
                  caption={`The cheapest Collector Booster box of each set in ${r.inName} today`}
                  head={["Set", "Released", "Cheapest box", "Per pack"]}
                  rows={bySet.map((x) => {
                    const per = pp(x.p);
                    return {
                      key: x.code,
                      th: <SetLink r={r} slug={x.slug}>{x.name}</SetLink>,
                      cells: [
                        <span key="d">{formatRelease(x.releaseDate)}</span>,
                        <Link key="p" href={productHref(r, x.p)} prefetch={false} className="font-semibold text-brand underline-offset-2 hover:underline">
                          {m(x.p.lowestPriceCents!)} <span className="sr-only">for the {x.name} Collector Booster box</span>
                        </Link>,
                        <span key="pp">{per != null ? m(per) : "—"}</span>,
                      ],
                    };
                  })}
                />
              ) : (
                <NoneYet />
              )}
            </LiveBlock>
          </>
        ),
      },
      {
        id: "dearest",
        title: "The dearest Collector Booster boxes open today",
        body: (
          <>
            <Prose>
              <p>
                At the other end, the Collector Booster boxes with the highest cheapest price in {r.inName} today. These are usually sets that have left most shelves, or
                Universes Beyond sets with a following outside Magic, where only a few stores still hold a box.
              </p>
            </Prose>
            <LiveBlock r={r} checked={data.checked}>
              <CardTable r={r} caption={`The dearest open Collector Booster boxes in ${r.inName} today`} products={dear} />
            </LiveBlock>
          </>
        ),
      },
      {
        id: "spread",
        title: "Collector against Play Booster boxes",
        body: (
          <Prose>
            {spread ? (
              <p>
                Open Collector Booster boxes in {r.inName} run from {m(spread.low)} to {m(spread.high)} today. A Collector Booster box has 12 packs and a Play Booster box 30 or
                36, so a Collector Booster costs several times a Play Booster pack: the{" "}
                <a href={guideHref(r, "play-vs-collector-booster-box-value-by-set")}>Play vs Collector price per pack by set</a> guide puts the two side by side.
              </p>
            ) : (
              <p>There is no open Collector Booster box in {r.inName} to compare right now.</p>
            )}
            <p>
              If you want one or two packs rather than a box, loose Collector Boosters are on the{" "}
              {typeHref(r, "collector-booster") ? <a href={typeHref(r, "collector-booster")!}>Collector Booster packs</a> : "Collector Booster packs"} page; a box is usually the cheaper way per
              pack, but check the two for your set.
            </p>
          </Prose>
        ),
      },
      faqSection([
        {
          q: `How much is a Collector Booster box in ${r.inName}?`,
          a: low && spread ? `From ${m(low.lowestPriceCents!)} today (${low.name}) at the stores MTG Compare checks; the middle of ${spread.n} open boxes is ${m(spread.median)}.` : "No Collector Booster box is in stock at the stores we compare right now.",
        },
        { q: "How many packs are in a Collector Booster box?", a: "12 Collector Boosters, in every set that has one." },
        { q: "Is a Collector Booster box worth it?", a: "It depends on the set and on what you want from it. Our guide on the question compares a box with loose packs at today's prices." },
      ]),
      whereToBuy(r, {
        tcg: { query: "Magic Collector Booster Box", label: "Collector Booster boxes" },
        links: [
          { href: guideHref(r, "is-a-collector-booster-box-worth-it"), label: "Is a Collector Booster box worth it?" },
          { href: guideHref(r, "mtg-booster-box-prices"), label: "Play Booster box prices" },
        ],
      }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
