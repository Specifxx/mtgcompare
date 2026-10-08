// HISTORY EGRESS (owner WP19, parity P02; ported from RiftCompare's history-egress test, whose history project exhausted its transfer allowance more than once: "the cause was never a single expensive query, it was cheap
// queries re-run far more often than the data underneath them changed"). Price history is not in a database any more: it is files of the data repository (hist/p: a unit's base, 64 ids a file; hist/t: the days after the cut,
// 512 ids a file; hist/w: weekly closes; hist/index.json), read through a pinned fetch with no tag. What can still burn is (1) a history table coming back to Postgres, (2) a chart or a list that reads more files than the
// arithmetic of contract 12.7.3 allows, (3) a cache that is purged by a clock or a tag and so re-reads files that cannot have changed. These tests pin all three. The audit that measures the Neon half is scripts/audit-egress.ts,
// whose budgets and table lists this file also keeps honest (Annex C check 16: "egress-audit.yml reports no query above its budget").
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, ratchet, stripComments, summary, walk } from "./helpers/ratchet";
import { PRIVATE_TABLES, QUERY_BUDGETS, RETIRED_TABLES, budgetFor, evaluate, tablesOf, opOf, cadenceOf, CADENCE_LIMIT, DAILY_EGRESS_BUDGET_BYTES, type Shape } from "../scripts/audit-egress";
import { HIST_BUCKET, TAIL_BUCKET, bucketPath, histBucket, tailBucket } from "../src/lib/data/plane/shards";
import { writeFixtureTree } from "../scripts/smoke-pages";
import { miniCards } from "./helpers/plane-tree";
import { PRICE_MASK } from "../src/lib/constants";

const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── 1. Postgres holds no price history ──────────────────────────────────────────────────────────────────────────────────────
const MODELS = [...read("prisma/schema.prisma").matchAll(/^model (\w+) \{/gm)].map((m) => m[1]!);
test("the schema has exactly the 28 private models, and the egress audit lists exactly those", () => {
  assert.equal(MODELS.length, 28);
  assert.deepEqual([...PRIVATE_TABLES].sort(), [...MODELS].sort(), "scripts/audit-egress.ts PRIVATE_TABLES is the schema: a table missing from the list is reported as 'not one of the private tables', a stale one hides a retired table");
});
test("no model keeps a price series: the only event log is ClickEvent, and it is swept", () => {
  const history = MODELS.filter((m) => /^(?:PriceHistory|PriceSnapshot|PriceSeries|Snapshot|CardPrice|PriceChange|Offer|RetailerPrice|Card|Sealed|Set|Oracle|Retailer)$/.test(m));
  assert.deepEqual(history, [], "public data is files (C24): the catalogue, the prices and their history are published, never rows");
  const dbAudit = read("scripts/db-audit.ts");
  assert.match(dbAudit, /CLICK_RETENTION_DAYS\s*=\s*90/, "click events are kept 90 days (Annex C check 28)");
  assert.ok(MODELS.includes("ClickEvent") && MODELS.includes("DemandDay") && MODELS.includes("CardStat"), "the three counter/event tables of 12.12");
});
test("RATCHET: no source or script reads a retired table, through the client or as raw SQL (the One Piece code that still does is the migration to the files)", () => {
  const retired = Object.keys(RETIRED_TABLES), files = new Set<string>(), why: string[] = [];
  for (const f of walk("src", (x) => /\.tsx?$/.test(x)).concat(walk("scripts", (x) => /\.tsx?$/.test(x)))) {
    if (f === "scripts/audit-egress.ts" || f === "scripts/db-audit.ts") continue;                                   // they name the retired tables to refuse them
    const src = stripComments(read(f));
    for (const t of retired) {
      const model = t[0]!.toLowerCase() + t.slice(1);
      if (new RegExp(`\\b(?:prisma|db|tx)\\.${model}\\.(?:find|count|aggregate|group|create|update|upsert|delete)`).test(src)) { files.add(f); why.push(`${f}: prisma.${model}`); }
      if (new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE)\\s+"?(?:public"?\\.)?"?${t}"?\\b`).test(src)) { files.add(f); why.push(`${f}: raw SQL on ${t}`); }
    }
  }
  const r = ratchet("history-egress:retired tables", [...files]);
  if (files.size) console.log(`history-egress retired tables: ${summary(r)}`);
  assert.ok(r.ok, `${r.failures.join("\n")}\n${why.slice(0, 8).join("\n")}`);
});

// ── 2. the budgets can fail, and the history files are read at the rate the arithmetic says ─────────────────────────────────
test("the audit's evaluator can fail: rows per call, calls per day, a retired table, an unknown table, and passes a statement inside its budget", () => {
  const sh = (query: string, calls: number, rows: number): Shape => ({ queryid: "1", calls, rows, query });
  const ev = (s: Shape, windowDays = 1) => evaluate([s], { windowDays }).findings.map((f) => f.code);
  assert.deepEqual(ev(sh('SELECT * FROM "public"."PriceAlert" WHERE "userId" = $1', 300, 900)), [], "3 rows a call, 300 calls a day: a member's own alerts");
  assert.deepEqual(ev(sh('SELECT * FROM "public"."PriceAlert"', 10, 50_000_00)), ["ROWS_PER_CALL"], "an unbounded select of a member table");
  assert.deepEqual(ev(sh('SELECT "id" FROM "public"."Notification" WHERE "userId" = $1', 900_000, 900_000)), ["CALLS_PER_DAY"]);
  assert.deepEqual(ev(sh('SELECT * FROM "public"."PriceHistory" WHERE "cardId" = $1', 5, 5)), ["RETIRED_TABLE"], "price history back in Postgres");
  assert.deepEqual(ev(sh('SELECT * FROM "public"."Mystery"', 5, 5)), ["UNKNOWN_TABLE"]);
  assert.deepEqual(ev(sh("SELECT * FROM pg_stat_activity", 99_999_999, 99_999_999)), [], "platform noise is counted, never budgeted");
  assert.deepEqual(ev(sh('SELECT "id" FROM "public"."Notification"', 900_000, 900_000), 0.01).map((c) => c), ["CALLS_PER_DAY"], "a short window projects (a warning, not an error)");
  assert.equal(evaluate([sh('SELECT 1 FROM "public"."Notification"', 900_000, 1)], { windowDays: 0.01 }).findings[0]?.level, "warn");
  assert.deepEqual(tablesOf('UPDATE "public"."User" SET "x" = 1 FROM "public"."Counter" WHERE 1'), ["User", "Counter"]);
  assert.equal(opOf("  WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x"), "insert");
});
test("every private table has a budget (the default covers the rest), and the tightest budget wins on a join", () => {
  for (const t of PRIVATE_TABLES) assert.ok(budgetFor([t], "select").maxRowsPerCall > 0, t);
  assert.equal(budgetFor(["NewsletterSubscriber", "ImportRun"], "select").id, "ops-rows", "a statement touching a tight table is judged by that table");
  assert.equal(budgetFor(["User", "ImportRun"], "select").id, "session", "and the tightest of two tight ones");
  assert.equal(budgetFor(["NewsletterSubscriber"], "delete").id, "default");
  assert.ok(QUERY_BUDGETS.filter((b) => b.tables.includes("*")).length === 1, "exactly one default budget");
  const perDay = QUERY_BUDGETS.reduce((s, b) => s + (b.tables.includes("*") ? 0 : 1), 0);
  assert.ok(perDay >= 8, "the budgets name the real traffic classes of 12.12");
  assert.equal(DAILY_EGRESS_BUDGET_BYTES, Math.round(((5 * 1024 ** 3) / 30) * 0.6), "Neon Free: 5 GB a month; the daily budget is 60% of an even share, the rest is headroom for a publish day and a bad crawl");
});
test("the deploy cadence counter counts subjects only, in the window, and fails above the weekly release plus one urgent", () => {
  const lines = ["2026-10-06|Weekly release [deploy]", "2026-10-05|add a thing", "2026-10-05|Fix stock [DEPLOY] urgent", "2026-10-04|docs: explain the gate\n"];
  assert.equal(cadenceOf(lines).total, 2);
  assert.equal(cadenceOf(lines).ok, true);
  assert.equal(cadenceOf([...lines, "2026-10-07|another [deploy]"]).ok, false, `more than ${CADENCE_LIMIT} in seven days`);
  assert.equal(cadenceOf(["2026-10-06|a body that mentions [deploy] is not the subject|x"]).total, 1, "a marker after the first | is still the subject (the format puts the date first)");
  assert.equal(cadenceOf(["no separator [deploy]"]).total, 0);
});
test("a chart costs two files, a list of 48 sparklines costs the distinct buckets, and an untracked unit costs none; a second look costs nothing", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "he-"));
  const prevDir = process.env.PLANE_DIR, prevRepo = process.env.PLANE_REPO, prevPhase = process.env.NEXT_PHASE;
  const realRead = fs.readFileSync, seen: string[] = [];
  try {
    writeFixtureTree(dir);
    delete process.env.PLANE_REPO; delete process.env.NEXT_PHASE; process.env.PLANE_DIR = dir;
    const { resetPlaneForTests } = await import("../src/lib/data/plane/runtime");
    const { getUnitHistory, getSparklines } = await import("../src/lib/data/history");
    resetPlaneForTests();
    (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = ((p: fs.PathOrFileDescriptor, ...rest: unknown[]) => { if (typeof p === "string" && p.startsWith(dir)) seen.push(p.slice(dir.length + 1)); return (realRead as (...a: unknown[]) => unknown)(p, ...rest); }) as typeof fs.readFileSync;
    const hist = (): string[] => seen.filter((f) => /^v1\/hist\/[pt]\//.test(f));
    const cards = miniCards({ day: 3 }), tracked = cards.filter((c) => c.mask & PRICE_MASK.TRACKN), untracked = cards.find((c) => !(c.mask & (PRICE_MASK.TRACKN | PRICE_MASK.TRACKF)))!;
    assert.ok(tracked.length > 60, "the fixture has tracked units to read");
    const one = tracked[0]!;
    const series = await getUnitHistory({ id: one.id, finish: "N" }, 365);
    assert.ok(series.length > 5, "the chart has points");
    assert.deepEqual(hist().sort(), [`v1/${bucketPath("hist/p", histBucket(one.id))}`, `v1/${bucketPath("hist/t", tailBucket(one.id))}`].sort(), "one base file and one tail file: 12.7.3 round 3");
    seen.length = 0;
    await getUnitHistory({ id: one.id, finish: "N" }, 365);
    assert.deepEqual(hist(), [], "the files are memoised for the instance: the same chart again reads nothing");
    seen.length = 0;
    const many = tracked.slice(0, 48).map((c) => ({ id: c.id, finish: "N" as const }));
    const want = new Set(many.map((u) => histBucket(u.id))), wantT = new Set(many.map((u) => tailBucket(u.id)));
    await getSparklines(many, 30);
    assert.ok(hist().length <= want.size + wantT.size + 2, `48 sparklines read ${hist().length} history files; the distinct buckets are ${want.size} + ${wantT.size}`);
    assert.equal(new Set(hist()).size, hist().length, "no file twice");
    seen.length = 0;
    assert.deepEqual(await getUnitHistory({ id: untracked.id, finish: "N" }, 365), []);
    assert.deepEqual(hist(), [], "an untracked unit is ruled out by the bucket list: it costs no request");
  } finally {
    (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = realRead;
    if (prevDir === undefined) delete process.env.PLANE_DIR; else process.env.PLANE_DIR = prevDir;
    if (prevRepo !== undefined) process.env.PLANE_REPO = prevRepo;
    if (prevPhase !== undefined) process.env.NEXT_PHASE = prevPhase;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("the bucket arithmetic the budgets assume has not moved: 64 ids per base file, 512 per tail, a tail covering eight bases", () => {
  assert.equal(HIST_BUCKET, 64); assert.equal(TAIL_BUCKET, 512); assert.equal(TAIL_BUCKET / HIST_BUCKET, 8);
  assert.equal(bucketPath("hist/p", 130), "hist/p/2/130.json");
});

// ── 3. nothing re-reads history on a clock or a tag ─────────────────────────────────────────────────────────────────────────
test("history is read by the pinned plane fetch alone: no unstable_cache, no tag, no clock-keyed key in the history readers", () => {
  for (const f of ["src/lib/data/history.ts", "src/lib/history.ts"]) {
    const src = stripComments(read(f));
    assert.doesNotMatch(src, /unstable_cache|revalidateTag|\btags\s*:/, `${f}: a cache wrapper or a tag on history is how a daily purge turns into a daily re-read`);
    assert.doesNotMatch(src, /Date\.now\(\)|new Date\(\)\.to(?:ISO|Date)String|dayKey/, `${f}: nothing keyed on the clock: the data commit names the version`);
  }
  // the one-day-old answer is the pointer's: every key that wraps plane data carries `ref` (tests/nested-cache.test.ts rule 5); here, that no key anywhere in the data layer is a clock day
  for (const f of walk("src/lib/data", (x) => /\.ts$/.test(x))) assert.doesNotMatch(stripComments(read(f)), /unstable_cache\([^)]*\[[^\]]*(?:Date|dayKey|sydneyDayKey|toISOString)/, `${f}: a clock-keyed cache key`);
  for (const f of walk("src/lib/data/plane", (x) => /\.ts$/.test(x))) assert.doesNotMatch(stripComments(read(f)), /\bpg_|\$queryRaw|\$executeRaw/, `${f}: the plane reads files, never the database`);
});
