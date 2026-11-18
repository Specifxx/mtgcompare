// Paid links. eBay: one EPN campaign for every Compare Empire site (5339155912), told apart by the customid prefix (SITE.tag).
// TCGplayer: the Impact deep link, always through our own /out/tcgplayer so a crawler never reaches Impact as our click.
// No eBay API anywhere on this site: the eBay row is a tagged search and claims no price.
import { SITE } from "../site.config";

export const EBAY_CAMPAIGN_ID = "5339155912";
export const TCGPLAYER_IMPACT_LINK = process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK || "https://partner.tcgplayer.com/c/7385758/1780961/21018";
export const OUT_TCGPLAYER_PATH = "/out/tcgplayer";
export const REL_SPONSORED = "sponsored nofollow noopener";
export const AFFILIATE_NOTE = "Paid links: we may earn a commission when you buy through eBay or TCGplayer. It never changes a price shown here.";

export type Placement = "card-ebay" | "card-tcgplayer" | "tile-ebay" | "set-ebay";
export const subId = (placement: Placement) => `${SITE.tag}-us-${placement}`;

/** A tagged eBay.com Buy It Now search for one card: "<game> <name> <set> <number>". */
export function ebayCardSearchUrl(query: string, placement: Placement): string {
  const u = new URL("https://www.ebay.com/sch/i.html");
  u.searchParams.set("_nkw", query.replace(/[^\p{L}\p{N}\s/'&-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120));
  u.searchParams.set("LH_BIN", "1");
  u.searchParams.set("mkevt", "1");
  u.searchParams.set("mkcid", "1");
  u.searchParams.set("mkrid", "711-53200-19255-0");
  u.searchParams.set("siteid", "0");
  u.searchParams.set("campid", EBAY_CAMPAIGN_ID);
  u.searchParams.set("toolid", "10001");
  u.searchParams.set("customid", subId(placement));
  return u.toString();
}

/** Our own redirect to a tcgplayer.com page (the route adds the Impact wrapper for a person, not for a bot). */
export function tcgplayerOutUrl(tcgplayerUrl: string, placement: Placement): string {
  return `${OUT_TCGPLAYER_PATH}?u=${encodeURIComponent(tcgplayerUrl)}&sharedid=${encodeURIComponent(subId(placement))}`;
}
export function impactUrl(plainTcgplayerUrl: string, sharedId: string): string {
  return `${TCGPLAYER_IMPACT_LINK}?u=${encodeURIComponent(plainTcgplayerUrl)}&sharedid=${encodeURIComponent(sharedId)}`;
}
