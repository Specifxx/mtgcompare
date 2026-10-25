// Guide (AU only): Commander precon decks in Australia. "Best" is read the only way our data can answer it: the cheapest decks in stock
// at Australian stores today, and the decks the most stores have in stock. No claims about a deck's strength or contents beyond "a
// ready-to-play 100-card deck", which every Commander precon is. Each row has its MTG Compare page and an Amazon AU link (no Amazon
// price or stock: we do not read Amazon).
import { AmazonNote } from "@/components/Amazon";
import type { RegionInfo } from "@/lib/regions";
import { money, plural } from "@/lib/format";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG, type GuideSlug } from "./index";
import { Checklist, GuideBody, guideHref, Lede, LiveBlock, NextLinks, Prose, storesPhrase, typeHref, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { CardTable, faqSection } from "./kit-more";

const SLUG: GuideSlug = "best-commander-precons-australia";
const GUIDE = GUIDE_BY_SLUG.get(SLUG)!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const page = `/${r.region}/guides/${SLUG}`;
  const decks = data.byType?.["Commander Deck"] ?? [];
  const sets = data.byType?.["Commander Deck Set"] ?? [];
  const n = data.openByType?.["Commander Deck"] ?? decks.length;
  const low = decks[0] ?? null;
  const wide = [...decks].sort((a, b) => b.inStockStores - a.inStockStores || (a.lowestPriceCents ?? 0) - (b.lowestPriceCents ?? 0)).slice(0, 6);
  const top = wide[0] ?? null;
  return {
    intro: (
      <Lede>
        A Commander precon is a ready-to-play 100-card deck for Magic’s most popular multiplayer format. {storesPhrase(r)} have <strong>{plural(n, "Commander deck")}</strong> in stock
        or on pre-order today{low ? <>, from <strong>{money(low.lowestPriceCents, r.market)}</strong></> : null}. Below: the cheapest decks, the decks the most stores carry, and
        what to check before you buy. Prices are each store’s own in AUD, before shipping.
      </Lede>
    ),
    sections: [
      {
        id: "cheapest",
        title: "The cheapest Commander decks in Australia today",
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked} footer={<AmazonNote />}>
              <CardTable r={r} caption="The cheapest Commander decks in Australia today" products={decks.slice(0, 10)} perPack={false} amazonPage={page} />
            </LiveBlock>
            {typeHref(r, "commander-deck") && <NextLinks links={[{ href: typeHref(r, "commander-deck")!, label: "Every Commander deck in Australia", icon: "arrow-right" }]} />}
          </>
        ),
      },
      {
        id: "most-stocked",
        title: "The decks the most stores have in stock",
        body: (
          <>
            <Prose>
              <p>
                A deck many stores carry is easy to compare and usually easy to get. These are the cheapest {decks.length} decks we read, ordered by how many Australian
                stores have each in stock today.
              </p>
            </Prose>
            <LiveBlock r={r} checked={data.checked} footer={<AmazonNote />}>
              <CardTable r={r} caption="Commander decks in stock at the most Australian stores today" products={wide} perPack={false} amazonPage={page} />
            </LiveBlock>
          </>
        ),
      },
      {
        id: "deck-sets",
        title: "Every deck of a release in one product",
        body: (
          <LiveBlock r={r} checked={data.checked} footer={sets.length ? <AmazonNote /> : undefined}>
            <CardTable r={r} caption="The cheapest Commander deck sets in Australia today" products={sets.slice(0, 5)} perPack={false} amazonPage={page} empty="No Commander deck set is in stock at the Australian stores we compare right now." />
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
              <>Compare the same deck across stores on its MTG Compare page, and add delivery: the prices here are before shipping.</>,
              <>Amazon Australia may list the deck too: check its price and seller on Amazon’s own page. We do not show Amazon prices.</>,
              <>Check the wrap when it arrives. See <a href={guideHref(r, "how-to-avoid-resealed-magic-products")}>how to avoid resealed product</a>.</>,
            ]}
          />
        ),
      },
      faqSection([
        { q: "How much is a Commander precon in Australia?", a: low ? `From ${money(low.lowestPriceCents, r.market)} today (${low.name}) at the Australian stores MTG Compare checks; ${n} Commander decks are in stock or on pre-order.` : "None is in stock at the Australian stores we compare right now." },
        { q: "Which Commander deck do the most Australian stores stock?", a: top ? `Of the decks we read today, ${top.name}: ${top.inStockStores} stores have it in stock.` : "None is in stock at the Australian stores we compare right now." },
        { q: "Can I buy Commander decks on Amazon Australia?", a: "Amazon Australia lists some Magic products. We link to it but do not check its prices or stock, so compare its price on Amazon's own page." },
        { q: "What is in a Commander precon?", a: "A ready-to-play 100-card Commander deck built around a legendary creature, the deck's commander." },
      ]),
      whereToBuy(r, { links: [{ href: guideHref(r, "commander-precon-price-guide"), label: "Commander precon price guide" }] }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
