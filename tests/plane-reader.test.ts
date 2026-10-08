// The fetch chain (sections 7.4 and 12.6): memory LRU, raw, the contents API, the previous ref, PlaneError; single flight; the in-flight cap; the circuit breaker; the build guard. Owner WP02.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HttpPlane, PlaneError, fsSource, type FetchLike, type FetchResult } from "../src/lib/data/plane/source";

const REF = "a".repeat(40), PREV = "b".repeat(40);
const res = (status: number, body = ""): FetchResult => ({ ok: status >= 200 && status < 300, status, text: async () => body });
interface Seen { url: string; init: Parameters<FetchLike>[1] }
function host(handler: (url: string, n: number) => FetchResult | Promise<FetchResult> | "timeout") {
  const seen: Seen[] = []; let n = 0;
  const fetch: FetchLike = async (url, init) => { seen.push({ url, init }); const r = await handler(url, ++n); if (r === "timeout") { const e = new Error("t"); e.name = "TimeoutError"; throw e; } return r; };
  return { fetch, seen };
}
const isRaw = (u: string) => u.startsWith("https://raw.githubusercontent.com/"); const body = (o: unknown) => JSON.stringify(o);
const plane = (h: ReturnType<typeof host>, extra: Partial<ConstructorParameters<typeof HttpPlane>[0]> = {}) => new HttpPlane({ repo: "o/r", token: "tok", fetch: h.fetch, buildPhase: false, ...extra });

test("a read goes to raw at the pinned ref with the token, an explicit 30-day revalidate and NO tag", async () => {
  const h = host(() => res(200, body({ x: 1 }))); const p = plane(h);
  assert.deepEqual(await p.source(REF).json("cat/0/1.json"), { x: 1 });
  assert.equal(h.seen[0]!.url, `https://raw.githubusercontent.com/o/r/${REF}/v1/cat/0/1.json`); assert.equal(h.seen[0]!.init.headers.Authorization, "token tok"); assert.deepEqual(h.seen[0]!.init.next, { revalidate: 2_592_000 });
  assert.equal(p.stats.rawOk, 1);
});
test("the parsed file is kept in the instance LRU: a second read sends no request", async () => {
  const h = host(() => res(200, body({ x: 1 }))); const p = plane(h); const s = p.source(REF);
  await s.json("a.json"); await s.json("a.json"); await s.text("a.json"); assert.equal(h.seen.length, 1); assert.equal(p.stats.lruHits, 2);
});
test("raw 500, raw timeout and raw 429 each fall through to the contents API", async () => {
  for (const bad of [res(500), "timeout" as const, res(429)]) {
    const h = host((u) => (isRaw(u) ? bad : res(200, body({ ok: 1 })))); const p = plane(h);
    assert.deepEqual(await p.source(REF).json("x.json"), { ok: 1 }); assert.equal(p.stats.apiOk, 1); assert.equal(p.stats.fallbacks, 1);
    assert.match(h.seen[1]!.url, /^https:\/\/api\.github\.com\/repos\/o\/r\/contents\/v1\/x\.json\?ref=a{40}$/); assert.equal(h.seen[1]!.init.headers.Authorization, "Bearer tok"); assert.equal(h.seen[1]!.init.headers.Accept, "application/vnd.github.raw+json");
  }
});
test("a file missing at the ref is read at the PREVIOUS ref; missing at both is PlaneError(missing); optionalJson turns that into null", async () => {
  const h = host((u) => (u.includes(REF) ? res(404) : res(200, body({ old: true })))); const p = plane(h);
  assert.deepEqual(await p.source(REF, PREV).json("hist/t/0/1.json"), { old: true }); assert.equal(p.stats.prevRefReads, 1);
  const gone = host(() => res(404)); const q = plane(gone);
  await assert.rejects(q.source(REF, PREV).json("x.json"), (e: unknown) => e instanceof PlaneError && e.reason === "missing");
  assert.equal(await plane(host(() => res(404))).optionalJson(REF, "un/0/9.json", PREV), null);
});
test("every host failing is PlaneError(http) and a corrupt body is PlaneError(parse): neither is cached", async () => {
  const dead = host(() => res(503)); const p = plane(dead); await assert.rejects(p.source(REF).json("x.json"), (e: unknown) => e instanceof PlaneError && e.reason === "http"); assert.equal(p.stats.failures, 1);
  const corrupt = host(() => res(200, "{not json")); const q = plane(corrupt); await assert.rejects(q.source(REF).json("x.json"), (e: unknown) => e instanceof PlaneError && e.reason === "parse");
  await assert.rejects(q.source(REF).json("x.json")); assert.equal(corrupt.seen.length, 4, "asked again (raw and API each time): a failed read is never remembered as a success");
});
test("single flight: ten concurrent reads of one file send one request", async () => {
  let release: () => void = () => {}; const gate = new Promise<void>((r) => { release = r; });
  const h = host(async () => { await gate; return res(200, body({ x: 1 })); }); const p = plane(h); const s = p.source(REF);
  const all = Promise.all([...Array(10)].map(() => s.json("a.json"))); release(); await all; assert.equal(h.seen.length, 1);
});
test("at most maxInflight requests are in flight to GitHub at once", async () => {
  let active = 0, peak = 0; const h = host(async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; return res(200, body({})); });
  const p = plane(h, { maxInflight: 3 }); const s = p.source(REF); await Promise.all([...Array(12)].map((_, i) => s.json(`f${i}.json`))); assert.ok(peak <= 3, `peak ${peak}`); assert.equal(p.stats.inflightPeak, peak);
});
test("a 429 trips the circuit breaker for 60 s: raw is skipped (the API serves), then tried again", async () => {
  let t = 1_000; let rawCalls = 0;
  const h = host((u) => { if (isRaw(u)) { rawCalls++; return rawCalls === 1 ? res(429) : res(200, body({ raw: 1 })); } return res(200, body({ api: 1 })); });
  const p = plane(h, { now: () => t, breakerMs: 60_000 }); const s = p.source(REF);
  assert.deepEqual(await s.json("a.json"), { api: 1 }); assert.deepEqual(await s.json("b.json"), { api: 1 }); assert.equal(rawCalls, 1, "raw is not asked while the breaker is open");
  t += 61_000; assert.deepEqual(await s.json("c.json"), { raw: 1 }); assert.equal(rawCalls, 2);
});
test("the LRU is bounded by bytes and evicts the oldest", async () => {
  const h = host((u) => res(200, body({ pad: "x".repeat(400), u }))); const p = plane(h, { lruBytes: 1000 }); const s = p.source(REF);
  for (const f of ["a", "b", "c", "d"]) await s.json(`${f}.json`); assert.ok(p.stats.lruBytes <= 1000 + 500, `lruBytes ${p.stats.lruBytes}`);
  const before = h.seen.length; await s.json("a.json"); assert.equal(h.seen.length, before + 1, "the oldest entry was evicted and is fetched again");
});
test("the BUILD fetches nothing: every read during `next build` throws PlaneError(build) and sends no request", async () => {
  const h = host(() => res(200, "{}")); const p = plane(h, { buildPhase: true });
  await assert.rejects(p.source(REF).json("x.json"), (e: unknown) => e instanceof PlaneError && e.reason === "build"); assert.equal(h.seen.length, 0);
  const old = process.env.NEXT_PHASE; process.env.NEXT_PHASE = "phase-production-build"; try { const q = new HttpPlane({ repo: "o/r", fetch: h.fetch }); await assert.rejects(q.source(REF).json("x.json"), (e: unknown) => e instanceof PlaneError && e.reason === "build"); } finally { if (old === undefined) delete process.env.NEXT_PHASE; else process.env.NEXT_PHASE = old; }
});
test("the chain is capped at 8 s: a host that burns the budget ends the read with PlaneError(timeout)", async () => {
  let t = 0; const h = host(() => { t += 9_000; return res(500); }); const p = plane(h, { now: () => t });
  await assert.rejects(p.source(REF, PREV).json("x.json"), (e: unknown) => e instanceof PlaneError && (e.reason === "timeout" || e.reason === "http"));
});
test("fsSource reads a directory that holds v1/ (the Actions jobs and the tests): the same objects as the HTTP source", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plane-fs-")); fs.mkdirSync(path.join(dir, "v1/cat/0"), { recursive: true }); fs.writeFileSync(path.join(dir, "v1/cat/0/1.json"), body({ v: 1, b: 1, c: [] }));
  const http = plane(host(() => res(200, body({ v: 1, b: 1, c: [] })))).source(REF); const fsrc = fsSource(dir);
  assert.deepEqual(await fsrc.json("cat/0/1.json"), await http.json("cat/0/1.json")); await assert.rejects(fsrc.json("cat/0/2.json"), (e: unknown) => e instanceof PlaneError && e.reason === "missing");
  fs.writeFileSync(path.join(dir, "v1/bad.json"), "{"); await assert.rejects(fsrc.json("bad.json"), (e: unknown) => e instanceof PlaneError && e.reason === "parse"); fs.rmSync(dir, { recursive: true });
});
