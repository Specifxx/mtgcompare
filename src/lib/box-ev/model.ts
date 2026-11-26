// Box worth: the arithmetic. Pure (no file reads), so the page, the browser and the tests run the same code.
//
// Expected value of one booster = Σ over slots of (cards in the slot × Σ over outcomes of probability × the outcome's mean card
// price). A box is `packs` boosters. Prices are TCGplayer's US$ market prices (lib/cards.ts), in cents; a card with no recent sale
// has no price and is left out of its outcome's mean (the page shows how many were priced). `floor` counts every card worth less
// than it as zero: what a box is worth to someone who won't sell bulk.
import type { CardRow } from "../cards";
import type { BoosterOdds, Outcome, Pick as OddsPick } from "./types";

/** One card an outcome can give, priced for the outcome's finish. */
export interface EvCard {
  /** Card set file slug and card slug: the card page is /card-prices/<g>/<s>. */
  g: string;
  s: string;
  n: string;
  /** US cents, or null with no recent sale. */
  v: number | null;
}

export interface ResolvedOutcome {
  label: string;
  /** Probability in this slot, 0..1 (0 for "less than 1%" and for outcomes we can't single out). */
  p: number;
  /** The printed percentage, for display. */
  pct: number;
  lt1: boolean;
  pool: boolean;
  /** False when the cards couldn't be singled out (pick null or no card matched). */
  found: boolean;
  foil: boolean;
  cards: EvCard[];
}

export interface ResolvedSlot {
  label: string;
  count: number;
  outcomes: ResolvedOutcome[];
}

export interface ResolvedBooster {
  packs: number;
  slots: ResolvedSlot[];
}

const tagsOf = (name: string): string =>
  (name.match(/\([^)]*\)/g) ?? []).filter((t) => !/^\(\d+[a-z]?\)$/i.test(t)).join("");

function inRanges(no: string, ranges: string[] | undefined): boolean {
  if (!ranges?.length) return true;
  const n = parseInt(no, 10);
  if (!Number.isFinite(n)) return false;
  return ranges.some((r) => {
    const [a, b] = r.split("-").map((x) => parseInt(x, 10));
    return n >= a && n <= (Number.isFinite(b) ? b : a);
  });
}

/** The cards of one pick. */
export function pickCards(pick: OddsPick, mainGroup: string, group: (slug: string) => readonly CardRow[]): EvCard[] {
  const g = pick.g ?? mainGroup;
  const tags = Array.isArray(pick.t) ? pick.t : [pick.t];
  const name = pick.name ? new RegExp(pick.name, "i") : null;
  const not = pick.not ? new RegExp(pick.not, "i") : null;
  const out: EvCard[] = [];
  for (const c of group(g)) {
    if (!c.r || !pick.r.includes(c.r)) continue;
    if (!tags.includes(tagsOf(c.n))) continue;
    if (!inRanges(c.no, pick.n)) continue;
    if (name && !name.test(c.n)) continue;
    if (not && not.test(c.n)) continue;
    // A foil outcome is priced by the foil price (an etched-only card by its etched price); a non-foil outcome by the normal price.
    const v = pick.foil ? c.p[1] ?? c.p[2] : c.p[0];
    out.push({ g, s: c.s, n: c.n, v: typeof v === "number" && v > 0 ? v : null });
  }
  return out;
}

function resolveOutcome(o: Outcome, mainGroup: string, group: (slug: string) => readonly CardRow[]): ResolvedOutcome {
  const cards = o.pick ? pickCards(o.pick, mainGroup, group) : [];
  const found = cards.length > 0;
  return {
    label: o.label,
    pct: o.pct,
    lt1: !!o.lt1,
    pool: !!o.pool,
    found,
    foil: !!o.pick?.foil,
    p: found && !o.lt1 ? o.pct / 100 : 0,
    cards,
  };
}

export function resolveBooster(odds: BoosterOdds, mainGroup: string, group: (slug: string) => readonly CardRow[]): ResolvedBooster {
  return {
    packs: odds.packs,
    slots: odds.slots.map((s) => ({ label: s.label, count: s.count, outcomes: s.outcomes.map((o) => resolveOutcome(o, mainGroup, group)) })),
  };
}

/** A card's value with the bulk floor applied: under the floor, or unpriced, it is worth nothing. */
export const counted = (v: number | null, floor: number): number => (v != null && v >= floor ? v : 0);

/** Mean value of an outcome's PRICED cards, floor applied (unpriced cards are left out of the mean, not counted as zero). */
export function outcomeMean(o: { cards: readonly EvCard[] }, floor = 0): number {
  let sum = 0;
  let n = 0;
  for (const c of o.cards) {
    if (c.v == null) continue;
    sum += counted(c.v, floor);
    n++;
  }
  return n ? sum / n : 0;
}

/** Expected value of one booster, in cents. */
export function packEv(b: ResolvedBooster, floor = 0): number {
  let ev = 0;
  for (const s of b.slots) for (const o of s.outcomes) ev += s.count * o.p * outcomeMean(o, floor);
  return ev;
}

export const boxEv = (b: ResolvedBooster, floor = 0): number => packEv(b, floor) * b.packs;

/** What one slot adds to a box, for the "where the value is" breakdown. */
export function slotEvs(b: ResolvedBooster, floor = 0): { label: string; count: number; box: number }[] {
  return b.slots.map((s) => ({
    label: s.label,
    count: s.count,
    box: b.packs * s.count * s.outcomes.reduce((t, o) => t + o.p * outcomeMean(o, floor), 0),
  }));
}

/**
 * Each priced card's chance of being in a box at least once, and its share of the box's expected value. A card can sit in more
 * than one outcome (a rare in the rare slot and in the wildcard): its chances add up per booster.
 */
export interface CardChance extends EvCard {
  foil: boolean;
  /** Expected copies per box. */
  perBox: number;
  /** Chance of at least one copy in a box, 0..1. */
  inBox: number;
}

export function cardChances(b: ResolvedBooster): CardChance[] {
  const per = new Map<string, CardChance>();
  for (const s of b.slots) {
    for (const o of s.outcomes) {
      if (!o.p || !o.cards.length) continue;
      const each = (s.count * o.p) / o.cards.length;
      for (const c of o.cards) {
        if (c.v == null) continue;
        const key = `${c.g}/${c.s}/${o.foil ? "f" : "n"}`;
        const cur = per.get(key) ?? { ...c, foil: o.foil, perBox: 0, inBox: 0 };
        cur.perBox += each * b.packs;
        per.set(key, cur);
      }
    }
  }
  const out = [...per.values()];
  // Poisson: chance of at least one copy, from the expected count (exact enough at these rates, and right for a card that can
  // come from more than one slot).
  for (const c of out) c.inBox = 1 - Math.exp(-c.perBox);
  return out;
}

/** The outcomes left at zero: "less than 1%" lines and sheets we can't single out. */
export function notCounted(b: ResolvedBooster): { slot: string; label: string; why: "lt1" | "unmatched" }[] {
  const out: { slot: string; label: string; why: "lt1" | "unmatched" }[] = [];
  for (const s of b.slots) for (const o of s.outcomes) if (o.lt1) out.push({ slot: s.label, label: o.label, why: "lt1" });
  else if (!o.found) out.push({ slot: s.label, label: o.label, why: "unmatched" });
  return out;
}

// ─── The simulation: what opening real boxes looks like, not just the average ───────────────────────────────────────────

/** Small, fast, seeded PRNG (mulberry32): the server's first render and the browser's agree, so nothing jumps on load. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Compact draw tables: per slot, cumulative probabilities and each outcome's priced values (floor applied). */
interface Table {
  count: number;
  cum: number[];
  vals: number[][];
}

function tables(b: ResolvedBooster, floor: number): Table[] {
  return b.slots.map((s) => {
    const cum: number[] = [];
    const vals: number[][] = [];
    let t = 0;
    for (const o of s.outcomes) {
      if (!o.p) continue;
      const v = o.cards.filter((c) => c.v != null).map((c) => counted(c.v, floor));
      if (!v.length) continue;
      t += o.p;
      cum.push(t);
      vals.push(v);
    }
    return { count: s.count, cum, vals };
  });
}

/**
 * Open `boxes` simulated boxes; returns each box's value in cents, sorted ascending. Probabilities that don't reach 1 (the
 * outcomes counted at zero) leave the card worth nothing, as the average does.
 */
export function simulate(b: ResolvedBooster, boxes: number, seed: number, floor = 0): number[] {
  const t = tables(b, floor);
  const r = rng(seed);
  const out = new Array<number>(boxes);
  for (let i = 0; i < boxes; i++) {
    let box = 0;
    for (let p = 0; p < b.packs; p++) {
      for (const s of t) {
        for (let k = 0; k < s.count; k++) {
          const x = r();
          let j = 0;
          while (j < s.cum.length && x >= s.cum[j]) j++;
          if (j === s.cum.length) continue;
          const v = s.vals[j];
          box += v[Math.floor(r() * v.length)];
        }
      }
    }
    out[i] = box;
  }
  return out.sort((a, c) => a - c);
}

/** The q-quantile (0..1) of a sorted list. */
export function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

/** Share of simulated boxes worth at least `price`. */
export function shareAtLeast(sorted: readonly number[], price: number): number {
  if (!sorted.length) return 0;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < price) lo = mid + 1;
    else hi = mid;
  }
  return (sorted.length - lo) / sorted.length;
}

/** Histogram bins between the 1st and 99th percentile (outliers fold into the end bins). */
export function histogram(sorted: readonly number[], bins: number): { from: number; to: number; n: number }[] {
  if (!sorted.length) return [];
  const lo = quantile(sorted, 0.01);
  const hi = Math.max(quantile(sorted, 0.99), lo + 1);
  const w = (hi - lo) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({ from: lo + i * w, to: lo + (i + 1) * w, n: 0 }));
  for (const v of sorted) out[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w)))].n++;
  return out;
}
