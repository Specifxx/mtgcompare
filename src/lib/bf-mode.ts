// Black Friday mode (owner, 2026-11-27: "for one day, have the site turn into Black Friday mode for all the sites … advertising
// way more about products and links"). For one day the quiet promo line under the header becomes one bold Black Friday bar on
// every page: our own Black Friday deals page first, and on the TCGplayer sites TCGplayer's sale (labelled Ad) once it starts.
// It is the same line in the same place (no pop-up, no overlay, no countdown, nothing while typing) and it switches itself
// off: the server draws it only inside the window, and the browser checks the clock again, so a page the CDN kept still
// reverts on time. The window covers Black Friday in every time zone, from Australia's morning to Hawaii's midnight.
// The same file in every site: change one, change all.

export const BF_MODE = {
  /** Black Friday morning in Australia (27 Nov 2026), already under way when the owner asked. */
  start: Date.parse("2026-11-27T00:00:00Z"),
  /** Midnight at the end of Friday 27 November in Hawaii, the last place Black Friday ends. */
  end: Date.parse("2026-11-28T10:00:00Z"),
  /** TCGplayer's own sale starts: 9AM New York time, 27 Nov 2026 (lib/tcgplayer-cyber.ts saleStart). */
  tcgplayerSale: Date.parse("2026-11-27T14:00:00Z"),
};

export function bfModeOn(now: number): boolean {
  return now >= BF_MODE.start && now < BF_MODE.end;
}
