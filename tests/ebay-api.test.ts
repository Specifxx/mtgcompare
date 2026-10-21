import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  buildSearchUrl,
  createTokenManager,
  credentials,
  EbayError,
  isReference,
  keysPresent,
  searchFilter,
  searchHeaders,
  searchOnce,
  tokenMargin,
  type EbayEnv,
} from "../src/lib/ebay-api";
import { budgetDay } from "../src/lib/ebay-store";
import { CLIENT_ID, harness, json, KEYS, NOW, okToken, SECRET, summary, type Handler } from "./helpers/ebay-fakes";

test("credentials: DEXCOMPARE_EBAY_* wins when set, else the owner's EBAY_CLIENT_ID / EBAY_CLIENT_SECRET; empty counts as unset", () => {
  assert.deepEqual(credentials({ EBAY_CLIENT_ID: " a ", EBAY_CLIENT_SECRET: "b" }), { id: "a", secret: "b" });
  assert.deepEqual(credentials({ EBAY_CLIENT_ID: "a", EBAY_CLIENT_SECRET: "b", DEXCOMPARE_EBAY_CLIENT_ID: "x", DEXCOMPARE_EBAY_CLIENT_SECRET: "y" }), { id: "x", secret: "y" });
  assert.deepEqual(credentials({ EBAY_CLIENT_ID: "a", EBAY_CLIENT_SECRET: "b", DEXCOMPARE_EBAY_CLIENT_ID: "", DEXCOMPARE_EBAY_CLIENT_SECRET: "  " }), { id: "a", secret: "b" });
  assert.ok(keysPresent(KEYS));
  assert.ok(!keysPresent({}));
  assert.ok(!keysPresent({ EBAY_CLIENT_ID: "a" }));
  assert.ok(!keysPresent({ EBAY_CLIENT_ID: "a", EBAY_CLIENT_SECRET: " " }));
});

test("token: one request however many callers, cached, refreshed early, Basic auth, correct body", async () => {
  const h = harness((_u, _i, n) => okToken(n));
  const tm = createTokenManager(h.deps);
  const got = await Promise.all(Array.from({ length: 25 }, () => tm.get()));
  assert.equal(new Set(got).size, 1);
  assert.equal(h.tokens().length, 1);
  const init = h.tokens()[0].init!;
  assert.equal(init.method, "POST");
  const hd = init.headers as Record<string, string>;
  assert.equal(hd.Authorization, "Basic " + Buffer.from(`${CLIENT_ID}:${SECRET}`).toString("base64"));
  assert.equal(hd["Content-Type"], "application/x-www-form-urlencoded");
  const body = new URLSearchParams(init.body as string);
  assert.equal(body.get("grant_type"), "client_credentials");
  assert.equal(body.get("scope"), "https://api.ebay.com/oauth/api_scope");
  assert.equal(h.tokens()[0].url, "https://api.ebay.com/identity/v1/oauth2/token");
  await tm.get();
  assert.equal(h.tokens().length, 1, "cached");
  h.clock.t += 7200_000 - 4 * 60_000;
  await tm.get();
  assert.equal(h.tokens().length, 2, "refreshed before it expires");
  assert.equal(tokenMargin(7200), 300_000);
  assert.equal(tokenMargin(100), 10_000);
});

test("token: DEXCOMPARE_EBAY_* override is what is sent", async () => {
  const h = harness((_u, _i, n) => okToken(n), { ...KEYS, DEXCOMPARE_EBAY_CLIENT_ID: "OVERRIDE-ID", DEXCOMPARE_EBAY_CLIENT_SECRET: "OVERRIDE-SECRET" });
  await createTokenManager(h.deps).get();
  assert.equal((h.tokens()[0].init!.headers as Record<string, string>).Authorization, "Basic " + Buffer.from("OVERRIDE-ID:OVERRIDE-SECRET").toString("base64"));
});

test("token: refresh(bad) is single-flight and reuses a token already replaced", async () => {
  const h = harness((_u, _i, n) => okToken(n));
  const tm = createTokenManager(h.deps);
  const first = await tm.get();
  const r = await Promise.all([tm.refresh(first), tm.refresh(first), tm.refresh(first)]);
  assert.equal(h.tokens().length, 2);
  assert.equal(new Set(r).size, 1);
  assert.notEqual(r[0], first);
  assert.equal(await tm.refresh(first), r[0]);
  assert.equal(h.tokens().length, 2);
});

test("token: no secret, id or credential in any thrown error; a token failure reports eBay's OAuth category only", async () => {
  const cases: Handler[] = [
    () => json({ error: "invalid_client", error_description: `bad ${SECRET} ${CLIENT_ID}` }, 401),
    () => new Response(`<html>${SECRET}`, { status: 200 }),
    () => json({ access_token: 5 }),
    () => json({}, 200),
    () => {
      throw new Error(`network ${SECRET} ${CLIENT_ID} ${Buffer.from(`${CLIENT_ID}:${SECRET}`).toString("base64")}`);
    },
    () => json({ error: SECRET }, 500),
  ];
  for (const c of cases) {
    const h = harness(c);
    const tm = createTokenManager(h.deps);
    await assert.rejects(tm.get(), (e: unknown) => {
      assert.ok(e instanceof EbayError);
      const dump = String((e as Error).message) + JSON.stringify(e) + String(e) + (e as EbayError).describe();
      for (const bad of [SECRET, CLIENT_ID, Buffer.from(`${CLIENT_ID}:${SECRET}`).toString("base64")]) assert.ok(!dump.includes(bad), `leaked ${bad}`);
      return true;
    });
    await assert.rejects(tm.get(), EbayError);
  }
  const none = harness(() => okToken(), {});
  await assert.rejects(createTokenManager(none.deps).get(), (e: unknown) => (e as EbayError).code === "no-keys");
  assert.equal(none.calls.length, 0);

  const known = harness(() => new Response(JSON.stringify({ error: "invalid_client", error_description: "client authentication failed: secret-ish text" }), { status: 401 }));
  await assert.rejects(createTokenManager(known.deps).get(), (e: unknown) => {
    assert.equal((e as EbayError).describe(), "token-http-401:invalid_client");
    assert.ok(!JSON.stringify(e).includes("secret-ish"));
    return true;
  });
  const odd = harness(() => new Response(JSON.stringify({ error: "<script>alert(1)</script>" }), { status: 400 }));
  await assert.rejects(createTokenManager(odd.deps).get(), (e: unknown) => (e as EbayError).describe() === "token-http-400");
});

test("search request: filter, marketplace and affiliate headers per marketplace; price floor syntax; q cut at 100", () => {
  assert.equal(searchFilter("EBAY_AU", 75), "buyingOptions:{FIXED_PRICE},price:[75..],priceCurrency:AUD,deliveryCountry:AU");
  assert.equal(searchFilter("EBAY_DE", 45.7), "buyingOptions:{FIXED_PRICE},price:[45..],priceCurrency:EUR,deliveryCountry:DE");
  assert.equal(searchFilter("EBAY_GB", null), "buyingOptions:{FIXED_PRICE},deliveryCountry:GB", "no price filter: no priceCurrency either");
  const u = new URL(buildSearchUrl({ q: "x".repeat(150), marketplace: "EBAY_US", limit: 999, minPrice: 25 }));
  assert.equal(u.origin + u.pathname, "https://api.ebay.com/buy/browse/v1/item_summary/search");
  assert.equal(u.searchParams.get("q")!.length, 100);
  assert.equal(u.searchParams.get("limit"), "200");
  assert.equal(new URL(buildSearchUrl({ q: "a", marketplace: "EBAY_US", limit: 0, minPrice: null })).searchParams.get("limit"), "1");
  const hd = searchHeaders("tok", "EBAY_CA");
  assert.equal(hd["X-EBAY-C-MARKETPLACE-ID"], "EBAY_CA");
  assert.equal(hd["Accept-Language"], "en-CA");
  assert.match(hd["X-EBAY-C-ENDUSERCTX"], /affiliateCampaignId=5339155912,affiliateReferenceId=dex-check$/, "a search with no feed says so");
  // the importer asks eBay for a per-feed sub-id: eBay copies it into the URL's customid, EPN reports by it
  assert.match(searchHeaders("tok", "EBAY_AU", "dex-au-item")["X-EBAY-C-ENDUSERCTX"], /affiliateReferenceId=dex-au-item$/);
  assert.match(searchHeaders("tok", "EBAY_US", "dex-us-chase")["X-EBAY-C-ENDUSERCTX"], /affiliateReferenceId=dex-us-chase$/);
  for (const bad of ["", "DEX-US", "dex us", "dex-us,campid=1", "x".repeat(61), "a=b", "dex-us-chase\r\nX-Evil: 1"])
    assert.match(searchHeaders("tok", "EBAY_US", bad)["X-EBAY-C-ENDUSERCTX"], /affiliateReferenceId=dex-check$/, `unsafe reference ${JSON.stringify(bad)} is not sent`);
  assert.ok(isReference("dex-us-chase") && isReference("dex-eu-sealed") && !isReference("Dex-US"));
  assert.equal(hd.Authorization, "Bearer tok");
  assert.equal(searchHeaders("t", "EBAY_US")["Accept-Language"], "en-US");
});

test("searchOnce: the raw itemSummaries (at most 50); a 401 refreshes the token once and repeats; a second 401 fails", async () => {
  let n = 0;
  const h = harness((url) => {
    if (url.includes("/oauth2/token")) return okToken(++n);
    return json({ itemSummaries: Array.from({ length: 80 }, (_, i) => summary(String(i), "x", 50)) });
  });
  const tm = createTokenManager(h.deps);
  const out = await searchOnce(h.deps, tm, { q: "pokemon", marketplace: "EBAY_US", limit: 50, minPrice: null });
  assert.equal(out.length, 50);
  assert.equal((h.searches()[0].init!.headers as Record<string, string>).Authorization.startsWith("Bearer tok-1-"), true);

  let calls = 0;
  const h401 = harness((url) => {
    if (url.includes("/oauth2/token")) return okToken(++calls);
    const bearer = (h401.searches().at(-1)!.init!.headers as Record<string, string>).Authorization;
    return bearer.includes("tok-1-") ? json({ errors: [{ errorId: 1001 }] }, 401) : json({ itemSummaries: [summary("1", "x", 5)] });
  });
  const reserved: string[] = [];
  const tm2 = createTokenManager(h401.deps);
  const got = await searchOnce(h401.deps, tm2, { q: "p", marketplace: "EBAY_US", limit: 5, minPrice: null }, async () => (reserved.push("retry"), true));
  assert.equal(got.length, 1);
  assert.equal(h401.searches().length, 2);
  assert.deepEqual(reserved, ["retry"], "the repeat is a second call and is reserved");

  const always = harness((url) => (url.includes("/oauth2/token") ? okToken() : json({}, 401)));
  await assert.rejects(searchOnce(always.deps, createTokenManager(always.deps), { q: "p", marketplace: "EBAY_US", limit: 5, minPrice: null }), (e: unknown) => (e as EbayError).code === "search-http-401");
  // refused repeat (the daily cap): the 401 stands
  await assert.rejects(searchOnce(always.deps, createTokenManager(always.deps), { q: "p", marketplace: "EBAY_US", limit: 5, minPrice: null }, async () => false), EbayError);
});

test("searchOnce: errors are codes — 429 carries Retry-After, 5xx, network, malformed JSON — never eBay's text", async () => {
  const run = (handler: Handler) => {
    const h = harness((url, i, n) => (url.includes("/oauth2/token") ? okToken() : handler(url, i, n)));
    return searchOnce(h.deps, createTokenManager(h.deps), { q: "p", marketplace: "EBAY_US", limit: 5, minPrice: null });
  };
  await assert.rejects(run(() => json({ errors: [{ message: SECRET }] }, 429, { "retry-after": "90" })), (e: unknown) => (e as EbayError).status === 429 && (e as EbayError).retryAfterMs === 90_000 && !JSON.stringify(e).includes(SECRET));
  await assert.rejects(run(() => json({}, 503)), (e: unknown) => (e as EbayError).code === "search-http-503");
  await assert.rejects(run(() => { throw new Error(SECRET); }), (e: unknown) => (e as EbayError).code === "search-network" && !String(e).includes(SECRET));
  await assert.rejects(run(() => new Response("<html>", { status: 200 })), (e: unknown) => (e as EbayError).code === "search-malformed");
  assert.deepEqual(await run(() => json({ total: 0 })), []);
  assert.deepEqual(await run(() => json({ itemSummaries: "x" })), []);
  // HTTP 200 that is not an object, or no listings AND a warning from eBay: a search that did not work (the circuit breaker counts it)
  for (const body of [[], "x", 5, null]) await assert.rejects(run(() => json(body)), (e: unknown) => (e as EbayError).code === "search-malformed", JSON.stringify(body));
  await assert.rejects(run(() => json({ total: 0, warnings: [{ errorId: 12006, message: SECRET }] })), (e: unknown) => (e as EbayError).code === "search-warning" && !JSON.stringify(e).includes(SECRET) && !String(e).includes(SECRET));
  assert.equal((await run(() => json({ itemSummaries: [summary("1", "x", 5)], warnings: [{ errorId: 1 }] }))).length, 1, "listings with a warning are still listings");
  assert.deepEqual(await run(() => json({ total: 0, warnings: [] })), [], "an empty warnings list is no warning");
});

// ─── structure: where the credentials may live ──────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}
const SRC = new URL("../src", import.meta.url).pathname;
const NOCOMMENT = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
const IMPORTS = (name: string) => new RegExp(`(?:from\\s+|import\\s*\\(\\s*|require\\s*\\(\\s*)["'][^"']*${name}["']`);

test("the credentials live in ONE module and nothing the website serves can import it", () => {
  for (const f of walk(SRC)) {
    const text = readFileSync(f, "utf8");
    const code = NOCOMMENT(text);
    // one file reads the credentials, and never as NEXT_PUBLIC_*
    if (!f.endsWith("lib/ebay-api.ts")) assert.ok(!/EBAY_CLIENT_(ID|SECRET)/.test(code), `${f} reads the credentials`);
    assert.ok(!/NEXT_PUBLIC_(DEXCOMPARE_)?EBAY_CLIENT/.test(text), f);
    // nothing under src/app or src/components, and no client module, imports the importer's modules
    const web = /\/src\/(app|components)\//.test(f) || /^\s*["']use client["']/m.test(text.split("\n").slice(0, 3).join("\n"));
    if (web) for (const m of ["ebay-api", "ebay-import", "ebay-normalise", "ebay-store", "ebay-report"]) assert.ok(!IMPORTS(m).test(code), `${f} imports ${m}`);
  }
  // the route's own chain (route → ebay-route → ebay-read → ebay-context[-parse]) never touches them either
  for (const f of ["lib/ebay-route.ts", "lib/ebay-read.ts", "lib/ebay-context.ts", "lib/ebay-context-parse.ts", "lib/ebay-ads.ts", "lib/ebay-eligibility.ts", "lib/affiliate.ts"]) {
    const code = NOCOMMENT(readFileSync(join(SRC, f), "utf8"));
    for (const m of ["ebay-api", "ebay-import", "ebay-normalise", "ebay-report"]) assert.ok(!IMPORTS(m).test(code), `${f} imports ${m}`);
    assert.ok(!/process\.env\.EBAY_CLIENT|EBAY_CLIENT_/.test(code), f);
  }
});

test("ebay-api.ts talks to api.ebay.com only: there is no host override", () => {
  const code = NOCOMMENT(readFileSync(join(SRC, "lib/ebay-api.ts"), "utf8"));
  assert.ok(!/EBAY_API_BASE|process\.env\.[A-Z_]*(HOST|BASE|URL)/.test(code));
  const hosts = new Set([...code.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]));
  assert.deepEqual([...hosts].sort(), ["api.ebay.com"]);
  assert.ok(/cache:\s*"no-store"/.test(code));
});

test("the importer's secrets reach only the import step of the workflow", () => {
  const wf = readFileSync(new URL("../../../.github/workflows/dexcompare-ebay-import.yml", import.meta.url), "utf8");
  assert.ok(/secrets\.EBAY_CLIENT_ID/.test(wf) && /secrets\.EBAY_CLIENT_SECRET/.test(wf), "the owner's secret names");
  const steps = wf.split(/\n      - /);
  for (const s of steps) {
    const mentions = /secrets\.(DEXCOMPARE_)?EBAY_CLIENT/.test(s);
    const isImport = /name: Import\n/.test(s);
    const isCheck = /name: Check the secrets/.test(s);
    if (mentions) assert.ok(isImport || isCheck, `a step other than the import reads the eBay secrets:\n${s.slice(0, 80)}`);
    // the check step only learns WHETHER a secret is set (a boolean), never its value
    if (isCheck) for (const m of s.matchAll(/\$\{\{([^}]*)\}\}/g)) if (/EBAY_CLIENT/.test(m[1])) assert.ok(/!= ''/.test(m[1]) && !/\bENV\b/.test(m[1]), `the check step must only test presence: ${m[1]}`);
  }
  assert.ok(/concurrency:\s*\n\s*group: dexcompare-ebay-import\s*\n\s*cancel-in-progress: false/.test(wf));
  assert.ok(/timeout-minutes: 90/.test(wf), "a bounded job (90 minutes: the sweep pages up to 1,800 calls on top of the fixed feeds)");
  // write, for one thing only: the public data snapshot it commits to main after the import (scripts/publish-public-data.sh).
  assert.ok(/\npermissions:\s*\n\s*contents: write/.test(wf), "the token can publish the data snapshot");
  assert.ok(/name: Publish it to main\n[\s\S]*publish-public-data\.sh/.test(wf), "and the publish step is what uses it");
  // the daily slot is the FIRST one after eBay's counter resets in BOTH seasons (midnight Pacific = 07:00 UTC in summer, 08:00 in winter):
  // 08:37 UTC is 01:37 PDT / 00:37 PST, so the scheduled run is always the first of its budget day and a manual "run now" earlier in the
  // Pacific day can never starve it (review F2 / SEC-1)
  const cron = /cron: "(\d+) (\d+) \* \* \*"/.exec(wf);
  assert.ok(cron, "one daily cron");
  assert.equal(`${cron![1]} ${cron![2]}`, "37 8", "37 8 * * *");
  for (const [season, date, startsAtUtc] of [["summer (PDT)", "2026-07-15", "07:00"], ["winter (PST)", "2026-01-15", "08:00"], ["the week before the autumn change", "2026-10-30", "07:00"], ["the week after it", "2026-11-02", "08:00"]] as const) {
    const run = Date.parse(`${date}T08:37:00Z`);
    assert.equal(budgetDay(run), date, `${season}: the 08:37 UTC run belongs to the day that has just begun`);
    assert.equal(budgetDay(Date.parse(`${date}T${startsAtUtc}:00Z`)), date, `${season}: the day begins at ${startsAtUtc} UTC`);
    assert.notEqual(budgetDay(Date.parse(`${date}T${startsAtUtc}:00Z`) - 1000), date, `${season}: one second earlier is the previous day`);
    assert.notEqual(budgetDay(run - 24 * 3600_000), date, `${season}: yesterday's run (and any manual run during the previous 24 h) is another day`);
    assert.ok(run - Date.parse(`${date}T${startsAtUtc}:00Z`) <= 97 * 60_000, `${season}: within ~97 minutes of the reset (GitHub's delay still lands in the same day)`);
  }
  assert.ok(/--only "\$ONLY"|args\+=\(--only "\$ONLY"\)/.test(wf) && /"\$\{args\[@\]\}"/.test(wf), "dispatch inputs are passed quoted");
  assert.ok(/force:/.test(wf) && /NEXT_PUBLIC_EBAY_CAMPAIGN_ID/.test(wf));
  assert.ok(/workflow_dispatch/.test(wf) && /dry_run/.test(wf) && /only:/.test(wf));
  assert.ok(/prisma db push --skip-generate && npx prisma generate/.test(wf) && !/accept-data-loss/.test(wf.replace(/#.*$/gm, "")));
});
void NOW;
void ({} as EbayEnv);

test("the store import's purge reads the same age bound as the eBay import (review F4)", () => {
  const wf = readFileSync(new URL("../../../.github/workflows/dexcompare-sealed-import.yml", import.meta.url), "utf8");
  assert.match(wf, /EBAY_LISTING_MAX_AGE_HOURS: \$\{\{ vars\.EBAY_LISTING_MAX_AGE_HOURS \}\}/);
  assert.ok(!/EBAY_CLIENT/.test(wf), "the store import never holds the eBay keys");
});
