import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// The after-buy price alert offer (COO 2026-11-26) keeps the page budget (ops/product-ux/page-budget.md).
const src = fs.readFileSync("src/components/AfterBuyAlert.tsx", "utf8");

test("it shows only after the visitor's own buy click, as the visit's one prompt", () => {
  assert.match(src, /addEventListener\(BUY_CLICK_EVENT, onBuy\)/);
  assert.match(src, /if \(!clicked\.current \|\| document\.visibilityState !== "visible"\) return;/);
  assert.match(src, /if \(!claimPromptSlot\(SLOT\)\) return;/);
  assert.match(fs.readFileSync("src/components/OutboundLink.tsx", "utf8"), /window\.dispatchEvent\(new Event\("buyclick"\)\)/);
});

test("✕ silences it for 7 days, a created alert for 30, and no storage means it never shows", () => {
  assert.match(src, /silence\(7\)/);
  assert.match(src, /silence\(30\)/);
  assert.match(src, /return Number\.POSITIVE_INFINITY;/);
});

test("never a modal: inline on phones, a corner card from 1024px", () => {
  assert.ok(!/showModal|<dialog|fixed inset-0/.test(src));
  assert.match(src, /className="card relative mt-4 p-4 lg:fixed lg:bottom-4 lg:right-4/);
});

test("its events reach Vercel", () => {
  assert.match(fs.readFileSync("src/lib/track.ts", "utf8"), /"after_buy_alert",/);
});
