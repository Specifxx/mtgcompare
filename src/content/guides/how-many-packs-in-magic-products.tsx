// Guide: how many packs are in each Magic sealed product. Only the counts that hold for every product of a kind (src/content/live.ts
// FAMILIES: Collector, Draft and Set Booster boxes), the Star Trek contents Wizards lists (src/content/star-trek.ts), and today's
// cheapest box of each kind in the region with its price per pack where the count is known.
import Link from "next/link";
import type { RegionInfo } from "@/lib/regions";
import { FAMILY } from "../families";
import { STAR_TREK_PRODUCTS, WIZARDS_COLLECTING_STAR_TREK } from "../star-trek";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { GuideBody, guideHref, Lede, linesOf, LiveBlock, Note, PriceTable, Prose, StackTable, storesPhrase, whereToBuy, type BodyProps, type GuideOutline } from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("how-many-packs-in-magic-products")!;

export const PACK_ROWS: { product: string; packs: string; note: string }[] = [
  { product: "Play Booster box", packs: "30 or 36", note: "Depends on the set: check the listing. Play Boosters replaced Draft and Set Boosters in 2024." },
  { product: "Collector Booster box", packs: String(FAMILY["collector-box"].packs), note: "Twelve Collector Boosters." },
  { product: "Draft Booster box", packs: String(FAMILY["draft-box"].packs), note: "Sets before Play Boosters." },
  { product: "Set Booster box", packs: String(FAMILY["set-box"].packs), note: "Sets before Play Boosters." },
  { product: "Bundle (Star Trek)", packs: "9", note: "Play Boosters, with basic lands, a promo and a storage box." },
  { product: "Prerelease Pack (Star Trek)", packs: "6", note: "Play Boosters, with a foil rare or mythic rare promo." },
];

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  return {
    intro: (
      <Lede>
        A <strong>Collector Booster box</strong> holds <strong>{FAMILY["collector-box"].packs}</strong> packs. A <strong>Play Booster box</strong> holds 30 or 36,
        depending on the set, and a recent <strong>Bundle</strong> 9 Play Boosters. Here is every common product, and what a pack costs in each at {storesPhrase(r)} today.
      </Lede>
    ),
    sections: [
      {
        id: "counts",
        title: "Packs in each product",
        body: (
          <>
            <div className="card my-6 px-4 py-2 sm:px-5 sm:py-3">
              <StackTable
                caption="Packs in each Magic sealed product"
                head={["Product", "Packs", "Note"]}
                rows={PACK_ROWS.map((x) => ({ key: x.product, th: <span className="font-semibold text-ink">{x.product}</span>, cells: [x.packs, <span key="n" className="text-muted">{x.note}</span>] }))}
              />
            </div>
            <p className="text-xs leading-5 text-muted">
              The Star Trek rows are from{" "}
              <a href={WIZARDS_COLLECTING_STAR_TREK.url} rel="noopener" className="font-medium text-brand underline underline-offset-2">
                {WIZARDS_COLLECTING_STAR_TREK.label}
              </a>
              . Bundles and Prerelease Packs of other sets can differ.
            </p>
          </>
        ),
      },
      {
        id: "per-pack",
        title: "What a pack costs today",
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              <PriceTable
                r={r}
                caption={`The cheapest booster boxes and Bundles in ${r.inName} today, with the price per pack`}
                lines={[
                  ...linesOf(data.rows["play-box"], "Play Booster Box"),
                  ...linesOf(data.rows["collector-box"], "Collector Booster Box"),
                  ...linesOf(data.rows["draft-box"], "Draft Booster Box"),
                  ...linesOf(data.rows["set-box"], "Set Booster Box"),
                  ...linesOf(data.rows.bundle, "Bundle"),
                ]}
              />
            </LiveBlock>
            <p className="text-xs leading-5 text-muted">
              Per pack is the price divided by the packs, shown only where the count is certain. A Bundle’s extras aren’t priced in.{" "}
              <Link href={`/${r.region}/cheapest-packs`} prefetch={false} className="font-semibold text-brand hover:underline">
                Every set, by price per pack →
              </Link>
            </p>
          </>
        ),
      },
      {
        id: "cards-per-pack",
        title: "Cards in each pack",
        body: (
          <>
            <Prose>
              <p>For the Star Trek set, Wizards lists these contents:</p>
              <ul>
                {STAR_TREK_PRODUCTS.filter((p) => p.name === "Play Booster" || p.name === "Collector Booster").map((p) => (
                  <li key={p.name}>
                    <strong>{p.name}:</strong> {p.holds}
                  </li>
                ))}
              </ul>
            </Prose>
            <Note>
              Which booster to buy? See <Link href={guideHref(r, "play-booster-vs-collector-booster-vs-bundle")}>Play Booster vs Collector Booster vs Bundle</Link>.
            </Note>
          </>
        ),
      },
      whereToBuy(r, { tcg: { query: "Magic Play Booster Box", label: "Magic booster boxes" } }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
