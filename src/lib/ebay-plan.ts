// The eBay pass's plan: which (unit, market) pairs to search this run, in what order, within what budget. PURE (no network, no database), pinned by tests/ebay-plan.test.ts and
// tests/ebay-rift-priority.test.ts, which are the build-enforced quota model.
//
// MTG Compare shares RiftCompare's eBay keyset (EBAY_KEYSET_MODE=shared, contract 10.1): 5,000 Browse calls a day for both sites. Rift is first. MTG spends
//   min(ledger allowance, live remaining - reserve(now, reset))   with the reserve covering Rift's own jobs still to run before the quota resets,
// reads the live remaining count BEFORE and DURING a run, fails closed when it cannot, stops on a 429 and records every call in EbayLedger. The first week is observe-only
// (EBAY_OBSERVE_ONLY=1: quota reads, zero Browse calls) so Rift's real usage is measured before MTG spends.
//
// The unit of work is a card NAME (an Oracle) or a sealed product; one search of a name prices every printing of it. Value floors and a score decide who is searched:
//   tier A  daily          the dearest/most wanted names, up to 45% of the singles slice
//   tier B  every 72 h     the next names down to the floor
//   tier C  never          below the floor or unpopular: the visitor gets an affiliate eBay search link (zero calls)
// Changing a floor, slice, share or interval changes the arithmetic: update tests/ebay-plan.test.ts, the methodology copy and DECISIONS.

/** The markets the eBay pass knows. SG has no EPN programme (search link only). */
export type EbayMarket = "US" | "UK" | "AU" | "EU" | "CA" | "SG";
export const EBAY_MARKETS: EbayMarket[] = ["US", "UK", "AU", "EU", "CA", "SG"];
/** Markets searched for singles. CA singles are DERIVED from the US search (0 calls); SG is search-link only. */
export const SINGLES_MARKETS: EbayMarket[] = ["US", "UK", "AU", "EU"];
export const SEALED_MARKETS: EbayMarket[] = ["US", "UK", "AU", "EU", "CA"];
/** Spill order and shares: after the US plan, what is left goes to UK / AU / EU by these shares. */
export const SPILL_SHARES: Partial<Record<EbayMarket, number>> = { UK: 0.4, AU: 0.3, EU: 0.3 };

/** EbayTrack.tier */
export const TIER = { C: 0, A: 1, B: 2, SEALED: 3, BANNER: 4 } as const;
export type TierCode = (typeof TIER)[keyof typeof TIER];
/** The class of a planned pair: the ledger breakdown counts calls by it. */
export type PairClass = "banner" | "A" | "B" | "sealed";
export const PAIR_CLASSES: PairClass[] = ["banner", "A", "B", "sealed"];
export const CLASS_PRIORITY: Record<PairClass, number> = { banner: 0, A: 1, B: 2, sealed: 3 };

// ── env parsing ──────────────────────────────────────────────────────────────

/** An integer env value; "" and anything non-numeric are UNSET (null), never 0. */
export function envInt(v: string | undefined | null): number | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t || !/^-?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}
export function envNum(v: string | undefined | null): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/** "1"/"true"/"yes" are true, "0"/"false"/"no" are false, anything else is the default. */
export function envBool(v: string | undefined | null, dflt: boolean): boolean {
  const t = (v ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(t)) return true;
  if (["0", "false", "no", "off"].includes(t)) return false;
  return dflt;
}

// ── configuration (one module, env-overridable, one test pinning it) ─────────

export interface EbayConfig {
  apiEnabled: boolean;              // EBAY_API_ENABLED: the kill switch (0 = no Browse call, ever)
  dailyBudget: number;              // EBAY_DAILY_CALL_BUDGET: MTG's calls a day out of the shared 5,000
  keysetMode: "shared" | "own";     // EBAY_KEYSET_MODE
  observeOnly: boolean;             // EBAY_OBSERVE_ONLY: quota reads only (default ON until the owner turns it off after a week)
  quotaReserve: number;             // EBAY_QUOTA_RESERVE: own mode: never spent; shared mode: Rift's own untouchable reserve
  maxCalls: number | null;          // EBAY_MAX_CALLS: per-run cap
  slices: { banner: number; singles: number; sealed: number; buffer: number };   // EBAY_SLICE_BANNER / _SINGLES / _SEALED / _BUFFER, fractions summing to 1
  minValueCents: number;            // EBAY_MIN_VALUE_CENTS: no call below this (singles)
  tierAMinCents: number;            // EBAY_TIER_A_MIN_CENTS
  tierAShare: number;               // EBAY_TIER_A_SHARE: tier A's share of the singles slice
  bIntervalHours: number;           // EBAY_B_INTERVAL_HOURS: allowed 48 to 96
  retryRate: number;                // EBAY_RETRY_RATE: share of name searches whose first query returns nothing and is retried
  sealedMinCents: number;           // EBAY_SEALED_MIN_CENTS: boxes, cases, displays
  sealedDeckMinCents: number;       // EBAY_SEALED_DECK_MIN_CENTS: commander decks, bundles, Secret Lair
  sealedIntervalHours: number;      // EBAY_SEALED_INTERVAL_HOURS
  bannerUsNames: number;            // EBAY_BANNER_US_NAMES: pool names searched every 6 h in the US
  bannerOtherNames: number;         // EBAY_BANNER_OTHER_NAMES: pool names searched daily in each of UK, AU, EU
  bannerUsIntervalHours: number;    // EBAY_BANNER_US_INTERVAL_HOURS
  bannerOtherIntervalHours: number;
  hysteresis: number;               // a name changes tier only when its rank is this much beyond the cut line
  riftOwnReserve: number;           // EBAY_RIFT_OWN_RESERVE: Rift keeps this untouched
  riftMargin: number;               // EBAY_RIFT_MARGIN
  riftBoost: number;                // EBAY_RIFT_RESERVE_BOOST: raise by hand for a Rift launch window
  riftDailyPlan: number;            // EBAY_RIFT_DAILY_PLAN: Rift's planned calls a day
  otherSiblings: number;            // EBAY_OTHER_SIBLINGS: the other sibling site's planned calls a day (Pokemon)
}
export const DEFAULT_EBAY_CONFIG: EbayConfig = {
  apiEnabled: true, dailyBudget: 1000, keysetMode: "shared", observeOnly: true, quotaReserve: 600, maxCalls: null,
  slices: { banner: 0.15, singles: 0.6, sealed: 0.15, buffer: 0.1 },
  minValueCents: 1000, tierAMinCents: 5000, tierAShare: 0.45, bIntervalHours: 72, retryRate: 0.15,
  sealedMinCents: 10000, sealedDeckMinCents: 6000, sealedIntervalHours: 72,
  bannerUsNames: 24, bannerOtherNames: 11, bannerUsIntervalHours: 6, bannerOtherIntervalHours: 24, hysteresis: 0.15,
  riftOwnReserve: 600, riftMargin: 300, riftBoost: 0, riftDailyPlan: 3000, otherSiblings: 60,
};
/** Parse the environment into a config; a value outside its allowed range is ignored (the default stays) and named in `problems`. */
export function ebayConfigFromEnv(env: Record<string, string | undefined> = process.env): { cfg: EbayConfig; problems: string[] } {
  const d = DEFAULT_EBAY_CONFIG;
  const problems: string[] = [];
  const int = (name: string, dflt: number, min: number, max: number): number => {
    const n = envInt(env[name]);
    if (n == null) return dflt;
    if (n < min || n > max) { problems.push(`${name}=${n} is outside ${min}..${max} - using ${dflt}`); return dflt; }
    return n;
  };
  const frac = (name: string, dflt: number): number => {
    const n = envNum(env[name]);
    if (n == null) return dflt;
    if (n < 0 || n > 1) { problems.push(`${name}=${n} is outside 0..1 - using ${dflt}`); return dflt; }
    return n;
  };
  const mode = (env.EBAY_KEYSET_MODE ?? "").trim().toLowerCase();
  if (mode && mode !== "shared" && mode !== "own") problems.push(`EBAY_KEYSET_MODE=${JSON.stringify(env.EBAY_KEYSET_MODE)} is not shared or own - using shared`);
  let slices = { banner: frac("EBAY_SLICE_BANNER", d.slices.banner), singles: frac("EBAY_SLICE_SINGLES", d.slices.singles), sealed: frac("EBAY_SLICE_SEALED", d.slices.sealed), buffer: frac("EBAY_SLICE_BUFFER", d.slices.buffer) };
  if (Math.abs(slices.banner + slices.singles + slices.sealed + slices.buffer - 1) > 1e-6) { problems.push("EBAY_SLICE_* do not sum to 1 - using the defaults"); slices = { ...d.slices }; }
  const maxCalls = envInt(env.EBAY_MAX_CALLS);
  const cfg: EbayConfig = {
    apiEnabled: env.EBAY_API_ENABLED == null || env.EBAY_API_ENABLED.trim() === "" ? d.apiEnabled : envBool(env.EBAY_API_ENABLED, d.apiEnabled),
    dailyBudget: int("EBAY_DAILY_CALL_BUDGET", d.dailyBudget, 0, 5000),
    keysetMode: mode === "own" ? "own" : "shared",
    observeOnly: envBool(env.EBAY_OBSERVE_ONLY, d.observeOnly),
    quotaReserve: int("EBAY_QUOTA_RESERVE", d.quotaReserve, 0, 5000),
    maxCalls: maxCalls != null && maxCalls > 0 ? maxCalls : null,
    slices,
    minValueCents: int("EBAY_MIN_VALUE_CENTS", d.minValueCents, 100, 1_000_000),
    tierAMinCents: int("EBAY_TIER_A_MIN_CENTS", d.tierAMinCents, 100, 10_000_000),
    tierAShare: frac("EBAY_TIER_A_SHARE", d.tierAShare),
    bIntervalHours: int("EBAY_B_INTERVAL_HOURS", d.bIntervalHours, 48, 96),
    retryRate: frac("EBAY_RETRY_RATE", d.retryRate),
    sealedMinCents: int("EBAY_SEALED_MIN_CENTS", d.sealedMinCents, 100, 10_000_000),
    sealedDeckMinCents: int("EBAY_SEALED_DECK_MIN_CENTS", d.sealedDeckMinCents, 100, 10_000_000),
    sealedIntervalHours: int("EBAY_SEALED_INTERVAL_HOURS", d.sealedIntervalHours, 24, 168),
    bannerUsNames: int("EBAY_BANNER_US_NAMES", d.bannerUsNames, 0, 64),
    bannerOtherNames: int("EBAY_BANNER_OTHER_NAMES", d.bannerOtherNames, 0, 64),
    bannerUsIntervalHours: int("EBAY_BANNER_US_INTERVAL_HOURS", d.bannerUsIntervalHours, 1, 48),
    bannerOtherIntervalHours: int("EBAY_BANNER_OTHER_INTERVAL_HOURS", d.bannerOtherIntervalHours, 6, 96),
    hysteresis: frac("EBAY_HYSTERESIS", d.hysteresis),
    riftOwnReserve: int("EBAY_RIFT_OWN_RESERVE", d.riftOwnReserve, 0, 5000),
    riftMargin: int("EBAY_RIFT_MARGIN", d.riftMargin, 0, 5000),
    riftBoost: int("EBAY_RIFT_RESERVE_BOOST", d.riftBoost, 0, 5000),
    riftDailyPlan: int("EBAY_RIFT_DAILY_PLAN", d.riftDailyPlan, 0, 5000),
    otherSiblings: int("EBAY_OTHER_SIBLINGS", d.otherSiblings, 0, 5000),
  };
  return { cfg, problems };
}

// ── constants of the model ───────────────────────────────────────────────────
export const SINGLE_CALL_COST_BASE = 1;
export const SEALED_CALL_COST = 1;                        // sealed: one query, no retry
export const PACING_MS = 200;                             // sleep between Browse calls (lib/ebay.ts)
export const CHUNK = 25;                                  // calls claimed from the ledger at a time
export const MIN_RUN = 20;                                // an allowance under this is not worth a run
export const DUE_GRACE_HOURS = 3;
export const BANNER_ONLY_RUN_CAP = 60;                    // a banner-only run (3 a day) never plans past this
export const singleCost = (cfg: Pick<EbayConfig, "retryRate">): number => SINGLE_CALL_COST_BASE + cfg.retryRate;

/** The sealed kinds the eBay pass searches: boxes, cases and displays, commander decks, bundles and Secret Lair drops (the kinds matchSealedTitle can recognise; loose packs are not searched). */
export const SEARCHED_SEALED_KINDS = new Set(["Booster Box", "Booster Case", "Display", "Display Case", "Case", "Box", "Commander Deck", "Bundle", "Secret Lair", "Collector Booster Box", "Starter Kit", "Prerelease Pack"]);
const DECK_LIKE = new Set(["Commander Deck", "Bundle", "Secret Lair", "Starter Kit", "Prerelease Pack"]);

// ── popularity and score ─────────────────────────────────────────────────────

export interface PopInputs {
  edhrecRank: number | null;
  reserved: boolean;
  /** our own traffic as a 0..1 percentile across tracked names; null when there is none yet */
  ownPercentile: number | null;
  totalViews: number;
  watchers: number;                 // price alerts + collection holders + deck watches on any printing
  change7dPct: number | null;
  valueCents: number;
}
/** pop in [0, 1] (ebay-brief 6.3): our own signal takes over as traffic grows (wOur = min(1, totalViews / 50,000)); watchers, big movers and the Reserved List lift a name EDHREC cannot see. */
export function popularityOf(p: PopInputs): number {
  const edh = p.edhrecRank && p.edhrecRank > 0 ? 1 / (1 + p.edhrecRank / 1500) : 0;
  const wOur = Math.min(1, Math.max(0, p.totalViews) / 50_000);
  const base = p.ownPercentile == null ? edh : wOur * p.ownPercentile + (1 - wOur) * edh;
  const watch = Math.min(1, Math.log10(1 + Math.max(0, p.watchers)) / 2);
  const mover = p.change7dPct != null && Math.abs(p.change7dPct) >= 15 && p.valueCents >= 2000 ? 0.6 : 0;
  return Math.max(base, watch, mover, p.reserved ? 0.5 : 0);
}
export const SCORE_CLIP_USD = 2000;
/** score = min(V, 2000)^0.7 x (0.15 + pop) x 1.15 (chase treatment) x 1.2 (a printing released in the last 45 days). V in USD cents. */
export function scoreOf(u: { valueCents: number; pop: number; chase: boolean; recent: boolean }): number {
  return Math.pow(Math.min(u.valueCents / 100, SCORE_CLIP_USD), 0.7) * (0.15 + u.pop) * (u.chase ? 1.15 : 1) * (u.recent ? 1.2 : 1);
}
/** Sealed: popSealed = our own percentile; cold start 0.7 when the set released within 12 months, else 0.3, or 0.6 for a product worth US$500+. */
export function sealedPop(p: { ownPercentile: number | null; releasedWithin12Months: boolean; valueCents: number }): number {
  if (p.ownPercentile != null) return p.ownPercentile;
  return p.releasedWithin12Months ? 0.7 : p.valueCents >= 50_000 ? 0.6 : 0.3;
}

// ── the allocator: tiers by value x popularity ───────────────────────────────

export interface Unit {
  ref: string;                      // "o:<oracleNo>" | "p:<productId>" | "n:<fold(name)>"
  kind: "single" | "sealed";
  name: string;
  valueCents: number;               // MARKET value (marketOnlyCents), never a low
  pop: number;
  chase: boolean;
  recent: boolean;
  banner: boolean;                  // in the chase pool
  sealedKind?: string;
  matchable?: boolean;              // false: never searched (its own canonical title cannot match it)
}
export interface Allocation {
  tiers: Map<string, TierCode>;
  scores: Map<string, number>;
  /** modelled calls a day, per class, for ONE market (US) */
  daily: { banner: number; A: number; B: number; sealed: number; total: number };
  counts: { A: number; B: number; C: number; sealed: number; banner: number };
  cut: { aMin: number | null; bMin: number | null };
}
export function bannerDailyCost(cfg: EbayConfig): number {
  const us = cfg.bannerUsNames * (24 / cfg.bannerUsIntervalHours);
  const other = 3 * cfg.bannerOtherNames * (24 / cfg.bannerOtherIntervalHours);
  return (us + other) * singleCost(cfg);
}
export function sealedEligible(u: Pick<Unit, "kind" | "sealedKind" | "valueCents" | "matchable">, cfg: EbayConfig): boolean {
  if (u.kind !== "sealed" || u.matchable === false || !u.sealedKind || !SEARCHED_SEALED_KINDS.has(u.sealedKind)) return false;
  return u.valueCents >= (DECK_LIKE.has(u.sealedKind) ? cfg.sealedDeckMinCents : cfg.sealedMinCents);
}

/**
 * Tiers from the budget, top-down by score until each slice is spent (the cut line adapts as the catalogue and the budget change):
 *   A = from the top while cumulative cost (per day) <= tierAShare x singles slice and V >= tierAMin
 *   B = continue while cost/(bInterval/24 days) fits what is left of the slice and V >= minValue
 *   C = the rest (no call). A name already tiered keeps its tier while its rank is within `hysteresis` beyond the cut line.
 * Sealed products fill their own slice by score at their own interval; banner pool names are flagged on top (their extra refreshes are paid by the banner slice).
 */
export function allocate(units: readonly Unit[], cfg: EbayConfig, prev: ReadonlyMap<string, TierCode> = new Map()): Allocation {
  const cost = singleCost(cfg);
  const scores = new Map<string, number>();
  const score = (u: Unit): number => { let s = scores.get(u.ref); if (s == null) { s = scoreOf(u); scores.set(u.ref, s); } return s; };
  const byScore = (a: Unit, b: Unit): number => score(b) - score(a) || b.valueCents - a.valueCents || (a.ref < b.ref ? -1 : 1);
  const singlesPool = cfg.slices.singles * cfg.dailyBudget;
  const sealedPool = cfg.slices.sealed * cfg.dailyBudget;
  const bDays = cfg.bIntervalHours / 24;
  const singles = units.filter((u) => u.kind === "single" && u.matchable !== false && u.valueCents >= cfg.minValueCents).sort(byScore);
  // raw cut by cumulative cost
  let spentA = 0, spentB = 0, nA = 0, nB = 0;
  const capA = cfg.tierAShare * singlesPool;
  for (const u of singles) {
    if (u.valueCents >= cfg.tierAMinCents && spentA + cost <= capA && nB === 0) { spentA += cost; nA++; continue; }
    if (spentA + spentB + cost / bDays > singlesPool) break;
    spentB += cost / bDays; nB++;
  }
  const tiers = new Map<string, TierCode>();
  const h = cfg.hysteresis;
  // hysteresis: keep the previous tier while the rank is within h beyond the cut line (never promote past the floor/value rule)
  const rawTier = (rank: number): TierCode => (rank < nA ? TIER.A : rank < nA + nB ? TIER.B : TIER.C);
  let costA = 0, costB = 0;
  singles.forEach((u, rank) => {
    let t = rawTier(rank);
    const p = prev.get(u.ref);
    if (p === TIER.A && t !== TIER.A && rank < nA * (1 + h) && u.valueCents >= cfg.tierAMinCents * (1 - h)) t = TIER.A;
    else if (p === TIER.B && t === TIER.C && rank < (nA + nB) * (1 + h) && u.valueCents >= cfg.minValueCents * (1 - h)) t = TIER.B;
    else if (p === TIER.B && t === TIER.A && rank >= nA * (1 - h)) t = TIER.B;
    else if (p === TIER.A && t === TIER.B && rank < nA * (1 + h)) t = TIER.A;
    tiers.set(u.ref, t);
    if (t === TIER.A) costA += cost; else if (t === TIER.B) costB += cost / bDays;
  });
  // the hysteresis must not overspend the slice: demote the lowest-ranked kept names until it fits
  for (let i = singles.length - 1; i >= 0 && costA * 1 + costB > singlesPool + 1e-9; i--) {
    const u = singles[i]!; const t = tiers.get(u.ref);
    if (t === TIER.B) { tiers.set(u.ref, TIER.C); costB -= cost / bDays; }
    else if (t === TIER.A && costA > capA + 1e-9) { tiers.set(u.ref, TIER.B); costA -= cost; costB += cost / bDays; }
  }
  for (const u of units) if (!tiers.has(u.ref)) tiers.set(u.ref, TIER.C);
  // sealed
  const sealedDays = cfg.sealedIntervalHours / 24;
  let costS = 0, nS = 0;
  for (const u of units.filter((x) => x.kind === "sealed" && sealedEligible(x, cfg)).sort(byScore)) {
    if (costS + SEALED_CALL_COST / sealedDays > sealedPool) break;
    costS += SEALED_CALL_COST / sealedDays; nS++; tiers.set(u.ref, TIER.SEALED);
  }
  // a pool name that is otherwise tier C is still banner-searched
  let nBanner = 0;
  for (const u of units) { if (u.banner) { nBanner++; if (tiers.get(u.ref) === TIER.C) tiers.set(u.ref, TIER.BANNER); } }
  let aMin: number | null = null, bMin: number | null = null, nAf = 0, nBf = 0, nC = 0;
  for (const u of singles) { const t = tiers.get(u.ref); if (t === TIER.A) { nAf++; aMin = Math.min(aMin ?? Infinity, u.valueCents); } else if (t === TIER.B) { nBf++; bMin = Math.min(bMin ?? Infinity, u.valueCents); } else nC++; }
  const banner = bannerDailyCost(cfg);
  return { tiers, scores, daily: { banner, A: costA, B: costB, sealed: costS, total: banner + costA + costB + costS }, counts: { A: nAf, B: nBf, C: nC, sealed: nS, banner: nBanner }, cut: { aMin, bMin } };
}

/** The interval of a tier (hours) for a market. The banner class refreshes the pool: US every 6 h, UK/AU/EU daily. */
export function intervalHours(cls: PairClass, market: EbayMarket, cfg: EbayConfig): number {
  if (cls === "A") return 24;
  if (cls === "B") return cfg.bIntervalHours;
  if (cls === "sealed") return cfg.sealedIntervalHours;
  return market === "US" ? cfg.bannerUsIntervalHours : cfg.bannerOtherIntervalHours;
}
/** Is a pair due? Never searched is due; else when its age reaches interval - grace (a 24 h pair checked at 23:39 yesterday is due at 23:37 today). */
export function isDue(checkedAt: Date | null, hours: number, now: Date, force = false): boolean {
  if (force || !checkedAt) return true;
  return now.getTime() - checkedAt.getTime() >= (hours - Math.min(DUE_GRACE_HOURS, hours / 2)) * 3600_000;
}

// ── pairs and the run plan ───────────────────────────────────────────────────

export interface Pair {
  ref: string;
  market: EbayMarket;
  kind: "single" | "sealed";
  cls: PairClass;
  valueCents: number;
  score: number;
  checkedAt: Date | null;
  cost: number;                     // modelled calls
}
export const pairKey = (ref: string, market: string) => `${ref}|${market}`;

/** Banner, then A, then B, then sealed; inside a class never-searched first, then most overdue, then by score. */
export function comparePairs(a: Pair, b: Pair, now: Date, cfg: EbayConfig): number {
  const c = CLASS_PRIORITY[a.cls] - CLASS_PRIORITY[b.cls];
  if (c) return c;
  if (!a.checkedAt !== !b.checkedAt) return a.checkedAt ? 1 : -1;
  if (a.checkedAt && b.checkedAt) {
    const oa = now.getTime() - a.checkedAt.getTime() - intervalHours(a.cls, a.market, cfg) * 3600_000;
    const ob = now.getTime() - b.checkedAt.getTime() - intervalHours(b.cls, b.market, cfg) * 3600_000;
    if (oa !== ob) return ob - oa;
  }
  if (a.score !== b.score) return b.score - a.score;
  return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
}

export type RunPurpose = "banner" | "main";
/** The cron minute of the main pass (23:37 UTC, after Rift's 19:00 work and the 21:47 sibling run); the other three schedules are banner-only. */
export const MAIN_CRON = "37 23 * * *";
export const EBAY_CRONS = ["37 4 * * *", "37 10 * * *", "37 16 * * *", MAIN_CRON] as const;
/** The purposes of a run from the schedule that started it. A dispatch (no schedule) is a main run; an unknown schedule is banner-only (the cheaper reading). */
export function purposeOfSchedule(schedule: string | null | undefined): RunPurpose {
  if (!schedule) return "main";
  return schedule.trim() === MAIN_CRON ? "main" : "banner";
}

export interface DueInput {
  units: readonly Unit[];
  tiers: ReadonlyMap<string, TierCode>;
  checks: ReadonlyMap<string, Date>;   // pairKey(ref, market) -> checkedAt
  now: Date;
  cfg: EbayConfig;
  purpose: RunPurpose;
  force?: boolean;
  onlyMarket?: EbayMarket | null;
}
/** Every due pair of this run in priority order. Banner pool names: US at the 6 h interval, UK/AU/EU daily. A banner-only run plans nothing else. */
export function duePairs(i: DueInput): Pair[] {
  const out: Pair[] = [];
  const cost = singleCost(i.cfg);
  let usN = 0;
  const pool = i.units.filter((u) => u.banner && u.kind === "single" && u.matchable !== false);
  const add = (u: Unit, market: EbayMarket, cls: PairClass): void => {
    if (i.onlyMarket && i.onlyMarket !== market) return;
    const checkedAt = i.checks.get(pairKey(u.ref, market)) ?? null;
    if (!isDue(checkedAt, intervalHours(cls, market, i.cfg), i.now, i.force)) return;
    out.push({ ref: u.ref, market, kind: u.kind, cls, valueCents: u.valueCents, score: scoreOf(u), checkedAt, cost: u.kind === "single" ? cost : SEALED_CALL_COST });
  };
  // the pool is ordered by the caller (dearest/most wanted first); the first N are the "US every 6 h" names, the first M the other markets' names
  for (const u of pool) {
    if (usN < i.cfg.bannerUsNames) add(u, "US", "banner");
    if (usN < i.cfg.bannerOtherNames) for (const m of ["UK", "AU", "EU"] as const) add(u, m, "banner");
    usN++;
  }
  if (i.purpose === "main") {
    for (const u of i.units) {
      const t = i.tiers.get(u.ref);
      if (u.matchable === false) continue;
      if (t === TIER.A) add(u, "US", "A");
      else if (t === TIER.B) add(u, "US", "B");
      else if (t === TIER.SEALED) for (const m of SEALED_MARKETS) add(u, m, "sealed");
    }
  }
  // a pair can be added twice (a banner name that is also tier A): keep the first (banner outranks)
  const seen = new Set<string>();
  const uniq = out.filter((p) => { const k = pairKey(p.ref, p.market); if (seen.has(k)) return false; seen.add(k); return true; });
  return uniq.sort((a, b) => comparePairs(a, b, i.now, i.cfg));
}

export interface RunPlan {
  order: Pair[];
  overflow: Pair[];
  /** modelled calls planned per class and in total */
  used: Record<PairClass, number>;
  modelled: number;
  allowance: Record<PairClass, number>;
}
/** What each class may still plan today: its slice of the daily cap minus what the ledger breakdown says it already spent (the buffer is never planned). */
export function classAllowance(cfg: EbayConfig, spentToday: Partial<Record<PairClass, number>>): Record<PairClass, number> {
  const cap = cfg.dailyBudget;
  const left = (share: number, cls: PairClass): number => Math.max(0, Math.floor(cap * share) - (spentToday[cls] ?? 0));
  return { banner: left(cfg.slices.banner, "banner"), A: left(cfg.slices.singles * cfg.tierAShare, "A"), B: left(cfg.slices.singles * (1 - cfg.tierAShare), "B"), sealed: left(cfg.slices.sealed, "sealed") };
}
/**
 * Plan a run: pairs in priority order, each class within its remaining slice, the whole within `budget` (the run's allowance). Strict priority inside a class: stop at the first pair that does
 * not fit, so a cheaper low-priority pair never jumps ahead. What does not fit is `overflow` (it stays due; it is searched only if real spend leaves room).
 * Singles beyond the US spill to UK, AU, EU only with what the US pairs left unspent of the singles slice, by SPILL_SHARES.
 */
export function planRun(pairs: readonly Pair[], budget: number, allowance: Record<PairClass, number>): RunPlan {
  const used: Record<PairClass, number> = { banner: 0, A: 0, B: 0, sealed: 0 };
  const order: Pair[] = []; const overflow: Pair[] = [];
  const blocked = new Set<PairClass>();
  let total = 0;
  for (const p of pairs) {
    if (blocked.has(p.cls) || used[p.cls] + p.cost > allowance[p.cls] || total + p.cost > budget) { blocked.add(p.cls); overflow.push(p); continue; }
    used[p.cls] += p.cost; total += p.cost; order.push(p);
  }
  return { order, overflow, used, modelled: total, allowance };
}

// ── the budget: ledger x live quota x Rift's reserve ─────────────────────────

export interface RiftJob { name: string; hour: number; minute: number; cost: number }
/** Rift Compare's planned eBay jobs (UTC), mirrored from its workflows (refresh-prices 07:00 and 19:00, refresh-auctions every 4 h, pokemon-import 21:47); the measured foreign-spend profile overrides any smaller entry. */
export const RIFT_JOBS: RiftJob[] = [
  { name: "refresh-prices-morning", hour: 7, minute: 0, cost: 2000 },
  { name: "refresh-prices-evening", hour: 19, minute: 0, cost: 1000 },
  ...[0, 4, 8, 12, 16, 20].map((h) => ({ name: `refresh-auctions-${h}`, hour: h, minute: 0, cost: 6 })),
  { name: "pokemon-import", hour: 21, minute: 47, cost: 60 },
];
export const RIFT_START_DELAY_MIN = 8;
export const RIFT_DRIFT_MIN = 120;
/** The last big Rift cron and the earliest the main pass may run after it (a test pins the pair). */
export const RIFT_LAST_BIG_CRON_MIN = 19 * 60;
export const MAIN_AFTER_RIFT_MIN = 180;

/** Sum of the cost of every Rift job whose effective start falls in (now - drift, resetAt). */
export function riftNeed(now: Date, resetAt: Date, jobs: readonly RiftJob[] = RIFT_JOBS, observedMin: number | null = null): number {
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let sum = 0;
  for (const j of jobs) {
    for (const k of [-1, 0, 1]) {
      const start = day + k * 86_400_000 + (j.hour * 60 + j.minute + RIFT_START_DELAY_MIN) * 60_000;
      if (start > now.getTime() - RIFT_DRIFT_MIN * 60_000 && start < resetAt.getTime()) sum += j.cost;
    }
  }
  return observedMin != null ? Math.max(sum, observedMin) : sum;
}
/** reserve(now, reset, mode): own = EBAY_QUOTA_RESERVE; shared = Rift's own reserve + what its jobs still to run need + a margin (+ a manual boost for a Rift launch window). */
export function reserveFor(now: Date, resetAt: Date | null, cfg: EbayConfig, observedRiftNeed: number | null = null): number {
  if (cfg.keysetMode === "own") return cfg.quotaReserve;
  if (!resetAt) return Infinity;
  return cfg.riftOwnReserve + riftNeed(now, resetAt, RIFT_JOBS, observedRiftNeed) + cfg.riftMargin + cfg.riftBoost;
}
/** The adaptive cap (Rift always wins): the daily budget can never exceed what the shared quota leaves after Rift's own plan. */
export function effectiveCap(limit: number, cfg: EbayConfig, riftP95Observed: number | null = null): number {
  if (cfg.keysetMode === "own") return cfg.dailyBudget;
  const rift = Math.max(cfg.riftDailyPlan, riftP95Observed ?? 0);
  return Math.max(0, Math.min(cfg.dailyBudget, limit - cfg.riftOwnReserve - cfg.riftMargin - rift - cfg.otherSiblings));
}

export interface QuotaReading { remaining: number; limit: number; reset: Date; timeWindowSec: number }
export type StopReason =
  | "api-disabled" | "observe-only" | "quota-unreadable" | "ledger-unreachable" | "ledger-blocked" | "ledger-cap" | "paused"
  | "no-budget" | "foreign-active" | "429" | "failures" | "reserve" | "budget" | "dispatch-cap";
export interface Allowance { allowance: number; stop: StopReason | null; detail: Record<string, number | string | null> }

export interface AllowanceInput {
  cfg: EbayConfig;
  now: Date;
  quota: QuotaReading | null;
  ledger: { cap: number; claimed: number; blockedUntil: Date | null } | null;   // null = unreachable
  paused: boolean;
  purpose: RunPurpose;
  dispatchCap?: string | number | null;
  observedRiftNeed?: number | null;
  ourSpend24h?: number;
  log?: (msg: string) => void;
}
/**
 * The run's allowance, fail closed: every unreadable input is zero calls with a named reason (a green run with a visible annotation).
 *   allowance = min(ledger cap - claimed, live remaining - reserve(now, reset), run share, EBAY_MAX_CALLS, a dispatch cap)
 * Own mode may fall back to (daily limit - our last-24h spend) when the quota cannot be read; shared mode never does.
 */
export function allowanceFor(i: AllowanceInput): Allowance {
  const { cfg, now } = i;
  const detail: Allowance["detail"] = {};
  const stop = (s: StopReason): Allowance => ({ allowance: 0, stop: s, detail });
  if (!cfg.apiEnabled) return stop("api-disabled");
  if (i.paused) return stop("paused");
  if (cfg.observeOnly) return stop("observe-only");
  if (!i.ledger) return stop("ledger-unreachable");
  if (i.ledger.blockedUntil && i.ledger.blockedUntil > now) return stop("ledger-blocked");
  const ledgerLeft = i.ledger.cap - i.ledger.claimed;
  detail.ledgerLeft = ledgerLeft;
  if (ledgerLeft <= 0) return stop("ledger-cap");
  let quotaLeft: number;
  if (i.quota) {
    const q = i.quota;
    const saneReset = q.reset.getTime() > now.getTime() && q.reset.getTime() <= now.getTime() + (q.timeWindowSec + 3600) * 1000;
    if (!Number.isFinite(q.remaining) || q.remaining < 0 || !Number.isFinite(q.limit) || q.limit <= 0 || !saneReset) return cfg.keysetMode === "own" ? ownFallback(i, detail) : stop("quota-unreadable");
    const reserve = reserveFor(now, q.reset, cfg, i.observedRiftNeed ?? null);
    quotaLeft = q.remaining - reserve;
    detail.remaining = q.remaining; detail.reserve = reserve; detail.limit = q.limit;
  } else if (cfg.keysetMode === "own") return ownFallback(i, detail);
  else return stop("quota-unreadable");
  let a = Math.min(ledgerLeft, quotaLeft);
  if (cfg.maxCalls != null) a = Math.min(a, cfg.maxCalls);
  const share = i.purpose === "banner" ? BANNER_ONLY_RUN_CAP : Infinity;
  a = Math.min(a, share);
  if (i.dispatchCap != null && String(i.dispatchCap).trim() !== "") {
    const d = envInt(String(i.dispatchCap));
    if (d != null && d > 0 && d <= a) { a = d; }
    else i.log?.(`eBay: ignoring max_calls=${JSON.stringify(String(i.dispatchCap))} (must be a positive number; it can only lower the budget)`);
  }
  a = Math.max(0, Math.floor(a));
  detail.allowance = a;
  if (a < MIN_RUN) return { allowance: 0, stop: quotaLeft < MIN_RUN ? "reserve" : "no-budget", detail };
  return { allowance: a, stop: null, detail };
}
function ownFallback(i: AllowanceInput, detail: Allowance["detail"]): Allowance {
  const left = Math.max(0, 5000 - (i.ourSpend24h ?? 0) - i.cfg.quotaReserve);
  detail.fallback = "own-24h";
  const a = Math.floor(Math.min(left, i.ledger!.cap - i.ledger!.claimed, i.cfg.maxCalls ?? Infinity));
  return a < MIN_RUN ? { allowance: 0, stop: "no-budget", detail } : { allowance: a, stop: null, detail };
}

/** dailyLimit - remaining - ledger.spent: what everything else used of the shared quota in this window. */
export const foreignObserved = (limit: number, remaining: number, ourSpent: number): number => Math.max(0, limit - remaining - ourSpent);
/** Shared mode warns when foreign spend RISES more than 25% above its 14-day median, or appears while no Rift job is scheduled. */
export function foreignRise(history: readonly number[], today: number): boolean {
  const h = [...history].sort((a, b) => a - b);
  if (h.length < 3) return false;
  const med = h[Math.floor(h.length / 2)]!;
  return today > med * 1.25 + 50;
}

// ── what a pair's search outcome writes (lib/ebay-import.ts) ─────────────────

export type SearchOutcome =
  | { status: "ok"; matched: boolean }
  | { status: "failed" }
  | { status: "rate-limited" }
  | { status: "budget" };
/**
 * The partial-run safety rule. Only a COMPLETED search writes: a match upserts the unit's rows, no match deletes them (yesterday's listing is not evidence of today's) and stamps the
 * EbayTrack row. Anything else leaves every row AND the stamp untouched, so the pair stays due and a run cut short never removes a live listing.
 */
export function pairWrite(o: SearchOutcome): { best: "upsert" | "delete" | "keep"; track: "matched" | "unmatched" | "keep" } {
  if (o.status !== "ok") return { best: "keep", track: "keep" };
  return o.matched ? { best: "upsert", track: "matched" } : { best: "delete", track: "unmatched" };
}
/** A name needs every query it sent to complete: a 429 on the retry is NOT completed. */
export type QueryStatus = "ok" | "failed" | "rate-limited" | "budget";
export function combineQueries(strict: QueryStatus, retry: QueryStatus | null): QueryStatus {
  if (strict !== "ok") return strict;
  return retry ?? "ok";
}

// ── the failure breaker ──────────────────────────────────────────────────────
export const BREAKER_CONSECUTIVE = 10;
export const BREAKER_MIN_PAIRS = 50;
export const BREAKER_RATE = 0.5;
export class FailureBreaker {
  pairs = 0;
  failures = 0;
  consecutive = 0;
  tripped: string | null = null;
  record(failed: boolean): boolean {
    this.pairs++;
    if (failed) { this.failures++; this.consecutive++; } else this.consecutive = 0;
    if (!this.tripped && this.consecutive >= BREAKER_CONSECUTIVE) this.tripped = `${this.consecutive} failed searches in a row`;
    if (!this.tripped && this.pairs >= BREAKER_MIN_PAIRS && this.failures / this.pairs > BREAKER_RATE) this.tripped = `${this.failures} of ${this.pairs} searches failed`;
    return this.tripped != null;
  }
}
/** Red (exit 1) when the keys were refused, the breaker tripped, or calls were spent and not one search completed. A 429 is a clean stop (green): the ledger blocks the window. */
export function ebayRunVerdict(s: { tokenRefused?: boolean; latched: string | null; spent: number; completed: number }): { ok: boolean; reason: string | null } {
  if (s.tokenRefused) return { ok: false, reason: "eBay token refused: the keys are set but eBay would not issue a token (0 Browse calls made)" };
  if (s.latched === "failures") return { ok: false, reason: "too many eBay searches failed (not 429): the run stopped early" };
  if (s.spent > 0 && s.completed === 0) return { ok: false, reason: `spent ${s.spent} calls and no search completed` };
  return { ok: true, reason: null };
}

/** EBAY_ONLY_MARKET: blank is all markets; a known code is it; anything else THROWS. */
export function parseOnlyMarket(v: string | undefined | null): EbayMarket | null {
  const t = (v ?? "").trim().toUpperCase();
  if (!t) return null;
  const code = t === "GB" ? "UK" : t;
  if ((EBAY_MARKETS as string[]).includes(code)) return code as EbayMarket;
  throw new Error(`EBAY_ONLY_MARKET=${JSON.stringify(v)} is not one of ${EBAY_MARKETS.join(" ")}`);
}

/** The plan constants a run records on the ledger row, so /admin/ebay needs no eBay module import and no workflow variable. */
export function recordedConfig(cfg: EbayConfig): Record<string, unknown> {
  return {
    mode: cfg.keysetMode, observeOnly: cfg.observeOnly, apiEnabled: cfg.apiEnabled, dailyBudget: cfg.dailyBudget, quotaReserve: cfg.quotaReserve, slices: cfg.slices,
    minValueCents: cfg.minValueCents, tierAMinCents: cfg.tierAMinCents, tierAShare: cfg.tierAShare, bIntervalHours: cfg.bIntervalHours, sealedIntervalHours: cfg.sealedIntervalHours,
    bannerUsNames: cfg.bannerUsNames, bannerOtherNames: cfg.bannerOtherNames, riftOwnReserve: cfg.riftOwnReserve, riftMargin: cfg.riftMargin, riftBoost: cfg.riftBoost, riftDailyPlan: cfg.riftDailyPlan,
  };
}
