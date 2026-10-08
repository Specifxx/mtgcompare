// The production deploy gate (scripts/vercel-ignore-build.sh): only a commit whose SUBJECT carries [deploy] builds production; previews are OFF unless the subject carries [preview] (owner, 2026-10-08). Owner WP21.
// The full behaviour (case, body, unknown environment, fail-open) and the WEEKLY cadence are pinned in tests/deploy-cadence.test.ts (WP19); this file is OP's small test, kept with its wording updated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const SCRIPT = path.resolve(__dirname, "../scripts/vercel-ignore-build.sh");
const run = (env: Record<string, string>) => spawnSync("bash", [SCRIPT], { env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv }).status;

test("production builds only on a [deploy] subject", () => {
  assert.equal(run({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_MESSAGE: "release: weekly production deploy [deploy]" }), 1);
  assert.equal(run({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_MESSAGE: "Fix the card page" }), 0);
  assert.equal(run({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_MESSAGE: "Fix\n\nthis body mentions [deploy] in prose" }), 0);
});

test("previews are off: they build only on a [preview] subject, never on [deploy] or an unreadable message", () => {
  for (const env of ["preview", "development"]) {
    assert.equal(run({ VERCEL_ENV: env, VERCEL_GIT_COMMIT_MESSAGE: "anything" }), 0, env);
    assert.equal(run({ VERCEL_ENV: env, VERCEL_GIT_COMMIT_MESSAGE: "Try the new card page [preview]" }), 1, env);
    assert.equal(run({ VERCEL_ENV: env, VERCEL_GIT_COMMIT_MESSAGE: "release [deploy]" }), 0, env);
  }
});
