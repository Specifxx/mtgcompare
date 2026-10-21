// Guide: what's in a Pokémon Elite Trainer Box. The contents exactly as type-about.ts words them, the pack count by series and the
// special sets (packs.ts through facts.ts), the Pokémon Center ETB's extra packs, the case count, and a live block of the cheapest ETB
// of each of the four newest released sets with its price per pack. In the US, the ETB's MSRP (rrp.ts, with RRP_NOTE).
import Link from "next/link";
import { money } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import { TYPE_ABOUT } from "@/lib/type-about";
import type { GuideData } from "./data";
import { andList, msrpTables, packsBySeries, perCase, seriesPhrase, specialEtbSets } from "./facts";
import { GUIDE_BY_SLUG } from "./index";
import {
  Checklist,
  GuideBody,
  guideHref,
  Lede,
  LiveBlock,
  linesFor,
  MsrpNote,
  NextLinks,
  Note,
  PACK_SOURCE,
  PriceTable,
  Prose,
  SetChips,
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

const GUIDE = GUIDE_BY_SLUG.get("whats-in-a-pokemon-elite-trainer-box")!;

/** "US stores and TCGplayer" / "Australian stores": who the live prices come from. */
const storesPhrase = (r: RegionInfo) => (r.market === "US" ? "US stores and TCGplayer" : `${r.adjective} stores`);

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const etb = packsBySeries("etb");
  const [etbNow] = etb;
  const pc = packsBySeries("pc-etb");
  const [pcNow] = pc;
  const special = specialEtbSets();
  const specialCounted = special.filter((x) => x.packs != null);
  const specialCount = specialCounted[0]?.packs ?? null;
  const noCount = special.filter((x) => x.packs == null).map((x) => x.set);
  const perEtbCase = perCase("etb-case", "etb");
  const sets = data.sets.map(setOf).filter((s): s is NonNullable<typeof s> => !!s);

  const sections: GuideSection[] = [
    {
      id: "contents",
      title: "What comes in the box",
      body: (
        <>
          <Prose>
            <p>
              <strong>{TYPE_ABOUT["elite-trainer-boxes"]}</strong>
            </p>
            <p>
              Every Elite Trainer Box (ETB) is made for one set, so its packs, its promo card and the artwork on the box all belong to that set. The extras are what set it
              apart from a <Link href={typeHref(r, "booster-bundle")}>booster bundle</Link> or a <Link href={typeHref(r, "booster-box")}>booster box</Link>: they’re the things
              a new player needs to sleeve up and play a deck, and the box itself is sized to store cards afterwards.
            </p>
          </Prose>
          <Checklist
            items={[
              <>
                <strong>Booster packs</strong> from the set: {etb.map((row) => `${row.packs} in ${seriesPhrase(row.series)} sets`).join(", ")}.
              </>,
              <>
                <strong>Card sleeves</strong> printed with the box’s artwork.
              </>,
              <>
                <strong>Energy cards</strong>, to build a deck around.
              </>,
              <>
                <strong>Dice and condition markers</strong> for play.
              </>,
              <>
                <strong>A storage box</strong> with dividers, which is the box itself.
              </>,
              <>
                <strong>Usually a set-exclusive promo card.</strong>
              </>,
            ]}
          />
        </>
      ),
    },
    {
      id: "cheapest-today",
      title: "The cheapest Elite Trainer Box of each new set, today",
      live: true,
      body: (
        <>
          <Prose>
            <p>
              For the {sets.length} newest sets out, here’s the cheapest Elite Trainer Box in stock at {storesPhrase(r)} right now, and what it works out to per pack.
            </p>
          </Prose>
          <LiveBlock r={r} checked={data.checked}>
            {sets.map((s) => (
              <SetGroup key={s.code} title={<SetTitle r={r} set={s} today={data.today} />}>
                <PriceTable r={r} caption={`${s.name}: the cheapest Elite Trainer Box in ${r.inName} today, with the price per pack`} lines={linesFor(data.bySet[s.code], ["Elite Trainer Box"], s)} />
              </SetGroup>
            ))}
          </LiveBlock>
          <p className="text-xs leading-5 text-muted">
            Each store’s listed price, excluding shipping. The per-pack price is the whole box divided by its packs; the extras aren’t priced in.{" "}
            <Link href={typeHref(r, "etb")} prefetch={false} className="font-semibold text-brand hover:underline">
              Every Elite Trainer Box in {r.inName} →
            </Link>
          </p>
        </>
      ),
    },
    {
      id: "pack-counts",
      title: "How many packs, set by set",
      body: (
        <>
          <div className="card my-6 px-4 py-2 sm:px-5 sm:py-3">
            <StackTable
              caption="Booster packs in an Elite Trainer Box, by series"
              head={["Series", "Packs"]}
              compact
              rows={etb.map((row) => ({
                key: String(row.packs),
                type: "etb",
                th: <span className="font-semibold text-ink">{seriesPhrase(row.series)}</span>,
                cells: [<span key="n" className="font-semibold">{row.packs}</span>],
              }))}
            />
          </div>
          {specialCount != null && (
            <Prose>
              <p>
                A few special sets break the rule: their Elite Trainer Box holds <strong>{specialCount}</strong> packs.
                {noCount.length > 0 && <> {andList(noCount.map((s) => s.name))} mixes pack sizes, so we show no per-pack price for it.</>}
              </p>
            </Prose>
          )}
          <SetChips r={r} sets={specialCounted.map((x) => x.set)} />
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
      id: "pokemon-center",
      title: "Pokémon Center Elite Trainer Boxes",
      body: (
        <>
          <Prose>
            <p>
              {TYPE_ABOUT["pokemon-center-elite-trainer-boxes"]} In {seriesPhrase(pcNow.series)} sets that’s <strong>{pcNow.packs}</strong> packs against the retail box’s{" "}
              {etbNow.packs}
              {pc[1] ? <>, and {pc[1].packs} in {andList(pc[1].series)} sets</> : null}.
            </p>
          </Prose>
          <NextLinks
            links={[
              { href: typeHref(r, "pc-etb"), label: "Pokémon Center ETBs", icon: "tag" },
              { href: guideHref(r, "pokemon-center-etb-vs-elite-trainer-box"), label: "Pokémon Center ETB vs ETB", icon: "arrow-right" },
            ]}
          />
        </>
      ),
    },
  ];

  if (perEtbCase) {
    sections.push({
      id: "cases",
      title: "Elite Trainer Box cases",
      body: (
        <Prose>
          <p>
            Stores also sell ETBs by the sealed case, straight from the distributor: {perEtbCase} Elite Trainer Boxes to a case. They’re listed apart, on the{" "}
            <Link href={typeHref(r, "etb-case")}>Elite Trainer Box cases</Link> page, so a case is never compared with a single box.
          </p>
        </Prose>
      ),
    });
  }

  if (r.market === "US") {
    const [table] = msrpTables();
    const row = table?.rows.find((x) => x.type === "etb");
    const pcRow = table?.rows.find((x) => x.type === "pc-etb");
    if (table && row) {
      sections.push({
        id: "msrp",
        title: "US MSRP",
        body: (
          <>
            <Prose>
              <p>
                In the US, a {seriesPhrase(table.series, "or")} Elite Trainer Box lists at <strong>{money(row.cents, "US")}</strong>
                {row.perPack != null && <> ({money(row.perPack, "US")} a pack)</>}
                {pcRow && (
                  <>
                    , and a Pokémon Center Elite Trainer Box at <strong>{money(pcRow.cents, "US")}</strong>
                    {pcRow.perPack != null && <> ({money(pcRow.perPack, "US")} a pack)</>}
                  </>
                )}
                . Stores set their own prices: the <Link href={guideHref(r, "pokemon-tcg-msrp")}>MSRP guide</Link> compares today’s with MSRP.
              </p>
            </Prose>
            <MsrpNote />
          </>
        ),
      });
    }
  }

  sections.push({
    id: "worth-it",
    title: "Who an Elite Trainer Box suits",
    body: (
      <>
        <Prose>
          <ul>
            <li>
              <strong>New players.</strong> Sleeves, energy, dice and markers in one box, with packs to start a collection.
            </li>
            <li>
              <strong>Gifts.</strong> It’s one box with everything inside, and the outside is made to be seen.
            </li>
            <li>
              <strong>Collectors of one set.</strong> The set-exclusive promo and the box art are only in that set’s ETB.
            </li>
          </ul>
          <p>
            If packs are all you want, compare the per-pack prices above with a booster box or a bundle of the same set: the{" "}
            <Link href={guideHref(r, "booster-box-vs-etb-vs-booster-bundle")}>booster box vs ETB vs bundle</Link> guide puts them side by side.
          </p>
        </Prose>
        <Note>
          The prices on DexCompare are the stores’ own, compared in {r.currency}. A store’s listing says whether a product is the retail ETB or the Pokémon Center one, and we
          list them apart.
        </Note>
      </>
    ),
  });

  sections.push(
    whereToBuy(r, {
      tcg: { query: "Elite Trainer Box", label: "Pokémon Elite Trainer Boxes" },
      links: [{ href: typeHref(r, "etb"), label: "Elite Trainer Boxes" }],
    }),
  );

  return {
    intro: (
      <Lede>
        A Pokémon Elite Trainer Box holds <strong>{etbNow.packs} booster packs</strong> in {seriesPhrase(etbNow.series)} sets, plus sleeves, energy cards, dice, condition markers, a
        storage box and usually a promo card. Here’s everything inside, the sets that differ, and the cheapest ETB of each new set in {r.inName} today.
      </Lede>
    ),
    sections,
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
