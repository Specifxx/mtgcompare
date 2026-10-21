// Guide: Pokémon Center Elite Trainer Box vs the retail Elite Trainer Box. What each holds (type-about.ts, packs.ts through facts.ts),
// a live block of the three newest released sets with a Pokémon Center ETB count: the cheapest open box of each kind and its price per
// pack, the cheaper per pack marked. In the US, both MSRPs (rrp.ts, with RRP_NOTE). No value claims: the reader decides.
import Link from "next/link";
import { money } from "@/lib/format";
import { packsFor } from "@/lib/packs";
import type { RegionInfo } from "@/lib/regions";
import { TYPE_ABOUT } from "@/lib/type-about";
import type { GuideData } from "./data";
import { andList, msrpTables, packsBySeries, regularSet, seriesPhrase } from "./facts";
import { GUIDE_BY_SLUG } from "./index";
import {
  Decisions,
  FactRows,
  GuideBody,
  guideHref,
  Lede,
  LiveBlock,
  linesFor,
  MsrpNote,
  Note,
  PACK_SOURCE,
  PriceTable,
  Prose,
  SetGroup,
  SetTitle,
  setOf,
  StackTable,
  typeHref,
  whereToBuy,
  type BodyProps,
  type GuideOutline,
  type GuideSection,
} from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("pokemon-center-etb-vs-elite-trainer-box")!;
const TITLE_LINK = "underline decoration-line underline-offset-4 hover:text-brand hover:decoration-brand";
const LABELS = ["Elite Trainer Box", "Pokémon Center Elite Trainer Box"];

const storesPhrase = (r: RegionInfo) => (r.market === "US" ? "US stores and TCGplayer" : `${r.adjective} stores`);

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const [etbNow] = packsBySeries("etb");
  const pc = packsBySeries("pc-etb");
  const [pcNow] = pc;
  const extra = pcNow.packs - etbNow.packs;
  const sets = data.sets.map(setOf).filter((s): s is NonNullable<typeof s> => !!s);

  const sections: GuideSection[] = [
    {
      id: "difference",
      title: "The difference, in short",
      body: (
        <>
          <FactRows
            rows={[
              {
                key: "etb",
                type: "etb",
                figure: etbNow.packs,
                unit: "packs",
                title: (
                  <Link href={typeHref(r, "etb")} className={TITLE_LINK}>
                    Elite Trainer Box
                  </Link>
                ),
                body: <>{TYPE_ABOUT["elite-trainer-boxes"]} Sold by stores everywhere.</>,
              },
              {
                key: "pc-etb",
                type: "pc-etb",
                figure: pcNow.packs,
                unit: "packs",
                title: (
                  <Link href={typeHref(r, "pc-etb")} className={TITLE_LINK}>
                    Pokémon Center Elite Trainer Box
                  </Link>
                ),
                body: TYPE_ABOUT["pokemon-center-elite-trainer-boxes"],
              },
            ]}
          />
          <Prose>
            <p>
              So in {seriesPhrase(pcNow.series)} sets, the Pokémon Center box has <strong>{extra} more packs</strong> than the retail one
              {pc[1] && <> ({pc[1].packs} against {packsFor("etb", regularSet(pc[1].series[0])?.code ?? null)} in {andList(pc[1].series)} sets)</>}. Both are made for one set and carry the
              same kind of accessories; the Pokémon Center box’s promo card is stamped.
            </p>
          </Prose>
          <p className="text-xs leading-5 text-muted">{PACK_SOURCE}</p>
        </>
      ),
    },
    {
      id: "per-pack-today",
      title: "What a pack costs in each, today",
      live: true,
      body: (
        <>
          <Prose>
            <p>
              For the {sets.length} newest sets with both, here’s the cheapest of each box in stock at {storesPhrase(r)} right now. In each set, the cheaper per pack is marked.
            </p>
          </Prose>
          <LiveBlock r={r} checked={data.checked}>
            {sets.map((s) => (
              <SetGroup key={s.code} title={<SetTitle r={r} set={s} today={data.today} />}>
                <PriceTable r={r} caption={`${s.name}: the cheapest Elite Trainer Box and Pokémon Center Elite Trainer Box in ${r.inName} today`} lines={linesFor(data.bySet[s.code], LABELS, s)} />
              </SetGroup>
            ))}
          </LiveBlock>
          <p className="text-xs leading-5 text-muted">
            Each store’s listed price, excluding shipping. Per pack is the whole box divided by its packs: the promo and accessories aren’t priced in.
          </p>
        </>
      ),
    },
    {
      id: "which",
      title: "Which one to buy",
      body: (
        <Decisions
          rows={[
            { when: "You want the most packs per box", then: <>The Pokémon Center box: {pcNow.packs} packs against {etbNow.packs}. Check the per-pack prices above, set by set.</> },
            { when: "You want the stamped promo", then: <>Only the Pokémon Center box has it.</> },
            { when: "You want the easiest one to find", then: <>The retail Elite Trainer Box: it’s the one sold in shops, so there are usually more prices to compare.</> },
            {
              when: "You want the lowest spend",
              then: (
                <>
                  The retail ETB costs less as a box. For fewer packs still, a <Link href={typeHref(r, "booster-bundle")}>booster bundle</Link> holds six.
                </>
              ),
            },
          ]}
        />
      ),
    },
  ];

  if (r.market === "US") {
    const [table] = msrpTables();
    const etbRow = table?.rows.find((x) => x.type === "etb");
    const pcRow = table?.rows.find((x) => x.type === "pc-etb");
    if (table && etbRow && pcRow) {
      sections.push({
        id: "msrp",
        title: "US MSRP of each",
        body: (
          <>
            <div className="card my-6 px-4 py-2 sm:px-5 sm:py-3">
              <StackTable
                caption={`US MSRP of the Elite Trainer Box and Pokémon Center Elite Trainer Box, ${seriesPhrase(table.series)} sets`}
                head={["Product", "MSRP", "Packs", "Per pack"]}
                rows={[etbRow, pcRow].map((x) => ({
                  key: x.type,
                  type: x.type,
                  th: <span className="font-semibold text-ink">{x.label}</span>,
                  cells: [money(x.cents, "US"), String(x.packs ?? "—"), x.perPack != null ? money(x.perPack, "US") : "—"],
                }))}
              />
            </div>
            <Prose>
              <p>
                List prices for {seriesPhrase(table.series)} sets. The <Link href={guideHref(r, "pokemon-tcg-msrp")}>MSRP guide</Link> has every product.
              </p>
            </Prose>
            <MsrpNote />
          </>
        ),
      });
    }
  }

  sections.push({
    id: "spotting",
    title: "Telling them apart in a listing",
    body: (
      <>
        <Prose>
          <p>
            The box says “Pokémon Center” on it, and stores name it in the title. DexCompare files the two as different products, so a Pokémon Center box is never compared
            with a retail one, and the per-pack prices above each use their own pack count.
          </p>
        </Prose>
        <Note>
          A listing that doesn’t say which one it is? Ask the store before you buy. The <Link href={guideHref(r, "whats-in-a-pokemon-elite-trainer-box")}>Elite Trainer Box guide</Link>{" "}
          lists everything that comes in the box.
        </Note>
      </>
    ),
  });

  sections.push(
    whereToBuy(r, {
      tcg: { query: "Pokemon Center Elite Trainer Box", label: "Pokémon Center Elite Trainer Boxes" },
      links: [
        { href: typeHref(r, "pc-etb"), label: "Pokémon Center ETBs" },
        { href: typeHref(r, "etb"), label: "Elite Trainer Boxes" },
      ],
    }),
  );

  return {
    intro: (
      <Lede>
        A Pokémon Center Elite Trainer Box holds <strong>{pcNow.packs} booster packs</strong> to the retail box’s <strong>{etbNow.packs}</strong> in {seriesPhrase(pcNow.series)} sets,
        and adds a stamped promo. Here’s the full difference, and what a pack costs in each in {r.inName} today.
      </Lede>
    ),
    sections,
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
