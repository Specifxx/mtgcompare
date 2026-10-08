// Concurrency and tokens of the workflows that touch the data repository (critique DP-10, DP-20; section 6.6). Owner WP01b. Reads .github/workflows as text, like tests/deploy-cadence.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DATA_GROUP, DATA_WRITER_WORKFLOWS, DEMAND_SNAPSHOT_CRON, IMPORT_CRONS, KEEPALIVE_AFTER_DAYS, SQUASH_CRON, WATCHDOG_CRON, parseDailyCron } from "../src/lib/schedule";

const ROOT = process.env.TEST_ROOT ?? path.resolve(__dirname, "..");
const DIR = path.join(ROOT, ".github/workflows");
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)) : [];
const read = (f: string): string => fs.readFileSync(path.join(DIR, f), "utf8");
const crons = (t: string): string[] => [...t.matchAll(/^\s*- cron:\s*"([^"]+)"/gm)].map((m) => m[1]!);
const WRITER_SCRIPTS = /scripts\/(?:import|publish-data|publish-demand|data-squash|data-watchdog|data-rollback)\.ts/;

test("every writer of the data repository is in the group `data-publish` with `queue: max` and never `cancel-in-progress: true`", () => {
  for (const f of DATA_WRITER_WORKFLOWS) { assert.ok(files.includes(f), `${f} exists`); const t = read(f);
    assert.match(t, new RegExp(`group:\\s*${DATA_GROUP}\\b`), `${f}: group ${DATA_GROUP}`); assert.match(t, /^\s+queue:\s*max\s*$/m, `${f}: queue: max (the default single slot lets a newer pending run cancel an older one)`);
    assert.ok(!/cancel-in-progress:\s*true/.test(t), `${f}: queue: max and cancel-in-progress: true is a workflow validation error`); }
});
test("a workflow that runs a writer script, or names the data token, must be in the group; no other workflow joins it or pushes to the data repository", () => {
  for (const f of files) { const t = read(f); const writes = WRITER_SCRIPTS.test(t); const inGroup = new RegExp(`group:\\s*${DATA_GROUP}\\b`).test(t);
    if (writes) assert.ok(inGroup, `${f} runs a writer script outside the ${DATA_GROUP} group`);
    if (inGroup) assert.ok((DATA_WRITER_WORKFLOWS as readonly string[]).includes(f), `${f} joins the group but is not a declared writer`);
    if (/DATA_REPO_TOKEN/.test(t) && !writes && !/plane-checkout\.sh|data-hook|publish-demand/.test(t)) assert.ok(/plane-checkout\.sh|scripts\/data-hook\.ts/.test(t), `${f} names the data token without a reader or hook script`); }
  const ebay = files.find((f) => /^ebay/.test(f)); if (ebay) assert.ok(!new RegExp(`group:\\s*${DATA_GROUP}\\b`).test(read(ebay)), "the eBay workflow writes only Neon: it is NOT in the data group, so it can neither cancel nor delay an import");
});
test("the data repository is written with DATA_REPO_TOKEN (GITHUB_TOKEN covers only the workflow's own repository) and the workflows' default permission is read", () => {
  for (const f of DATA_WRITER_WORKFLOWS) { const t = read(f); assert.match(t, /DATA_REPO_TOKEN:\s*\$\{\{\s*secrets\.DATA_REPO_TOKEN\s*\}\}/, f); assert.match(t, /PLANE_REPO:\s*\$\{\{\s*vars\.PLANE_REPO\s*\}\}/, f); assert.match(t, /^permissions:\s*\n\s+contents:\s*read/m, `${f}: top-level permissions are read-only`); assert.ok(!/NEXT_PUBLIC_/.test(t.replace(/#.*$/gm, "")), `${f}: no NEXT_PUBLIC secret`); }
});
test("the crons are the constants of schedule.ts; the watchdog never runs at minute 0; the squash is weekly; the import follows the sources by at least 75 minutes", () => {
  assert.deepEqual(crons(read("import-prices.yml")), [...IMPORT_CRONS]); assert.deepEqual(crons(read("data-squash.yml")), [SQUASH_CRON]); assert.deepEqual(crons(read("data-watchdog.yml")), [WATCHDOG_CRON]); assert.deepEqual(crons(read("demand-snapshot.yml")), [DEMAND_SNAPSHOT_CRON]);
  assert.notEqual(parseDailyCron(WATCHDOG_CRON)!.minute, 0); assert.equal(parseDailyCron(SQUASH_CRON)!.weekday, 0);
  const first = parseDailyCron(IMPORT_CRONS[0])!; assert.ok(first.hour * 60 + first.minute >= 20 * 60 + 6 + 75, "TCGCSV rebuilds at about 20:06 and Scryfall at about 21:05"); const [a, b, c] = IMPORT_CRONS.map((x) => parseDailyCron(x)!); assert.equal(b!.hour * 60 + b!.minute - (a!.hour * 60 + a!.minute), 30); assert.equal(c!.hour * 60 + c!.minute - (b!.hour * 60 + b!.minute), 30);
  assert.ok(files.includes("data-rollback.yml") && files.includes("data-hook.yml")); assert.deepEqual(crons(read("data-rollback.yml")), []); assert.deepEqual(crons(read("data-hook.yml")), []);
});
test("DP-20: the watchdog carries a keepalive job that writes the CODE repository only, after 30 days, with no [deploy] in the subject", () => {
  const t = read("data-watchdog.yml"); assert.match(t, /keepalive:/); assert.match(t, /contents:\s*write/); assert.ok(t.includes(`-ge ${KEEPALIVE_AFTER_DAYS}`)); const subject = /git commit [^\n]*-m "([^"]+)"/.exec(t)![1]!; assert.ok(!/\[deploy\]/i.test(subject), subject);
  assert.match(t, /ref:\s*main/);
});
test("the pointed tree is read by `plane-checkout.sh`: the pointed commit, not the branch head, and the token never in the URL", () => {
  const sh = fs.readFileSync(path.join(ROOT, "scripts/plane-checkout.sh"), "utf8"); assert.match(sh, /latest\.json/); assert.match(sh, /extraheader/); assert.ok(!/https:\/\/[^"\s]*\$\{?DATA_REPO_TOKEN/.test(sh), "no https://TOKEN@github.com/ URL");
});
test("a step or job name is a valid YAML plain scalar: no `: ` and no ` #` inside an unquoted name (js-yaml rejected data-watchdog.yml for exactly this; verify-dp.sh parses every workflow for real)", () => {
  for (const f of files) for (const [i, line] of read(f).split("\n").entries()) {
    const m = /^\s*(?:-\s+)?name:\s+(.*)$/.exec(line); if (!m) continue; const v = m[1]!.trim();
    if (/^["'|>]/.test(v)) continue;
    assert.ok(!/:\s/.test(v) && !/\s#/.test(v) && !/^[\[{&*!%@`]/.test(v), `${f}:${i + 1}: quote this name: ${v}`);
  }
});
