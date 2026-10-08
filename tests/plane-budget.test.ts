// THE BYTES THE PLANE MAY OCCUPY (critique 8; section 7.11). Three layers, so a growing catalogue fails a test and never a page:
//   1. The CAPS: every published family has a cap in FILE_BUDGETS; no file is above PLANE_FILE_MAX_BYTES (1,000,000), and a fetch() of such a file is cached by Next with a margin (fetchEntryBytes).
//   2. The PROJECTION: measured bytes per row (the real 9,488-file tree of 2026-10-07, 98,991 cards) scaled to the scale the contract plans for (115,000 cards, 47,850 tracked units, 500,000 offers): the largest file of each family stays under its cap.
//   3. The RANKINGS: the three unstable_cache entries that may exist (deal-rank, rise, demand) measured AS NEXT MEASURES THEM (the value is stringified twice), at their worst case.
// With PLANE_SAMPLE_DIR=<a published v1/ directory> the real tree is walked as well. Owner WP02 (the numbers are WP01b's output).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FILE_BUDGETS, NEXT_ENTRY_CEILING, budgetFor, fetchEntryBytes, unstableEntryBytes } from "../src/lib/data/plane/budgets";
import { PLANE_FILE_MAX_BYTES } from "../src/lib/data/plane/formats";
import { familyOf } from "../src/lib/data/plane/shards";
import { DEAL_RANK_MAX_ROWS, DEMAND_RANK_MAX_ROWS, RISE_RANK_MAX_ROWS } from "../src/lib/data/plane/entitlement";
import { miniFull } from "./helpers/plane-tree";

// bytes per row, measured on the real tree (design/dataplane-lab/out/tables-s3.md); `rows` = the unit the family is split by
const MEASURED: { family: string; maxBytesNow: number; rowsNow: number; rowsAtPlan: number; note: string }[] = [
  { family: "ix/k", maxBytesNow: 863_900, rowsNow: 8192, rowsAtPlan: 8192, note: "8,192 rows per chunk, so the file size does not grow with the catalogue (the number of chunks does: 13 now, 15 at 115,000)" },
  { family: "ix/p", maxBytesNow: 201_000, rowsNow: 8192, rowsAtPlan: 8192, note: "same" },
  { family: "ix/s", maxBytesNow: 226_500, rowsNow: 8192, rowsAtPlan: 8192, note: "same (tracked units are sparse)" },
  { family: "ix/f", maxBytesNow: 657_100, rowsNow: 40_000, rowsAtPlan: 40_000, note: "40,000 offers per chunk" },
  { family: "cat", maxBytesNow: 37_900 + 6_000, rowsNow: 256, rowsAtPlan: 256, note: "256 ids per bucket; +6 KB for the three oracle columns added after the lab (cat +0.52 MB over the tree)" },
  { family: "px", maxBytesNow: 12_400, rowsNow: 256, rowsAtPlan: 256, note: "256 ids per bucket" },
  { family: "un", maxBytesNow: 18_000, rowsNow: 256, rowsAtPlan: 256, note: "256 ids per bucket" },
  { family: "of", maxBytesNow: 125_500, rowsNow: 191_242, rowsAtPlan: 500_000, note: "bytes grow with the offers of the busiest bucket: scaled by 500,000 / 191,242" },
  { family: "slug", maxBytesNow: 21_500, rowsNow: 98_991 + 33_447 + 3_712, rowsAtPlan: 115_000 + 34_800 + 4_500, note: "256 shards; linear in the number of slugs" },
  { family: "sc", maxBytesNow: 106_100, rowsNow: 98_991, rowsAtPlan: 115_000, note: "64 shards; linear" },
  { family: "or", maxBytesNow: 24_700, rowsNow: 33_447, rowsAtPlan: 34_800, note: "512 shards; linear" },
  { family: "st", maxBytesNow: 317_500, rowsNow: 2_000, rowsAtPlan: 2_000, note: "2,000 rows per file" },
  { family: "sl/list", maxBytesNow: 329_500 + 130_000, rowsNow: 2_500, rowsAtPlan: 2_500, note: "2,500 rows per file; +130 KB for the five columns added after the lab (packCount, flags, low, stores, change7d)" },
  { family: "sl/d", maxBytesNow: 60_300 + 15_000, rowsNow: 3_712, rowsAtPlan: 4_500, note: "64 shards; +15 KB for the contents text" },
  { family: "hist/p", maxBytesNow: 155_300, rowsNow: 64, rowsAtPlan: 64, note: "64 ids x 730 days; 376 KB at 85% daily churn (the cap is 450,000)" },
  { family: "hist/t", maxBytesNow: 31_000, rowsNow: 512, rowsAtPlan: 512, note: "512 ids x at most 31 days" },
  { family: "hist/w", maxBytesNow: 441_400, rowsNow: 28_538, rowsAtPlan: 47_850, note: "8 shards; linear in tracked units" },
  { family: "nm", maxBytesNow: 697_900, rowsNow: 8_000, rowsAtPlan: 8_000, note: "8,000 rows per chunk" },
  { family: "sm", maxBytesNow: 348_200, rowsNow: 10_000, rowsAtPlan: 10_000, note: "10,000 paths per section" },
];
const scaled = (m: (typeof MEASURED)[number]): number => Math.ceil(m.maxBytesNow * (m.rowsAtPlan / m.rowsNow));

test("every family of FILE_BUDGETS has a cap under the global file cap, and every family the builder writes has a budget", () => {
  for (const b of FILE_BUDGETS) assert.ok(b.maxRawBytes <= PLANE_FILE_MAX_BYTES, `${b.family}: ${b.maxRawBytes} is above the global cap ${PLANE_FILE_MAX_BYTES}`);
  const tree = miniFull({ day: 2 }); const missing = new Set<string>();
  for (const f of tree.files()) { const fam = familyOf(f); if (!budgetFor(fam)) missing.add(`${fam} (${f})`); }
  assert.deepEqual([...missing], [], "a family without a budget is unbounded");
});
test("fetchEntryBytes: a file at the global cap is cached by Next with a margin; the measured limit is 1,570,000 raw bytes", () => {
  assert.ok(fetchEntryBytes(PLANE_FILE_MAX_BYTES) < 1_500_000, `${fetchEntryBytes(PLANE_FILE_MAX_BYTES)} bytes as Next measures it`);
  assert.ok(fetchEntryBytes(1_560_000) < NEXT_ENTRY_CEILING && fetchEntryBytes(1_580_000) >= NEXT_ENTRY_CEILING - 100, "the formula reproduces the probe: 1,560,000 cached, 1,580,000 not");
});
test("PROJECTION: the largest file of each family at 115,000 cards / 47,850 units / 500,000 offers stays under its cap", () => {
  for (const m of MEASURED) { const b = budgetFor(m.family)!; assert.ok(b, m.family); const at = scaled(m); assert.ok(at <= b.maxRawBytes, `${m.family}: ${at} bytes at plan scale (${m.note}) is above the cap ${b.maxRawBytes}`); assert.ok(at <= PLANE_FILE_MAX_BYTES * 0.9, `${m.family}: ${at} leaves under 10% to the global cap`); }
});
test("PROJECTION: file counts at plan scale stay under maxFiles", () => {
  const atPlan: Record<string, number> = { cat: Math.ceil(115_000 / 256) + 60, px: Math.ceil(115_000 / 256) + 60, un: Math.ceil(47_850 / 256) + 400, of: Math.ceil(115_000 / 256) + 60, "hist/p": Math.ceil(115_000 / 64) + 60, "hist/t": Math.ceil(115_000 / 512) + 60, st: 520, "ss/l": 220, "ix/k": Math.ceil(115_000 / 8192), "ix/f": Math.ceil(500_000 / 40_000) };
  for (const [fam, n] of Object.entries(atPlan)) { const b = budgetFor(fam)!; assert.ok(n <= b.maxFiles, `${fam}: ${n} files at plan scale, cap ${b.maxFiles}`); }
});
test("RANKINGS measured as Next measures an unstable_cache entry (the value is stringified twice): worst case digits, 1.5 MB ceiling", () => {
  const deal = Array.from({ length: DEAL_RANK_MAX_ROWS }, (_, i) => [9_999_999 - i, 9_999_999, 9_999_999, 32_767, 5]);                    // [uid, buyCents, marketCents, storeId, marketIndex]
  const rise = Array.from({ length: RISE_RANK_MAX_ROWS }, (_, i) => ({ id: 999_999 - i, score: 99.99, p: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((x) => x * 1111), reason: "x".repeat(120) }));
  const demand = Array.from({ length: DEMAND_RANK_MAX_ROWS }, (_, i) => [999_999 - i, 9_999_999, 9_999_999]);
  for (const [name, v] of [["deal-rank-v1", { total: 47_850, rows: deal }], ["rise-v1", { rows: rise }], ["demand-v1", { bySearch: demand, byView: demand }]] as const) {
    const bytes = unstableEntryBytes(v); assert.ok(bytes < 1_500_000, `${name}: ${bytes} bytes as Next measures it`); console.log(`ranking ${name}: ${(bytes / 1024).toFixed(0)} KiB`);
  }
});
test("REAL TREE (PLANE_SAMPLE_DIR): every file is under its family's cap and under the global cap; the family counts are under maxFiles", { skip: !process.env.PLANE_SAMPLE_DIR }, () => {
  const root = process.env.PLANE_SAMPLE_DIR!; const sizes = new Map<string, { max: number; files: number }>();
  const walk = (d: string, base = ""): void => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(d, e.name), `${base}${e.name}/`); else { const rel = `${base}${e.name}`, sz = fs.statSync(path.join(d, e.name)).size, fam = familyOf(rel); const cur = sizes.get(fam) ?? { max: 0, files: 0 }; cur.max = Math.max(cur.max, sz); cur.files++; sizes.set(fam, cur); } } };
  walk(root);
  for (const [fam, s] of sizes) { const b = budgetFor(fam); if (!b) continue; assert.ok(s.max <= Math.min(b.maxRawBytes, PLANE_FILE_MAX_BYTES), `${fam}: largest file ${s.max} > cap ${b.maxRawBytes}`); assert.ok(s.files <= b.maxFiles, `${fam}: ${s.files} files > ${b.maxFiles}`); }
});
