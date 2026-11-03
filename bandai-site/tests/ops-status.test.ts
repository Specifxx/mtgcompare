// Empire HQ and the one Monday report (owner, 2026-11-02): the monitor writes
// every result to ops-status.json for the public `ops-status` branch, and only
// a red check fails the run (a failed run is GitHub's email to the owner).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("scripts/ops-monitor.ts", "utf8");

test("the ops monitor writes the status file Empire HQ reads", () => {
  assert.match(src, /ops-status\.json/);
  assert.match(src, /v: 1, site: SITE_HOST, at: /);
});

test("only a failed check fails the run: warnings wait for HQ and the Monday report", () => {
  assert.match(src, /const bad = results\.filter\(\(r\) => r\.status === "fail"\);/);
  assert.doesNotMatch(src, /r\.status === "warn" && !/);
});

test("the ops-status branch never deploys", () => {
  const v = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  assert.equal(v.git.deploymentEnabled["ops-status"], false);
});
