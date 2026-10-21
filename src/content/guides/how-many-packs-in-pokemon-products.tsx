// Guide: how many packs are in each Pokémon TCG sealed product. Every count comes from packs.ts (packsFor, through facts.ts), never
// typed here; the live block is the cheapest box, ETB and bundle of the newest set the region's stores have in stock.
import Link from "next/link";
import type { ReactNode } from "react";
import { CALENDAR_TYPES } from "@/lib/data";
import type { RegionInfo } from "@/lib/regions";
import { TYPE_BY_KEY, type TypeKey } from "@/lib/sealed-title";
import { TYPE_ABOUT } from "@/lib/type-about";
import type { GuideData } from "./data";
import { andList, blisterRange, fixedPacks, newestReleased, packsBySeries, perCase, specialEtbSets, VARIES } from "./facts";
import { GUIDE_BY_SLUG } from "./index";
import { GuideBody, Lede, LiveBlock, linesFor, NextLinks, Note, PACK_SOURCE, PriceTable, Prose, SetChips, SetTitle, setOf, StackTable, typeHref, whereToBuy, type BodyProps, type GuideOutline, type StackRow } from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("how-many-packs-in-pokemon-products")!;

/** The table's rows, in the order a buyer climbs: a box and its case, the ETBs, the smaller boxes, the loose packs. */
const ROWS: TypeKey[] = ["booster-box", "booster-box-case", "etb", "pc-etb", "etb-case", "booster-bundle", "build-battle", "build-battle-stadium", "blister", "sleeved-booster", "booster-pack"];

/** The packs cell: one number when every set shares it, else one line per count with the series it holds for. */
function packsCell(type: TypeKey): ReactNode {
  if (type === "blister") {
    const [lo, hi] = blisterRange();
    return <span className="font-display text-lg font-bold">{lo === hi ? lo : `${lo} to ${hi}`}</span>;
  }
  const fixed = fixedPacks(type);
  if (fixed != null) return <span className="font-display text-lg font-bold">{fixed}</span>;
  return (
    <ul role="list" className="grid gap-1">
      {packsBySeries(type).map((row) => (
        <li key={row.packs} className="leading-5">
          <span className="font-display text-lg font-bold">{row.packs}</span> <span className="text-xs text-muted">in {andList(row.series)} sets</span>
        </li>
      ))}
    </ul>
  );
}

/** What else a buyer should know about the type's count. */
function noteFor(type: TypeKey): string | null {
  switch (type) {
    case "booster-box":
      return "One set’s English display box. Every box we compare is a full box.";
    case "booster-box-case": {
      const n = perCase("booster-box-case", "booster-box");
      return n ? `${n} booster boxes.` : null;
    }
    case "etb": {
      const special = specialEtbSets().filter((x) => x.packs != null);
      const counts = [...new Set(special.map((x) => x.packs))];
      return counts.length === 1 ? `A few special sets hold ${counts[0]} (listed below).` : null;
    }
    case "etb-case": {
      const n = perCase("etb-case", "etb");
      return n ? `${n} Elite Trainer Boxes.` : null;
    }
    case "blister":
      return "The name says how many: a single, 2-pack or 3-pack blister.";
    default:
      return null;
  }
}

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const box = fixedPacks("booster-box");
  const bundle = fixedPacks("booster-bundle");
  const [etbNow, etbBefore] = packsBySeries("etb");
  const special = specialEtbSets();
  const tens = special.filter((x) => x.packs != null);
  const noCount = special.filter((x) => x.packs == null);
  const code = data.sets[0];
  const set = code ? setOf(code) : null;
  const stocked = !!code && (data.bySet[code]?.length ?? 0) > 0;
  const newest = newestReleased(data.today, 1)[0];
  const rows: StackRow[] = ROWS.map((type) => {
    const t = TYPE_BY_KEY.get(type)!;
    const note = noteFor(type);
    return {
      key: type,
      type,
      th: (
        <span className="flex flex-col gap-0.5">
          <Link href={typeHref(r, type)} prefetch={false} className="font-semibold text-ink underline decoration-line underline-offset-4 hover:text-brand hover:decoration-brand">
            {t.label}
          </Link>
          {note && <span className="text-xs leading-5 text-muted">{note}</span>}
        </span>
      ),
      cells: [packsCell(type)],
      wide: fixedPacks(type) == null && type !== "blister",
    };
  });
  rows.push({
    key: "varies",
    th: (
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold text-ink">Tins, collections, Ultra-Premium Collections, decks, bundle cases</span>
        <span className="text-xs leading-5 text-muted">It depends on the product: see below.</span>
      </span>
    ),
    cells: [<span key="v" className="font-semibold">Varies</span>],
  });

  return {
    intro: (
      <Lede>
        A Pokémon TCG booster box holds <strong>{box} packs</strong>, a booster bundle <strong>{bundle}</strong>, and an Elite Trainer Box{" "}
        <strong>{etbNow.packs}</strong> in {andList([...etbNow.series].reverse())} sets ({etbBefore.packs} in older ones). Everything else depends on the product, and
        for a few, on the set. Here’s the full list, and what a pack costs in {r.inName} today.
      </Lede>
    ),
    sections: [
      {
        id: "pack-counts",
        title: "Pack counts for every product",
        body: (
          <>
            <div className="card my-6 px-4 py-2 sm:px-5 sm:py-3">
              <StackTable caption="Booster packs in each Pokémon TCG sealed product" head={["Product", "Booster packs"]} rows={rows} compact align="left" />
            </div>
            <p className="text-xs leading-5 text-muted">{PACK_SOURCE} English-language products.</p>
          </>
        ),
      },
      {
        id: "today",
        title: set ? `What a pack costs today: ${set.name}` : "What a pack costs today",
        live: true,
        body: set ? (
          <>
            <Prose>
              <p>
                {set.code === newest?.code ? `${set.name} is the newest set out.` : `${set.name} is the newest set with a booster box, Elite Trainer Box or bundle in stock in ${r.inName}.`}{" "}
                {stocked
                  ? "Here’s the cheapest of each in stock right now, and what that works out to per pack."
                  : `None of its boxes, ETBs or bundles is in stock in ${r.inName} right now; its set page lists everything stores have.`}
              </p>
            </Prose>
            <LiveBlock
              r={r}
              checked={data.checked}
              title={<SetTitle r={r} set={set} today={data.today} />}
              footer={
                <span className="flex flex-wrap gap-x-5 gap-y-2">
                  <Link href={`/${r.region}/sets/${set.slug}`} prefetch={false} className="font-semibold text-brand hover:underline">
                    Every {set.name} product →
                  </Link>
                  <Link href={`/${r.region}/cheapest-packs`} prefetch={false} className="font-semibold text-brand hover:underline">
                    Cheapest packs from every set →
                  </Link>
                </span>
              }
            >
              <PriceTable r={r} caption={`${set.name}: the cheapest booster box, Elite Trainer Box and booster bundle in ${r.inName} today`} lines={linesFor(data.bySet[set.code], CALENDAR_TYPES, set)} />
              <p className="mt-3 text-xs leading-5 text-muted">Each store’s listed price, excluding shipping. Extras such as an ETB’s sleeves and promo card aren’t priced in.</p>
            </LiveBlock>
          </>
        ) : (
          <Note>
            No set’s booster box, ETB or bundle is in stock in {r.inName} right now. The <Link href={`/${r.region}/cheapest-packs`}>cheapest packs page</Link> shows what is.
          </Note>
        ),
      },
      {
        id: "special-etbs",
        title: "Elite Trainer Boxes with more packs",
        body: (
          <>
            <Prose>
              <p>
                {tens.length ? (
                  <>
                    These special sets’ Elite Trainer Boxes hold <strong>{tens[0].packs} packs</strong>, where the other ETBs of their series hold {etbBefore.packs}:
                  </>
                ) : (
                  "Every set’s Elite Trainer Box holds its series’ usual count."
                )}
              </p>
            </Prose>
            <SetChips r={r} sets={tens.map((x) => x.set)} />
            {noCount.length > 0 && (
              <Prose>
                <p>
                  {andList(noCount.map((x) => x.set.name))} ({noCount.map((x) => x.set.releaseDate.slice(0, 4)).join(", ")}) {noCount.length === 1 ? "has" : "have"} no single
                  count: {noCount.length === 1 ? "its" : "their"} Elite Trainer Box holds two different kinds of pack, so we show no price per pack for it.
                </p>
              </Prose>
            )}
          </>
        ),
      },
      {
        id: "varies",
        title: "Why tins and collections have no pack count",
        body: (
          <>
            <Prose>
              <p>
                Tins, collection boxes, Ultra-Premium Collections and decks change from one product to the next. {TYPE_ABOUT.tins} Rather than guess, we compare
                these on their own price and show no price per pack for them.
              </p>
              <p>
                Blisters say their count in the name. A checklane blister that doesn’t say holds one pack in some sets and two in others, so it gets no price per
                pack either.
              </p>
            </Prose>
            <NextLinks
              links={VARIES.filter((t) => t !== "booster-bundle-case")
                .map((t) => ({ href: typeHref(r, t), label: TYPE_BY_KEY.get(t)!.plural }))
                .concat([{ href: typeHref(r, "blister"), label: TYPE_BY_KEY.get("blister")!.plural }])}
            />
          </>
        ),
      },
      whereToBuy(r, {
        tcg: { query: "Booster Box", label: "Pokémon booster boxes" },
        links: [{ href: `/${r.region}/cheapest-packs`, label: "Cheapest per pack" }],
      }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
