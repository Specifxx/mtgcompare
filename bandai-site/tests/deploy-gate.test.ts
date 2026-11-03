import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (msg: string, env = "production") =>
  spawnSync("bash", ["scripts/vercel-ignore-build.sh"], { env: { ...process.env, VERCEL_GIT_COMMIT_MESSAGE: msg, VERCEL_ENV: env } }).status;

test("builds only when the SUBJECT carries [deploy]", () => {
  assert.equal(run("data: daily prices [deploy]"), 1);
  assert.equal(run("feat: thing\n\nno [deploy] marker on purpose"), 0);
  assert.equal(run("feat: thing"), 0);
});
test("previews need [preview]", () => {
  assert.equal(run("feat [deploy]", "preview"), 0);
  assert.equal(run("feat [preview]", "preview"), 1);
});
