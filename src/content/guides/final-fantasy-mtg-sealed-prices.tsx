// Guide: Final Fantasy (fin) sealed prices. The shared set guide (set-sealed-prices.tsx) with the facts certain about this set.
import type { RegionInfo } from "@/lib/regions";
import type { GuideData } from "./data";
import { setGuideBody, setGuideOutline, type SetGuideSpec } from "./set-sealed-prices";

const SPEC: SetGuideSpec = {
  slug: "final-fantasy-mtg-sealed-prices",
  code: "fin",
  short: "Final Fantasy",
  tcgQuery: "Magic Final Fantasy sealed",
  focus: ["Commander Deck", "Scene Box"],
  about: () => (
    <>
      <p>
        Magic: The Gathering – FINAL FANTASY is a full Universes Beyond set, sold the way a Standard set is: Play Boosters and Collector Boosters, a Bundle and a Gift
        Bundle, a Starter Kit, Prerelease packs and Scene Boxes. It also has four Commander decks, one for each of four games: Counter Blitz (Tidus, Final Fantasy X),
        Limit Break (Cloud, Final Fantasy VII), Revival Trance (Terra, Final Fantasy VI) and Scions &amp; Spellcraft (Y’shtola, Final Fantasy XIV). Each deck was
        also sold as a Collector’s Edition, with the same cards in premium treatments, and stores list the two under similar names: check the product page before
        you compare the prices.
      </p>
      <p>
        Because the four decks and the Collector’s Editions sell separately, a &ldquo;Commander Deck&rdquo; row in the table above can be any of eight products. The
        Commander Deck section lists each one open today, cheapest first.
      </p>
    </>
  ),
};

export function outline(r: RegionInfo, data: GuideData) {
  return setGuideOutline(SPEC, r, data);
}
export const Body = setGuideBody(SPEC);
