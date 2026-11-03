import { tcgplayerTiles, type TcgplayerTile } from "./data";

/** The landing page's banner: the TCGplayer half, the newest sets' sealed products with TCGplayer's own price (components/home/LandingAds.tsx). */
export const LANDING_TCG_TILES = 8;

export function landingTcgTiles(): Promise<TcgplayerTile[]> {
  return tcgplayerTiles({ take: LANDING_TCG_TILES });
}
