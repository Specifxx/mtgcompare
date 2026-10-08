// Derived lists the pages share — pure functions over rows the loaders return (a page, a set list or a bounded list of cards; never "every card": nothing here scans the catalogue).
// A "main" set is a Magic set kind that is sold in boosters and announced on the release calendar (constants.ts MAIN_SET_KINDS / RELEASE_SET_KINDS), not a literal list of this file.
import { MAIN_SET_KINDS, RELEASE_SET_KINDS } from "./constants";
import type { CardLite, SealedLite, SetLite } from "./data";

const today = () => new Date().toISOString().slice(0, 10);

/** Sets already released, newest first. Default kinds: the main sets (expansion, core, masters). */
export function releasedSets(sets: SetLite[], kinds: readonly string[] = MAIN_SET_KINDS): SetLite[] {
  const t = today();
  return sets
    .filter((s) => kinds.includes(s.kind) && s.releasedOn && s.releasedOn <= t)
    .sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? ""));
}

/** Sets announced for a later day, soonest first: every kind the release calendar shows (expansion, core, masters, commander). */
export function upcomingSets(sets: SetLite[]): SetLite[] {
  const t = today();
  return sets
    .filter((s) => RELEASE_SET_KINDS.includes(s.kind) && s.releasedOn && s.releasedOn > t)
    .sort((a, b) => (a.releasedOn ?? "").localeCompare(b.releasedOn ?? ""));
}

/** The newest released main set (a "booster set" is a main set here: expansion, core or masters). */
export function newestBoosterSet(sets: SetLite[]): SetLite | null {
  return releasedSets(sets)[0] ?? null;
}

export function mostValuable(cards: CardLite[], n: number, filter: (c: CardLite) => boolean = () => true): CardLite[] {
  return cards
    .filter((c) => c.marketUsd != null && filter(c))
    .sort((a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0))
    .slice(0, n);
}

/** Biggest 7-day moves on TCGplayer's market price (cards worth $1+). */
export function movers(cards: CardLite[], dir: "up" | "down", n: number, minMarketUsd = 100): CardLite[] {
  return cards
    .filter((c) => c.change7d != null && (c.marketUsd ?? 0) >= minMarketUsd && (dir === "up" ? c.change7d > 0 : c.change7d < 0))
    .sort((a, b) => (dir === "up" ? (b.change7d ?? 0) - (a.change7d ?? 0) : (a.change7d ?? 0) - (b.change7d ?? 0)))
    .slice(0, n);
}

/** Furthest under its own 90-day high (cards worth $3+). */
export function offHighs(cards: CardLite[], n: number): { card: CardLite; off: number }[] {
  return cards
    .filter((c) => c.high90Usd && c.marketUsd && c.marketUsd >= 300 && c.high90Usd > c.marketUsd)
    .map((card) => ({ card, off: ((card.high90Usd! - card.marketUsd!) / card.high90Usd!) * 100 }))
    .filter((x) => x.off >= 5)
    .sort((a, b) => b.off - a.off)
    .slice(0, n);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function boosterBoxes(sealed: SealedLite[], setById: Map<number, SetLite>): SealedLite[] {
  return sealed
    .filter((s) => s.kind === "Booster Box" && s.setId != null)
    .sort((a, b) => (setById.get(b.setId!)?.releasedOn ?? "").localeCompare(setById.get(a.setId!)?.releasedOn ?? ""));
}
