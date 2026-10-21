// Guide: every kind of Pokémon TCG sealed product. One H2 per PRODUCT_TYPES entry, in the site's order: what it is (type-about.ts,
// word for word), its pack count (packs.ts, or "varies"), a live line from typeSummary (how many are in stock in the region right
// now, and from what price) and a link to its type page.
import Link from "next/link";
import type { ReactNode } from "react";
import { money } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import { PRODUCT_TYPES, type ProductTypeInfo, type TypeKey } from "@/lib/sealed-title";
import { TYPE_ABOUT } from "@/lib/type-about";
import type { GuideData, TypeSummaryRow } from "./data";
import { andList, blisterRange, fixedPacks, packsBySeries, perCase, specialEtbSets } from "./facts";
import { GUIDE_BY_SLUG } from "./index";
import { Checked, GuideBody, Lede, PACK_SOURCE, typeHref, whereToBuy, type BodyProps, type GuideOutline, type GuideSection } from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("pokemon-sealed-products-explained")!;

/** A type's pack count as a figure and, where it depends on the series or the product, the line that says how. */
export function packFigure(type: TypeKey): { figure: string; detail: string | null } {
  if (type === "blister") {
    const [lo, hi] = blisterRange();
    return { figure: `${lo}–${hi}`, detail: "The name says how many: a single, 2-pack or 3-pack blister." };
  }
  const fixed = fixedPacks(type);
  if (fixed != null) {
    const n = type === "booster-box-case" ? perCase("booster-box-case", "booster-box") : null;
    return { figure: String(fixed), detail: n ? `${n} booster boxes.` : null };
  }
  const rows = packsBySeries(type);
  if (!rows.length) return { figure: "Varies", detail: "It changes from product to product, so we show no price per pack." };
  const parts = rows.map((row) => `${row.packs} in ${andList(row.series)} sets`);
  if (type === "etb") {
    const special = [...new Set(specialEtbSets().map((x) => x.packs).filter((n): n is number => n != null))];
    if (special.length === 1) parts.push(`${special[0]} in a few special sets`);
  }
  if (type === "etb-case") {
    const n = perCase("etb-case", "etb");
    if (n) parts.unshift(`${n} Elite Trainer Boxes`);
  }
  return { figure: String(rows[0].packs), detail: `${parts.join("; ")}.` };
}

/** "52 in stock in the US from $80.82 · 1 on pre-order", or none. */
function liveLine(r: RegionInfo, row: TypeSummaryRow | undefined): ReactNode {
  const pre = row?.preorder ? <> · {row.preorder} on pre-order</> : null;
  if (!row || !row.inStock || row.fromCents == null) {
    return (
      <>
        None in stock in {r.inName} right now{pre}
      </>
    );
  }
  return (
    <>
      <strong className="font-semibold text-ink">{row.inStock} in stock</strong> in {r.inName} from <strong className="tabular font-semibold text-ink">{money(row.fromCents, r.market)}</strong>
      {pre}
    </>
  );
}

function TypeCard({ r, t, row }: { r: RegionInfo; t: ProductTypeInfo; row: TypeSummaryRow | undefined }) {
  const { figure, detail } = packFigure(t.key);
  const varies = figure === "Varies";
  return (
    <div className="card overflow-hidden" data-type={t.key}>
      <div className="flex gap-4 p-4 sm:gap-5 sm:p-5">
        <div className="flex w-16 shrink-0 flex-col items-center justify-center self-start rounded-lg bg-brand-soft px-1 py-2 text-brand-strong sm:w-20">
          <span className={`tabular font-display font-extrabold leading-none ${varies ? "text-sm" : "text-2xl sm:text-3xl"}`}>{figure}</span>
          <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide">{varies ? "packs" : figure === "1" ? "pack" : "packs"}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[15px] leading-6 text-ink/90">{TYPE_ABOUT[t.slug]}</p>
          {detail && <p className="mt-1.5 text-xs leading-5 text-muted">{detail}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line bg-raised px-4 py-3 text-sm text-muted sm:px-5">
        <span>
          <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-open align-middle" />
          Right now: {liveLine(r, row)}
        </span>
        <Link href={typeHref(r, t.key)} prefetch={false} className="font-semibold text-brand hover:underline">
          {t.plural} in {r.inName} →
        </Link>
      </div>
    </div>
  );
}

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const byLabel = new Map(data.types.map((row) => [row.productType, row]));
  const sections: GuideSection[] = PRODUCT_TYPES.map((t, i) => ({
    id: t.slug,
    title: t.plural,
    live: i === 0,
    body: <TypeCard r={r} t={t} row={byLabel.get(t.label)} />,
  }));
  sections.push(whereToBuy(r, { tcg: { query: "", label: "Pokémon sealed product" }, links: [{ href: `/${r.region}/sealed`, label: `All sealed in ${r.inName}` }] }));
  return {
    intro: (
      <>
        <Lede>
          Pokémon TCG cards are sold sealed in a handful of formats, from a single booster pack to a sealed case of booster boxes. Here’s every kind of sealed product we
          compare, what each one holds, and how many are in stock in {r.inName} right now.
        </Lede>
        <p className="mt-4 text-xs leading-5 text-muted">
          {PACK_SOURCE} Stock counts and from-prices are for {r.inName}.
          {data.checked ? (
            <>
              {" "}
              <Checked iso={data.checked} />.
            </>
          ) : null}
        </p>
      </>
    ),
    sections,
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
