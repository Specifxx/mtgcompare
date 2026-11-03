// The daily Price Duel for sealed product (growth plan 2026-11-03, "a loop,
// not a push"; the card sites' lib/daily.ts, ported to sealed): one puzzle a
// day per region, the same for everyone there, ten rounds of "which costs
// more right now?" at the region's cheapest in-stock price. The result is an
// emoji grid players paste into Discord, group chats and Reddit, which is what
// brings the next player; the streak brings them back. Pure, so the page, the
// client and the tests agree.
//
// Cost: the page is force-dynamic and kept by Vercel's CDN for a day like
// every region page, and carries the next few days' puzzles, so the puzzle
// changes at midnight UTC without a build. A product is picked by a hash of
// (day, slug), not by its place in a list, so an import that adds or drops a
// product leaves almost every pair of that day unchanged, and a pair is only
// made from prices 1.25 to 8 times apart, so a day's price moves don't flip an
// answer.

export const DAILY_ROUNDS = 10;
/** Puzzle #1. Never change it: shared results carry the number. */
export const DAILY_EPOCH = "2026-11-03";
/** Days of puzzles each render carries (the CDN keeps a page for a day). */
export const DAILY_AHEAD = 7;
/** The dearer product must be at least this many times the cheaper one. */
export const DAILY_MIN_RATIO = 1.25;
/** Under 5 units of the region's currency is a single pack or a sleeve: leave them out. */
export const DAILY_MIN_CENTS = 500;
/** A case or a one-off over 2,000 makes a pair a giveaway: leave them out. */
export const DAILY_MAX_CENTS = 200_000;
/** Nor a pair one product is eight times the other: that's no guess either. */
export const DAILY_MAX_RATIO = 8;

export interface DailyItem {
  slug: string;
  name: string;
  /** The product type ("Booster Box"), shown under the name. */
  type: string;
  image: string;
  /** Cheapest in-stock price in the region's own currency, in cents. */
  cents: number;
}
export interface DailyPuzzle {
  n: number;
  day: string;
  rounds: [DailyItem, DailyItem][];
}

const DAY = 86_400_000;
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (day: string, k: number) => dayKey(new Date(Date.parse(`${day}T00:00:00Z`) + k * DAY));
export const puzzleNumber = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${DAILY_EPOCH}T00:00:00Z`)) / DAY) + 1;

/** FNV-1a, 32 bits: stable across Node and browsers. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** One day's ten pairs, or null when the region's catalogue is too thin for a fair game. */
export function buildPuzzle(items: readonly DailyItem[], day: string): DailyPuzzle | null {
  const pool = items
    .filter((c) => c.cents >= DAILY_MIN_CENTS && c.cents <= DAILY_MAX_CENTS)
    .map((c) => ({ c, h: hash(`${day}:${c.slug}`) }))
    .sort((a, b) => a.h - b.h || (a.c.slug < b.c.slug ? -1 : 1))
    .map((x) => x.c);
  const used = new Set<string>();
  const rounds: [DailyItem, DailyItem][] = [];
  for (let i = 0; i < pool.length && rounds.length < DAILY_ROUNDS; i++) {
    const a = pool[i];
    if (used.has(a.slug)) continue;
    // Look a short way ahead for a partner far enough apart in price.
    for (let j = i + 1; j < Math.min(pool.length, i + 40); j++) {
      const b = pool[j];
      if (used.has(b.slug) || a.name === b.name) continue;
      const hi = Math.max(a.cents, b.cents);
      const lo = Math.min(a.cents, b.cents);
      if (hi < lo * DAILY_MIN_RATIO || hi > lo * DAILY_MAX_RATIO) continue;
      used.add(a.slug).add(b.slug);
      rounds.push([a, b]);
      break;
    }
  }
  if (rounds.length < DAILY_ROUNDS) return null;
  return { n: puzzleNumber(day), day, rounds };
}

/** Yesterday's, today's and the next DAILY_AHEAD - 1 puzzles, skipping any day that can't be built. */
export function upcomingPuzzles(items: readonly DailyItem[], today: string, ahead = DAILY_AHEAD): DailyPuzzle[] {
  const out: DailyPuzzle[] = [];
  for (let k = -1; k < ahead; k++) {
    const p = buildPuzzle(items, addDays(today, k));
    if (p) out.push(p);
  }
  return out;
}

/** The puzzle for the visitor's UTC day, else the newest one the render carries. */
export function puzzleFor(puzzles: readonly DailyPuzzle[], today: string): DailyPuzzle | null {
  return puzzles.find((p) => p.day === today) ?? puzzles.filter((p) => p.day <= today).at(-1) ?? puzzles[0] ?? null;
}

/** True when the visitor picked the dearer product. */
export const isRight = (round: [DailyItem, DailyItem], pick: 0 | 1) => round[pick].cents > round[1 - pick].cents;

/** The text players paste: a number, a score, the grid, and the link. No prices, so it spoils nothing. */
export function shareResult(site: string, n: number, marks: readonly boolean[], streak: number, url: string): string {
  const grid = marks.map((m) => (m ? "🟩" : "🟥")).join("");
  const score = marks.filter(Boolean).length;
  return [`${site} Price Duel #${n} · ${score}/${marks.length}`, grid, streak > 1 ? `🔥 ${streak} day streak` : null, url].filter(Boolean).join("\n");
}

/** A streak counts consecutive puzzle numbers played. */
export function nextStreak(prev: { last: number; count: number } | null, n: number): { last: number; count: number } {
  if (prev && prev.last === n) return prev;
  return { last: n, count: prev && prev.last === n - 1 ? prev.count + 1 : 1 };
}
