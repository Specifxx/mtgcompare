// The eBay quota model, enforced by the build (RiftCompare's
// affiliate-priority.test.ts pattern). If a floor, share or interval changes in
// src/lib/ebay-plan.ts, these numbers must still fit OP Compare's own 5,000
// Browse calls a day — and the methodology copy must say the same thing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_MAX_CALLS,
  DEFAULT_MIN_VALUE_CENTS,
  DEFAULT_QUOTA_RESERVE,
  EBAY_MARKETS,
  EU_MIN_VALUE_CENTS,
  MARKET_SHARES,
  PACING_MS,
  RETRY_RATE as PLAN_RETRY_RATE,
  S1_MIN_CENTS,
  SEALED_MIN_CENTS,
  TIER_INTERVAL_HOURS,
  BREAKER_CONSECUTIVE,
  BREAKER_MIN_PAIRS,
  FailureBreaker,
  budgetFor,
  clampLimits,
  duePairs,
  ebayRunVerdict,
  pairKey,
  envInt,
  isDue,
  marketScope,
  modelDailyCalls,
  parseOnlyMarket,
  planRun,
  rotateMarkets,
  tierOf,
  type EbayMarket,
  type Pair,
  type PlanProduct,
} from "../src/lib/ebay-plan";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── The model's constants ────────────────────────────────────────────────────
const DAILY_LIMIT = 5000; // OP Compare's own application. Raise with EBAY_MAX_CALLS after a Growth Check.
const RESERVE = DEFAULT_QUOTA_RESERVE;
const CAP = DEFAULT_MAX_CALLS;
const SPENDABLE = DAILY_LIMIT - RESERVE;
const RETRY_RATE = 0.25;
const SECONDS_PER_CALL = 0.75; // RiftCompare's measured figure — re-measure after week one
const PACING_SECONDS = PACING_MS / 1000;
const DB_AND_SETUP_MIN = 7;
const STALE_HOURS = Number(/export const STALE_HOURS = (\d+)/.exec(read("src/lib/import.ts"))![1]);
const TIMEOUT_MIN = Number(/timeout-minutes:\s*(\d+)/.exec(read(".github/workflows/ebay-prices.yml"))![1]);

// Tier counts. OP_COMPARE: re-counted from the OP Compare database on
// 2026-10-03 (Card.marketUsd / Sealed.marketUsd; sealed = kinds the eBay pass
// searches). TCGCSV: the spec's TCGCSV product counts (a more pessimistic sealed
// count, since it includes kinds we never search). Both must fit.
const OP_COMPARE = { s1: 388, s2Low: 409, s2High: 199, su: 76, sealed: 140 };
const TCGCSV = { s1: 386, s2Low: 409, s2High: 200, su: 75, sealed: 242 };

test("the model's retry rate is the plan's", () => {
  assert.equal(PLAN_RETRY_RATE, RETRY_RATE);
});

test("the modelled day fits the spendable quota and two capped runs", () => {
  for (const counts of [OP_COMPARE, TCGCSV]) {
    const { total, byMarket } = modelDailyCalls(counts);
    assert.ok(total <= SPENDABLE, `modelled ${total} > spendable ${SPENDABLE}`);
    assert.ok(total <= 2 * CAP, `modelled ${total} > two runs of ${CAP}`);
    assert.equal(byMarket.SG, 0);
  }
  assert.ok(2 * CAP <= SPENDABLE, "two runs at the cap must leave the reserve untouched");
  // The spec's worked arithmetic (§2.4): 910 / 654 / 121 a day; 3,984 in all.
  const m = modelDailyCalls(TCGCSV);
  assert.equal(Math.round(m.byMarket.US - 121), 910);
  assert.equal(Math.round(m.byMarket.EU - 121), 654);
  assert.equal(Math.round(m.byMarket.CA), 121);
  // The spec rounds sealed to 120 a market (3,984); unrounded it is 3,989.
  assert.equal(Math.round(m.total), 3989);
});

test("shares sum to 1; SG has none; CA singles cost nothing", () => {
  const sum = Object.values(MARKET_SHARES).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(MARKET_SHARES.SG, 0, "SG gets 0% unless an SG programme is added (DECISIONS)");
  assert.deepEqual(marketScope("SG"), { singles: false, sealed: false });
  assert.deepEqual(marketScope("CA"), { singles: false, sealed: true });
  const single: PlanProduct = { id: 1, kind: "single", marketUsd: 50000, number: "OP01-120", launch: false };
  assert.equal(tierOf(single, "CA"), null);
  assert.equal(modelDailyCalls({ s1: 1000, s2Low: 0, s2High: 0, su: 0, sealed: 0 }).byMarket.CA, 0);
});

test("the longest interval can slip one run and stay inside the 72h freshness window", () => {
  const maxInterval = Math.max(...Object.values(TIER_INTERVAL_HOURS));
  assert.ok(maxInterval + 12 < STALE_HOURS, `${maxInterval}h + 12h must be < ${STALE_HOURS}h`);
});

test("one capped run fits the workflow's timeout with a 25% margin", () => {
  const minutes = (CAP * (SECONDS_PER_CALL + PACING_SECONDS)) / 60 + DB_AND_SETUP_MIN;
  assert.ok(minutes <= 0.75 * TIMEOUT_MIN, `${minutes.toFixed(1)} min > 75% of ${TIMEOUT_MIN}`);
});

test("budgetFor: live count minus reserve, capped per run; a dispatch cap only lowers it", () => {
  assert.equal(budgetFor(null), CAP);
  assert.equal(budgetFor(5000), CAP);
  assert.equal(budgetFor(2800), 2200);
  assert.equal(budgetFor(500), 0);
  assert.equal(budgetFor(5000, CAP, RESERVE, "50"), 50);
  assert.equal(budgetFor(5000, CAP, RESERVE, 50), 50);
  assert.equal(budgetFor(700, CAP, RESERVE, "50"), 50);
  assert.equal(budgetFor(620, CAP, RESERVE, "50"), 20);
  const logs: string[] = [];
  for (const bad of ["9999", "0", "-5", "abc"]) assert.equal(budgetFor(5000, CAP, RESERVE, bad, (m) => logs.push(m)), CAP);
  assert.equal(logs.length, 4);
  assert.equal(budgetFor(5000, CAP, RESERVE, ""), CAP);
});

test("budgetFor: a negative reserve is 0, never a budget above the live count", () => {
  assert.equal(budgetFor(1000, CAP, -1000), 1000);
  assert.equal(budgetFor(1000, CAP, -1000, null, undefined, { dailyLimit: 5000 }), 1000);
  const logs: string[] = [];
  assert.deepEqual(clampLimits(CAP, -1000, 5000, (m) => logs.push(m)), { cap: CAP, reserve: 0 });
  assert.match(logs.join("\n"), /negative/);
});

test("budgetFor: a cap above half the spendable day is lowered, against the LIVE limit", () => {
  const logs: string[] = [];
  // EBAY_MAX_CALLS=4400 would let the first run after eBay's reset take the whole day.
  assert.deepEqual(clampLimits(4400, RESERVE, 5000, (m) => logs.push(m)), { cap: 2200, reserve: RESERVE });
  assert.equal(logs.length, 1);
  assert.equal(budgetFor(5000, 4400, RESERVE, null, undefined, { dailyLimit: 5000 }), 2200);
  // After a Growth Check (a 10,000 limit) the same variable is allowed.
  assert.deepEqual(clampLimits(4400, RESERVE, 10000), { cap: 4400, reserve: RESERVE });
  assert.equal(budgetFor(10000, 4400, RESERVE, null, undefined, { dailyLimit: 10000 }), 4400);
  // The defaults sit exactly at the bound.
  assert.deepEqual(clampLimits(CAP, RESERVE, DAILY_LIMIT), { cap: CAP, reserve: RESERVE });
});

test("budgetFor: an unknown live count is bounded by our own last-24h spend, so 3 runs in a day can't pass the limit", () => {
  assert.equal(budgetFor(null, CAP, RESERVE, null, undefined, { ourSpend24h: 0 }), CAP);
  assert.equal(budgetFor(null, CAP, RESERVE, null, undefined, { ourSpend24h: 2200 }), 2200);
  assert.equal(budgetFor(null, CAP, RESERVE, null, undefined, { ourSpend24h: 4400 }), 0);
  assert.equal(budgetFor(null, CAP, RESERVE, null, undefined, { ourSpend24h: 3000 }), 1400);
  // Three runs land in one eBay day (two schedules and a dispatch), the count unreadable every time.
  let spent = 0;
  for (let run = 0; run < 3; run++) spent += budgetFor(null, CAP, RESERVE, null, undefined, { ourSpend24h: spent });
  assert.ok(spent <= DAILY_LIMIT - RESERVE, `${spent} > ${DAILY_LIMIT - RESERVE}`);
});

test("the failure breaker: 10 failed searches in a row, or over half after 50, stop the run", () => {
  const b = new FailureBreaker();
  for (let i = 0; i < BREAKER_CONSECUTIVE - 1; i++) assert.equal(b.record(true), false);
  assert.equal(b.record(true), true);
  assert.match(b.tripped!, /10 failed searches in a row/);
  // Scattered failures: no streak of 10, but more than half of 50+.
  const r = new FailureBreaker();
  let tripped = false;
  for (let i = 0; i < BREAKER_MIN_PAIRS + 10 && !tripped; i++) tripped = r.record(i % 3 !== 0);
  assert.ok(tripped && r.pairs >= BREAKER_MIN_PAIRS && r.failures / r.pairs > 0.5, String(r.tripped));
  // A healthy run with the odd failure never trips.
  const ok = new FailureBreaker();
  for (let i = 0; i < 2000; i++) assert.equal(ok.record(i % 10 === 0), false);
});

test("the run's verdict: red on a refused token, a tripped breaker, or calls spent with nothing completed", () => {
  assert.deepEqual(ebayRunVerdict({ latched: null, spent: 0, completed: 0 }), { ok: true, reason: null });
  assert.equal(ebayRunVerdict({ latched: "budget", spent: 2200, completed: 1700 }).ok, true);
  assert.equal(ebayRunVerdict({ latched: "429", spent: 300, completed: 250 }).ok, true);
  assert.equal(ebayRunVerdict({ tokenRefused: true, latched: null, spent: 0, completed: 0 }).ok, false);
  assert.equal(ebayRunVerdict({ latched: "failures", spent: 10, completed: 0 }).ok, false);
  assert.equal(ebayRunVerdict({ latched: "failures", spent: 900, completed: 600 }).ok, false);
  assert.equal(ebayRunVerdict({ latched: "budget", spent: 40, completed: 0 }).ok, false);
});

test("steady state: the 24h/48h tiers settle into a 4-run cycle, and no run plans past the cap", () => {
  // OP_COMPARE's tier counts as products; each run searches every pair it planned.
  const products: PlanProduct[] = [];
  let id = 1;
  const add = (n: number, marketUsd: number | null, extra: Partial<PlanProduct> = {}) => {
    for (let i = 0; i < n; i++) products.push({ id: id++, kind: "single", marketUsd, number: "OP01-001", launch: false, ...extra });
  };
  add(OP_COMPARE.s1, 20000);
  add(OP_COMPARE.s2Low, 3000);
  add(OP_COMPARE.s2High, 7000);
  add(OP_COMPARE.su, null, { launch: true, refUsd: 3000 });
  for (let i = 0; i < OP_COMPARE.sealed; i++) products.push({ id: id++, kind: "sealed", marketUsd: 9000, sealedKind: "Booster Box", launch: false });
  const checks = new Map<string, Date>();
  const t0 = new Date("2026-10-04T05:37:00Z").getTime();
  const modelled: number[] = [];
  for (let run = 0; run < 16; run++) {
    const at = new Date(t0 + run * 12 * 3600_000);
    const due = Object.fromEntries(EBAY_MARKETS.map((m) => [m, duePairs(products, m, checks, at)]));
    const plan = planRun(due, CAP, at);
    assert.ok(plan.modelled <= CAP, `run ${run}: ${plan.modelled} > ${CAP}`);
    for (const p of plan.order) checks.set(pairKey(p.productId, p.market), at);
    modelled.push(Math.round(plan.modelled));
  }
  // From the third day the plan repeats every 4 runs, and 3 of the 4 plan at the cap
  // (DECISIONS: first-week slip in those runs is expected; the alarm is S2 past 60h).
  const tail = modelled.slice(8);
  for (let i = 4; i < tail.length; i++) assert.ok(Math.abs(tail[i] - tail[i - 4]) <= 2, modelled.join(" "));
  const day = tail.slice(0, 4);
  assert.ok(day.filter((m) => m >= CAP - 2).length >= 2, modelled.join(" "));
  assert.ok(day.reduce((a, b) => a + b, 0) / 2 <= 2 * CAP, modelled.join(" "));
});

test("envInt treats an empty GitHub variable as unset, never 0", () => {
  assert.equal(envInt(""), null);
  assert.equal(envInt(undefined), null);
  assert.equal(envInt(" 600 "), 600);
  assert.equal(envInt("abc"), null);
  assert.equal(envInt("0"), 0);
});

test("EBAY_ONLY_MARKET: an unknown code throws; ca is sealed only", () => {
  assert.throws(() => parseOnlyMarket("XX"));
  assert.equal(parseOnlyMarket(""), null);
  assert.equal(parseOnlyMarket("ca"), "CA");
  assert.equal(parseOnlyMarket("gb"), "UK");
  assert.deepEqual(marketScope(parseOnlyMarket("ca")!), { singles: false, sealed: true });
});

test("tiers: S1 / S2 floors per market, unpriced only in a launch window, no DON!!, no loose packs", () => {
  const s = (marketUsd: number | null, extra: Partial<PlanProduct> = {}): PlanProduct => ({ id: 1, kind: "single", marketUsd, number: "OP01-001", launch: false, ...extra });
  assert.equal(tierOf(s(S1_MIN_CENTS), "US"), "S1");
  assert.equal(tierOf(s(DEFAULT_MIN_VALUE_CENTS), "US"), "S2");
  assert.equal(tierOf(s(DEFAULT_MIN_VALUE_CENTS - 1), "US"), null);
  assert.equal(tierOf(s(DEFAULT_MIN_VALUE_CENTS), "EU"), null);
  assert.equal(tierOf(s(EU_MIN_VALUE_CENTS), "EU"), "S2");
  assert.equal(tierOf(s(null), "US"), null);
  // Unpriced in a launch window: only with a store reference price above the floor.
  assert.equal(tierOf(s(null, { launch: true }), "US"), null);
  assert.equal(tierOf(s(null, { launch: true, refUsd: DEFAULT_MIN_VALUE_CENTS }), "US"), "SU");
  assert.equal(tierOf(s(null, { launch: true, refUsd: DEFAULT_MIN_VALUE_CENTS - 1 }), "US"), null);
  assert.equal(tierOf(s(null, { launch: false, refUsd: 50000 }), "US"), null);
  // A printing whose own canonical title can't match it is never searched.
  assert.equal(tierOf(s(S1_MIN_CENTS, { matchable: false }), "US"), null);
  assert.equal(tierOf(s(50000, { number: null }), "US"), null);
  const p = (marketUsd: number | null, sealedKind = "Booster Box", launch = false): PlanProduct => ({ id: 2, kind: "sealed", marketUsd, sealedKind, launch });
  assert.equal(tierOf(p(SEALED_MIN_CENTS), "CA"), "P1");
  assert.equal(tierOf(p(SEALED_MIN_CENTS - 1), "US"), null);
  assert.equal(tierOf(p(9000, "Booster Pack"), "US"), null);
  assert.equal(tierOf(p(null, "Booster Box", true), "UK"), null);
  assert.equal(tierOf({ ...p(null, "Booster Box", true), refUsd: SEALED_MIN_CENTS }, "UK"), "P1");
  assert.equal(tierOf({ ...p(null, "Booster Box", true), refUsd: SEALED_MIN_CENTS - 1 }, "UK"), null);
  assert.equal(tierOf(p(9000), "SG"), null);
});

test("isDue: never searched, then interval minus a 3h grace; force ignores intervals", () => {
  const now = new Date("2026-10-03T05:37:00Z");
  const ago = (h: number) => new Date(now.getTime() - h * 3600_000);
  assert.ok(isDue(null, "S1", now));
  assert.ok(isDue(ago(23.97), "S1", now)); // checked 05:39 yesterday
  assert.ok(!isDue(ago(20), "S1", now));
  assert.ok(isDue(ago(45), "S2", now));
  assert.ok(!isDue(ago(44), "S2", now));
  assert.ok(isDue(ago(1), "S2", now, true));
});

const now = new Date("2026-10-03T05:37:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3600_000);

test("due order: S1 before S2, never-searched before stale, then most overdue, then value", () => {
  const products: PlanProduct[] = [
    { id: 1, kind: "single", marketUsd: 3000, number: "OP01-001", launch: false }, // S2, never
    { id: 2, kind: "single", marketUsd: 20000, number: "OP01-002", launch: false }, // S1, stale 30h
    { id: 3, kind: "single", marketUsd: 15000, number: "OP01-003", launch: false }, // S1, never
    { id: 4, kind: "single", marketUsd: 90000, number: "OP01-004", launch: false }, // S1, stale 25h
    { id: 5, kind: "single", marketUsd: null, number: "OP16-001", launch: true, refUsd: 4000 }, // SU, never
    { id: 6, kind: "sealed", marketUsd: 12000, sealedKind: "Booster Box", launch: false }, // P1, never
  ];
  const checks = new Map([["2|US", ago(30)], ["4|US", ago(25)]]);
  const due = duePairs(products, "US", checks, now);
  assert.deepEqual(due.map((p) => p.productId), [3, 2, 4, 6, 1, 5]);
});

const pairs = (market: EbayMarket, n: number, kind: "single" | "sealed" = "single"): Pair[] =>
  Array.from({ length: n }, (_, i) => ({ productId: i + 1, market, kind, tier: "S1", marketUsd: 20000 - i, checkedAt: null, cost: kind === "single" ? 1.25 : 1 }));

test("planRun: each market within its share in phase 1, the leftover spills in phase 2", () => {
  const due = { US: pairs("US", 400), UK: pairs("UK", 400), AU: pairs("AU", 400), EU: pairs("EU", 400), CA: pairs("CA", 400, "sealed") };
  const plan = planRun(due, 1000, now, { dayIndex: 0 });
  for (const m of ["US", "UK", "AU", "EU", "CA"] as EbayMarket[]) assert.ok(plan.allowance[m] === Math.floor(1000 * MARKET_SHARES[m]));
  assert.ok(plan.modelled <= 1000);
  // A market with few due pairs hands its share on.
  const thin = planRun({ US: pairs("US", 1000), UK: pairs("UK", 4) }, 1000, now, { dayIndex: 0 });
  assert.equal(thin.used.UK, 5);
  assert.ok(thin.used.US > Math.floor(1000 * MARKET_SHARES.US), "US takes the spill");
  assert.ok(thin.modelled <= 1000 && thin.modelled > 990);
  assert.ok(thin.spill > 0);
  assert.equal(thin.overflow.length, 1000 + 4 - thin.order.length);
});

test("planRun: strict priority — a cheap low-tier pair never jumps a higher-tier one that doesn't fit", () => {
  const s1: Pair = { productId: 1, market: "US", kind: "single", tier: "S1", marketUsd: 20000, checkedAt: null, cost: 1.25 };
  const p1: Pair = { productId: 2, market: "US", kind: "sealed", tier: "P1", marketUsd: 9000, checkedAt: null, cost: 1 };
  const plan = planRun({ US: [s1, p1] }, 1, now, { only: "US" });
  assert.deepEqual(plan.order, []);
  assert.deepEqual(plan.overflow.map((p) => p.productId), [1, 2]);
});

test("planRun: EBAY_ONLY_MARKET gets the whole budget and nothing spills", () => {
  const plan = planRun({ US: pairs("US", 100) }, 50, now, { only: "US" });
  assert.equal(plan.allowance.US, 50);
  assert.equal(plan.order.length, 40);
  assert.equal(plan.spill, 0);
});

test("planRun: the execution order rotates by UTC day, so every market takes the last slot", () => {
  const due = Object.fromEntries((["US", "UK", "AU", "EU", "CA"] as EbayMarket[]).map((m) => [m, pairs(m, 3)]));
  const last = new Set<string>();
  for (let d = 0; d < 5; d++) {
    const plan = planRun(due, 4000, now, { dayIndex: d });
    last.add(plan.marketOrder[plan.marketOrder.length - 1]);
    assert.equal(plan.order[plan.order.length - 1].market, plan.marketOrder[plan.marketOrder.length - 1]);
  }
  assert.equal(last.size, 5);
  assert.deepEqual(rotateMarkets(["US", "UK"], 3), ["UK", "US"]);
  assert.deepEqual(EBAY_MARKETS.slice(0, 5), ["US", "UK", "AU", "EU", "CA"]);
});

test("the methodology page states the plan's floors and intervals", () => {
  const page = read("src/app/methodology/page.tsx").replace(/\s+/g, " ");
  const usd = (c: number) => `US$${c / 100}`;
  assert.ok(page.includes(`worth ${usd(DEFAULT_MIN_VALUE_CENTS)} or more`), "singles floor");
  assert.ok(page.includes(`(${usd(EU_MIN_VALUE_CENTS)} in the EU)`), "EU floor");
  assert.ok(page.includes(`sealed products worth ${usd(SEALED_MIN_CENTS)} or more`), "sealed floor");
  assert.ok(page.includes(`cards of ${usd(S1_MIN_CENTS)} and up daily`), "S1");
  assert.equal(TIER_INTERVAL_HOURS.S1, 24);
  assert.ok(page.includes("the rest every two days"));
  assert.equal(TIER_INTERVAL_HOURS.S2, 48);
  assert.equal(TIER_INTERVAL_HOURS.P1, 48);
  assert.ok(page.includes("Twice a day"));
  assert.equal((read(".github/workflows/ebay-prices.yml").match(/- cron:/g) ?? []).length, 2);
});
