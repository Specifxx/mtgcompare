import { tcgplayerTiles, type TcgplayerTile } from "./data";

/** The landing page's banner: the TCGplayer half, the newest sets' sealed products with TCGplayer's own price (components/home/LandingAds.tsx). */
export const LANDING_TCG_TILES = 8;

export function landingTcgTiles(): Promise<TcgplayerTile[]> {
  return tcgplayerTiles({ take: LANDING_TCG_TILES });
}

/** The side rails' TCGplayer tiles on the landing page (components/SideAds.tsx SoftSideAds): ten, as on the region pages. */
export function landingRailTiles(): Promise<TcgplayerTile[]> {
  return tcgplayerTiles();
}
