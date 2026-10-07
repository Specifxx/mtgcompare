// The eBay client (src/lib/ebay.ts): metering, the latch, the off switch and
// the partial-run write rule. Network is a mocked fetch with Browse-shaped
// JSON; no real eBay host is ever reached and no real credential is used.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  capEbayBudget,
  getToken,
  isEbayEnabled,
  isEbayRateLimited,
  parseRateLimits,
  primeEbayBudget,
  resetEbayClientForTests,
  searchBrowse,
  spend,
  ebaySpentThisRun,
} from "../src/lib/ebay";
import { combineQueries, pairWrite } from "../src/lib/ebay-plan";

const ROOT = path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "src/lib/ebay.ts"), "utf8");

// ── Source-level rules ───────────────────────────────────────────────────────
test("every Browse fetch is metered and every fetch has a timeout", () => {
  const fetches = [...SRC.matchAll(/await fetch\(/g)].map((m) => m.index!);
  assert.ok(fetches.length >= 3);
  for (const i of fetches) {
    const call = SRC.slice(i, SRC.indexOf("});", i));
    assert.match(call, /signal:\s*AbortSignal\.timeout/, "every fetch passes signal:");
  }
  const search = SRC.indexOf("fetch(`${SEARCH_URL}");
  assert.ok(search > 0);
  const before = SRC.slice(SRC.lastIndexOf("export async function searchBrowse", search), search);
  assert.match(before, /if \(!spend\(\)\) return/, "spend() before the Browse fetch");
  assert.match(SRC, /res\.status === 429\) \{\s*rateLimited = true;/);
  assert.match(SRC, /let spendable = 0;/);
  assert.doesNotMatch(SRC, /spendable = Infinity/);
});

test("no log line can carry the token, the secret or the Basic header", () => {
  for (const f of ["src/lib/ebay.ts", "src/lib/ebay-import.ts", "scripts/ebay.ts"]) {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const line of text.split("\n").filter((l) => /console\.|\blog\(/.test(l))) {
      assert.doesNotMatch(line, /\$\{[^}]*(token|secret|basic|authorization|headers|EBAY_CLIENT)[^}]*\}/i, `${f}: ${line.trim()}`);
    }
  }
});

// ── Runtime, against a mocked fetch ──────────────────────────────────────────
type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let tokenStatus = 200;
let remaining: number | null = 5000;
let searchStatus: number[] = [];
const realFetch = globalThis.fetch;
const env = { ...process.env };

function mock(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/identity/v1/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "tok-test", expires_in: 7200, token_type: "Application Access Token" }), { status: tokenStatus });
    }
    if (url.includes("/developer/analytics/")) {
      if (remaining == null) return new Response("{}", { status: 500 });
      return new Response(
        JSON.stringify({ rateLimits: [{ apiContext: "buy", apiName: "Browse", resources: [{ name: "buy.browse", rates: [{ count: 5000 - remaining, limit: 5000, remaining, reset: "2026-10-04T07:00:00.000Z", timeWindow: 86400 }] }] }] }),
        { status: 200 },
      );
    }
    const st = searchStatus.shift() ?? 200;
    if (st !== 200) return new Response("{}", { status: st });
    return new Response(JSON.stringify({ href: url, total: 1, limit: 100, offset: 0, itemSummaries: [{ itemId: "v1|1|0", title: "Shanks OP01-120", price: { value: "7.50", currency: "USD" }, buyingOptions: ["FIXED_PRICE"] }] }), { status: 200 });
  }) as typeof fetch;
}

beforeEach(() => {
  resetEbayClientForTests();
  calls = [];
  tokenStatus = 200;
  remaining = 5000;
  searchStatus = [];
  process.env.EBAY_CLIENT_ID = "test-app-id";
  process.env.EBAY_CLIENT_SECRET = "test-cert-id";
  for (const k of ["EBAY_MAX_CALLS", "EBAY_QUOTA_RESERVE", "EBAY_DISPATCH_CAP"]) delete process.env[k];
  mock();
});
after(() => {
  globalThis.fetch = realFetch;
  for (const k of ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_MAX_CALLS", "EBAY_QUOTA_RESERVE", "EBAY_DISPATCH_CAP"]) {
    if (env[k] == null) delete process.env[k];
    else process.env[k] = env[k];
  }
});

const query = { marketplace: "EBAY_US" as const, q: "One Piece OP01-120 Shanks", filter: "buyingOptions:{FIXED_PRICE},deliveryCountry:US", limit: 100 };

test("off unless BOTH credentials are set; off means no fetch at all", async () => {
  delete process.env.EBAY_CLIENT_SECRET;
  assert.equal(isEbayEnabled(), false);
  process.env.EBAY_CLIENT_SECRET = "x";
  delete process.env.EBAY_CLIENT_ID;
  assert.equal(isEbayEnabled(), false);
  assert.equal(await getToken(), null);
  assert.equal((await searchBrowse(query)).status, "failed"); // no token when off
  assert.equal(calls.length, 0);
});

test("un-primed callers get nothing: spend() refuses before primeEbayBudget", async () => {
  assert.equal((await searchBrowse(query)).status, "budget");
  assert.equal(calls.filter((c) => c.url.includes("/item_summary/search")).length, 0);
  assert.equal(spend(), false);
  assert.equal(isEbayRateLimited(), true);
});

test("prime: live count → budget; the dispatch cap lowers it; spend stops at it", async () => {
  process.env.EBAY_DISPATCH_CAP = "2";
  const logs: string[] = [];
  const p = await primeEbayBudget((m) => logs.push(m));
  assert.equal(p.remaining, 5000);
  assert.equal(p.dailyLimit, 5000);
  assert.equal(p.budget, 2);
  assert.match(logs.join("\n"), /eBay quota: 5000\/5000 remaining → budget 2 \(cap 2200, reserve 600\)/);
  assert.doesNotMatch(logs.join("\n"), /tok-test|test-cert-id|test-app-id/);
  assert.equal((await searchBrowse(query)).status, "ok");
  assert.equal((await searchBrowse(query)).status, "ok");
  assert.equal((await searchBrowse(query)).status, "budget");
  assert.equal(ebaySpentThisRun(), 2);
  assert.equal(calls.filter((c) => c.url.includes("/item_summary/search")).length, 2);
  const s = calls.find((c) => c.url.includes("/item_summary/search"))!;
  const h = s.init.headers as Record<string, string>;
  assert.equal(h["X-EBAY-C-MARKETPLACE-ID"], "EBAY_US");
  assert.equal(h["X-EBAY-C-ENDUSERCTX"], "affiliateCampaignId=5339155912");
  assert.ok(s.init.signal, "timeout signal");
  assert.match(s.url, /sort=price/);
});

test("prime: unknown live count → the cap; an empty variable is unset, not 0", async () => {
  remaining = null;
  process.env.EBAY_QUOTA_RESERVE = "";
  process.env.EBAY_MAX_CALLS = "";
  const p = await primeEbayBudget();
  assert.equal(p.remaining, null);
  assert.equal(p.budget, 2200);
  assert.equal(p.reserve, 600);
});

test("prime: unknown live count → bounded by our own last-24h spend", async () => {
  remaining = null;
  const logs: string[] = [];
  const p = await primeEbayBudget((m) => logs.push(m), { ourSpend24h: 3000 });
  assert.equal(p.budget, 1400); // 5000 − 600 − 3000
  assert.match(logs.join("\n"), /unknown \(assumed 5000 a day, 3000 spent by us in 24h\)/);
  const none = await primeEbayBudget(() => {}, { ourSpend24h: 4400 });
  assert.equal(none.budget, 0);
  assert.equal(isEbayRateLimited(), true);
});

test("prime: a negative reserve is 0 and an oversized cap is lowered to half the spendable day", async () => {
  remaining = 1000;
  process.env.EBAY_QUOTA_RESERVE = "-1000";
  assert.equal((await primeEbayBudget()).budget, 1000); // never above what eBay says is left
  remaining = 5000;
  process.env.EBAY_QUOTA_RESERVE = "";
  process.env.EBAY_MAX_CALLS = "4400";
  const logs: string[] = [];
  const p = await primeEbayBudget((m) => logs.push(m));
  assert.equal(p.cap, 2200);
  assert.equal(p.budget, 2200);
  assert.match(logs.join("\n"), /EBAY_MAX_CALLS=4400 is more than half the spendable day/);
});

test("capEbayBudget only lowers what is left (the foreign-spend guard)", async () => {
  await primeEbayBudget();
  assert.equal(capEbayBudget(50), 50);
  assert.equal(capEbayBudget(500), 50);
  for (let i = 0; i < 50; i++) assert.equal(spend(), true);
  assert.equal(spend(), false);
  assert.equal(ebaySpentThisRun(), 50);
});

test("prime: below the reserve → 0 calls and the latch", async () => {
  remaining = 550;
  const p = await primeEbayBudget();
  assert.equal(p.budget, 0);
  assert.equal(isEbayRateLimited(), true);
});

test("a refused token: budget 0, tokenRefused, no Browse call", async () => {
  tokenStatus = 401;
  const p = await primeEbayBudget();
  assert.equal(p.tokenRefused, true);
  assert.equal(p.budget, 0);
  assert.equal(calls.filter((c) => !c.url.includes("oauth2")).length, 0);
});

test("a 429 latches the run", async () => {
  await primeEbayBudget();
  searchStatus = [429];
  assert.equal((await searchBrowse(query)).status, "rate-limited");
  assert.equal(isEbayRateLimited(), true);
  assert.equal((await searchBrowse(query)).status, "rate-limited");
  assert.equal(calls.filter((c) => c.url.includes("/item_summary/search")).length, 1);
});

test("a 5xx fails the pair but still counts the call", async () => {
  await primeEbayBudget();
  searchStatus = [503];
  assert.deepEqual(await searchBrowse(query), { status: "failed", http: 503 });
  assert.equal(ebaySpentThisRun(), 1);
  assert.equal(isEbayRateLimited(), false);
});

test("parseRateLimits reads buy.browse rates[0]", () => {
  assert.deepEqual(parseRateLimits({ rateLimits: [{ resources: [{ name: "buy.browse", rates: [{ remaining: 4321, limit: 5000, reset: "r" }] }] }] }), { remaining: 4321, limit: 5000, reset: "r" });
  assert.equal(parseRateLimits({ rateLimits: [{ resources: [{ name: "buy.browse.item", rates: [{ remaining: 1 }] }] }] }), null);
  assert.equal(parseRateLimits({}), null);
});

// ── The per-pair write rule ──────────────────────────────────────────────────
test("completed + match → upsert; completed + none → delete; anything else → keep, EbayCheck untouched", () => {
  assert.deepEqual(pairWrite({ status: "ok", matched: true }), { offer: "upsert", check: "matched" });
  assert.deepEqual(pairWrite({ status: "ok", matched: false }), { offer: "delete", check: "unmatched" });
  for (const status of ["failed", "rate-limited", "budget"] as const) assert.deepEqual(pairWrite({ status }), { offer: "keep", check: "keep" });
});

test("a 429 on the retry means the pair is NOT completed", () => {
  assert.equal(combineQueries("ok", "rate-limited"), "rate-limited");
  assert.equal(combineQueries("ok", "budget"), "budget");
  assert.equal(combineQueries("ok", null), "ok");
  assert.equal(combineQueries("ok", "ok"), "ok");
  assert.equal(combineQueries("failed", null), "failed");
});

test("foreign-spend warning: someone else's use of this keyset, never our own", async () => {
  const { foreignSpend } = await import("../src/lib/ebay-import");
  assert.equal(foreignSpend(null, 5000, 0), false); // unknown count: skipped
  assert.equal(foreignSpend(2800, 5000, 2200), false); // our own run
  assert.equal(foreignSpend(2800, 5000, 1800), true); // 400 unexplained
  assert.equal(foreignSpend(9000, 10000, 700), false); // a Growth Check limit, not 5,000
});
