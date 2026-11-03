import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { lowestByMarket } from "../src/lib/alert-feed";
import { parseAmount, suggestTarget, ALERT_SERVICE } from "../src/components/PriceAlertForm";
import type { Offer } from "../src/lib/site-types";

// Price alerts through RiftCompare's shared service (DECISIONS.md, 2026-11-02).

const o = (x: Partial<Offer>): Offer => ({ source: "store", market: "US", currency: "USD", cents: 1000, inStock: true, url: "", title: "", ...x });

test("the feed's price is the lowest in-stock non-eBay offer per market, never converted", () => {
  const p = lowestByMarket([
    o({ cents: 900, source: "ebay" }),
    o({ cents: 1200 }),
    o({ cents: 1100, source: "tcgplayer" }),
    o({ cents: 500, inStock: false }),
    o({ market: "UK", currency: "GBP", cents: 800 }),
  ]);
  assert.deepEqual(p, { US: 1100, UK: 800 });
});

test("the form posts only to the shared service and parses prices strictly", () => {
  assert.equal(ALERT_SERVICE, "https://riftcompare.com/api/sister-alerts");
  assert.equal(parseAmount("45"), 4500);
  assert.equal(parseAmount("£12,50"), 1250);
  assert.equal(parseAmount("1,299.99"), 129999);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount("0"), null);
  assert.equal(suggestTarget(13999), 12500);
  const src = fs.readFileSync("src/components/PriceAlertForm.tsx", "utf8");
  assert.ok(!/localStorage|document\.cookie/.test(src), "the form remembers nothing about the visitor");
  assert.match(src, /JSON\.stringify\(\{ site, productId, region, email: [^}]*targetCents \}\)/, "only these fields are sent");
});

test("the feed route is static and keeps eBay out", () => {
  const route = fs.readFileSync("src/app/alert-feed.json/route.ts", "utf8");
  assert.match(route, /export const revalidate = 86400;/);
  assert.ok(!/headers\(\)|cookies\(\)|force-dynamic/.test(route));
});
