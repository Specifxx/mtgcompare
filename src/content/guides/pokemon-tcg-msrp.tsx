// Guide (US only): Pokémon TCG MSRP. The list prices are rrp.ts's (through facts.ts msrpTables, never typed here), with RRP_AS_OF,
// the sources its comments name, and RRP_NOTE wherever an MSRP is printed. The live block puts the cheapest open US price of each
// headline product of the four newest released Scarlet & Violet / Mega Evolution sets beside its MSRP. Nothing before Scarlet & Violet.
import Link from "next/link";
import { CALENDAR_TYPES, type ProductCardData } from "@/lib/data";
import { money, pctOf } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import { usMsrpForCard } from "@/lib/rrp";
import { TYPE_BY_LABEL } from "@/lib/sealed-title";
import type { GuideData } from "./data";
import { andList, msrpAsOf, msrpSeries, msrpTables, seriesList, seriesPhrase } from "./facts";
import { GUIDE_BY_SLUG } from "./index";
import {
  GuideBody,
  guideHref,
  Lede,
  LiveBlock,
  linesFor,
  MsrpNote,
  Note,
  ProductTh,
  Prose,
  SetGroup,
  SetTitle,
  setOf,
  StackTable,
  typeHref,
  whereToBuy,
  type BodyProps,
  type GuideOutline,
} from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("pokemon-tcg-msrp")!;

/** "18% below MSRP", "at MSRP", "12% above MSRP": today's price against the list price, rounded as the product page rounds it. */
export function vsMsrp(cents: number, msrp: number): { text: string; below: boolean } {
  const pct = pctOf(cents, msrp) ?? 0;
  if (pct === 0) return { text: "At MSRP", below: false };
  return pct < 0 ? { text: `${-pct}% below MSRP`, below: true } : { text: `${pct}% above MSRP`, below: false };
}

function msrpLine(r: RegionInfo, label: string, p: ProductCardData | null, missing: string | undefined) {
  const t = TYPE_BY_LABEL.get(label);
  const msrp = p ? usMsrpForCard(r.market, p.productType, p.setCode) : null;
  const diff = p && msrp != null && p.lowestPriceCents != null ? vsMsrp(p.lowestPriceCents, msrp) : null;
  return {
    key: label,
    type: t?.key,
    th: <ProductTh r={r} label={label} p={p} />,
    cells: p
      ? [
          <span key="p" className="font-semibold">{money(p.lowestPriceCents, r.market)}</span>,
          <span key="m">{msrp != null ? money(msrp, r.market) : "—"}</span>,
          <span key="d" className={diff?.below ? "font-semibold text-open" : "text-muted"}>{diff?.text ?? "—"}</span>,
        ]
      : [<span key="m" className="text-faint">{missing ?? "None right now"}</span>, <span key="a" className="text-faint">—</span>, <span key="b" className="text-faint">—</span>],
  };
}

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const tables = msrpTables();
  const covered = msrpSeries();
  const older = seriesList().filter((s) => !covered.includes(s));
  const sets = data.sets.map(setOf).filter((s): s is NonNullable<typeof s> => !!s);
  const first = tables[0];
  const row = (t: string) => first?.rows.find((x) => x.type === t);
  const pack = row("booster-pack");
  const box = row("booster-box");
  const bundle = row("booster-bundle");
  // The types with more than packs in them (ETBs, Build & Battle), whose list price per pack is above a single pack's.
  const extras = (first?.rows ?? []).filter((x) => pack && x.perPack != null && x.perPack > pack.cents);

  return {
    intro: (
      <>
        <Lede>
          MSRP is the manufacturer’s suggested retail price: for Pokémon TCG products sold in the US, the list price The Pokémon Company International sets. It’s a
          yardstick, not a price anyone has to charge. Here are the list prices for {seriesPhrase(covered)} products, and how today’s cheapest US prices compare.
        </Lede>
        <MsrpNote />
      </>
    ),
    sections: [
      {
        id: "msrp-by-product",
        title: "US MSRP by product",
        body: (
          <>
            {tables.map((table) => (
              <div key={table.series.join()} className="card my-6 px-4 py-2 sm:px-5 sm:py-3">
                <StackTable
                  caption={`US MSRP of ${seriesPhrase(table.series)} products, as of ${msrpAsOf()}`}
                  head={["Product", "MSRP", "Packs", "Per pack"]}
                  rows={table.rows.map((x) => ({
                    key: x.type,
                    type: x.type,
                    th: (
                      <Link href={typeHref(r, x.type)} prefetch={false} className="font-semibold text-ink underline decoration-line underline-offset-4 hover:text-brand hover:decoration-brand">
                        {x.label}
                      </Link>
                    ),
                    cells: [<span key="m" className="font-semibold">{money(x.cents, "US")}</span>, String(x.packs ?? "—"), x.perPack != null ? money(x.perPack, "US") : "—"],
                  }))}
                />
                <p className="border-t border-line py-2 text-xs text-muted">
                  {seriesPhrase(table.series)} sets · as of {msrpAsOf()}
                </p>
              </div>
            ))}
            {pack && box && bundle && box.packs && bundle.packs && (
              <Prose>
                <p>
                  {box.cents === box.packs * pack.cents && bundle.cents === bundle.packs * pack.cents
                    ? `A booster box’s MSRP is exactly ${box.packs} × the single-pack MSRP of ${money(pack.cents, "US")}, and a booster bundle’s ${bundle.packs} ×, so at list price a pack costs the same in a box, a bundle or on its own.`
                    : `A single pack lists at ${money(pack.cents, "US")}, a booster box at ${money(box.cents, "US")} and a booster bundle at ${money(bundle.cents, "US")}.`}{" "}
                  {extras.length > 0 && `The boxes that come with extras work out higher per pack at list price: ${andList(extras.map((x) => `${money(x.perPack!, "US")} in ${/^[AEIOU]/i.test(x.label) ? "an" : "a"} ${x.label}`))}.`}
                </p>
              </Prose>
            )}
            <p className="mt-3 text-xs leading-5 text-muted">
              Sources, as recorded in our data: Pokémon Center list prices for Scarlet &amp; Violet products (2023–2025); for Mega Evolution, pokemon.com’s product pages,
              TCGplayer’s Mega Evolution buyer’s guide, the Pokémon Center’s Mega Evolution Elite Trainer Box and 30th Celebration list prices (2025–2026).
            </p>
            <MsrpNote />
          </>
        ),
      },
      {
        id: "today",
        title: "Today’s cheapest prices against MSRP",
        live: true,
        body: (
          <>
            <Prose>
              <p>
                For the {sets.length} newest {seriesPhrase(covered)} sets, the cheapest booster box, Elite Trainer Box and booster bundle in stock in the US right now,
                beside its MSRP. The cheapest price is the lowest listing we compare: a US store or TCGplayer.
              </p>
            </Prose>
            <LiveBlock r={r} checked={data.checked}>
              {sets.map((s) => (
                <SetGroup key={s.code} title={<SetTitle r={r} set={s} today={data.today} />}>
                  <StackTable
                    caption={`${s.name}: cheapest US price and MSRP of its booster box, Elite Trainer Box and booster bundle today`}
                    head={["Product", "Today", "MSRP", "Against MSRP"]}
                    rows={linesFor(data.bySet[s.code], CALENDAR_TYPES, s).map((l) => msrpLine(r, l.label, l.p, l.missing))}
                  />
                </SetGroup>
              ))}
            </LiveBlock>
            <p className="text-xs leading-5 text-muted">
              Listed prices, excluding shipping and any sales tax.{" "}
              <Link href={`/${r.region}/deals`} prefetch={false} className="font-semibold text-brand hover:underline">
                Today’s deals →
              </Link>
            </p>
            <MsrpNote />
          </>
        ),
      },
      {
        id: "why-prices-differ",
        title: "Why prices sit above or below MSRP",
        body: (
          <Prose>
            <p>
              MSRP is a suggestion. Each store sets its own price, and on TCGplayer each seller does, so the same product can be above MSRP at one store and below it at
              another on the same day. The tables above are where things stand today, not a forecast.
            </p>
            <p>
              Two costs neither MSRP nor our prices include: shipping and sales tax. Shipping differs from store to store, so add it before you decide which is
              cheapest. The{" "}
              <Link href={guideHref(r, "booster-box-vs-etb-vs-booster-bundle")}>booster box vs ETB vs booster bundle</Link> guide compares the products themselves.
            </p>
          </Prose>
        ),
      },
      {
        id: "older-sets",
        title: "Older sets",
        body: (
          <Note>
            We show MSRP only for {seriesPhrase(covered)} sets. {older.length ? <>Earlier series ({seriesPhrase(older)}) had different list prices, and rather than guess them, we leave them out.</> : null}
          </Note>
        ),
      },
      whereToBuy(r, {
        tcg: { query: "Elite Trainer Box", label: "Pokémon Elite Trainer Boxes" },
        links: [{ href: typeHref(r, "etb"), label: "Elite Trainer Boxes" }],
      }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
