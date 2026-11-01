// Guide: the best first Magic product for a new player (2026-11-01). The region's cheapest open Starter Kits, Commander decks and
// Play Booster packs today (more-data.ts openOfType), with what each is for. Contents claims are limited to what every product of
// the kind holds: a Commander precon is a ready-to-play 100-card deck; a Starter Kit is made for learning the game.
import type { RegionInfo } from "@/lib/regions";
import { money, plural } from "@/lib/format";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { Checklist, Decisions, GuideBody, guideHref, Lede, LiveBlock, NextLinks, Prose, storesPhrase, typeHref, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { CardTable, faqSection } from "./kit-more";

const GUIDE = GUIDE_BY_SLUG.get("best-magic-product-for-beginners")!;

export const BEGINNER_TYPES = ["Starter Kit", "Commander Deck", "Play Booster Pack"] as const;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const by = data.byType ?? {};
  const kits = by["Starter Kit"] ?? [];
  const decks = by["Commander Deck"] ?? [];
  const packs = by["Play Booster Pack"] ?? [];
  const nKits = data.openByType?.["Starter Kit"] ?? kits.length;
  const nDecks = data.openByType?.["Commander Deck"] ?? decks.length;
  const link = (key: string, label: string) => (typeHref(r, key) ? [{ href: typeHref(r, key)!, label, icon: "arrow-right" as const }] : []);
  return {
    intro: (
      <Lede>
        New to Magic: The Gathering, or buying for someone who is? Skip the booster boxes. The best first purchase is a product made to be played straight out of the box: a{" "}
        <strong>Starter Kit</strong> for two people learning together, or a <strong>Commander deck</strong> for someone joining friends who already play. {storesPhrase(r)} have{" "}
        {plural(nKits, "Starter Kit")} and {plural(nDecks, "Commander deck")} open today.
      </Lede>
    ),
    sections: [
      {
        id: "which-one",
        title: "Which one to buy",
        body: (
          <Decisions
            rows={[
              { when: <>Two people learning the game together</>, then: <>A Starter Kit. It is made for learning, with everything two players need to start.</> },
              { when: <>Joining a group that plays Commander</>, then: <>A Commander precon: a ready-to-play 100-card deck for Magic’s most popular multiplayer format.</> },
              { when: <>Curious, on a small budget</>, then: <>A few Play Booster packs of a recent set, to see the cards before buying a deck.</> },
              { when: <>Already knows they love it</>, then: <>A Bundle or a Play Booster box. See <a href={guideHref(r, "play-booster-vs-collector-booster-vs-bundle")}>which to buy</a>.</> },
            ]}
          />
        ),
      },
      {
        id: "starter-kits",
        title: "Starter Kits in stock today",
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              <CardTable r={r} caption={`The cheapest Starter Kits in ${r.inName} today`} products={kits} perPack={false} empty="No Starter Kit is in stock at the stores we compare right now." />
            </LiveBlock>
            <NextLinks links={link("starter", `Every Starter Kit and Beginner Box in ${r.inName}`)} />
          </>
        ),
      },
      {
        id: "commander-decks",
        title: "Commander decks in stock today",
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              <CardTable r={r} caption={`The cheapest Commander decks in ${r.inName} today`} products={decks} perPack={false} empty="No Commander deck is in stock at the stores we compare right now." />
            </LiveBlock>
            <Prose>
              <p>
                A release usually has several Commander decks, each built around a different legendary creature. Pick the one whose colours or theme appeals; every one is
                playable as it comes. Our <a href={guideHref(r, "commander-precon-price-guide")}>Commander precon price guide</a> lists them all.
              </p>
            </Prose>
            <NextLinks links={link("commander-deck", `Every Commander deck in ${r.inName}`)} />
          </>
        ),
      },
      {
        id: "packs",
        title: "Just curious? A few packs",
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              <CardTable r={r} caption={`The cheapest Play Booster packs in ${r.inName} today`} products={packs} perPack={false} empty="No Play Booster pack is in stock at the stores we compare right now." />
            </LiveBlock>
            <Prose>
              <p>
                Packs are fun to open, but a handful of random cards is not a deck. Once you know you like the game, a Starter Kit or Commander deck gets you playing for
                less than buying packs until a deck comes together. See <a href={guideHref(r, "cheapest-way-to-buy-magic-packs")}>the cheapest way to buy packs</a>.
              </p>
            </Prose>
            <NextLinks links={link("play-booster", `Every Play Booster pack in ${r.inName}`)} />
          </>
        ),
      },
      {
        id: "before-you-buy",
        title: "Before you buy",
        body: (
          <Checklist
            items={[
              <>Ask what format their friends play. Most casual groups play Commander, and a Commander deck is only useful there.</>,
              <>Check the product name: a Collector’s Edition of a Commander deck costs more than the regular one.</>,
              <>Compare the same product across stores: the cheapest is often a store you have not heard of.</>,
              <>Buying it as a gift? Our <a href={guideHref(r, "magic-sealed-gifts-under-50")}>gifts under a budget</a> list has more ideas.</>,
            ]}
          />
        ),
      },
      faqSection([
        {
          q: "What is the best Magic: The Gathering product for a beginner?",
          a: "A Starter Kit if two people are learning together, or a Commander deck if they are joining friends who play Commander. Both are ready to play out of the box.",
        },
        {
          q: `How much is a Magic Starter Kit in ${r.inName}?`,
          a: kits[0] ? `From ${money(kits[0].lowestPriceCents, r.market)} today (${kits[0].name}) at the stores MTG Compare checks.` : "None is in stock at the stores we compare right now.",
        },
        { q: "Should a beginner buy a booster box?", a: "Usually not first. A box is a lot of random packs; a ready-to-play deck teaches the game for much less." },
      ]),
      whereToBuy(r, { tcg: { query: "Magic the Gathering Starter Kit", label: "Starter Kits" } }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
