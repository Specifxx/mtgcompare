// Guide: Commander precon prices. The region's cheapest open Commander decks and deck sets today (more-data.ts openOfType), and how
// many of each are open. No contents claims beyond "a ready-to-play 100-card deck", which every Commander precon is.
import type { RegionInfo } from "@/lib/regions";
import { money, plural } from "@/lib/format";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { Checklist, GuideBody, guideHref, Lede, LiveBlock, NextLinks, storesPhrase, typeHref, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { CardTable, faqSection } from "./kit-more";

const GUIDE = GUIDE_BY_SLUG.get("commander-precon-price-guide")!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const decks = data.byType?.["Commander Deck"] ?? [];
  const sets = data.byType?.["Commander Deck Set"] ?? [];
  const n = data.openByType?.["Commander Deck"] ?? decks.length;
  const low = decks[0] ?? null;
  return {
    intro: (
      <Lede>
        A Commander precon is a ready-to-play 100-card deck for Magic’s most popular multiplayer format. {storesPhrase(r)} have <strong>{plural(n, "Commander deck")}</strong> open
        today{low ? <>, from <strong>{money(low.lowestPriceCents, r.market)}</strong></> : null}.
      </Lede>
    ),
    sections: [
      {
        id: "cheapest-decks",
        title: "The cheapest Commander decks today",
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              <CardTable r={r} caption={`The cheapest Commander decks in ${r.inName} today`} products={decks} perPack={false} />
            </LiveBlock>
            {typeHref(r, "commander-deck") && <NextLinks links={[{ href: typeHref(r, "commander-deck")!, label: `Every Commander deck in ${r.inName}`, icon: "arrow-right" }]} />}
          </>
        ),
      },
      {
        id: "deck-sets",
        title: "Every deck of a release in one product",
        body: (
          <LiveBlock r={r} checked={data.checked}>
            <CardTable r={r} caption={`The cheapest Commander deck sets in ${r.inName} today`} products={sets} perPack={false} empty="No Commander deck set is in stock at the stores we compare right now." />
          </LiveBlock>
        ),
      },
      {
        id: "before-you-buy",
        title: "Before you buy a precon",
        body: (
          <Checklist
            items={[
              <>Check the deck’s name: a release usually has several decks, each with its own commander and price.</>,
              <>A Collector’s Edition of a deck costs more than the regular one; make sure the listing is the one you want.</>,
              <>Compare the same deck across stores: the cheapest is often not the store you know.</>,
              <>Check the wrap when it arrives. See <a href={guideHref(r, "how-to-avoid-resealed-magic-products")}>how to avoid resealed product</a>.</>,
            ]}
          />
        ),
      },
      faqSection([
        { q: `How much is a Commander precon in ${r.inName}?`, a: low ? `From ${money(low.lowestPriceCents, r.market)} today (${low.name}), at the stores MTG Compare checks; ${n} Commander decks are open.` : "None is in stock at the stores we compare right now." },
        { q: "What is in a Commander precon?", a: "A ready-to-play 100-card Commander deck built around a legendary creature, the deck's commander." },
        { q: "What is a Commander Deck Set?", a: "Every Commander deck of one release, sold together as one product." },
      ]),
      whereToBuy(r, { tcg: { query: "Magic Commander Deck", label: "Commander decks" } }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
