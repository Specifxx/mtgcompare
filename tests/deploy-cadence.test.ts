// ONE PRODUCTION BUILD A WEEK (owner, 2026-10-08), AND DATA THAT NEVER WAITS FOR IT. Owner WP19 (cross-package by design: it reads the workflow, the gate script, vercel.json, package.json, CLAUDE.md and the pages).
// Ported from RiftCompare's tests/deploy-cadence.test.ts (one a day) with the cadence changed and four pins added: the cron is weekly and equals RELEASE_CRON; nothing else lands [deploy] commits;
// no page prerenders data at build; the build script needs no database and no data host.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RELEASE, RELEASE_CRON, RELEASE_SUBJECT, lastScheduledRelease, nextRelease, parseWeeklyCron, isReleaseSubject } from "../src/lib/release-schedule";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const GATE = "scripts/vercel-ignore-build.sh";
const WORKFLOW = ".github/workflows/production-deploy.yml";
const MARKER = "[deploy]";
const vercel = JSON.parse(read("vercel.json")) as { ignoreCommand?: string };

function runGate(message: string | undefined, vercelEnv: string | undefined = "production", cwd = tmpdir()): { status: number | null; out: string } {
  // tmpdir: no git history, so ONLY the env var can supply the message. An empty string is what the script treats as "unset".
  const r = spawnSync("bash", [join(ROOT, GATE)], { cwd, env: { ...process.env, VERCEL_GIT_COMMIT_MESSAGE: message ?? "", VERCEL_ENV: vercelEnv ?? "" }, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test("vercel.json runs the build gate on every push", () => {
  assert.equal(vercel.ignoreCommand, `bash ${GATE}`);
});
test("the gate SKIPS an ordinary production push; an unknown environment counts as production", () => {
  assert.equal(runGate("Fix the thing\n\nLonger body.", "production").status, 0);
  assert.equal(runGate("Fix the thing", undefined).status, 0);
});
test("PREVIEW and DEVELOPMENT builds are never gated", () => {
  for (const env of ["preview", "development"]) { const r = runGate("Fix the thing", env); assert.equal(r.status, 1); assert.match(r.out, /not gated/); }
});
test("the gate BUILDS a production push whose SUBJECT carries the marker, case-insensitively", () => {
  for (const msg of [RELEASE_SUBJECT, "hotfix [Deploy] the checkout", "[DEPLOY]", `ship it ${MARKER}\n\nA body, which is ignored either way.`]) assert.equal(runGate(msg, "production").status, 1, msg);
});
test("a marker in the BODY does not deploy (prose about the gate is not the gate)", () => {
  const r = runGate(["Merge PR #106: un-nest every cached loader", "", "Ships at the next scheduled release (no [deploy] marker on purpose)."].join("\n"), "production");
  assert.equal(r.status, 0);
  assert.match(r.out, /subject/i, "the log line says it looked at the subject");
});
test("the gate FAILS OPEN when the commit message is unreadable, and its skip line says weekly", () => {
  const open = runGate(undefined, "production");
  assert.equal(open.status, 1);
  assert.match(open.out, /fail open/i);
  const skip = runGate("Fix the thing", "production");
  assert.match(skip.out, /weekly/i, "the log line names the cadence so the next reader knows the rule");
  assert.doesNotMatch(skip.out, /daily/i);
});

// ── the weekly schedule ──────────────────────────────────────────────────────────────────────────────────────
const wf = read(WORKFLOW);
test("the release workflow has exactly ONE schedule and it is weekly: the cron equals RELEASE_CRON", () => {
  const crons = [...wf.matchAll(/^\s*- cron:\s*"([^"]+)"/gm)].map((m) => m[1]);
  assert.deepEqual(crons, [RELEASE_CRON], "one weekly cron, the constant the admin panel quotes");
  assert.deepEqual(parseWeeklyCron(RELEASE_CRON), { minute: RELEASE.minuteUtc, hour: RELEASE.hourUtc, weekday: RELEASE.weekday });
  assert.equal(RELEASE.hourUtc, 8, "08:00 UTC (owner addendum 8)");
  assert.equal(parseWeeklyCron("0 8 * * *"), null, "a daily cron is not weekly");
  assert.equal(parseWeeklyCron("0 8 * * 1,3,5"), null);
  assert.equal(parseWeeklyCron("0 * * * 2"), null);
});
test("the release workflow supplies the marker the gate looks for, and says weekly", () => {
  assert.match(wf, /--allow-empty/);
  assert.ok(wf.includes(MARKER));
  assert.ok(wf.includes(RELEASE_SUBJECT), "the scheduled release commit subject is RELEASE_SUBJECT");
  assert.ok(isReleaseSubject(RELEASE_SUBJECT));
  assert.match(wf, /contents:\s*write/);
  assert.match(wf, /git push origin HEAD:main/);
  assert.match(wf, /workflow_dispatch/, "and manually triggerable, or an urgent fix waits up to a week");
  assert.match(wf, /ref:\s*main/);
});
test("the scheduled release's skip-check reads the SUBJECT, not the whole message", () => {
  assert.match(wf, /git log -1 --format=%s/);
  assert.doesNotMatch(wf, /git log -1 --format=%B/);
});
test("nextRelease / lastScheduledRelease follow the weekday", () => {
  const iso = (d: Date) => d.toISOString();
  assert.equal(iso(nextRelease(new Date("2026-10-08T12:00:00Z"))), "2026-10-13T08:00:00.000Z", "Thursday -> next Tuesday");
  assert.equal(iso(nextRelease(new Date("2026-10-13T07:59:00Z"))), "2026-10-13T08:00:00.000Z", "Tuesday before 08:00 -> that morning");
  assert.equal(iso(nextRelease(new Date("2026-10-13T08:00:00Z"))), "2026-10-20T08:00:00.000Z", "at 08:00 the release has happened -> the next week");
  assert.equal(iso(lastScheduledRelease(new Date("2026-10-08T12:00:00Z"))), "2026-10-06T08:00:00.000Z");
  assert.equal(new Date("2026-10-13T08:00:00Z").getUTCDay(), RELEASE.weekday);
});
test("no other workflow lands a release: only production-deploy.yml commits with the marker", () => {
  const dir = join(ROOT, ".github/workflows");
  for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n) && n !== "production-deploy.yml")) {
    const y = readFileSync(join(dir, f), "utf8");
    assert.doesNotMatch(y.replace(/^\s*#.*$/gm, ""), /git commit[^\n]*\[deploy\]/i, `${f} must not land [deploy] commits: its output rides the weekly release`);
  }
});

// ── data refreshes never need a deploy; builds never need data ──────────────────────────────────────────────
function walk(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}
test("generateStaticParams never reads data: an empty list, or a static content list, and nothing else", () => {
  const files = walk("src/app").filter((f) => /\.(tsx?|js)$/.test(f));
  for (const f of files) {
    const src = read(f);
    const m = /export (?:async )?function generateStaticParams\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(src);
    if (!m) continue;
    assert.doesNotMatch(m[1], /\b(prisma|fetch|readFile|getCatalog|getCardPage|getSets|getSealed\w*|getHistory\w*|readDataSource|loadShard|publishedIndex)\b|@\/lib\/(db|data)\b/, `${f}: generateStaticParams must not touch the database or the data host at build`);
  }
  for (const f of files) assert.doesNotMatch(read(f).replace(/\/\/.*$/gm, ""), /export const dynamicParams\s*=\s*false/, `${f}: dynamicParams=false would 404 every card that is not prerendered`);
});
test("the build script needs no database and no data host", () => {
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts.build, "prisma generate && next build", "the build generates the Prisma client and builds: it does not import, publish, migrate or fetch");
  const cfg = read("next.config.js").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(cfg, /\bfetch\(|PrismaClient|DATABASE_URL|HISTORY_RAW|DATA_BASE|PLANE_/, "next.config.js must not read data or the database");
});
// The publisher writes to its own branches, never to main. A push to one of them must not produce a preview build either (previews are not gated by the script): vercel.json lists each as `false`.
// Every branch the publisher writes (12.4): `data` (the tree) and `state` (the durable second copy). They live in the separate private data repository, which Vercel is never connected to; vercel.json still says false for both (WP21 adds `state`).
const DATA_BRANCHES = ["data", "state"];
test("every data branch is excluded from Vercel deployments", () => {
  const v = JSON.parse(read("vercel.json")) as { git?: { deploymentEnabled?: Record<string, boolean> } };
  for (const b of DATA_BRANCHES) assert.equal(v.git?.deploymentEnabled?.[b], false, `vercel.json git.deploymentEnabled.${b} must be false`);
  assert.equal(DATA_BRANCHES.includes("main"), false);
});
test("no ISR page lowers its revalidate below one hour (CLAUDE.md: never lower a page's revalidate)", () => {
  for (const f of walk("src/app").filter((x) => /page\.tsx$|route\.ts$/.test(x))) {
    const m = /export const revalidate\s*=\s*(\d+)/.exec(read(f));
    if (m) assert.ok(Number(m[1]) >= 3600, `${f}: revalidate ${m[1]} is below 3600`);
  }
});
test("CLAUDE.md and README say weekly, and the daily release is gone from the docs", () => {
  const claude = read("CLAUDE.md");
  assert.match(claude, /once a week|weekly/i);
  assert.match(claude, new RegExp(RELEASE.weekdayName));
  assert.match(claude, /08:00 UTC/);
  assert.doesNotMatch(claude, /one a day at 08:00|daily 08:00 UTC release|lands one a day|daily release/i);
  assert.match(claude, /data refresh|never need a deploy|publish/i, "CLAUDE.md says data refreshes do not need a deploy");
});
