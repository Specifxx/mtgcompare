// ─────────────────────────────────────────────────────────────────────────────
// WHAT IS IN A ONE PIECE CARD GAME BOOSTER PACK — AND HOW SURE WE ARE
// ─────────────────────────────────────────────────────────────────────────────
// RiftCompare's lib/pack-composition.ts quotes Riot's own published pack
// contents. ONE PIECE HAS NO EQUIVALENT: Bandai publishes no pull rates for the
// English One Piece Card Game. Every number below is therefore a COMMUNITY
// ESTIMATE from box and case openings, marked `sourced: false`, with the pages
// it comes from listed in `sources` so anyone can check or argue with it.
//
// THE DEFAULTS ERR LOW ON PURPOSE (wave2-plan Track 3 item 3). An expected
// value must never talk anyone into opening a box: where the sources disagree,
// the lower rate is taken (SR 7 a box, not 8–10; SEC one per two boxes, between
// slab-z's one per three and the others' one per box; SP and Treasure one per
// case; Manga one per three cases). Every rate is editable on /tools/box-ev.
//
// Pack size: an English main-set booster box is 24 packs of 12 cards; a case
// is 12 boxes. Premium and Extra booster boxes differ, so the calculator takes
// the box's own pack count from the catalogue (Sealed.packCount) and falls
// back to PACKS_PER_BOX.

/** The community pages every estimate below draws on. */
export const PACK_SOURCES = {
  tcgtalk: "https://tcgtalk.com/guides/one-piece-tcg-box-pull-rates",
  slabz: "https://www.slab-z.com/post/one-piece-tcg-rarities-pull-rates-complete-guide-updated-2026",
  bountytcg: "https://www.bountytcg.app/en/blog/op-17-pull-rates-and-box-value",
  onepiecetcg: "https://one-piece-tcg.com/guides/card-rarity-guide",
  danireon: "https://www.danireon.com/en-us/blogs/news/how-many-packs-are-in-a-one-piece-booster-box",
} as const;

const ALL_SOURCES = [PACK_SOURCES.tcgtalk, PACK_SOURCES.slabz, PACK_SOURCES.bountytcg, PACK_SOURCES.onepiecetcg];

export interface PackSlot {
  key: string;
  label: string;
  /** How many of this slot are in every pack. */
  count: number;
  note: string;
  /** Bandai states this outright. Never true for One Piece: nothing is published. */
  sourced: boolean;
  sources: readonly string[];
}

/**
 * An English booster pack, slot by slot, as box openings describe it. Seven
 * commons and three uncommons are INFERRED (the 12-card pack less the other
 * slots); one rare-or-better slot per pack is the consensus of every source.
 */
export const PACK_SLOTS: PackSlot[] = [
  { key: "common", label: "Common", count: 7, sourced: false, sources: ALL_SOURCES, note: "Inferred: the 12-card pack less the uncommon, rare and extra slots." },
  { key: "uncommon", label: "Uncommon", count: 3, sourced: false, sources: ALL_SOURCES, note: "Inferred, as the commons are." },
  {
    key: "rare",
    label: "Rare or better",
    count: 1,
    sourced: false,
    sources: [PACK_SOURCES.tcgtalk, PACK_SOURCES.slabz, PACK_SOURCES.onepiecetcg],
    note: "One card per pack is a Rare at minimum; a Super Rare or Secret Rare takes its place.",
  },
  {
    key: "extra",
    label: "Leader, Parallel or other",
    count: 1,
    sourced: false,
    sources: ALL_SOURCES,
    note: "The twelfth card: often a common or uncommon, sometimes a Leader, a Parallel or one of the chase prints.",
  },
];

export const CARDS_PER_PACK = PACK_SLOTS.reduce((n, s) => n + s.count, 0); // 12
export const PACKS_PER_BOX = 24;
export const BOXES_PER_CASE = 12;

export interface PullRate {
  key: "leader" | "sr" | "sec" | "parallel" | "sp" | "treasure" | "manga";
  label: string;
  /** How the sources phrase it. */
  frequency: string;
  /** Our default, per 24-pack box. */
  perBox: number;
  /** The same as ≈ one in N packs at 24 packs a box (for "how many boxes" maths). */
  onePerPacks: number;
  /** The range the sources give, per box, for the slider's hint. */
  range: string;
  sourced: false;
  sources: readonly string[];
  note: string;
}

const per = (perBox: number) => Math.round((PACKS_PER_BOX / perBox) * 100) / 100;

/** The community estimates, rarest last. Defaults are the LOW end of each range. */
export const PULL_RATES: PullRate[] = [
  {
    key: "leader",
    label: "Leader",
    frequency: "≈5 per box",
    perBox: 5,
    onePerPacks: per(5),
    range: "4–6 a box (about one in two packs elsewhere)",
    sourced: false,
    sources: [PACK_SOURCES.onepiecetcg, PACK_SOURCES.tcgtalk, PACK_SOURCES.slabz],
    note: "One source counts 4–6 a box, two say about one every two packs; 5 sits at the conservative end.",
  },
  {
    key: "sr",
    label: "Super Rare",
    frequency: "≈7 per box",
    perBox: 7,
    onePerPacks: per(7),
    range: "5–10 a box",
    sourced: false,
    sources: ALL_SOURCES,
    note: "The lowest of the point estimates (7, 8, 8–10, 5–8). A Super Rare takes the rare slot.",
  },
  {
    key: "sec",
    label: "Secret Rare",
    frequency: "≈1 per 2 boxes",
    perBox: 0.5,
    onePerPacks: per(0.5),
    range: "one per 3 boxes to one a box",
    sourced: false,
    sources: ALL_SOURCES,
    note: "Between slab-z's one per three boxes and the others' one a box. A Secret Rare takes the rare slot.",
  },
  {
    key: "parallel",
    label: "Parallel (alt art)",
    frequency: "≈2 per box",
    perBox: 2,
    onePerPacks: per(2),
    range: "1–3 a box",
    sourced: false,
    sources: ALL_SOURCES,
    note: "Every source agrees on about two a box, across all rarities.",
  },
  {
    key: "sp",
    label: "SP",
    frequency: "≈1 per case",
    perBox: 1 / BOXES_PER_CASE,
    onePerPacks: per(1 / BOXES_PER_CASE),
    range: "1–2 a case",
    sourced: false,
    sources: [PACK_SOURCES.tcgtalk, PACK_SOURCES.slabz, PACK_SOURCES.bountytcg, PACK_SOURCES.onepiecetcg],
    note: "The low end of 1–2 a case.",
  },
  {
    key: "treasure",
    label: "Treasure Rare",
    frequency: "≈1 per case",
    perBox: 1 / BOXES_PER_CASE,
    onePerPacks: per(1 / BOXES_PER_CASE),
    range: "none to one a box",
    sourced: false,
    sources: [PACK_SOURCES.slabz, PACK_SOURCES.onepiecetcg],
    note: "slab-z counts about one a case; one-piece-tcg.com's range is far wider. No source is reliable here.",
  },
  {
    key: "manga",
    label: "Manga",
    frequency: "≈1 per 3 cases",
    perBox: 1 / (3 * BOXES_PER_CASE),
    onePerPacks: per(1 / (3 * BOXES_PER_CASE)),
    range: "one per case to one per 6 cases",
    sourced: false,
    sources: [PACK_SOURCES.tcgtalk, PACK_SOURCES.slabz, PACK_SOURCES.bountytcg, PACK_SOURCES.onepiecetcg],
    note: "The middle of a spread from one a case to one per six cases, rounded down.",
  },
];

/** One rate's per-box default, by key. */
export function perBoxRate(key: PullRate["key"]): number {
  return PULL_RATES.find((r) => r.key === key)?.perBox ?? 0;
}

/** The pack as prose: "7 common, 3 uncommon, 1 rare or better, 1 leader, parallel or other — 12 cards". */
export const PACK_SUMMARY = `${PACK_SLOTS.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ")} — ${CARDS_PER_PACK} cards`;
