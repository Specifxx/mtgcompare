// What generated copy must never say. DexCompare keeps no price history and reads each store's CURRENT price and stock, so
// it cannot know that a price dropped, that something is back in stock, that it sells fast or that it is a good investment;
// it says "today", "right now" or "checked N h ago" instead. Every page that builds sentences from data (titles, ledes, badges,
// value checks, digests, guides) is tested against BANNED_COPY, and the server HTML of each new route is swept with it.
// Pure: no database, safe in the browser.

// A currency amount as the site writes one (format.ts money: "$49.99", "A$49.95", "NZ$", "C$", "S$", "US$", "£", "€") or as
// a store might ("AUD 49", "49,95 €", "49.95 EUR").
const CODES = "AUD|NZD|USD|GBP|CAD|EUR|SGD";
const AMOUNT = String.raw`(?:(?:(?:[A-Z]{1,3})?\$|[£€]|(?:${CODES}))\s?\d(?:[\d.,]*\d)?|\d[\d.,]*\s?(?:[£€]|(?:${CODES})\b))`;

const PHRASES = [
  String.raw`\bdropped\b`,
  String.raw`\bprice[-\s]+(?:drops?|cuts?)\b`,
  String.raw`\bnow\s+only\b`,
  String.raw`\blowest[-\s]+ever\b`,
  String.raw`\ball[-\s]*time[-\s]+lows?\b`,
  String.raw`\bon\s+sale\b`,
  String.raw`\busual\s+price\b`,
  String.raw`\bnormally\b`,
  String.raw`\brestocked\b`,
  String.raw`\bback\s+in\s+stock\b`,
  String.raw`\btrending\b`,
  String.raw`\bselling\s+fast\b`,
  String.raw`\blimited[-\s]+time\b`,
  String.raw`\binvestments?\b`,
  String.raw`\bpull[-\s]+rates?\b`,
  // "was A$59.95": a struck-through former price is a history claim
  String.raw`\bwas\s+${AMOUNT}`,
];

/**
 * Case-insensitive, and NOT global (a /g regex keeps lastIndex between .test() calls and would skip matches): history,
 * urgency and value claims the site's data cannot back. `BANNED_COPY.test(text)` is the check; findBannedCopy says what matched.
 */
export const BANNED_COPY = new RegExp(PHRASES.join("|"), "i");

/** The first banned phrase in `text`, or null: for a test's failure message. */
export function findBannedCopy(text: string): string | null {
  return BANNED_COPY.exec(text)?.[0] ?? null;
}
