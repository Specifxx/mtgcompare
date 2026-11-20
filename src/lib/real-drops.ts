// "Furthest under their own price" on the Black Friday and Cyber Monday pages (code red plan 2026-11-20, Cyber Week buy sprint;
// DECISIONS.md "Black Friday pages: products furthest under their own 30-day price, with a buy button on every line"). A product
// is listed only when the price a shopper can pay right now (the cheapest in-stock offer) sits at least MIN_DROP_PCT under the
// median of its OWN recorded daily prices over the last 30 days, and only when that history can be trusted:
//   - MIN_DROP_DAYS or more recorded days in the window (MTG and Dex history only starts on 23 Oct 2026),
//   - a recorded day under half the window's median is left out (a wrong listing the importer let through once),
//   - no claim at all when the kept days differ by more than 2x, or today's price is more than 2x off them (weeks of a wrong
//     product's price, a launch swing).
// The same rules as the product pages' Black Friday strip (lib/bf-strip.ts lowCue), and the same file on Dex, Rift, MTG and OP.
// Pure: tests/real-drops.test.ts.

export const DROPS_WINDOW_DAYS = 30;
export const MIN_DROP_DAYS = 14;
export const MIN_DROP_PCT = 10;
/** A typical price under this (20.00 in the region's currency) is a pack or a single: too small a saving to lead a sale page. */
export const MIN_TYPICAL_CENTS = 2000;
const OUTLIER_SHARE = 0.5;
/** A store's "price on request" placeholder (99.99 rounded up to 9999.99 or 9999.00), never a price anyone pays. */
export const isPlaceholderPrice = (cents: number) => /^9{3,}$/.test(String(cents)) || /^9{3,}0{2}$/.test(String(cents));
const MAX_SPREAD = 2;

export interface PricedDay {
  /** YYYY-MM-DD */
  day: string;
  /** The cheapest in-stock price recorded that day, or null when nothing was in stock. */
  cents: number | null;
}

export interface RealDrop {
  nowCents: number;
  /** The median of the kept recorded days in the window. */
  typicalCents: number;
  /** Whole percent under the typical price. */
  pct: number;
  /** The first kept recorded day in the window. */
  sinceDay: string;
  /** Today's price is at or under every kept recorded day. */
  lowest: boolean;
}

const dayNum = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);

/** The product's drop under its own recorded prices, or null when there is none to claim honestly. Today's own day is not part of the window. */
export function realDrop(days: readonly PricedDay[], nowCents: number | null | undefined, today: string): RealDrop | null {
  if (nowCents == null || !(nowCents > 0) || isPlaceholderPrice(nowCents)) return null;
  const end = dayNum(today) - 1;
  const start = end - DROPS_WINDOW_DAYS + 1;
  const priced = days
    .filter((d): d is { day: string; cents: number } => d.cents != null && d.cents > 0 && !isPlaceholderPrice(d.cents) && dayNum(d.day) >= start && dayNum(d.day) <= end)
    .sort((a, b) => a.day.localeCompare(b.day));
  const sorted = priced.map((d) => d.cents).sort((a, b) => a - b);
  const median0 = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const kept = priced.filter((d) => d.cents >= median0 * OUTLIER_SHARE);
  if (kept.length < MIN_DROP_DAYS) return null;
  const cents = kept.map((d) => d.cents).sort((a, b) => a - b);
  const lo = cents[0];
  const hi = cents[cents.length - 1];
  if (hi > lo * MAX_SPREAD || nowCents < lo / MAX_SPREAD || nowCents > hi * MAX_SPREAD) return null;
  const mid = Math.floor(cents.length / 2);
  const typicalCents = cents.length % 2 ? cents[mid] : Math.round((cents[mid - 1] + cents[mid]) / 2);
  const pct = Math.floor(((typicalCents - nowCents) / typicalCents) * 100);
  if (pct < MIN_DROP_PCT || typicalCents < MIN_TYPICAL_CENTS) return null;
  return { nowCents, typicalCents, pct, sinceDay: kept[0].day, lowest: nowCents <= lo };
}

/** Biggest drop first, then the dearer typical price (more money saved), then name: a stable order. */
export function rankDrops<T extends { drop: RealDrop; name: string }>(rows: readonly T[], take: number): T[] {
  return [...rows]
    .sort((a, b) => b.drop.pct - a.drop.pct || b.drop.typicalCents - b.drop.nowCents - (a.drop.typicalCents - a.drop.nowCents) || a.name.localeCompare(b.name))
    .slice(0, take);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-23" → "23 Oct". */
export function dropDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** The line under a product: "15% under its 30-day typical $219.99 · lowest since 23 Oct". Never "was", "dropped" or "ever". */
export function dropLine(drop: RealDrop, fmt: (cents: number) => string): string {
  return `${drop.pct}% under its 30-day typical ${fmt(drop.typicalCents)}${drop.lowest ? ` · lowest since ${dropDate(drop.sinceDay)}` : ""}`;
}
