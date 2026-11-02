import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// scripts/vercel-ignore-build.sh: at most one production build every 12 hours
// (owner, 2026-11-02, Vercel cost ceiling). A [deploy] commit within 12 hours of
// the last production deployment (VERCEL_GIT_PREVIOUS_SHA) is skipped; [urgent]
// overrides; an unknown last deployment builds (fail open).
const SCRIPT = path.resolve("scripts/vercel-ignore-build.sh");

function repo(prevAgeHours: number) {
  const dir = mkdtempSync(path.join(tmpdir(), "deploy-gap-"));
  const now = 1_800_000_000;
  const git = (args: string[], when?: number) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com",
        ...(when ? { GIT_AUTHOR_DATE: `@${when} +0000`, GIT_COMMITTER_DATE: `@${when} +0000` } : {}),
      },
    }).trim();
  git(["init", "-q"]);
  writeFileSync(path.join(dir, "a.txt"), "a\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "release [deploy]"], now - prevAgeHours * 3600);
  const prev = git(["rev-parse", "HEAD"]);
  writeFileSync(path.join(dir, "b.txt"), "b\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "next"], now);
  const builds = (msg: string, extra: Record<string, string> = {}) => {
    const r = spawnSync("bash", [SCRIPT], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_MESSAGE: msg, VERCEL_GIT_PREVIOUS_SHA: prev, NOW_EPOCH: String(now), SITE_ID: "x", ...extra },
    });
    assert.ok(r.status === 0 || r.status === 1, r.stderr);
    return r.status === 1;
  };
  return { builds, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("a [deploy] commit within 12 hours of the last production build is skipped", () => {
  const r = repo(3);
  try {
    assert.equal(r.builds("feat: thing [deploy]"), false);
    assert.equal(r.builds("hotfix [deploy] [urgent]"), true, "[urgent] overrides the gap");
    assert.equal(r.builds("feat: thing [deploy]", { VERCEL_GIT_PREVIOUS_SHA: "" }), true, "no last deployment: build");
    assert.equal(r.builds("feat: thing [deploy]", { VERCEL_GIT_PREVIOUS_SHA: "0123456789abcdef0123456789abcdef01234567" }), true, "unreadable last deployment: build");
    assert.equal(r.builds("feat: thing"), false, "no [deploy]: still skipped");
  } finally {
    r.done();
  }
});

test("a [deploy] commit 12 hours or more after the last production build builds", () => {
  const r = repo(13);
  try {
    assert.equal(r.builds("data: daily prices [deploy]"), true);
  } finally {
    r.done();
  }
});
