// Guide: Play vs Collector Booster box, set by set. For each set with both open in the region, the cheapest Play Booster box and the
// cheapest Collector Booster box per pack (more-data.ts playVsCollector; pack counts from lib/packs.ts only). No value claim: the two
// packs hold different things, and the page says so.
import type { RegionInfo } from "@/lib/regions";
import { money } from "@/lib/format";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { GuideBody, guideHref, Lede, LiveBlock, NoneYet, productHref, Prose, StackTable, storesPhrase, typeHref, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { faqSection, SetLink } from "./kit-more";
import { playVsCollector } from "./more-data";
import Link from "@/components/Link";
import { SET_BY_CODE } from "@/lib/sets";

const GUIDE = GUIDE_BY_SLUG.get("play-vs-collector-booster-box-value-by-set")!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const pairs = playVsCollector(data.byType?.["Play Booster Box"] ?? [], data.byType?.["Collector Booster Box"] ?? []);
  const m = (c: number) => money(c, r.market);
  const ratios = pairs.map((x) => x.collector!.perPack / x.play!.perPack);
  const lo = ratios.length ? Math.min(...ratios) : null;
  const hi = ratios.length ? Math.max(...ratios) : null;
  const times = (x: number) => `${x.toFixed(1)}×`;
  return {
    intro: (
      <Lede>
        {pairs.length && lo != null && hi != null ? (
          <>
            Across the {pairs.length} sets with both boxes in stock at {storesPhrase(r)} today, a Collector Booster costs <strong>{times(lo)} to {times(hi)}</strong> what a Play
            Booster does, bought by the box. Here is each set side by side.
          </>
        ) : (
          <>A Collector Booster box holds 12 premium packs; a Play Booster box 30 or 36 packs to play with. Here is what a pack of each costs, set by set, at {storesPhrase(r)} today.</>
        )}
      </Lede>
    ),
    sections: [
      {
        id: "by-set",
        title: "Price per pack, set by set",
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              {pairs.length ? (
                <StackTable
                  caption={`Play Booster box and Collector Booster box price per pack by set in ${r.inName} today`}
                  head={["Set", "Play per pack", "Collector per pack", "Collector ÷ Play"]}
                  rows={pairs.map((x) => ({
                    key: x.code,
                    th: <SetLink r={r} slug={SET_BY_CODE.get(x.code)!.slug}>{x.name}</SetLink>,
                    cells: [
                      <Link key="p" href={productHref(r, x.play!.p)} prefetch={false} className="text-brand underline-offset-2 hover:underline">
                        {m(x.play!.perPack)} <span className="text-muted">({x.play!.packs} packs, {m(x.play!.p.lowestPriceCents ?? 0)})</span>
                      </Link>,
                      <Link key="c" href={productHref(r, x.collector!.p)} prefetch={false} className="text-brand underline-offset-2 hover:underline">
                        {m(x.collector!.perPack)} <span className="text-muted">(12 packs, {m(x.collector!.p.lowestPriceCents ?? 0)})</span>
                      </Link>,
                      <span key="x">{times(x.collector!.perPack / x.play!.perPack)}</span>,
                    ],
                  }))}
                />
              ) : (
                <NoneYet>No set has both a Play Booster box and a Collector Booster box in stock at the stores we compare right now.</NoneYet>
              )}
            </LiveBlock>
            <p className="text-xs leading-5 text-muted">Each box’s cheapest listed price, excluding shipping, divided by its packs. Sets sold before Play Boosters (Draft and Set Booster boxes) are not in this table.</p>
          </>
        ),
      },
      {
        id: "what-differs",
        title: "What the extra money buys",
        body: (
          <Prose>
            <p>
              A Play Booster is built for playing: drafting, sealed and opening for fun. A Collector Booster is built around special versions of the set’s cards (foils and
              alternate frames), so a pack costs more and holds fewer cards to play with. Which suits you depends on what you want from the box, not on a price per pack. See{" "}
              <a href={guideHref(r, "is-a-collector-booster-box-worth-it")}>is a Collector Booster box worth it?</a> and{" "}
              <a href={guideHref(r, "play-booster-vs-collector-booster-vs-bundle")}>Play Booster vs Collector Booster vs Bundle</a>.
            </p>
          </Prose>
        ),
      },
      faqSection([
        { q: "How many packs are in a Collector Booster box?", a: "12 Collector Boosters." },
        { q: "How many packs are in a Play Booster box?", a: "36 for the first Play Booster sets (Murders at Karlov Manor to Innistrad Remastered) and 30 from Aetherdrift on." },
        { q: `How much more does a Collector Booster cost than a Play Booster in ${r.inName}?`, a: lo != null && hi != null ? `By the box, at the stores MTG Compare checks today, ${times(lo)} to ${times(hi)} as much a pack, depending on the set.` : "It depends on the set and the store; the table above shows it set by set when both boxes are in stock." },
      ]),
      whereToBuy(r, {
        tcg: { query: "Magic Collector Booster Box", label: "Collector Booster boxes" },
        links: [
          { href: typeHref(r, "play-booster-box") ?? `/${r.region}/sealed`, label: "Play Booster boxes" },
          { href: typeHref(r, "collector-booster-box") ?? `/${r.region}/sealed`, label: "Collector Booster boxes" },
        ],
      }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
