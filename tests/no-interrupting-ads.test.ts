// Owner, 2026-11-23 UX review, P0 1: nothing opens by itself while the visitor is typing (MTG Compare has no pop-up ad).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QUIET_MS } from "../src/lib/visitor-busy";

test("every self-opening ad or prompt asks visitorBusy() before it opens", () => {
  assert.ok(QUIET_MS >= 3000);
  for (const f of ["src/components/account/SignInCorner.tsx", "src/components/site-reviews/RateCard.tsx"]) {
    assert.match(readFileSync(f, "utf8"), /visitorBusy\(\)/, f);
  }
});
