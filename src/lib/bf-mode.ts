// Black Friday mode (owner, 2026-11-27: "have the site turn into Black Friday mode for all the sites … advertising way more
// about products and links"; extended the same day: "put a lot more effort this weekend into Black Friday and Cyber Monday …
// capture this opportunity with TCG Player"). From Black Friday to the end of TCGplayer's sale the quiet promo line under the
// header becomes one bold bar on every page: our own deals page first, and on the TCGplayer sites TCGplayer's sale (labelled
// Ad). It is the same line in the same place (no pop-up, no overlay, no countdown, nothing while typing) and it switches
// itself off: the server draws it only inside the window, and the browser checks the clock again, so a page the CDN kept
// still reverts on time. Its label follows the weekend: Black Friday, then Cyber Weekend, then Cyber Monday (linking the
// Cyber Monday page). The same file in every site: change one, change all.

export const BF_MODE = {
  /** Black Friday morning in Australia (27 Nov 2026), already under way when the owner asked. */
  start: Date.parse("2026-11-27T00:00:00Z"),
  /** Midnight at the end of Friday 27 November in Hawaii, the last place Black Friday ends. */
  blackFridayEnd: Date.parse("2026-11-28T10:00:00Z"),
  /** Cyber Monday starts in New York (lib/tcgplayer-cyber.ts cyberMonday). */
  cyberMonday: Date.parse("2026-11-30T05:00:00Z"),
  /** TCGplayer's sale ends: 11PM New York time, 30 Nov 2026. The bar ends with it. */
  end: Date.parse("2026-12-01T04:00:00Z"),
  /** TCGplayer's own sale starts: 9AM New York time, 27 Nov 2026 (lib/tcgplayer-cyber.ts saleStart). */
  tcgplayerSale: Date.parse("2026-11-27T14:00:00Z"),
};

export function bfModeOn(now: number): boolean {
  return now >= BF_MODE.start && now < BF_MODE.end;
}

export type BfPhase = "blackFriday" | "cyberWeekend" | "cyberMonday";

export function bfPhase(now: number): BfPhase {
  if (now >= BF_MODE.cyberMonday) return "cyberMonday";
  if (now >= BF_MODE.blackFridayEnd) return "cyberWeekend";
  return "blackFriday";
}

export const BF_PHASE_LABEL: Record<BfPhase, string> = {
  blackFriday: "Black Friday",
  cyberWeekend: "Cyber Weekend",
  cyberMonday: "Cyber Monday",
};

/** On Cyber Monday the bar sends people to the Cyber Monday page instead of the Black Friday one. */
export function bfHref(href: string, phase: BfPhase): string {
  return phase === "cyberMonday" ? href.replace("/black-friday", "/cyber-monday") : href;
}
