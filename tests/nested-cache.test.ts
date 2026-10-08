// Egress rules (CLAUDE.md "Egress", src/lib/db.ts), rewritten for published data. Owner WP19 (it polices the whole repository); WP02 wrote the rules (contract 7.10). The scanners are pure (tests/helpers/cache-scan.ts) and are tested on synthetic
// sources FIRST, so every rule is shown to be able to fail.
//  1. unstable_cache lives only under src/lib/data/ (a page cannot wrap a self-cached loader in a second cache).
//  2. No request path imports the Prisma client (src/app never imports @/lib/db).
//  3. No unstable_cache callback calls a get* loader (the fixed regex: `.getTime(` is a method, not a loader) and none reads the plane or the network: Next runs the callback under fetchCache "force-no-store" (critique DP-06).
//  4. Transitive nesting (ported from Rift): a helper called from a callback, up to three hops away, must not call a loader or read the plane either.
//  5. Plane data is cached by the pinned fetch itself; unstable_cache around plane data is allowed ONLY for the computed rankings (deal-rank-v1, rise-v1) and their key carries the data commit and never a tier.
//  6. src/lib/data/index.ts is a pure barrel; every module declares its owner; no two modules export the same name.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { dataFiles } from "./helpers/data-source";
import { cacheCalls, callbackOffenders, keyOffenders, splitArgs, stripNonCode, transitiveOffenders } from "./helpers/cache-scan";

const ROOT = process.env.TEST_ROOT ?? path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const INTERNAL = new Set(["index.ts", "api.ts", "lite.ts"]);          // imported by sibling modules, never by pages, and not part of the barrel (api.ts exists only in the contract tree)
const ALLOWED_PLANE_CACHES = ["deal-rank-v1", "rise-v1", "demand-v1"];
function walk(dir: string): string[] { if (!fs.existsSync(dir)) return []; return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])); }

// ── the scanners can fail (synthetic sources) ──────────────────────────────────────────────────────────────────────────────────────────────────
test("the callback scanner finds nested parentheses, ignores strings and comments, and reads the key", () => {
  const src = 'const a = unstable_cache(async () => { const s = ")"; /* getX( */ return readX(f(1)); }, ["k", ref], { tags: ["t"] }); const b = 1;';
  assert.equal(cacheCalls(src).length, 1); assert.match(splitArgs(cacheCalls(src)[0]!.args).callback, /readX\(f\(1\)\)/); assert.equal(splitArgs(cacheCalls(src)[0]!.args).key.trim(), '["k", ref]');
});
test("RULE 3: a get* loader or a plane read inside a callback is flagged; a pure callback over data resolved BEFORE the closure is not; `.getTime(` is not a loader", () => {
  const bad = 'export async function getRank(c) { return unstable_cache(async () => { const ix = await getBrowseIndex(); return rank(ix); }, ["deal-rank-v1", ref], { tags: [] })(); }';
  assert.equal(callbackOffenders(bad).length, 1 + 0, callbackOffenders(bad).join("; ")); assert.ok(callbackOffenders(bad).some((x) => /getBrowseIndex/.test(x)));
  const fetchy = 'unstable_cache(async () => { const r = await fetch(url, { next: { revalidate: 1 } }); return r.json(); }, ["k"])'; assert.ok(callbackOffenders(fetchy).some((x) => /fetch/.test(x)));
  const plane = 'unstable_cache(async () => (await planeJson("hist/w/0.json")).k, ["k"])'; assert.ok(callbackOffenders(plane).some((x) => /planeJson/.test(x)));
  const good = 'export async function getRank(c) { const ix = await getBrowseIndex(); return unstable_cache(async () => rank(ix, c), rankKey("deal-rank-v1", ref, c), { tags: [] })(); }'; assert.deepEqual(callbackOffenders(good), []);
  const falsePositive = 'unstable_cache(async () => rows.filter((q) => q.updatedAt.getTime() > 0), ["k"])'; assert.deepEqual(callbackOffenders(falsePositive), [], "the OP regex flagged this (1 false positive in 29 callbacks)");
});
test("RULE 4: a self-cached loader or a plane read TWO or THREE hops below a callback is flagged (Rift's burn of 2026-09-14)", () => {
  const files = new Map([["a.ts", 'export const x = unstable_cache(async () => buildRows(), ["k"]);\nexport function buildRows() { return middle(); }\nfunction middle() { return getSealedGroups(); }'], ["b.ts", 'export const y = unstable_cache(async () => pure(rows), ["k2"]);\nfunction pure(r) { return r.map((q) => q.updatedAt.getTime()); }']]);
  const out = transitiveOffenders(files, new Set(["getSealedGroups"])); assert.equal(out.length, 1); assert.match(out[0]!, /a\.ts.*buildRows -> middle -> getSealedGroups/);
  const deep = new Map([["c.ts", 'const z = unstable_cache(async () => one(), ["k"]);\nfunction one() { return two(); }\nfunction two() { return three(); }\nfunction three() { return planeJson("x.json"); }']]); assert.equal(transitiveOffenders(deep, new Set()).length, 1);
  const tooDeep = new Map([["d.ts", 'const z = unstable_cache(async () => one(), ["k"]);\nfunction one() { return two(); }\nfunction two() { return three(); }\nfunction three() { return four(); }\nfunction four() { return planeJson("x.json"); }']]); assert.equal(transitiveOffenders(tooDeep, new Set()).length, 0, "beyond three hops is out of scope (documented)");
});
test("RULE 5: a ranking key carries the data commit and never a tier, a viewer or a user", () => {
  assert.equal(keyOffenders('unstable_cache(fn, rankKey("deal-rank-v1", ref, country, sort), { tags: [] })').length, 0);
  assert.equal(keyOffenders('unstable_cache(fn, ["deal-rank-v1", ref, country, sort], { tags: [] })').length, 0);
  assert.ok(keyOffenders('unstable_cache(fn, ["deal-rank-v1", ref, country, who.tier], {})').length >= 1, "a tier in the key splits the cache per tier");
  assert.ok(keyOffenders('unstable_cache(fn, ["rise-v1", scope, userId], {})').length >= 1);
  assert.ok(keyOffenders('unstable_cache(fn, ["deal-rank-v1", country, sort], {})').some((x) => /data commit/.test(x)), "a ranking cached without the ref survives a publish and serves yesterday");
  assert.equal(keyOffenders('unstable_cache(fn, ["library-decks-v2"], { tags: ["published-decks"] })').length, 0, "a Neon-backed cache needs no ref");
});

// ── the repository ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("RULE 1: unstable_cache is only used under src/lib/data/", () => {
  const offenders = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(path.join("src", "lib", "data") + path.sep)).filter((f) => /unstable_cache\s*\(/.test(stripNonCode(fs.readFileSync(f, "utf8")))).map((f) => path.relative(SRC, f));
  assert.deepEqual(offenders, []);
});
test("RULE 2: no request path imports the Prisma client directly", () => {
  const offenders = walk(path.join(SRC, "app")).filter((f) => /\.(ts|tsx)$/.test(f)).filter((f) => /from "@\/lib\/db"/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(SRC, f));
  assert.deepEqual(offenders, []);
});
test("RULES 3 and 4 over src/lib/data: no loader or plane read inside any unstable_cache callback, directly or up to three hops away", () => {
  const sources = new Map(dataFiles(ROOT).map((f) => [path.relative(ROOT, f), fs.readFileSync(f, "utf8")] as const)); const direct: string[] = [];
  for (const [f, s] of sources) for (const o of callbackOffenders(s)) direct.push(`${f}: ${o}`);
  assert.deepEqual(direct, [], "inside unstable_cache the callback is pure CPU over data resolved before the closure; Next bypasses an inner cache AND a nested fetch there");
  const selfCached = new Set<string>(); for (const s of sources.values()) for (const m of s.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?function\s+(get[A-Z]\w*)/g)) selfCached.add(m[1]!);
  assert.deepEqual(transitiveOffenders(sources, selfCached), []);
});
test("RULE 5 over src/lib/data: plane data is cached by the pinned fetch; unstable_cache around it only for the computed rankings, tier-neutral and keyed by the data commit", () => {
  const offenders: string[] = [];
  for (const f of dataFiles(ROOT)) { const s = fs.readFileSync(f, "utf8"); for (const o of keyOffenders(s)) offenders.push(`${path.relative(ROOT, f)}: ${o}`);
    if (/from ["'](?:\.\/plane|@\/lib\/data\/plane|\.\.\/plane)/.test(s)) for (const c of cacheCalls(stripNonCode(s))) { const name = /["']([a-z-]+-v\d+)["']/.exec(splitArgs(c.args).key)?.[1]; if (!name || !ALLOWED_PLANE_CACHES.includes(name)) offenders.push(`${path.relative(ROOT, f)} line ${c.line}: unstable_cache in a module that reads the plane, with key ${name ?? "(none)"}: only ${ALLOWED_PLANE_CACHES.join(", ")} may wrap plane data (an unstable_cache around a plane read double-stringifies it: ceiling 1.95 MB against 1.57 MB for the fetch itself, and orphans its entries at every deploy)`); } }
  assert.deepEqual(offenders, []);
});
test("RULE 6: data/index.ts is a pure barrel that re-exports every public module", () => {
  const idx = path.join(ROOT, "src/lib/data/index.ts"); if (!fs.existsSync(idx)) return;
  const code = fs.readFileSync(idx, "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("//")); assert.ok(code.every((l) => /^export \* from "\.\/[a-z-]+";$/.test(l.trim())), "only `export * from` lines");
  const exported = new Set(code.map((l) => /"\.\/([a-z-]+)"/.exec(l)![1]));
  const missing = dataFiles(ROOT).filter((f) => path.dirname(f) === path.join(ROOT, "src/lib/data")).map((f) => path.basename(f)).filter((b) => !INTERNAL.has(b)).map((b) => b.replace(/\.ts$/, "")).filter((m) => !exported.has(m));
  assert.deepEqual(missing, []);
});
test("RULE 6: every data module declares its owner and no two modules export the same name", () => {
  const seen = new Map<string, string>(); const dup: string[] = []; const noOwner: string[] = [];
  for (const f of dataFiles(ROOT)) {
    const b = path.relative(path.join(ROOT, "src/lib/data"), f).replace(/\\/g, "/"); if (b === "index.ts" || b === "api.ts") continue;
    const src = fs.readFileSync(f, "utf8"); if (!/owner:? WP\d\d/.test(src.split("\n").slice(0, 3).join("\n"))) noOwner.push(b);
    if (INTERNAL.has(b) || b.startsWith("plane/")) continue;
    for (const m of src.matchAll(/^export (?:declare )?(?:async )?(?:const|function|interface|type|class)\s+([A-Za-z0-9_]+)/gm)) { const prev = seen.get(m[1]!); if (prev && prev !== b) dup.push(`${m[1]} in ${prev} and ${b}`); else seen.set(m[1]!, b); }
  }
  assert.deepEqual(noOwner, []); assert.deepEqual(dup, []);
});
