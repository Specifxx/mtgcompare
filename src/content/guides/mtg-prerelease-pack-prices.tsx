// Guide: Magic Prerelease pack and take-home kit prices in a region. The cheapest open packs today, each recent set's cheapest one (newest first),
// and the set's cheapest Bundle beside it for scale. No pack count and no per-pack price: kits differ by set and some are sold without the packs.
import Link from "@/components/Link";
import type { RegionInfo } from "@/lib/regions";
import { money, plural } from "@/lib/format";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { Checklist, GuideBody, guideHref, Lede, LiveBlock, NextLinks, NoneYet, productHref, Prose, StackTable, storesPhrase, typeHref, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { CardTable, faqSection, SetLink } from "./kit-more";
import { cheapestBySet, priceSpread } from "./more-data";

const GUIDE = GUIDE_BY_SLUG.get("mtg-prerelease-pack-prices")!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const bundles = data.byType?.["Prerelease Pack"] ?? [];
  const boxes = data.byType?.Bundle ?? [];
  const n = data.openByType?.["Prerelease Pack"] ?? bundles.length;
  const low = bundles[0] ?? null;
  const spread = priceSpread(bundles);
  const box = new Map(cheapestBySet(boxes, 40).map((x) => [x.code, x.p]));
  const bySet = cheapestBySet(bundles, 12);
  const m = (c: number) => money(c, r.market);
  const href = typeHref(r, "prerelease-pack");
  return {
    intro: (
      <Lede>
        {low && spread ? (
          <>
            A Prerelease pack is the kit stores sell around a set’s Prerelease weekend: Play Boosters and a promo card, in one box. {storesPhrase(r)} have <strong>{plural(n, "Prerelease pack")}</strong> open today,
            from{" "}
            <Link href={productHref(r, low)} prefetch={false} className="font-semibold text-brand underline-offset-2 hover:underline">
              {low.name}
            </Link>{" "}
            at <strong>{m(low.lowestPriceCents!)}</strong>; the middle of the {spread.n} we read is {m(spread.median)}. Prices are before delivery.
          </>
        ) : (
          <>A Prerelease pack is the kit stores sell around a set’s Prerelease weekend: Play Boosters and a promo card, in one box. None is in stock at {storesPhrase(r)} right now.</>
        )}
      </Lede>
    ),
    sections: [
      {
        id: "cheapest",
        title: `The cheapest Magic Prerelease packs in ${r.inName} today`,
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              <CardTable r={r} caption={`The cheapest Magic Prerelease packs in ${r.inName} today`} products={bundles.slice(0, 8)} perPack={false} />
            </LiveBlock>
            {href && <NextLinks links={[{ href, label: `Every Magic Prerelease pack in ${r.inName}`, icon: "arrow-right" }]} />}
          </>
        ),
      },
      {
        id: "by-set",
        title: "Each recent set’s Prerelease pack, beside its Bundle",
        body: (
          <>
            <Prose>
              <p>
                Newest set first: the cheapest Prerelease pack of each set open at {storesPhrase(r)} today, and the same set’s cheapest Bundle for scale. Wizards of the Coast does not
                set a price for the kit, so it is what each store charges. Once a set is a few weeks old, stock thins out and the kits that remain are stores’ leftovers.
              </p>
            </Prose>
            <LiveBlock r={r} checked={data.checked}>
              {bySet.length ? (
                <StackTable
                  caption={`The cheapest Prerelease pack of each set in ${r.inName} today, with the set's cheapest Bundle`}
                  head={["Set", "Cheapest Prerelease pack", "Bundle"]}
                  rows={bySet.map((x) => {
                    const b = box.get(x.code);
                    return {
                      key: x.code,
                      th: <SetLink r={r} slug={x.slug}>{x.name}</SetLink>,
                      cells: [
                        <Link key="p" href={productHref(r, x.p)} prefetch={false} className="font-semibold text-brand underline-offset-2 hover:underline">
                          {m(x.p.lowestPriceCents!)} <span className="sr-only">for the {x.name} Prerelease pack</span>
                        </Link>,
                        b ? (
                          <Link key="b" href={productHref(r, b)} prefetch={false} className="text-brand underline-offset-2 hover:underline">
                            {m(b.lowestPriceCents!)} <span className="sr-only">for the {x.name} Bundle</span>
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
        title: "Before you buy a Prerelease pack",
        body: (
          <>
            <Prose>
              {spread && (
                <p>
                  Open Prerelease packs in {r.inName} run from {m(spread.low)} to {m(spread.high)} today. The dearest are mostly kits of older sets that few stores still hold, or take-home kits sold as a bigger box.
                </p>
              )}
            </Prose>
            <Checklist
              items={[
                <>Read the title: a “take-home” or “at-home” kit is a different box from a Prerelease pack, and some are sold without the packs.</>,
                <>The promo card in a Prerelease pack is a stamped copy, not the set’s own card; the Play Boosters inside are ordinary ones.</>,
                <>Compare the same kit across every store on its page, and add delivery: prices here are before shipping.</>,
                <>See <a href={guideHref(r, "play-booster-vs-collector-booster-vs-bundle")}>Play Booster vs Collector Booster vs Bundle</a> for what a Bundle holds, and <a href={guideHref(r, "how-many-packs-in-magic-products")}>how many packs are in each Magic product</a> before you compare prices.</>,
              ]}
            />
          </>
        ),
      },
      faqSection([
        {
          q: `How much is a Magic Prerelease pack in ${r.inName}?`,
          a: low && spread ? `From ${m(low.lowestPriceCents!)} today (${low.name}) at the stores MTG Compare checks; the middle of ${spread.n} open Prerelease packs is ${m(spread.median)}.` : "No Prerelease pack is in stock at the stores we compare right now.",
        },
        { q: "What is in a Magic Prerelease pack?", a: "Play Boosters of one set and a stamped promo card, in a box. The exact contents differ by set: check the product listing." },
        { q: "Is a Prerelease pack the same as a Bundle?", a: "No. A Bundle is a gift box with packs, lands and accessories; a Prerelease pack is the kit sold for the set’s Prerelease weekend, built around its promo card." },
      ]),
      whereToBuy(r, {
        tcg: { query: "Magic Prerelease Pack", label: "Prerelease packs" },
        links: [
          { href: guideHref(r, "magic-sealed-gifts-under-50"), label: "Magic gifts under a budget" },
          { href: guideHref(r, "mtg-bundle-prices"), label: "Bundle prices" },
        ],
      }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
