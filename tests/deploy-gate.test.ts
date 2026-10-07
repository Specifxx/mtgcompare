// The production deploy gate (scripts/vercel-ignore-build.sh): only a commit
// whose SUBJECT carries [deploy] builds production; previews always build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const SCRIPT = path.resolve(__dirname, "../scripts/vercel-ignore-build.sh");
const run = (env: Record<string, string>) => spawnSync("bash", [SCRIPT], { env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv }).status;

test("production builds only on a [deploy] subject", () => {
  assert.equal(run({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_MESSAGE: "release: daily [deploy]" }), 1);
  assert.equal(run({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_MESSAGE: "Fix the card page" }), 0);
  assert.equal(run({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_MESSAGE: "Fix\n\nthis body mentions [deploy] in prose" }), 0);
});

test("previews are not gated", () => {
  assert.equal(run({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_MESSAGE: "anything" }), 1);
});
