// Guide: booster box vs Elite Trainer Box vs booster bundle. What each holds (packs.ts; the extras exactly as type-about.ts words
// them), the price per pack of each for the four newest released sets in the region today, which suits whom (general guidance, no
// value claims), the sets sold without a box (sets.ts), and in the US the MSRP per pack (rrp.ts, with RRP_NOTE).
import Link from "next/link";
import { CALENDAR_TYPES } from "@/lib/data";
import { money } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import { TYPE_ABOUT } from "@/lib/type-about";
import type { GuideData } from "./data";
import { andList, fixedPacks, msrpTables, packsBySeries, seriesPhrase, setsWithoutBox } from "./facts";
import { GUIDE_BY_SLUG } from "./index";
import {
  FactRows,
  GuideBody,
  guideHref,
  Lede,
  LiveBlock,
  linesFor,
  MsrpNote,
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
  Decisions,
  type BodyProps,
  type GuideOutline,
  type GuideSection,
} from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("booster-box-vs-etb-vs-booster-bundle")!;
const TITLE_LINK = "underline decoration-line underline-offset-4 hover:text-brand hover:decoration-brand";

/** "US stores and TCGplayer" / "Australian stores": who the live prices come from. */
export const storesPhrase = (r: RegionInfo) => (r.market === "US" ? "US stores and TCGplayer" : `${r.adjective} stores`);

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const box = fixedPacks("booster-box");
  const bundle = fixedPacks("booster-bundle");
  const [etbNow, etbBefore] = packsBySeries("etb");
  const noBox = setsWithoutBox();
  const sets = data.sets.map(setOf).filter((s): s is NonNullable<typeof s> => !!s);

  const sections: GuideSection[] = [
    {
      id: "whats-inside",
      title: "What’s inside each",
      body: (
        <>
          <FactRows
            rows={[
              {
                key: "booster-box",
                type: "booster-box",
                figure: box,
                unit: "packs",
                title: <Link href={typeHref(r, "booster-box")} className={TITLE_LINK}>Booster box</Link>,
                body: TYPE_ABOUT["booster-boxes"],
              },
              {
                key: "etb",
                type: "etb",
                figure: etbNow.packs,
                unit: "packs",
                title: <Link href={typeHref(r, "etb")} className={TITLE_LINK}>Elite Trainer Box</Link>,
                body: (
                  <>
                    {TYPE_ABOUT["elite-trainer-boxes"]} It’s {etbNow.packs} packs in {seriesPhrase(etbNow.series)} sets, {etbBefore.packs} in {andList(etbBefore.series)} sets.
                  </>
                ),
              },
              {
                key: "booster-bundle",
                type: "booster-bundle",
                figure: bundle,
                unit: "packs",
                title: <Link href={typeHref(r, "booster-bundle")} className={TITLE_LINK}>Booster bundle</Link>,
                body: TYPE_ABOUT["booster-bundles"],
              },
            ]}
          />
          <p className="text-xs leading-5 text-muted">
            {PACK_SOURCE} The full list is in <Link href={guideHref(r, "how-many-packs-in-pokemon-products")} className="font-medium text-brand underline underline-offset-2">how many packs are in each product</Link>.
          </p>
        </>
      ),
    },
    {
      id: "per-pack",
      title: "What a pack costs in each, today",
      live: true,
      body: (
        <>
          <Prose>
            <p>
              For the {sets.length} newest sets out, here’s the cheapest booster box, Elite Trainer Box and booster bundle in stock at {storesPhrase(r)} right now, and what
              each works out to per pack. In each set, the cheapest per pack is marked.
            </p>
          </Prose>
          <LiveBlock r={r} checked={data.checked}>
            {sets.map((s) => (
              <SetGroup key={s.code} title={<SetTitle r={r} set={s} today={data.today} />}>
                <PriceTable r={r} caption={`${s.name}: booster box, Elite Trainer Box and booster bundle in ${r.inName} today, with the price per pack`} lines={linesFor(data.bySet[s.code], CALENDAR_TYPES, s)} />
              </SetGroup>
            ))}
          </LiveBlock>
          <p className="text-xs leading-5 text-muted">
            Each store’s listed price, excluding shipping. An ETB’s extras aren’t priced in: its per-pack price is the whole box divided by its packs.{" "}
            <Link href={`/${r.region}/cheapest-packs`} prefetch={false} className="font-semibold text-brand hover:underline">
              Every set, by price per pack →
            </Link>
          </p>
        </>
      ),
    },
    {
      id: "which-suits-you",
      title: "Which one suits you?",
      body: (
        <>
          <Prose>
            <p>There’s no single right answer: it depends on how many packs you want, whether you’ll play, and how much you want to spend at once.</p>
          </Prose>
          <Decisions
            rows={[
              { when: "You want lots of packs from one set", then: <>A booster box: {box} packs in one go. Compare its price per pack with the others above before you buy.</> },
              {
                when: "You’re starting to play, or buying a gift",
                then: (
                  <>
                    An Elite Trainer Box. Alongside its {etbNow.packs} packs come sleeves, energy cards, dice, condition markers and a storage box, and usually a set-exclusive promo card.
                  </>
                ),
              },
              { when: "You want to try a set without a big spend", then: <>A booster bundle: {bundle} packs, the fewest of the three.</> },
              {
                when: "Price per pack matters most",
                then: <>Check the tables above, set by set: the cheapest per pack is marked, and it depends on what stores charge today.</>,
              },
            ]}
          />
        </>
      ),
    },
    {
      id: "no-booster-box",
      title: "Sets sold without a booster box",
      body: (
        <>
          <Prose>
            <p>
              These {noBox.length} sets were never sold as a {box}-pack booster box: their packs come in other products, such as Elite Trainer Boxes, bundles and
              collections. A “booster box” of one of them is a lot a store has made up itself, so we don’t list it.
            </p>
          </Prose>
          <SetChips r={r} sets={noBox} />
        </>
      ),
    },
  ];

  if (r.market === "US") {
    const [table] = msrpTables();
    const pick = (t: string) => table?.rows.find((x) => x.type === t);
    const rows = ["booster-box", "etb", "pc-etb", "booster-bundle"].map(pick).filter((x): x is NonNullable<typeof x> => !!x);
    const boxRow = pick("booster-box");
    const bundleRow = pick("booster-bundle");
    const etbRow = pick("etb");
    if (table && rows.length) {
      sections.push({
        id: "msrp",
        title: "US MSRP per pack",
        body: (
          <>
            <Prose>
              <p>
                In the US, The Pokémon Company International publishes list prices (MSRP) for {seriesPhrase(table.series)} products. Divided by their packs:
              </p>
            </Prose>
            <div className="card my-6 px-4 py-2 sm:px-5 sm:py-3">
              <StackTable
                caption={`US MSRP per pack, ${seriesPhrase(table.series)} sets`}
                head={["Product", "MSRP", "Packs", "Per pack"]}
                rows={rows.map((x) => ({
                  key: x.type,
                  type: x.type,
                  th: <span className="font-semibold text-ink">{x.label}</span>,
                  cells: [money(x.cents, "US"), String(x.packs ?? "—"), x.perPack != null ? money(x.perPack, "US") : "—"],
                }))}
              />
            </div>
            {boxRow?.perPack != null && bundleRow?.perPack != null && etbRow?.perPack != null && (
              <Prose>
                <p>
                  {boxRow.perPack === bundleRow.perPack
                    ? `At MSRP, a pack costs the same in a box or a bundle (${money(boxRow.perPack, "US")}), and ${money(etbRow.perPack, "US")} in an Elite Trainer Box.`
                    : `At MSRP, a pack costs ${money(boxRow.perPack, "US")} in a box, ${money(bundleRow.perPack, "US")} in a bundle and ${money(etbRow.perPack, "US")} in an Elite Trainer Box.`}{" "}
                  Stores set their own prices; the <Link href={guideHref(r, "pokemon-tcg-msrp")}>MSRP guide</Link> shows where today’s sit against MSRP.
                </p>
              </Prose>
            )}
            <MsrpNote />
          </>
        ),
      });
    }
  }

  sections.push(
    whereToBuy(r, {
      tcg: { query: "Elite Trainer Box", label: "Pokémon Elite Trainer Boxes" },
      links: [{ href: typeHref(r, "etb"), label: "Elite Trainer Boxes" }],
    }),
  );

  return {
    intro: (
      <Lede>
        All three are sealed products from a single set. What separates them is how many packs you get (<strong>{box}</strong>, <strong>{etbNow.packs}</strong> and{" "}
        <strong>{bundle}</strong>), what comes with the packs, and what each pack ends up costing. Here’s how they compare, with today’s prices from {storesPhrase(r)}.
      </Lede>
    ),
    sections,
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
