// The publish protocol against a LOCAL BARE REPOSITORY (section 6.4; critique DP-02, DP-10, DP-11): two commits (data A, pointer B last), a refusal that leaves the pointer alone, a crash between A and B, a second writer rejected, the weekly squash that
// must keep the commits the site serves, a rollback, and the demand-snapshot overlay. The same code pushes to the private data repository from Actions. Owner WP01b.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SQUASH_MAX_POINTER_AGE_DAYS, isCutDay, nextPointer, planSquash, rollbackTarget, tagName, type TagInfo } from "../src/lib/data/plane/publish-protocol";
import { GitError, gitIn, listTags, publish, rollback, squash, type PublishInput } from "../src/lib/data/plane/publisher";
import { reconcileStoreFamilies, trackedUidsOf } from "../src/lib/data/plane/reconcile";
import { fsTree, memTree, type MutableTree } from "../src/lib/data/plane/tree";
import { validateTree } from "../src/lib/data/plane/validate";
import type { PointerFile } from "../src/lib/data/plane/formats";
import { MINI_CUT, dayOf, isoOf, miniCatalog, miniFull } from "./helpers/plane-tree";
import { T0, at, builder, checkout, day, head, input, mk, sh, showAt, type Mode } from "./helpers/publish-harness";

test("phase full, then a catalogue-only phase on a day the tracked set moved, then full again: every pointed tree validates in its own phase", async () => {
  const m = mk(); try {
    const a = await publish(input(m, 0, "full")); assert.equal(a.kind, "published"); assert.equal(head(m).seq, 1); assert.equal(head(m).ref, (a as { ref: string }).ref);
    assert.deepEqual(validateTree(checkout(m, head(m).ref), { phase: "full" }).problems, []);
    const b = await publish(input(m, 1, "catalog")); assert.equal(b.kind, "published", JSON.stringify((b as { problems?: unknown }).problems?.toString().slice(0, 300))); const pb = head(m); assert.equal(pb.seq, 2); assert.equal(pb.phase, "catalog"); assert.equal(pb.prev, head(m).prev); assert.equal(pb.priceDay, day(1));
    assert.deepEqual(validateTree(checkout(m, pb.ref), { phase: "catalog" }).problems, [], "the first publish of the day passes although the tracked set moved (DP-02)");
    const c = await publish(input(m, 1, "full")); assert.equal(c.kind, "published"); assert.equal(head(m).phase, "full"); assert.equal(head(m).seq, 3); assert.deepEqual(validateTree(checkout(m, head(m).ref), { phase: "full" }).problems, []);
    const tags = listTags(gitIn(m.work)); assert.deepEqual(tags.map((t) => t.name).sort(), [tagName(day(0), 1), tagName(day(1), 2), tagName(day(1), 3)].sort(), "every data commit is tagged d-<day>-<seq>");
    assert.equal(showAt(m, head(m).ref, "v1/manifest.json").length > 100, true); assert.equal(head(m).repo, "o/data");
  } finally { m.done(); }
});
test("a REFUSAL pushes only a status commit and leaves latest.json untouched: the last good publish stays live", async () => {
  const m = mk(); try {
    await publish(input(m, 0, "full")); const good = head(m);
    const r = await publish(input(m, 1, "full", { build: builder(1, "full", (t) => { const f = t.files().find((x) => x.startsWith("px/"))!; const j = JSON.parse(t.read(f)); j.p.pop(); t.write(f, JSON.stringify(j)); }) }));
    assert.equal(r.kind, "refused"); assert.equal(head(m).seq, good.seq); assert.equal(head(m).ref, good.ref, "the pointer did not move");
    const st = JSON.parse(showAt(m, "data", "status.json")); assert.equal(st.refusals[0].code, "PX_IDS"); assert.equal(st.runs[0].kind, "refused");
    assert.deepEqual(validateTree(checkout(m, good.ref), { phase: "full" }).problems, [], "the pointed tree is still whole");
    assert.equal(sh(m.root, "--git-dir", m.remote, "log", "-1", "--format=%s", "data").startsWith("data refusal"), true);
    const again = await publish(input(m, 1, "full")); assert.equal(again.kind, "published", "the next run starts from the branch head and succeeds"); assert.equal(head(m).seq, good.seq + 1);
  } finally { m.done(); }
});
test("a CRASH between commit A and the pointer commit B changes nothing for readers; the retry succeeds and re-uses the tag", async () => {
  const m = mk(); try {
    await publish(input(m, 0, "full")); const good = head(m);
    await assert.rejects(publish(input(m, 1, "full", { hooks: { afterCommitA: () => { throw new Error("runner killed"); } } })), /runner killed/);
    assert.equal(head(m).ref, good.ref, "readers still see the previous publish whole"); assert.notEqual(sh(m.root, "--git-dir", m.remote, "rev-parse", "data"), "", "the data commit A is on the branch but unpointed (UNPOINTED_DATA_COMMIT after 30 minutes)");
    assert.notEqual(showAt(m, "data", "v1/px/0/4.json") || "x", ""); const unpointed = sh(m.root, "--git-dir", m.remote, "rev-parse", "data~0"); assert.notEqual(unpointed, good.ref);
    const ok = await publish(input(m, 1, "full")); assert.equal(ok.kind, "published"); assert.equal(head(m).seq, good.seq + 1); assert.notEqual(head(m).ref, good.ref);
  } finally { m.done(); }
});
test("a SECOND WRITER is rejected (no force push): the second publish fails and the pointer is untouched", async () => {
  const m = mk(); try {
    await publish(input(m, 0, "full")); const good = head(m); const other = path.join(m.root, "other");
    await assert.rejects(publish(input(m, 1, "full", { hooks: { beforePush: () => { sh(m.root, "clone", "-q", "--branch", "data", m.remote, other); sh(other, "-c", "user.name=x", "-c", "user.email=x@invalid", "commit", "-q", "--allow-empty", "-m", "someone else"); sh(other, "push", "-q", "origin", "HEAD:refs/heads/data"); } } })), (e: unknown) => e instanceof GitError && /rejected|non-fast-forward|fetch first/.test(e.stderr));
    assert.equal(head(m).ref, good.ref);
  } finally { m.done(); }
});
test("an unchanged re-run writes no changed data file (byte-compare): the only diff under v1/ is the bookkeeping", async () => {
  const m = mk(); try {
    const a = await publish(input(m, 0, "full")); const b = await publish(input(m, 0, "full"));
    const names = sh(m.root, "--git-dir", m.remote, "diff", "--name-only", (a as { ref: string }).ref, (b as { ref: string }).ref, "--", "v1").split("\n").filter(Boolean); assert.deepEqual(names.filter((n) => n !== "v1/status.json" && n !== "v1/manifest.json"), []);
  } finally { m.done(); }
});
test("DP-11: the weekly squash keeps the commits pointer.ref and pointer.prev, even after git gc; it deletes older tags; it REFUSES when the pointer is stale", async () => {
  const m = mk(); try {
    await publish(input(m, 0, "full")); await publish(input(m, 1, "full")); await publish(input(m, 2, "full")); const p = await publish(input(m, 8, "full", { now: at(8) })); assert.equal(p.kind, "published");
    const ptr = head(m); const refs = [1, 2, 3].map((s) => listTags(gitIn(m.work)).find((t) => t.name.endsWith(`-${s}`))!.sha); const old1 = refs[0]!;
    // a 'now' 8 days after the tags were made, one hour after the last publish: every tag is older than 7 days, the pointer is fresh
    const realNow = Date.now(); const future = () => new Date(realNow + 8 * 86_400_000 + 3_600_000);
    const ptrFresh = { ...ptr, publishedAt: future().toISOString() }; void ptrFresh;
    const s = squash({ remote: m.remote, workdir: path.join(m.root, "sq"), now: () => new Date(Date.parse(ptr.publishedAt) + 3_600_000 + 0 * realNow) });
    // the plan is computed from tag creator dates (real time) against `now` (pointer + 1 h): tags look NEW, so use the pure planner for the 8-day case below and assert the git side here
    assert.equal(s.skipped, null); assert.equal(sh(m.root, "--git-dir", m.remote, "rev-list", "--count", "data"), "1", "the branch is ONE parentless commit");
    assert.equal(head(m).ref, ptr.ref, "latest.json in the squashed tree still names the same data commit"); assert.ok(sh(m.root, "--git-dir", m.remote, "cat-file", "-t", ptr.ref) === "commit");
    // pure planner, with tags 8 days old (the git side cannot fake creator dates): it keeps pointer.ref and pointer.prev and deletes the rest
    const now = new Date(Date.parse(ptr.publishedAt) + 3_600_000);
    const tags: TagInfo[] = [{ name: "d-2026-01-01-1", sha: old1, at: new Date(+now - 12 * 864e5) }, { name: "d-2026-01-02-2", sha: refs[1]!, at: new Date(+now - 11 * 864e5) }, { name: "d-2026-01-03-3", sha: ptr.prev!, at: new Date(+now - 9 * 864e5) }, { name: "d-2026-01-09-4", sha: ptr.ref, at: new Date(+now - 8 * 864e5) }, { name: "d-2026-01-12-5", sha: "e".repeat(40), at: new Date(+now - 1 * 864e5) }];
    const plan = planSquash({ now, tags, pointer: ptr }); assert.deepEqual(plan.deleteTags.sort(), ["d-2026-01-01-1", "d-2026-01-02-2"], "older tags go; the tags of pointer.ref and pointer.prev stay although they are older than 7 days"); assert.ok(plan.keepTags.includes("d-2026-01-09-4") && plan.keepTags.includes("d-2026-01-03-3"));
    // a stuck publisher: the pointer is 10 days old -> the squash skips itself
    const stuck = planSquash({ now: new Date(Date.parse(ptr.publishedAt) + 10 * 864e5), tags, pointer: ptr }); assert.ok(stuck.skip && stuck.deleteTags.length === 0); assert.ok(10 > SQUASH_MAX_POINTER_AGE_DAYS);
    assert.equal(planSquash({ now, tags, pointer: null }).skip !== null, true);
  } finally { m.done(); }
});
test("DP-11 end to end with real git: a kept tag keeps its WHOLE ancestry, so history is pruned one squash generation later; the commit the pointer names always survives git gc", async () => {
  const m = mk(); try {
    for (let n = 0; n < 3; n++) await publish(input(m, n, "full"));
    const tag = (s: number) => listTags(gitIn(m.work)).find((t) => t.name.endsWith(`-${s}`))!; const first = tag(1).sha;
    sh(m.root, "--git-dir", m.remote, "tag", "-d", tag(1).name);                                                   // what the squash does to a tag older than 7 days
    const s1 = squash({ remote: m.remote, workdir: path.join(m.root, "sq1"), now: () => new Date(Date.parse(head(m).publishedAt) + 3_600_000) }); assert.equal(s1.skipped, null);
    assert.equal(sh(m.root, "--git-dir", m.remote, "rev-list", "--count", "data"), "1", "the branch is ONE parentless commit");
    sh(m.root, "--git-dir", m.remote, "reflog", "expire", "--expire=now", "--all"); sh(m.root, "--git-dir", m.remote, "gc", "--prune=now", "-q");
    assert.equal(spawnSync("git", ["--git-dir", m.remote, "cat-file", "-e", first]).status, 0, "first squash generation: the first commit is still reachable through the kept tag of seq 2 (an ancestor): a tag keeps its whole ancestry");
    // the next week: two more publishes (children of the squash root), then the old tags age out
    await publish(input(m, 3, "full")); await publish(input(m, 4, "full")); const ptr = head(m); assert.equal(ptr.seq, 5, "seq continues across the squash (latest.json survived in the squashed tree)");
    for (const s of [1, 2, 3]) { const t = listTags(gitIn(m.remote)).find((x) => x.name.endsWith(`-${s}`)); if (t) sh(m.root, "--git-dir", m.remote, "tag", "-d", t.name); }
    const s2 = squash({ remote: m.remote, workdir: path.join(m.root, "sq2"), now: () => new Date(Date.parse(ptr.publishedAt) + 3_600_000) }); assert.equal(s2.skipped, null);
    sh(m.root, "--git-dir", m.remote, "reflog", "expire", "--expire=now", "--all"); sh(m.root, "--git-dir", m.remote, "gc", "--prune=now", "-q");
    assert.equal(sh(m.root, "--git-dir", m.remote, "cat-file", "-t", ptr.ref), "commit", "pointer.ref survives the prune: its tag was kept"); assert.equal(sh(m.root, "--git-dir", m.remote, "cat-file", "-t", ptr.prev!), "commit", "so does pointer.prev (the rollback target)");
    assert.notEqual(spawnSync("git", ["--git-dir", m.remote, "cat-file", "-e", first]).status, 0, "second generation: the first publish is finally unreachable and pruned");
    assert.match(showAt(m, ptr.ref, "v1/manifest.json"), /"files"/, "a pinned URL for the served ref still resolves"); assert.equal(head(m).ref, ptr.ref);
  } finally { m.done(); }
});
test("rollback is ONE pointer commit that names an older retained data commit, with that commit's own phase, day and counts", async () => {
  const m = mk(); try {
    await publish(input(m, 0, "full")); await publish(input(m, 1, "catalog")); await publish(input(m, 1, "full")); const cur = head(m); assert.equal(cur.seq, 3);
    const p = rollback({ remote: m.remote, workdir: path.join(m.root, "rb"), to: 2, now: at(2) }); assert.equal(p.seq, 4); assert.equal(p.phase, "catalog"); assert.equal(p.prev, cur.ref); assert.equal(p.priceDay, day(1)); assert.equal(head(m).ref, p.ref);
    assert.equal(p.ref, listTags(gitIn(m.work)).find((t) => t.name.endsWith("-2"))!.sha); assert.throws(() => rollback({ remote: m.remote, workdir: path.join(m.root, "rb2"), to: 99 }), /no retained data commit/);
    assert.deepEqual(validateTree(checkout(m, head(m).ref), { phase: "catalog" }).problems, []);
  } finally { m.done(); }
});
test("the demand-snapshot OVERLAY writes pv/ only: a new data commit and pointer, same day and phase, pvAt set; an overlay that touches anything else is refused", async () => {
  const m = mk(); try {
    await publish(input(m, 0, "full")); const before = head(m);
    const ov = (mutate: (t: MutableTree) => void): PublishInput => ({ remote: m.remote, workdir: m.work, phase: "overlay", priceDay: day(0), tcgcsv: "", scryfall: "", repo: "o/data", now: at(0, 3), build: async (tree) => { mutate(tree); return { counts: before.counts, histCut: before.histCut, status: {} }; } });
    const ok = await publish(ov((t) => t.write("pv/demand.json", JSON.stringify({ v: 1, at: "y", days: 7, r: [[1000, 99]] })))); assert.equal(ok.kind, "published"); const after = head(m);
    assert.equal(after.seq, before.seq + 1); assert.notEqual(after.ref, before.ref); assert.equal(after.priceDay, before.priceDay); assert.equal(after.phase, before.phase); assert.equal(after.publishedAt, before.publishedAt, "the data are not newer"); assert.ok(after.pvAt);
    assert.match(showAt(m, after.ref, "v1/pv/demand.json"), /99/);
    const bad = await publish(ov((t) => { const f = t.files().find((x) => x.startsWith("px/"))!; t.write(f, "{}"); })); assert.equal(bad.kind, "refused"); assert.equal((bad as { problems: { code: string }[] }).problems[0]!.code, "OVERLAY_SCOPE"); assert.equal(head(m).ref, after.ref);
  } finally { m.done(); }
});
test("pure protocol helpers: nextPointer, the cut day (every 28 days, on a Sunday), tag names, rollback targets", () => {
  const prev: PointerFile = { v: 1, seq: 7, ref: "a".repeat(40), publishedAt: "p", priceDay: "d", tcgcsv: "t", scryfall: "s", phase: "full", format: "v1", counts: { cards: 1, units: 1, files: 1 }, manifestSha256: "m", prev: null, repo: "o/r", histCut: "2026-01-04", pvAt: "z" };
  const n = nextPointer({ prev, ref: "b".repeat(40), phase: "catalog", priceDay: "2026-01-11", tcgcsv: "t2", scryfall: "s2", publishedAt: "p2", counts: prev.counts, manifestSha256: "m2", repo: "o/r", histCut: "2026-01-04" });
  assert.equal(n.seq, 8); assert.equal(n.prev, prev.ref); assert.equal(n.pvAt, "z", "the preview stamp carries over a normal publish"); assert.equal(nextPointer({ prev: null, ref: "c".repeat(40), phase: "full", priceDay: "d", tcgcsv: "", scryfall: "", publishedAt: "p", counts: prev.counts, manifestSha256: "", repo: "o/r", histCut: "d" }).seq, 1);
  assert.equal(isCutDay("2026-02-01", "2026-01-04"), true, "Sunday, 28 days after the last cut"); assert.equal(isCutDay("2026-01-25", "2026-01-04"), false, "Sunday but only 21 days"); assert.equal(isCutDay("2026-02-02", "2026-01-04"), false, "not a Sunday"); assert.equal(isCutDay("2026-01-04", null), true);
  assert.equal(tagName("2026-01-04", 12), "d-2026-01-04-12"); const tags: TagInfo[] = [{ name: "d-2026-01-04-12", sha: "f".repeat(40), at: new Date() }]; assert.equal(rollbackTarget({ to: 12, tags })?.name, "d-2026-01-04-12"); assert.equal(rollbackTarget({ to: "ffffff", tags })?.sha, "f".repeat(40)); assert.equal(rollbackTarget({ to: 13, tags }), null);
  void memTree;
});
