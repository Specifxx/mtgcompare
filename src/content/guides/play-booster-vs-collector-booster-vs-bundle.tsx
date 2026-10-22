// Guide: Play Booster vs Collector Booster vs Bundle. What each holds (Wizards' own product listing for the newest set, Star Trek:
// src/content/star-trek.ts), what each costs in the region today (the cheapest open boxes, Bundles and loose packs), and which suits
// whom (general guidance, no value claims).
import Link from "@/components/Link";
import { FAMILY } from "../families";
import { STAR_TREK_PRODUCTS, WIZARDS_COLLECTING_STAR_TREK } from "../star-trek";
import { GUIDE_BY_SLUG } from "./index";
import { Decisions, FactRows, GuideBody, guideHref, Lede, linesOf, LiveBlock, Note, PriceTable, Prose, storesPhrase, whereToBuy, type BodyProps, type GuideOutline, type GuideSection } from "./kit";
import type { GuideData } from "./data";
import type { RegionInfo } from "@/lib/regions";

const GUIDE = GUIDE_BY_SLUG.get("play-booster-vs-collector-booster-vs-bundle")!;
const holds = (name: string) => STAR_TREK_PRODUCTS.find((p) => p.name === name)!.holds;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const sections: GuideSection[] = [
    {
      id: "whats-inside",
      title: "What’s inside each",
      body: (
        <>
          <Prose>
            <p>
              What a booster holds changes a little from set to set. Here is what Wizards of the Coast lists for the newest set, Star Trek, as an example of each:
            </p>
          </Prose>
          <FactRows
            rows={[
              { key: "play", figure: 14, unit: "cards", title: "Play Booster", body: holds("Play Booster") },
              { key: "collector", figure: 15, unit: "cards", title: "Collector Booster", body: holds("Collector Booster") },
              { key: "bundle", figure: 9, unit: "packs", title: "Bundle", body: holds("Bundle") },
            ]}
          />
          <p className="text-xs leading-5 text-muted">
            Contents from{" "}
            <a href={WIZARDS_COLLECTING_STAR_TREK.url} className="font-medium text-brand underline underline-offset-2" rel="noopener">
              {WIZARDS_COLLECTING_STAR_TREK.label}
            </a>
            . Other sets differ in the details; the product listing of each set says what its boosters hold.
          </p>
        </>
      ),
    },
    {
      id: "today",
      title: "What each costs today",
      live: true,
      body: (
        <>
          <Prose>
            <p>
              The cheapest boxes, Bundles and loose packs in stock at {storesPhrase(r)} right now, of any set. A Collector Booster box holds {FAMILY["collector-box"].packs}{" "}
              packs; a Play Booster box’s count depends on the set, so its per-pack price shows only where the listing states it.
            </p>
          </Prose>
          <LiveBlock r={r} checked={data.checked}>
            <PriceTable
              r={r}
              caption={`Play Booster boxes, Collector Booster boxes, Bundles and loose packs in ${r.inName} today`}
              lines={[
                ...linesOf(data.rows["play-box"], "Play Booster Box"),
                ...linesOf(data.rows["collector-box"], "Collector Booster Box"),
                ...linesOf(data.rows.bundle, "Bundle"),
                ...linesOf(data.rows["play-pack"], "Play Booster pack"),
                ...linesOf(data.rows["collector-pack"], "Collector Booster pack"),
              ]}
            />
          </LiveBlock>
          <p className="text-xs leading-5 text-muted">Each store’s listed price, excluding shipping. The cheapest of each kind can be from different sets.</p>
        </>
      ),
    },
    {
      id: "which-suits-you",
      title: "Which one suits you?",
      body: (
        <>
          <Prose>
            <p>There’s no single right answer: it depends on whether you’ll play with the cards, how many packs you want, and how much you want to spend at once.</p>
          </Prose>
          <Decisions
            rows={[
              { when: "You want to draft or play Limited", then: <>Play Boosters. Wizards designs them to be opened and played with; a box gives a group enough packs for a draft night.</> },
              { when: "You want the special versions of cards", then: <>Collector Boosters: every card in one is a foil or a special treatment, and each pack costs several times a Play Booster.</> },
              { when: "You want a few packs and some extras", then: <>A Bundle: 9 Play Boosters with basic lands, a promo card, a life counter and a storage box.</> },
              { when: "Price per pack matters most", then: <>Compare the per-pack column above, and the <Link href={`/${r.region}/cheapest-packs`}>cheapest per pack</Link> page, set by set.</> },
            ]}
          />
          <Note>
            Opening packs is a gamble on which cards you get. If you want one particular card, buying that single is usually the cheaper way to get it. More on pack counts in{" "}
            <Link href={guideHref(r, "how-many-packs-in-magic-products")}>how many packs are in each product</Link>.
          </Note>
        </>
      ),
    },
    whereToBuy(r, { tcg: { query: "Magic Collector Booster Box", label: "Magic booster boxes" } }),
  ];
  return {
    intro: (
      <Lede>
        A <strong>Play Booster</strong> is the everyday pack you draft and play with, a <strong>Collector Booster</strong> is a premium pack made of foils and special
        versions of cards, and a <strong>Bundle</strong> is a gift box of Play Boosters with extras. Here’s how they compare, with today’s prices from {storesPhrase(r)}.
      </Lede>
    ),
    sections,
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
