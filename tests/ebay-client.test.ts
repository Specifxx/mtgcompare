// The eBay client (src/lib/ebay.ts): metering, the latch, the ledger gate, the off switch. Network is a mocked fetch with Browse-shaped JSON; no real eBay host is ever reached and no real
// credential is used. (The budget arithmetic is tests/ebay-rift-priority.test.ts; the whole pass is tests/ebay-pass.test.ts.)
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MTG_SINGLES_CATEGORY, ebaySpentThisRun, fetchRemaining, getToken, isEbayEnabled, isEbayRateLimited, latchEbay, openEbayClient, parseRateLimits, resetEbayClientForTests, searchBrowse, setCallGate,
  setEbayBudget, spend, trustedQuota, capEbayBudget, ebaySpendableLeft,
} from "../src/lib/ebay";

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
  assert.match(before, /if \(gate && !\(await gate\(\)\)\) return/, "the ledger gate is asked before the fetch");
  assert.match(before, /if \(!spend\(\)\) return/, "spend() before the Browse fetch");
  assert.ok(before.indexOf("gate()") < before.indexOf("spend()"), "the ledger is asked first");
  assert.match(SRC, /res\.status === 429\) \{\s*rateLimited = true;/);
  assert.match(SRC, /let spendable = 0;/);
  assert.doesNotMatch(SRC, /spendable = Infinity/);
});

test("no log line can carry the token, the secret or the Basic header", () => {
  for (const f of ["src/lib/ebay.ts", "src/lib/ebay-import.ts", "src/lib/ebay-ledger.ts", "scripts/ebay.ts"]) {
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
let searchStatus: (number | [number, string])[] = [];
const realFetch = globalThis.fetch;
const env = { ...process.env };
const searches = () => calls.filter((c) => c.url.includes("/item_summary/search"));

function mock(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/identity/v1/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "tok-test", expires_in: 7200, token_type: "Application Access Token" }), { status: tokenStatus });
    }
    if (url.includes("/developer/analytics/")) {
      if (remaining == null) return new Response("{}", { status: 500 });
      return new Response(JSON.stringify({ rateLimits: [{ apiContext: "buy", apiName: "Browse", resources: [{ name: "buy.browse", rates: [{ count: 5000 - remaining, limit: 5000, remaining, reset: "2026-10-09T07:00:00.000Z", timeWindow: 86400 }] }] }] }), { status: 200 });
    }
    const st = searchStatus.shift() ?? 200;
    if (Array.isArray(st)) return new Response(st[1], { status: st[0] });
    if (st !== 200) return new Response("{}", { status: st });
    return new Response(JSON.stringify({ href: url, total: 1, limit: 200, offset: 0, itemSummaries: [{ itemId: ["v1", "305123456789", "0"].join("|"), title: "The One Ring LTR 246", price: { value: "119.99", currency: "USD" }, buyingOptions: ["FIXED_PRICE"], itemLocation: { country: "US" } }] }), { status: 200 });
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
  delete process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID;
  mock();
});
after(() => {
  globalThis.fetch = realFetch;
  for (const k of ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "NEXT_PUBLIC_EBAY_CAMPAIGN_ID"]) {
    if (env[k] == null) delete process.env[k];
    else process.env[k] = env[k];
  }
});

const query = { marketplace: "EBAY_US" as const, q: "The One Ring", filter: "buyingOptions:{FIXED_PRICE},deliveryCountry:US", limit: 200 };

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

test("un-primed callers get nothing: spend() refuses before the run has an allowance", async () => {
  assert.equal((await searchBrowse(query)).status, "budget");
  assert.equal(searches().length, 0);
  assert.equal(spend(), false);
  assert.equal(isEbayRateLimited(), true);
});

test("an allowance of N lets exactly N calls through, then the latch", async () => {
  assert.equal(setEbayBudget(3), 3);
  for (let i = 0; i < 3; i++) assert.equal((await searchBrowse(query)).status, "ok");
  assert.equal(ebaySpentThisRun(), 3);
  assert.equal((await searchBrowse(query)).status, "budget", "the fourth call is refused before any request");
  assert.equal(isEbayRateLimited(), true, "and the run is latched");
  assert.equal((await searchBrowse(query)).status, "rate-limited");
  assert.equal(searches().length, 3);
  assert.equal(setEbayBudget(0), 0);
  assert.equal(isEbayRateLimited(), true, "a zero allowance latches the run");
});

test("capEbayBudget only lowers what is left (the reserve guard)", () => {
  setEbayBudget(100);
  assert.equal(capEbayBudget(500), 100);
  assert.equal(capEbayBudget(40), 40);
  assert.equal(ebaySpendableLeft(), 40);
  assert.equal(capEbayBudget(0), 0);
  assert.equal(isEbayRateLimited(), true);
});

test("the ledger gate is asked before every call: a refusal sends nothing and spends nothing", async () => {
  setEbayBudget(10);
  let asked = 0;
  setCallGate(async () => ++asked <= 2);
  assert.equal((await searchBrowse(query)).status, "ok");
  assert.equal((await searchBrowse(query)).status, "ok");
  assert.equal((await searchBrowse(query)).status, "budget");
  assert.equal(searches().length, 2);
  assert.equal(ebaySpentThisRun(), 2, "the refused call was not counted");
  setCallGate(null);
});

test("a refused token: tokenRefused, a latched run, no Browse call", async () => {
  tokenStatus = 401;
  const logs: string[] = [];
  const r = await openEbayClient((m) => logs.push(m));
  assert.equal(r.tokenRefused, true);
  assert.equal(setEbayBudget(50) > 0, true);
  assert.equal(await getToken(), null);
  assert.equal(searches().length, 0);
  assert.ok(logs.every((l) => !/test-(app|cert)-id/.test(l)));
});

test("a 429 latches the run; error 2001 in a 403 body is a 429 too; nothing is retried", async () => {
  setEbayBudget(10);
  searchStatus = [429];
  assert.equal((await searchBrowse(query)).status, "rate-limited");
  assert.equal(isEbayRateLimited(), true);
  assert.equal((await searchBrowse(query)).status, "rate-limited");
  assert.equal(searches().length, 1, "no second request after the latch");
  resetEbayClientForTests();
  setEbayBudget(10);
  searchStatus = [[403, JSON.stringify({ errors: [{ errorId: 2001, message: "The call limit has been reached" }] })]];
  assert.equal((await searchBrowse(query)).status, "rate-limited");
  assert.equal(isEbayRateLimited(), true);
});

test("a 5xx fails the pair but still counts the call; the run is not latched", async () => {
  setEbayBudget(10);
  searchStatus = [503];
  const r = await searchBrowse(query);
  assert.deepEqual(r, { status: "failed", http: 503 });
  assert.equal(ebaySpentThisRun(), 1);
  assert.equal(isEbayRateLimited(), false);
});

test("the search request: category on request, the sort, the limit, the marketplace and the end-user context", async () => {
  process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID = "1234567890";
  setEbayBudget(5);
  await searchBrowse({ ...query, marketplace: "EBAY_GB", category: MTG_SINGLES_CATEGORY });
  const c = searches()[0]!;
  const u = new URL(c.url);
  assert.equal(u.searchParams.get("category_ids"), "183454");
  assert.equal(u.searchParams.get("sort"), "price");
  assert.equal(u.searchParams.get("limit"), "200");
  const h = c.init.headers as Record<string, string>;
  assert.equal(h["X-EBAY-C-MARKETPLACE-ID"], "EBAY_GB");
  assert.equal(h["X-EBAY-C-ENDUSERCTX"], "affiliateCampaignId=1234567890,contextualLocation=country%3DGB");
  await searchBrowse(query);
  assert.equal(new URL(searches()[1]!.url).searchParams.get("category_ids"), null);
  delete process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID;
  await searchBrowse(query);
  assert.equal((searches()[2]!.init.headers as Record<string, string>)["X-EBAY-C-ENDUSERCTX"], "contextualLocation=country%3DUS", "no campaign configured: no campaign sent");
});

test("the live quota: buy.browse rates[0] with its limit, reset and window; a reading is trusted only when every field is sane", async () => {
  const q = await fetchRemaining();
  assert.deepEqual(q, { remaining: 5000, limit: 5000, reset: "2026-10-09T07:00:00.000Z", timeWindowSec: 86400 });
  const t = trustedQuota(q)!;
  assert.equal(t.reset.toISOString(), "2026-10-09T07:00:00.000Z");
  assert.equal(trustedQuota({ remaining: 10, limit: null, reset: "2026-10-09T07:00:00.000Z", timeWindowSec: null }), null);
  assert.equal(trustedQuota({ remaining: 10, limit: 5000, reset: "not a date", timeWindowSec: 86400 }), null);
  assert.equal(trustedQuota({ remaining: 10, limit: 5000, reset: null, timeWindowSec: 86400 }), null);
  assert.equal(trustedQuota(null), null);
  assert.equal(trustedQuota({ remaining: 10, limit: 5000, reset: "2026-10-09T07:00:00.000Z", timeWindowSec: null })!.timeWindowSec, 86_400);
  remaining = null;
  assert.equal(await fetchRemaining(), null, "an error reads as unknown");
});
test("parseRateLimits reads buy.browse rates[0] and nothing else", () => {
  const body = { rateLimits: [{ resources: [{ name: "buy.marketing", rates: [{ remaining: 1, limit: 2 }] }, { name: "buy.browse", rates: [{ remaining: 4321, limit: 5000, reset: "r", timeWindow: 86400 }] }] }] };
  assert.deepEqual(parseRateLimits(body), { remaining: 4321, limit: 5000, reset: "r", timeWindowSec: 86400 });
  assert.equal(parseRateLimits({ rateLimits: [{ resources: [{ name: "buy.browse", rates: [{}] }] }] }), null);
  assert.equal(parseRateLimits({}), null);
  assert.equal(parseRateLimits(null), null);
});

test("latchEbay stops a run from outside (the reserve guard)", async () => {
  setEbayBudget(10);
  latchEbay();
  assert.equal((await searchBrowse(query)).status, "rate-limited");
  assert.equal(searches().length, 0);
});
