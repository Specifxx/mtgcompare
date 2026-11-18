// The return nudge (owner, 2026-11-18: "targeted ads … very subtle ways we can boost the revenue"). About 70% of buy clicks go to stores that
// pay nothing. After a click on a STORE row, when the visitor comes back to the tab, a small dismissible card offers the eBay and TCGplayer
// links already on the same page (their own tagged hrefs, copied unchanged). Only after a store click this session (never a new visitor's
// first view), once per session, never Amazon, no prices, yields to the rating card. Half the visitors never see it (the control arm,
// localStorage `rn-arm`); `nudge_eligible` fires for both arms and GA4's affiliate_click carries `nudge_arm`, so the lift is paid clicks per
// eligible return, on against off. Pure helpers; the component is components/ReturnNudge.tsx.
export const NUDGE_WINDOW_MS = 30 * 60 * 1000;
export const NUDGE_MIN_AWAY_MS = 4000;
export const NUDGE_ARM_KEY = "rn-arm";
export const NUDGE_STATE_KEY = "rn-state";

export interface LinkInfo {
  href: string;
  rel: string;
}

const hostOf = (href: string): string => {
  try {
    return new URL(href, "https://x.invalid").hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** A store link: opens another site, and is not a sponsored (paid) one. */
export function isStoreLink(l: LinkInfo, ownHost = ""): boolean {
  const h = hostOf(l.href);
  return !!h && h !== "x.invalid" && h !== ownHost && !/\bsponsored\b/.test(l.rel);
}

/** The first sponsored eBay and TCGplayer links among `links` (never Amazon). */
export function pickPaidLinks(links: LinkInfo[]): { ebay?: string; tcg?: string } {
  const out: { ebay?: string; tcg?: string } = {};
  for (const l of links) {
    if (!/\bsponsored\b/.test(l.rel)) continue;
    const h = hostOf(l.href);
    if (/(^|\.)ebay\./.test(h) || h === "rover.ebay.com") out.ebay ??= l.href;
    else if (/tcgplayer\.com$/.test(h)) out.tcg ??= l.href;
  }
  return out;
}

export const pickArm = (rand: number): "on" | "off" => (rand < 0.5 ? "on" : "off");

export interface NudgeState {
  arm: "on" | "off";
  clickedAt: number;
  now: number;
  awayMs: number;
  shownBefore: boolean;
  blocked: boolean;
  hasLinks: boolean;
}

export function nudgeEligible(s: NudgeState): boolean {
  return s.clickedAt > 0 && s.now - s.clickedAt <= NUDGE_WINDOW_MS && s.awayMs >= NUDGE_MIN_AWAY_MS && !s.shownBefore;
}

/** Eligible, in the "on" arm, with something to offer and nothing in the way. */
export function nudgeShows(s: NudgeState): boolean {
  return nudgeEligible(s) && s.arm === "on" && s.hasLinks && !s.blocked;
}
