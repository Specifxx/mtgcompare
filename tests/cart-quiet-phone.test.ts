// Head of Product, 2026-11-21: on phones the store's buy button leads a product-page row and the cart is a small "Add" chip after
// it; the quick view ([role="dialog"]) is left alone while its A/B runs (to 3 Dec).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("phone rows put the buy button first and keep the cart small and labelled, outside the quick view", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const sel = '.or-row:not(.or-lean):not([role="dialog"] .or-row) > .or-act > .ce-cart-add';
  const at = css.indexOf(sel);
  assert.ok(at > 0, "the quiet-cart rule exists");
  const rule = css.slice(at, css.indexOf("}", at));
  assert.match(rule, /order:\s*2/);
  assert.match(rule, /flex:\s*0 0 auto/);
  assert.ok(!/display:\s*none/.test(rule), "the cart button itself is never hidden");
});
