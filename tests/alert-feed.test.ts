import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAlertFeed, ALERT_SITE_KEY, feedIsDeal } from "../src/lib/alert-feed";
import { isDeal } from "../src/lib/deals";
import { parseAmount, suggestTarget, ALERT_SERVICE } from "../src/components/PriceAlertForm";

// Price alerts through RiftCompare's shared service (DECISIONS.md, 2026-11-02).

test("the feed carries each product's open price per market and the site's own deals", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-"));
  fs.writeFileSync(path.join(dir, "products.json"), JSON.stringify([{ id: "p1", slug: "box", name: "Box", productType: "Play Booster Box", setCode: null }, { id: "p2", slug: "none", name: "None", productType: "Bundle", setCode: null }]));
  fs.writeFileSync(
    path.join(dir, "product-stats.json"),
    JSON.stringify([
      { productId: "p1", market: "US", lowestPriceCents: 10000, inStockStores: 4, listedStores: 5, marketplaceOpen: true, medianOpenCents: 14000 },
      { productId: "p1", market: "AU", lowestPriceCents: null, inStockStores: 0, listedStores: 0, marketplaceOpen: false, medianOpenCents: null },
      { productId: "p2", market: "US", lowestPriceCents: null, inStockStores: 0, listedStores: 1, marketplaceOpen: false, medianOpenCents: null },
    ]),
  );
  const f = buildAlertFeed(dir, new Date("2026-11-02T00:00:00Z"));
  assert.equal(f.site, ALERT_SITE_KEY);
  assert.deepEqual(f.items, { p1: { n: "Box", u: "/{r}/p/box", p: { US: 10000 } } });
  assert.deepEqual(f.deals, [{ n: "Box", u: "/us/p/box", r: "US", p: 10000, ref: 14000, refLabel: "store median" }]);
});

test("the form posts only to the shared service and parses prices strictly", () => {
  assert.equal(ALERT_SERVICE, "https://riftcompare.com/api/sister-alerts");
  assert.equal(parseAmount("45"), 4500);
  assert.equal(parseAmount("£12,50"), 1250);
  assert.equal(parseAmount("abc"), null);
  assert.equal(suggestTarget(13999), 12500);
  const src = fs.readFileSync("src/components/PriceAlertForm.tsx", "utf8");
  assert.ok(!/localStorage|document\.cookie/.test(src));
  assert.match(src, /JSON\.stringify\(\{ site, productId, region, email: [^}]*targetCents \}\)/);
  assert.match(fs.readFileSync("src/app/alert-feed.json/route.ts", "utf8"), /export const dynamic = "force-static";/);
});

test("the feed's deal bar is deals.ts isDeal", () => {
  for (const [lo, med, n, type, market] of [[100_00, 140_00, 4, "Play Booster Box", "US"], [100_00, 105_00, 4, "Play Booster Box", "US"], [100_00, 300_00, 4, "Bundle", "AU"], [500, 800, 5, "Bundle", "UK"], [100_00, 140_00, 2, "Bundle", "US"]] as const) {
    const card = { slug: "x", name: "x", productType: type, setCode: null, imageUrl: null, lowestPriceCents: lo, inStockStores: n, listedStores: n, marketplaceOpen: false, medianOpenCents: med, releaseDate: null };
    assert.equal(feedIsDeal({ lowestPriceCents: lo, medianOpenCents: med, inStockStores: n, market }, type), isDeal(card, market), `${lo}/${med}/${n}/${type}`);
  }
});
