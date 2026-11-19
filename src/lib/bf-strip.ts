// The Black Friday strip on a sealed product's own page (owner's board, 2026-11-19: "ride Black Friday on the pages we already
// have"; DECISIONS.md, "Black Friday strip on sealed pages"). One line of FACTS the page already holds, gathered where a
// shopper looks during the sale: the cheapest in-stock price and where, that store's shipping when we measured it, when that
// price was read, the pre-order date, and where today's price sits against the product's own recorded history.
//
// Real numbers only. No new URL, no new read, no eBay call, no countdown, no "was" price, no "lowest ever": the history cue
// says "lowest in 90 days" only when the product has 90 days of recorded prices, and otherwise names the first day we have
// ("lowest since 23 Oct"). Under MIN_CUE_DAYS of recorded prices there is no cue at all. Pure: tests/bf-strip.test.ts.

/** Shown through Cyber Monday and the day after it (30 Nov and 1 Dec 2026); from 2 Dec the strip renders nothing. */
export const BF_STRIP_UNTIL = "2026-12-02";

/** True while the strip is up: a UTC calendar day (YYYY-MM-DD) before BF_STRIP_UNTIL. */
export function bfStripOn(today: string): boolean {
  return today < BF_STRIP_UNTIL;
}

/** A history cue needs this many days with a recorded price in the window. */
export const MIN_CUE_DAYS = 14;
/** A recorded day under this share of the window's median is left out (a wrong listing, not a price). */
export const OUTLIER_SHARE = 0.5;
/** No cue when the window's recorded prices (or today's against them) differ by more than this factor. */
export const MAX_SPREAD = 2;
/** The window the cue reads: the last 90 days. */
export const CUE_WINDOW_DAYS = 90;

export interface HistoryDay {
  /** YYYY-MM-DD */
  day: string;
  /** The cheapest in-stock price recorded that day, or null when nothing was in stock. */
  cents: number | null;
}

export interface LowCue {
  /**
   * "lowest": today's price is at or under every price recorded in the window, and some recorded day was dearer. "steady": every
   * recorded day was today's price (no low to claim). "low": today's price is above the window's low.
   */
  kind: "lowest" | "steady" | "low";
  /** The window's lowest recorded price (today's when kind is "lowest"). */
  lowCents: number;
  /** The newest day that low was recorded. */
  lowDay: string;
  /** The first day of the window with a recorded price. */
  sinceDay: string;
  /** The recorded days reach back the whole 90 days: the cue may say "90 days". */
  full: boolean;
}

const dayNum = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);

/**
 * Where today's price sits against the product's own recorded prices over the last 90 days (to `today`), or null when the
 * history is too short to say anything (under MIN_CUE_DAYS priced days) or there is no price today. Pure.
 */
export function lowCue(days: readonly HistoryDay[], currentCents: number | null | undefined, today: string): LowCue | null {
  if (currentCents == null || !(currentCents > 0)) return null;
  const end = dayNum(today);
  const start = end - CUE_WINDOW_DAYS + 1;
  const priced = days
    .filter((d): d is { day: string; cents: number } => d.cents != null && d.cents > 0 && dayNum(d.day) >= start && dayNum(d.day) <= end)
    .sort((a, b) => a.day.localeCompare(b.day));
  // A day far under the window's median is a wrong listing the importer let through once (a pack read as a box), not a price
  // anyone could buy at: it never becomes the low the strip names.
  const sortedCents = priced.map((d) => d.cents).sort((a, b) => a - b);
  const median = sortedCents[Math.floor(sortedCents.length / 2)] ?? 0;
  const kept = priced.filter((d) => d.cents >= median * OUTLIER_SHARE);
  if (kept.length < MIN_CUE_DAYS) return null;
  // A history whose prices span more than MAX_SPREAD (weeks of a wrong product's price, a launch's swing) says nothing honest
  // about today's price: no cue. Nor when today's price is itself far off the recorded ones.
  const lo = Math.min(...kept.map((d) => d.cents));
  const hi = Math.max(...kept.map((d) => d.cents));
  if (hi > lo * MAX_SPREAD || currentCents < lo / MAX_SPREAD || currentCents > hi * MAX_SPREAD) return null;
  const sinceDay = kept[0].day;
  // "90 days" needs a recorded price at the window's start (a day of slack): the product's history covers all of it.
  const full = dayNum(sinceDay) <= start + 1;
  let low = kept[0];
  for (const d of kept) if (d.cents <= low.cents) low = d;
  if (kept.every((d) => d.cents === currentCents)) return { kind: "steady", lowCents: currentCents, lowDay: today, sinceDay, full };
  if (currentCents <= low.cents) return { kind: "lowest", lowCents: currentCents, lowDay: today, sinceDay, full };
  return { kind: "low", lowCents: low.cents, lowDay: low.day, sinceDay, full };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-23" → "23 Oct" (with the year only when it is not today's year). */
export function cueDate(iso: string, today: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${iso.slice(0, 4) === today.slice(0, 4) ? "" : ` ${y}`}`;
}

/** The cue in words: "Same price since 23 Oct", "Lowest price in 90 days", "Lowest price since 23 Oct", "90-day low $189.99 on 2 Nov", "Low since 23 Oct: $189.99 on 2 Nov". */
export function lowCueText(cue: LowCue, fmt: (cents: number) => string, today: string): string {
  if (cue.kind === "steady") return `Same price since ${cueDate(cue.sinceDay, today)}`;
  if (cue.kind === "lowest") return cue.full ? "Lowest price in 90 days" : `Lowest price since ${cueDate(cue.sinceDay, today)}`;
  const at = `${fmt(cue.lowCents)} on ${cueDate(cue.lowDay, today)}`;
  return cue.full ? `90-day low ${at}` : `Low since ${cueDate(cue.sinceDay, today)}: ${at}`;
}
