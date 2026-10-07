// The eBay pass end to end (src/lib/ebay-import.ts runEbayPass) against a
// mocked fetch and an in-memory stand-in for Prisma — no database, no network.
// Pins the failure breaker (searches failing without a 429 stop the run and
// fail it), the run's verdict, and the foreign-spend guard's 50-call budget.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

// ── A Prisma stand-in, installed before lib/db.ts is first imported ─────────
type Row = Record<string, unknown>;
const db = { importRuns: [] as Row[], writes: 0 };
const N_CARDS = 60;
const cards = Array.from({ length: N_CARDS }, (_, i) => ({
  id: i + 1,
  name: `Card${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}name`,
  number: `OP01-${String(i + 1).padStart(3, "0")}`,
  variant: null,
  marketUsd: 20000, // S1
  set: { code: "OP01", name: "Romance Dawn", releasedOn: new Date("2022-12-02") },
}));
const op = () => Promise.resolve({ count: 0 });
(globalThis as unknown as { prisma: unknown }).prisma = {
  importRun: { findMany: async () => db.importRuns },
  card: { findMany: async () => cards },
  sealed: { findMany: async () => [] },
  ebayCheck: { findMany: async () => [], upsert: () => (db.writes++, op()) },
  offer: { findMany: async () => [], upsert: () => (db.writes++, op()), deleteMany: () => (db.writes++, op()) },
  ebayListing: { deleteMany: () => (db.writes++, op()), createMany: () => (db.writes++, op()) },
  ebayGradedListing: { deleteMany: () => (db.writes++, op()), createMany: () => (db.writes++, op()) },
  $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
};

let searchStatus = 503;
let remaining: number | null = 5000;
let searches = 0;
const realFetch = globalThis.fetch;
const realLog = console.log;
const env = { ...process.env };
let annotations: string[] = [];

beforeEach(async () => {
  const { resetEbayClientForTests } = await import("../src/lib/ebay");
  resetEbayClientForTests({ pacingMs: 0 });
  searches = 0;
  searchStatus = 503;
  remaining = 5000;
  db.importRuns = [];
  db.writes = 0;
  annotations = [];
  process.env.EBAY_CLIENT_ID = "test-app-id";
  process.env.EBAY_CLIENT_SECRET = "test-cert-id";
  for (const k of ["EBAY_MAX_CALLS", "EBAY_QUOTA_RESERVE", "EBAY_DISPATCH_CAP", "EBAY_ONLY_MARKET", "EBAY_FORCE", "EBAY_MIN_VALUE_CENTS"]) delete process.env[k];
  console.log = (...a: unknown[]) => {
    if (typeof a[0] === "string" && a[0].startsWith("::")) annotations.push(a[0]);
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname !== "api.ebay.com") throw new Error(`mock: refusing ${url.hostname}`);
    if (url.pathname === "/identity/v1/oauth2/token") return new Response(JSON.stringify({ access_token: "tok-test", expires_in: 7200 }), { status: 200 });
    if (url.pathname.startsWith("/developer/analytics/")) {
      if (remaining == null) return new Response("{}", { status: 503 });
      return new Response(JSON.stringify({ rateLimits: [{ resources: [{ name: "buy.browse", rates: [{ limit: 5000, remaining, reset: "r" }] }] }] }), { status: 200 });
    }
    if (url.pathname === "/buy/browse/v1/item_summary/search") {
      searches++;
      if (searchStatus !== 200) return new Response("{}", { status: searchStatus });
      return new Response(JSON.stringify({ total: 0, itemSummaries: [] }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
  for (const k of ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"]) {
    if (env[k] == null) delete process.env[k];
    else process.env[k] = env[k];
  }
});

const run = async () => {
  const { runEbayPass } = await import("../src/lib/ebay-import");
  const { ebayRunVerdict } = await import("../src/lib/ebay-plan");
  const logs: string[] = [];
  const summary = await runEbayPass((...a) => logs.push(a.join(" ")), { now: new Date("2026-10-04T05:37:00Z") });
  return { summary, verdict: ebayRunVerdict(summary), logs: logs.join("\n") };
};

test("every search answering 503: the breaker stops the run after 10 calls and the run is red", async () => {
  const { summary, verdict, logs } = await run();
  assert.equal(searches, 10, "10 charged calls, not the 2,200 budget");
  assert.equal(summary.spent, 10);
  assert.equal(summary.latched, "failures");
  assert.equal(summary.completed, 0);
  assert.equal(verdict.ok, false);
  assert.equal(db.writes, 0, "a failed search writes nothing");
  assert.match(logs, /stopping — 10 failed searches in a row/);
  assert.ok(annotations.some((a) => a.startsWith("::error title=eBay searches failing::")));
});

test("a 401 (keyset not approved for Browse) stops the same way", async () => {
  searchStatus = 401;
  const { summary, verdict } = await run();
  assert.equal(searches, 10);
  assert.equal(summary.latched, "failures");
  assert.equal(verdict.ok, false);
});

test("healthy searches: every planned pair completes and the run is green", async () => {
  searchStatus = 200;
  const { summary, verdict } = await run();
  assert.ok(summary.completed > 0);
  assert.equal(summary.latched, null);
  assert.equal(verdict.ok, true);
  // 60 S1 singles in US/UK/AU/EU, each a strict query plus the retry on 0 items.
  assert.equal(summary.completed, N_CARDS * 4);
  assert.equal(summary.spent, N_CARDS * 4 * 2);
});

test("foreign spend: the run spends at most 50 calls and says so on the run page", async () => {
  searchStatus = 200;
  remaining = 3000; // 2,000 used today, none of it ours
  const { summary, verdict } = await run();
  assert.equal(summary.foreignSpendWarning, true);
  assert.equal(summary.budget, 50);
  assert.ok(summary.spent <= 50);
  assert.equal(verdict.ok, true);
  assert.ok(annotations.some((a) => a.startsWith("::warning title=eBay keyset::another app is spending this keyset")));
});

test("unknown live count: our own last-24h spend bounds the budget", async () => {
  remaining = null;
  db.importRuns = [{ summary: { spent: 2200 } }, { summary: { spent: 2200 } }];
  searchStatus = 200;
  const { summary } = await run();
  assert.equal(summary.budget, 0);
  assert.equal(searches, 0);
});

test("the runner records the spend even when the pass throws, and fails on the verdict", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(path.resolve(__dirname, "../scripts/ebay.ts"), "utf8");
  const catchBlock = src.slice(src.indexOf("} catch (e) {"));
  assert.match(catchBlock, /spent: ebaySpentThisRun\(\)/);
  assert.match(src, /const verdict = ebayRunVerdict\(summary\)/);
  assert.match(src, /ok: verdict\.ok/);
  assert.match(src, /onProgress:/);
});
