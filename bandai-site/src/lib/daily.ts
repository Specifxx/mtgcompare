// The daily Price Duel (growth plan 2026-11-03, "a loop, not a push"): one
// puzzle a day, the same for everyone, ten rounds of "which card is worth
// more?" at TCGplayer's US market price. The result is an emoji grid players
// paste into Discord, group chats and Reddit, which is what brings the next
// player; the streak brings them back. Pure, so the page, the client and the
// tests agree.
//
// Cost: the page is ISR like every tool page and carries the next few days'
// puzzles, so the puzzle changes at midnight UTC without a build. A card is
// picked by a hash of (day, id), not by its place in a list, so a build that
// adds or drops a card leaves almost every pair of that day unchanged, and a
// pair is only made from prices 1.25 to 8 times apart, so a day's price moves
// don't flip an answer.

export const DAILY_ROUNDS = 10;
/** Puzzle #1. Never change it: shared results carry the number. */
export const DAILY_EPOCH = "2026-11-03";
/** Days of puzzles each build carries (builds are at most daily, often less). */
export const DAILY_AHEAD = 7;
/** The dearer card must be at least this many times the cheaper one. */
export const DAILY_MIN_RATIO = 1.25;
/** Cards under US$1 are coin flips between bulk; leave them out. */
export const DAILY_MIN_CENTS = 100;
/** Prize cards and one-offs over US$2,000 make a pair a giveaway; leave them out. */
export const DAILY_MAX_CENTS = 200_000;
/** Nor a pair one card is eight times the other: that's no guess either. */
export const DAILY_MAX_RATIO = 8;

export interface DailyCard {
  id: number;
  slug: string;
  name: string;
  set: string;
  image: string | null;
  /** TCGplayer US market price, US cents. */
  cents: number;
}
export interface DailyPuzzle {
  n: number;
  day: string;
  rounds: [DailyCard, DailyCard][];
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

const base = (name: string) => name.toLowerCase().replace(/\s*[([].*$/, "").trim();

/** One day's ten pairs, or null when the catalogue is too thin for a fair game. */
export function buildPuzzle(cards: readonly DailyCard[], day: string): DailyPuzzle | null {
  const pool = cards
    .filter((c) => c.cents >= DAILY_MIN_CENTS && c.cents <= DAILY_MAX_CENTS)
    .map((c) => ({ c, h: hash(`${day}:${c.id}`) }))
    .sort((a, b) => a.h - b.h || a.c.id - b.c.id)
    .map((x) => x.c);
  const used = new Set<number>();
  const rounds: [DailyCard, DailyCard][] = [];
  for (let i = 0; i < pool.length && rounds.length < DAILY_ROUNDS; i++) {
    const a = pool[i];
    if (used.has(a.id)) continue;
    // Look a short way ahead for a partner far enough apart in price.
    for (let j = i + 1; j < Math.min(pool.length, i + 40); j++) {
      const b = pool[j];
      if (used.has(b.id) || base(a.name) === base(b.name)) continue;
      const hi = Math.max(a.cents, b.cents);
      const lo = Math.min(a.cents, b.cents);
      if (hi < lo * DAILY_MIN_RATIO || hi > lo * DAILY_MAX_RATIO) continue;
      used.add(a.id).add(b.id);
      rounds.push([a, b]);
      break;
    }
  }
  if (rounds.length < DAILY_ROUNDS) return null;
  return { n: puzzleNumber(day), day, rounds };
}

/** Today's puzzle and the next DAILY_AHEAD - 1, skipping any day that can't be built. */
export function upcomingPuzzles(cards: readonly DailyCard[], today: string, ahead = DAILY_AHEAD): DailyPuzzle[] {
  const out: DailyPuzzle[] = [];
  for (let k = -1; k < ahead; k++) {
    const p = buildPuzzle(cards, addDays(today, k));
    if (p) out.push(p);
  }
  return out;
}

/** The puzzle for the visitor's UTC day, else the newest one the build carries. */
export function puzzleFor(puzzles: readonly DailyPuzzle[], today: string): DailyPuzzle | null {
  return puzzles.find((p) => p.day === today) ?? puzzles.filter((p) => p.day <= today).at(-1) ?? puzzles[0] ?? null;
}

/** True when the visitor picked the dearer card. */
export const isRight = (round: [DailyCard, DailyCard], pick: 0 | 1) => round[pick].cents > round[1 - pick].cents;

/** The text players paste: a number, a score, the grid, and the link. No prices, so it spoils nothing. */
export function shareResult(game: string, n: number, marks: readonly boolean[], streak: number, url: string): string {
  const grid = marks.map((m) => (m ? "🟩" : "🟥")).join("");
  const score = marks.filter(Boolean).length;
  return [`${game} Price Duel #${n} · ${score}/${marks.length}`, grid, streak > 1 ? `🔥 ${streak} day streak` : null, url].filter(Boolean).join("\n");
}

/** A streak counts consecutive puzzle numbers played. */
export function nextStreak(prev: { last: number; count: number } | null, n: number): { last: number; count: number } {
  if (prev && prev.last === n) return prev;
  return { last: n, count: prev && prev.last === n - 1 ? prev.count + 1 : 1 };
}
