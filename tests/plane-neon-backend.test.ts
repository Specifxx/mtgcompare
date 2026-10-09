// The Neon-backed plane (DECISIONS.md, 2026-10-09) against a REAL PostgreSQL: the publisher (stage, verify, one flip transaction, pointer row last), the reader (manifest-keyed LRU, pointer memo, stale-while-error) and the real loaders over a published tree.
// Needs a local PostgreSQL (PLANE_TEST_DATABASE_URL, default postgresql://mtg:mtg@127.0.0.1:5432/mtgcompare_neonplane); without one every test here SKIPS and says so. No real network, no real Neon, no eBay. The big test publishes the local bootstrap tree (.data, npm run import:bootstrap)
// when it exists and falls back to the real-data mini tree otherwise.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const DB_URL = process.env.PLANE_TEST_DATABASE_URL ?? "postgresql://mtg:mtg@127.0.0.1:5432/mtgcompare_neonplane";
process.env.DATABASE_URL = DB_URL;                                                                // the real loaders reach the database through src/lib/db.ts, lazily, after this line
delete process.env.PLANE_DIR; delete process.env.PLANE_BACKEND; delete process.env.PLANE_REMOTE;
import { NeonStore, PLANE_TABLE, POINTER_ROW, STAGE_PREFIX, prismaSql, sha256Hex, unpack, type PlaneSql } from "../src/lib/data/plane/neon-store";
import { NeonPlane } from "../src/lib/data/plane/neon-reader";
import { PointerReader } from "../src/lib/data/plane/pointer";
import { PlaneError } from "../src/lib/data/plane/source";
import { publish, type PublishInput } from "../src/lib/data/plane/publisher";
import { restoreStateNeon } from "../src/lib/data/plane/publisher-neon";
import { planeBackend } from "../src/lib/data/plane/backend";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import { fsTree } from "../src/lib/data/plane/tree";
import { validateTree } from "../src/lib/data/plane/validate";
import type { PointerFile } from "../src/lib/data/plane/formats";
import { MINI_CUT, isoOf } from "./helpers/plane-tree";
import { at, builder, day } from "./helpers/publish-harness";
import { realMiniTree } from "./helpers/data-source";
import { importEnv, miniMagicDay, tmpRoot } from "./helpers/publish-harness";
import { runImport } from "../scripts/import";
import { pullPlane } from "../scripts/plane-pull";

const prisma = new PrismaClient({ datasourceUrl: DB_URL, log: ["error"] });
let up = false; const sql: PlaneSql = prismaSql(prisma as never);
const store = new NeonStore(sql);
before(async () => { try { await prisma.$queryRawUnsafe("SELECT 1"); up = true; await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${PLANE_TABLE}"`); } catch (e) { console.log(`plane-neon-backend: no PostgreSQL at ${DB_URL.replace(/:[^:@/]*@/, ":***@")} (${String(e).slice(0, 80)}): these tests skip`); } });
after(async () => { await prisma.$disconnect(); });
const need = (t: { skip(m?: string): void }): boolean => { if (!up) { t.skip("no PostgreSQL"); return false; } return true; };
const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "neon-plane-"));
const rows = async (): Promise<Map<string, string>> => { const r = (await prisma.$queryRawUnsafe(`SELECT path, sha FROM "${PLANE_TABLE}" ORDER BY path`)) as { path: string; sha: string }[]; return new Map(r.map((x) => [x.path, x.sha])); };
const pointerRow = async (): Promise<PointerFile> => JSON.parse((await store.pointerText())!) as PointerFile;
const inputOf = (n: number, mode: "catalog" | "full", work: string, mutate?: Parameters<typeof builder>[2], extra: Partial<PublishInput> = {}): PublishInput => ({ remote: "", workdir: work, phase: mode, priceDay: day(n), tcgcsv: `t${n}`, scryfall: `s${n}`, repo: "x/y", now: at(n), build: builder(n, mode, mutate), store, ...extra });

test("the default backend is Neon; github only when asked, and a git remote named by hand means git", () => {
  assert.equal(planeBackend({}), "neon"); assert.equal(planeBackend({ PLANE_BACKEND: "neon" }), "neon"); assert.equal(planeBackend({ PLANE_BACKEND: "github" }), "github");
  assert.equal(planeBackend({ PLANE_BACKEND: "GitHub " }), "github"); assert.equal(planeBackend({ PLANE_REPO: "a/b", DATA_REPO_TOKEN: "x" }), "neon", "setting the repository variables does not switch the backend: only PLANE_BACKEND=github does"); assert.equal(planeBackend({ PLANE_REMOTE: "/tmp/x.git" }), "github");
});

test("publish -> read: pointer row last, sha equality, unchanged files are not rewritten, removed paths are deleted, state backup stored", async (t) => {
  if (!need(t)) return;
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${PLANE_TABLE}"`);
  const work = tmp();
  const a = await publish(inputOf(0, "full", work)); assert.equal(a.kind, "published");
  const p1 = await pointerRow(); assert.equal(p1.seq, 1); assert.equal(p1.repo, "neon/plane"); assert.match(p1.ref, /^[0-9a-f]{40}$/); assert.equal((a as { ref: string }).ref, p1.ref);
  const all = await rows(); assert.ok([...all.keys()].every((p) => !p.startsWith(STAGE_PREFIX)), "no staged row survives a flip");
  // round trip: every v1 file read back equals what the build wrote (sha) and the manifest agrees with the stored shas
  const out = tmp(); const pulled = await store.pullTo(out, { clean: true });
  const tree = fsTree(path.join(out, "v1")); assert.deepEqual(validateTree(tree, { phase: "full" }).problems, []);
  for (const f of tree.files()) assert.equal(sha256Hex(tree.read(f)), pulled.files.get(`v1/${f}`), f);
  const man = JSON.parse(tree.read("manifest.json")) as { files: [string, number, string][] }; assert.ok(man.files.length > 20);
  for (const [rel, , prefix] of man.files) assert.equal(all.get(`v1/${rel}`)?.slice(0, prefix.length), prefix, `manifest sha prefix of ${rel}`);
  assert.equal(sha256Hex(JSON.stringify(p1)), sha256Hex(pulled.pointer!)); assert.ok(pulled.status);
  const state = await store.readState(); assert.ok(state["slugs.tsv"] && state["oracles.tsv"] && state["sets.tsv"], "the write-once state is backed up in state/ rows"); assert.ok(Object.keys(state).some((k) => /^d\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.json$/.test(k)), "and so is the history delta");
  const restored = await restoreStateNeon(store); assert.ok(restored && restored.slugById.size > 5);
  // second publish, one file changed (phase catalog, a later day): only what changed is written
  const marker = ((await prisma.$queryRawUnsafe(`SELECT clock_timestamp() AS t`)) as { t: Date }[])[0]!.t;
  let removed = ""; const victim = tree.files().find((f) => /^st\//.test(f)) ?? tree.files().find((f) => /^sl\/d\//.test(f));
  const b = await publish(inputOf(1, "full", work, (tr) => { if (victim) { removed = victim; tr.remove(victim); } }));
  assert.equal(b.kind, "published");
  const touched = ((await prisma.$queryRawUnsafe(`SELECT path FROM "${PLANE_TABLE}" WHERE "updatedAt" > $1 ORDER BY path`, marker)) as { path: string }[]).map((r) => r.path);
  assert.ok(touched.length > 0 && touched.length < all.size * 0.8, `${touched.length} of ${all.size} rows rewritten: unchanged files keep their rows`);
  assert.ok(touched.includes("v1/status.json") && touched.includes("v1/manifest.json") && touched.includes(POINTER_ROW));
  const after = await rows(); if (removed) assert.equal(after.has(`v1/${removed}`), false, "a removed path is deleted from the table");
  assert.equal((await pointerRow()).seq, 2);
  // an identical rebuild rewrites nothing but the bookkeeping
  const marker2 = ((await prisma.$queryRawUnsafe(`SELECT clock_timestamp() AS t`)) as { t: Date }[])[0]!.t;
  const c = await publish(inputOf(1, "full", work, (tr) => { if (removed) tr.remove(removed); })); assert.equal(c.kind, "published");
  const touched2 = ((await prisma.$queryRawUnsafe(`SELECT path FROM "${PLANE_TABLE}" WHERE "updatedAt" > $1 ORDER BY path`, marker2)) as { path: string }[]).map((r) => r.path).filter((p) => !p.startsWith("state/"));
  assert.ok(touched2.every((p) => ["v1/status.json", "v1/manifest.json", "status.json", POINTER_ROW].includes(p)), `only bookkeeping rewritten, got ${touched2.slice(0, 5).join(", ")}`);
});

test("ATOMICITY: a failure in the middle of the upload, or after the upload and before the flip, leaves the previous tree serving whole; the pointer row is the last write; the next publish clears the debris", async (t) => {
  if (!need(t)) return;
  const work = tmp(); const before0 = await rows(); const ptr0 = await pointerRow();
  const reader = new NeonPlane({ sql: async () => sql }); const src = reader.source(ptr0);
  const sets0 = JSON.stringify(await src.json("meta/sets.json"));
  // (1) the first batch commits, then the process "dies"
  await assert.rejects(publish(inputOf(2, "full", work, (tr) => { for (const f of tr.files().filter((x) => /^px\//.test(x)).slice(0, 4)) tr.write(f, tr.read(f).replace(/\]/, "]")); tr.write("meta/extra-big.json", JSON.stringify({ pad: "x".repeat(900_000) })); tr.write("meta/extra-big2.json", JSON.stringify({ pad: "y".repeat(900_000) })); }, { hooks: { afterBatch: () => { throw new Error("simulated crash mid-upload"); } } })), /simulated crash mid-upload/);
  const mid = await rows(); assert.ok([...mid.keys()].some((p) => p.startsWith(STAGE_PREFIX)), "the first batch is staged");
  for (const [p, sha] of before0) assert.equal(mid.get(p), sha, `${p} is untouched`);
  assert.equal((await pointerRow()).seq, ptr0.seq, "the pointer row did not move"); assert.equal(JSON.stringify(await reader.source(await pointerRow()).json("meta/sets.json")), sets0);
  // (2) everything staged and verified, the process dies right before the flip
  await assert.rejects(publish(inputOf(2, "full", work, undefined, { hooks: { afterCommitA: () => { throw new Error("simulated crash before the pointer"); } } })), /before the pointer/);
  const mid2 = await rows(); for (const [p, sha] of before0) assert.equal(mid2.get(p), sha, `${p} is untouched`); assert.equal((await pointerRow()).seq, ptr0.seq);
  // (3) the next publish clears the stage and lands
  const ok = await publish(inputOf(2, "full", work)); assert.equal(ok.kind, "published"); assert.equal((await pointerRow()).seq, ptr0.seq + 1);
  assert.ok([...(await rows()).keys()].every((p) => !p.startsWith(STAGE_PREFIX)));
});

test("a REFUSAL writes only the status row and leaves the pointer and the tree alone", async (t) => {
  if (!need(t)) return;
  const work = tmp(); const ptr0 = await pointerRow(); const before0 = await rows();
  const r = await publish(inputOf(3, "full", work, (tr) => { const f = tr.files().find((x) => x.startsWith("px/"))!; const j = JSON.parse(tr.read(f)); j.p.pop(); tr.write(f, JSON.stringify(j)); }));
  assert.equal(r.kind, "refused"); assert.equal((await pointerRow()).seq, ptr0.seq);
  const after0 = await rows(); for (const [p, sha] of before0) if (p !== "status.json") assert.equal(after0.get(p), sha, p);
  const st = JSON.parse((await store.get("status.json"))!.text) as { refusals: unknown[]; runs: { kind: string }[] }; assert.ok(st.refusals.length >= 1); assert.equal(st.runs[0]!.kind, "refused");
});

test("READER: manifest-keyed LRU, no query for a hit or for a path the manifest rules out, an unchanged file survives a publish, stale-while-error on the pointer and the files", async (t) => {
  if (!need(t)) return;
  let down = false; let queries = 0;
  const flaky: PlaneSql = { ...sql, all: async (q, ...p) => { if (down) throw new Error("connection refused"); queries++; return sql.all(q, ...p); }, tx: sql.tx, run: sql.run, close: sql.close };
  const neon = new NeonPlane({ sql: async () => flaky, timeoutMs: 2000 }); let now = 1_000_000;
  const reader = new PointerReader({ ...neon.pointerEnv(), now: () => now }, { memoMs: 60_000 });
  const s1 = await reader.get(); assert.equal(s1.source, "fresh"); const p1 = s1.ptr!;
  const src = neon.source(p1); const q0 = queries;
  const cat = (await src.json<{ sets: unknown[] }>("meta/sets.json")); assert.ok(cat.sets.length > 2); const afterFirst = queries; assert.ok(afterFirst - q0 <= 3, "manifest + file");
  await src.json("meta/sets.json"); await src.text("meta/sets.json"); assert.equal(queries, afterFirst, "a repeat read is an LRU hit: no query");
  await assert.rejects(src.json("cat/999/none.json"), (e: unknown) => e instanceof PlaneError && e.reason === "missing"); assert.equal(queries, afterFirst, "a path the manifest does not list is missing without a query");
  // coalescing: ten concurrent reads of one cold file are one query
  const cold = (await store.shas("v1/px/")).keys().next().value as string; const rel = cold.slice(3); const q1 = queries;
  await Promise.all(Array.from({ length: 10 }, () => src.json(rel))); assert.equal(queries - q1, 1, "request coalescing");
  // the pointer is re-read at most every 60 seconds
  const q2 = queries; now += 59_000; await reader.get(); assert.equal(queries, q2, "inside the 60 s window the memo answers"); now += 2_000; const s2 = await reader.get(); assert.equal(s2.source, "fresh"); assert.equal(queries, q2 + 1);
  // stale-while-error: Neon goes away; the last good pointer keeps serving, cached files are served, an uncached one is a PlaneError, never a wrong answer
  down = true; now += 120_000; const s3 = await reader.get(); assert.equal(s3.ptr!.ref, p1.ref); assert.ok(s3.source === "stale" || s3.source === "memo"); assert.equal(s3.lastError, "http");
  assert.ok((await src.json<{ sets: unknown[] }>("meta/sets.json")).sets.length > 2, "a cached file is served with the database down");
  const uncached = (await store.shas("v1/px/")).keys(); let hit = false; for (const k of uncached) { const r = k.slice(3); try { await src.json(r); } catch (e) { hit = true; assert.ok(e instanceof PlaneError && (e.reason === "http" || e.reason === "timeout"), String(e)); break; } }
  assert.ok(hit, "some px file was not cached and failed with PlaneError");
  down = false; now += 120_000; assert.equal((await reader.get()).source, "fresh", "and it recovers by itself");
  // a new publish: the pointer moves, an UNCHANGED file is served from the LRU without a query
  const work = tmp(); await publish(inputOf(4, "full", work)); const p2 = (await (async () => { now += 61_000; return reader.get(); })()).ptr!; assert.ok(p2.seq > p1.seq); assert.notEqual(p2.ref, p1.ref);
  const src2 = neon.source(p2); const q3 = queries; await src2.json("meta/sets.json"); const used = queries - q3; assert.ok(used <= 2, `meta/sets.json at the new pointer cost ${used} query(ies): the manifest only`);
  // the build reads nothing
  const building = new NeonPlane({ sql: async () => flaky, buildPhase: true }); await assert.rejects(building.source(p2).json("meta/sets.json"), (e: unknown) => e instanceof PlaneError && e.reason === "build");
  await assert.rejects(building.pointerEnv().fetchPointer());
});

test("REAL LOADERS over the published bootstrap tree: Lightning Bolt, the price guide, a set page and the browse index, read back through src/lib/data from Neon; every file round-trips by sha", async (t) => {
  if (!need(t)) return;
  const boot = path.resolve(__dirname, "..", ".data", "v1"); const real = fs.existsSync(path.join(boot, "cat")) ? fsTree(boot) : realMiniTree();
  console.log(`plane-neon-backend: publishing ${fs.existsSync(path.join(boot, "cat")) ? "the bootstrap tree .data" : "the real-data mini tree"} (${real.files().length} files)`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${PLANE_TABLE}"`);
  const status = (real.has("status.json") ? JSON.parse(real.read("status.json")) : {}) as { counts?: Record<string, number> };
  const work = tmp(); const t0 = Date.now();
  const res = await publish({
    remote: "", workdir: work, phase: "catalog", priceDay: JSON.parse(real.has("status.json") ? real.read("status.json") : "{}").pointer?.priceDay ?? "2026-10-08", tcgcsv: "t", scryfall: "s", repo: "x/y", store,
    build: async (tree) => { for (const f of real.files()) if (f !== "manifest.json" && f !== "status.json") tree.write(f, real.read(f)); const v = validateTree(tree, { phase: "catalog" }); return { counts: { cards: v.counts.cards, units: v.counts.tracked, files: v.counts.files }, histCut: isoOf(MINI_CUT) > "" && real.has("status.json") ? (JSON.parse(real.read("status.json")).pointer?.histCut ?? isoOf(MINI_CUT)) : isoOf(MINI_CUT), prevCounts: null, status: { counts: status.counts as never } }; },
  });
  assert.equal(res.kind, "published", res.kind === "refused" ? res.problems.slice(0, 3).map((p) => p.message).join(" | ") : ""); console.log(`plane-neon-backend: first publish ${Date.now() - t0} ms`);
  // sha round trip, every data file
  const out = tmp(); const pulled = await store.pullTo(out, { clean: true }); const back = fsTree(path.join(out, "v1"));
  let n = 0; for (const f of real.files()) { if (f === "manifest.json" || f === "status.json") continue; assert.equal(pulled.files.get(`v1/${f}`), sha256Hex(real.read(f)), f); assert.equal(back.read(f), real.read(f)); n++; }
  assert.equal(back.files().filter((f) => f !== "manifest.json" && f !== "status.json").length, n, "no extra file");
  // a second publish of the same tree writes nothing but bookkeeping
  const marker = ((await prisma.$queryRawUnsafe(`SELECT clock_timestamp() AS t`)) as { t: Date }[])[0]!.t;
  const again = await publish({ remote: "", workdir: work, phase: "catalog", priceDay: (JSON.parse(await fs.promises.readFile(path.join(out, "status.json"), "utf8")) as { pointer: { priceDay: string } }).pointer.priceDay, tcgcsv: "t", scryfall: "s", repo: "x/y", store,
    build: async (tree) => { const v = validateTree(tree, { phase: "catalog" }); return { counts: { cards: v.counts.cards, units: v.counts.tracked, files: v.counts.files }, histCut: (JSON.parse(real.has("status.json") ? real.read("status.json") : "{}").pointer?.histCut ?? isoOf(MINI_CUT)), prevCounts: null, status: { counts: status.counts as never } }; } });
  assert.equal(again.kind, "published");
  const touched = ((await prisma.$queryRawUnsafe(`SELECT path FROM "${PLANE_TABLE}" WHERE "updatedAt" > $1`, marker)) as { path: string }[]).map((r) => r.path).filter((p) => !p.startsWith("state/"));
  assert.ok(touched.every((p) => ["v1/status.json", "v1/manifest.json", "status.json", POINTER_ROW].includes(p)), `second publish of the same tree rewrote ${touched.length} rows: ${touched.slice(0, 4).join(", ")}`);
  const total = ((await prisma.$queryRawUnsafe(`SELECT sum(length(body))::bigint AS b, count(*)::int AS n FROM "${PLANE_TABLE}"`)) as { b: bigint; n: number }[])[0]!; console.log(`plane-neon-backend: ${total.n} rows, ${(Number(total.b) / 1048576).toFixed(1)} MB gzip`);
  // the real loaders, through the runtime singleton, from Neon
  resetPlaneForTests(); const data = await import("../src/lib/data");
  const ptr = await data.getDataRef(); assert.ok(ptr && ptr.repo === "neon/plane" && ptr.seq === 2, JSON.stringify(ptr));
  if (fs.existsSync(path.join(boot, "cat"))) {
    const bolt = await data.getCardDetail("lightning-bolt-sld-1638"); assert.equal(bolt?.name, "Lightning Bolt");
    const guide = await data.getCardPage({ q: "lightning bolt", page: 1 } as never); assert.ok(guide.total > 5 && guide.items.some((c) => c.name === "Lightning Bolt"));
  }
  const sets = await data.getSets(); assert.ok(sets.length > 5); const mh3 = sets.find((s) => /modern horizons 3/i.test(s.name)) ?? sets[0]!; const page = await data.getSetBySlug(mh3.slug); assert.equal(page?.slug, mh3.slug);
  const ix = await data.getBrowseIndex(); assert.ok(ix.n > 40); assert.equal(await data.getBrowseIndex(), ix, "built once per instance per pointer");
  const list = await data.getCardPage({ page: 1 } as never); assert.ok(list.items.length > 0 && list.total >= list.items.length);
  const health = (await import("../src/lib/data/plane/runtime")).planeHealth(); assert.equal(health.hostUsed, "neon"); assert.equal(health.seq, 2);
  const st = await data.getPlaneStatus(); assert.ok(st && st.counts.sets > 5);
  resetPlaneForTests();
});

test("tables created by hand are not required: ensureSchema is idempotent and the pointer row is absent before the first publish", async (t) => {
  if (!need(t)) return;
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${PLANE_TABLE}"`);
  assert.equal(await store.tableExists(), false); await store.ensureSchema(); await store.ensureSchema(); assert.equal(await store.tableExists(), true); assert.equal(await store.pointerText(), null);
  const neon = new NeonPlane({ sql: async () => sql }); await assert.rejects(neon.pointerEnv().fetchPointer(), /no pointer row/);
  assert.equal(createHash("sha256").update("x").digest("hex"), sha256Hex("x")); assert.equal(unpack(Buffer.from(require("node:zlib").gzipSync("ok"))), "ok");
});

test("THE IMPORTER over the Neon backend (the default): phase 1 publishes the real mini day into the table, a retry says already-published, the pointer and the pulled tree agree, and a forced re-run restores the write-once state from the table", async (t) => {
  if (!need(t)) return;
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${PLANE_TABLE}"`);
  const tr = tmpRoot(); const quiet = console.log; try {
    const day = miniMagicDay(tr.root); const env = importEnv(tr.root, day); delete (env as Record<string, string | undefined>).PLANE_REPO; env.DATABASE_URL = DB_URL;
    console.log = () => undefined; const a = await runImport({ phase: "catalog", env, skipHook: true, store }); console.log = quiet;
    assert.equal((a.outcome as { kind: string }).kind, "published"); const p = await pointerRow(); assert.equal(p.seq, 1); assert.equal(p.repo, "neon/plane"); assert.equal(p.phase, "catalog");
    console.log = () => undefined; const b = await runImport({ phase: "catalog", env, skipHook: true, store }); console.log = quiet; assert.equal(b.outcome, "already-published"); assert.equal((await pointerRow()).seq, 1);
    const out = path.join(tr.root, "pulled"); const r = await pullPlane(store, out); assert.equal(r.pointer?.ref, p.ref); assert.ok(r.files > 300, `${r.files} files`);
    assert.deepEqual(validateTree(fsTree(path.join(out, "v1")), { phase: "catalog" }).problems, []); assert.ok(fs.existsSync(path.join(out, "latest.json")) && fs.existsSync(path.join(out, "status.json")));
    // the write-once state is in the table: wipe the tree rows, keep state/, and the importer restores slugs from it (the phase-1 build then sees an empty tree)
    const before = await restoreStateNeon(store); assert.ok(before && before.slugById.size > 20);
    console.log = () => undefined; const c = await runImport({ phase: "catalog", env: { ...env, IMPORT_FORCE: "1" }, skipHook: true, store }); console.log = quiet; assert.equal((c.outcome as { kind: string }).kind, "published"); assert.equal((await pointerRow()).seq, 2);
  } finally { console.log = quiet; tr.done(); }
});
