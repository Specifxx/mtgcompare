// The publisher's validator and the phase-1 reconciliation (critique DP-02 BLOCKER, DP-19, DP-09 premium guard). Owner WP01b (the tests of the publisher). Runs on the small deterministic tree of tests/helpers/plane-tree.ts and, when PLANE_SAMPLE_DIR points at a
// real published tree (the data-plane lab's 9,488-file S3 tree), on the real thing.
import test from "node:test";
import { upgradeLabTree } from "./helpers/lab-upgrade";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PRICE_MASK } from "../src/lib/constants";
import { cloneToMem, fsTree, memTree, type MutableTree, type TreeView } from "../src/lib/data/plane/tree";
import { validateOverlay, validateTree, isPublishableStoreId, type Phase } from "../src/lib/data/plane/validate";
import { reconcileStoreFamilies, trackedUidsOf } from "../src/lib/data/plane/reconcile";
import { addStores, miniCatalog, miniFull, trackedOf } from "./helpers/plane-tree";

const codes = (t: TreeView, phase: Phase, prev?: Parameters<typeof validateTree>[1]["prev"]) => validateTree(t, { phase, prev }).problems.map((p) => p.code);
const FIRST = (t: MutableTree, prefix: string): string => t.files().find((f) => f.startsWith(prefix))!;
const edit = (t: MutableTree, f: string, fn: (j: any) => void): void => { const j = JSON.parse(t.read(f)); fn(j); t.write(f, JSON.stringify(j)); };

test("the generated trees validate clean in both phases (the fixture is itself consistent)", () => {
  for (const d of [0, 1, 2, 5]) { assert.deepEqual(codes(miniFull({ day: d }), "full"), [], `day ${d} full`); assert.deepEqual(codes(miniCatalog({ day: d }), "catalog"), [], `day ${d} catalog (no store families yet)`); }
  const r = validateTree(miniFull({ day: 1 }), { phase: "full" }); assert.ok(r.counts.tracked > 100 && r.counts.cards === 700 && r.counts.thin > 0);
});
test("DP-02 reproduced: yesterday's store families beside today's px are REFUSED when the tracked set moved", () => {
  const today = { day: 2 }, yesterday = { day: 1 };
  const a = trackedOf(today), b = trackedOf(yesterday); const left = [...b].filter((u) => !a.has(u)), entered = [...a].filter((u) => !b.has(u));
  assert.ok(left.length > 5 && entered.length > 5, `the fixture's tracked set moves between days (${left.length} left, ${entered.length} entered)`);
  const phase1 = miniCatalog(today); const old = miniFull(yesterday);
  for (const f of old.files().filter((x) => /^(un|of)\//.test(x) || /^ix\/(s|f)-/.test(x) || x === "ss/runs.json" || x.startsWith("sl/d/"))) phase1.write(f, old.read(f));
  const b0 = JSON.parse(old.read("meta/buckets.json")); edit(phase1, "meta/buckets.json", (j) => { j.tracked = b0.tracked; });
  const bad = validateTree(phase1, { phase: "catalog" }).problems;
  assert.ok(bad.some((p) => p.code === "UN_UNTRACKED") && bad.some((p) => p.code === "OF_UNTRACKED") && bad.some((p) => p.code === "IX_S_UNTRACKED") && bad.some((p) => p.code === "IX_F_UNTRACKED"), `unreconciled phase 1 must be refused, got ${[...new Set(bad.map((p) => p.code))]}`);
});
test("DP-02 FIXED: reconcileStoreFamilies drops the rows of units that left tracking; the catalog phase then validates and the full phase adds the entrants", () => {
  const today = { day: 2 }, yesterday = { day: 1 };
  const phase1 = miniCatalog(today); const old = miniFull(yesterday);
  for (const f of old.files().filter((x) => /^(un|of)\//.test(x) || /^ix\/(s|f)-/.test(x) || x === "ss/runs.json" || x.startsWith("sl/d/"))) phase1.write(f, old.read(f));
  edit(phase1, "meta/buckets.json", (j) => { j.tracked = JSON.parse(old.read("meta/buckets.json")).tracked; });
  const rep = reconcileStoreFamilies(phase1, trackedUidsOf(phase1));
  assert.ok(rep.unDropped > 5 && rep.ofDropped > 10 && rep.ixSDropped > 5 && rep.ixFDropped > 10, JSON.stringify(rep)); assert.ok(rep.withoutStoreRows > 5, "units that ENTERED tracking have no store row yet (an absent row = no store data)");
  assert.deepEqual(codes(phase1, "catalog"), [], "phase 1 passes after reconciliation");
  assert.ok(codes(phase1, "full").includes("UN_MISSING"), "but it is NOT a complete (full) tree: the entrants have no un row");
  const full = addStores(cloneToMem(phase1), today); assert.deepEqual(codes(full, "full"), [], "phase 2 completes it");
  assert.deepEqual(JSON.parse(full.read("meta/buckets.json")).tracked, JSON.parse(miniFull(today).read("meta/buckets.json")).tracked);
});
test("DP-02 fixtures: a unit enters tracking, a unit leaves, a bucket loses its last tracked unit, a bucket gets its first", () => {
  const base = miniFull({ day: 0 }); const t = cloneToMem(base);
  const tracked = trackedUidsOf(t); const gone = [...tracked].find((u) => t.read(`un/0/${Math.floor(Math.floor(u / 2) / 256)}.json`).length > 0)!;
  // leaves: clear TRACKN/TRACKF of ONE unit in px (the critic's experiment: 7 problems on the lab's tree)
  const id = Math.floor(gone / 2), b = Math.floor(id / 256); const pxf = `px/${Math.floor(b / 64)}/${b}.json`;
  edit(t, pxf, (j) => { for (const r of j.p) if (r[0] === id) r[5] &= ~(gone % 2 ? PRICE_MASK.TRACKF : PRICE_MASK.TRACKN); });
  assert.ok(codes(t, "catalog").includes("UN_UNTRACKED"), "unreconciled, one unit that left tracking is refused");
  const rep = reconcileStoreFamilies(t, trackedUidsOf(t)); assert.ok(rep.unDropped >= 1 && rep.ofDropped >= 2);
  assert.deepEqual(codes(t, "catalog"), []);
  // a bucket loses ALL its tracked units: its un/of files are REMOVED and the bucket list shrinks
  const t2 = cloneToMem(base); const bucketsBefore: number[] = JSON.parse(t2.read("meta/buckets.json")).tracked; const victim = bucketsBefore[0]!;
  const keep = new Set([...trackedUidsOf(t2)].filter((u) => Math.floor(Math.floor(u / 2) / 256) !== victim));
  const r2 = reconcileStoreFamilies(t2, keep); assert.ok(r2.filesRemoved >= 2, "un and of file of the bucket are removed"); assert.ok(!JSON.parse(t2.read("meta/buckets.json")).tracked.includes(victim));
  // a new bucket gets its first tracked unit in phase 2: the list grows
  const t3 = cloneToMem(miniCatalog({ day: 0 })); assert.deepEqual(JSON.parse(t3.read("meta/buckets.json")).tracked, []); addStores(t3, { day: 0 }); assert.ok(JSON.parse(t3.read("meta/buckets.json")).tracked.length >= 2);
});
test("planted defects are REFUSED (the lab's ten, plus the phase, store-id, premium and licence rules)", () => {
  const base = miniFull({ day: 1 });
  const cases: [string, string, (t: MutableTree) => void, Phase?][] = [
    ["a px file with one row removed", "PX_IDS", (t) => edit(t, FIRST(t, "px/"), (j) => { j.p.pop(); })],
    ["a cat row duplicated (two cards, one slug)", "DUP_SLUG", (t) => edit(t, FIRST(t, "cat/"), (j) => { j.c.push([...j.c[0]]); })],
    ["a slug shard that disagrees with cat", "SLUG_SHARD", (t) => edit(t, FIRST(t, "slug/"), (j) => { j.s[0][1] = 1; })],
    ["an un row for an untracked unit", "UN_UNTRACKED", (t) => edit(t, FIRST(t, "un/"), (j) => { j.u.push([2, [], [], []]); })],
    ["a truncated JSON file", "NOT_JSON", (t) => t.write(FIRST(t, "of/"), t.read(FIRST(t, "of/")).slice(0, 40))],
    ["a cat row that points at an oracle that does not exist", "ORACLE_REF", (t) => edit(t, FIRST(t, "cat/"), (j) => { j.c[0][14] = 99999; })],
    ["meta/buckets.json missing a bucket", "BUCKETS", (t) => edit(t, "meta/buckets.json", (j) => { j.cat.pop(); })],
    ["meta/buckets.json tracked list that omits the bucket of a tracked unit (REQ-WP02-4: the readers would skip its history)", "BUCKETS", (t) => edit(t, "meta/buckets.json", (j) => { j.tracked.pop(); })],
    ["meta/buckets.json tracked list that names a bucket no tracked unit is in", "BUCKETS", (t) => edit(t, "meta/buckets.json", (j) => { j.tracked.push(999); })],
    ["a set board with a missing chunk", "BOARD", (t) => edit(t, "st/100.json", (j) => { j.chunks = 2; })],
    ["hist/t files that name two different cut days", "HIST_CUT", (t) => { t.write("hist/t/9/90.json", JSON.stringify({ v: 4, cut: 20250101, p: {} })); }],
    ["an oversized file (1,000,001 bytes)", "FILE_TOO_BIG", (t) => t.write("mv/up-7-a.json", `[${"0,".repeat(500_000)}0]  `)],
    ["a store id 3 (an eBay display id) in an offer: no forbidden STRING, only a number (DP-19)", "STORE_ID", (t) => edit(t, FIRST(t, "of/"), (j) => { j.o[0][2] = 3; })],
    ["a store id 0 (TCGplayer's virtual store) in the flat offers", "STORE_ID", (t) => edit(t, "ix/f-0.json", (j) => { j.st[0] = 0; })],
    ["an eBay item id in a file", "FORBIDDEN_EBAY", (t) => t.write("hm/home.json", JSON.stringify({ v: 1, x: { itemId: "123" } }))],
    ["an ebay image URL in a file", "FORBIDDEN_EBAY", (t) => t.write("hm/home.json", JSON.stringify({ v: 1, x: "https://i.ebayimg.com/a.jpg" }))],
    ["an e-mail address in a file", "FORBIDDEN_EMAIL", (t) => t.write("hm/home.json", JSON.stringify({ v: 1, x: "a.b@example.com" }))],
    ["a demand counter key", "FORBIDDEN_KEY", (t) => t.write("hm/home.json", JSON.stringify({ v: 1, x: { viewCount: 5 } }))],
    ["a premium ranking family (deals/)", "UNKNOWN_FAMILY", (t) => t.write("deals/us.json", JSON.stringify({ v: 1, rows: [] }))],
    ["a ranked list under a premium key", "FORBIDDEN_RANKING", (t) => t.write("hm/home.json", JSON.stringify({ v: 1, rising: [1, 2, 3] }))],
    ["a secret", "FORBIDDEN_SECRET", (t) => t.write("hm/home.json", JSON.stringify({ v: 1, x: "github_pat_11AAAAAAAAAAAAAAAAAAAA" }))],
    ["the free demand strip with 11 rows", "PV_SIZE", (t) => t.write("pv/demand.json", JSON.stringify({ v: 1, at: "x", days: 7, r: [...Array(11)].map((_, i) => [i + 1, 5]) }))],
    ["a rising preview with 4 picks in a scope", "PV_SIZE", (t) => edit(t, "pv/rising.json", (j) => { j.scopes.GLOBAL = [1, 2, 3, 4].map((i) => ({ id: i, slug: "a", name: "A", reason: "r" })); })],
    ["the browse index with a wrong row count", "IX_ROWS", (t) => edit(t, "ix/dict.json", (j) => { j.rows += 1; })],
    ["a tracked unit without a Normal price", "PX_TRACK", (t) => edit(t, FIRST(t, "px/"), (j) => { const r = j.p.find((x: number[]) => x[5]! & PRICE_MASK.TRACKN); r[5] &= ~PRICE_MASK.HASN; })],
    ["phase full with a tracked unit that has no un row", "UN_MISSING", (t) => { const f = FIRST(t, "un/"); edit(t, f, (j) => { j.u.shift(); }); }],
  ];
  for (const [name, code, mutate, phase] of cases) { const t = cloneToMem(base); mutate(t); const got = codes(t, phase ?? "full"); assert.ok(got.includes(code), `${name}: expected ${code}, got ${[...new Set(got)].join(",") || "nothing"}`); }
  assert.deepEqual(codes(base, "full"), [], "the unmutated copy is clean");
});
test("a collapsed count against the previous publish is refused (F2/F10 equivalent), and a validator that throws is a REFUSAL", () => {
  const t = miniFull({ day: 1 });
  assert.ok(codes(t, "full", { cards: 2000, listed: 2000, tracked: 400, oracles: 350 }).includes("COUNT_COLLAPSE"), "cards fell from 2000 to 700");
  assert.deepEqual(codes(t, "full", { cards: 700, listed: 700, tracked: 210, oracles: 350 }).filter((c) => c === "COUNT_COLLAPSE"), [], "an ordinary day-to-day change passes");
  const broken: TreeView = { files: () => ["cat/0/1.json"], read: () => { throw new Error("disk exploded"); }, size: () => 10, has: () => true };
  const r = validateTree(broken, { phase: "full" }); assert.equal(r.problems[0]!.code, "NOT_JSON"); // an unreadable file is a problem; and an exception inside the pass:
  const exploding: TreeView = { files: () => { throw new Error("listing failed"); }, read: () => "", size: () => 0, has: () => false };
  assert.equal(validateTree(exploding, { phase: "full" }).problems[0]!.code, "ABORTED");
});
test("store ids: only 8, 9 and 10 to 32767 are publishable", () => {
  for (const id of [0, 1, 2, 3, 4, 5, 6, 7, 32768, -1, 10.5]) assert.equal(isPublishableStoreId(id), false, String(id));
  for (const id of [8, 9, 10, 76, 89, 32767]) assert.equal(isPublishableStoreId(id), true, String(id));
});
test("an overlay (the demand snapshot) may change pv/ and the bookkeeping and nothing else", () => {
  const before = miniFull({ day: 1 }); const ok = cloneToMem(before); ok.write("pv/demand.json", JSON.stringify({ v: 1, at: "y", days: 7, r: [[1, 2]] })); ok.write("status.json", "{}");
  assert.deepEqual(validateOverlay(before, ok), []);
  const bad = cloneToMem(before); bad.write("pv/demand.json", "{}"); edit(bad, FIRST(bad, "px/"), (j) => { j.p[0][1] = 1; });
  assert.deepEqual(validateOverlay(before, bad).map((p) => p.code), ["OVERLAY_SCOPE"]);
});
const SAMPLE = process.env.PLANE_SAMPLE_DIR;
test("REAL TREE (PLANE_SAMPLE_DIR): the lab's S3 tree validates in the full phase, and the critic's experiment (clear ONE TRACKN bit) is refused until reconciled", { skip: !SAMPLE || !fs.existsSync(`${SAMPLE}/ix/dict.json`) }, () => {
  const t = cloneToMem(fsTree(SAMPLE!)); const t0 = Date.now();
  upgradeLabTree(t);                                                                                    // tests/helpers/lab-upgrade.ts: cat 18 -> 21 columns, ix/f digits, sealed rows
  const r = validateTree(t, { phase: "full" }); assert.deepEqual(r.problems.map((p) => `${p.code} ${p.message}`).slice(0, 5), [], "the real tree is clean"); assert.ok(r.counts.cards > 90_000 && r.counts.tracked > 28_000, JSON.stringify(r.counts));
  const pxf = "px/10/668.json"; edit(t, pxf, (j) => { const row = j.p.find((x: number[]) => x[5]! & PRICE_MASK.TRACKN); row[5] &= ~PRICE_MASK.TRACKN; });
  const bad = validateTree(t, { phase: "catalog" }).problems; assert.ok(bad.length >= 3 && bad.some((p) => p.code === "UN_UNTRACKED"), "the critic's 7 problems");
  const rep = reconcileStoreFamilies(t, trackedUidsOf(t)); assert.equal(rep.tracked, r.counts.tracked - 1); assert.ok(rep.unDropped === 1 && rep.ofDropped >= 1 && rep.ixSDropped === 1);
  assert.deepEqual(validateTree(t, { phase: "catalog" }).problems, [], "after reconciliation phase 1 passes"); console.log(`real tree: ${r.counts.files} files, ${(r.counts.bytes / 1e6).toFixed(1)} MB, validated twice in ${Date.now() - t0} ms; reconcile ${JSON.stringify(rep)}`);
});
void memTree;

test("meta/buckets.json: `tracked` is the buckets of the units px tracks in every phase; an EMPTY list is legal (the readers treat it as unknown and rule nothing out)", () => {
  for (const phase of ["catalog", "full"] as const) {
    const t = cloneToMem(phase === "full" ? miniFull({ day: 1 }) : miniCatalog({ day: 1 })); const b = JSON.parse(t.read("meta/buckets.json")) as { tracked: number[] };
    if (phase === "full") assert.ok(b.tracked.length > 2); else assert.deepEqual(b.tracked, [], "the generator's catalogue tree has not listed them");
    assert.deepEqual(validateTree(t, { phase }).problems, [], `${phase}: valid as generated`);
    const px = new Set<number>(); for (const f of t.files()) if (f.startsWith("px/")) for (const r of (JSON.parse(t.read(f)) as { p: number[][] }).p) if (r[5]! & (PRICE_MASK.TRACKN | PRICE_MASK.TRACKF)) px.add(Math.floor(r[0]! / 256));
    edit(t, "meta/buckets.json", (j) => { j.tracked = [...px].sort((x, y) => x - y); }); assert.deepEqual(validateTree(t, { phase }).problems, [], `${phase}: the true list is valid`);
    edit(t, "meta/buckets.json", (j) => { j.tracked = []; }); assert.deepEqual(validateTree(t, { phase }).problems, [], `${phase}: the empty list is "not computed"`);
    edit(t, "meta/buckets.json", (j) => { j.tracked = [...px].sort((x, y) => y - x); }); assert.ok(validateTree(t, { phase }).problems.some((p) => p.code === "BUCKETS"), "a list out of order is not the list");
  }
});
