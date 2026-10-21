// Guide: is a Collector Booster box worth it? No value claim: what a box holds (12 packs; Star Trek's contents as Wizards lists them),
// what a pack costs in the region's cheapest boxes today against the cheapest loose Collector Boosters, and the questions to ask.
import Link from "next/link";
import type { RegionInfo } from "@/lib/regions";
import { FAMILY } from "../families";
import { STAR_TREK_PRODUCTS, WIZARDS_COLLECTING_STAR_TREK } from "../star-trek";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { Checklist, GuideBody, guideHref, Lede, linesOf, LiveBlock, PriceTable, Prose, storesPhrase, whereToBuy, type BodyProps, type GuideOutline } from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("is-a-collector-booster-box-worth-it")!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const n = FAMILY["collector-box"].packs;
  const holds = STAR_TREK_PRODUCTS.find((p) => p.name === "Collector Booster")!.holds;
  return {
    intro: (
      <Lede>
        A Collector Booster box is <strong>{n} Collector Boosters</strong>, Magic’s premium pack. Whether one is worth it depends on what you want from it; what we can show is
        what each pack costs in a box at {storesPhrase(r)} today, against buying the packs loose.
      </Lede>
    ),
    sections: [
      {
        id: "whats-inside",
        title: "What’s in a Collector Booster",
        body: (
          <Prose>
            <p>
              For the Star Trek set, Wizards lists a Collector Booster as {holds.charAt(0).toLowerCase() + holds.slice(1)} (
              <a href={WIZARDS_COLLECTING_STAR_TREK.url} rel="noopener">
                {WIZARDS_COLLECTING_STAR_TREK.label}
              </a>
              ). Other sets follow the same idea, with their own treatments.
            </p>
          </Prose>
        ),
      },
      {
        id: "box-vs-packs",
        title: "A box against loose packs, today",
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              <PriceTable
                r={r}
                caption={`The cheapest Collector Booster boxes and loose Collector Boosters in ${r.inName} today`}
                lines={[...linesOf(data.rows["collector-box"], "Collector Booster Box"), ...linesOf(data.rows["collector-pack"], "Collector Booster pack")]}
              />
            </LiveBlock>
            <p className="text-xs leading-5 text-muted">Each store’s listed price, excluding shipping. Rows can be from different sets: compare a box with packs of the same set.</p>
          </>
        ),
      },
      {
        id: "questions",
        title: "Questions to ask before you buy",
        body: (
          <Checklist
            items={[
              <>Do you want the special versions of the cards, or cards to play with? For play, <Link href={guideHref(r, "play-booster-vs-collector-booster-vs-bundle")}>Play Boosters</Link> cost far less a pack.</>,
              <>Is there one card you are after? Buying that single is usually cheaper than opening packs for it.</>,
              <>What does a pack cost in the box against loose packs of the same set? The table above and each set’s page show both.</>,
              <>Is the box sealed by Wizards? See <Link href={guideHref(r, "how-to-avoid-resealed-magic-products")}>how to avoid resealed product</Link>.</>,
            ]}
          />
        ),
      },
      whereToBuy(r, { tcg: { query: "Magic Collector Booster Box", label: "Collector Booster boxes" } }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
