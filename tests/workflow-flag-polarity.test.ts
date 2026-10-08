// WORKFLOW GUARDS (owner WP19, parity P08). Ported from RiftCompare's workflow-flag-polarity test, which exists because a GitHub Actions expression silently selected the unsafe mode, a duplicated key made a whole workflow
// undispatchable, and a maintenance file grew past GitHub's size limit; extended with the rules of this project's own safety nets: every workflow that writes declares a concurrency group, the audits and the CI build are green
// without their secrets, the CI build can reach neither database nor data host, and the ops webhook is posted to by one script only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ownerOf } from "./helpers/ratchet";

const DIR = join(process.cwd(), ".github/workflows");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
const read = (f: string): string => readFileSync(join(DIR, f), "utf8");
/** The file without its comment lines: a rule is about what the workflow DOES, not what its header explains. */
const live = (f: string): string => read(f).split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

// ─────────────────────────────────────────────────────────────────────────────
// A SAFETY FLAG THAT SILENTLY SELECTS THE UNSAFE MODE.
//
// GitHub Actions' `&&` / `||` return an OPERAND, not a boolean, and the empty string is FALSY. So this, which reads like "dry run means don't fix":
//
//     FIX: ${{ inputs.dry_run && '' || '1' }}
//
// evaluates `true && ''` -> `''` -> falsy -> falls through to `'1'`. The flag selects WRITE mode whether it is ticked or not, and nothing in the log says so beyond a quiet `FIX: 1`.
// (Shipped once in RiftCompare, caught only because the job's own env dump was read line by line.)
//
// THE RULE: in a ternary that chooses between "do the safe thing" and "do the dangerous thing", the TRUE branch must be the NON-EMPTY string. Write the condition so that ticking the box is what produces a value:
//
//     DRY_RUN: ${{ inputs.dry_run && '1' || '' }}   ok: tick -> '1'
//     FIX:     ${{ inputs.apply    && '1' || '' }}  ok: tick -> '1'
//     FIX:     ${{ inputs.dry_run  && '' || '1' }}  WRONG: always '1'
// ─────────────────────────────────────────────────────────────────────────────

/** The offending lines of one workflow's text (pure, so the rule is shown to be able to fail). */
export function emptyOnTrueBranch(src: string): string[] {
  const BAD = /\$\{\{[^}]*?&&\s*''\s*\|\|/;
  return src.split("\n").flatMap((line, i) => (/^\s*#/.test(line) || !BAD.test(line) ? [] : [`${i + 1}  ${line.trim()}`]));
}
/** Duplicate keys inside one mapping block, found the way GitHub finds them (on the raw text; a YAML parse hides them: last key wins). */
export function duplicateKeys(src: string): string[] {
  const out: string[] = [], lines = src.split("\n");
  const seen = new Map<number, Map<string, number>>();                      // indent -> (key -> line) since the last shallower line or list item
  let blockIndent: number | null = null;                                    // inside a literal block (`run: |`) everything deeper is text, not YAML
  lines.forEach((line, i) => {
    const lineIndent = /^(\s*)/.exec(line)![1]!.length;
    if (blockIndent !== null) { if (line.trim() === "" || lineIndent > blockIndent) return; blockIndent = null; }
    const item = /^(\s*)-\s/.exec(line);
    if (item) for (const d of [...seen.keys()]) if (d >= item[1]!.length) seen.delete(d);   // a list item starts a fresh mapping
    const m = /^(\s*)(?:-\s+)?([A-Za-z_][A-Za-z0-9_.-]*):(\s|$)/.exec(line);
    if (!m) return;
    const indent = m[1]!.length + (item ? item[0].length - item[1]!.length : 0), key = m[2]!;
    for (const d of [...seen.keys()]) if (d > indent) seen.delete(d);
    if (!seen.has(indent)) seen.set(indent, new Map());
    const at = seen.get(indent)!, prev = at.get(key);
    if (prev !== undefined) out.push(`key "${key}" is defined twice in the same block (lines ${prev} and ${i + 1})`);
    at.set(key, i + 1);
    if (/:\s*[|>][-+]?\d*\s*$/.test(line)) blockIndent = indent;
  });
  return out;
}

test("no workflow expression puts the EMPTY string on the true branch", () => {
  const offenders = FILES.flatMap((f) => emptyOnTrueBranch(read(f)).map((o) => `${f}:${o}`));
  assert.deepEqual(offenders, [], "these expressions always evaluate to their RIGHT-hand operand, so the flag cannot select the left one:\n" + offenders.join("\n"));
});
test("the polarity rule can fail", () => {
  assert.equal(emptyOnTrueBranch("env:\n  FIX: ${{ inputs.dry_run && '' || '1' }}\n").length, 1);
  assert.equal(emptyOnTrueBranch("env:\n  FIX: ${{ inputs.apply && '1' || '' }}\n").length, 0);
  assert.equal(emptyOnTrueBranch("# FIX: ${{ inputs.dry_run && '' || '1' }}\n").length, 0, "a comment may quote the trap");
});

// A DUPLICATE KEY BREAKS DISPATCH ENTIRELY, AND LOCAL YAML TOOLS HIDE IT. Python's yaml.safe_load, js-yaml's default mode and most editors accept `P_RM12:` twice in one env block (last key wins), so the file looks valid
// everywhere it is checked. GitHub is stricter and the failure is total: "failed to parse workflow ... 'P_RM12' is already defined" makes every job of the file undispatchable.
test("no workflow defines the same YAML key twice in one block", () => {
  const offenders = FILES.flatMap((f) => duplicateKeys(read(f)).map((o) => `${f}: ${o}`));
  assert.deepEqual(offenders, [], "GitHub refuses to parse the whole workflow:\n" + offenders.join("\n"));
});
test("the duplicate-key rule can fail, and does not confuse list items or literal blocks with duplicates", () => {
  assert.equal(duplicateKeys("env:\n  A: 1\n  B: 2\n  A: 3\n").length, 1);
  assert.equal(duplicateKeys("steps:\n  - uses: a\n    name: x\n  - uses: b\n    name: y\n").length, 0, "two steps each carry their own uses and name");
  assert.equal(duplicateKeys("- run: |\n    try:\n      x\n    try:\n      y\n").length, 0, "a shell or Python body is text");
});

// A WORKFLOW THAT DOES NOT PARSE IS NOT A WORKFLOW. A plain scalar that contains ": " (a `run: npx tool --title "Store health: 3 alerting"`) is a YAML error, "mapping values are not allowed here", and GitHub shows
// the file as broken without a single step having run. A YAML parser is the only complete check, and it is used when one is installed (js-yaml, which eslint brings); the colon rule below needs no parser
// and is the mistake that was actually made.
export function plainScalarColons(src: string): string[] {
  const out: string[] = [];
  src.split("\n").forEach((line, i) => {
    if (/^\s*#/.test(line)) return;
    const m = /^(\s*(?:-\s+)?[A-Za-z_][\w.-]*):\s+(\S.*)$/.exec(line);
    if (!m) return;
    const value = m[2]!.replace(/\$\{\{.*?\}\}/g, "X");                       // an expression may hold anything
    if (/^["'|>\[{&*!]/.test(value)) return;                                       // quoted, a block scalar, a flow collection, an anchor or a tag
    if (/:(\s|$)/.test(value.replace(/\s#.*$/, ""))) out.push(`${i + 1}  ${line.trim().slice(0, 120)}`);
  });
  return out;
}
test("every workflow is valid YAML: no plain scalar holds a colon and a space, and a parser (when installed) accepts the file", () => {
  const offenders = FILES.flatMap((f) => plainScalarColons(read(f)).map((o) => `${f}:${o}`));
  assert.deepEqual(offenders, [], 'quote the value or use `run: |`: "mapping values are not allowed here" makes the whole workflow undispatchable');
  assert.deepEqual(plainScalarColons('    run: npx tool --title "Store health: 3 alerting"\n'), ["1  run: npx tool --title \"Store health: 3 alerting\""]);
  assert.deepEqual(plainScalarColons('    run: |\n      npx tool --title "Store health: 3"\n    name: "a: b"\n    if: ${{ a && \'x: y\' }}\n    url: https://x.test/a\n'), []);
  let yaml: { load: (s: string) => unknown } | null = null;
  try { yaml = require("js-yaml") as { load: (s: string) => unknown }; } catch { /* no parser installed: the colon rule above is the whole check */ }
  if (yaml) for (const f of FILES) assert.doesNotThrow(() => yaml!.load(read(f)), `${f} does not parse`);
});

// GitHub refuses to start a workflow file over 512,000 bytes: every run ends in `startup_failure` before any step executes, with no message in the file's own log. RiftCompare's maintenance.yml reached 512,356 bytes and every task
// in it was undispatchable until it was pruned. Fail at 450 KB so the next person gets a warning, not an outage.
test("no workflow file is within 60 KB of GitHub's 512,000-byte limit", () => {
  for (const f of FILES) {
    const bytes = Buffer.byteLength(read(f));
    assert.ok(bytes < 450_000, `${f} is ${bytes.toLocaleString("en-US")} bytes: GitHub refuses to run workflow files over 512,000 (startup_failure). Prune superseded steps; git history keeps them.`);
  }
});

// ── the rules of this project's safety nets ──────────────────────────────────────────────────────────────────────────────────

const hasConcurrency = (src: string): boolean => /^concurrency:\s*$/m.test(src) || /^\s{4}concurrency:\s*$/m.test(src) || /^\s{2}concurrency:\s*$/m.test(src);
const AUDITS = ["egress-audit.yml", "data-audit.yml", "db-audit.yml", "store-health.yml", "maintenance.yml"];
const GATES = ["ci-build.yml", "seo-preview-gate.yml"];

test("every workflow that writes (contents: write, a git push) and every workflow WP19 owns declares a concurrency group", () => {
  const bad = FILES.filter((f) => {
    const src = live(f), writes = /contents:\s*write/.test(src) || /\bgit push\b/.test(src);
    return (writes || ownerOf(`.github/workflows/${f}`) === "WP19") && !hasConcurrency(src);
  });
  assert.deepEqual(bad, [], "two runs of a writer racing is how a pointer ends up pointing at half a publish; give the workflow a `concurrency:` group");
});
test("the audits read and never write: no `contents: write`, no push, and none joins the publish group they must not delay", () => {
  for (const f of [...AUDITS, ...GATES]) {
    const src = live(f);
    assert.ok(!/contents:\s*write/.test(src) && !/\bgit push\b/.test(src), `${f} must be read-only`);
    const group = /^concurrency:\s*\n\s+group:\s*(\S+)/m.exec(src)?.[1] ?? "";
    assert.ok(group && !/^(data-publish|import-prices|production-deploy)/.test(group), `${f}: concurrency group "${group}" (an audit has its own group: it must neither delay a publish nor be cancelled by one)`);
    if (AUDITS.includes(f)) assert.match(src, /cancel-in-progress:\s*false/, `${f}: an audit in flight is finished, not cancelled by the next trigger`);
  }
});
test("every audit is a green no-op without its secrets, and says so", () => {
  for (const f of AUDITS) {
    const src = live(f);
    assert.match(src, /green no-op/, `${f} must print that it did nothing because a secret is missing`);
    assert.ok(/if:\s*env\.[A-Z_]+\s*(==|!=)\s*''/.test(src) || /-z\s+"\$\{?[A-Z_]+/.test(src), `${f}: no step is guarded on an empty secret, so it would fail red when the secret is not there`);
    // the Actions variables and secrets of the audits are reached through env: at the job or step level and tested THERE (an `if:` cannot read the secrets context)
    assert.doesNotMatch(src, /if:\s*[^\n]*secrets\./, `${f}: the secrets context is not available to an if: condition`);
  }
});
test("the CI build can reach neither the database nor the data host, and holds no secret", () => {
  const src = live("ci-build.yml");
  assert.doesNotMatch(src, /\$\{\{\s*(secrets|vars)\./, "ci-build.yml must name no secret and no repository variable: with no real address in the process it cannot reach a real database or data host even by mistake");
  assert.match(src, /DATABASE_URL:\s*postgresql:\/\/nobody:x@127\.0\.0\.1:1\/none/, "Annex C check 24: DATABASE_URL points at a closed port");
  assert.match(src, /PLANE_REPO:\s*nobody\/none/);
  assert.match(src, /PLANE_TOKEN:\s*x\b/);
  assert.match(src, /run:\s*npm run build/, "the job runs the production build");
  assert.match(src, /smoke-pages\.ts[^\n]*--check-build/, "and checks that the build prerendered no data-backed page");
  assert.match(src, /PLANE_DIR:\s*\$\{\{\s*runner\.temp\s*\}\}\/plane/, "the server then serves a fixture directory");
  assert.doesNotMatch(src, /\bnpm run import\b|\bimport:bootstrap\b|prisma (db push|migrate)/, "a build job imports, pushes and migrates nothing");
  assert.match(src, /^on:\s*\n\s+pull_request:/m, "every pull request is built");
});
test("the ops webhook secret is named only by steps that run scripts/ops-webhook.ts, and only as OPS_WEBHOOK_URL", () => {
  const bad: string[] = [];
  for (const f of FILES) {
    const steps = live(f).split(/\n\s*-\s+(?=name:|uses:|run:|id:|if:)/);
    for (const st of steps) if (/secrets\.OPS_WEBHOOK_URL/.test(st) && (!/scripts\/ops-webhook\.ts/.test(st) || !/OPS_WEBHOOK_URL:\s*\$\{\{\s*secrets\.OPS_WEBHOOK_URL\s*\}\}/.test(st))) bad.push(`${f}: ${st.split("\n")[0]!.trim()}`);
  }
  assert.deepEqual(bad, [], "a webhook address is a credential: hand it to the one script that posts, in its own step's env, and to nothing else");
});
test("a failed audit tells ops, and telling ops is never the reason a job is red", () => {
  for (const f of ["egress-audit.yml", "data-audit.yml", "db-audit.yml"]) assert.match(live(f), /scripts\/ops-webhook\.ts/, `${f} posts its failure to the ops webhook`);
  const src = readFileSync(join(process.cwd(), "scripts/ops-webhook.ts"), "utf8");
  assert.match(src, /an alert that cannot be delivered is a log line, never a red job/);
});
