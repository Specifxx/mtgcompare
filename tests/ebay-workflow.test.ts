// .github/workflows/ebay-prices.yml, the ONLY eBay workflow: four crons after RiftCompare's big jobs and clear of the import window, its own concurrency group (it never writes the data
// repository), read-only permissions, no push trigger, secrets scoped to the steps that need them, and a green skip when the eBay secrets are missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { EBAY_CRONS, MAIN_CRON } from "../src/lib/ebay-plan";
import { DATA_GROUP, IMPORT_WINDOW_UTC } from "../src/lib/schedule";

const ROOT = path.resolve(__dirname, "..");
const YML = fs.readFileSync(path.join(ROOT, ".github/workflows/ebay-prices.yml"), "utf8");
const CODE = YML.replace(/^\s*#.*$/gm, "");
const crons = (y: string) => [...y.matchAll(/- cron:\s*"([^"]+)"/g)].map((m) => m[1]!);
const minutes = (c: string) => { const [m, h] = c.split(" ").map(Number) as [number, number]; return h * 60 + m; };

test("exactly four scheduled runs, the plan's: banner-only at 04:37, 10:37 and 16:37, the MAIN pass at 23:37", () => {
  assert.deepEqual(crons(YML), [...EBAY_CRONS]);
  assert.equal(MAIN_CRON, "37 23 * * *");
});

test("no run falls in the import window (21:05 to 23:30 UTC) and none is at the top of the hour", () => {
  const [s, e] = [IMPORT_WINDOW_UTC.start, IMPORT_WINDOW_UTC.end].map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
  for (const c of crons(YML)) {
    assert.ok(minutes(c) < s! || minutes(c) > e!, `${c} is inside ${IMPORT_WINDOW_UTC.start}-${IMPORT_WINDOW_UTC.end}`);
    assert.notEqual(Number(c.split(" ")[0]), 0);
  }
  // the importer's own crons are the window's start
  const imp = fs.readFileSync(path.join(ROOT, ".github/workflows/import-prices.yml"), "utf8");
  for (const c of crons(imp)) assert.ok(minutes(c) >= s! - 1, `${c} opens the window`);
});

const job = (name: string) => {
  const start = YML.indexOf(`\n  ${name}:\n`);
  assert.ok(start > 0, `job ${name}`);
  const next = YML.slice(start + 1).search(/\n  [a-z][\w-]*:\n/);
  return next < 0 ? YML.slice(start) : YML.slice(start, start + 1 + next);
};

test("no push trigger, read-only, its own concurrency group on the eBay job only, never the data repository's", () => {
  const on = YML.slice(YML.indexOf("\non:"), YML.indexOf("\npermissions:"));
  assert.doesNotMatch(on, /^\s*push:/m);
  assert.doesNotMatch(on, /pull_request/);
  assert.doesNotMatch(CODE, /^concurrency:/m, "no workflow-level group: an unconfigured run never queues behind anything");
  assert.doesNotMatch(job("gate"), /concurrency:/);
  assert.match(job("ebay"), /concurrency:\s*\n\s*group: ebay-mtg\s*\n\s*cancel-in-progress: false/);
  assert.notEqual(DATA_GROUP, "ebay-mtg");
  assert.doesNotMatch(CODE, new RegExp(DATA_GROUP), "it never writes the data repository, so it shares no group with the writers");
  assert.match(job("ebay"), /needs: gate\s*\n\s*if: needs\.gate\.outputs\.run == 'true'/);
  assert.match(YML, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(CODE, /contents:\s*write|git push|git commit|actions\/upload-artifact/);
  assert.match(YML, /EBAY_REFRESH: \$\{\{ github\.event_name != 'push' \}\}/);
  assert.match(job("ebay"), /timeout-minutes: 60/);
});

test("the dispatch cap comes only from the max_calls input; a dispatched run can be forced or limited to a market", () => {
  assert.match(YML, /EBAY_DISPATCH_CAP: \$\{\{ inputs\.max_calls \}\}/);
  assert.doesNotMatch(YML, /vars\.EBAY_DISPATCH_CAP/);
  for (const k of ["force", "only_market", "max_calls"]) assert.match(YML, new RegExp(`\\n      ${k}:`));
  assert.match(YML, /EBAY_FORCE: \$\{\{ inputs\.force && '1' \|\| '' \}\}/);
  assert.match(YML, /EBAY_ONLY_MARKET: \$\{\{ inputs\.only_market \}\}/);
});

test("the owner's dials are variables, not secrets, and none is hard-coded", () => {
  for (const k of ["EBAY_API_ENABLED", "EBAY_DAILY_CALL_BUDGET", "EBAY_KEYSET_MODE", "EBAY_OBSERVE_ONLY", "EBAY_QUOTA_RESERVE", "EBAY_MAX_CALLS", "EBAY_MIN_VALUE_CENTS"]) {
    assert.match(job("ebay"), new RegExp(`${k}: \\$\\{\\{ vars\\.${k} \\}\\}`), k);
  }
});

test("secrets are scoped to the steps that need them: npm ci never sees one", () => {
  for (const name of ["gate", "ebay"]) {
    const j = job(name);
    assert.doesNotMatch(j.slice(0, j.indexOf("steps:")), /secrets\./, `job ${name}`);
  }
  const steps = job("ebay").split(/\n      - /).slice(1);
  const step = (re: RegExp) => steps.find((s) => re.test(s)) ?? "";
  assert.doesNotMatch(step(/run: npm ci/), /secrets\./);
  assert.doesNotMatch(step(/actions\/checkout/), /secrets\./);
  assert.match(step(/name: Sync schema/), /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/);
  assert.doesNotMatch(step(/name: Sync schema/), /EBAY_CLIENT|DATA_REPO_TOKEN|CRON_SECRET/);
  const read = step(/name: Read the published data/);
  assert.match(read, /DATA_REPO_TOKEN: \$\{\{ secrets\.DATA_REPO_TOKEN \}\}/);
  assert.match(read, /continue-on-error: true/, "an unreachable data repository never fails the run");
  assert.match(read, /scripts\/plane-checkout\.sh \.data/);
  assert.doesNotMatch(read, /EBAY_CLIENT/);
  assert.match(read, /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/, "the default plane lives in Neon (DECISIONS.md 2026-10-09): the pull needs DATABASE_URL, and nothing else secret except the optional GitHub-backend token");
  const pass = step(/name: eBay pass/);
  for (const k of ["DATABASE_URL", "EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "CRON_SECRET"]) assert.match(pass, new RegExp(`${k}: \\$\\{\\{ secrets\\.${k} \\}\\}`));
  assert.match(pass, /run: npx tsx scripts\/ebay\.ts \.data/);
  // Exactly two places name the eBay credentials: the gate step and the eBay pass step.
  assert.equal((CODE.match(/secrets\.EBAY_CLIENT_SECRET/g) ?? []).length, 2);
  assert.equal((CODE.match(/secrets\.DATA_REPO_TOKEN/g) ?? []).length, 1);
  assert.equal((CODE.match(/secrets\.CRON_SECRET/g) ?? []).length, 1);
});

test("the gate step exits 0 and skips everything when a secret is missing", () => {
  const start = YML.indexOf("id: gate");
  const runAt = YML.indexOf("run: |", start) + "run: |".length;
  const script = YML.slice(runAt, YML.indexOf("\n\n", runAt))
    .split("\n")
    .map((l) => l.replace(/^ {10}/, ""))
    .join("\n");
  const run = (env: Record<string, string>) => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gate-")), "out");
    fs.writeFileSync(out, "");
    execFileSync("bash", ["-c", script], { env: { PATH: process.env.PATH ?? "", GITHUB_OUTPUT: out, ...env } as unknown as NodeJS.ProcessEnv });
    return fs.readFileSync(out, "utf8").trim();
  };
  assert.equal(run({ DATABASE_URL: "postgres://x", EBAY_CLIENT_ID: "", EBAY_CLIENT_SECRET: "" }), "run=false");
  assert.equal(run({ DATABASE_URL: "postgres://x", EBAY_CLIENT_ID: "a", EBAY_CLIENT_SECRET: "" }), "run=false");
  assert.equal(run({ DATABASE_URL: "", EBAY_CLIENT_ID: "a", EBAY_CLIENT_SECRET: "b" }), "run=false");
  assert.equal(run({ DATABASE_URL: "postgres://x", EBAY_CLIENT_ID: "a", EBAY_CLIENT_SECRET: "b" }), "run=true");
  assert.match(job("gate"), /outputs:\s*\n\s*run: \$\{\{ steps\.gate\.outputs\.run \}\}/);
});

test("there is ONE eBay workflow", () => {
  const eb = fs.readdirSync(path.join(ROOT, ".github/workflows")).filter((f) => /ebay/i.test(f));
  assert.deepEqual(eb, ["ebay-prices.yml"]);
});
