// Guide: which Star Trek product to buy (MTG-2, 2026-11-10). The shared set guide (set-sealed-prices.tsx) with its "which" section.
import type { RegionInfo } from "@/lib/regions";
import type { GuideData } from "./data";
import { setGuideBody, setGuideOutline, type SetGuideSpec } from "./set-sealed-prices";

const SPEC: SetGuideSpec = {
  slug: "star-trek-mtg-which-product-to-buy",
  code: "trk",
  short: "Star Trek",
  tcgQuery: "Magic Star Trek sealed",
  focus: ["Commander Deck", "Scene Box"],
  which: true,
  about: () => (
    <>
      <p>
        Magic: The Gathering – Star Trek is a Universes Beyond set. Stores list it as Play Boosters and Collector Boosters, a Bundle and a Gift Bundle, Commander
        decks, Scene Boxes, a Starter Kit and Prerelease packs; the tables above show what each costs today.
      </p>
    </>
  ),
};

export function outline(r: RegionInfo, data: GuideData) {
  return setGuideOutline(SPEC, r, data);
}
export const Body = setGuideBody(SPEC);
