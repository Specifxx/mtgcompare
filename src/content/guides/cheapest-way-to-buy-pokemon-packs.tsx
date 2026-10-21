// Guide: the cheapest way to buy Pokémon packs. A live ranking of the region's pack types by today's lowest price per pack (data.ts
// cheapestPerPackByType: per type, the open product of a released set with the lowest price per pack, packs from packs.ts), then
// general ways to pay less that need no claim the data can't back: compare per pack, add shipping, compare stores, older sets, and
// in the US MSRP as a yardstick (rrp.ts, with RRP_NOTE). No "best time to buy", no trend, no history.
import Link from "next/link";
import type { ProductCardData } from "@/lib/data";
import { money } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import { TYPE_BY_LABEL } from "@/lib/sealed-title";
import type { GuideData } from "./data";
import { fixedPacks, msrpTables, packsBySeries, seriesPhrase } from "./facts";
import { GUIDE_BY_SLUG } from "./index";
import {
  CheapestBadge,
  Checklist,
  GuideBody,
  guideHref,
  Lede,
  LiveBlock,
  MsrpNote,
  NextLinks,
  Note,
  PACK_SOURCE,
  perPackOf,
  ProductTh,
  Prose,
  StackTable,
  setHref,
  setOf,
  typeHref,
  whereText,
  whereToBuy,
  type BodyProps,
  type GuideOutline,
  type GuideSection,
} from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("cheapest-way-to-buy-pokemon-packs")!;

/** A pack type as it reads after "comes in". */
const A_PRODUCT: Record<string, string> = {
  "Booster Box": "a booster box",
  "Booster Bundle": "a booster bundle",
  "Elite Trainer Box": "an Elite Trainer Box",
  "Build & Battle Box": "a Build & Battle Box",
  "Sleeved Booster": "a sleeved booster",
  "Booster Pack": "a loose booster pack",
};

const storesPhrase = (r: RegionInfo) => (r.market === "US" ? "US stores and TCGplayer" : `${r.adjective} stores`);

/** The cards ranked by price per pack, cheapest first (cards without one dropped). */
export function rankByPerPack(cards: readonly ProductCardData[]): { p: ProductCardData; packs: number; perPack: number }[] {
  return cards
    .map((p) => ({ p, ...perPackOf(p) }))
    .filter((x): x is { p: ProductCardData; packs: number; perPack: number } => x.packs != null && x.perPack != null)
    .sort((a, b) => a.perPack - b.perPack);
}

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const ranked = rankByPerPack(data.cards);
  const top = ranked[0] ?? null;
  const box = fixedPacks("booster-box");
  const bundle = fixedPacks("booster-bundle");
  const [etbNow] = packsBySeries("etb");

  const sections: GuideSection[] = [
    {
      id: "ranking",
      title: "Cheapest per pack, by product, today",
      live: true,
      body: ranked.length ? (
        <>
          <Prose>
            <p>
              For each kind of product that holds a fixed number of packs, here’s the one with the lowest price per pack in stock at {storesPhrase(r)} right now, from any set
              that’s out. The cheapest of all is marked.
            </p>
          </Prose>
          <LiveBlock
            r={r}
            checked={data.checked}
            footer={
              <Link href={`/${r.region}/cheapest-packs`} prefetch={false} className="font-semibold text-brand hover:underline">
                Every set, by price per pack →
              </Link>
            }
          >
            <StackTable
              caption={`The lowest price per pack of each product type in ${r.inName} today`}
              head={["Product", "Price", "Packs", "Per pack"]}
              rows={ranked.map(({ p, packs, perPack }, i) => {
                const t = TYPE_BY_LABEL.get(p.productType);
                const set = p.setCode ? setOf(p.setCode) : null;
                return {
                  key: p.productType,
                  type: t?.key,
                  highlight: i === 0,
                  th: (
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <ProductTh r={r} label={t?.plural ?? p.productType} p={p} badge={i === 0 ? <CheapestBadge /> : undefined} />
                      <span className="text-xs text-muted">
                        {set && (
                          <>
                            <Link href={setHref(r, set)} prefetch={false} className="hover:text-brand hover:underline">
                              {set.name}
                            </Link>{" "}
                            ·{" "}
                          </>
                        )}
                        {whereText(p)}
                      </span>
                    </span>
                  ),
                  cells: [
                    <span key="p">{money(p.lowestPriceCents, r.market)}</span>,
                    <span key="n">{packs}</span>,
                    <span key="pp" className="font-semibold">
                      {money(perPack, r.market)}
                    </span>,
                  ],
                };
              })}
            />
          </LiveBlock>
          {top && (
            <Prose>
              <p>
                Right now the cheapest pack in {r.inName} comes in{" "}
                <Link href={typeHref(r, TYPE_BY_LABEL.get(top.p.productType)?.key ?? "booster-box")}>{A_PRODUCT[top.p.productType] ?? top.p.productType}</Link>, at{" "}
                <strong>{money(top.perPack, r.market)}</strong> a pack. That changes as stores change their prices, so the table is rebuilt each time we check them.
              </p>
            </Prose>
          )}
        </>
      ) : (
        <>
          <LiveBlock r={r} checked={data.checked}>
            <p className="text-sm text-muted">No product with a fixed pack count is in stock at the stores we compare in {r.inName} right now.</p>
          </LiveBlock>
          <NextLinks
            links={[
              { href: typeHref(r, "booster-box"), label: "Booster boxes", icon: "tag" },
              { href: typeHref(r, "booster-bundle"), label: "Booster bundles", icon: "tag" },
              { href: typeHref(r, "etb"), label: "Elite Trainer Boxes", icon: "tag" },
            ]}
          />
        </>
      ),
    },
    {
      id: "per-pack",
      title: "1. Compare per pack, not per box",
      body: (
        <>
          <Prose>
            <p>
              A <Link href={typeHref(r, "booster-box")}>booster box</Link> holds {box} packs, an <Link href={typeHref(r, "etb")}>Elite Trainer Box</Link> {etbNow.packs} (in{" "}
              {seriesPhrase(etbNow.series)} sets), a <Link href={typeHref(r, "booster-bundle")}>booster bundle</Link> {bundle} and a{" "}
              <Link href={typeHref(r, "booster-pack")}>loose pack</Link> one. Divide the price by the packs and the products line up. Every product page on DexCompare does this
              for you in its “Value check”.
            </p>
          </Prose>
          <p className="text-xs leading-5 text-muted">
            {PACK_SOURCE}{" "}
            <Link href={guideHref(r, "how-many-packs-in-pokemon-products")} className="font-medium text-brand underline underline-offset-2">
              Pack counts for every product →
            </Link>
          </p>
        </>
      ),
    },
    {
      id: "compare-stores",
      title: "2. Compare every store, not the first one",
      body: (
        <Prose>
          <p>
            The same sealed product can be listed at very different prices from one store to the next. Each product page lists every store we compare in {r.inName}, in stock
            first and cheapest first, so the gap is plain to see. <Link href={`/${r.region}/deals`}>Today’s deals</Link> lists the products whose cheapest store sits well under
            the middle price of the stores that have it.
          </p>
        </Prose>
      ),
    },
    {
      id: "shipping",
      title: "3. Add shipping before you decide",
      body: (
        <Checklist
          items={[
            <>
              <strong>Our prices exclude shipping.</strong> A cheaper box with a large delivery charge can cost more in the end.
            </>,
            <>
              <strong>Check the free-shipping threshold.</strong> Many stores waive delivery over a set order total, so one bigger order can cost less than two small ones.
            </>,
            <>
              <strong>Check where it ships from.</strong> A parcel from overseas can bring import charges.
            </>,
          ]}
        />
      ),
    },
    {
      id: "older-sets",
      title: "4. Look at more than the newest set",
      body: (
        <Prose>
          <p>
            Packs from different sets are priced differently, and the newest set isn’t always the cheapest per pack. The table above searches every set that’s out; the{" "}
            <Link href={`/${r.region}/cheapest-packs`}>cheapest per pack</Link> page ranks every set, and the <Link href={`/${r.region}/sets`}>set list</Link> has each set’s own prices.
          </p>
        </Prose>
      ),
    },
  ];

  if (r.market === "US") {
    const [table] = msrpTables();
    const pack = table?.rows.find((x) => x.type === "booster-pack");
    if (table && pack) {
      sections.push({
        id: "msrp",
        title: "5. Use MSRP as a yardstick",
        body: (
          <>
            <Prose>
              <p>
                In the US, a {seriesPhrase(table.series, "or")} booster pack lists at <strong>{money(pack.cents, "US")}</strong>, and the box, bundle and ETB list prices work
                out close to that per pack. A price per pack well above it is worth comparing elsewhere; the <Link href={guideHref(r, "pokemon-tcg-msrp")}>MSRP guide</Link> has
                every list price.
              </p>
            </Prose>
            <MsrpNote />
          </>
        ),
      });
    }
  }

  sections.push({
    id: "preorders",
    title: r.market === "US" ? "6. Pre-orders: compare them too" : "5. Pre-orders: compare them too",
    body: (
      <>
        <Prose>
          <p>
            Pre-order prices differ between stores as much as anything else, and they’re compared the same way. The{" "}
            <Link href={guideHref(r, "how-to-preorder-pokemon-tcg")}>pre-order guide</Link> has a checklist for before you pay.
          </p>
        </Prose>
        <Note>
          DexCompare shows each store’s price today. It doesn’t predict prices, and no store pays to be listed or to rank.
        </Note>
      </>
    ),
  });

  sections.push(
    whereToBuy(r, {
      tcg: { query: "Booster Bundle", label: "Pokémon booster bundles" },
      links: [{ href: `/${r.region}/cheapest-packs`, label: "Cheapest per pack" }],
    }),
  );

  return {
    intro: (
      <Lede>
        The cheapest way to buy Pokémon packs is to compare <strong>price per pack</strong> across products and stores. Here’s which product gives the cheapest pack at{" "}
        {storesPhrase(r)} today, and the checks that save money on any order.
      </Lede>
    ),
    sections,
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
