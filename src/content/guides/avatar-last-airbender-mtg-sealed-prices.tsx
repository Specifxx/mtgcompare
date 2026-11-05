// Guide: Avatar: The Last Airbender (tla) sealed prices. The shared set guide (set-sealed-prices.tsx).
import type { RegionInfo } from "@/lib/regions";
import type { GuideData } from "./data";
import { setGuideBody, setGuideOutline, type SetGuideSpec } from "./set-sealed-prices";

const SPEC: SetGuideSpec = {
  slug: "avatar-last-airbender-mtg-sealed-prices",
  code: "tla",
  short: "Avatar",
  tcgQuery: "Magic Avatar The Last Airbender sealed",
  focus: ["Scene Box", "Starter Kit"],
  about: () => (
    <>
      <p>
        Magic: The Gathering – Avatar: The Last Airbender is a Universes Beyond set sold as Play Boosters and Collector Boosters, Jumpstart Boosters, a Bundle and a
        Gift Bundle, a Starter Kit, Prerelease packs and Scene Boxes. Stores list no Commander precon decks for it, so the Starter Kit and the Jumpstart Boosters are
        the ready-to-play ways in.
      </p>
      <p>
        The Scene Boxes are the products most often listed under several names (a character’s name, a scene’s name, or both), so two listings of the same box can sit
        at different prices on the same day; the Scene Box section lists each one open today, cheapest first.
      </p>
    </>
  ),
};

export function outline(r: RegionInfo, data: GuideData) {
  return setGuideOutline(SPEC, r, data);
}
export const Body = setGuideBody(SPEC);
