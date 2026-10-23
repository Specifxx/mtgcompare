// Guide: Secret Lair drops explained. What a drop is (only what is certain: Wizards sells them direct for a set window, and stores
// resell them), and the region's cheapest and dearest open drops today, with how many are open (more-data.ts openOfType).
import type { RegionInfo } from "@/lib/regions";
import { money, plural } from "@/lib/format";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { GuideBody, guideHref, Lede, LiveBlock, NextLinks, Prose, storesPhrase, typeHref, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { CardTable, faqSection } from "./kit-more";

const GUIDE = GUIDE_BY_SLUG.get("secret-lair-drops-explained")!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const cheap = data.byType?.cheapest ?? [];
  const dear = data.byType?.dearest ?? [];
  const n = data.openByType?.["Secret Lair Drop"] ?? cheap.length;
  return {
    intro: (
      <Lede>
        A Secret Lair drop is a small, themed set of Magic cards that Wizards of the Coast sells directly, for a set window, through its Secret Lair store. Stores sell them
        too: {storesPhrase(r)} have <strong>{plural(n, "Secret Lair drop")}</strong> open today{cheap[0] ? <>, from {money(cheap[0].lowestPriceCents, r.market)}</> : null}.
      </Lede>
    ),
    sections: [
      {
        id: "what-it-is",
        title: "What a Secret Lair drop is",
        body: (
          <Prose>
            <p>
              Each drop is a handful of cards in its own art, often with a theme or a collaboration, sold sealed. Many come in foil and non-foil versions at different prices,
              so check which one a listing is. A drop holds cards, not booster packs, so it has no price per pack.
            </p>
          </Prose>
        ),
      },
      {
        id: "cheapest",
        title: "The cheapest Secret Lair drops today",
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              <CardTable r={r} caption={`The cheapest Secret Lair drops in ${r.inName} today`} products={cheap} perPack={false} />
            </LiveBlock>
            {typeHref(r, "secret-lair") && <NextLinks links={[{ href: typeHref(r, "secret-lair")!, label: `Every Secret Lair drop in ${r.inName}`, icon: "arrow-right" }]} />}
          </>
        ),
      },
      {
        id: "dearest",
        title: "The dearest open today",
        body: (
          <LiveBlock r={r} checked={data.checked}>
            <CardTable r={r} caption={`The dearest open Secret Lair drops in ${r.inName} today`} products={dear} perPack={false} />
          </LiveBlock>
        ),
      },
      faqSection([
        { q: "What is a Magic Secret Lair drop?", a: "A small, themed set of Magic cards that Wizards of the Coast sells directly through its Secret Lair store for a set window; stores resell them sealed." },
        { q: `How much is a Secret Lair drop in ${r.inName}?`, a: cheap[0] ? `From ${money(cheap[0].lowestPriceCents, r.market)} today at the stores MTG Compare checks, with ${n} drops open.` : "None is in stock at the stores we compare right now." },
        { q: "Are foil and non-foil versions the same drop?", a: "They are the same cards in different finishes, sold as separate products at their own prices." },
      ]),
      whereToBuy(r, { tcg: { query: "Secret Lair", label: "Secret Lair drops" }, links: [{ href: guideHref(r, "magic-sealed-products-explained"), label: "Every kind of sealed product" }] }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
