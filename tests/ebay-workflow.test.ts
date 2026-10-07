// .github/workflows/ebay-prices.yml: two crons ahead of the imports, the
// import's concurrency group, read-only, no push trigger, and a green skip
// when the eBay secrets are missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";

const ROOT = path.resolve(__dirname, "..");
const YML = fs.readFileSync(path.join(ROOT, ".github/workflows/ebay-prices.yml"), "utf8");
const IMPORT = fs.readFileSync(path.join(ROOT, ".github/workflows/import-prices.yml"), "utf8");
const crons = (y: string) => [...y.matchAll(/- cron:\s*"(\d+) (\d+) \* \* \*"/g)].map((m) => Number(m[2]) * 60 + Number(m[1]));

test("exactly two scheduled runs, each at least 60 minutes before an import", () => {
  const ebay = crons(YML);
  const imports = crons(IMPORT);
  assert.equal(ebay.length, 2);
  assert.ok(imports.length >= 2);
  for (const e of ebay) {
    const next = imports.filter((i) => i > e).sort((a, b) => a - b)[0];
    assert.ok(next != null && next - e >= 60, `eBay run at ${e} min needs an import ≥60 min later`);
  }
});

const job = (name: string) => {
  const start = YML.indexOf(`\n  ${name}:\n`);
  assert.ok(start > 0, `job ${name}`);
  const next = YML.slice(start + 1).search(/\n  [a-z][\w-]*:\n/);
  return next < 0 ? YML.slice(start) : YML.slice(start, start + 1 + next);
};

test("no push trigger, the import's concurrency group on the eBay job only, read-only, and the refresh guard", () => {
  const on = YML.slice(YML.indexOf("\non:"), YML.indexOf("\npermissions:"));
  assert.doesNotMatch(on, /^\s*push:/m);
  assert.doesNotMatch(on, /pull_request/);
  // No workflow-level group: an unconfigured run (gate says no) never enters the import's group.
  assert.doesNotMatch(YML, /^concurrency:/m);
  assert.doesNotMatch(job("gate"), /concurrency:/);
  assert.match(job("ebay"), /concurrency:\s*\n\s*group: import-prices\s*\n\s*cancel-in-progress: false/);
  assert.match(job("ebay"), /needs: gate\s*\n\s*if: needs\.gate\.outputs\.run == 'true'/);
  assert.match(YML, /permissions:\s*\n\s*contents: read/);
  assert.match(YML, /EBAY_REFRESH: \$\{\{ github\.event_name != 'push' \}\}/);
  assert.match(job("ebay"), /timeout-minutes: 60/);
});

test("the dispatch cap comes only from the max_calls input", () => {
  assert.match(YML, /EBAY_DISPATCH_CAP: \$\{\{ inputs\.max_calls \}\}/);
  assert.doesNotMatch(YML, /vars\.EBAY_DISPATCH_CAP/);
  for (const k of ["force", "only_market", "max_calls"]) assert.match(YML, new RegExp(`\\n      ${k}:`));
});

test("secrets are scoped to the steps that need them: npm ci never sees one", () => {
  // No job-level env carries a secret.
  for (const name of ["gate", "ebay"]) {
    const j = job(name);
    const jobEnv = j.slice(0, j.indexOf("steps:"));
    assert.doesNotMatch(jobEnv, /secrets\./, `job ${name}`);
  }
  const steps = job("ebay").split(/\n      - /).slice(1);
  const step = (re: RegExp) => steps.find((s) => re.test(s)) ?? "";
  assert.doesNotMatch(step(/run: npm ci/), /secrets\./);
  assert.doesNotMatch(step(/actions\/checkout/), /secrets\./);
  assert.match(step(/name: Sync schema/), /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/);
  assert.doesNotMatch(step(/name: Sync schema/), /EBAY_CLIENT/);
  const pass = step(/name: eBay pass/);
  for (const k of ["DATABASE_URL", "EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"]) assert.match(pass, new RegExp(`${k}: \\$\\{\\{ secrets\\.${k} \\}\\}`));
  // Exactly two places name the eBay credentials: the gate step and the eBay pass step.
  assert.equal((YML.match(/secrets\.EBAY_CLIENT_SECRET/g) ?? []).length, 2);
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
  // The gate's output is the job output the eBay job waits on.
  assert.match(job("gate"), /outputs:\s*\n\s*run: \$\{\{ steps\.gate\.outputs\.run \}\}/);
});
