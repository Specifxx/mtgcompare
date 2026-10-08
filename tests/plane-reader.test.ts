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

// ══ the loaders over a directory (PLANE_DIR): real Magic products, no network, no database (sections 7.12, 12.10) ══════════════════════════════════════════════════════════════════════════════════════════════════
import { CARD_FLAGS } from "../src/lib/constants";
import { REAL_PRICE_DAY, realMiniTree, writePlaneDir } from "./helpers/data-source";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import * as cat from "../src/lib/data/catalog";
import * as core from "../src/lib/data/core";
import * as hist from "../src/lib/data/history";

const useDir = (dir: string | undefined): void => { if (dir) process.env.PLANE_DIR = dir; else delete process.env.PLANE_DIR; resetPlaneForTests(); };
const real = writePlaneDir(realMiniTree());
const ID = { counterspell: 238617, birds: 2831, living: 449401, solRingPromo: 594545, ezioEtched: 541332, fireIce: 457193, delver: 609611, erayo: 12430 };

test("getCardDetail: Counterspell (Modern Horizons 2) is the headline Normal unit at its market, with the TCGplayer rows of both finishes and its oracle", async () => {
  useDir(real); const d = (await cat.getCardDetail("counterspell-mh2-267"))!;
  assert.equal(d.id, ID.counterspell); assert.equal(d.name, "Counterspell"); assert.equal(d.set.name, "Modern Horizons 2"); assert.equal(d.setCode, "MH2"); assert.equal(d.number, "267");
  assert.equal(d.headFinish, "N"); assert.equal(d.marketUsd, 394); assert.equal(d.valueUsd, 394); assert.equal(d.lowOnly, false); assert.equal(d.f?.market, 326); assert.deepEqual(d.units, [], "neither finish reaches the $5 tracking floor");
  assert.deepEqual(d.offers.map((o) => [o.source, o.finish, o.market, o.priceCents, o.inStock, o.storeId]), [["tcgplayer", "F", "US", 187, true, 0], ["tcgplayer", "N", "US", 199, true, 0]], "the TCGplayer lows, cheapest first");
  assert.ok(d.offers.every((o) => o.updatedAt === `${REAL_PRICE_DAY}T21:41:07Z` && o.currency === "USD" && o.shippingCents === null && o.url.includes("238617")));
  assert.equal(d.oracle?.name, "Counterspell"); assert.equal(d.oracle?.edhrecRank, 16); assert.equal(d.origin?.name, "Modern Horizons 2"); assert.equal(d.pricesAt, `${REAL_PRICE_DAY}T21:41:07Z`); assert.equal(d.tcgName, "Counterspell");
});
test("getCardDetail: a tracked dual-finish card has one unit per tracked finish, each with its own store aggregate; a low-only card is shown with its value and flagged; a foil-only card heads with Foil", async () => {
  useDir(real); const birds = (await cat.getCardDetail("birds-of-paradise-7ed-231"))!;
  assert.deepEqual(birds.units.map((u) => u.finish), ["N", "F"]); assert.equal(birds.marketUsd, 2289); assert.equal(birds.f?.market, 398_075); assert.equal(birds.units[0]!.low.US, 1749, "the unit's US low is TCGplayer's own low"); assert.equal(birds.units[1]!.low.US, 400_000); assert.equal(birds.units[0]!.low.AU, null);
  assert.equal(birds.tracked, 3);
  const living = (await cat.getCardDetail("living-artifact-30a-501-retro-frame"))!;
  assert.equal(living.id, ID.living); assert.equal(living.marketUsd, null); assert.equal(living.valueUsd, 20_306_770); assert.equal(living.lowOnly, true); assert.deepEqual(living.units, []);
  const sol = (await cat.getCardDetail("sol-ring-babp-1"))!; assert.equal(sol.headFinish, "F"); assert.equal(sol.marketUsd, 788); assert.equal(sol.n, null);
  assert.equal(((await cat.getCardDetail("ezio-auditore-da-firenze-acr-203-foil-etched"))!.flags & CARD_FLAGS.ETCHED) !== 0, true);
});
test("getCardDetail: an unknown slug, an oracle slug and junk are null (a miss is a 404 page, never a throw)", async () => {
  useDir(real);
  for (const s of ["no-such-card", "counterspell", "", "  ", "x".repeat(400)]) assert.equal(await cat.getCardDetail(s), null, JSON.stringify(s.slice(0, 20)));
});
test("sets: the list, by slug and by code (token, display code or Scryfall code, any case), the index maps and the Scryfall sets", async () => {
  useDir(real); const sets = await cat.getSets(); assert.ok(sets.length >= 10);
  const mh2 = sets.find((s) => s.tok === "mh2")!; assert.equal(mh2.name, "Modern Horizons 2"); assert.equal(mh2.tcgName, "Modern Horizons 2");
  for (const c of ["mh2", "MH2", " Mh2 "]) assert.equal((await cat.getSetByCode(c))?.id, mh2.id); assert.equal((await cat.getSetBySlug(mh2.slug))?.id, mh2.id); assert.equal(await cat.getSetByCode("nope"), null); assert.equal(await cat.getSetBySlug("nope"), null);
  const ix = await cat.getSetIndex(); assert.equal(ix.byId.get(mh2.id)?.slug, mh2.slug); assert.equal(ix.bySlug.get(mh2.slug)?.id, mh2.id); assert.equal(ix.byTok.get("mh2")?.id, mh2.id); assert.equal(ix.sets.length, sets.length);
  assert.equal((await cat.getScrySets()).mh2?.name, "Modern Horizons 2");
  const copy = await cat.getSets(); copy.pop(); assert.equal((await cat.getSets()).length, sets.length, "a caller cannot shorten the shared list");
});
test("oracles: by slug, printings through the engine, names (full, face and reskin), set + number", async () => {
  useDir(real); const o = (await cat.getOracleBySlug("counterspell"))!; assert.equal(o.name, "Counterspell"); assert.equal(o.slug, "counterspell"); assert.equal(o.nPrint, 1); assert.equal(await cat.getOracleBySlug("counterspell-mh2-267"), null, "a card slug is not an oracle slug"); assert.equal(await cat.getOracleBySlug("zzz"), null);
  const pr = await cat.getOraclePrintings(o.no); assert.equal(pr.total, 1); assert.deepEqual(pr.items.map((c) => [c.id, c.marketUsd, c.setCode]), [[ID.counterspell, 394, "MH2"]]); assert.deepEqual(await cat.getOraclePrintings(-1), { total: 0, items: [] });
  const names = await cat.resolveOracles(["counterspell", "Fire // Ice", "fire", "delver of secrets", "Counterspell!", "no such name"]);
  assert.deepEqual([...names.keys()].sort(), ["counterspell", "delver of secrets", "fire", "fire ice"]); assert.equal(names.get("fire")?.name, "Fire // Ice", "a face name resolves when exactly one oracle carries it"); assert.equal(names.get("fire ice")?.nameKey, "fire ice");
  const sn = await cat.resolveBySetNumber([{ set: "MH2", number: "0267" }, { set: "mh2", number: "267" }, { set: "inr", number: "60" }, { set: "mh2", number: "9999" }, { set: "", number: "1" }]);
  assert.deepEqual([...sn.keys()].sort(), ["inr|60", "mh2|267"]); assert.deepEqual(sn.get("mh2|267")!.map((c) => c.id), [ID.counterspell]); assert.equal(sn.get("inr|60")![0]!.slug, "delver-of-secrets-inr-60");
});
test("getCardsByIds: few buckets read the files, many read the index, and a card is the same either way (to the cent); misses are absent", async () => {
  useDir(real); const ids = [ID.counterspell, ID.birds, ID.living, ID.solRingPromo, ID.fireIce, ID.delver, ID.erayo, 1, 2, 999_999_999];
  const many = await cat.getCardsByIds([...ids, 3077, 12430, 4536, 21668, 80110, 97396, 158462, 173922, 189807, 208535, 238617, 286903, 456592, 560662, 652038, 697908, 720960]);
  const real9 = ids.filter((id) => many.has(id)); assert.ok(real9.length >= 7 && !many.has(1) && !many.has(999_999_999));
  for (const id of real9) { const one = (await cat.getCardsByIds([id])).get(id)!; const m = many.get(id)!; for (const k of ["id", "slug", "name", "marketUsd", "valueUsd", "lowOnly", "headFinish", "tracked", "rarity", "setCode", "number", "low", "stores", "listed", "thin", "flags"] as const) assert.deepEqual(m[k], one[k], `${id} ${k}`); }
  assert.deepEqual([...(await cat.getCardsByIds([])).keys()], []); assert.equal((await cat.getCardsByIds([ID.counterspell, ID.counterspell])).size, 1);
  const f = await cat.getCardsByIds([ID.birds], { unit: "F" }); assert.equal(f.get(ID.birds)!.headFinish, "F"); assert.equal(f.get(ID.birds)!.marketUsd, 398_075);
  const bare = await cat.getCardsByIds([ID.birds], { stores: false }); assert.equal(bare.get(ID.birds)!.low.US, null, "stores false skips the aggregate file"); assert.equal((await cat.getCardsByIds([ID.birds])).get(ID.birds)!.low.US, 1749);
});
test("the change figures of a tile are the published decimals on both paths: the index stores them as Float32 and must not leak 1.2999999523162842 (found by comparing 2,676 real rows of the 98,991)", async () => {
  const base = realMiniTree(), t = memTree(base.files().map((f) => [f, base.read(f)] as [string, string]));
  const row = (JSON.parse(t.read("ix/k-0.json")) as { id: number[] }).id.indexOf(ID.birds), ixp = JSON.parse(t.read("ix/p-0.json")) as { t: number[][] }; ixp.t = [[row, 0, 13, 21]]; t.write("ix/p-0.json", JSON.stringify(ixp));
  const b = Math.floor(ID.birds / 256), rel = `px/${Math.floor(b / 64)}/${b}.json`, px = JSON.parse(t.read(rel)) as { p: (number | null)[][] }, r = px.p.find((x) => x[0] === ID.birds)!; r[6] = 1.3; r[7] = 2.1; r[8] = 2500; t.write(rel, JSON.stringify(px));
  useDir(writePlaneDir(t));
  const files = (await cat.getCardsByIds([ID.birds])).get(ID.birds)!, idx = (await cat.getBrowseIndex()).lookup([ID.birds]).get(ID.birds)!;
  assert.deepEqual([files.change7d, files.change30d], [1.3, 2.1], "from the bucket files"); assert.deepEqual([idx.change7d, idx.change30d], [1.3, 2.1], "from the browse index");
});
test("getCardLookup resolves ids and slugs together and never throws on a miss; cardExists and sealedExists answer from the bucket list and the sealed list", async () => {
  useDir(real); const lk = await cat.getCardLookup({ ids: [ID.delver, 1], slugs: ["counterspell-mh2-267", "nope", "counterspell"] });
  assert.deepEqual([...lk.byId.keys()].sort((a, b) => a - b), [ID.counterspell, ID.delver].sort((a, b) => a - b)); assert.equal(lk.bySlug.get("counterspell-mh2-267")?.id, ID.counterspell); assert.ok(lk.setById.size >= 10);
  assert.deepEqual([...(await cat.cardExists([ID.delver, 1, 999_999_999, 0, -5, 1.5]))], [ID.delver]); assert.deepEqual([...(await cat.cardExists([]))], []);
  assert.deepEqual([...(await cat.sealedExists([1, 2, 3]))], [], "this tree has no sealed list");
});
test("core: the pointer, the status, the catalogue counts and the browse index memo (a richer index serves a poorer request)", async () => {
  useDir(real); const ptr = (await core.getDataRef())!; assert.equal(ptr.seq, 7); assert.equal(ptr.ref, "b".repeat(40)); assert.equal(core.planeHealth().hostUsed, "dir");
  const st = (await core.getPlaneStatus())!; assert.equal(st.counts.cards, (await cat.getCatalogStats()).cards); const stats = await cat.getCatalogStats(); assert.equal(stats.pricesAt, ptr.publishedAt); assert.equal(stats.pricedByMarket.US, stats.cards); assert.equal(stats.pricedByMarket.AU, 0);
  const full = await cat.getBrowseIndex(); assert.equal(await cat.getBrowseIndex({ withStores: false, withOracle: false }), full); assert.equal(await cat.getBrowseIndex({ withOracle: false }), full); assert.equal(full.hasOracle, true);
  useDir(real); const light = await cat.getBrowseIndex({ withOracle: false }); assert.equal(light.hasOracle, false); assert.notEqual(await cat.getBrowseIndex(), light, "a poorer index does not serve a richer request");
  const top = full.query(core.canonicalQuery({ sort: "value", per: 24 })); assert.ok(top.items.slice(0, 5).every((c) => c.marketUsd != null && c.id !== ID.living), "a low-only listing ($203,067.70) never tops sort: value");
  assert.equal(top.items[0]!.id, 630946, "Traveling Chocobo (foil only, $1,845.60) heads by its headline market"); assert.equal(full.query(core.canonicalQuery({ sort: "value", per: 24, finish: "F" })).items[0]!.id, ID.birds, "the Foil unit view ranks the Foil markets: Birds of Paradise 7ED at $3,980.75");
});
test("a directory with no latest.json still serves (a fixture has no publish history); the build reads NOTHING, in the directory mode too", async () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "mtgc-bare-")); fs.cpSync(path.join(real, "v1"), path.join(bare, "v1"), { recursive: true });
  useDir(bare); assert.equal((await cat.getCardDetail("counterspell-mh2-267"))?.id, ID.counterspell); assert.equal((await core.getDataRef())?.ref, "0".repeat(40));
  useDir(real); process.env.NEXT_PHASE = "phase-production-build";
  try {
    for (const f of [() => core.getDataRef(), () => cat.getCardDetail("counterspell-mh2-267"), () => cat.getSets(), () => cat.getBrowseIndex(), () => hist.getIndexSeries(), () => core.getPlaneStatus()]) await assert.rejects(f(), (e: unknown) => e instanceof PlaneError && e.reason === "build");
  } finally { delete process.env.NEXT_PHASE; }
  assert.equal((await cat.getSets()).length > 0, true, "and the next request is served again");
});
test("a missing file is a PlaneError, not an empty page: a tree without meta/sets.json fails the set list", async () => {
  const broken = fs.mkdtempSync(path.join(os.tmpdir(), "mtgc-broken-")); fs.cpSync(real, broken, { recursive: true }); fs.rmSync(path.join(broken, "v1/meta/sets.json"));
  useDir(broken); await assert.rejects(cat.getSets(), (e: unknown) => e instanceof PlaneError && e.reason === "missing");
});
test("canonicalQuery: arrays sorted and de-duplicated, text folded to 60 characters, per and page clamped, defaults and unknown values dropped, the key order fixed", () => {
  const q = core.canonicalQuery({ q: "  Sheoldred,  The Apocalypse!!  " + "x".repeat(80), sort: "bogus" as never, page: 999, per: 30 as never, setIds: [9, 3, 3, -1, 0, 2.5] as never, rarities: ["R", "M", "Z", "R"] as never, types: ["land", "creature", "nope"], treats: ["borderless", "nope"], colors: { mask: 99, mode: "any" }, finish: "X" as never, minCents: 500, maxCents: 100, classes: [0], includeUnlisted: false, tracked: false, pricedIn: "XX" as never, keyword: "  Double Strike ", format: { key: "modern", playable: true } });
  assert.deepEqual(q, { sort: "value", page: 100, per: 48, q: ("sheoldred the apocalypse " + "x".repeat(80)).slice(0, 60).trim(), setIds: [3, 9], rarities: ["M", "R"], types: ["creature", "land"], treats: ["borderless"], keyword: "double-strike", format: { key: "modern", playable: true }, minCents: 100, maxCents: 500 });
  assert.deepEqual(Object.keys(q), ["sort", "page", "per", "q", "setIds", "rarities", "types", "treats", "keyword", "format", "minCents", "maxCents"]);
  assert.deepEqual(core.canonicalQuery({}), { sort: "value", page: 1, per: 48 }); assert.equal(core.canonicalQuery({ per: 100, page: 0 }).per, 100); assert.equal(core.canonicalQuery({ per: 24 }).per, 24); assert.equal(core.canonicalQuery({ per: 500 as never }).per, 100); assert.equal(core.canonicalQuery({ page: 3.9 }).page, 3);
  assert.deepEqual(core.canonicalQuery({ classes: [3, 0, 3, 9 as never], includeHidden: true, tracked: true, pricedIn: "AU", finish: "F", colors: { mask: 7, mode: "colorless" }, identity: { mask: 5 }, oracleNos: [5, 2, 5], oracleNo: 7, sc: " PBRO ", rootId: 12 }), { sort: "value", page: 1, per: 48, sc: "pbro", oracleNo: 7, oracleNos: [2, 5], rootId: 12, colors: { mask: 0, mode: "colorless" }, identity: { mask: 5 }, finish: "F", tracked: true, pricedIn: "AU", classes: [0, 3], includeHidden: true });
  assert.equal(JSON.stringify(core.canonicalQuery({ rarities: ["R", "M"], setIds: [2, 1] })), JSON.stringify(core.canonicalQuery({ setIds: [1, 2], rarities: ["M", "R", "M"] })), "equal requests make equal cache keys");
  assert.equal(core.canonicalQuery({ per: null as never }).per, 48, "a null size is the default, not the smallest"); assert.equal(core.canonicalQuery({ per: "100" as never }).per, 100);
  assert.equal(core.canonicalQuery({ colors: { mask: 0, mode: "any" } }).colors, undefined, "no colour ticked is no filter"); assert.deepEqual(core.canonicalQuery({ colors: { mask: 0, mode: "exact" } }).colors, { mask: 0, mode: "exact" }, "exactly colourless is a filter");
});
test("offerLive: in stock AND refreshed within 72 hours; jsonBytes measures UTF-8", () => {
  const now = Date.parse("2026-10-07T12:00:00Z"), h = 3_600_000;
  assert.equal(core.offerLive(true, now - 71 * h, now), true); assert.equal(core.offerLive(true, now - 72 * h, now), false); assert.equal(core.offerLive(false, now, now), false);
  assert.equal(core.offerLive(true, new Date(now - h), now), true); assert.equal(core.offerLive(true, new Date(now - h).toISOString(), now), true); assert.equal(core.offerLive(true, "not a date", now), false); assert.equal(core.STALE_MS, 72 * h);
  assert.equal(core.jsonBytes({ a: 1 }), 7); assert.equal(core.jsonBytes("é"), 4); assert.equal(core.jsonBytes(undefined), 0); assert.equal(core.jsonBytes(null), 4);
});

// ══ history: base + tail merged, v3 bases still read, untracked units cost no request ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { miniFull, trackedOf, dayOf, isoOf } from "./helpers/plane-tree";
import { seriesOf } from "../src/lib/data/plane/history-delta";
import { decodeDense } from "../src/lib/data/plane/history-codec";
import { bucketPath, histBucket, scPath, slugPath } from "../src/lib/data/plane/shards";
import { unitKey, unitOfUid } from "../src/lib/constants";
import { memTree } from "../src/lib/data/plane/tree";

test("getUnitHistory merges the base file and the tail file day for day (the codec's own merge is the oracle); getSparklines and getRecentHistory read the same series", async () => {
  const tree = miniFull({ day: 3 }), dir = writePlaneDir(tree, { priceDay: isoOf(dayOf(3)) }); useDir(dir);
  const want = seriesOf(tree), uid = [...trackedOf({ day: 3 })].find((u) => want.has(u))!, unit = unitOfUid(uid);
  const expected = decodeDense(want.get(uid)!).filter((p) => p.cents != null).map((p) => ({ day: isoOf(p.day), marketUsd: p.cents, lowUsd: null }));
  const got = await hist.getUnitHistory(unit); assert.equal(got.length, 33, "30 base days + 3 tail days"); assert.deepEqual(got, expected); assert.ok(got.every((p) => !("lows" in p)), "v4 carries the market price only");
  assert.equal((await hist.getUnitHistory(unit, 7)).length, 8, "the last 7 days plus the anchor day");
  const sp = await hist.getSparklines([unit, { id: 1, finish: "N" }], 30); assert.deepEqual(Object.keys(sp), [unitKey(unit.id, unit.finish)]); assert.equal(sp[unitKey(unit.id, unit.finish)]!.length, 30, "downsampled to 30 points"); assert.equal(sp[unitKey(unit.id, unit.finish)]![29], expected[expected.length - 1]!.marketUsd);
  assert.equal(Object.values(await hist.getSparklines([unit], 5))[0]!.length, 6);
  const rec = await hist.getRecentHistory([unit]); const m = rec.get(unitKey(unit.id, unit.finish))!; assert.equal(m.size, 33); assert.equal(m.get(Date.parse(`${expected[0]!.day}T00:00:00Z`)), expected[0]!.marketUsd);
  assert.deepEqual(await hist.getUnitHistory({ id: 3_999_999, finish: "N" }), [], "an id in no tracked bucket has no history and costs no request");
  assert.equal((await hist.getIndexSeries()).length, 1); assert.deepEqual(await hist.getRecentlyUpdated(), [], "mv/recent.json is empty in this tree");
});
test("a v3 base file (one value per calendar day) is still read and merged with a v4 tail", async () => {
  const tree = miniFull({ day: 1 }), uid = [...trackedOf({ day: 1 })][0]!, { id, finish } = unitOfUid(uid), key = unitKey(id, finish), rel = bucketPath("hist/p", histBucket(id));
  const base = JSON.parse(tree.read(rel)) as { v: number; p: Record<string, number[]> }; const dense = decodeDense(base.p[key] as never); base.v = 3; base.p = { [key]: [dense[0]!.day, ...dense.map((d) => d.cents as number)] }; const t2 = memTree(tree.files().map((f) => [f, f === rel ? JSON.stringify(base) : tree.read(f)] as [string, string]));
  useDir(writePlaneDir(t2, { priceDay: isoOf(dayOf(1)) })); const got = await hist.getUnitHistory({ id, finish }); assert.equal(got.length, 31, "30 base days from the v3 file + 1 tail day"); assert.equal(got[0]!.marketUsd, dense[0]!.cents);
});

test("data does not wait for a deploy (Annex C check 22): when the pointer moves under a running instance the next read shows the new publish, with nothing purged and no reset", async () => {
  const tree = realMiniTree(), dir = writePlaneDir(tree); useDir(dir);
  const before = (await cat.getCardDetail("counterspell-mh2-267"))!; assert.equal(before.marketUsd, 394); assert.equal((await cat.getCatalogStats()).pricesAt, `${REAL_PRICE_DAY}T21:41:07Z`);
  const b = Math.floor(ID.counterspell / 256), rel = `px/${Math.floor(b / 64)}/${b}.json`, px = JSON.parse(tree.read(rel)) as { p: (number | null)[][] };
  px.p.find((r) => r[0] === ID.counterspell)![1] = 199;                                    // the next publish: the Normal market fell to the low it had (a derived figure, not a quote)
  fs.writeFileSync(path.join(dir, "v1", rel), JSON.stringify(px)); fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(dir, "latest.json"), "utf8")), seq: 8, ref: "c".repeat(40), publishedAt: "2026-10-08T21:41:07Z", priceDay: "2026-10-08" }));
  const after = (await cat.getCardDetail("counterspell-mh2-267"))!; assert.equal(after.marketUsd, 199); assert.equal(after.pricesAt, "2026-10-08T21:41:07Z"); assert.equal((await cat.getCatalogStats()).pricesAt, "2026-10-08T21:41:07Z"); assert.equal((await core.getDataRef())!.seq, 8);
});

// ══ the REAL tree (PLANE_SAMPLE_DIR = the v1 directory of the lab's 9,488-file snapshot of 2026-10-07, upgraded to the final formats) ═══════════════════════════════════════════════════════════════════════════════
const SAMPLE = process.env.PLANE_SAMPLE_DIR, haveReal = !!SAMPLE && fs.existsSync(path.join(SAMPLE, "ix/dict.json"));
test("REAL TREE (PLANE_SAMPLE_DIR): Lightning Bolt, Sol Ring, Counterspell and The One Ring through every loader; the index loads in under 2 s and answers in milliseconds", { skip: !haveReal }, async () => {
  useDir(path.dirname(SAMPLE!)); const t0 = performance.now(); const ix = await cat.getBrowseIndex(); const load = performance.now() - t0;
  assert.ok(ix.n > 98_000 && load < 2000, `${ix.n} rows in ${load.toFixed(0)} ms`); const q = core.canonicalQuery({ sort: "value", per: 100 }); ix.query(q); const q0 = performance.now(); const top = ix.query(q); const ms = performance.now() - q0;
  assert.ok(top.items.every((c) => !c.lowOnly && c.marketUsd != null) && top.items.every((c, i) => i === 0 || c.marketUsd! <= top.items[i - 1]!.marketUsd!), "the dearest 100 are market-priced and in order"); assert.ok(ms < 50, `${ms.toFixed(1)} ms`);
  const sol = (await cat.getCardDetail("sol-ring-lea"))!; assert.deepEqual([sol.name, sol.set.name, sol.lowOnly, sol.marketUsd], ["Sol Ring", "Alpha Edition", true, null]); assert.ok(sol.valueUsd! > 100_000, "Alpha Sol Ring is shown with its low");
  const cs = (await cat.getCardDetail("counterspell-s99-34"))!; assert.deepEqual([cs.name, cs.marketUsd, cs.oracle?.name, cs.set.name], ["Counterspell", 283, "Counterspell", "Starter 1999"]);
  const bolt = (await cat.getOracleBySlug("lightning-bolt"))!; assert.equal(bolt.name, "Lightning Bolt"); assert.ok(bolt.nPrint >= 50); const pr = await cat.getOraclePrintings(bolt.no, 1, 24); assert.equal(pr.total, bolt.nPrint); assert.ok(pr.items.every((c, i) => i === 0 || (c.marketUsd ?? -1) <= (pr.items[i - 1]!.marketUsd ?? -1)));
  const ltr = (await cat.getSetByCode("LTR"))!; assert.match(ltr.name, /Lord of the Rings/); const hi = await cat.getSetHighlights(ltr.id, 5); assert.equal(hi[0]!.name, "The One Ring"); assert.equal(hi.length, 5);
  assert.deepEqual([...(await cat.resolveBySetNumber([{ set: "ltr", number: "246" }])).get("ltr|246")!.map((c) => c.slug)], ["the-one-ring-ltr-246"]);
  const names = await cat.resolveOracles(["sol ring", "lightning bolt", "fire ice", "the one ring"]); assert.equal(names.size, 4); assert.equal(names.get("fire ice")!.name, "Fire // Ice");
  const ring = ix.lookup([487_805]).get(487_805)!; assert.equal(ring.slug, "the-one-ring-ltr-246"); const h = await hist.getUnitHistory({ id: 487_805, finish: "N" }); assert.ok(h.length > 300 && h.every((p) => p.marketUsd != null)); assert.ok((await hist.getIndexSeries()).length === 730);
  assert.ok((await hist.getRecentlyUpdated(5)).length === 5);
  const stats = await cat.getCatalogStats(); assert.deepEqual([stats.cards, stats.sets], [98_991, 439]);
  const many = await cat.getCardsByIds(Array.from({ length: 300 }, (_, i) => ix.id[Math.floor((i * ix.n) / 300)]!)); assert.equal(many.size, 300, "300 cards from 300 buckets come from the index");
});

test("history of a tree published before the first store stage: meta/buckets.json lists no tracked bucket (it is built from the `un` files) but the history files exist, so an empty list rules nothing out (found by reading what bootstrap wrote)", async () => {
  const tree = miniFull({ day: 1 }), b = JSON.parse(tree.read("meta/buckets.json")) as { tracked: number[] }; assert.ok(b.tracked.length > 0); b.tracked = [];
  const t2 = memTree(tree.files().map((f) => [f, f === "meta/buckets.json" ? JSON.stringify(b) : tree.read(f)] as [string, string])), uid = [...trackedOf({ day: 1 })][0]!;
  useDir(writePlaneDir(t2, { priceDay: isoOf(dayOf(1)) })); assert.equal((await hist.getUnitHistory(unitOfUid(uid))).length, 31);
});

test("family: a Foil Etched twin sits in another bucket than its base product (Counterspell Modern Horizons 2: 238617 and the etched product 240803, 8 buckets apart); each page finds the other from the root, from the twin and through the set + number shard", async () => {
  const base = realMiniTree(), t = memTree(base.files().map((f) => [f, base.read(f)] as [string, string])), TWIN = 240_803, TWIN_SLUG = "counterspell-mh2-267-foil-etched";
  const bb = Math.floor(ID.counterspell / 256), tb = Math.floor(TWIN / 256), at = (fam: string, b: number): string => `${fam}/${Math.floor(b / 64)}/${b}.json`; assert.notEqual(bb, tb);
  const rootCat = JSON.parse(t.read(at("cat", bb))) as { c: unknown[][] }, root = rootCat.c.find((r) => r[0] === ID.counterspell)!; root[16] = ID.counterspell; t.write(at("cat", bb), JSON.stringify(rootCat));
  const twin = [...root]; twin[0] = TWIN; twin[1] = TWIN_SLUG; twin[10] = "etched"; twin[12] = (root[12] as number) | CARD_FLAGS.ETCHED; twin[13] = 2; twin[16] = ID.counterspell;
  t.write(at("cat", tb), JSON.stringify({ v: 1, b: tb, c: [twin] })); t.write(at("px", tb), JSON.stringify({ v: 1, b: tb, p: [[TWIN, null, null, null, null, 256 | 2 | 4 | 64]] }));   // the fixture prices Counterspell, not its etched product: the twin has no quote here
  const m = JSON.parse(t.read("meta/buckets.json")) as { cat: number[] }; m.cat = [...m.cat, tb].sort((x, y) => x - y); t.write("meta/buckets.json", JSON.stringify(m));
  const slugRel = slugPath(TWIN_SLUG), slugs = t.has(slugRel) ? (JSON.parse(t.read(slugRel)) as { s: [string, number][] }) : { v: 1, h: Number.parseInt(slugRel.slice(5, 7), 16), s: [] as [string, number][], o: [], z: [] };
  slugs.s.push([TWIN_SLUG, TWIN]); slugs.s.sort((x, y) => (x[0] < y[0] ? -1 : 1)); t.write(slugRel, JSON.stringify(slugs));
  const scRel = scPath("mh2"), sc = JSON.parse(t.read(scRel)) as { s: Record<string, Record<string, number[]>> }; assert.deepEqual(sc.s.mh2!["267"], [ID.counterspell]); sc.s.mh2!["267"] = [ID.counterspell, TWIN]; t.write(scRel, JSON.stringify(sc));
  useDir(writePlaneDir(t));
  const a = (await cat.getCardDetail("counterspell-mh2-267"))!, b = (await cat.getCardDetail(TWIN_SLUG))!;
  assert.deepEqual(a.family.map((f) => [f.id, f.slug, f.hasN, f.hasF, f.treat, (f.flags & CARD_FLAGS.ETCHED) !== 0]), [[TWIN, TWIN_SLUG, false, true, ["etched"], true]], "the base page links the etched twin");
  assert.deepEqual(b.family.map((f) => [f.id, f.hasN, f.hasF]), [[ID.counterspell, true, true]], "and the twin's page links the base product"); assert.equal(a.rootId, ID.counterspell); assert.equal(b.rootId, ID.counterspell);
  assert.deepEqual((await cat.getCardDetail("birds-of-paradise-7ed-231"))!.family, [], "a card with no family reads nothing for it");
});

import { CatalogShimError } from "../src/lib/data/catalog-shim";
test("getCatalog() (the transition shim) refuses in a production deployment, runs elsewhere with one warning per process, and is the listed class-0 rows of the index", async () => {
  useDir(real); const warn = console.warn, seen: string[] = []; console.warn = (m: unknown) => { seen.push(String(m)); };
  try {
    process.env.VERCEL_ENV = "production"; await assert.rejects(cat.getCatalog(), (e: unknown) => e instanceof CatalogShimError); assert.deepEqual(seen, []);
    process.env.VERCEL_ENV = "preview"; const c = await cat.getCatalog(), again = await cat.getCatalog();
    assert.equal(again, c, "a 5-minute memo per ref"); assert.equal(seen.length, 1); assert.match(seen[0]!, /transition shim/); assert.equal(c.complete, true);
    const ix = await cat.getBrowseIndex(); const listed0 = Array.from({ length: ix.n }, (_, i) => i).filter((i) => ix.cls[i] === 0).length; assert.equal(c.cards.length, listed0);
    assert.equal(c.byId.get(ID.counterspell)?.slug, "counterspell-mh2-267"); assert.equal(c.bySlug.get("counterspell-mh2-267")?.id, ID.counterspell); assert.equal(c.setById.size, (await cat.getSets()).length); assert.equal(c.pricesAt, `${REAL_PRICE_DAY}T21:41:07Z`);
    assert.equal(c.byId.has(718476), false, "an art card (class 2) is not in the old catalogue shape");
  } finally { console.warn = warn; delete process.env.VERCEL_ENV; }
});

test("a rotation needs no deploy: the pointer is read from PLANE_REPO and every file from the repository the POINTER names (contract 12.5.7)", async () => {
  const tree = realMiniTree(), seen: string[] = [], realFetch = globalThis.fetch, was = { repo: process.env.PLANE_REPO, token: process.env.PLANE_TOKEN };
  const ptr = { v: 1, seq: 9, ref: "e".repeat(40), publishedAt: "2026-10-08T21:41:07Z", priceDay: "2026-10-08", tcgcsv: "", scryfall: "", phase: "full", format: "v1", counts: { cards: 1, units: 0, files: 1 }, manifestSha256: "0".repeat(64), prev: null, repo: "o/new", histCut: "2026-10-08", pvAt: null };
  globalThis.fetch = (async (url: string) => {
    seen.push(url); const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([^/]+)\/(.+)$/.exec(url);
    if (m && m[1] === "o/old" && m[2] === "data" && m[3] === "latest.json") return res(200, JSON.stringify(ptr));
    if (m && m[1] === "o/new" && m[2] === ptr.ref && m[3]!.startsWith("v1/") && tree.has(m[3]!.slice(3))) return res(200, tree.read(m[3]!.slice(3)));
    return res(404);
  }) as unknown as typeof fetch;
  try {
    delete process.env.PLANE_TOKEN; process.env.PLANE_REPO = "o/old"; useDir(undefined);
    assert.equal((await cat.getCardDetail("counterspell-mh2-267"))?.id, ID.counterspell); assert.equal(core.planeHealth().ref, ptr.ref);
    const files = seen.filter((u) => !u.endsWith("/latest.json")); assert.ok(files.length >= 5, `${files.length} file requests`);
    assert.ok(files.every((u) => u.startsWith(`https://raw.githubusercontent.com/o/new/${ptr.ref}/v1/`)), "every file comes from the repository the pointer names");
    assert.deepEqual(seen.filter((u) => u.endsWith("/latest.json")), ["https://raw.githubusercontent.com/o/old/data/latest.json"], "the pointer stays in PLANE_REPO");
  } finally {
    globalThis.fetch = realFetch; if (was.repo === undefined) delete process.env.PLANE_REPO; else process.env.PLANE_REPO = was.repo; if (was.token !== undefined) process.env.PLANE_TOKEN = was.token; useDir(undefined);
  }
});
