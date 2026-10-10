// RiftCompare comes first (contract 10.1, ebay-brief 8): MTG Compare shares RiftCompare's eBay keyset, so its budget is min(ledger allowance, live remaining - a reserve that covers Rift's own
// jobs still to run before the quota resets), and every unreadable input is ZERO calls with a named reason. The worked examples are the brief's table, computed here by the code under test.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_EBAY_CONFIG, EBAY_CRONS, MAIN_AFTER_RIFT_MIN, MAIN_CRON, MIN_RUN, RIFT_JOBS, RIFT_LAST_BIG_CRON_MIN, allowanceFor, effectiveCap, foreignObserved, foreignRise, reserveFor, riftNeed,
  type AllowanceInput, type EbayConfig, type QuotaReading,
} from "../src/lib/ebay-plan";
import { IMPORT_WINDOW_UTC } from "../src/lib/schedule";

const ROOT = path.resolve(__dirname, "..");
const LIVE: EbayConfig = { ...DEFAULT_EBAY_CONFIG, observeOnly: false };
const at = (iso: string) => new Date(iso);
const quota = (remaining: number, reset: string, over: Partial<QuotaReading> = {}): QuotaReading => ({ remaining, limit: 5000, reset: at(reset), timeWindowSec: 86_400, ...over });
const ledger = (cap = 1000, claimed = 0, blockedUntil: Date | null = null) => ({ cap, claimed, blockedUntil });
const input = (o: Partial<AllowanceInput> & { now: Date; quota: QuotaReading | null }): AllowanceInput => ({ cfg: LIVE, ledger: ledger(), paused: false, purpose: "main", ...o });

test("L0, build-time arithmetic: MTG's daily budget fits the shared quota beside Rift's plan, its reserve and its margin", () => {
  const c = DEFAULT_EBAY_CONFIG;
  assert.equal(effectiveCap(5000, c), 1000);
  assert.ok(c.dailyBudget + c.riftDailyPlan + c.otherSiblings + c.riftOwnReserve + c.riftMargin <= 5000, "1,000 + 3,000 + 60 + 600 + 300 <= 5,000");
  assert.equal(5000 - c.riftOwnReserve - c.riftMargin - c.riftDailyPlan - c.otherSiblings, 1040, "the slack is 1,040: the owner's 1,000 is about the edge");
});
test("the adaptive cap: when Rift's measured p95 grows, MTG's cap shrinks on its own", () => {
  const c = DEFAULT_EBAY_CONFIG;
  assert.equal(effectiveCap(5000, c, 3800), 240);
  assert.equal(effectiveCap(5000, c, 2000), 1000, "a measured value under the plan never raises the cap");
  assert.equal(effectiveCap(2000, c), 0, "a smaller quota leaves nothing for MTG");
  assert.equal(effectiveCap(5000, { ...c, dailyBudget: 400 }), 400);
  assert.equal(effectiveCap(5000, { ...c, keysetMode: "own", dailyBudget: 900 }), 900, "own mode has no Rift to protect");
});

test("Rift's jobs still ahead are the reserve: summer (reset 07:00Z), main run at 22:37Z", () => {
  const now = at("2026-07-10T22:37:00Z"), reset = at("2026-07-11T07:00:00Z");
  // the 00:00 and 04:00 auction sweeps (6 each), the sibling runs at 21:47 (it may still be running: within the 120-minute drift) and 05:17 (60 each); Rift's 07:00 job starts after the reset
  assert.equal(riftNeed(now, reset), 6 + 6 + 60 + 60);
  assert.equal(reserveFor(now, reset, LIVE), 600 + 132 + 300);
});
test("winter (reset 08:00Z): Rift's 07:00 job still runs before the reset and is reserved in full", () => {
  const now = at("2026-12-10T22:37:00Z"), reset = at("2026-12-11T08:00:00Z");
  assert.equal(riftNeed(now, reset), 2000 + 6 + 6 + 60 + 60);
  assert.equal(reserveFor(now, reset, LIVE), 600 + 2132 + 300);
  const a = allowanceFor(input({ now, quota: quota(3826, "2026-12-11T08:00:00Z") }));
  assert.equal(a.allowance, Math.min(1000, 3826 - 3032), "remaining 3,826 minus the 3,032 reserve leaves 794");
});
test("a morning banner run reserves Rift's evening job and the afternoon sweeps", () => {
  const now = at("2026-07-10T10:37:00Z"), reset = at("2026-07-11T07:00:00Z");
  assert.equal(riftNeed(now, reset), 6 + 6 + 1000 + 6 + 60 + 6 + 6 + 60, "12:00, 16:00, the 19:00 job, 20:00, the 21:47 run, 00:00, 04:00, the 05:17 run");
});
test("an observed foreign profile larger than the table overrides it", () => {
  const now = at("2026-07-10T22:37:00Z"), reset = at("2026-07-11T07:00:00Z");
  assert.equal(riftNeed(now, reset, RIFT_JOBS, 400), 400);
  assert.equal(reserveFor(now, reset, { ...LIVE, riftBoost: 800 }, 400), 600 + 400 + 300 + 800, "a Rift launch window: the boost is added on top; the observed profile (400) replaces the table's 132");
});

test("the allowance is min(ledger, remaining - reserve, run share, cap, dispatch cap)", () => {
  const now = at("2026-07-10T22:37:00Z");
  const q = (r: number) => quota(r, "2026-07-11T07:00:00Z");
  assert.equal(allowanceFor(input({ now, quota: q(2726) })).allowance, 1000 - 0, "plenty of quota: the ledger's day binds");
  assert.equal(allowanceFor(input({ now, quota: q(2726), ledger: ledger(1000, 420) })).allowance, 580);
  assert.equal(allowanceFor(input({ now, quota: q(1826) })).allowance, 1826 - 1032);
  assert.equal(allowanceFor(input({ now, quota: q(2726), cfg: { ...LIVE, maxCalls: 300 } })).allowance, 300);
  assert.equal(allowanceFor(input({ now, quota: q(2726), purpose: "banner" })).allowance, 70);
  assert.equal(allowanceFor(input({ now, quota: q(2726), dispatchCap: "50" })).allowance, 50);
  assert.equal(allowanceFor(input({ now, quota: q(2726), dispatchCap: "5000" })).allowance, 1000, "a dispatch cap can only lower the budget");
  assert.equal(allowanceFor(input({ now, quota: q(2726), dispatchCap: "abc" })).allowance, 1000);
});

test("FAIL CLOSED: every unreadable or unsafe input is zero calls with a named reason", () => {
  const now = at("2026-07-10T22:37:00Z");
  const good = quota(2726, "2026-07-11T07:00:00Z");
  const why = (o: Partial<AllowanceInput>) => allowanceFor({ ...input({ now, quota: good }), ...o });
  assert.equal(why({}).stop, null);
  assert.deepEqual([why({ cfg: { ...LIVE, apiEnabled: false } }).stop, why({ cfg: { ...LIVE, apiEnabled: false } }).allowance], ["api-disabled", 0]);
  assert.equal(why({ paused: true }).stop, "paused");
  assert.equal(why({ cfg: { ...DEFAULT_EBAY_CONFIG, observeOnly: true } }).stop, "observe-only", "EBAY_OBSERVE_ONLY=1 reads the quota and spends nothing");
  assert.equal(why({ cfg: { ...DEFAULT_EBAY_CONFIG, observeOnly: true } }).allowance, 0);
  assert.deepEqual([why({ cfg: DEFAULT_EBAY_CONFIG }).stop, why({ cfg: DEFAULT_EBAY_CONFIG }).allowance], [null, 1000], "the defaults spend (the owner's go-ahead, 2026-10-10): the day's full 1,000 when Rift leaves room");
  assert.equal(why({ ledger: null }).stop, "ledger-unreachable");
  assert.equal(why({ ledger: ledger(1000, 0, at("2026-07-11T07:00:00Z")) }).stop, "ledger-blocked", "a 429 blocked the window");
  assert.equal(why({ ledger: ledger(1000, 1000) }).stop, "ledger-cap");
  assert.equal(why({ quota: null }).stop, "quota-unreadable");
  assert.equal(why({ quota: quota(2726, "2026-07-10T20:00:00Z") }).stop, "quota-unreadable", "a reset in the past");
  assert.equal(why({ quota: quota(2726, "2026-07-13T07:00:00Z") }).stop, "quota-unreadable", "a reset more than a window and an hour ahead");
  assert.equal(why({ quota: quota(Number.NaN, "2026-07-11T07:00:00Z") }).stop, "quota-unreadable");
  assert.equal(why({ quota: quota(-1, "2026-07-11T07:00:00Z") }).stop, "quota-unreadable");
  assert.equal(why({ quota: quota(900, "2026-07-11T07:00:00Z") }).stop, "reserve", "remaining under the reserve");
  assert.equal(why({ quota: quota(1032 + MIN_RUN - 1, "2026-07-11T07:00:00Z") }).stop, "reserve", "an allowance under the minimum run is not worth a run");
  assert.equal(why({ quota: quota(1032 + MIN_RUN, "2026-07-11T07:00:00Z") }).allowance, MIN_RUN);
  assert.equal(why({ cfg: { ...LIVE, dailyBudget: 0 }, ledger: ledger(0) }).stop, "ledger-cap");
});
test("shared mode never falls back to a guess; own mode may, bounded by our own 24-hour spend", () => {
  const now = at("2026-07-10T22:37:00Z");
  const own: EbayConfig = { ...LIVE, keysetMode: "own", quotaReserve: 600 };
  assert.equal(allowanceFor(input({ now, quota: null })).stop, "quota-unreadable");
  const a = allowanceFor(input({ now, quota: null, cfg: own, ourSpend24h: 3900 }));
  assert.equal(a.allowance, 500, "5,000 - 3,900 spent by us - the 600 reserve = 500");
  assert.equal(allowanceFor(input({ now, quota: quota(4000, "2026-07-11T07:00:00Z"), cfg: own })).allowance, 1000, "own mode reserves only EBAY_QUOTA_RESERVE");
  assert.equal(allowanceFor(input({ now, quota: quota(1500, "2026-07-11T07:00:00Z"), cfg: own })).allowance, 900);
});

test("foreign spend: what everything else used of the window, and the rise alarm", () => {
  assert.equal(foreignObserved(5000, 2200, 800), 2000);
  assert.equal(foreignObserved(5000, 4900, 300), 0);
  assert.equal(foreignRise([2900, 3000, 3100, 3000, 2950], 3000), false);
  assert.equal(foreignRise([2900, 3000, 3100, 3000, 2950], 3900), true, "more than 25% above the median");
  assert.equal(foreignRise([3000, 3000], 9000), false, "too little history to alarm");
});

test("cron placement: the main pass is >= 180 minutes after Rift's last big job and outside the import window; no run is at the top of the hour", () => {
  const [h, m] = MAIN_CRON.split(" ").slice(1, 2).concat(MAIN_CRON.split(" ")[0]!).map(Number) as [number, number];
  const mainMin = h! * 60 + m!;
  assert.equal(RIFT_LAST_BIG_CRON_MIN, 19 * 60);
  assert.ok(mainMin >= RIFT_LAST_BIG_CRON_MIN + MAIN_AFTER_RIFT_MIN, `main at ${mainMin} min`);
  const [ws, we] = [IMPORT_WINDOW_UTC.start, IMPORT_WINDOW_UTC.end].map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
  for (const c of EBAY_CRONS) {
    const [min, hour] = c.split(" ").map(Number) as [number, number];
    const t = hour * 60 + min;
    assert.ok(t < ws! || t > we!, `${c} is inside the import window ${IMPORT_WINDOW_UTC.start}-${IMPORT_WINDOW_UTC.end}`);
    assert.notEqual(min, 0, "minute 0 is the busiest minute of the hour");
  }
});

test("the mirrored table matches RiftCompare's workflows when a checkout exists", { skip: !fs.existsSync("/home/user/TCGEmpire/.github/workflows/refresh-prices.yml") }, () => {
  const wf = (f: string) => fs.readFileSync(path.join("/home/user/TCGEmpire/.github/workflows", f), "utf8");
  const crons = (f: string) => [...wf(f).replace(/^\s*#.*$/gm, "").matchAll(/- cron:\s*"([^"]+)"/g)].map((m) => m[1]!.split(" ").slice(0, 2).map(Number) as [number, number]);
  const prices = crons("refresh-prices.yml").map(([m, h]) => h! * 60 + m!).sort((a, b) => a - b);
  assert.deepEqual(RIFT_JOBS.filter((j) => j.name.startsWith("refresh-prices")).map((j) => j.hour * 60 + j.minute).sort((a, b) => a - b), prices);
  const pokemon = crons("pokemon-import.yml").map(([m, h]) => h! * 60 + m!);
  assert.deepEqual(RIFT_JOBS.filter((j) => j.name.startsWith("pokemon-import")).map((j) => j.hour * 60 + j.minute).sort((a, b) => a - b), [...pokemon].sort((a, b) => a - b), "the sibling runs are in the table");
  assert.match(wf("refresh-auctions.yml"), /- cron: "0 \*\/4 \* \* \*"/, "the auction sweeps run every four hours");
  assert.equal(RIFT_JOBS.filter((j) => j.name.startsWith("refresh-auctions")).length, 6, "every 4 hours: six sweeps a day");
});

test("the quota window is the ledger's day: a drifting reset cannot double-spend", async () => {
  const { windowKeyOf } = await import("../src/lib/ebay-ledger");
  assert.equal(windowKeyOf(at("2026-07-11T07:00:00Z"), 86_400), "2026-07-10");
  assert.equal(windowKeyOf(at("2026-12-11T08:00:00Z"), 86_400), "2026-12-10");
  assert.equal(windowKeyOf(at("2026-11-01T08:00:00Z"), 86_400), "2026-10-31", "the reset moves from 07:00Z to 08:00Z on 2026-11-01 and the key is the day the window STARTED");
  assert.equal(windowKeyOf(at("2026-07-11T07:00:00Z"), Number.NaN), "2026-07-10");
});
