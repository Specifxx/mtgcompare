// THE WIRE FORMATS ARE A CONTRACT BETWEEN TWO PACKAGES (WP01b writes the files, WP02 reads them; the data host stores them for years). This test pins them three ways:
//   1. GOLDEN FILES: tests/fixtures/plane/*.json (one trimmed sample per family, written by checks/make-plane-fixtures.ts) equal a fresh generation: a format change is an explicit diff in the pull request.
//   2. ROW WIDTHS: every row of every family has the width formats.ts declares (the TypeScript tuple types cannot be checked at run time; ROW_WIDTH can).
//   3. THE READERS: the typed-array engine, lite hydration and the history codec accept the generated tree and give the answers the generator knows (a writer/reader pair that drifted apart fails here, not on the site).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PRICE_MASK } from "../src/lib/constants";
import { FAMILIES, PLANE_FILE_MAX_BYTES, ROW_WIDTH, type CatFile, type PxFile } from "../src/lib/data/plane/formats";
import { BrowseIndex } from "../src/lib/data/plane/browse-index";
import { fsSource } from "../src/lib/data/plane/source";
import { familyOf } from "../src/lib/data/plane/shards";
import { fsTree } from "../src/lib/data/plane/tree";
import { rowFromPlane, liteFromRow } from "../src/lib/data/lite";
import { goldenFiles } from "./helpers/plane-golden";
import { miniCards, miniFull } from "./helpers/plane-tree";
import os from "node:os";

const FIX = path.resolve(__dirname, "fixtures/plane");

test("GOLDEN: the committed samples equal a fresh generation, one per family, and no stale sample is left", () => {
  const fresh = goldenFiles(); const onDisk = fs.readdirSync(FIX).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
  assert.deepEqual(onDisk, Object.keys(fresh).sort(), "run: npx tsx scripts/contract-checks/make-plane-fixtures.ts");
  for (const [name, value] of Object.entries(fresh)) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(FIX, `${name}.json`), "utf8")), JSON.parse(JSON.stringify(value)), `${name}: the wire format changed; regenerate the fixtures and say so in the pull request`);
});
test("GOLDEN: every published family (formats.ts FAMILIES) has a sample except the ones only a real publish writes", () => {
  const sampled = new Set(Object.keys(goldenFiles()).map((n) => n.split("-")[0]!));
  const onlyReal = new Set(["manifest.json", "status.json"]);                                  // bookkeeping written by the publisher (tests/plane-publish.test.ts and data-status.test.ts cover them)
  for (const fam of FAMILIES) assert.ok(sampled.has(fam.replace(/\.json$/, "")) || onlyReal.has(fam), `no golden sample for family ${fam}`);
});
test("ROW WIDTHS: every row of every list-shaped family in the generated tree has the declared width", () => {
  const t = miniFull({ day: 3 }); let checked = 0;
  const check = (f: string, rows: unknown[][], width: number | readonly number[]): void => { for (const r of rows) { const ok = typeof width === "number" ? r.length === width : width.includes(r.length); assert.ok(ok, `${f}: a row has ${r.length} columns, declared ${JSON.stringify(width)}`); checked++; } };
  for (const f of t.files()) {
    const j = JSON.parse(t.read(f)); const fam = familyOf(f);
    if (fam === "cat") check(f, (j as CatFile).c, ROW_WIDTH.cat); else if (fam === "px") check(f, (j as PxFile).p, ROW_WIDTH.px); else if (fam === "un") check(f, j.u, ROW_WIDTH.un); else if (fam === "of") check(f, j.o, ROW_WIDTH.of);
    else if (fam === "or") check(f, j.o, ROW_WIDTH.or); else if (fam === "nm") check(f, j.r, ROW_WIDTH.nm); else if (f === "meta/sets.json") check(f, j.sets, ROW_WIDTH.set); else if (fam === "st") check(f, j.c, ROW_WIDTH.board);
    else if (fam === "sl/list") check(f, j.s, ROW_WIDTH.sealed); else if (fam === "ss/runs") check(f, j.r, ROW_WIDTH.storeRun); else if (fam === "ix/s") check(f, j.u, ROW_WIDTH.ixS);
  }
  assert.ok(checked > 500, `only ${checked} rows were checked`);
});
test("every file of the generated tree is JSON, under the global cap, and carries its format marker `v`", () => {
  const t = miniFull({ day: 3 });
  for (const f of t.files()) { assert.ok(t.size(f) <= PLANE_FILE_MAX_BYTES, f); const j = JSON.parse(t.read(f)); if (!Array.isArray(j)) assert.ok(typeof j.v === "number", `${f} has no v`); }
});
test("THE READERS accept the generated tree: the engine loads it, lite hydration from the bucket rows equals the lite from the index row, and a low-only row has no market value", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plane-format-")); const t = fsTree(path.join(dir, "v1")); const src0 = miniFull({ day: 3 }); for (const f of src0.files()) t.write(f, src0.read(f));
  try {
    const sets = (JSON.parse(src0.read("meta/sets.json")).sets as unknown[][]).map((r) => ({ id: r[0] as number, slug: r[1] as string, tok: r[2] as string, code: r[3] as string, name: r[4] as string, tcgName: "", kind: "expansion" as const, releasedOn: r[7] as string, bucket: false, cardCount: 0, trackedCount: 0, sealedCount: 0 }));
    const ix = await BrowseIndex.load(fsSource(dir), sets, { withStores: true, withOracle: true }); const cards = miniCards({ day: 3 }).filter((c) => c.mask & PRICE_MASK.LISTED);
    assert.equal(ix.n, cards.length, "the index has one row per LISTED card");
    const lowOnly = cards.find((c) => c.mN == null && c.mF == null)!; assert.ok(lowOnly, "the generator makes low-only rows");
    const lite = ix.lookup([lowOnly.id]).get(lowOnly.id)!; assert.equal(lite.marketUsd, null, "a low-only unit has NO market value"); assert.equal(lite.lowOnly, true); assert.ok(lite.valueUsd! > 1_000_000, "the thin listing is displayed, never ranked");
    const top = ix.query({ sort: "value", page: 1, per: 24, classes: [0] }); assert.ok(top.items.every((c) => c.id !== lowOnly.id), "a $200k low-only listing never tops `value`");
    const one = cards.find((c) => c.mN != null && (c.mask & PRICE_MASK.TRACKN))!; const catF = JSON.parse(src0.read(`cat/${Math.floor(Math.floor(one.id / 256) / 64)}/${Math.floor(one.id / 256)}.json`)) as CatFile; const pxF = JSON.parse(src0.read(`px/${Math.floor(Math.floor(one.id / 256) / 64)}/${Math.floor(one.id / 256)}.json`)) as PxFile;
    const fromBucket = liteFromRow(rowFromPlane(catF.c.find((r) => r[0] === one.id)!, pxF.p.find((r) => r[0] === one.id), "s100", [], "N")); const fromIndex = ix.liteAt([...Array(ix.n).keys()].find((i) => ix.id[i] === one.id)!, "N");
    for (const k of ["id", "slug", "name", "setId", "rarity", "marketUsd", "lowOnly", "thin", "listed", "tracked", "change7d", "oracleNo"] as const) assert.deepEqual(fromBucket[k], fromIndex[k], `lite.${k}: the bucket fan-in and the index must agree`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
