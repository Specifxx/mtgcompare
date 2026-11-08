import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPriceApi } from "../src/lib/price-api";

// The free price file (competitor scan, 2026-11-08): the alert feed's store prices, absolute links, a file built at
// deploy, never a function.
test("prices.json carries each product's store price per market, with absolute links and currencies", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prices-"));
  fs.writeFileSync(path.join(dir, "products.json"), JSON.stringify([{ id: "p1", slug: "box", name: "Box", productType: "Booster Box", setCode: null }, { id: "p2", slug: "none", name: "None", productType: "Bundle", setCode: null }]));
  fs.writeFileSync(
    path.join(dir, "product-stats.json"),
    JSON.stringify([
      { productId: "p1", market: "US", lowestPriceCents: 10000, inStockStores: 4, listedStores: 5, marketplaceOpen: true, medianOpenCents: 14000 },
      { productId: "p1", market: "AU", lowestPriceCents: 15000, inStockStores: 2, listedStores: 2, marketplaceOpen: false, medianOpenCents: 15500 },
      { productId: "p2", market: "US", lowestPriceCents: null, inStockStores: 0, listedStores: 1, marketplaceOpen: false, medianOpenCents: null },
    ]),
  );
  const api = buildPriceApi(new Date("2026-11-08T00:00:00Z"), dir);
  assert.equal(api.products.length, 1);
  const [p] = api.products;
  assert.equal(p.prices.US.cents, 10000);
  assert.equal(p.prices.AU.cents, 15000);
  assert.match(p.prices.US.url, /^https:\/\/[^/]+\/us\/p\/box$/);
  assert.match(p.prices.AU.url, /\/au\/p\/box$/);
  assert.equal(api.currency.US, "USD");
  assert.equal(api.currency.AU, "AUD");
  assert.match(api.licence, /visible link/);
  assert.match(api.attribution.html, /^<a href="https:/);
});

test("prices.json is a static file open to every origin", () => {
  const route = fs.readFileSync("src/app/prices.json/route.ts", "utf8");
  assert.match(route, /export const dynamic = "force-static";/);
  assert.match(route, /Access-Control-Allow-Origin/);
});
