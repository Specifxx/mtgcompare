// Guide: which Nauctis product to buy (MTG-2, 2026-11-10). The shared set guide (set-sealed-prices.tsx) with its "which" section.
import type { RegionInfo } from "@/lib/regions";
import type { GuideData } from "./data";
import { setGuideBody, setGuideOutline, type SetGuideSpec } from "./set-sealed-prices";

const SPEC: SetGuideSpec = {
  slug: "nauctis-mtg-which-product-to-buy",
  code: "nau",
  short: "Nauctis",
  tcgQuery: "Magic Nauctis Sunken Realm sealed",
  focus: ["Commander Deck", "Prerelease Pack"],
  which: true,
  premiumDecks: true,
  about: () => (
    <>
      <p>
        Nauctis: The Sunken Realm is a Standard Magic set. Stores list it as Play Boosters and Collector Boosters (by the pack, the box and the case), a
        Bundle, four Commander decks in a regular and a Premium Edition, Prerelease packs, a Draft Night box and Secret Lair bundles; the tables above show
        what each costs today.
      </p>
    </>
  ),
};

export function outline(r: RegionInfo, data: GuideData) {
  return setGuideOutline(SPEC, r, data);
}
export const Body = setGuideBody(SPEC);
