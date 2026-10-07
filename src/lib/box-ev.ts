// Box EV model — RiftCompare's lib/box-ev.ts, for One Piece. The maths, with no
// React and no Prisma, so it can be unit-tested without a database. The page
// supplies rows; this decides pools, averages and EV.
//
// WHAT IT REPLACES. OP Compare's /tools/box-value summed ONE COPY OF EVERY
// PRINTING in a set (Manga, SP, Treasure, Parallels and all) and set that
// "set value" beside the box price. A box of 288 cards almost never holds the
// chase prints that dominate such a sum, so it invited exactly the wrong
// comparison (a $2,000 "set value" beside a $110 box). An expected value
// weighs every pool by how often a box yields it.
//
// TWO RULES CARRIED OVER FROM RIFTCOMPARE:
//   • Chase prints are in the EV, in their OWN pools with their own rates —
//     never averaged into a base rarity, never dropped.
//   • Every value is the TCGplayer US market price (Card.marketUsd), converted
//     for display: one consistent yardstick in every market. It is not local
//     retail, and the page says so.
//
// THE RATES ARE COMMUNITY ESTIMATES (lib/pack-composition.ts): Bandai publishes
// none. They are set LOW on purpose and every one is editable.

import { PACKS_PER_BOX, PACK_SLOTS, perBoxRate, type PullRate } from "./pack-composition";

// ── Pools ────────────────────────────────────────────────────────────────────
// A pool is a set of cards one pull can produce: the standard printing by
// rarity, plus the four chase printings, each kept SEPARATE (a Manga averaged
// with a Parallel would understate one and overstate the other).
export const BASE_POOLS = ["Common", "Uncommon", "Rare", "Leader", "SuperRare", "SecretRare"] as const;
export const CHASE_POOLS = ["Parallel", "SP", "Treasure", "Manga"] as const;
export const POOL_ORDER = [...BASE_POOLS, ...CHASE_POOLS] as const;
export type PoolKey = (typeof POOL_ORDER)[number];

export const POOL_LABEL: Record<PoolKey, string> = {
  Common: "Common",
  Uncommon: "Uncommon",
  Rare: "Rare",
  Leader: "Leader",
  SuperRare: "Super Rare",
  SecretRare: "Secret Rare",
  Parallel: "Parallel",
  SP: "SP",
  Treasure: "Treasure Rare",
  Manga: "Manga",
};

export const isChasePool = (k: PoolKey): boolean => (CHASE_POOLS as readonly string[]).includes(k);

/** The minimum a card needs for us to classify it (data.ts CardLite satisfies it). */
export interface PoolCard {
  printing: string;
  rarity: string | null;
}

const BASE_BY_RARITY: Record<string, PoolKey> = { C: "Common", UC: "Uncommon", R: "Rare", L: "Leader", SR: "SuperRare", SEC: "SecretRare" };

/**
 * Which pool a card belongs to, or null if it is not a pack pull at all.
 * Promos, reprints, special foils and DON!! cards are not pulls from a set's
 * own booster packs (they come from events, tins, starter decks and other
 * products), so they are left out; a standard printing goes to its printed
 * rarity; the chase printings go to their own pools whatever their rarity.
 */
export function poolOf(card: PoolCard): PoolKey | null {
  switch (card.printing) {
    case "standard":
      return card.rarity ? (BASE_BY_RARITY[card.rarity] ?? null) : null;
    case "alt":
      return "Parallel";
    case "sp":
      return "SP";
    case "treasure":
      return "Treasure";
    case "manga":
      return "Manga";
    default:
      return null; // promo, reprint, foil, don
  }
}

// ── Pool statistics ──────────────────────────────────────────────────────────

export interface PoolStat {
  /** Mean value of a RANDOM card from this pool, in USD cents. */
  avgCents: number;
  /** Cards in the pool that carry a market price. */
  priced: number;
  /** Every card in the pool, priced or not. */
  total: number;
  /** Most valuable card in the pool. */
  topCents: number;
}

/**
 * Mean value of a random card of each pool. Divides by EVERY card in the pool,
 * not just the priced ones: a card with no market price is worth ~nothing to a
 * box opener, and dividing by the priced subset would claim the unpriced tail
 * is as valuable as the priced head. No outlier cap: TCGplayer's market price
 * is an aggregate, and in a chase pool the expensive card IS the signal.
 */
export function poolStats(cards: readonly (PoolCard & { valueCents: number | null })[]): Map<PoolKey, PoolStat> {
  const acc = new Map<PoolKey, { sum: number; priced: number; total: number; top: number }>();
  for (const c of cards) {
    const pool = poolOf(c);
    if (!pool) continue;
    const cell = acc.get(pool) ?? { sum: 0, priced: 0, total: 0, top: 0 };
    cell.total += 1;
    if (c.valueCents != null && c.valueCents > 0) {
      cell.sum += c.valueCents;
      cell.priced += 1;
      if (c.valueCents > cell.top) cell.top = c.valueCents;
    }
    acc.set(pool, cell);
  }
  const out = new Map<PoolKey, PoolStat>();
  for (const [pool, { sum, priced, total, top }] of acc) out.set(pool, { avgCents: total > 0 ? Math.round(sum / total) : 0, priced, total, topCents: top });
  return out;
}

/** Adapter for the page, which aggregates per pool server-side and ships only the totals plus a capped sample. */
export function poolStatsFromPools(pools: readonly { pool: PoolKey; avgUsdCents: number; topUsdCents: number; priced: number; total: number }[]): Map<PoolKey, PoolStat> {
  return new Map(pools.map((p) => [p.pool, { avgCents: p.avgUsdCents, topCents: p.topUsdCents, priced: p.priced, total: p.total }]));
}

// ── Pull rates ───────────────────────────────────────────────────────────────
// EXPECTED CARDS PER PACK, not probabilities. Expected value is linear, so the
// rates need not form a distribution — E[pack] = Σ rate × mean holds whatever
// they sum to, which is why the UI can expose them as free numbers. The UI
// shows the implied cards per pack as a sanity check.
//
// Common and Uncommon are per-PACK slot counts. Every other pool is a per-BOX
// estimate (PULL_RATES) divided by the box's packs, so a 20-pack box gets the
// same hits per box. Rare is the rare slot less the Super and Secret Rares that
// replace it: rare + SR + SEC = one rare-or-better card per pack (RiftCompare's
// "Rare + Epic = the rare slots" rule).
const slotCount = (key: string) => PACK_SLOTS.find((s) => s.key === key)?.count ?? 0;

export const DEFAULT_PACKS = PACKS_PER_BOX;

/** Per-box defaults for the pools priced from a per-box estimate. */
export const PER_BOX_DEFAULTS: Record<Exclude<PoolKey, "Common" | "Uncommon" | "Rare">, number> = {
  Leader: perBoxRate("leader"),
  SuperRare: perBoxRate("sr"),
  SecretRare: perBoxRate("sec"),
  Parallel: perBoxRate("parallel"),
  SP: perBoxRate("sp"),
  Treasure: perBoxRate("treasure"),
  Manga: perBoxRate("manga"),
};

/** Which PULL_RATES entry a pool's default comes from (for the provenance note). */
export const POOL_RATE_KEY: Partial<Record<PoolKey, PullRate["key"]>> = {
  Leader: "leader",
  SuperRare: "sr",
  SecretRare: "sec",
  Parallel: "parallel",
  SP: "sp",
  Treasure: "treasure",
  Manga: "manga",
};

/**
 * Expected cards per pack for every pool, for a box of `packs` packs. A pool
 * with no cards in this set gets 0 rather than a rate it can never pay out.
 */
export function derivedRates(opts: { counts: Map<PoolKey, number>; packs: number }): Record<PoolKey, number> {
  const { counts, packs } = opts;
  const perPack = Math.max(1, packs);
  const has = (p: PoolKey) => (counts.get(p) ?? 0) > 0;
  const rates = {} as Record<PoolKey, number>;
  rates.Common = has("Common") ? slotCount("common") : 0;
  rates.Uncommon = has("Uncommon") ? slotCount("uncommon") : 0;
  for (const p of Object.keys(PER_BOX_DEFAULTS) as (keyof typeof PER_BOX_DEFAULTS)[]) rates[p] = has(p) ? PER_BOX_DEFAULTS[p] / perPack : 0;
  rates.Rare = has("Rare") ? Math.max(0, slotCount("rare") - rates.SuperRare - rates.SecretRare) : 0;
  return rates;
}

/** "≈ 1 in N packs" for a per-pack rate below 1 — decimals like 0.0035 are unreadable. */
export function oneInPacks(rate: number): string | null {
  if (rate <= 0 || rate >= 1) return null;
  const n = Math.round(1 / rate);
  return `≈ 1 in ${n.toLocaleString("en-US")} packs`;
}

export interface EvLine {
  pool: PoolKey;
  label: string;
  rate: number;
  avgCents: number;
  topCents: number;
  priced: number;
  total: number;
  /** rate × avgCents — this pool's contribution to one pack. */
  contributionCents: number;
  /** Share of total pack EV, 0–1. The bar length in the UI. */
  share: number;
  chase: boolean;
}

export interface EvResult {
  lines: EvLine[];
  evPackCents: number;
  evBoxCents: number;
  /** Implied cards per pack across every pool — a sanity check on the rates. */
  cardsPerPack: number;
  /** EV ÷ box price, or null when no price has been entered. */
  ratio: number | null;
  /**
   * Share of the cards in the paying pools (rate above 0) that carry a market
   * price, 0–1. A new set with no prices yet has an EV of nearly nothing, which
   * says nothing about the box.
   */
  pricedShare: number;
  /** Share of the EV that comes from the chase pools, 0–1. */
  chaseShare: number;
  priceCents: number;
}

export function computeEv(opts: { stats: Map<PoolKey, PoolStat>; rates: Record<string, number>; packs: number; boxPriceCents: number }): EvResult {
  const { stats, rates, packs, boxPriceCents } = opts;
  const raw = POOL_ORDER.filter((p) => stats.has(p)).map((pool) => {
    const s = stats.get(pool)!;
    const rate = Math.max(0, rates[pool] ?? 0);
    return { pool, label: POOL_LABEL[pool], rate, avgCents: s.avgCents, topCents: s.topCents, priced: s.priced, total: s.total, contributionCents: rate * s.avgCents, chase: isChasePool(pool) };
  });
  const evPackExact = raw.reduce((a, l) => a + l.contributionCents, 0);
  const lines: EvLine[] = raw.map((l) => ({ ...l, contributionCents: Math.round(l.contributionCents), share: evPackExact > 0 ? l.contributionCents / evPackExact : 0 }));
  const evPackCents = Math.round(evPackExact);
  const evBoxCents = Math.round(evPackExact * Math.max(1, packs));
  const paying = raw.filter((l) => l.rate > 0);
  const payingTotal = paying.reduce((a, l) => a + l.total, 0);
  const pricedShare = payingTotal > 0 ? paying.reduce((a, l) => a + l.priced, 0) / payingTotal : 0;
  const chaseShare = lines.filter((l) => l.chase).reduce((a, l) => a + l.share, 0);
  return {
    lines,
    evPackCents,
    evBoxCents,
    pricedShare,
    chaseShare,
    cardsPerPack: raw.reduce((a, l) => a + l.rate, 0),
    ratio: boxPriceCents > 0 ? evBoxCents / boxPriceCents : null,
    priceCents: boxPriceCents,
  };
}

/** Below this share of priced cards in the paying pools, no verdict is given. */
export const VERDICT_MIN_PRICED_SHARE = 0.5;
/** At or above this, a positive verdict warns that a few chase cards carry it. */
export const VERDICT_CHASE_HEAVY = 0.9;

/**
 * Verdict shown against the box price (RiftCompare's thresholds). `ratio` is
 * EV ÷ price, so below 1 the PRICE is above the EV.
 *
 * Two guards RiftCompare's page does not need but a One Piece set does:
 * - Unpriced cards count as worth nothing, so a set whose pools are mostly
 *   unpriced (a set that has only just come out) reads far below its box price.
 *   Under VERDICT_MIN_PRICED_SHARE that is "not enough data", never "price is
 *   well above EV".
 * - An EV driven by one or two chase cards (a US$4,800 Parallel in a pool
 *   opened once in twelve packs) is a mean no single box reaches. The positive
 *   verdicts say so when chase pools carry VERDICT_CHASE_HEAVY of the EV.
 */
export function verdictFor(ratio: number | null, opts?: { pricedShare?: number | null; chaseShare?: number | null }) {
  if (ratio == null) return null;
  const priced = opts?.pricedShare;
  if (priced != null && priced < VERDICT_MIN_PRICED_SHARE) {
    return { tone: "flat" as const, emoji: "⏳", text: "Too few cards in this set have a market price yet to call it. The expected value is understated until they do." };
  }
  const heavy = (opts?.chaseShare ?? 0) >= VERDICT_CHASE_HEAVY;
  const caveat = heavy ? " Almost all of it is a handful of chase cards, so a typical box lands well below this average." : "";
  if (ratio >= 1.1) return { tone: heavy ? ("flat" as const) : ("up" as const), emoji: "🔥", text: "EV-positive at that price — opening beats buying singles on raw value (variance still applies)." + caveat };
  if (ratio >= 1) return { tone: heavy ? ("flat" as const) : ("up" as const), emoji: "⚖️", text: "Just above break-even — the pulls are worth about what you'd pay, on average." + caveat };
  if (ratio >= 0.85) return { tone: "flat" as const, emoji: "⚖️", text: "Roughly break-even — open it for the fun, not the value." };
  return { tone: "down" as const, emoji: "✋", text: "Price is well above EV — buying the singles you want is cheaper than ripping packs." };
}

// ── Which sets have a box to open ────────────────────────────────────────────
// Only booster, extra and premium booster sets come in booster boxes; starter
// and ultra decks, promos, events and collections are fixed products, so an
// "expected value of a box of random packs" describes nothing that exists. The
// page also requires a Booster Box product in the catalogue for the set.
export const BOOSTER_SET_KINDS: ReadonlySet<string> = new Set(["booster", "extra", "premium"]);

// ── The box price to start from ──────────────────────────────────────────────
// The cheapest OPEN store offer (in stock, fresh, a tracked store — never a
// TCGplayer reference or an eBay listing) for one of the set's Booster Boxes.

export interface BoxOfferListing {
  source: string;
  market: string;
  priceCents: number;
  inStock: boolean;
  url: string;
}

/** The cheapest in-stock tracked-store offer among a set's box products in one market. Pure. */
export function cheapestBoxOffer<T extends BoxOfferListing>(offers: readonly T[], market: string): T | null {
  let best: T | null = null;
  for (const o of offers) {
    if (o.market !== market || !o.inStock || !o.source.startsWith("store:")) continue;
    if (!best || o.priceCents < best.priceCents) best = o;
  }
  return best;
}
