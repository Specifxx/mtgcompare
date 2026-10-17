// src/lib/track.ts (owner WP01a, FROZEN). The ONE catalogue/tracking policy: one score, one catalogue floor, one index floor, one track floor, a 20% Schmitt band. Pure and table-tested (tests/track.test.ts).
// Every env name below is read HERE (trackConfigFromEnv) and nowhere else. They are GitHub Actions variables for the importer, never Vercel variables, and the importer reads nothing from Neon (addendum 9):
// the previous run's flag bits, `trackConfigHash` and the guard-trip counter come from the previously PUBLISHED catalogue state (section 12), passed in as plain values.
//
// What changed against the first draft (addendum 2026-10-08, critique 3, 4, 5, 8):
//   * Neon no longer holds the catalogue, so the catalogue floor stops being a storage decision. The default drops from 50 cents to 1 cent: every priced class-0 single has a row (98,796 on 2026-10-07,
//     all 33,429 priced oracles resolvable by a deck line, a CSV row, a search or a set checklist). Pages and SEO are protected by the INDEX floor instead: a listed row below `indexFloorCents` carries the
//     `THIN` bit (noindex, out of every sitemap). `oracleComplete` keeps "every priced oracle resolves" true when an operator raises the catalogue floor again.
//   * Rankings use MARKET only (`marketOnlyCents`): a thin single listing is shown ("low only") but never sorted, indexed, tracked or charted (critique 5).
//   * F10 can no longer lock the catalogue: a config change, an explicit accept and N consecutive trips each release it (critique 8).
import { PRICE_MASK, CARD_CLASS, type Finish } from "./constants";
import type { PriceRowLike } from "./catalog";

export interface TrackConfig {
  catalogFloorCents: number;     // CATALOG_FLOOR_CENTS            1       a class-0 single gets a catalogue row when its score >= this (1 = every priced single; 25 / 50 are the fallback ladder if the published bytes bind)
  catalogExitRatio: number;      // CATALOG_EXIT_RATIO             0.8     a member stays LISTED while score >= ratio x floor
  oracleComplete: boolean;       // CATALOG_ORACLE_COMPLETE        1       every priced class-0 oracle keeps at least its TOP printing listed, whatever the floor (a no-op at floor 1)
  indexFloorCents: number;       // INDEX_FLOOR_CENTS              50      a listed class-0 row below this score is THIN (noindex, no sitemap entry); same 0.8 band. With RELEVANT_SHARE on it is the cut's lower bound
  relevantShare: number;         // RELEVANT_SHARE                 0.25    the share of listed class-0 rows that are RELEVANT (relevantRows): priced, tracked and indexed; every other row is THIN and untracked. 0 or >= 1 = off (the index floor alone)
  specialFloorCents: number;     // CATALOG_SPECIAL_FLOOR_CENTS    2000    class 1-4 (token, art, oversized, helper) enter at this best unit value; 0 = never catalogue them
  trackFloorCents: number;       // TRACK_FLOOR_CENTS              20      a UNIT (card, finish) of a RELEVANT row is tracked when its own TCGplayer MARKET >= this (500, then 50, until 2026-10-17: the relevance cut now decides which rows, the floor only drops bulk)
  trackExitRatio: number;        // TRACK_EXIT_RATIO               0.8
  lowBasis: boolean;             // TRACK_LOW_BASIS                0       1 = units priced only by a thin low may be tracked
  popBoost: boolean;             // TRACK_POP_BOOST                0       1 = tracking uses the popularity-boosted score (+24% units)
  perOracleCap: number;          // TRACK_PER_ORACLE_CAP           0       0 = off; K keeps the K best tracked printings of one oracle by score (ties: lower id)
  clipCents: number;             // PRICE_CLIP_CENTS               200000  V is clipped here for SCORING only, never for display
  catalogMaxRows: number;        // CATALOG_MAX_ROWS               200000  the importer refuses to write a larger catalogue (F6); was 130,000 when rows cost Neon bytes
  trackMaxUnits: number;         // TRACK_MAX_UNITS                120000  same for units (about 71,000 at the 50-cent floor)
  offerRowsBudget: number;       // OFFER_ROWS_BUDGET              650000  the published offer rows (import.ts budgetOffers: every unit keeps its cheapest offers per market first, then the dearest units get the rest)
  maxListedChange: number;       // IMPORT_MAX_LISTED_CHANGE       0.05    F10: more than 5% of EXISTING rows changing LISTED in one import keeps the old flags (unless released, below)
  maxTrackedChange: number;      // IMPORT_MAX_TRACKED_CHANGE      0.15    F10: more than 15% of EXISTING tracked units changing keeps the old track bits
  acceptFlagChange: boolean;     // IMPORT_ACCEPT_FLAG_CHANGE      0       1 = accept this run's flag changes once (an explicit, logged override)
  maxGuardTrips: number;         // IMPORT_GUARD_MAX_TRIPS         3       the Nth consecutive trip is accepted: a real, persistent repricing cannot lock the old flags forever
}
export const TRACK_DEFAULTS: TrackConfig = {
  catalogFloorCents: 1, catalogExitRatio: 0.8, oracleComplete: true, indexFloorCents: 50, relevantShare: 0.25, specialFloorCents: 2000, trackFloorCents: 20, trackExitRatio: 0.8, lowBasis: false, popBoost: false, perOracleCap: 0,
  clipCents: 200_000, catalogMaxRows: 200_000, trackMaxUnits: 120_000, offerRowsBudget: 650_000, maxListedChange: 0.05, maxTrackedChange: 0.15, acceptFlagChange: false, maxGuardTrips: 3,
};
const num = (v: string | undefined, d: number): number => { const n = v == null || v === "" ? NaN : Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
const flag = (v: string | undefined, d: boolean): boolean => (v == null || v === "" ? d : v === "1" || v.toLowerCase() === "true");
export function trackConfigFromEnv(env: Record<string, string | undefined> = process.env): TrackConfig {
  const d = TRACK_DEFAULTS;
  return {
    catalogFloorCents: num(env.CATALOG_FLOOR_CENTS, d.catalogFloorCents), catalogExitRatio: num(env.CATALOG_EXIT_RATIO, d.catalogExitRatio), oracleComplete: flag(env.CATALOG_ORACLE_COMPLETE, d.oracleComplete),
    indexFloorCents: num(env.INDEX_FLOOR_CENTS, d.indexFloorCents), relevantShare: num(env.RELEVANT_SHARE, d.relevantShare), specialFloorCents: num(env.CATALOG_SPECIAL_FLOOR_CENTS, d.specialFloorCents),
    trackFloorCents: num(env.TRACK_FLOOR_CENTS, d.trackFloorCents), trackExitRatio: num(env.TRACK_EXIT_RATIO, d.trackExitRatio), lowBasis: env.TRACK_LOW_BASIS === "1", popBoost: env.TRACK_POP_BOOST === "1",
    perOracleCap: num(env.TRACK_PER_ORACLE_CAP, d.perOracleCap), clipCents: num(env.PRICE_CLIP_CENTS, d.clipCents), catalogMaxRows: num(env.CATALOG_MAX_ROWS, d.catalogMaxRows), trackMaxUnits: num(env.TRACK_MAX_UNITS, d.trackMaxUnits),
    offerRowsBudget: num(env.OFFER_ROWS_BUDGET, d.offerRowsBudget), maxListedChange: num(env.IMPORT_MAX_LISTED_CHANGE, d.maxListedChange), maxTrackedChange: num(env.IMPORT_MAX_TRACKED_CHANGE, d.maxTrackedChange),
    acceptFlagChange: flag(env.IMPORT_ACCEPT_FLAG_CHANGE, d.acceptFlagChange), maxGuardTrips: Math.max(1, Math.floor(num(env.IMPORT_GUARD_MAX_TRIPS, d.maxGuardTrips))),
  };
}
/** The policy-relevant part of the config as a stable string. The importer stores it in the published catalogue state; a different value on the next run means an operator changed a dial on purpose (F10 releases once). Guard and cap fields are NOT part of it. */
export function trackConfigHash(cfg: TrackConfig): string {
  return [cfg.catalogFloorCents, cfg.catalogExitRatio, cfg.oracleComplete ? 1 : 0, cfg.indexFloorCents, cfg.specialFloorCents, cfg.trackFloorCents, cfg.trackExitRatio, cfg.lowBasis ? 1 : 0, cfg.popBoost ? 1 : 0, cfg.perOracleCap, cfg.clipCents, cfg.relevantShare].join("|");
}
export interface UnitValues { n: number | null; f: number | null }          // unitValueCents(...).cents per finish

/** A unit's value: its TCGplayer market, else its plausible low (lowBasis = true: a thin single listing nobody paid). null when neither. This is the DISPLAY value; rankings use marketOnlyCents. */
export function unitValueCents(row: PriceRowLike | null): { cents: number; lowBasis: boolean } | null {
  if (!row) return null;
  if (row.marketCents != null) return { cents: row.marketCents, lowBasis: false };
  return row.lowCents != null ? { cents: row.lowCents, lowBasis: true } : null;
}
/** The RANKING value of a unit: its market, never a low (critique 5: on 2026-10-07, 9 of the top 10 and 59 of the top 100 cards by "market else low" were single thin listings, worth $805,714 in all). Sorts, range filters, the hot-name score, "most valuable" lists, the index and the chase pool read this. */
export const marketOnlyCents = (row: PriceRowLike | null): number | null => (row && row.marketCents != null ? row.marketCents : null);
/** Normal-first headline. OP's "highest market wins" is deleted. Neither finish priced: { cents: null, finish: "N" }. */
export function headlineOf(n: number | null, f: number | null): { cents: number | null; finish: Finish } {
  return n != null ? { cents: n, finish: "N" } : f != null ? { cents: f, finish: "F" } : { cents: null, finish: "N" };
}
/** Value ranking: max of both finishes' MARKET values (never the headline, never a low). The chase pool, "most expensive" lists and TOP use this. */
export function bestUsd(c: { marketN: number | null; marketF: number | null }): number | null { const m = Math.max(c.marketN ?? 0, c.marketF ?? 0); return m > 0 ? m : null; }
/** Collection and deck lines call this on every write: the only finish a product has is forced; a finish it lacks falls back to the one it has. */
export function normalizeFoil(c: { mask: number }, wantFoil: boolean): boolean {
  const hasN = (c.mask & PRICE_MASK.HASN) !== 0, hasF = (c.mask & PRICE_MASK.HASF) !== 0;
  return hasF && !hasN ? true : hasN && !hasF ? false : wantFoil;
}
/** pop in [0, 1]: max(EDHREC rank ? 1 / (1 + rank / 1500) : 0, Reserved List ? 0.5 : 0). penny_rank is not used. Unjoined products and cls != 0 have pop 0. */
export const popularity = (edhrecRank: number | null, reserved: boolean): number => Math.max(edhrecRank ? 1 / (1 + edhrecRank / 1500) : 0, reserved ? 0.5 : 0);
/** min(max(n, f), clip) x (1 + 2 pop), in cents, NOT rounded (a rounded score would admit about 325 rows at 49.5 cents). Decides the CATALOGUE and the INDEX; the raw unit value decides TRACKING. */
export function trackScoreCents(v: UnitValues, pop: number, cfg: TrackConfig): number {
  const best = Math.max(v.n ?? 0, v.f ?? 0);
  return Math.min(best, cfg.clipCents) * (1 + 2 * pop);
}
/** cls 0: score >= floor, or already LISTED and score >= exitRatio x floor. cls 1-4: `score` is the best unit value (no popularity) against the special floor. */
export function inCatalogue(score: number, wasListed: boolean, cls: number, cfg: TrackConfig): boolean {
  const floor = cls === CARD_CLASS.CARD ? cfg.catalogFloorCents : cfg.specialFloorCents;
  if (floor <= 0 && cls !== CARD_CLASS.CARD) return false;
  return score >= floor || (wasListed && score >= cfg.catalogExitRatio * floor);
}
/** THIN (mask bit): a listed class-0 row whose score is under the INDEX floor. It keeps its page, its search hit and its place in set checklists, decks and binders; it gets `noindex, follow` and no sitemap entry.
 *  Same Schmitt band as the catalogue: a row that was indexable (`wasIndexable`, i.e. not THIN in the previous published catalogue; false for a new row) stays so while score >= 0.8 x indexFloor.
 *  Classes 1-4 are always THIN (a $215 Treasure token is reachable, never indexed). */
export function isThin(score: number, wasIndexable: boolean, cls: number, cfg: TrackConfig): boolean {
  if (cls !== CARD_CLASS.CARD) return true;
  if (cfg.indexFloorCents <= 0) return false;
  return !(score >= cfg.indexFloorCents || (wasIndexable && score >= cfg.catalogExitRatio * cfg.indexFloorCents));
}
/** A listed class-0 row that may compete for relevance. `cheapCents` is its Normal market when it may be its oracle's CHEAP printing (HASN, a market, not serialized, not NOTPLAY), else null. */
export interface RelevanceCandidate { id: number; oracleKey: string | null; score: number; cheapCents: number | null; wasRelevant: boolean }
/** RELEVANT (owner, 2026-10-17: "only the 25% most relevant cards are priced and indexed"): the rows that keep store prices, history and a place in search engines; every other listed row is THIN.
 *  A row's relevance is its score (price x (1 + 2 x EDHREC popularity)), except that its oracle's cheapest regular Normal printing takes the oracle's BEST score: a popular card's cheapest copy is the one people buy
 *  (a pure value cut left every Sol Ring, Command Tower and Arcane Signet under $2.29 out). The cut is the score of the row at `relevantShare` of the candidates (never under the index floor), with the 0.8 Schmitt band
 *  for rows that were relevant. Share off (0 or >= 1): the index floor alone, as before. Pure and order-independent (ties: the cut is a score, so equal scores are in or out together). */
export function relevantRows(rows: readonly RelevanceCandidate[], cfg: TrackConfig): { ids: Set<number>; cutCents: number } {
  const best = new Map<string, number>(), cheap = new Map<string, RelevanceCandidate>();
  for (const r of rows) {
    if (!r.oracleKey) continue;
    best.set(r.oracleKey, Math.max(best.get(r.oracleKey) ?? 0, r.score));
    if (r.cheapCents != null && r.cheapCents > 0) { const c = cheap.get(r.oracleKey); if (!c || r.cheapCents < c.cheapCents! || (r.cheapCents === c.cheapCents && r.id < c.id)) cheap.set(r.oracleKey, r); }
  }
  const rel = rows.map((r) => (r.oracleKey && cheap.get(r.oracleKey) === r ? Math.max(r.score, best.get(r.oracleKey)!) : r.score));
  let cut = cfg.indexFloorCents;
  if (cfg.relevantShare > 0 && cfg.relevantShare < 1 && rows.length) {
    const sorted = [...rel].sort((a, b) => b - a);
    cut = Math.max(cut, sorted[Math.max(1, Math.ceil(cfg.relevantShare * rows.length)) - 1]!);
  }
  const ids = new Set<number>();
  rows.forEach((r, i) => { if (cut <= 0 || rel[i]! >= cut || (r.wasRelevant && rel[i]! >= cfg.catalogExitRatio * cut)) ids.add(r.id); });
  return { ids, cutCents: cut };
}
/** A page is a sitemap/index candidate iff LISTED, not THIN, not GONE, class 0, and (tracked or TOP). The whole of 4.4 in one place. */
export function isIndexable(mask: number, cls: number): boolean {
  if (cls !== CARD_CLASS.CARD) return false;
  if (!(mask & PRICE_MASK.LISTED) || (mask & PRICE_MASK.GONE) || (mask & PRICE_MASK.THIN)) return false;   // GONEP (absent one day) keeps the page indexable: one missing day is not a removal
  return (mask & (PRICE_MASK.TRACKN | PRICE_MASK.TRACKF | PRICE_MASK.TOP)) !== 0;
}
/** Oracle completeness (critique 3): given every priced class-0 row, return the productIds to LIST in addition to the ones the floor admits, so that every priced oracle has at least one listed printing: its TOP printing
 *  (highest MARKET value, ties and low-only rows: highest value, then the lower id). `listedOracles` = oracles that already have a listed printing. Pure and order-independent. */
export function completenessPicks(rows: readonly { id: number; oracleId: string | null; marketCents: number | null; valueCents: number }[], listedOracles: ReadonlySet<string>): Set<number> {
  const best = new Map<string, { id: number; m: number; v: number }>();
  for (const r of rows) {
    if (!r.oracleId || listedOracles.has(r.oracleId)) continue;
    const m = r.marketCents ?? 0, cur = best.get(r.oracleId);
    if (!cur || m > cur.m || (m === cur.m && (r.valueCents > cur.v || (r.valueCents === cur.v && r.id < cur.id)))) best.set(r.oracleId, { id: r.id, m, v: r.valueCents });
  }
  return new Set([...best.values()].map((b) => b.id));
}
/** A unit is tracked when its own value >= the floor, or it was tracked and the value >= exitRatio x floor. Low-only units never track unless TRACK_LOW_BASIS=1. cls != 0 is never tracked (the caller passes cls). */
export function unitTracked(valueCents: number | null, wasTracked: boolean, lowBasis: boolean, cfg: TrackConfig, cls: number = CARD_CLASS.CARD): boolean {
  if (valueCents == null || cls !== CARD_CLASS.CARD || (lowBasis && !cfg.lowBasis)) return false;
  return valueCents >= cfg.trackFloorCents || (wasTracked && valueCents >= cfg.trackExitRatio * cfg.trackFloorCents);
}
export interface GuardState {
  /** trackConfigHash(cfg) differs from the hash published with the previous catalogue: an operator changed a dial on purpose. */
  configChanged: boolean;
  /** Consecutive earlier runs that tripped this guard (published catalogue state; 0 when none). */
  priorTrips: number;
}
export interface GuardVerdict { ok: boolean; reason?: string; bypass?: "first-run" | "config-changed" | "accepted" | "persisted"; trips: number }
/** F10: refuse a mass change of flags in one import.
 *  `prev` and `changed` count ROWS THAT EXISTED IN THE PREVIOUS RUN: inserts and GONE transitions are not "changes", so a bootstrap database that is then filled up by a full run does not trip it.
 *  Released (ok = true, the new flags are accepted) when: the previous catalogue has under 1,000 rows (first run, bootstrap); the policy dials changed since the previous run; IMPORT_ACCEPT_FLAG_CHANGE=1; or this would be
 *  the `maxGuardTrips`-th consecutive trip. F6 (the hard caps) still applies after any release. The caller stores `trips` and the config hash with the catalogue it publishes. */
export function flagChangeGuard(prev: { rows: number; tracked: number }, changed: { listed: number; tracked: number }, cfg: TrackConfig, state: GuardState = { configChanged: false, priorTrips: 0 }): GuardVerdict {
  if (prev.rows < 1000) return { ok: true, bypass: "first-run", trips: 0 };
  let reason: string | undefined;
  if (changed.listed > cfg.maxListedChange * prev.rows) reason = `LISTED would change on ${changed.listed} of ${prev.rows} rows`;
  else if (prev.tracked >= 1000 && changed.tracked > cfg.maxTrackedChange * prev.tracked) reason = `track bits would change on ${changed.tracked} of ${prev.tracked} units`;
  if (!reason) return { ok: true, trips: 0 };
  if (cfg.acceptFlagChange) return { ok: true, reason, bypass: "accepted", trips: 0 };
  if (state.configChanged) return { ok: true, reason, bypass: "config-changed", trips: 0 };
  if (state.priorTrips + 1 >= cfg.maxGuardTrips) return { ok: true, reason, bypass: "persisted", trips: 0 };
  return { ok: false, reason, trips: state.priorTrips + 1 };
}
