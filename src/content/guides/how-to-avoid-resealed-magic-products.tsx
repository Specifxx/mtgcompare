// Guide: how to avoid resealed or fake Magic sealed product. General checks (listing, price, wrap), and today's cheapest boxes in the
// region from the stores we compare, as a reference for what a box typically costs.
import type { RegionInfo } from "@/lib/regions";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { Checklist, GuideBody, Lede, linesOf, LiveBlock, Note, PriceTable, Prose, storesPhrase, whereToBuy, type BodyProps, type GuideOutline } from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("how-to-avoid-resealed-magic-products")!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  return {
    intro: (
      <Lede>
        A resealed box has been opened, searched for its best cards and wrapped again. The safest way to avoid one is to buy from an established store; failing that, check the
        listing, the price and the wrap.
      </Lede>
    ),
    sections: [
      {
        id: "listing",
        title: "Check the listing",
        body: (
          <Checklist
            items={[
              "Photos of the actual box, not only stock images, from a seller with a history of sealed sales.",
              "The product named exactly: the set, the kind of booster (Play, Collector) and the language.",
              "A seller who says how it ships: in a box, with padding, tracked.",
              "Returns accepted if the wrap arrives opened or damaged.",
            ]}
          />
        ),
      },
      {
        id: "price",
        title: "Check the price",
        live: true,
        body: (
          <>
            <Prose>
              <p>A box far below what stores ask is the first warning. For reference, the cheapest boxes in stock at {storesPhrase(r)} today:</p>
            </Prose>
            <LiveBlock r={r} checked={data.checked}>
              <PriceTable r={r} caption={`The cheapest Play and Collector Booster boxes in ${r.inName} today`} lines={[...linesOf(data.rows["play-box"], "Play Booster Box"), ...linesOf(data.rows["collector-box"], "Collector Booster Box")]} />
            </LiveBlock>
          </>
        ),
      },
      {
        id: "wrap",
        title: "Check the wrap",
        body: (
          <>
            <Prose>
              <p>
                Wizards of the Coast shrink-wraps its booster boxes. Look at the wrap when it arrives: loose or baggy plastic, uneven or melted seams, and glue or tape marks
                are all reasons to ask questions before you open it.
              </p>
            </Prose>
            <Note>If something looks wrong, photograph it before opening and contact the seller straight away.</Note>
          </>
        ),
      },
      whereToBuy(r, { tcg: { query: "Magic booster box", label: "Magic booster boxes" } }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
