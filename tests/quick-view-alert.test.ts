import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The price alert in the quick view (DECISIONS.md, 2026-11-13).
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the quick view carries the product page's price alert, from the quick route's own data", () => {
  const qv = read("src/components/QuickView.tsx");
  const api = read("src/app/api/quick/[region]/[slug]/route.ts");
  assert.match(api, /alert: \{ site: ALERT_SITE_KEY, id: p\.id, cents: here\?\.lowestPriceCents \?\? null, market: r\.market \}/);
  assert.match(qv, /<PriceAlertForm/);
  assert.match(qv, /got\?\.alert &&/, "a response the CDN kept from before has no alert: nothing is drawn");
  assert.match(qv, /prominent/, "a button the visitor taps; the form never opens by itself");
  // alert-feed.ts reads files (node:fs): a client component must never import it.
  assert.doesNotMatch(qv, /alert-feed/);
});
