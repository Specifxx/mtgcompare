// The offer calendar (owner, 2026-11-28: "how do we continue this after that promotion ends … keep the banners going and the
// pop-ups going"). The Cyber Weekend bar and TCGplayer's sale card earned a record day, so once TCGplayer's sale ends
// (BF_MODE.end) the same bar and the same card keep running all year, carrying whatever is TRUE at the time: the season
// (Christmas, last orders, after Christmas, the new year, then everyday deals), an event a site names itself (a set's
// previews or release, with its own dates and page), and a standing offer of the partner's own. Never an invented
// discount, code, countdown or "ends soon": a line here states only what the partner's own help pages say, and only
// while it is true. Every date is checked against the clock in the browser too, so a page the CDN kept switches on time
// with no build. The same file in every site: change one, change all. PURE: tests/offer-calendar.test.ts.

import { BF_MODE } from "./bf-mode";

export type OfferPhase = "christmas" | "lastOrders" | "afterChristmas" | "newYear" | "everyday";

export const OFFER_PHASE_LABEL: Record<OfferPhase, string> = {
  christmas: "Christmas",
  lastOrders: "Last orders for Christmas",
  afterChristmas: "After Christmas",
  newYear: "New Year",
  everyday: "Deals",
};

/** Short chip text for phones. */
export const OFFER_PHASE_SHORT: Record<OfferPhase, string> = {
  christmas: "Christmas",
  lastOrders: "Last orders",
  afterChristmas: "After Xmas",
  newYear: "New Year",
  everyday: "Deals",
};

/** The calendar runs once Black Friday mode has ended; before that the sale bar and card have the slot. */
export function offerCalendarOn(now: number): boolean {
  return now >= BF_MODE.end;
}

/**
 * The season, every year, read in New York time (TCGplayer's own clock; UTC-5 in winter): Christmas from 1 December, last
 * orders from 14 December (standard US delivery gets slow after mid-December), after Christmas from the 26th, the new year
 * 1 to 7 January, everyday deals the rest of the year.
 */
export function offerPhase(now: number): OfferPhase {
  const ny = new Date(now - 5 * 3600 * 1000);
  const m = ny.getUTCMonth() + 1;
  const d = ny.getUTCDate();
  if (m === 11 && d === 30) return "christmas"; // the hour after TCGplayer's sale ends, before New York's 1 December
  if (m === 12 && d >= 26) return "afterChristmas";
  if (m === 12 && d >= 14) return "lastOrders";
  if (m === 12) return "christmas";
  if (m === 1 && d <= 7) return "newYear";
  return "everyday";
}

/** A site's own dated event (a set's previews, a release): it takes the chip and the bar while it runs. */
export type OfferEvent = {
  /** ISO times; the event shows from `from` (inclusive) to `to` (exclusive). */
  from: string;
  to: string;
  /** Chip text, e.g. "Legacy previews". */
  label: string;
  /** The bar's words, e.g. "Legacy preview season: pre-order prices across stores". */
  title: string;
  /** Our own page for it. */
  href: string;
};

export function activeEvent(events: readonly OfferEvent[] | undefined, now: number): OfferEvent | null {
  for (const e of events ?? []) if (now >= Date.parse(e.from) && now < Date.parse(e.to)) return e;
  return null;
}

/**
 * TCGplayer's standing offers, worded as TCGplayer's own help pages state them (checked 2026-11-28):
 * - "If your Direct package is over $50 (before taxes and fees), and you are in the United States, your entire order ships
 *   for free with TCGplayer Direct" (help.tcgplayer.com, "Buying from TCGplayer Direct").
 * Change a line only after reading the page again, and remove it the day the page stops saying it.
 */
export const TCGPLAYER_STANDING = {
  short: "Free US shipping over $50 with TCGplayer Direct",
  long: "TCGplayer Direct ships free in the US on orders over $50.",
};

/** The card's headline and line for each season, around TCGplayer's standing offer. */
export const TCG_OFFER_COPY: Record<OfferPhase, { head: string; line: string }> = {
  christmas: { head: "Christmas gifts on TCGplayer", line: `${TCGPLAYER_STANDING.long} Some places to start:` },
  lastOrders: { head: "Order soon for Christmas", line: `US delivery slows in late December. ${TCGPLAYER_STANDING.long} Start here:` },
  afterChristmas: { head: "Gift cards to spend?", line: `${TCGPLAYER_STANDING.long} Some places to start:` },
  newYear: { head: "New year, new boxes", line: `${TCGPLAYER_STANDING.long} Some places to start:` },
  everyday: { head: "Free US shipping over $50", line: "On TCGplayer Direct orders. Some places to start:" },
};

/** How long the card's ✕ keeps it away once the sale is over: a week, then once a visit again. */
export const OFFER_CLOSE_DAYS = 7;
