// Guide: how to avoid resealed or fake Pokémon sealed product. Checks phrased as checks (the listing, the price, the seller, the
// parcel), never claims about any store or about what a factory seal looks like in every product. The live block is the newest
// released set the region's stores have in stock: the cheapest box, ETB and bundle with the middle price of the stores that have it
// (ProductStat.medianOpenCents), so a reader can see what a listing far under that looks like. The 50% rule is deals.ts's
// DEAL_MIN_RATIO: below half the median the site treats a price as a misread listing, not a deal.
import Link from "next/link";
import { CALENDAR_TYPES } from "@/lib/data";
import { DEAL_MIN_RATIO } from "@/lib/deals";
import { money } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import { TYPE_BY_LABEL } from "@/lib/sealed-title";
import type { GuideData } from "./data";
import { fixedPacks } from "./facts";
import { GUIDE_BY_SLUG } from "./index";
import {
  Checklist,
  Decisions,
  GuideBody,
  guideHref,
  Lede,
  LiveBlock,
  linesFor,
  Note,
  ProductTh,
  Prose,
  SetTitle,
  setOf,
  StackTable,
  typeHref,
  whereText,
  whereToBuy,
  type BodyProps,
  type GuideOutline,
} from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("how-to-avoid-resealed-pokemon-products")!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const set = data.sets.map(setOf).find((s) => !!s) ?? null;
  const lines = set ? linesFor(data.bySet[set.code], CALENDAR_TYPES, set) : [];
  const half = Math.round(DEAL_MIN_RATIO * 100);
  const box = fixedPacks("booster-box");

  return {
    intro: (
      <Lede>
        A resealed product has been opened, had packs swapped or removed, and been wrapped again to look new. Most of the risk sits with listings that are{" "}
        <strong>much cheaper than everywhere else</strong> or sellers you can’t check. Here’s what to look at before you pay and when the parcel arrives, with today’s prices in{" "}
        {r.inName} to compare against.
      </Lede>
    ),
    sections: [
      {
        id: "typical-prices",
        title: "Know the going price first",
        live: true,
        body: (
          <>
            <Prose>
              <p>
                The quickest check is the price. Here are the newest set’s headline products in {r.inName} right now: the cheapest store, and the middle price of all the stores
                that have it in stock.
              </p>
            </Prose>
            <LiveBlock r={r} checked={data.checked} title={set ? <SetTitle r={r} set={set} today={data.today} /> : undefined}>
              <StackTable
                caption={`${set?.name ?? "The newest set"}: the cheapest and the middle store price of its booster box, Elite Trainer Box and booster bundle in ${r.inName} today`}
                head={["Product", "Cheapest", "Middle price", "In stock at"]}
                rows={lines.map((l) => ({
                  key: l.label,
                  type: TYPE_BY_LABEL.get(l.label)?.key,
                  th: <ProductTh r={r} label={l.label} p={l.p} />,
                  cells: l.p
                    ? [
                        <span key="c" className="font-semibold">{money(l.p.lowestPriceCents, r.market)}</span>,
                        <span key="m">{l.p.medianOpenCents != null ? money(l.p.medianOpenCents, r.market) : "—"}</span>,
                        <span key="w" className="text-muted">{whereText(l.p)}</span>,
                      ]
                    : [<span key="m" className="text-faint">{l.missing}</span>, <span key="a" className="text-faint">—</span>, <span key="b" className="text-faint">—</span>],
                }))}
              />
            </LiveBlock>
            <Prose>
              <p>
                On DexCompare, a price under {half}% of the middle price is never shown as a deal: across hundreds of stores, that’s almost always a listing filed under the wrong
                product. Anywhere else, a sealed product far under the going price deserves a question before you pay.
              </p>
            </Prose>
          </>
        ),
      },
      {
        id: "listing",
        title: "Check the listing",
        body: (
          <Checklist
            items={[
              <>
                <strong>Photos of the actual item</strong>, from more than one side, not only the publisher’s product image.
              </>,
              <>
                <strong>The exact product name:</strong> set, product type, and English-language. A “booster box” of a set that was never sold as a {box}-pack box is a lot
                someone has made up.
              </>,
              <>
                <strong>The words “sealed” and “factory sealed”</strong> in the description, and a seller who will confirm it in writing.
              </>,
              <>
                <strong>Clear returns terms</strong> that cover an item that isn’t as described.
              </>,
            ]}
          />
        ),
      },
      {
        id: "seller",
        title: "Check the seller",
        body: (
          <Decisions
            rows={[
              {
                when: "A store’s own website",
                then: (
                  <>
                    Look for a business name, contact details and a returns policy. Every store we compare is listed on <Link href={`/${r.region}/stores`}>our stores page</Link>, with
                    how many products it has in stock.
                  </>
                ),
              },
              {
                when: "A marketplace seller",
                then: <>Read the seller’s feedback for sealed product in particular, and check the marketplace’s buyer protection before you pay.</>,
              },
              {
                when: "A local or private sale",
                then: <>Inspect the product in person before you hand over money, and pay in a way that leaves a record.</>,
              },
            ]}
          />
        ),
      },
      {
        id: "wrap",
        title: "Check the wrap when it arrives",
        body: (
          <>
            <Checklist
              items={[
                <>
                  <strong>The shrink-wrap is tight and even</strong>, with neat seams. Loose, bunched or heavily melted wrap is worth a question.
                </>,
                <>
                  <strong>The wrap matches the product.</strong> Many recent <Link href={typeHref(r, "booster-box")}>booster boxes</Link> and{" "}
                  <Link href={typeHref(r, "etb")}>Elite Trainer Boxes</Link> come in printed wrap; compare yours with photos from a few stores of the same product.
                </>,
                <>
                  <strong>Packs inside a box sit flat and evenly</strong> once it’s opened, and each pack’s own seal is crimped and intact at both ends.
                </>,
                <>
                  <strong>Film yourself opening it</strong> if it’s an expensive product: a video from the sealed box onwards helps with any claim.
                </>,
              ]}
            />
            <Note>
              Found a problem? Contact the seller first, with photos and your order confirmation, and keep the packaging until it’s settled.
            </Note>
          </>
        ),
      },
      {
        id: "lower-risk",
        title: "Ways to lower the risk",
        body: (
          <Prose>
            <ul>
              <li>
                <strong>Buy from a store, not a stranger.</strong> Every product page on DexCompare ranks the stores side by side, so you can see what buying from one costs before you look elsewhere.
              </li>
              <li>
                <strong>Start small with a new seller.</strong> Try a <Link href={typeHref(r, "booster-bundle")}>booster bundle</Link> before a box: a cheaper first order puts
                less at risk.
              </li>
              <li>
                <strong>Know what’s inside.</strong> The <Link href={guideHref(r, "how-many-packs-in-pokemon-products")}>pack count guide</Link> says how many packs each product
                holds, so you can count them.
              </li>
            </ul>
          </Prose>
        ),
      },
      whereToBuy(r, {
        tcg: { query: "Booster Box", label: "Pokémon booster boxes" },
        links: [{ href: guideHref(r, "where-to-buy-pokemon-cards-online"), label: "Where to buy online" }],
      }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
