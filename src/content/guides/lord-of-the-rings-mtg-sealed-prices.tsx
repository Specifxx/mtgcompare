// Guide: The Lord of the Rings: Tales of Middle-earth (ltr) sealed prices. The shared set guide (set-sealed-prices.tsx).
import type { RegionInfo } from "@/lib/regions";
import type { GuideData } from "./data";
import { setGuideBody, setGuideOutline, type SetGuideSpec } from "./set-sealed-prices";

const SPEC: SetGuideSpec = {
  slug: "lord-of-the-rings-mtg-sealed-prices",
  code: "ltr",
  short: "Lord of the Rings",
  tcgQuery: "Magic Lord of the Rings Tales of Middle-earth sealed",
  focus: ["Commander Deck", "Scene Box"],
  about: () => (
    <>
      <p>
        The Lord of the Rings: Tales of Middle-earth came out in 2023, before Play Boosters existed, so its boosters are the older three kinds: Draft Boosters, Set
        Boosters and Collector Boosters, plus Jumpstart Boosters. Beside them are a Bundle, a Gift Bundle, a Starter Kit, Scene Boxes and four Commander decks: Riders
        of Rohan, Food and Fellowship, The Hosts of Mordor and Elven Council. A second wave of Collector Boosters, the Holiday Release, followed later that year with
        different borderless treatments; stores list it as its own product.
      </p>
      <p>
        Two years on, much of this is out of print and the price of what is left depends on which stores still hold it. The tables above show only what is open today, so a kind missing from the table is one no store we compare has in stock.
      </p>
    </>
  ),
};

export function outline(r: RegionInfo, data: GuideData) {
  return setGuideOutline(SPEC, r, data);
}
export const Body = setGuideBody(SPEC);
