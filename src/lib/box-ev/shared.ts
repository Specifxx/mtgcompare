// Box worth: the shapes the page sends the browser, and the helpers both sides use. No file reads: safe in a client component.
import type { ResolvedBooster } from "./model";
import type { BoxKind } from "./types";

export interface OutcomeView {
  label: string;
  pct: number;
  p: number;
  lt1: boolean;
  pool: boolean;
  found: boolean;
  foil: boolean;
  /** Prices (US cents) of the outcome's PRICED cards. */
  vals: number[];
  /** Cards in the outcome, priced or not. */
  cards: number;
}

export interface SlotView {
  label: string;
  count: number;
  outcomes: OutcomeView[];
}

export interface PullView {
  name: string;
  href: string;
  /** US cents. */
  v: number;
  foil: boolean;
  /** Chance of at least one in a box, 0..1. */
  inBox: number;
}

export interface BoxView {
  kind: BoxKind;
  packs: number;
  slots: SlotView[];
  pulls: PullView[];
  notCounted: { slot: string; label: string; why: "lt1" | "unmatched" }[];
}

/** Back to the model's shape (prices only), for the browser's own sums. */
export function asBooster(v: Pick<BoxView, "packs" | "slots">): ResolvedBooster {
  return {
    packs: v.packs,
    slots: v.slots.map((s) => ({
      label: s.label,
      count: s.count,
      outcomes: s.outcomes.map((o) => ({ ...o, cards: o.vals.map((x) => ({ g: "", s: "", n: "", v: x })) })),
    })),
  };
}

/** "1 in 14 boxes", "about 1 in 2 boxes", "in most boxes". */
export function boxOdds(p: number): string {
  if (p >= 0.75) return "in most boxes";
  if (p >= 0.45) return "in about half of boxes";
  const n = Math.max(2, Math.round(1 / p));
  return `1 in ${n.toLocaleString("en-US")} boxes`;
}

export const KIND_LABEL: Record<BoxKind, string> = { play: "Play Booster Box", collector: "Collector Booster Box" };
