// TCGplayer's Cyber Weekend 2026 banner (owner, 2026-11-21: "have those banners on our websites"). TCGplayer's sale, from its
// Impact affiliate email of 17 Nov 2026: 9AM New York time on 28 November to 11PM on 1 December, 10% store credit on all
// products (subscribers 13% or more). The banner shows from 22 Nov until the sale ends, under the price table and on the Black
// Friday and Cyber Monday pages, never above a price, never fixed or floating, labelled Ad, and it ranks nothing.
//
// CYBER_CREATIVES holds TCGplayer's own creatives: files its affiliate manager sent (src, under public/tcgplayer-cyber/), or ones from Impact (Ads → "Get code": the number in partner.tcgplayer.com/c/7385758/
// <adId>/21018 and the size in the <img>). Empty, the banner draws our own text version of the same facts. This file is the same
// in every TCGplayer site (MTG, Dex, Rift, OP, YGO, TCG Prices): change one, change all.

export interface CyberCreative {
  /** Impact's ad id (the number between the publisher id and the campaign id in the "Get code" link), 0 for a local file. */
  adId: number;
  /** A creative TCGplayer sent us as a file (its affiliate manager's "Cyber Weekend Banners 2026.zip"), served from public/. */
  src?: string;
  width: number;
  height: number;
  /** "bf": only before Cyber Monday; "cm": only from Cyber Monday; omitted: the whole run. */
  phase?: "bf" | "cm";
}

// TCGplayer's own creatives, from its affiliate manager's "Cyber Weekend Banners 2026.zip" (22 Nov 2026), drawn at 2x.
export const CYBER_CREATIVES: CyberCreative[] = [
  { adId: 0, src: "/tcgplayer-cyber/970x90.jpg", width: 970, height: 90 },
  { adId: 0, src: "/tcgplayer-cyber/320x100.jpg", width: 320, height: 100 },
];

export const CYBER_BANNER = {
  /** First day the banner shows: 00:00 UTC, 22 Nov 2026 (owner, 22 Nov: "put it live now"), so the weekend is known before it starts. */
  from: Date.parse("2026-11-22T00:00:00Z"),
  /** TCGplayer's sale starts: 9AM New York time, 28 Nov 2026. */
  saleStart: Date.parse("2026-11-28T14:00:00Z"),
  /** Cyber Monday starts in New York (00:00 EST, 30 Nov 2026): the Cyber Monday creatives take over. */
  cyberMonday: Date.parse("2026-11-30T05:00:00Z"),
  /** The sale ends: 11PM New York time, 1 Dec 2026. The banner goes with it. */
  end: Date.parse("2026-12-02T04:00:00Z"),
};

export type CyberBannerState = "off" | "soon" | "on";

export function cyberBannerState(now: number): CyberBannerState {
  if (now < CYBER_BANNER.from || now >= CYBER_BANNER.end) return "off";
  return now >= CYBER_BANNER.saleStart ? "on" : "soon";
}

/** The creatives for this moment: a wide one (468px and up) for larger screens and a small one for phones, either may be missing. */
export function pickCreatives(now: number, creatives: CyberCreative[] = CYBER_CREATIVES): { wide: CyberCreative | null; small: CyberCreative | null } {
  if (cyberBannerState(now) === "off") return { wide: null, small: null };
  const phase = now >= CYBER_BANNER.cyberMonday ? "cm" : "bf";
  const fit = creatives.filter((c) => !c.phase || c.phase === phase);
  // A creative for this phase before one for the whole run.
  const ordered = [...fit.filter((c) => c.phase === phase), ...fit.filter((c) => !c.phase)];
  return {
    wide: ordered.find((c) => c.width >= 468) ?? null,
    small: ordered.find((c) => c.width < 468) ?? null,
  };
}

/** A local file when TCGplayer sent it to us, else Impact serves the creative's image itself (its "Get code" <img>). */
export function creativeImage(c: CyberCreative): string {
  return c.src ?? `https://a.impactradius-go.com/display-ad/21018-${c.adId}`;
}

/** The banner's text, for our own version and for the image's alt text. */
export function cyberBannerText(state: CyberBannerState): { head: string; line: string } {
  return {
    head: "TCGplayer Cyber Weekend",
    line:
      state === "on"
        ? "10% store credit on all products, on now until 11PM New York time on 1 December."
        : "Starts 28 November at 9AM New York time: 10% store credit on all products, until 11PM on 1 December.",
  };
}
