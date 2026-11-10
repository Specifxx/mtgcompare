// Guide: which Darkhold Destiny product to buy (MTG-2, 2026-11-10). The shared set guide (set-sealed-prices.tsx) with its "which" section.
import type { RegionInfo } from "@/lib/regions";
import type { GuideData } from "./data";
import { setGuideBody, setGuideOutline, type SetGuideSpec } from "./set-sealed-prices";

const SPEC: SetGuideSpec = {
  slug: "marvel-darkhold-destiny-mtg-which-product-to-buy",
  code: "mdd",
  short: "Darkhold Destiny",
  tcgQuery: "Magic Marvel Darkhold Destiny sealed",
  focus: ["Commander Deck", "Scene Box"],
  which: true,
  about: () => (
    <>
      <p>
        Marvel: Darkhold Destiny is a Universes Beyond set. Stores list it as Play Boosters and Collector Boosters, a Bundle and a Gift Bundle, Commander decks,
        Scene Boxes and Prerelease packs; the tables above show what each costs today.
      </p>
    </>
  ),
};

export function outline(r: RegionInfo, data: GuideData) {
  return setGuideOutline(SPEC, r, data);
}
export const Body = setGuideBody(SPEC);
