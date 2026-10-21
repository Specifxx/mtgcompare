// Guide: are Pokémon booster boxes worth it? No value or expected-value claim: the guide shows the arithmetic, within one set at a
// time (packs from different sets are priced differently), for the three newest released sets that have a booster box: the box
// against a bundle, a sleeved booster and a loose pack of the same set, per pack, today. In the US, the MSRP identity 36 × pack.
import Link from "next/link";
import { money } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import { usMsrpCents } from "@/lib/rrp";
import { TYPE_BY_LABEL } from "@/lib/sealed-title";
import { BOX_GUIDE_TYPES, type GuideData } from "./data";
import { fixedPacks, msrpTables, packsBySeries, regularSet, seriesPhrase } from "./facts";
import { GUIDE_BY_SLUG } from "./index";
import {
  Decisions,
  GuideBody,
  guideHref,
  Lede,
  LiveBlock,
  linesFor,
  MsrpNote,
  perPackOf,
  PriceTable,
  Prose,
  SetGroup,
  SetTitle,
  setOf,
  typeHref,
  whereToBuy,
  type BodyProps,
  type GuideOutline,
  type GuideSection,
  type PriceLine,
} from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("are-pokemon-booster-boxes-worth-it")!;

const label = (l: PriceLine) => (TYPE_BY_LABEL.get(l.label)?.label ?? l.label).toLowerCase();

/** One sentence per set: what a pack costs in the box against the cheapest other way to buy the same set's packs, right now. */
export function boxVerdict(lines: PriceLine[], setName: string, r: RegionInfo): string {
  const box = lines.find((l) => l.label === "Booster Box");
  const boxPP = box?.p ? perPackOf(box.p).perPack : null;
  const others = lines
    .filter((l) => l.label !== "Booster Box" && l.p)
    .map((l) => ({ l, pp: perPackOf(l.p!).perPack }))
    .filter((x): x is { l: PriceLine; pp: number } => x.pp != null)
    .sort((a, b) => a.pp - b.pp);
  if (boxPP == null) return `No ${setName} booster box is in stock in ${r.inName} right now.`;
  const best = others[0];
  if (!best) return `Right now a pack costs ${money(boxPP, r.market)} in the ${setName} box, and no bundle or single pack of the set is in stock to compare it with.`;
  if (boxPP < best.pp)
    return `Right now a pack costs ${money(boxPP, r.market)} in the box: ${money(best.pp - boxPP, r.market)} less than the cheapest ${label(best.l)} (${money(best.pp, r.market)} a pack).`;
  if (boxPP === best.pp) return `Right now a pack costs ${money(boxPP, r.market)} in the box, the same as in the cheapest ${label(best.l)}.`;
  return `Right now the cheapest ${label(best.l)} works out at ${money(best.pp, r.market)} a pack, ${money(boxPP - best.pp, r.market)} less than the box (${money(boxPP, r.market)} a pack).`;
}

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const box = fixedPacks("booster-box");
  const [etbNow] = packsBySeries("etb");
  const sets = data.sets.map(setOf).filter((s): s is NonNullable<typeof s> => !!s);

  const sections: GuideSection[] = [
    {
      id: "whats-in-a-box",
      title: "What a booster box includes, and what it doesn’t",
      body: (
        <>
          <Prose>
            <ul>
              <li>
                <strong>{box} booster packs</strong>, all from one set. Every box we compare is the full English display box.
              </li>
              <li>
                <strong>Nothing else.</strong> No sleeves, dice, energy cards or promo card: those come with an{" "}
                <Link href={typeHref(r, "etb")}>Elite Trainer Box</Link>, alongside its {etbNow.packs} packs.
              </li>
              <li>
                <strong>No particular card.</strong> The cards in each pack are random, and a box doesn’t promise any one card.
              </li>
            </ul>
            <p>
              Some sets were never sold as a booster box at all. They’re listed in{" "}
              <Link href={`${guideHref(r, "booster-box-vs-etb-vs-booster-bundle")}#no-booster-box`}>booster box vs ETB vs booster bundle</Link>.
            </p>
          </Prose>
        </>
      ),
    },
    {
      id: "per-pack",
      title: "Box or packs? The price per pack, set by set",
      live: true,
      body: (
        <>
          <Prose>
            <p>
              Packs from different sets are priced differently, so the fair comparison is within one set. For the {sets.length} newest sets with a booster box, here’s
              the cheapest box, booster bundle, sleeved booster and loose pack in stock in {r.inName} right now, per pack.
            </p>
          </Prose>
          <LiveBlock r={r} checked={data.checked}>
            {sets.map((s) => {
              const lines = linesFor(data.bySet[s.code], BOX_GUIDE_TYPES, s);
              return (
                <SetGroup key={s.code} title={<SetTitle r={r} set={s} today={data.today} />}>
                  <p className="mb-2 text-[15px] leading-6 text-ink/90">{boxVerdict(lines, s.name, r)}</p>
                  <PriceTable r={r} caption={`${s.name}: booster box, bundle, sleeved booster and loose pack in ${r.inName} today, per pack`} lines={lines} />
                </SetGroup>
              );
            })}
          </LiveBlock>
          <p className="text-xs leading-5 text-muted">
            Each store’s listed price, excluding shipping, so delivery can change the sums.{" "}
            <Link href={`/${r.region}/cheapest-packs`} prefetch={false} className="font-semibold text-brand hover:underline">
              Cheapest packs from every set →
            </Link>
          </p>
        </>
      ),
    },
  ];

  if (r.market === "US") {
    const [table] = msrpTables();
    const s = table ? regularSet(table.series[0]) : null;
    const pack = s ? usMsrpCents("booster-pack", s.code) : null;
    const boxMsrp = s ? usMsrpCents("booster-box", s.code) : null;
    if (table && pack != null && boxMsrp != null && box != null) {
      sections.push({
        id: "msrp",
        title: "The US list price",
        body: (
          <>
            <Prose>
              <p>
                In the US, the MSRP of a {seriesPhrase(table.series, "or")} booster box is <strong>{money(boxMsrp, "US")}</strong>
                {boxMsrp === box * pack ? (
                  <>
                    : exactly {box} × {money(pack, "US")}, the MSRP of a single pack. At list price, a box costs the same per pack as {box} single packs, so any difference
                    you see comes from what each store charges.
                  </>
                ) : (
                  <>, and a single pack’s is {money(pack, "US")}.</>
                )}
              </p>
            </Prose>
            <MsrpNote />
          </>
        ),
      });
    }
  }

  sections.push(
    {
      id: "decide",
      title: "How to decide",
      body: (
        <Decisions
          rows={[
            { when: "You want to open a lot of one set", then: <>A box gives you {box} packs at once. Check its price per pack against the bundle and single packs above.</> },
            {
              when: "You want sleeves, dice and a promo too",
              then: (
                <>
                  Look at an Elite Trainer Box instead: <Link href={guideHref(r, "booster-box-vs-etb-vs-booster-bundle")}>booster box vs ETB vs booster bundle</Link> compares them.
                </>
              ),
            },
            { when: "You’d rather spend less at once", then: <>A booster bundle ({fixedPacks("booster-bundle")} packs) or a few single packs.</> },
            { when: "You’re after one particular card", then: <>Packs are random, and a box doesn’t promise any card.</> },
            {
              when: "Your set has no booster box",
              then: (
                <>
                  Look at its <Link href={typeHref(r, "etb")}>Elite Trainer Boxes</Link>, <Link href={typeHref(r, "booster-bundle")}>bundles</Link> and{" "}
                  <Link href={typeHref(r, "collection")}>collections</Link> instead.
                </>
              ),
            },
          ]}
        />
      ),
    },
    whereToBuy(r, {
      tcg: { query: "Booster Box", label: "Pokémon booster boxes" },
      links: [{ href: typeHref(r, "booster-box"), label: "Booster boxes in stock" }],
    }),
  );

  return {
    intro: (
      <Lede>
        Whether a box is worth it comes down to what you want from it, and the cards inside any pack are random. What we can show is the arithmetic: what one pack costs
        when you buy a box, against a bundle or single packs of the same set, in {r.inName} today.
      </Lede>
    ),
    sections,
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
