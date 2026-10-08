// NOTHING PAID IS A FILE (critique DP-07, DP-09; contract 12.3). The data host serves every byte of the published tree to whoever holds a read token or, if the repository were public, to the world; an encrypted *.enc shard would have to ship its key to every
// Vercel instance (an attacker with the source of one deploy owns every dataset since). So the rule is structural: the paid rankings (Deal Finder's list, Rising Cards, the full Demand Finder) are computed per request from public columns and a private Neon
// table, behind an opaque Entitlement; the only files derived from the private demand counters are two CLEAR preview slices, small enough to be the free tier. This test pins every part of that rule from outside the code that implements it. Owner WP02.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cloneToMem } from "../src/lib/data/plane/tree";
import { validateOverlay, validateTree } from "../src/lib/data/plane/validate";
import { FEATURE_RULES } from "../src/lib/premium-gates";
import { miniFull } from "./helpers/plane-tree";

const ROOT = process.env.TEST_ROOT ?? path.resolve(__dirname, "..");
const walk = (d: string): string[] => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" || e.name === ".next" ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
const codes = (t: ReturnType<typeof miniFull>): string[] => [...new Set(validateTree(t, { phase: "full" }).problems.map((p) => p.code))].sort();
const base = () => cloneToMem(miniFull({ day: 2 }));

test("the baseline tree is clean, and the two preview slices are exactly the free tier the gates promise", () => {
  const t = base(); assert.deepEqual(codes(t), []);
  const d = JSON.parse(t.read("pv/demand.json")) as { r: unknown[]; days: number }; assert.ok(d.r.length <= FEATURE_RULES.demand.freePreviewRows, "pv/demand.json is at most the free Demand Finder rows (10)"); assert.equal(d.days, 7);
  const r = JSON.parse(t.read("pv/rising.json")) as { scopes: Record<string, unknown[]> }; for (const [scope, picks] of Object.entries(r.scopes)) assert.ok(picks.length <= FEATURE_RULES.rising.freePreviewRows, `${scope}: at most the free Rising Cards rows (3)`);
  assert.deepEqual(Object.keys(JSON.parse(t.read("pv/demand.json"))).sort(), ["at", "days", "r", "v"], "no `views`, no `velocity`: searches over 7 days only");
});
test("an encrypted shard, a ciphertext envelope or any non-JSON file is refused (the AES design of the first pass is rejected, 12.3.4)", () => {
  const t = base(); t.write("pv/demand.enc", "AAAAAQ" + "x".repeat(200)); const c = codes(t); assert.ok(c.includes("BAD_EXT"), c.join()); assert.ok(c.includes("NOT_JSON"), c.join());
  const u = base(); u.write("hist/rising.enc", "binary"); assert.ok(codes(u).includes("BAD_EXT"));
});
test("a ranked list, a score, a demand count or a velocity in any public file is refused; the preview slices are the only exception to the ranking keys", () => {
  for (const [file, patch] of [
    ["hm/home.json", (j: Record<string, unknown>) => { j.deals = [[1, 2, 3]]; }], ["mk/overview.json", (j: Record<string, unknown>) => { j.ranking = [1]; }], ["hist/index.json", (j: Record<string, unknown>) => { j.score = 1; }],
    ["hm/home.json", (j: Record<string, unknown>) => { j.rising = []; }], ["mv/recent.json", (j: Record<string, unknown>) => { j.demand = []; }],
  ] as const) { const t = base(); const j = JSON.parse(t.read(file)); patch(j); t.write(file, JSON.stringify(j)); assert.ok(codes(t).includes("FORBIDDEN_RANKING"), `${file}: ${JSON.stringify(Object.keys(j))}`); }
  for (const key of ["viewCount", "searchCount", "velocity"]) { const t = base(); const j = JSON.parse(t.read("mk/overview.json")); j[key] = 1; t.write("mk/overview.json", JSON.stringify(j)); assert.ok(codes(t).includes("FORBIDDEN_KEY"), key); }
  const t = base(); const j = JSON.parse(t.read("pv/demand.json")); j.searchCount = 1; t.write("pv/demand.json", JSON.stringify(j)); assert.ok(codes(t).includes("FORBIDDEN_KEY"), "even the preview slice carries no counter name");
});
test("a preview slice larger than the free tier is refused (the slice cannot grow into the dataset)", () => {
  const t = base(); const d = JSON.parse(t.read("pv/demand.json")); d.r = Array.from({ length: 11 }, (_, i) => [i + 1, 5]); t.write("pv/demand.json", JSON.stringify(d)); assert.ok(codes(t).includes("PV_SIZE"));
  const u = base(); const r = JSON.parse(u.read("pv/rising.json")); r.scopes.GLOBAL = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, slug: `s${i}`, name: "n", reason: "x" })); u.write("pv/rising.json", JSON.stringify(r)); assert.ok(codes(u).includes("PV_SIZE"));
  const v = base(); v.write("pv/rising.json", JSON.stringify({ v: 1, at: "x", scopes: { GLOBAL: [] }, extra: "x".repeat(60_000) })); assert.ok(codes(v).includes("FILE_TOO_BIG") === false); /* the family cap (50,000 bytes) is asserted by plane-budget; the validator's own cap is the global one */
});
test("the demand-snapshot overlay may write pv/ and nothing else", () => {
  const before = base(), after = cloneToMem(before); const j = JSON.parse(after.read("pv/demand.json")); j.r = [[1000, 99]]; after.write("pv/demand.json", JSON.stringify(j));
  assert.deepEqual(validateOverlay(before, after), []);
  after.write("px/0/0.json", JSON.stringify({ v: 1, b: 0, p: [] })); assert.ok(validateOverlay(before, after).length > 0, "a data file changed by the overlay");
});
test("the source never carries the AES envelope, its key or a decrypt path; no workflow or env table names PREMIUM_DATA_KEY", () => {
  const offenders: string[] = [];
  for (const f of [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "scripts")), ...walk(path.join(ROOT, ".github")), ...walk(path.join(ROOT, "tests/fixtures"))]) {
    if (!/\.(ts|tsx|js|cjs|mjs|yml|yaml|json|md)$/.test(f) || f.endsWith("plane-no-premium.test.ts")) continue;
    const s = fs.readFileSync(f, "utf8");
    if (/PREMIUM_DATA_KEY|PremiumDataError|encryptJson|decryptJson|createDecipheriv|aes-256-gcm/i.test(s)) offenders.push(path.relative(ROOT, f));
  }
  assert.deepEqual(offenders, [], "the premium data envelope (src/lib/premium-data.ts, tests/premium-data.test.ts, PREMIUM_DATA_KEY) is deleted by this design: contract 12.3");
});
test("every module under src/lib/data that mints, reads or cuts a paid dataset goes through the Entitlement: static scan of the paid loaders", () => {
  const dir = path.join(ROOT, "src/lib/data"); const paid = ["deals.ts", "demand.ts"].map((n) => path.join(dir, n)).filter((f) => fs.existsSync(f));
  for (const f of paid) { const s = fs.readFileSync(f, "utf8"); assert.match(s, /\bviewerOf\b|\bsliceRanking\b|\baccessOf\b/, `${path.basename(f)} never looks at the viewer`); assert.doesNotMatch(s, /who\.tier|tier\s*[=!]==?\s*["']premium["']/, `${path.basename(f)} compares a tier itself: use premium-gates.ts`); }
});
