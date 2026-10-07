import { COUNTRY_LIST, currencyOf, type Country } from "./country";
import { usdCentsToCountry } from "./fx";
import { dayIso, type Point } from "./history";
import { demandAsOf, dayMinus, type DemandAsOfCard, type DemandDayFile, type DemandVelocity } from "./demand-snapshot";
import { clamp, mean, median, percentileRanks, spearman, zScores } from "./stats";

// ── Rise predictor (RiftCompare's lib/rise-predictor.ts, for OP Compare) ─────
// Ranks cards by demand + price-timing signals: search interest that is high or
// rising on a card whose price has not re-rated yet (low in its own recent
// range, thin supply, not already spiking). Every input is a real, quoted data
// field and the score is a transparent weighted sum of cross-sectional z-scores.
//
// THE INPUTS ON OP COMPARE (wave-2 plan, Track 3 item 7):
//   • demand: Card.searchCount / viewCount (lib/card-views.ts), and its
//     velocity from the daily demand snapshot FILES (lib/demand-snapshot.ts);
//   • price: the GLOBAL basis is Card.marketUsd, TCGplayer's US market price —
//     the series the import records (lib/history.ts) — and today's marketUsd
//     is the newest point; a single market converts it to its own currency;
//   • supply: Card.stores<MKT>, the in-stock tracked stores in that market (a
//     TCGplayer reference row or eBay is never a store); GLOBAL sums them;
//   • the price shown: Card.low<MKT>, the cheapest in-stock listing there.
//
// THIS MODULE IS PURE. The import builds history/rising.json (buildRiseFile,
// via lib/tools-history.ts): each card's weekly series, today's demand
// velocity and the demand as it stood a week ago, so a page never reads more
// than one small file. lib/data.ts caches the operational half and assembles
// here, in-process, uncached (getCachedRisingCards).
//
// HONEST LIMITS (surfaced in the UI): (1) demand VELOCITY needs a few days of
// demand snapshots — until then that component is 0 and only demand LEVEL is
// used. (2) The price-timing half reads WEEKLY points (one per week, the week's
// lowest, as RiftCompare does), so it moves once a week; today's price is
// appended as the newest point. (3) Price-timing signals need MIN_POINTS weekly
// points: until a card has them it is ranked on demand and supply alone, and
// says so. (4) No track record is published, so nothing may call the ranking
// "backtested" or "validated". Not financial advice.

// Scope: a single market, or GLOBAL. Demand is market-agnostic; so is the price
// series. A single-market scope decides the universe (cards priced there), the
// supply count and the currency; GLOBAL uses every market and shows each card's
// basis-market price.
export type RiseScope = Country | "GLOBAL";

// Reference order for a GLOBAL card's displayed price: OP Compare's home market
// first, then the rest as COUNTRY_LIST orders them. Must cover EVERY market.
export const MARKET_PREF: Country[] = COUNTRY_LIST.map((c) => c.code);

// Every scope a URL may ask for. The tool and /admin/rising both parse through here.
export const RISE_SCOPES: readonly RiseScope[] = ["GLOBAL", ...COUNTRY_LIST.map((c) => c.code)];

export function parseRiseScope(value: string | null | undefined, fallback: RiseScope): RiseScope {
  const v = (value ?? "").trim().toUpperCase();
  return RISE_SCOPES.find((s) => s === v) ?? fallback;
}

export const SCAN = 400; // universe per scope: most-searched cards priced in it
export const HISTORY_DAYS = 120;
export const MAX_WEEKS = 18; // weekly points kept per card in rising.json
const GROWTH_MIN_DAYS = 7;
const SPARK_DAYS = 16 * 7; // the "16 wk" sparkline
const MIN_POINTS = 5; // clean weekly points (live price included) needed to trust the price-timing signals
const BACKTEST_LAG_DAYS = 14;
const OVERHEAT_PCT = 35; // up more than this vs last week = likely already spiked
const MIN_BACKTEST_N = 20;
export const DISPLAY = 40;
const DAY_MS = 86400_000;
export const VELOCITY_DAYS = 21;
/** Cards whose weekly series rising.json carries: the most searched, as many as the feed ranks from. */
export const RISE_FEED_CARDS = 2000;

// Component weights (transparent, tunable) — RiftCompare's.
const W = { demand: 1.0, velocity: 1.4, room: 1.1, scarcity: 0.7, momentum: 0.5, volatility: 0.25, overheat: 0.8 };

export interface RiseComponents {
  demand: number; // z: attention level (searchCount)
  velocity: number; // z: rising searches/day (0 until snapshots accrue)
  room: number; // z: room to run (near range low); 0 without price signals
  scarcity: number; // z: thin supply
  momentum: number; // z: emerging (not overheated) week-on-week momentum; 0 without price signals
  volatility: number; // z: week-to-week movement; 0 without price signals
}

export interface RisePick {
  id: string;
  slug: string;
  displayName: string;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  score: number; // 0–100 percentile of the composite
  components: RiseComponents;
  priceCents: number | null;
  currency: string; // currency of priceCents — the card's basis market, NOT the scope's for GLOBAL
  basisMarket: Country; // market whose live price is displayed
  searchCount: number;
  viewCount: number;
  /** True when the card has MIN_POINTS clean weekly points, so posPct / momentum / volatility mean something. */
  priceSignals: boolean;
  /** Today's price vs the weekly point nearest a week ago; null when there is none. */
  vsLastWeekPct: number | null;
  trend7: number; // = vsLastWeekPct ?? 0 (kept for the frozen Hot 40 snapshots)
  trend30: number; // 0 without price signals
  posPct: number; // 0 = at range low, 1 = at high; 0.5 (neutral) without price signals
  rangeWeeks: number; // weeks the series spans — what "its range" means
  volatilityPct: number;
  listings: number; // in-stock tracked stores (scope market, or every market for GLOBAL)
  searchPerDay: number | null;
  /** Growth of all-time searches over `searchGrowthDays`; null below GROWTH_MIN_DAYS of snapshots. */
  searchGrowthPct: number | null;
  searchGrowthDays: number | null;
  historyPoints: number;
  spark: number[]; // weekly series + today, last 16 weeks, in `currency`
  reason: string; // one plain-English line: why this card ranks where it does
  confidence: "High" | "Medium" | "Low";
  overheated: boolean;
}

export interface RiseBacktest {
  n: number;
  lagDays: number;
  spearman: number; // corr(room-to-run signal at T−lag, forward return)
  topTercileReturnPct: number;
  bottomTercileReturnPct: number;
  medianReturnPct: number;
}

export interface RiseAnalysis {
  picks: RisePick[];
  universeSize: number;
  /** Cards with at least MIN_POINTS clean price points — enough to score price timing. */
  qualifying: number;
  /** Cards with ANY recorded history, and how deep the best series is: why the price half is dark, when it is. */
  withAnyHistory: number;
  deepestSeries: number;
  minPointsRequired: number;
  demandPriceSpearman: number;
  velocityActive: boolean;
  snapshotDays: number;
  backtest: RiseBacktest | null;
  generatedAt: string;
  scope: RiseScope;
  /** True when this is the "temporarily unavailable" fallback after a failed load — never "no history yet". */
  failed: boolean;
}

/** One card of the universe: the catalogue's facts and prices, and its demand totals. */
export type UniverseCard = {
  id: string;
  slug: string;
  name: string;
  setCode: string;
  number: string | null;
  variant: string | null;
  hasImage: boolean;
  imageThumbUrl: string | null;
  searchCount: number;
  viewCount: number;
  marketUsd: number | null;
  low: Record<Country, number | null>;
  stores: Record<Country, number>;
};

/** The operational half: the scope's universe, supply, demand velocity. Plain objects. */
export type RiseInputs = {
  universe: UniverseCard[];
  supply: Record<string, number>;
  velocity: Record<string, DemandVelocity>;
  snapshotDays: number;
};

/** The weekly history half, scope-independent: cardId → [epochDay, GLOBAL USD cents][] (oldest first, one per week). */
export type RiseHistory = { series: Record<string, [number, number][]> };

/** history/rising.json — written by the import, read by lib/data.ts getRiseFeed. */
export interface RiseFile {
  v: 1;
  day: string;
  series: RiseHistory["series"];
  /** Demand velocity over the last VELOCITY_DAYS of snapshots, per card. */
  velocity: Record<string, DemandVelocity>;
  /** Demand as it stood a week ago, for the week-ago ranking; null with no snapshots that old. */
  weekAgo: DemandWeekAgo | null;
  /** Distinct demand snapshot days on record. */
  snapshotDays: number;
}

/** "Displayed name": the printing in the name, so same-name cards are distinguishable. */
export function cardDisplayName(name: string, c: { variant?: string | null }): string {
  return c.variant ? `${name} (${c.variant})` : name;
}

/** A card's cheapest in-stock listing in a market (Card.low<MKT>). */
export function pickPrice(card: Pick<UniverseCard, "low">, c: Country): number | null {
  return card.low[c] ?? null;
}

// ── Signals (RiftCompare's lib/ai-insight.ts computeSignals, verbatim) ───────
export type PricePoint = { t: number; v: number };
export type Signals = {
  n: number;
  nowCents: number;
  minCents: number;
  maxCents: number;
  posPct: number; // 0 = at its low, 1 = at its high
  trend7: number; // % change vs ~7 days ago
  trend30: number; // % change vs ~30 days ago / oldest
  volatilityPct: number;
};

function nearestTo(points: PricePoint[], targetT: number): PricePoint {
  let best = points[0];
  for (const p of points) if (Math.abs(p.t - targetT) < Math.abs(best.t - targetT)) best = p;
  return best;
}

export function computeSignals(points: PricePoint[]): Signals {
  const n = points.length;
  const now = points[n - 1]?.v ?? 0;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const range = Math.max(1, max - min);
  const nowT = points[n - 1]?.t ?? Date.now();
  const ref7 = nearestTo(points, nowT - 7 * 86400_000);
  const ref30 = nearestTo(points, nowT - 30 * 86400_000);
  const trend7 = ref7.v > 0 ? ((now - ref7.v) / ref7.v) * 100 : 0;
  const trend30 = ref30.v > 0 ? ((now - ref30.v) / ref30.v) * 100 : 0;
  let moves = 0,
    sum = 0;
  for (let i = 1; i < n; i++) {
    if (points[i - 1].v > 0) {
      sum += Math.abs((points[i].v - points[i - 1].v) / points[i - 1].v) * 100;
      moves++;
    }
  }
  return {
    n,
    nowCents: now,
    minCents: min,
    maxCents: max,
    posPct: (now - min) / range,
    trend7: Math.round(trend7 * 10) / 10,
    trend30: Math.round(trend30 * 10) / 10,
    volatilityPct: moves ? Math.round((sum / moves) * 10) / 10 : 0,
  };
}

// ── Building history/rising.json (the import) ────────────────────────────────

/** The Monday (UTC) of an epoch day's week, as an epoch day. */
const weekOf = (epochDay: number) => epochDay - ((new Date(epochDay * DAY_MS).getUTCDay() + 6) % 7);

/**
 * A card's weekly GLOBAL series from its recorded history points
 * ([YYYYMMDD, market cents, low cents]): the market price over the last
 * HISTORY_DAYS, one point per week — the week's LOWEST, RiftCompare's
 * collapseToWeekly rule — at most MAX_WEEKS of them, oldest first.
 */
export function weeklySeries(points: readonly Point[], today: string): [number, number][] {
  const todayEpoch = Math.round(Date.parse(`${today}T00:00:00Z`) / DAY_MS);
  const from = todayEpoch - HISTORY_DAYS;
  const byWeek = new Map<number, [number, number]>();
  for (const [dn, market] of points) {
    if (market == null || market <= 0) continue;
    const day = Math.round(Date.parse(`${dayIso(dn as number)}T00:00:00Z`) / DAY_MS);
    if (day < from || day > todayEpoch) continue;
    const w = weekOf(day);
    const cur = byWeek.get(w);
    if (!cur || market < cur[1]) byWeek.set(w, [day, market]);
  }
  return [...byWeek.values()].sort((a, b) => a[0] - b[0]).slice(-MAX_WEEKS);
}

export const WEEK_AGO_DAYS = 7;

/** Demand as it stood a week ago (the import builds it from the local day files). */
export type DemandWeekAgo = { asOf: string; cards: Record<string, DemandAsOfCard> };

/**
 * history/rising.json from the cards' recorded series and the demand day files
 * on disk (oldest first). Pure: lib/tools-history.ts reads and writes the files.
 */
export function buildRiseFile(
  today: string,
  seriesById: ReadonlyMap<string, readonly Point[]>,
  demandFiles: readonly DemandDayFile[],
  snapshotDays: number,
  /** The cards the feed carries (default: those with a series). */
  ids: ReadonlySet<string> = new Set(seriesById.keys()),
): RiseFile {
  const series: RiseFile["series"] = {};
  for (const [id, pts] of seriesById) {
    const w = weeklySeries(pts, today);
    if (w.length) series[id] = w;
  }
  // Demand for the same cards only (the ones the feed can rank).
  const keep = (rec: Record<string, DemandAsOfCard>) => Object.fromEntries(Object.entries(rec).filter(([id]) => ids.has(id)));
  const now = keep(demandAsOf(demandFiles, today, VELOCITY_DAYS));
  const velocity: RiseFile["velocity"] = {};
  for (const [id, d] of Object.entries(now)) if (d.velocity) velocity[id] = d.velocity;
  const asOf = dayMinus(today, WEEK_AGO_DAYS);
  const hasThen = demandFiles.some((f) => f.day <= asOf);
  return {
    v: 1,
    day: today,
    series,
    velocity,
    weekAgo: hasThen ? { asOf, cards: keep(demandAsOf(demandFiles, asOf, VELOCITY_DAYS)) } : null,
    snapshotDays,
  };
}

// ── Backtest (admin only) ────────────────────────────────────────────────────
// Lookahead-free backtest of the reconstructable price-timing signal ("room to
// run" = 1 − position-in-range at T−lag) vs realised forward return over the
// lag. Directional evidence for ONE component, not a track record.
export function backtest(seriesById: Map<string, PricePoint[]>): RiseBacktest | null {
  const lagMs = BACKTEST_LAG_DAYS * DAY_MS;
  const sig: number[] = [];
  const fwd: number[] = [];
  for (const points of seriesById.values()) {
    if (points.length < MIN_POINTS + 2) continue;
    const lastT = points[points.length - 1].t;
    const cutT = lastT - lagMs;
    const past = points.filter((p) => p.t <= cutT);
    if (past.length < MIN_POINTS) continue;
    const priceThen = past[past.length - 1].v;
    const priceNow = points[points.length - 1].v;
    if (priceThen < 300) continue; // ignore sub-$3 noise
    const ret = ((priceNow - priceThen) / priceThen) * 100;
    if (!Number.isFinite(ret) || Math.abs(ret) > 200) continue; // drop data glitches
    const room = 1 - computeSignals(past).posPct;
    sig.push(room);
    fwd.push(ret);
  }
  if (sig.length < MIN_BACKTEST_N) return null;
  const order = sig.map((_, i) => i).sort((a, b) => sig[a] - sig[b]);
  const t = Math.floor(order.length / 3);
  const bottom = order.slice(0, t).map((i) => fwd[i]);
  const top = order.slice(order.length - t).map((i) => fwd[i]);
  return {
    n: sig.length,
    lagDays: BACKTEST_LAG_DAYS,
    spearman: Math.round(spearman(sig, fwd) * 100) / 100,
    topTercileReturnPct: Math.round(mean(top) * 10) / 10,
    bottomTercileReturnPct: Math.round(mean(bottom) * 10) / 10,
    medianReturnPct: Math.round(median(fwd) * 10) / 10,
  };
}

// The "nothing to show" result. Shared so the empty-universe path and the
// failure path can't drift apart; `failed` is what tells the page which one.
export function emptyAnalysis(scope: RiseScope, failed = false): RiseAnalysis {
  return {
    picks: [], universeSize: 0, qualifying: 0,
    withAnyHistory: 0, deepestSeries: 0, minPointsRequired: MIN_POINTS,
    demandPriceSpearman: 0, velocityActive: false, snapshotDays: 0,
    backtest: null, generatedAt: new Date().toISOString(), scope, failed,
  };
}

// ── The universe for a scope ─────────────────────────────────────────────────

/** Priced in the scope: a live listing there (GLOBAL: in any market). */
export function pricedIn(card: Pick<UniverseCard, "low">, scope: RiseScope): boolean {
  return scope === "GLOBAL" ? MARKET_PREF.some((c) => card.low[c] != null) : card.low[scope] != null;
}

/** In-stock tracked stores: the scope's market, or every market for GLOBAL. */
export function supplyOf(card: Pick<UniverseCard, "stores">, scope: RiseScope): number {
  return scope === "GLOBAL" ? MARKET_PREF.reduce((n, c) => n + (card.stores[c] ?? 0), 0) : card.stores[scope] ?? 0;
}

/**
 * The scope's inputs from the searched cards (most searched first) and today's
 * velocity: the SCAN most-searched cards priced in the scope, and their supply.
 */
export function riseInputsFor(scope: RiseScope, searched: readonly UniverseCard[], velocity: Record<string, DemandVelocity>, snapshotDays: number): RiseInputs {
  const universe = searched.filter((c) => c.searchCount > 0 && pricedIn(c, scope)).slice(0, SCAN);
  const supply: Record<string, number> = {};
  const vel: Record<string, DemandVelocity> = {};
  for (const c of universe) {
    supply[c.id] = supplyOf(c, scope);
    if (velocity[c.id]) vel[c.id] = velocity[c.id];
  }
  return { universe, supply, velocity: vel, snapshotDays };
}

// ── The assembly: pure, in-process, uncached ────────────────────────────────
export function assembleRisingCards(
  scope: RiseScope,
  inputs: RiseInputs,
  history: RiseHistory,
  now: number,
  // How many picks to keep. The screener shows DISPLAY; the week-ago ranking
  // keeps every card, so a climb from #73 reads ▲n rather than NEW.
  limit = DISPLAY,
): RiseAnalysis {
  const isGlobal = scope === "GLOBAL";
  const { universe } = inputs;
  if (!universe.length) return emptyAnalysis(scope);

  // GLOBAL keeps the stored USD figure (signals are percentages, and the spark
  // converts once each card's basis market is known); a single market converts
  // up front.
  const convert = isGlobal ? (usd: number) => usd : (usd: number) => usdCentsToCountry(usd, scope);

  // Series per card: its recorded weekly GLOBAL prices, plus today's live
  // market price as the newest point. Only cards with at least one RECORDED
  // point are in the map, so withAnyHistory still means "has price history".
  const seriesById = new Map<string, PricePoint[]>();
  for (const card of universe) {
    const recorded = history.series[card.id];
    if (!recorded?.length) continue;
    const pts: PricePoint[] = recorded.map(([day, usd]) => ({ t: day * DAY_MS, v: convert(usd) }));
    const live = card.marketUsd;
    if (live != null && live > 0 && now > pts[pts.length - 1].t) pts.push({ t: now, v: convert(live) });
    seriesById.set(card.id, pts);
  }
  const withAnyHistory = seriesById.size;
  let deepestSeries = 0;
  for (const pts of seriesById.values()) if (pts.length > deepestSeries) deepestSeries = pts.length;

  const basisMarketOf = (card: UniverseCard): Country =>
    isGlobal ? MARKET_PREF.find((c) => pickPrice(card, c) != null) ?? MARKET_PREF[0] : scope;

  type Row = {
    card: UniverseCard;
    points: PricePoint[];
    priceSignals: boolean;
    vsLastWeek: number | null;
    trend30: number;
    posPct: number;
    volatilityPct: number;
    listings: number;
    velocity: DemandVelocity | undefined;
  };
  const rows: Row[] = universe.map((card) => {
    const points = seriesById.get(card.id) ?? [];
    const priceSignals = points.length >= MIN_POINTS;
    const s = points.length >= 2 ? computeSignals(points) : null;
    // "vs last week" needs a point roughly a week back — not merely any older point.
    const hasWeekAgo = points.length >= 2 && points[points.length - 1].t - points[0].t >= 5 * DAY_MS;
    return {
      card,
      points,
      priceSignals,
      vsLastWeek: s && hasWeekAgo ? s.trend7 : null,
      trend30: s && priceSignals ? s.trend30 : 0,
      posPct: s && priceSignals ? s.posPct : 0.5,
      volatilityPct: s && priceSignals ? s.volatilityPct : 0,
      listings: inputs.supply[card.id] ?? 0,
      velocity: inputs.velocity[card.id],
    };
  });
  const qualifying = rows.filter((r) => r.priceSignals).length;
  const velocityActive = Object.keys(inputs.velocity).length > 0;

  // Feature vectors → cross-sectional z-scores. The price-timing features are
  // z-scored among the cards that HAVE price signals only; every other card
  // gets a neutral 0 for them, so a card is never rewarded or punished for
  // history it does not have.
  const zd = zScores(rows.map((r) => Math.log1p(r.card.searchCount)));
  const zvel = velocityActive ? zScores(rows.map((r) => r.velocity?.searchPerDay ?? 0)) : rows.map(() => 0);
  const zscar = zScores(rows.map((r) => -Math.log1p(r.listings))); // fewer listings = higher
  const priced = rows.map((r, i) => (r.priceSignals ? i : -1)).filter((i) => i >= 0);
  const subsetZ = (f: (r: Row) => number): number[] => {
    const out = rows.map(() => 0);
    const z = zScores(priced.map((i) => f(rows[i])));
    priced.forEach((i, k) => (out[i] = z[k]));
    return out;
  };
  const zroom = subsetZ((r) => 1 - r.posPct);
  const zmom = subsetZ((r) => clamp(r.vsLastWeek ?? 0, -20, OVERHEAT_PCT));
  const zvol = subsetZ((r) => r.volatilityPct);

  const rawScore = rows.map((r, i) => {
    const up = r.vsLastWeek ?? 0;
    const overheatPenalty = up > OVERHEAT_PCT ? (up - OVERHEAT_PCT) / 15 : 0;
    return (
      W.demand * zd[i] +
      W.velocity * zvel[i] +
      W.room * zroom[i] +
      W.scarcity * zscar[i] +
      W.momentum * zmom[i] +
      W.volatility * zvol[i] -
      W.overheat * overheatPenalty
    );
  });
  const score100 = percentileRanks(rawScore);
  const round2 = (x: number) => Math.round(x * 100) / 100;

  const built = rows.map((r, i) => {
    const pts = r.points.length;
    const bm = basisMarketOf(r.card);
    const rangeWeeks = pts >= 2 ? Math.max(1, Math.round((r.points[pts - 1].t - r.points[0].t) / (7 * DAY_MS))) : 0;
    const confidence: RisePick["confidence"] =
      r.priceSignals && pts >= 8 && r.listings >= 3 ? "High" : r.priceSignals ? "Medium" : "Low";
    const overheated = (r.vsLastWeek ?? 0) > OVERHEAT_PCT;
    const pick: RisePick = {
      id: r.card.id,
      slug: r.card.slug,
      displayName: cardDisplayName(r.card.name, r.card),
      setCode: r.card.setCode,
      collectorNumber: r.card.number ?? "",
      imageThumbUrl: r.card.imageThumbUrl,
      score: score100[i],
      components: {
        demand: round2(zd[i]),
        velocity: round2(zvel[i]),
        room: round2(zroom[i]),
        scarcity: round2(zscar[i]),
        momentum: round2(zmom[i]),
        volatility: round2(zvol[i]),
      },
      priceCents: pickPrice(r.card, bm),
      currency: currencyOf(bm),
      basisMarket: bm,
      searchCount: r.card.searchCount,
      viewCount: r.card.viewCount,
      priceSignals: r.priceSignals,
      vsLastWeekPct: r.vsLastWeek,
      trend7: r.vsLastWeek ?? 0,
      trend30: r.trend30,
      posPct: r.posPct,
      rangeWeeks,
      volatilityPct: r.volatilityPct,
      listings: r.listings,
      searchPerDay: r.velocity?.searchPerDay ?? null,
      searchGrowthPct: r.velocity && r.velocity.spanDays >= GROWTH_MIN_DAYS ? r.velocity.searchGrowthPct : null,
      searchGrowthDays: r.velocity && r.velocity.spanDays >= GROWTH_MIN_DAYS ? r.velocity.spanDays : null,
      historyPoints: pts,
      // GLOBAL's series is raw USD — convert to bm's currency so the sparkline
      // matches priceCents/currency. Last 16 weeks only, spaced as recorded.
      spark: r.points.filter((p) => p.t >= now - SPARK_DAYS * DAY_MS).map((p) => (isGlobal ? usdCentsToCountry(p.v, bm) : p.v)),
      reason: "",
      confidence,
      overheated,
    };
    pick.reason = riseReason(pick, scope);
    return { pick, raw: rawScore[i] };
  });
  const picks: RisePick[] = built.sort((a, b) => b.raw - a.raw).slice(0, limit).map((b) => b.pick);

  const demandPriceSpearman =
    Math.round(spearman(rows.map((r) => r.card.searchCount), rows.map((r) => pickPrice(r.card, basisMarketOf(r.card)) ?? 0)) * 100) / 100;

  return {
    picks,
    universeSize: universe.length,
    qualifying,
    withAnyHistory,
    deepestSeries,
    minPointsRequired: MIN_POINTS,
    demandPriceSpearman,
    velocityActive,
    snapshotDays: inputs.snapshotDays,
    backtest: backtest(seriesById),
    generatedAt: new Date(now).toISOString(),
    scope,
    failed: false,
  };
}

// ── The ranking a week ago ───────────────────────────────────────────────────
// RiftCompare's rule (2026-09-28): rebuild the same ranking over the inputs as
// they stood WEEK_AGO_DAYS ago — demand totals and velocity then (rising.json's
// weekAgo, from the demand snapshot files), the weekly series cut off at that
// day with its last point standing in for the live price, and TODAY's store
// counts (nothing records those historically). Same method on both sides, so a
// move is the market's, not a methodology's.

/** Every card's place in the ranking rebuilt as of `asOf`. Plain JSON. */
export interface WeekAgoRanking {
  asOf: string; // the day it is rebuilt as of, YYYY-MM-DD
  ranks: [cardId: string, rank: number][];
}

/** Pure: the ranking rebuilt as of `past.asOf`. Null when nothing had demand then. */
export function weekAgoRanks(scope: RiseScope, inputs: RiseInputs, history: RiseHistory, past: DemandWeekAgo, now: number): WeekAgoRanking | null {
  const asOfEpochDay = Math.round(Date.parse(`${past.asOf}T00:00:00Z`) / DAY_MS);
  const universe: UniverseCard[] = [];
  const velocity: Record<string, DemandVelocity> = {};
  const series: RiseHistory["series"] = {};
  for (const card of inputs.universe) {
    const d = past.cards[card.id];
    if (!d || d.searchCount <= 0) continue; // not searched by then, so not ranked then
    // The live price is nulled: today's price is not a price a week ago. The
    // series' last recorded point up to that day stands in for it.
    universe.push({ ...card, searchCount: d.searchCount, viewCount: d.viewCount, marketUsd: null });
    if (d.velocity) velocity[card.id] = d.velocity;
    const pts = history.series[card.id]?.filter(([day]) => day <= asOfEpochDay);
    if (pts?.length) series[card.id] = pts;
  }
  if (!universe.length) return null;
  const then = assembleRisingCards(
    scope,
    { universe, supply: inputs.supply, velocity, snapshotDays: inputs.snapshotDays },
    { series },
    now - WEEK_AGO_DAYS * DAY_MS,
    Number.POSITIVE_INFINITY,
  );
  return { asOf: past.asOf, ranks: then.picks.map((p, i) => [p.id, i + 1]) };
}

// One plain line per pick, built only from fields on the row (RiftCompare's
// riseReason, verbatim).
export function riseReason(p: RisePick, scope: RiseScope): string {
  const parts: string[] = [];
  if (!p.priceSignals) {
    parts.push("Not enough weekly prices yet to judge its range, ranked on demand and supply");
  } else if (p.posPct <= 0.25) {
    parts.push(`Near the low of its ${p.rangeWeeks}-week range`);
  } else if (p.posPct >= 0.75) {
    parts.push(`Near the high of its ${p.rangeWeeks}-week range`);
  } else {
    parts.push(`Mid-range over ${p.rangeWeeks} weeks`);
  }
  if (p.overheated && p.vsLastWeekPct != null) parts.push(`already up ${Math.round(p.vsLastWeekPct)}% on last week`);
  if (p.searchGrowthPct != null && p.searchGrowthDays != null && p.searchGrowthPct >= 5) {
    parts.push(`searches +${Math.round(p.searchGrowthPct)}% in ${growthSpanLabel(p.searchGrowthDays)}`);
  } else if (p.searchPerDay != null && p.searchPerDay >= 1) {
    parts.push(`${formatRate(p.searchPerDay)} searches a day`);
  } else {
    parts.push(`${p.searchCount.toLocaleString("en-US")} searches all-time`);
  }
  const where = scope === "GLOBAL" ? "" : ` in ${scope}`;
  if (p.listings === 0) parts.push(`no store has it in stock${where}`);
  else parts.push(`${p.listings} ${p.listings === 1 ? "store" : "stores"} in stock${where}`);
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** "3 weeks", "1 week", "9 days" — the real span behind a search-growth figure. */
export function growthSpanLabel(days: number, short = false): string {
  if (days >= 7 && days % 7 === 0) {
    const w = days / 7;
    return short ? `${w} wk` : `${w} ${w === 1 ? "week" : "weeks"}`;
  }
  return short ? `${days} d` : `${days} ${days === 1 ? "day" : "days"}`;
}

function formatRate(n: number): string {
  return n >= 10 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
}
