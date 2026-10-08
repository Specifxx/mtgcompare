// THE DATABASE MIGRATION GUARD (owner WP19, parity P06 and P08). Ported from RiftCompare, whose Neon projects were recycled eleven times; adapted to ONE database that holds private state only (public data is files and moves nothing).
//
// `pg_restore --clean` recreates every object FROM THE DUMP, so a project-to-project migration necessarily installs the SOURCE project's schema onto the target, which is OLDER than the repository's the moment any schema change
// lands after the source last received a push. On 2026-08-20 in RiftCompare a column added seven seconds before the cutover was pushed to the new project and then dropped again by the restore, leaving deployed code selecting a
// column that no longer existed; it was re-added only because an unrelated push ran afterwards. Luck, not design. The migration step must therefore END by pushing the repository's schema at the target.
// This is a source-level assertion because the failure is silent: the migration reports success, every row count matches, and the break surfaces later as a 500 on whichever page selects the missing column.
import test from "node:test";
import assert from "node:assert/strict";
import fs, { readFileSync } from "node:fs";
import path, { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const YML = read(".github/workflows/maintenance.yml");

/** Each `- name:` block of the job is one workflow step; slicing on that boundary keeps an assertion about one step from being satisfied by a different step's text. */
export function stepsOf(src: string): { name: string; body: string }[] {
  return src.split(/\n {6}- name: /).slice(1).map((p) => ({ name: p.slice(0, p.indexOf("\n")).trim(), body: p }));
}
const STEP = stepsOf(YML).find((s) => /^Migrate the database/.test(s.name));

test("maintenance.yml has the migration step, and it is the only place a restore happens", () => {
  assert.ok(STEP, 'expected a step named "Migrate the database ..."');
  const restores = YML.split("\n").filter((l) => /^\s*pg_restore --/.test(l));                       // a command line, not the comment that explains it
  assert.equal(restores.length, 1, "one restore, in the migration step");
  assert.ok(STEP!.body.includes(restores[0]!.trim()));
  assert.match(YML, /task:[\s\S]{0,200}options:[\s\S]{0,200}- migrate-database/, "it is a named task of the workflow_dispatch menu");
  assert.match(YML, /if: inputs\.task == 'migrate-database'/);
});
test("the migration step re-pushes the schema of this ref after restoring, over the DIRECT endpoint, aimed explicitly at the target", () => {
  const body = STEP!.body;
  // over Neon's PgBouncer host `prisma db push` introspects an empty schema and aborts with P1014 "the underlying table for model X does not exist" even when the restore just verified that table row for row
  assert.match(body, /DIRECT_TARGET_URL="\$\{TARGET_DATABASE_URL\/-pooler\/\}"/, "derive a direct (non-pooled) URL: a pooled push fails P1014 against a freshly restored database");
  assert.match(body, /DATABASE_URL="\$DIRECT_TARGET_URL" bash scripts\/db-push-safe\.sh/, "the restore leaves the SOURCE's older schema behind: push the repository's schema at the target before anyone deploys");
  // Prisma reads DATABASE_URL and nothing else; a bare push in this step would migrate the wrong project
  const bare = body.replace(/DATABASE_URL="\$DIRECT_TARGET_URL" bash scripts\/db-push-safe\.sh/g, "").split("\n").filter((l) => /db[- ]push/.test(l) && !/^\s*#/.test(l) && !/::error::|echo /.test(l));
  assert.deepEqual(bare, [], "every push in this step is aimed explicitly at the target");
  // the order matters: the push is the LAST thing that changes the target
  assert.ok(body.indexOf("pg_restore --no-owner") < body.indexOf("scripts/db-push-safe.sh"), "restore first, push after");
  assert.ok(body.indexOf("Verifying row counts") < body.indexOf("scripts/db-push-safe.sh"), "verify what was restored before changing it");
});
test("a failed schema re-push fails the migration job loudly and says what not to do next", () => {
  const body = STEP!.body;
  assert.match(body, /::error::schema push against the target FAILED/);
  assert.match(body, /Do NOT deploy until this succeeds/, "the error must say what not to do next");
  assert.match(body, /schema push against the target FAILED[\s\S]{0,300}exit 1/, "and the step exits non-zero");
});
test("row counts are enumerated from the database, never hand-listed, and no table is excused", () => {
  const body = STEP!.body, verify = body.slice(body.indexOf("Verifying row counts"));
  assert.ok(verify.length > 0, "expected a row-count verification block");
  // A hand-maintained list cannot mention a table added since it was written. After RiftCompare's 2026-08-20 migration the three newest tables were restored but never verified because they were not in the nine names typed out.
  assert.match(verify, /FROM pg_tables WHERE schemaname='public'/, "enumerate the source's tables");
  assert.doesNotMatch(verify, /for T in 'public\."User"'/, "a hard-coded list silently skips every table added since it was written");
  assert.match(body, /could not enumerate source tables/, "an empty enumeration must fail, not silently verify nothing");
  // RiftCompare excluded the history tables (a second project held them). Here there is ONE database and one rule: every table is copied and every table is compared.
  assert.doesNotMatch(body, /tablename NOT IN|--exclude-table|--exclude-table-data/, "nothing is excluded from the dump or from the comparison");
  assert.match(verify, /MISMATCH/, "a mismatch is reported");
  assert.match(body, /do NOT switch DATABASE_URL to the target yet/, "and says not to switch");
});
test("the migration refuses the dangerous cases before it touches anything", () => {
  const body = STEP!.body;
  assert.match(body, /"\$SOURCE_DATABASE_URL" = "\$TARGET_DATABASE_URL"[\s\S]{0,200}exit 1/, "source and target the same database");
  assert.match(body, /inputs\.overwrite_target\s*\}\}" != "true"[\s\S]{0,300}exit 1/, "a target that already holds member rows is not wiped without overwrite_target");
  assert.match(body, /the SOURCE project is unreachable[\s\S]{0,120}The target has NOT been touched/, "an unreachable source (its transfer allowance may be spent) stops before the target is touched");
  assert.match(body, /pg_dump FAILED[\s\S]{0,160}a partial dump is never restored/, "a failed dump is never restored");
  assert.match(body, /the dump has no data section for table \$T/, "an incomplete dump is never restored");
  for (const t of ["User", "PriceAlert", "CollectionCard"]) assert.match(body, new RegExp(`\\b${t}\\b`), `the pre-flight and the completeness check name ${t}`);
});
test("without both databases the migration is a green no-op and says which one is missing", () => {
  assert.match(STEP!.body, /\[ -z "\$\{SOURCE_DATABASE_URL:-\}" \] \|\| \[ -z "\$\{TARGET_DATABASE_URL:-\}" \][\s\S]{0,300}exit 0/);
  assert.match(STEP!.body, /green no-op/);
  assert.match(YML, /TARGET_DATABASE_URL:\s*\$\{\{\s*secrets\.TARGET_DATABASE_URL\s*\}\}/, "the target is an Actions secret, never a repository variable and never on Vercel");
});
test("the PostgreSQL client matches the server (Neon runs a current major) and comes from the vendor repository", () => {
  const major = /postgresql-client-(\d+)/.exec(STEP!.body)?.[1];
  assert.ok(major && Number(major) >= 16, `postgresql-client-${major}: an older pg_dump refuses a newer server`);
  assert.match(STEP!.body, /PATH="\/usr\/lib\/postgresql\/\d+\/bin:\$PATH"/);
});
test("the schema push the migration depends on is the one script, and it runs the post-push SQL", () => {
  const sh = read("scripts/db-push-safe.sh");
  assert.match(sh, /npx prisma db push --skip-generate/, "prisma db push");
  assert.match(sh, /prisma\/sql\/post-push\.sql/, "what Prisma cannot model (storage parameters, hand-made indexes) is re-applied after every push");
  assert.match(sh, /grep -vqE 'A unique constraint covering the columns \.\* will be added'/, "--accept-data-loss only for an added unique constraint: a drop or a type change still fails the run");
  assert.match(YML, /name: Push the schema of this ref[\s\S]{0,700}scripts\/db-push-safe\.sh/, "the schema-push task uses it too");
});
test("a task that is not the migration cannot reach the target", () => {
  for (const s of stepsOf(YML)) if (!/^Migrate the database/.test(s.name)) assert.doesNotMatch(s.body, /TARGET_DATABASE_URL/, `${s.name} must not see the target database`);
});

// ── the audit of the database the migration moves (scripts/db-audit.ts, parity P03; db-audit.yml): footprint, retention, ledger, launch promo, tiers, orphans ──────────────────────────────────────────────────────────────
import { CLICK_RETENTION_DAYS, FOOTPRINT_ERROR_BYTES, FOOTPRINT_WARN_BYTES, LAUNCH_PROMO_CAP, ORPHAN_COLUMNS, RUN_STALE_HOURS, evaluateDb, idSpaces, main as dbAudit, missingIds, type DbFacts } from "../scripts/db-audit";
import { hasTestDb, testDb } from "./helpers/pg";
import { miniCards, miniFull } from "./helpers/plane-tree";

const FACTS: DbFacts = { sizeBytes: 9 * 1024 ** 2, tables: [{ name: "User", rows: 10, bytes: 1 }], clickOld: 0, clickOldestDays: null, ebayOld: { best: 0, panel: 0 }, demandOld: 0, ledger: [], launchPromo: 12, badTier: [], premiumNoTier: 0, lastRunAt: "2026-10-08T00:00:00Z", orphans: [] };
const NOW = new Date("2026-10-08T12:00:00Z");
test("the database audit fires on each of its checks and is quiet on a small healthy database", () => {
  const f = (o: Partial<DbFacts>): string[] => evaluateDb({ ...FACTS, ...o }, NOW).map((x) => `${x.level}:${x.code}`);
  assert.deepEqual(f({}), [], "9 MB, no stale rows, a promo counter of 12, a run this morning");
  assert.deepEqual(f({ sizeBytes: FOOTPRINT_WARN_BYTES }), ["warn:FOOTPRINT"]); assert.deepEqual(f({ sizeBytes: FOOTPRINT_ERROR_BYTES }), ["error:FOOTPRINT"]);
  assert.equal(CLICK_RETENTION_DAYS, 90);
  assert.deepEqual(f({ clickOld: 5, clickOldestDays: 95 }), ["warn:CLICK_RETENTION"]); assert.deepEqual(f({ clickOld: 5, clickOldestDays: 120 }), ["error:CLICK_RETENTION"], "the daily sweep has not run for a month");
  assert.deepEqual(f({ ebayOld: { best: 1, panel: 0 } }), ["error:EBAY_RETENTION"], "the licence allows 72 hours");
  assert.deepEqual(f({ demandOld: 3 }), ["warn:DEMAND_RETENTION"]);
  assert.deepEqual(f({ ledger: [{ windowKey: "2026-10-08", cap: 1000, claimed: 1000, spent: 1001 }] }), ["error:EBAY_OVERSPEND"]);
  assert.deepEqual(f({ launchPromo: LAUNCH_PROMO_CAP + 1 }), ["error:LAUNCH_PROMO"]); assert.deepEqual(f({ launchPromo: LAUNCH_PROMO_CAP }), []);
  assert.deepEqual(f({ badTier: [{ tier: "gold", n: 2 }] }), ["error:TIER_VALUE"]); assert.deepEqual(f({ premiumNoTier: 1 }), ["error:PREMIUM_NO_TIER"]);
  assert.equal(RUN_STALE_HOURS, 36); assert.deepEqual(f({ lastRunAt: "2026-10-06T00:00:00Z" }), ["warn:RUN_STALE"]); assert.deepEqual(f({ lastRunAt: null }), ["warn:RUN_NONE"]);
  assert.deepEqual(f({ orphans: [{ table: "PriceAlert", column: "cardId", checked: 40, missing: [1, 2] }] }), ["error:ORPHAN"]);
});
test("the orphan sweep reads the id spaces of a published tree, and the columns it sweeps exist in the schema", () => {
  const spaces = idSpaces(miniFull({ day: 3 }));
  const first = miniCards({ day: 3 })[0]!.id;
  assert.ok(spaces.cards.size >= 600 && spaces.cards.has(first), "the cards of cat/");
  assert.deepEqual(missingIds([first, 999_999_999], "card", spaces), [999_999_999]);
  assert.deepEqual(missingIds([first], "sealed", spaces), [first], "a card id is not a sealed id");
  const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  for (const o of ORPHAN_COLUMNS) {
    const model = new RegExp(`^model ${o.table} \\{([\\s\\S]*?)^\\}`, "m").exec(schema)?.[1];
    assert.ok(model, `${o.table} is a model`); assert.match(model!, new RegExp(`^\\s+${o.column}\\s`, "m"), `${o.table}.${o.column} is a column`);
  }
  assert.ok(ORPHAN_COLUMNS.length >= 9, "every table that points at a product by number is swept (user rows carry no foreign key, 2.3)");
});
test("against a real database: planted stale rows are found, and an untouched database passes", { skip: !hasTestDb() }, async () => {
  const db = (await testDb())!;
  const key = `wp19-audit-${process.pid}`, promoBefore = await db.counter.findUnique({ where: { key: "launch-promo" } });     // restored afterwards: the table is shared with the launch-promo tests
  const run = async (): Promise<{ code: number; out: string }> => {
    const lines: string[] = [], log = console.log; console.log = (...a: unknown[]) => { lines.push(a.join(" ")); };
    const was = process.env.DATABASE_URL; process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;           // src/lib/db reads the process environment; a test database only
    try { const code = await dbAudit([], { DATABASE_URL: process.env.TEST_DATABASE_URL }); return { code, out: lines.join("\n") }; } finally { console.log = log; if (was === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = was; }
  };
  try {
    await db.clickEvent.deleteMany({ where: { id: { startsWith: key } } });
    const before = await run();
    assert.match(before.out, /Neon: [\d.]+ MB/, "it reports the footprint");
    await db.clickEvent.createMany({ data: [0, 1, 2].map((i) => ({ id: `${key}-${i}`, retailer: "store:test", page: "/card/x", country: "US", createdAt: new Date(Date.now() - 200 * 86_400_000) })) });
    await db.counter.upsert({ where: { key: "launch-promo" }, create: { key: "launch-promo", value: LAUNCH_PROMO_CAP + 7 }, update: { value: LAUNCH_PROMO_CAP + 7 } });
    const after = await run();
    assert.equal(after.code, 1);
    assert.match(after.out, /\[CLICK_RETENTION\]/); assert.match(after.out, /\[LAUNCH_PROMO\]/);
  } finally {
    await db.clickEvent.deleteMany({ where: { id: { startsWith: key } } }); if (promoBefore) await db.counter.update({ where: { key: "launch-promo" }, data: { value: promoBefore.value } }); else await db.counter.deleteMany({ where: { key: "launch-promo" } });
    await db.$disconnect();
  }
});
test("without a database the audit is a green no-op", async () => {
  const lines: string[] = [], log = console.log; console.log = (...a: unknown[]) => { lines.push(a.join(" ")); };
  try { assert.equal(await dbAudit([], {}), 0); } finally { console.log = log; }
  assert.match(lines.join("\n"), /green no-op/);
});
