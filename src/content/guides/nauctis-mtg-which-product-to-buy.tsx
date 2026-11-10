// Guide: which Nauctis product to buy (MTG-2, 2026-11-10). The shared set guide (set-sealed-prices.tsx) with its "which" section.
import type { RegionInfo } from "@/lib/regions";
import type { GuideData } from "./data";
import { setGuideBody, setGuideOutline, type SetGuideSpec } from "./set-sealed-prices";

const SPEC: SetGuideSpec = {
  slug: "nauctis-mtg-which-product-to-buy",
  code: "nau",
  short: "Nauctis",
  tcgQuery: "Magic Nauctis Sunken Realm sealed",
  focus: [],
  which: true,
  about: () => (
    <>
      <p>
        Nauctis: The Sunken Realm is a Standard Magic set. So far stores list it as Play Boosters, Collector Boosters and a Bundle; the tables above fill in as
        stores add more kinds.
      </p>
    </>
  ),
};

export function outline(r: RegionInfo, data: GuideData) {
  return setGuideOutline(SPEC, r, data);
}
export const Body = setGuideBody(SPEC);
