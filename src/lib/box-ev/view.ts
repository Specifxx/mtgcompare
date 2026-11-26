// Box worth: what the page sends the browser (server side). The card lists shrink to prices only (the browser re-runs the average
// and the simulation when the reader changes the bulk floor); names travel only for the best pulls, worked out here.
import { CARDS_HUB } from "../cards";
import { cardChances, notCounted, type ResolvedBooster } from "./model";
import type { BoxView } from "./shared";
import type { BoxKind } from "./types";

/** TCGplayer's card name, without the collector-number tag a reader never needs ("Forest (0276)" keeps its number: it's the name). */
export function pullName(n: string): string {
  return n.replace(/\s*\((\d{3,4}[a-z]?)\)(?=\s*\()/i, "").replace(/\s+/g, " ").trim();
}

export function boxView(kind: BoxKind, b: ResolvedBooster, pulls = 12): BoxView {
  return {
    kind,
    packs: b.packs,
    slots: b.slots.map((s) => ({
      label: s.label,
      count: s.count,
      outcomes: s.outcomes.map((o) => ({
        label: o.label,
        pct: o.pct,
        p: o.p,
        lt1: o.lt1,
        pool: o.pool,
        found: o.found,
        foil: o.foil,
        vals: o.cards.map((c) => c.v).filter((v): v is number => v != null),
        cards: o.cards.length,
      })),
    })),
    pulls: cardChances(b)
      .filter((c) => c.v != null && c.inBox > 0)
      .sort((a, c) => (c.v ?? 0) - (a.v ?? 0))
      .slice(0, pulls)
      .map((c) => ({ name: pullName(c.n), href: `${CARDS_HUB}/${c.g}/${c.s}`, v: c.v ?? 0, foil: c.foil, inBox: c.inBox })),
    notCounted: notCounted(b),
  };
}

