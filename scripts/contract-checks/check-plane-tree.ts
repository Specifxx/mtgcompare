// checks/check-plane-tree.ts (owner WP01b; run by .github/workflows/data-audit.yml and by hand). AUDITS A PUBLISHED TREE: the validator in the phase named, the byte budgets, the write-once rules against another tree, and the numbers the contract quotes.
// It replaces the draft's check-history.ts, check-lite.ts and check-sql.ts (a Postgres-era catalogue is gone; its numbers moved here).
//   npx tsx checks/check-plane-tree.ts <v1-dir> [--phase full|catalog] [--prev <v1-dir>] [--lite 6000] [--lab]
// Exit code 1 on any validator problem, budget breach or write-once violation.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { FILE_BUDGETS, NEXT_ENTRY_CEILING, budgetFor, fetchEntryBytes, unstableEntryBytes } from "../../src/lib/data/plane/budgets";
import { PLANE_FILE_MAX_BYTES } from "../../src/lib/data/plane/formats";
import { BrowseIndex } from "../../src/lib/data/plane/browse-index";
import { loadPrevState, writeOnceProblems } from "../../src/lib/data/plane/prevstate";
import { familyOf } from "../../src/lib/data/plane/shards";
import type { PlaneSource } from "../../src/lib/data/plane/source";
import type { TreeView } from "../../src/lib/data/plane/tree";
const memSource = (t: TreeView): PlaneSource => ({ text: async (rel) => t.read(rel), json: async <T,>(rel: string) => JSON.parse(t.read(rel)) as T });
import { fsTree } from "../../src/lib/data/plane/tree";
import { validateTree, type Phase } from "../../src/lib/data/plane/validate";
import { cloneToMem } from "../../src/lib/data/plane/tree";
import { upgradeLabTree } from "../../tests/helpers/lab-upgrade";

const arg = (k: string): string | undefined => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const dir = process.argv[2]; if (!dir || dir.startsWith("--")) { console.error("usage: check-plane-tree.ts <v1-dir> [--phase full|catalog] [--prev <v1-dir>] [--lite N]"); process.exit(2); }
const phase = (arg("--phase") ?? "full") as Phase; let failed = false; const fail = (m: string) => { failed = true; console.log(`FAIL ${m}`); };
const lab = process.argv.includes("--lab");                                                          // the lab's real S3 tree predates the final formats: upgrade it in memory
const disk = fsTree(path.resolve(dir)); const t = lab ? cloneToMem(disk) : disk; if (lab) upgradeLabTree(t); const files = t.files();
const fam = new Map<string, { files: number; raw: number; gz: number; max: number }>();
for (const f of files) { const s = t.read(f), e = fam.get(familyOf(f)) ?? { files: 0, raw: 0, gz: 0, max: 0 }; e.files++; e.raw += s.length; e.gz += zlib.gzipSync(s, { level: 6 }).length; e.max = Math.max(e.max, s.length); fam.set(familyOf(f), e); }
let raw = 0, gz = 0; console.log("| family | files | raw MB | gzip MB | largest KB | cap KB |\n|---|---:|---:|---:|---:|---:|");
for (const [name, e] of [...fam].sort((a, b) => b[1].raw - a[1].raw)) { raw += e.raw; gz += e.gz; const b = budgetFor(name); console.log(`| ${name} | ${e.files} | ${(e.raw / 1e6).toFixed(2)} | ${(e.gz / 1e6).toFixed(2)} | ${(e.max / 1e3).toFixed(1)} | ${b ? (b.maxRawBytes / 1e3).toFixed(0) : "?"} |`);
  if (!b) fail(`family ${name} has no budget`); else { if (e.max > Math.min(b.maxRawBytes, PLANE_FILE_MAX_BYTES)) fail(`${name}: largest file ${e.max} > cap ${b.maxRawBytes}`); if (e.files > b.maxFiles) fail(`${name}: ${e.files} files > ${b.maxFiles}`); } }
console.log(`all: ${files.length} files, ${(raw / 1e6).toFixed(1)} MB raw (MB = 10^6 bytes), ${(gz / 1e6).toFixed(1)} MB gzip; a ${PLANE_FILE_MAX_BYTES}-byte file is ${fetchEntryBytes(PLANE_FILE_MAX_BYTES)} bytes as Next caches it (ceiling ${NEXT_ENTRY_CEILING})`);
const t0 = performance.now(); const v = validateTree(t, { phase }); console.log(`validate (${phase}): ${v.problems.length} problems in ${(performance.now() - t0).toFixed(0)} ms; ${JSON.stringify(v.counts)}`);
for (const p of v.problems.slice(0, 40)) fail(`${p.code}: ${p.message}`);
const prevDir = arg("--prev"); if (prevDir) { const prev = loadPrevState(fsTree(path.resolve(prevDir))); const w = writeOnceProblems(prev, t); console.log(`write-once against ${prevDir}: ${w.length} problems`); for (const p of w) fail(`${p.code}: ${p.message}`); }
void (async () => {
  if (files.includes("ix/dict.json")) {
    const sets = (JSON.parse(t.read("meta/sets.json")).sets as unknown[][]).map((r) => ({ id: r[0] as number, slug: r[1] as string, tok: r[2] as string, code: r[3] as string, name: r[4] as string, tcgName: "", kind: "expansion" as const, releasedOn: (r[7] as string | 0) || null, bucket: false, cardCount: 0, trackedCount: 0, sealedCount: 0 }));
    const t1 = performance.now(); const ix = await BrowseIndex.load(memSource(t), sets, { withStores: true, withOracle: files.includes("ix/odict.json") }); const load = performance.now() - t1;
    const n = Math.min(ix.n, Number(arg("--lite") ?? 6000)); let bytes = 0; for (let i = 0; i < n; i++) bytes += JSON.stringify(ix.liteAt(i * Math.floor(ix.n / n))).length;
    const page = ix.query({ sort: "value", page: 1, per: 100, classes: [0] });
    console.log(`browse index: ${ix.n} rows, ${ix.stats.files} files, ${(ix.stats.bytes / 1e6).toFixed(1)} MB, loaded in ${load.toFixed(0)} ms; CardLite ${(bytes / n).toFixed(0)} B/row as JSON over ${n} rows; a 100-row page is ${unstableEntryBytes(page)} bytes as Next measures an unstable_cache entry; top by value: ${page.items.slice(0, 3).map((c) => `${c.name} ${c.marketUsd}`).join(", ")}`);
    if (page.items.some((c) => c.marketUsd == null)) fail("a low-only unit appears in the top 100 by value");
  }
  console.log(failed ? "RESULT: FAIL" : "RESULT: ok"); process.exit(failed ? 1 : 0);
})();
void FILE_BUDGETS;
