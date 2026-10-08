// THE IMPORTER READS NOTHING FROM NEON (owner addendum 9; critique DP-02, budget 11/12). Its memory of last time is rebuilt from a checkout of the pointed data commit, and the write-once rules (C3) are checked against it BEFORE a publish:
// no slug changes, no catalogue row disappears, no oracle ordinal moves, no set token changes. Owner WP01b.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportState, parseState } from "../src/lib/data/plane/state-backup";
import { restoreState } from "../src/lib/data/plane/publisher";
import { loadPrevState, writeOnceProblems } from "../src/lib/data/plane/prevstate";
import { cloneToMem, fsTree, memTree } from "../src/lib/data/plane/tree";
import { publish } from "../src/lib/data/plane/publisher";
import { miniCards, miniFull } from "./helpers/plane-tree";
import { builder, checkout, head, input, mk, sh } from "./helpers/publish-harness";

test("an empty checkout is an empty memory: a first run has nothing to protect", () => {
  const p = loadPrevState(memTree()); assert.equal(p.empty, true); assert.equal(p.slugById.size, 0); assert.deepEqual(writeOnceProblems(p, miniFull({ day: 0 })), []);
});
test("loadPrevState recovers the slugs, masks, oracle ordinals, set tokens, group hold rows, config and the gate from the published files alone", () => {
  const day2 = miniFull({ day: 2 }); const t = cloneToMem(day2);
  t.write("status.json", JSON.stringify({ v: 1, pointer: { seq: 7, ref: "a".repeat(40), priceDay: "2026-01-03", phase: "full", histCut: "2026-01-01" }, config: { trackConfigHash: "h1", guardTrips: { flagChange: 2 } }, groups: [[24770, 80, 78], [92, 4006, 3928]] }));
  const p = loadPrevState(t); const cs = miniCards({ day: 2 });
  assert.equal(p.empty, false); assert.equal(p.slugById.size, cs.length); assert.equal(p.maskById.size, cs.length);
  for (const c of cs.slice(0, 50)) { assert.equal(p.slugById.get(c.id), c.slug); assert.equal(p.maskById.get(c.id), c.mask); }
  assert.ok(p.oracleNoBySlug.size > 0 && p.oracleNoBySlug.get("oracle-1") === 1 && p.slugByOracleNo.get(1) === "oracle-1");
  assert.equal(p.tokBySetId.get(100), "s100"); assert.equal(p.setSlugById.get(101), "set-101");
  assert.equal(p.lastDay, "2026-01-03"); assert.equal(p.seq, 7); assert.equal(p.phase, "full"); assert.equal(p.histCut, "2026-01-01"); assert.equal(p.configHash, "h1"); assert.equal(p.guardTrips, 2);
  assert.deepEqual([...p.groups.entries()], [[24770, [80, 78]], [92, [4006, 3928]]]);
});
test("the write-once rules: a changed slug, a deleted row, a moved oracle ordinal and a changed set token are each reported; new rows and changed prices are not", () => {
  const prev = loadPrevState(miniFull({ day: 1 }));
  assert.deepEqual(writeOnceProblems(prev, miniFull({ day: 2 })), [], "prices drift every day and the tracked set moves: none of that is a violation");
  const first = (t: ReturnType<typeof cloneToMem>, pre: string) => t.files().find((f) => f.startsWith(pre))!;
  const slug = cloneToMem(miniFull({ day: 2 })); { const f = first(slug, "cat/"); const j = JSON.parse(slug.read(f)); j.c[0][1] = "renamed"; slug.write(f, JSON.stringify(j)); }
  assert.deepEqual(writeOnceProblems(prev, slug).map((p) => p.code), ["SLUG_CHANGED"]);
  const del = cloneToMem(miniFull({ day: 2 })); { const f = first(del, "cat/"); const j = JSON.parse(del.read(f)); j.c.shift(); del.write(f, JSON.stringify(j)); }
  assert.deepEqual(writeOnceProblems(prev, del).map((p) => p.code), ["ROW_DELETED"]);
  const ora = cloneToMem(miniFull({ day: 2 })); { const f = first(ora, "or/"); const j = JSON.parse(ora.read(f)); j.o[0][0] = j.o[0][0] + 100_000; ora.write(f, JSON.stringify(j)); }
  assert.ok(writeOnceProblems(prev, ora).some((p) => p.code === "ORACLE_MOVED"));
  const set = cloneToMem(miniFull({ day: 2 })); { const j = JSON.parse(set.read("meta/sets.json")); j.sets[0][2] = "zzz"; set.write("meta/sets.json", JSON.stringify(j)); }
  assert.deepEqual(writeOnceProblems(prev, set).map((p) => p.code), ["SET_TOK_CHANGED"]);
  const added = cloneToMem(miniFull({ day: 2 })); { const f = first(added, "cat/"); const j = JSON.parse(added.read(f)); const row = [...j.c[0]]; row[0] = 999_999_999; row[1] = "brand-new"; j.c.push(row); added.write(f, JSON.stringify(j)); }
  assert.deepEqual(writeOnceProblems(prev, added), [], "a new product is the normal case");
});
test("the PUBLISHER enforces them: a build that renames a slug or drops a row is REFUSED before the data commit and the pointer stays", async () => {
  const m = mk(); try {
    const a = await publish(input(m, 0, "full")); assert.equal(a.kind, "published"); const good = head(m);
    const rename = await publish(input(m, 1, "full", { build: builder(1, "full", (t) => { const f = t.files().find((x) => x.startsWith("cat/"))!; const j = JSON.parse(t.read(f)); j.c[0][1] = "renamed-slug"; t.write(f, JSON.stringify(j)); }) }));
    assert.equal(rename.kind, "refused"); assert.ok((rename as { problems: { code: string }[] }).problems.some((p) => p.code === "SLUG_CHANGED")); assert.equal(head(m).ref, good.ref);
    const ok = await publish(input(m, 1, "full")); assert.equal(ok.kind, "published", "the next honest run succeeds");
    // THE MEMORY OF THE LIVE CHECKOUT equals what the importer would have held in memory: the state restored from the pointed commit is the state after the last publish
    const p = loadPrevState(checkout(m, head(m).ref)); assert.ok(p.slugById.size > 600); assert.equal(p.seq, 2, "status.json inside the pointed tree carries the pointer of its own publish"); assert.equal(p.phase, "full"); assert.ok(p.configHash === null || typeof p.configHash === "string");
    assert.equal(p.lastDay, "2026-01-02", "the gate of the next run: yesterday's price day");
  } finally { m.done(); }
});
test("REAL TREE (PLANE_SAMPLE_DIR): the lab's S3 tree restores 98,991 slugs and masks, 33,447 oracle ordinals, 439 set tokens in well under a second", { skip: !process.env.PLANE_SAMPLE_DIR }, () => {
  const t0 = performance.now(); const p = loadPrevState(fsTree(process.env.PLANE_SAMPLE_DIR!)); const ms = performance.now() - t0;
  assert.ok(p.slugById.size > 90_000 && p.maskById.size === p.slugById.size && p.oracleNoBySlug.size > 30_000 && p.tokBySetId.size > 400, `${p.slugById.size} slugs`);
  console.log(`previous state: ${p.slugById.size} slugs, ${p.oracleNoBySlug.size} oracles, ${p.tokBySetId.size} sets in ${ms.toFixed(0)} ms, heap ${(process.memoryUsage().heapUsed / 1048576).toFixed(0)} MB`); assert.ok(ms < 3000);
  assert.deepEqual(writeOnceProblems(p, fsTree(process.env.PLANE_SAMPLE_DIR!)), [], "a tree is consistent with its own memory");
});

// ── DP-17: the second copy of the write-once state ───────────────────────────────────────────────────────────────────────────────────────────────────
test("exportState is deterministic and sorted, and parseState(exportState(x)) restores slugs, ordinals and tokens exactly (tabs and newlines in a slug survive)", () => {
  const p = loadPrevState(miniFull({ day: 2 })); p.slugById.set(5, "weird\tslug\\n"); const a = exportState(p), b = exportState(p); assert.deepEqual(a, b);
  const ids = a["slugs.tsv"].split("\n").filter(Boolean).map((l) => Number(l.split("\t")[0])); assert.deepEqual(ids, [...ids].sort((x, y) => x - y));
  const q = parseState(a); assert.deepEqual([...q.slugById], [...p.slugById].sort((x, y) => x[0] - y[0])); assert.deepEqual([...q.oracleNoBySlug].sort(), [...p.oracleNoBySlug].sort()); assert.deepEqual([...q.tokBySetId], [...p.tokBySetId].sort((x, y) => x[0] - y[0])); assert.deepEqual([...q.setSlugById], [...p.setSlugById].sort((x, y) => x[0] - y[0]));
});
test("every publish appends the state to the append-only branch `state` as a small delta; losing branch `data` loses no URL: the restored memory refuses a renamed slug and accepts the same rows", async () => {
  const m = mk(); try {
    await publish(input(m, 0, "full")); await publish(input(m, 1, "full")); await publish(input(m, 2, "full"));
    const git = (...a: string[]) => sh(m.root, "--git-dir", m.remote, ...a);
    assert.equal(git("log", "--format=%s", "state").split("\n").length, 3, "one state commit per published day: its daily delta file");
    assert.equal(git("log", "--format=%h", "state", "--", "slugs.tsv").split("\n").filter(Boolean).length, 1, "slugs.tsv is committed once: no slug changed between the days");
    assert.ok(git("ls-tree", "-r", "--name-only", "state").split("\n").includes("d/2026/01/2026-01-03.json"), "the delta file of the third day exists");
    assert.equal(JSON.parse(git("show", "state:d/2026/01/2026-01-01.json")).full, true, "the first publish is a FULL history file: a rebuild can start there");
    // a new oracle on day 3 (nothing references it, so the tree stays valid): ONE new line in oracles.tsv, one new state commit
    await publish(input(m, 3, "full", { build: builder(3, "full", (t) => { const f = t.files().find((x) => x.startsWith("or/"))!; const j = JSON.parse(t.read(f)); const row = [...j.o[0]]; row[0] = 999_999 * 512 + Number(f.match(/(\d+)\.json/)![1]) ; row[2] = "oracle-state-test"; j.o.push(row); t.write(f, JSON.stringify(j)); }) }));
    assert.equal(git("log", "--format=%s", "state").split("\n").length, 4); assert.equal(git("log", "--format=%h", "state", "--", "oracles.tsv").split("\n").filter(Boolean).length, 2, "oracles.tsv gained exactly one commit with one new line"); assert.match(git("diff", "--shortstat", "state~1", "state", "--", "oracles.tsv"), /1 file changed, 1 insertion/);
    // the disaster: branch data is gone
    sh(m.root, "--git-dir", m.remote, "branch", "-D", "data"); const restored = restoreState(m.remote, path.join(m.root, "restore"))!; assert.ok(restored.slugById.size > 600 && restored.oracleNoBySlug.has("oracle-state-test"));
    const t = cloneToMem(miniFull({ day: 3 })); assert.deepEqual(writeOnceProblems(restored, t).map((w) => w.code), [], "today's catalogue agrees with the restored memory");
    const renamed = cloneToMem(t); { const f = renamed.files().find((x) => x.startsWith("cat/"))!; const j = JSON.parse(renamed.read(f)); j.c[0][1] = "re-slugged"; renamed.write(f, JSON.stringify(j)); }
    assert.ok(writeOnceProblems(restored, renamed).some((w) => w.code === "SLUG_CHANGED"));
  } finally { m.done(); }
  assert.equal(restoreState("/nonexistent/remote.git", path.join(os.tmpdir(), "no-state")), null);
});
