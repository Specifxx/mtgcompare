// Guide: Magic sealed gifts under $50. Per gift type, the region's open products under a round cap in its own currency (more-data.ts
// GIFT_CAP: never a conversion), dearest first under it. No "best" claim: these are what is in stock, by price.
import type { RegionInfo } from "@/lib/regions";
import { money } from "@/lib/format";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { GuideBody, guideHref, Lede, LiveBlock, Note, SetGroup, storesPhrase, typeHref, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { CardTable, faqSection } from "./kit-more";
import { GIFT_CAP, GIFT_TYPES } from "./more-data";

const GUIDE = GUIDE_BY_SLUG.get("magic-sealed-gifts-under-50")!;

const WHY: Record<string, string> = {
  Bundle: "Nine Play Boosters in recent sets, with basic lands, a promo card and a storage box.",
  "Commander Deck": "A ready-to-play 100-card deck for the Commander format.",
  "Starter Kit": "Made for learning the game.",
  "Prerelease Pack": "A set's prerelease kit: Play Boosters and a promo card.",
  "Scene Box": "A display with a few cards and boosters.",
  "Collector Booster Pack": "One premium pack.",
  "Play Booster Pack": "One pack, the stocking-filler.",
};

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const cap = money(GIFT_CAP[r.market], r.market);
  const by = data.byType ?? {};
  const shown = GIFT_TYPES.filter((t) => by[t]?.length);
  return {
    intro: (
      <Lede>
        Magic sealed product in stock at {storesPhrase(r)} today for <strong>{cap} or less</strong>: Bundles, Commander decks, starter kits and packs, the most each kind gets
        you under the cap first.
      </Lede>
    ),
    sections: [
      {
        id: "gifts",
        title: `Under ${cap}, by kind`,
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              {shown.length ? (
                shown.map((t) => (
                  <SetGroup key={t} title={<span className="font-semibold text-ink">{t}s <span className="font-normal text-muted">· {WHY[t]}</span></span>}>
                    <CardTable r={r} caption={`${t}s under ${cap} in ${r.inName} today`} products={by[t]!} label={() => t} perPack={false} />
                  </SetGroup>
                ))
              ) : (
                <p className="text-sm text-muted">Nothing under {cap} is in stock at the stores we compare right now.</p>
              )}
            </LiveBlock>
            {r.market !== "US" && (
              <Note>
                {cap} is a round {r.currency} figure we use for this guide, near the US$50 the title names; we never convert prices, so every price here is a {r.adjective} store’s own.
              </Note>
            )}
          </>
        ),
      },
      faqSection([
        { q: `What Magic sealed product can I buy for under ${cap} in ${r.inName}?`, a: shown.length ? `Today, at the stores MTG Compare checks: ${shown.map((t) => `${t}s from ${money(by[t]![by[t]!.length - 1].lowestPriceCents, r.market)}`).join(", ")}.` : `Nothing under ${cap} is in stock at the stores we compare right now.` },
        { q: "What is a good Magic gift for a new player?", a: "A starter kit is made for learning; a Commander deck is ready to play in the most popular casual format." },
        { q: "Do these prices include shipping?", a: "No: each is the store's listed price, excluding delivery. Check the store's delivery cost before you buy." },
      ]),
      whereToBuy(r, {
        tcg: { query: "Magic Bundle", label: "Bundles" },
        links: [
          { href: typeHref(r, "bundle") ?? `/${r.region}/sealed`, label: "Bundles" },
          { href: guideHref(r, "commander-precon-price-guide"), label: "Commander decks" },
        ],
      }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
