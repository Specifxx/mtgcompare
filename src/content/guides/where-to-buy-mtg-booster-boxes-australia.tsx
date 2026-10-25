// Guide (AU only): where to buy Magic booster boxes in Australia. The Australian stores with the most sealed Magic in stock today
// (live.ts topStores), the cheapest Play and Collector Booster boxes in AUD, and each recent set's cheapest box with its release date
// (lib/sets.ts through cheapestBySet). Each product row has its MTG Compare page and an Amazon AU link (no Amazon price or stock).
import Link from "@/components/Link";
import { AmazonLink, AmazonNote } from "@/components/Amazon";
import type { RegionInfo } from "@/lib/regions";
import { money, plural } from "@/lib/format";
import { formatRelease } from "@/lib/release";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG, type GuideSlug } from "./index";
import { Checklist, GuideBody, guideHref, Lede, LiveBlock, NextLinks, NoneYet, productHref, Prose, StackTable, storesPhrase, typeHref, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { CardTable, faqSection, SetLink } from "./kit-more";
import { cheapestBySet } from "./more-data";
import { whereText } from "../families";

const SLUG: GuideSlug = "where-to-buy-mtg-booster-boxes-australia";
const GUIDE = GUIDE_BY_SLUG.get(SLUG)!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const page = `/${r.region}/guides/${SLUG}`;
  const play = data.byType?.["Play Booster Box"] ?? [];
  const coll = data.byType?.["Collector Booster Box"] ?? [];
  const nPlay = data.openByType?.["Play Booster Box"] ?? play.length;
  const nColl = data.openByType?.["Collector Booster Box"] ?? coll.length;
  const low = play[0] ?? null;
  const lowColl = coll[0] ?? null;
  const bySet = cheapestBySet(play, 10);
  const stores = data.stores.slice(0, 10);
  const m = (c: number) => money(c, r.market);
  return {
    intro: (
      <Lede>
        {storesPhrase(r)} have <strong>{plural(nPlay, "Play Booster box", "Play Booster boxes")}</strong> and <strong>{plural(nColl, "Collector Booster box", "Collector Booster boxes")}</strong>{" "}
        in stock or on pre-order today{low ? <>; the cheapest Play Booster box is <strong>{m(low.lowestPriceCents!)}</strong></> : null}. MTG Compare reads each store about twice a
        day and ranks them by price and stock; no store pays to be listed. Prices are in AUD, before shipping.
      </Lede>
    ),
    sections: [
      {
        id: "stores",
        title: "Australian stores with the most Magic in stock",
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              {stores.length ? (
                <StackTable
                  caption="Australian stores with the most sealed Magic in stock today"
                  head={["Store", "In stock", "Listed"]}
                  rows={stores.map((s) => ({
                    key: s.store,
                    th: (
                      <Link href={`/${r.region}/stores/${s.store}`} prefetch={false} className="font-semibold text-brand underline-offset-2 hover:underline">
                        {s.name}
                      </Link>
                    ),
                    cells: [<span key="i">{s.inStock.toLocaleString("en")}</span>, <span key="l" className="text-muted">{s.listed.toLocaleString("en")}</span>],
                  }))}
                />
              ) : (
                <NoneYet />
              )}
            </LiveBlock>
            <Prose>
              <p>Counts are every sealed Magic product the store has in stock, not only booster boxes. The tables below are booster boxes alone.</p>
            </Prose>
          </>
        ),
      },
      {
        id: "cheapest-play",
        title: "The cheapest Play Booster boxes today",
        body: (
          <>
            <LiveBlock r={r} checked={data.checked} footer={<AmazonNote />}>
              <CardTable r={r} caption="The cheapest Play Booster boxes in Australia today" products={play.slice(0, 8)} amazonPage={page} />
            </LiveBlock>
            {typeHref(r, "play-booster-box") && <NextLinks links={[{ href: typeHref(r, "play-booster-box")!, label: "Every Play Booster box in Australia", icon: "arrow-right" }]} />}
          </>
        ),
      },
      {
        id: "by-set",
        title: "The cheapest box of each recent set",
        body: (
          <LiveBlock r={r} checked={data.checked} footer={<AmazonNote />}>
            {bySet.length ? (
              <StackTable
                caption="The cheapest Play Booster box of each set in Australia today"
                head={["Set", "Released", "Cheapest box", "In stock at", "Amazon AU"]}
                rows={bySet.map((x) => ({
                  key: x.code,
                  th: <SetLink r={r} slug={x.slug}>{x.name}</SetLink>,
                  cells: [
                    <span key="d">{formatRelease(x.releaseDate)}</span>,
                    <Link key="p" href={productHref(r, x.p)} prefetch={false} className="font-semibold text-brand underline-offset-2 hover:underline">
                      {m(x.p.lowestPriceCents!)} <span className="sr-only">for the {x.name} Play Booster box</span>
                    </Link>,
                    <span key="w" className="text-muted">{whereText(x.p)}</span>,
                    <AmazonLink key="a" region={r.region} name={x.p.name} slug={x.p.slug} placement="amazon-guide" page={page} />,
                  ],
                }))}
              />
            ) : (
              <NoneYet />
            )}
          </LiveBlock>
        ),
      },
      {
        id: "cheapest-collector",
        title: "The cheapest Collector Booster boxes today",
        body: (
          <LiveBlock r={r} checked={data.checked} footer={<AmazonNote />}>
            <CardTable r={r} caption="The cheapest Collector Booster boxes in Australia today" products={coll.slice(0, 6)} amazonPage={page} />
          </LiveBlock>
        ),
      },
      {
        id: "before-you-order",
        title: "Before you order a booster box",
        body: (
          <Checklist
            items={[
              <>Compare the same box across every store on its MTG Compare page: the cheapest store changes from day to day.</>,
              <>Add delivery: a box is heavy, and the prices here are before shipping.</>,
              <>Check whether it is a pre-order, and the release date, before you pay.</>,
              <>Amazon Australia may list the box too: check its price and seller on Amazon’s own page. We do not show Amazon prices or stock.</>,
              <>Check the wrap when it arrives. See <a href={guideHref(r, "how-to-avoid-resealed-magic-products")}>how to avoid resealed product</a>.</>,
            ]}
          />
        ),
      },
      faqSection([
        { q: "Where can I buy a Magic booster box in Australia?", a: stores.length ? `At the ${stores.length} Australian stores listed above, among others: ${stores.slice(0, 3).map((s) => s.name).join(", ")} have the most sealed Magic in stock today.` : "At the Australian stores MTG Compare compares; none has stock right now." },
        { q: "How much is a booster box in Australia?", a: low ? `From ${m(low.lowestPriceCents!)} today (${low.name}) for a Play Booster box${lowColl ? `, and from ${m(lowColl.lowestPriceCents!)} for a Collector Booster box` : ""}, before shipping.` : "No Play Booster box is in stock at the Australian stores we compare right now." },
        { q: "Is Amazon Australia cheaper?", a: "We do not check Amazon's prices or stock, so we cannot say. Each row links to Amazon AU so you can compare its price on Amazon's own page." },
        { q: "Are the prices with GST and shipping?", a: "Australian stores list prices including GST. Shipping is not included: add each store's delivery before you compare." },
      ]),
      whereToBuy(r, { links: [{ href: guideHref(r, "mtg-booster-box-prices"), label: "Booster box prices" }, { href: guideHref(r, "collector-booster-box-prices"), label: "Collector Booster box prices" }] }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
