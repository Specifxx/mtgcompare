// Box worth: the odds resolved against the committed TCGplayer card prices (lib/cards.ts). Server and scripts only (reads files).
import { readSet, readSets, type CardRow } from "../cards";
import { resolveBooster, type ResolvedBooster } from "./model";
import type { BoxKind, SetOdds } from "./types";

export interface ResolvedSet {
  odds: SetOdds;
  /** The set's main card group (data/cards/sets/<slug>.json). */
  group: string;
  /** When the card prices were read (sets.json generatedAt). */
  pricesAt: string;
  boxes: Partial<Record<BoxKind, ResolvedBooster>>;
}

/** The set's card group slug: the group lib/cards.ts filed under this sealed set code. */
export function mainGroupOf(code: string): string | null {
  return readSets().sets.find((s) => s.sealed === code)?.slug ?? null;
}

export function resolveSetBoxes(odds: SetOdds): ResolvedSet | null {
  const group = mainGroupOf(odds.code);
  if (!group) return null;
  const memo = new Map<string, readonly CardRow[]>();
  const get = (slug: string): readonly CardRow[] => {
    let v = memo.get(slug);
    if (!v) {
      v = readSet(slug);
      memo.set(slug, v);
    }
    return v;
  };
  if (!get(group).length) return null;
  const boxes: ResolvedSet["boxes"] = {};
  if (odds.play) boxes.play = resolveBooster(odds.play, group, get);
  if (odds.collector) boxes.collector = resolveBooster(odds.collector, group, get);
  return { odds, group, pricesAt: readSets().generatedAt, boxes };
}
