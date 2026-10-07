// The weekly newsletter's sponsored slot — RiftCompare's lib/newsletter-sponsor.ts
// (2026-10-01), ported to OP Compare in wave 2 (2026-10-03) with an empty list.
//
// A sponsor buys a placement that WE send; they never receive the list or any
// subscriber data (the privacy policy says we do not sell personal
// information, and that stays true). The slot is always labelled "Sponsored",
// and only one sponsor runs per edition.
//
// To book one, add an entry below and land it on main before the Friday 21:00
// UTC send. `from`/`until` are ISO dates (inclusive, UTC); `markets` limits
// the placement to some markets' editions (omit for all). When nothing is
// booked the slot shows a short "sponsor this newsletter" line instead.
import type { Country } from "./country";

export interface NewsletterSponsor {
  name: string;
  headline: string;
  body: string;
  /** https only. Tagged with newsletter UTM parameters when sent. */
  url: string;
  cta: string;
  /** Optional https image, shown at up to 536px wide. */
  imageUrl?: string;
  markets?: Country[];
  from: string;
  until: string;
}

export const NEWSLETTER_SPONSORS: NewsletterSponsor[] = [];

/** The sponsor booked for this market's edition on `now`, if any. */
export function sponsorFor(market: Country, now = new Date(), list = NEWSLETTER_SPONSORS): NewsletterSponsor | null {
  const day = now.toISOString().slice(0, 10);
  return (
    list.find(
      (s) =>
        s.from <= day &&
        day <= s.until &&
        (!s.markets || s.markets.includes(market)) &&
        s.url.startsWith("https://") &&
        (!s.imageUrl || s.imageUrl.startsWith("https://")),
    ) ?? null
  );
}
