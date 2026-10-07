// The card grading scale a binder entry is recorded in, and what each grade is
// worth against a Near Mint price — RiftCompare's CONDITIONS / CONDITION_KEYS /
// CONDITION_MULTIPLIER (its lib/constants.ts), ported for the portfolio in wave 2
// (2026-10-03). OP Compare's own constants.ts carries the One Piece vocabulary
// (colours, rarities, printings); conditions are a collection concept, so they
// live beside the collection code. Client-safe: no server imports.

export interface ConditionInfo {
  key: string;
  label: string;
  full: string;
  color: string;
}

// Card grading scale used across TCG marketplaces.
export const CONDITIONS: Record<string, ConditionInfo> = {
  NM: { key: "NM", label: "NM", full: "Near Mint", color: "#30a46c" },
  LP: { key: "LP", label: "LP", full: "Lightly Played", color: "#86b300" },
  MP: { key: "MP", label: "MP", full: "Moderately Played", color: "#f5a524" },
  HP: { key: "HP", label: "HP", full: "Heavily Played", color: "#f5793b" },
  DMG: { key: "DMG", label: "DMG", full: "Damaged", color: "#e5484d" },
};

export const CONDITION_KEYS = Object.keys(CONDITIONS);

// Relative value multipliers applied to a card's reference price per condition.
export const CONDITION_MULTIPLIER: Record<string, number> = {
  NM: 1.0,
  LP: 0.85,
  MP: 0.7,
  HP: 0.55,
  DMG: 0.4,
};

export const isConditionKey = (v: unknown): v is string => typeof v === "string" && Object.prototype.hasOwnProperty.call(CONDITIONS, v);

/** A copy's value: the price × the condition multiplier, rounded per copy. */
export function unitValue(price: number | null | undefined, condition: string): number | null {
  return price != null ? Math.round(price * (CONDITION_MULTIPLIER[condition] ?? 1)) : null;
}

// Normalise a free-text condition (a CSV column, a store's variant title) into
// one of the five grades, or null when it genuinely can't be told — RiftCompare's
// normaliseCondition, minus its eBay vocabulary (OP's binder never reads eBay).
export function normaliseCondition(raw: string | null | undefined): keyof typeof CONDITIONS | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t || t === "default title") return null;
  if (/near\s*mint|\bnm\b|\bmint\b/.test(t)) return "NM";
  if (/light(ly)?\s*play|\blp\b/.test(t)) return "LP";
  if (/moderate(ly)?\s*play|\bmp\b/.test(t)) return "MP";
  if (/heav(ily)?\s*play|\bhp\b/.test(t)) return "HP";
  if (/damaged|\bdmg\b|\bdamage\b/.test(t)) return "DMG";
  return null;
}
