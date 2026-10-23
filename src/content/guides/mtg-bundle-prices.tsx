// Guide: Magic Bundle prices in a region. The cheapest open Bundles today, each recent set's cheapest Bundle (newest first), and the
// set's cheapest Play Booster box beside it for scale. No pack count: a Bundle's contents differ by set, so no per-pack price is given.
import Link from "@/components/Link";
import type { RegionInfo } from "@/lib/regions";
import { money, plural } from "@/lib/format";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { Checklist, GuideBody, guideHref, Lede, LiveBlock, NextLinks, NoneYet, productHref, Prose, StackTable, storesPhrase, typeHref, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { CardTable, faqSection, SetLink } from "./kit-more";
import { cheapestBySet, priceSpread } from "./more-data";

const GUIDE = GUIDE_BY_SLUG.get("mtg-bundle-prices")!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const bundles = data.byType?.Bundle ?? [];
  const boxes = data.byType?.["Play Booster Box"] ?? [];
  const n = data.openByType?.Bundle ?? bundles.length;
  const low = bundles[0] ?? null;
  const spread = priceSpread(bundles);
  const box = new Map(cheapestBySet(boxes, 40).map((x) => [x.code, x.p]));
  const bySet = cheapestBySet(bundles, 12);
  const m = (c: number) => money(c, r.market);
  const href = typeHref(r, "bundle");
  return {
    intro: (
      <Lede>
        {low && spread ? (
          <>
            A Magic Bundle is a set’s gift box: booster packs, basic lands and accessories in one box. {storesPhrase(r)} have <strong>{plural(n, "Bundle")}</strong> open today,
            from{" "}
            <Link href={productHref(r, low)} prefetch={false} className="font-semibold text-brand underline-offset-2 hover:underline">
              {low.name}
            </Link>{" "}
            at <strong>{m(low.lowestPriceCents!)}</strong>; the middle of the {spread.n} we read is {m(spread.median)}.
          </>
        ) : (
          <>A Magic Bundle is a set’s gift box: booster packs, basic lands and accessories in one box. None is in stock at {storesPhrase(r)} right now.</>
        )}
      </Lede>
    ),
    sections: [
      {
        id: "cheapest",
        title: `The cheapest Magic Bundles in ${r.inName} today`,
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              <CardTable r={r} caption={`The cheapest Magic Bundles in ${r.inName} today`} products={bundles.slice(0, 8)} perPack={false} />
            </LiveBlock>
            {href && <NextLinks links={[{ href, label: `Every Magic Bundle in ${r.inName}`, icon: "arrow-right" }]} />}
          </>
        ),
      },
      {
        id: "by-set",
        title: "Each recent set’s Bundle, beside its booster box",
        body: (
          <>
            <Prose>
              <p>
                Newest set first: the cheapest Bundle of each set open at {storesPhrase(r)} today, and the same set’s cheapest Play Booster box for scale. A Bundle costs a
                fraction of a box and holds far fewer packs; it is the usual choice for a gift or for a player who wants the lands and the storage box.
              </p>
            </Prose>
            <LiveBlock r={r} checked={data.checked}>
              {bySet.length ? (
                <StackTable
                  caption={`The cheapest Bundle of each set in ${r.inName} today, with the set's cheapest Play Booster box`}
                  head={["Set", "Cheapest Bundle", "Play Booster box"]}
                  rows={bySet.map((x) => {
                    const b = box.get(x.code);
                    return {
                      key: x.code,
                      th: <SetLink r={r} slug={x.slug}>{x.name}</SetLink>,
                      cells: [
                        <Link key="p" href={productHref(r, x.p)} prefetch={false} className="font-semibold text-brand underline-offset-2 hover:underline">
                          {m(x.p.lowestPriceCents!)} <span className="sr-only">for the {x.name} Bundle</span>
                        </Link>,
                        b ? (
                          <Link key="b" href={productHref(r, b)} prefetch={false} className="text-brand underline-offset-2 hover:underline">
                            {m(b.lowestPriceCents!)} <span className="sr-only">for the {x.name} Play Booster box</span>
                          </Link>
                        ) : (
                          <span key="b" className="text-muted">none open</span>
                        ),
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
        id: "before-you-buy",
        title: "Before you buy a Bundle",
        body: (
          <>
            <Prose>
              {spread && (
                <p>
                  Open Bundles in {r.inName} run from {m(spread.low)} to {m(spread.high)} today. The dearest are mostly Bundles of older or Universes Beyond sets that few stores
                  still hold.
                </p>
              )}
            </Prose>
            <Checklist
              items={[
                <>Check the set and the edition: some sets also sell a Gift Bundle or a special edition with different contents and a different price.</>,
                <>A store-made “bundle” of loose packs is not a Wizards Bundle; MTG Compare leaves those out.</>,
                <>Compare the same Bundle across every store on its page, and add delivery: prices here are before shipping.</>,
                <>See <a href={guideHref(r, "play-booster-vs-collector-booster-vs-bundle")}>Play Booster vs Collector Booster vs Bundle</a> for what each one holds.</>,
              ]}
            />
          </>
        ),
      },
      faqSection([
        {
          q: `How much is a Magic Bundle in ${r.inName}?`,
          a: low && spread ? `From ${m(low.lowestPriceCents!)} today (${low.name}) at the stores MTG Compare checks; the middle of ${spread.n} open Bundles is ${m(spread.median)}.` : "No Bundle is in stock at the stores we compare right now.",
        },
        { q: "What is in a Magic Bundle?", a: "Booster packs of one set, basic lands, a storage box and accessories. The exact contents differ by set: check the product listing." },
        { q: "Is a Bundle cheaper than a booster box?", a: "Yes, by the box: a Bundle costs a fraction of a booster box, but it also holds far fewer packs." },
      ]),
      whereToBuy(r, {
        tcg: { query: "Magic Bundle", label: "Bundles" },
        links: [
          { href: guideHref(r, "magic-sealed-gifts-under-50"), label: "Magic gifts under a budget" },
          { href: guideHref(r, "mtg-booster-box-prices"), label: "Booster box prices" },
        ],
      }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
