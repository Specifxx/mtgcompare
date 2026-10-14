import { COLORS, COLOR_GROUPS, COLOR_KEYS, ORACLE_FLAGS, colorKind, legalityOf } from "../constants";
import type { Country } from "../country";
import type { CardLite, OracleMini, SealedLite, SetLite } from "../data";
import { TRACK_DEFAULTS } from "../track";

// The pure selection rules of the data-driven posts (owner WP17): which rows each post shows, decided here so a test can run them on real
// products (tests/blog-posts.test.ts) and so src/lib/blog/context.ts only loads. Every rule ranks by the TCGplayer MARKET price of the unit a
// row shows (`marketUsd`, market only): a unit priced only by a thin single listing (`lowOnly`) is never ranked, a token or art card
// (`cls != 0`) never counts, and a list shows one unit per card.

const priced = (c: CardLite): c is CardLite & { marketUsd: number } => c.cls === 0 && !c.lowOnly && c.marketUsd != null && c.marketUsd > 0;
/** Ascending by market, then the lower id: the order a "cheapest" list is read in. */
const cheaperFirst = (a: CardLite, b: CardLite): number => (a.marketUsd ?? Infinity) - (b.marketUsd ?? Infinity) || a.id - b.id;

// ── weekly movers ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Store prices, price history and weekly moves exist for units worth this much and up (the importer's TRACK_FLOOR_CENTS, contract 5.3): the posts quote it, never a typed figure. */
export const TRACKED_FROM_CENTS = TRACK_DEFAULTS.trackFloorCents;
/**
 * The movers post ranks only cards worth at least this much today (TCGplayer market, US cents). It is the floor at which a unit's price
 * history is kept, so every row has a recorded week, and a 30-cent card that doubles never tops the list.
 */
export const MOVER_FLOOR_CENTS = TRACKED_FROM_CENTS;
/** Rows per table: the week's risers and fallers, then the month's. */
export const MOVER_ROWS = 15;
export const MONTH_MOVER_ROWS = 10;
export type MoveDir = "up" | "down";

/** The change a mover is ranked by: its unit's TCGplayer market change over the window, in percent. */
export const moveOf = (c: Pick<CardLite, "change7d" | "change30d">, window: 7 | 30): number | null => (window === 30 ? c.change30d : c.change7d);

/**
 * The risers (or fallers) of one window: priced class-0 units worth at least `floorCents`, moving the right way, one row per card (the first
 * unit of a product wins), largest move first, then the dearer card, then the lower id. The movers feed already holds one unit per card
 * (the headline unit, the free /movers view); this re-checks it so the post never depends on the file's order.
 */
export function moverList(cards: readonly CardLite[], dir: MoveDir, window: 7 | 30, o: { floorCents?: number; n?: number } = {}): CardLite[] {
  const floor = o.floorCents ?? MOVER_FLOOR_CENTS, n = o.n ?? MOVER_ROWS, seen = new Set<number>(), out: CardLite[] = [];
  for (const c of cards) {
    const m = moveOf(c, window);
    if (!priced(c) || c.marketUsd < floor || m == null || !(dir === "up" ? m > 0 : m < 0) || seen.has(c.id)) continue;
    seen.add(c.id); out.push(c);
  }
  const sign = dir === "up" ? -1 : 1;
  return out.sort((a, b) => sign * (moveOf(a, window)! - moveOf(b, window)!) || (b.marketUsd ?? 0) - (a.marketUsd ?? 0) || a.id - b.id).slice(0, n);
}

// ── the cheapest mythic rares by colour ──────────────────────────────────────────────────────────────────────────────────────

/** How many of the newest expansions the colour post reads, and how many cards it shows per colour and in the special-frame table. */
export const MYTHIC_SETS = 4;
export const MYTHIC_ROWS = 5;
export const TREATED_ROWS = 10;
/** An expansion needs this many listed printings to count as a released set worth reading (a few promo cards filed early do not). */
export const MYTHIC_SET_MIN_CARDS = 100;
/** The frame treatments the "special frame on a budget" table reads: the alternate frames most sets print their mythics in. */
export const BLING_TREATMENTS = ["borderless", "showcase", "extended"] as const;

export interface ColourGroup {
  key: string;
  label: string;
  /** The browse engine's colour filter: a card's colour (Scryfall's, not its colour identity); a card without a Scryfall join has none and is left out. */
  colors: { mask: number; mode: "exact" | "multi" | "colorless" };
}
/** The five colours (exactly one colour each), then gold cards and colourless ones: the split of /colors, so the counts never overlap. */
export const COLOUR_GROUPS: readonly ColourGroup[] = [
  ...COLOR_KEYS.map((k): ColourGroup => ({ key: COLORS[k].slug, label: COLORS[k].label, colors: { mask: COLORS[k].bit, mode: "exact" } })),
  { key: COLOR_GROUPS.multicolor.slug, label: COLOR_GROUPS.multicolor.label, colors: { mask: 0, mode: "multi" } },
  { key: COLOR_GROUPS.colorless.slug, label: COLOR_GROUPS.colorless.label, colors: { mask: 0, mode: "colorless" } },
];

/** The `k` newest released expansions (set kind "expansion", not a rolling bucket group, released on or before `today`, with at least MYTHIC_SET_MIN_CARDS listed printings), newest first. */
export function newestExpansions(sets: readonly SetLite[], today: string, k = MYTHIC_SETS): SetLite[] {
  return sets
    .filter((s) => s.kind === "expansion" && !s.bucket && !!s.releasedOn && s.releasedOn <= today && s.cardCount >= MYTHIC_SET_MIN_CARDS)
    .sort((a, b) => (b.releasedOn! < a.releasedOn! ? -1 : b.releasedOn! > a.releasedOn! ? 1 : b.id - a.id))
    .slice(0, k);
}

/**
 * One row per card from a list of printings: the cheapest priced printing of each Oracle card (a product with no Scryfall join counts as its
 * own card), cheapest first. A low-only unit and a token or art card are left out.
 */
export function cheapestPerCard(cards: readonly CardLite[], n: number): CardLite[] {
  const best = new Map<string, CardLite>();
  for (const c of cards) {
    if (!priced(c)) continue;
    const key = c.oracleNo ? `o${c.oracleNo}` : `p${c.id}`, cur = best.get(key);
    if (!cur || cheaperFirst(c, cur) < 0) best.set(key, c);
  }
  return [...best.values()].sort(cheaperFirst).slice(0, n);
}

// ── Commander staples ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type StapleRole = "Ramp" | "Land" | "Card draw" | "Removal" | "Board wipe" | "Counterspell" | "Protection" | "Tutor" | "Recursion";
export interface Staple { name: string; role: StapleRole }
/** The day COMMANDER_STAPLES was chosen and checked against the Commander banned list. */
export const STAPLES_CHOSEN_ON = "2026-10-14";
/**
 * The Commander staples the post prices: chosen by hand on STAPLES_CHOSEN_ON from the cards Commander players meet in deck after deck, spread
 * over the five colours and colourless and over the jobs every deck has to do (ramp, card draw, removal, board wipes, counters, protection,
 * tutors, lands). Names a Commander player recognises on sight; no Reserved List card and nothing priced like a collectible. Checked by hand
 * against the Commander banned list as last verified (mid-2026, after the September 2024 bans of Dockside Extortionist, Jeweled Lotus, Mana
 * Crypt and Nadu, Winged Wisdom, which are left out on purpose): none was on it. The post does not rely on that check: it reads each card's
 * Commander legality from Scryfall with every import and leaves a card that is banned or not legal out of its tables (stapleStatus). Order:
 * colourless first, then W U B R G.
 * Names are Scryfall's Oracle names; a name that stops resolving is reported in the post, never guessed.
 */
export const COMMANDER_STAPLES: readonly Staple[] = [
  { name: "Sol Ring", role: "Ramp" },
  { name: "Arcane Signet", role: "Ramp" },
  { name: "Fellwar Stone", role: "Ramp" },
  { name: "Thought Vessel", role: "Ramp" },
  { name: "Lightning Greaves", role: "Protection" },
  { name: "Swiftfoot Boots", role: "Protection" },
  { name: "Command Tower", role: "Land" },
  { name: "Exotic Orchard", role: "Land" },
  { name: "Swords to Plowshares", role: "Removal" },
  { name: "Path to Exile", role: "Removal" },
  { name: "Generous Gift", role: "Removal" },
  { name: "Smothering Tithe", role: "Ramp" },
  { name: "Teferi's Protection", role: "Protection" },
  { name: "Rhystic Study", role: "Card draw" },
  { name: "Cyclonic Rift", role: "Board wipe" },
  { name: "Counterspell", role: "Counterspell" },
  { name: "Swan Song", role: "Counterspell" },
  { name: "Fierce Guardianship", role: "Counterspell" },
  { name: "Demonic Tutor", role: "Tutor" },
  { name: "Vampiric Tutor", role: "Tutor" },
  { name: "Toxic Deluge", role: "Board wipe" },
  { name: "Feed the Swarm", role: "Removal" },
  { name: "Deadly Rollick", role: "Removal" },
  { name: "Jeska's Will", role: "Ramp" },
  { name: "Chaos Warp", role: "Removal" },
  { name: "Deflecting Swat", role: "Protection" },
  { name: "Blasphemous Act", role: "Board wipe" },
  { name: "Vandalblast", role: "Removal" },
  { name: "Cultivate", role: "Ramp" },
  { name: "Kodama's Reach", role: "Ramp" },
  { name: "Nature's Lore", role: "Ramp" },
  { name: "Three Visits", role: "Ramp" },
  { name: "Beast Within", role: "Removal" },
  { name: "Heroic Intervention", role: "Protection" },
  { name: "Eternal Witness", role: "Recursion" },
];

/** One staple as the post shows it: the Oracle card its name resolves to and the printing it is priced at (null when either is missing). */
export interface StapleRow { staple: Staple; oracle: OracleMini | null; card: CardLite | null }
/**
 *  priced    a printing with a TCGplayer market price: ranked, counted, totalled
 *  low-only  a printing priced only by a thin single listing: shown with its low, never totalled
 *  unpriced  the card resolved but no printing could be priced
 *  unknown   the name no longer resolves to a card
 *  banned    Scryfall says the card is banned (or not legal) in Commander: left out of the tables and named
 */
export type StapleStatus = "priced" | "low-only" | "unpriced" | "unknown" | "banned";
export function stapleStatus(r: StapleRow): StapleStatus {
  if (!r.oracle) return "unknown";
  const legal = legalityOf(r.oracle.legal, "commander");
  if (legal === "banned" || legal === "not_legal") return "banned";                 // unknown legality ("?") is not "not legal": it renders as nothing
  if (!r.card) return "unpriced";
  if (r.card.marketUsd != null && !r.card.lowOnly) return "priced";
  return r.card.valueUsd != null ? "low-only" : "unpriced";
}
/** The rows of the curated list in its own order, each name looked up in the folded-name map `oracles` and priced at `printings.get(oracle.no)`. */
export function stapleRows(staples: readonly Staple[], oracles: ReadonlyMap<string, OracleMini>, printings: ReadonlyMap<number, CardLite>, keyOf: (name: string) => string): StapleRow[] {
  return staples.map((staple) => {
    const oracle = oracles.get(keyOf(staple.name)) ?? null;
    const card = oracle ? printings.get(oracle.no) ?? null : null;
    return { staple, oracle, card: card && card.cls === 0 ? card : null };
  });
}

/** The colour-identity group a staple is listed under: its Commander colour identity (Scryfall), the split of COLOUR_GROUPS. */
export function identityGroup(identity: number): string {
  const kind = colorKind(identity);
  if (kind === "colorless") return COLOR_GROUPS.colorless.slug;
  if (kind === "multi") return COLOR_GROUPS.multicolor.slug;
  const mono = COLOR_KEYS.find((k) => COLORS[k].bit === (identity & 31));
  return mono ? COLORS[mono].slug : COLOR_GROUPS.multicolor.slug;
}
/** Listing order of the identity groups in the staples post: colourless first (the cards every deck can play), then W U B R G, then gold. */
export const STAPLE_GROUP_ORDER: readonly string[] = [COLOR_GROUPS.colorless.slug, ...COLOR_KEYS.map((k) => COLORS[k].slug), COLOR_GROUPS.multicolor.slug];

export interface StapleSummary {
  /** Rows that may be shown (priced, low-only, unpriced), in list order. */
  shown: StapleRow[];
  priced: StapleRow[];
  banned: StapleRow[];
  unknown: StapleRow[];
  /** Sum of the market prices of the priced rows (US cents). */
  totalCents: number;
  under1: number;
  under5: number;
  /** Priced rows, dearest first. */
  dearest: StapleRow[];
  /** Shown rows whose Oracle card Scryfall marks as a Commander Game Changer. */
  gameChangers: StapleRow[];
}
export function stapleSummary(rows: readonly StapleRow[]): StapleSummary {
  const by = (s: StapleStatus) => rows.filter((r) => stapleStatus(r) === s);
  const shown = rows.filter((r) => ["priced", "low-only", "unpriced"].includes(stapleStatus(r)));
  const priced = by("priced"), cents = (r: StapleRow): number => r.card!.marketUsd!;
  return {
    shown,
    priced,
    banned: by("banned"),
    unknown: by("unknown"),
    totalCents: priced.reduce((t, r) => t + cents(r), 0),
    under1: priced.filter((r) => cents(r) < 100).length,
    under5: priced.filter((r) => cents(r) < 500).length,
    dearest: [...priced].sort((a, b) => cents(b) - cents(a) || a.card!.id - b.card!.id),
    gameChangers: shown.filter((r) => (r.oracle!.flags & ORACLE_FLAGS.GAME_CHANGER) !== 0),
  };
}

// ── the cheapest booster boxes ───────────────────────────────────────────────────────────────────────────────────────────────

/** Boxes per market table. */
export const BOX_ROWS = 10;
/** Booster boxes a store in `country` has in stock (a live low and at least one store), cheapest listing first, then the lower TCGplayer market, then the lower id. */
export function cheapestBoxes(boxes: readonly SealedLite[], country: Country, n = BOX_ROWS): SealedLite[] {
  return boxes
    .filter((b) => !b.presale && b.low[country] != null && b.low[country]! > 0 && (b.stores[country] ?? 0) > 0)
    .sort((a, b) => a.low[country]! - b.low[country]! || (a.marketUsd ?? Infinity) - (b.marketUsd ?? Infinity) || a.id - b.id)
    .slice(0, n);
}
/** A box's cost per pack in the same cents as `cents`, when the pack count is known. */
export const perPack = (cents: number | null | undefined, packCount: number | null): number | null => (cents != null && packCount && packCount > 0 ? Math.round(cents / packCount) : null);
