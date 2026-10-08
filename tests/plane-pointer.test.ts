// The pointer: the one mutable read (critique DP-04, DP-05; section 7.4). Owner WP02.
import test from "node:test";
import assert from "node:assert/strict";
import { PointerError, PointerReader, parsePointer, type PointerEnv } from "../src/lib/data/plane/pointer";
import { httpPointerEnv } from "../src/lib/data/plane/runtime";
import { pinnedInit, pointerInit, API_HOST, RAW_HOST, type FetchLike, type FetchResult } from "../src/lib/data/plane/source";
import type { PointerFile } from "../src/lib/data/plane/formats";

const ptr = (seq: number, extra: Partial<PointerFile> = {}): PointerFile => ({ v: 1, seq, ref: seq.toString(16).padStart(40, "a"), publishedAt: `2026-10-0${Math.min(9, seq)}T21:48:09Z`, priceDay: `2026-10-0${Math.min(9, seq)}`, tcgcsv: "t", scryfall: "s", phase: "full", format: "v1", counts: { cards: 1, units: 1, files: 1 }, manifestSha256: "m", prev: null, repo: "Specifxx/mtgcompare-data", histCut: "2026-10-04", pvAt: null, ...extra });

test("parsePointer accepts a good pointer, ignores extra fields and fills pvAt and prev", () => {
  const p = parsePointer({ ...ptr(3), futureField: 1, pvAt: undefined, prev: undefined }); assert.equal(p.seq, 3); assert.equal(p.pvAt, null); assert.equal(p.prev, null);
});
test("parsePointer rejects an unknown major format (kept as the last good pointer) and malformed fields", () => {
  const bad: [unknown, string][] = [[{ ...ptr(1), format: "v2", v: 2 }, "format"], [null, "shape"], [{ ...ptr(1), ref: "xyz" }, "shape"], [{ ...ptr(1), repo: "no slash" }, "shape"], [{ ...ptr(1), seq: -1 }, "shape"], [{ ...ptr(1), priceDay: "yesterday" }, "shape"], [{ ...ptr(1), phase: "half" }, "shape"], [{ ...ptr(1), prev: "short" }, "shape"]];
  for (const [raw, reason] of bad) assert.throws(() => parsePointer(raw), (e: unknown) => e instanceof PointerError && e.reason === reason, JSON.stringify(raw)?.slice(0, 60));
});
test("the pointer fetch is NO-STORE with no revalidate and no tag; a pinned fetch has revalidate 30 days and no tag and no cache mode", () => {
  for (const h of [RAW_HOST, API_HOST]) {
    const p = pointerInit(h, "tok"); assert.equal(p.cache, "no-store"); assert.equal((p as { next?: unknown }).next, undefined, "no next.revalidate and no next.tags on the pointer");
    const f = pinnedInit(h, "tok"); assert.deepEqual(f.next, { revalidate: 2_592_000 }); assert.equal(f.cache, undefined); assert.ok(!("tags" in (f.next ?? {})), "a tag would turn a purge into a hard miss and purge the CURRENT ref's pinned entries");
  }
  assert.equal(pinnedInit(RAW_HOST, "tok").headers.Authorization, "token tok"); assert.equal(pinnedInit(API_HOST, "tok").headers.Authorization, "Bearer tok"); assert.equal(pinnedInit(RAW_HOST, undefined).headers.Authorization, undefined);
});

function harness(initial: () => unknown) {
  let now = 1_000_000; let calls = 0; let impl = initial; const sleepers: { ms: number; r: () => void }[] = [];
  const env: PointerEnv = { now: () => now, fetchPointer: async () => { calls++; return impl(); }, sleep: (ms) => new Promise<void>((r) => { sleepers.push({ ms, r }); }) };
  return { env, calls: () => calls, advance: (ms: number) => { now += ms; }, set: (f: () => unknown) => { impl = f; }, sleepers, flushSleep: async () => { await new Promise((x) => setImmediate(x)); for (const s of sleepers.splice(0)) s.r(); } };   // the origin answers first, THEN the timers fire: the race the real code has when the origin is fast
}
test("a cold read fetches once; reads within 20 s come from the memo with no request; after 20 s one more request", async () => {
  const h = harness(() => ptr(1)); const r = new PointerReader(h.env);
  const p = r.get(); await h.flushSleep(); assert.equal((await p).source, "fresh"); assert.equal(h.calls(), 1);
  assert.equal((await r.get()).source, "memo"); h.advance(19_000); assert.equal((await r.get()).source, "memo"); assert.equal(h.calls(), 1);
  h.advance(2_000); h.set(() => ptr(2)); const q = r.get(); await h.flushSleep(); const s = await q; assert.equal(s.source, "fresh"); assert.equal(s.ptr!.seq, 2); assert.equal(h.calls(), 2);
});
test("single flight: concurrent callers share one origin attempt", async () => {
  const h = harness(() => ptr(1)); const r = new PointerReader(h.env);
  const all = Promise.all([r.get(), r.get(), r.get(), r.get(), r.get()]); await h.flushSleep(); await all; assert.equal(h.calls(), 1);
});
test("STALE-WHILE-ERROR lives in the memo: the origin fails after a good read, the last good pointer is served; a cold instance with a failing origin gets null", async () => {
  const h = harness(() => ptr(5)); const r = new PointerReader(h.env); const a = r.get(); await h.flushSleep(); await a;
  h.advance(30_000); h.set(() => { throw new PointerError("http", "HTTP 500"); });
  const b = r.get(); await h.flushSleep(); const s = await b; assert.equal(s.ptr!.seq, 5, "the last good pointer"); assert.equal(s.lastError, "http");
  const hc = harness(() => { throw new PointerError("timeout", "slow"); }); const cold = new PointerReader(hc.env); const c = cold.get(); await hc.flushSleep(); const cs = await c; assert.equal(cs.ptr, null); assert.equal(cs.source, "none"); assert.equal(cs.lastError, "timeout");
});
test("a slow origin never delays a warm instance by more than 250 ms; a cold one waits 3.5 s", async () => {
  const h = harness(() => ptr(2)); const r = new PointerReader(h.env, {}); const first = r.get(); await h.flushSleep(); await first;
  h.advance(30_000); let release: (v: unknown) => void = () => {}; h.set(() => new Promise((res) => { release = res; }));
  const warm = r.get(); await new Promise((x) => setImmediate(x)); assert.deepEqual(h.sleepers.map((s) => s.ms), [250]); await h.flushSleep(); const s = await warm; assert.equal(s.source, "stale"); assert.equal(s.ptr!.seq, 2);
  release(ptr(3)); await new Promise((x) => setImmediate(x));
  const cold = harness(() => new Promise(() => {})); const rc = new PointerReader(cold.env); const c = rc.get(); await new Promise((x) => setImmediate(x)); assert.deepEqual(cold.sleepers.map((s) => s.ms), [3500]); await cold.flushSleep(); assert.equal((await c).source, "none");
});
test("a pointer never moves an instance BACKWARDS (a lagging CDN copy), and an unknown major format keeps the last good one", async () => {
  const h = harness(() => ptr(7)); const r = new PointerReader(h.env); const a = r.get(); await h.flushSleep(); await a;
  h.advance(30_000); h.set(() => ptr(6)); const b = r.get(); await h.flushSleep(); assert.equal((await b).ptr!.seq, 7);
  h.advance(30_000); h.set(() => ({ ...ptr(8), format: "v2", v: 2 })); const c = r.get(); await h.flushSleep(); const s = await c; assert.equal(s.ptr!.seq, 7); assert.equal(s.lastError, "format");
});
test("a rejected token is REPORTED, not mistaken for 'no pointer': raw answers 404 to a bad token even for public paths (measured)", async () => {
  const res = (status: number, body = ""): FetchResult => ({ ok: status >= 200 && status < 300, status, text: async () => body });
  const calls: string[] = []; const f: FetchLike = async (url) => { calls.push(url); return res(404); };
  const env = httpPointerEnv({ repo: "o/r", branch: "data", token: "tok", lruMb: 1, rawMs: 100, apiMs: 100 }, f);
  await assert.rejects(env.fetchPointer(), (e: unknown) => e instanceof PointerError && e.reason === "token"); assert.equal(calls.length, 1, "no point asking the API with the same dead token");
  const r = new PointerReader({ ...env, sleep: () => new Promise(() => {}) }); const s = await r.get(); assert.equal(s.tokenRejected, true); assert.equal(s.ptr, null);
  const noTok = httpPointerEnv({ repo: "o/r", branch: "data", lruMb: 1, rawMs: 100, apiMs: 100 }, async () => res(404)); await assert.rejects(noTok.fetchPointer(), (e: unknown) => e instanceof PointerError && e.reason === "http");
});
test("the origin look tries raw then the API; a raw 500 falls to the API; both failing is an http error", async () => {
  const res = (status: number, body = ""): FetchResult => ({ ok: status >= 200 && status < 300, status, text: async () => body });
  const urls: string[] = []; const f: FetchLike = async (url) => { urls.push(url); return url.includes("raw.githubusercontent") ? res(500) : res(200, JSON.stringify(ptr(4))); };
  const env = httpPointerEnv({ repo: "o/r", branch: "data", token: "t", lruMb: 1, rawMs: 100, apiMs: 100 }, f); assert.equal(parsePointer(await env.fetchPointer()).seq, 4);
  assert.match(urls[0]!, /raw\.githubusercontent\.com\/o\/r\/data\/latest\.json$/); assert.match(urls[1]!, /api\.github\.com\/repos\/o\/r\/contents\/latest\.json\?ref=data$/);
  await assert.rejects(httpPointerEnv({ repo: "o/r", branch: "data", token: "t", lruMb: 1, rawMs: 100, apiMs: 100 }, async () => res(503)).fetchPointer(), (e: unknown) => e instanceof PointerError && e.reason === "http");
});
