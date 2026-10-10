// The public render path must not wake Neon (critique DP-03; spec 12.12): crawler gating and the sampled, batched view counter. Owner WP02.
import test from "node:test";
import assert from "node:assert/strict";
import { isLikelyBot, shouldTouchNeon } from "../src/lib/data/plane/crawler";
import { BEACON_DEFAULTS, CLICK_DEFAULTS, ClickBatcher, ViewBatcher } from "../src/lib/data/plane/view-beacon";

test("crawlers, link-preview bots, AI crawlers, HTTP libraries and an empty user agent are bots; browsers are not", () => {
  for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)", "Mozilla/5.0 (compatible; bingbot/2.0)", "facebookexternalhit/1.1", "Slackbot-LinkExpanding 1.0", "curl/8.4.0", "python-requests/2.31", "Go-http-client/2.0", "Mozilla/5.0 (compatible; AhrefsBot/7.0)", "Mozilla/5.0 (compatible; ClaudeBot/1.0)", "node-fetch/1.0", "", null, undefined]) assert.equal(isLikelyBot(ua), true, String(ua));
  for (const ua of ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0"]) { assert.equal(isLikelyBot(ua), false, ua); assert.equal(shouldTouchNeon(ua), true); }
});
test("the view counter samples 1 in 10, never counts a bot, caps its memory, flushes at most every 30 minutes, and drains scaled so totals stay unbiased", () => {
  let t = 0, seq = 0; const rnd = () => ((seq = (seq * 1103515245 + 12345) % 2147483648) / 2147483648); const b = new ViewBatcher(() => t, rnd);
  assert.equal(BEACON_DEFAULTS.sampleOneIn, 10); assert.equal(BEACON_DEFAULTS.flushMinutes, 30);
  assert.equal(b.record(5, "view", true), false, "a bot is never counted"); assert.equal(b.record(-1, "view", false), false); assert.equal(b.size, 0);
  let counted = 0; for (let i = 0; i < 10_000; i++) if (b.record(1 + (i % 50), "view", false)) counted++; assert.ok(counted > 800 && counted < 1200, `sampled ${counted} of 10000`);
  assert.equal(b.due(), false, "nothing is flushed before the first window"); t = 29 * 60_000; assert.equal(b.due(), false); t = 30 * 60_000 + 61_000; assert.equal(b.due(), false, "outside the one-minute window after :30 nothing is flushed, however long ago the last flush was"); t = 30 * 60_000 + 5_000; assert.equal(b.due(), true);
  const rows = b.drain(); const est = rows.reduce((a, r) => a + r.views, 0); assert.ok(est > 8000 && est < 12000, `the drained total estimates ${est} of 10000 views`); assert.equal(b.due(), false, "drain resets the timer"); assert.equal(b.size, 0);
  const small = new ViewBatcher(() => t, () => 0, { sampleOneIn: 1, flushMinutes: 30, maxEntries: 3, maxFlushRows: 2 });
  for (const id of [1, 2, 3, 4, 5]) small.record(id, "search", false); assert.equal(small.size, 3, "memory is bounded: further cards are dropped until the next drain"); assert.equal(small.drain().length, 2, "a flush writes at most maxFlushRows rows in one statement"); assert.equal(small.size, 1);
  assert.equal(new ViewBatcher(() => t, () => 0, { ...BEACON_DEFAULTS, sampleOneIn: 0 }).record(1, "view", false), false, "VIEW_BEACON_SAMPLE=0 switches the counter off");
});

test("ALIGNED flush: instances flush inside the same minute of each half hour, so the database wakes at most 48 times a day however many instances run", () => {
  const instances = Array.from({ length: 5 }, (_, i) => { let t = 0; const b = new ViewBatcher(() => t, () => 0, { ...BEACON_DEFAULTS, sampleOneIn: 1 }); return { b, at: (ms: number) => { t = ms; }, i }; });
  let wakes = 0, minutesAwake = 0; let lastWake = -1;
  for (let minute = 0; minute < 24 * 60; minute++) {
    const flushedNow = instances.filter(({ b, at, i }) => { at(minute * 60_000 + 3_000 + i * 1000); b.record(1 + i, "view", false); if (!b.due()) return false; b.drain(); return true; }).length;
    if (flushedNow > 0) { wakes++; if (lastWake < 0 || minute - lastWake > 5) minutesAwake += 5; lastWake = minute; }
  }
  assert.ok(wakes === 47 || wakes === 48, `5 instances, one burst per half hour: ${wakes} wakes in a day (47 on the first day: the period of construction counts as flushed)`); assert.ok(minutesAwake <= 48 * 5, `${minutesAwake} minutes of compute a day (the Free plan allows 800)`);
});

test("the outbound click log is buffered and flushed in the SAME aligned window as the view counter (10.32): never a bot, sampled, bounded, one insert per half hour", () => {
  let t = 0; const row = { retailer: "store:x", page: "card", slug: "sol-ring", country: "US", userId: null, entry: null };
  const b = new ClickBatcher(() => t, () => 0.5, { ...CLICK_DEFAULTS, sampleRate: 1 });
  assert.equal(b.record(row, true), false, "a bot never logs a click"); assert.equal(b.record(row, false), true); assert.equal(b.due(), false, "nothing before the first window");
  t = 30 * 60_000 + 5_000; assert.equal(b.due(), true, "inside the first minute after :30"); assert.equal(b.drain().length, 1); assert.equal(b.due(), false, "drain resets the timer");
  t = 30 * 60_000 + 61_000; b.record(row, false); assert.equal(b.due(), false, "outside the window nothing is written");
  assert.equal(new ClickBatcher(() => t, () => 0.5, { ...CLICK_DEFAULTS, sampleRate: 0 }).record(row, false), false, "CLICK_LOG=0 switches the log off");
  assert.equal(new ClickBatcher(() => t, () => 0.9, { ...CLICK_DEFAULTS, sampleRate: 0.5 }).record(row, false), false, "sampling drops a click when the draw is above the rate");
  const small = new ClickBatcher(() => t, () => 0, { ...CLICK_DEFAULTS, maxEntries: 2 }); for (let i = 0; i < 5; i++) small.record(row, false); assert.equal(small.size, 2, "memory is bounded");
  const v = new ViewBatcher(() => t, () => 0, { ...BEACON_DEFAULTS, sampleOneIn: 1 }), c = new ClickBatcher(() => t, () => 0); v.record(1, "view", false); c.record(row, false);
  let wakesA = 0; for (let m = 0; m < 24 * 60; m++) { t = m * 60_000 + 2_000; if (v.due() || c.due()) { wakesA++; v.drain(); c.drain(); } v.record(1, "view", false); c.record(row, false); }
  assert.ok(wakesA <= 48, `views and clicks share one aligned window: ${wakesA} wakes a day (at most 48)`);
});

// ══ with Neon unreachable the published-data loaders still answer (Annex C check 23); the three plane routes (warm, status, the Neon-tag purge) ═══════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { importsOf, resolveSpec } from "./helpers/import-graph";
import { realMiniTree, writePlaneDir } from "./helpers/data-source";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import { hotSet } from "../src/lib/data/plane/shards";

const ROOT = process.env.TEST_ROOT ?? path.resolve(__dirname, "..");
const READER = ["src/lib/data/core.ts", "src/lib/data/catalog.ts", "src/lib/data/history.ts", "src/lib/data/catalog-shim.ts", "src/lib/data/lite.ts", "src/lib/data/types.ts", "src/lib/offer-read.ts", "src/lib/price.ts", "src/lib/selectors.ts", ...fs.readdirSync(path.join(ROOT, "src/lib/data/plane")).filter((f) => f.endsWith(".ts")).map((f) => `src/lib/data/plane/${f}`)];
// DECISIONS.md 2026-10-09 (the plane moved into Neon by default): the reader's closure reaches the database client in exactly ONE place, src/lib/data/plane/neon-store.ts, and only through a LAZY `await import("../../db")` inside two functions (so a build, a
// PLANE_DIR run and a GitHub-backend run never load Prisma). Nothing else in the closure, and nothing under src/app, imports the client.
const NEON_STORE = "src/lib/data/plane/neon-store.ts";
test("the Neon read is confined to src/lib/data/plane/neon-store.ts, which imports the client only lazily; nothing else in the reader's import closure reaches @/lib/db or @prisma/client", () => {
  const seen = new Set<string>(), bad: string[] = [], stack = READER.map((f) => path.join(ROOT, f));
  while (stack.length) {
    const f = stack.pop()!; if (seen.has(f)) continue; seen.add(f);
    for (const e of importsOf(fs.readFileSync(f, "utf8"))) {
      if (e.typeOnly) continue;
      if (/^@prisma\/client|\/lib\/db$|^\.\.?\/db$|^(\.\.\/)+db$|^@\/lib\/db/.test(e.spec) || e.spec === "pg") { if (path.relative(ROOT, f).split(path.sep).join("/") === NEON_STORE && /^(\.\.\/)+db$/.test(e.spec)) continue; bad.push(`${path.relative(ROOT, f)} -> ${e.spec}`); }
      const r = resolveSpec(f, e.spec, ROOT); if (r && /\.tsx?$/.test(r)) stack.push(r);
    }
  }
  assert.deepEqual(bad, []); assert.ok(seen.size > 20, `walked ${seen.size} files`);
  const store = fs.readFileSync(path.join(ROOT, NEON_STORE), "utf8"); const lazy = [...store.matchAll(/^\s*import\s.*\sfrom\s*["'][^"']*\/db["']/gm)];
  assert.deepEqual(lazy, [], "neon-store.ts has no static import of the client"); assert.equal([...store.matchAll(/await import\("\.\.\/\.\.\/db"\)/g)].length, 2, "exactly two lazy imports: the reader's client and the writer's");
  for (const f of fs.readdirSync(path.join(ROOT, "src/lib/data/plane")).filter((x) => x.endsWith(".ts") && x !== "neon-store.ts")) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "src/lib/data/plane", f), "utf8").replace(/^\s*\/\/.*$/gm, ""), /\$queryRaw|\$executeRaw|PrismaClient/, `${f}: SQL belongs to neon-store.ts`);
});
test("loaders answer with DATABASE_URL pointing at a closed port, and no Prisma client is ever constructed", async () => {
  const dir = writePlaneDir(realMiniTree()); process.env.PLANE_DIR = dir; process.env.DATABASE_URL = "postgresql://nobody:x@127.0.0.1:1/none"; resetPlaneForTests();
  try {
    const cat = await import("../src/lib/data/catalog"), hist = await import("../src/lib/data/history"), core = await import("../src/lib/data/core");
    assert.equal((await cat.getCardDetail("counterspell-mh2-267"))?.name, "Counterspell"); assert.ok((await cat.getSets()).length > 5); assert.equal((await cat.getBrowseIndex()).n > 40, true); assert.deepEqual(await hist.getIndexSeries(), []); assert.equal((await core.getPlaneStatus())?.counts.sets! > 5, true);
    assert.equal((globalThis as { prisma?: unknown }).prisma, undefined, "no client was built"); assert.deepEqual(Object.keys(require.cache).filter((k) => /@prisma[\\/]client|src[\\/]lib[\\/]db\.ts/.test(k)), []);
  } finally { delete process.env.PLANE_DIR; delete process.env.DATABASE_URL; resetPlaneForTests(); }
});
test("GET /api/data-status: what this instance serves, counts and names only, never cached, no secret in the body", async () => {
  const dir = writePlaneDir(realMiniTree(), { seq: 41, ref: "c".repeat(40) }); process.env.PLANE_DIR = dir; process.env.PLANE_TOKEN = "ghp_secret_token_value"; resetPlaneForTests();
  try {
    const { GET, dynamic } = await import("../src/app/api/data-status/route"); assert.equal(dynamic, "force-dynamic");
    const r = await GET(), text = await r.text(), j = JSON.parse(text) as Record<string, unknown>;
    assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "private, no-store"); assert.deepEqual(Object.keys(j).sort(), ["ageHours", "failures", "hostUsed", "lruMb", "ref", "seq", "stale", "tokenRejected"]); assert.equal(j.ref, "c".repeat(40)); assert.equal(j.seq, 41); assert.equal(j.hostUsed, "dir"); assert.doesNotMatch(text, /ghp_|secret/);
  } finally { delete process.env.PLANE_DIR; delete process.env.PLANE_TOKEN; resetPlaneForTests(); }
});
test("POST /api/data-warm: Bearer CRON_SECRET only (fail closed), reads the hot set of the named commit, counts absent files apart from failed ones", async () => {
  const tree = realMiniTree(), dir = writePlaneDir(tree); process.env.PLANE_DIR = dir; process.env.CRON_SECRET = "cron-secret-for-tests"; resetPlaneForTests();
  try {
    const { POST, maxDuration } = await import("../src/app/api/data-warm/route"); assert.ok(maxDuration >= 30);
    const req = (auth: string | null, body: unknown = {}) => new Request("http://x/api/data-warm", { method: "POST", headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) });
    assert.equal((await POST(req(null))).status, 401); assert.equal((await POST(req("Bearer nope"))).status, 401); assert.equal((await POST(req("cron-secret-for-tests"))).status, 401, "the scheme is required");
    delete process.env.CRON_SECRET; assert.equal((await POST(req("Bearer undefined"))).status, 401, "with no secret configured nothing is authorised"); process.env.CRON_SECRET = "cron-secret-for-tests";
    const named = "d".repeat(40), ok = await POST(req("Bearer cron-secret-for-tests", { ref: named })), j = (await ok.json()) as { ok: boolean; ref: string; servedRef: string; files: number; absent: number; failed: number; index: boolean; bytes: number };
    assert.equal(ok.status, 200); assert.equal(ok.headers.get("cache-control"), "private, no-store"); assert.equal(j.ref, named, "the commit the publisher named is the one warmed"); assert.equal(j.servedRef, "b".repeat(40)); assert.equal(j.failed, 0); assert.equal(j.ok, true); assert.equal(j.index, false, "the index is built only when the pointer already names the ref");
    const rows = (JSON.parse(tree.read("ix/dict.json")) as { rows: number }).rows; assert.equal(j.files, hotSet(rows).length); assert.ok(j.absent > 10 && j.absent < j.files, "a tree that has no market, mover or preview files counts them absent, not failed"); assert.ok(j.bytes > 10_000);
    const own = (await (await POST(req("Bearer cron-secret-for-tests", { ref: "not a sha" }))).json()) as typeof j; assert.equal(own.ref, "b".repeat(40), "a malformed ref falls back to the pointer's"); assert.equal(own.index, true);
  } finally { delete process.env.PLANE_DIR; delete process.env.CRON_SECRET; resetPlaneForTests(); }
});
test("POST /api/revalidate purges the Neon-backed tags and the rankings, nothing of the published data; Bearer CRON_SECRET only", async () => {
  const tags: string[] = [], key = require.resolve("next/cache"); const saved = require.cache[key];
  require.cache[key] = { id: key, filename: key, loaded: true, exports: { revalidateTag: (t: string) => { tags.push(t); } } } as never; process.env.CRON_SECRET = "cron-secret-for-tests";
  try {
    const { POST } = await import("../src/app/api/revalidate/route"), mk = (auth?: string) => new Request("http://x/api/revalidate", { method: "POST", headers: auth ? { authorization: auth } : {} });
    assert.equal((await POST(mk())).status, 401); assert.equal((await POST(mk("Bearer wrong"))).status, 401); assert.deepEqual(tags, []);
    const r = await POST(mk("Bearer cron-secret-for-tests")), j = (await r.json()) as { ok: boolean; revalidated: string[] }; assert.equal(r.status, 200); assert.deepEqual(tags, ["published-decks", "rising-snapshots", "ebay-banner", "rank"]); assert.deepEqual(j.revalidated, tags); assert.equal(r.headers.get("cache-control"), "private, no-store");
    // ?tag= purges only the asked NEON_TAGS (the eBay pass sends ebay-banner); an unknown tag purges nothing
    tags.length = 0; const one = (q: string) => POST(new Request(`http://x/api/revalidate${q}`, { method: "POST", headers: { authorization: "Bearer cron-secret-for-tests" } }));
    const e = await one("?tag=ebay-banner"); assert.equal(e.status, 200); assert.deepEqual(tags, ["ebay-banner"]); assert.deepEqual(((await e.json()) as { revalidated: string[] }).revalidated, ["ebay-banner"]);
    tags.length = 0; const bad = await one("?tag=ebay-banner&tag=prices"); assert.equal(bad.status, 400); assert.deepEqual(tags, []);
  } finally { if (saved) require.cache[key] = saved; else delete require.cache[key]; delete process.env.CRON_SECRET; }
  for (const f of ["revalidate", "data-warm", "data-status"]) { const src = fs.readFileSync(path.join(ROOT, `src/app/api/${f}/route.ts`), "utf8"); assert.doesNotMatch(src, /PRICES_TAG|CATALOG_TAG|from "@\/lib\/db"/, f); assert.match(src, /export const dynamic = "force-dynamic"/, f); }
});
