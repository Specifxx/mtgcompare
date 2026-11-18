// The deploy gate (scripts/vercel-ignore-build.sh, the sister sites' script): production builds only a commit whose SUBJECT
// carries [deploy], at most once per 12 hours; previews are off.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(ROOT, "scripts/vercel-ignore-build.sh");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

// git, isolated from the machine's config (no signing, no hooks) and from any repository above the temp dir.
const TMP = mkdtempSync(join(tmpdir(), "dex-ignore-"));
after(() => rmSync(TMP, { recursive: true, force: true }));
const GIT_ENV = {
  PATH: process.env.PATH ?? "",
  HOME: TMP,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CEILING_DIRECTORIES: TMP,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};
// Next's types make NODE_ENV a required key of ProcessEnv; these children don't need it.
const asEnv = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync("git", args, { cwd, env: asEnv(GIT_ENV), encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
};

let n = 0;
/** A monorepo whose last commit (`message`) touches the app or only another app; returns the app directory. */
function repo(appChanged: boolean, message: string): string {
  const dir = join(TMP, `repo${n++}`);
  for (const d of ["apps/dex", "apps/other"]) mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, "apps/dex/a.txt"), "1");
  writeFileSync(join(dir, "apps/other/b.txt"), "1");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "base");
  writeFileSync(join(dir, appChanged ? "apps/dex/a.txt" : "apps/other/b.txt"), "2");
  git(dir, "commit", "-q", "-am", message);
  return join(dir, "apps/dex");
}

/** Runs the gate as Vercel does (cwd = the app); `message: null` leaves VERCEL_GIT_COMMIT_MESSAGE unset. */
function gate(cwd: string, vercelEnv: string | null, message: string | null): { status: number | null; out: string } {
  const env: Record<string, string> = { ...GIT_ENV };
  if (vercelEnv !== null) env.VERCEL_ENV = vercelEnv;
  if (message !== null) env.VERCEL_GIT_COMMIT_MESSAGE = message;
  const r = spawnSync("bash", [SCRIPT], { cwd, env: asEnv(env), encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
const BUILD = 1;
const SKIP = 0;

test("vercel.json runs the gate and builds production only", () => {
  const vercel = JSON.parse(src("vercel.json")) as { ignoreCommand?: string; git?: { deploymentEnabled?: Record<string, boolean> } };
  assert.equal(vercel.ignoreCommand, "bash scripts/vercel-ignore-build.sh");
  assert.deepEqual(vercel.git?.deploymentEnabled, { "**": false, main: true });
});

test("production builds only a [deploy] SUBJECT that changed the app", () => {
  assert.equal(gate(repo(true, "Card prices: 2026-11-18 [deploy]"), "production", null).status, BUILD);
  assert.equal(gate(repo(true, "Fix a typo"), "production", null).status, SKIP);
  assert.equal(gate(repo(true, "Fix a typo\n\nThe body mentions [deploy] in prose."), "production", null).status, SKIP);
  assert.equal(gate(repo(false, "Other app [deploy]"), "production", null).status, SKIP);
});

test("previews are off unless the subject carries [preview]", () => {
  assert.equal(gate(repo(true, "Work in progress [deploy]"), "preview", null).status, SKIP);
  assert.equal(gate(repo(true, "Show the owner [preview]"), "preview", null).status, BUILD);
});

test("the daily import's commit is the one release", () => {
  const wf = src(".github/workflows/card-prices.yml");
  assert.match(wf, /git commit -q -m "Card prices: [^"]*\[deploy\]"/);
  assert.equal((wf.match(/cron:/g) ?? []).length, 1, "one scheduled import a day");
});
