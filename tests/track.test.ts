import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Owner, 2026-10-25: Vercel Web Analytics shows page views and buy clicks, nothing else.
test("only buy_click reaches Vercel Analytics; every other event name is dropped", () => {
  const src = readFileSync(new URL("../src/lib/track.ts", import.meta.url), "utf8");
  assert.match(src, /new Set\(\["buy_click"\]\)/);
  assert.match(src, /if \(!SENT\.has\(name\)\) return;/);
});
