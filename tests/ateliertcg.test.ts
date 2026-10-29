import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rowsFromReads } from "../src/lib/importer";
import { readShopifyCollection, WHOLE_CATALOGUE } from "../src/lib/feeds";
import { STORE_BY_KEY } from "../src/lib/stores";

// L'Atelier TCG (Laval, QC) runs its own platform, not Shopify, but serves Shopify's feed format for its whole catalogue at
// /products.json (every game, CAD, a `url` field linking its own product page). The fixture is a sample of that live feed
// as read on 2026-10-29 (titles, handles, prices, availability and urls as served), trimmed to the fields the importer
// reads: 40 Magic products, then a few of its One Piece and Riftbound ones.
const FIXTURE = new URL("./fixtures/ateliertcg-products-2026-10-29.json", import.meta.url);

async function readFixture() {
  const store = STORE_BY_KEY.get("ateliertcg")!;
  const feed = readFileSync(FIXTURE, "utf8");
  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (url: string) => {
    const u = new URL(url);
    if (u.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /api/\nDisallow: /*/cart\n", { status: 200 });
    asked.push(`${u.pathname}?${u.searchParams}`);
    return new Response(feed, { status: 200 });
  }) as typeof fetch;
  const read = await readShopifyCollection(store.base, store.collections[0], { country: store.country }).finally(() => {
    globalThis.fetch = realFetch;
  });
  return { store, read, asked };
}

test("L'Atelier TCG is listed once, in Canada, reading its whole catalogue", () => {
  assert.deepEqual(STORE_BY_KEY.get("ateliertcg"), {
    key: "ateliertcg",
    name: "L'Atelier TCG",
    base: "https://ateliertcg.com",
    market: "CA",
    platform: "shopify",
    country: "CA",
    collections: [WHOLE_CATALOGUE],
  });
  // Its second storefront, ccctcg.ca, sells the same stock at the same prices (284 of 284 products, 2026-10-29): one stock, one store.
  assert.equal([...STORE_BY_KEY.values()].some((s) => s.base.includes("ccctcg")), false);
});

test("L'Atelier TCG: the whole-catalogue feed yields its Magic sealed only, linking its own product pages", async () => {
  const { store, read, asked } = await readFixture();
  assert.deepEqual(asked, ["/products.json?limit=250&page=1&country=CA"]);
  assert.equal(read.ok, true);
  const rows = rowsFromReads(store, [read]);
  assert.ok(rows.length >= 20, `${rows.length} rows`);
  // Other games never reach a row: the catalogue is read strictly.
  assert.equal(rows.some((r) => /one piece|riftbound/i.test(r.title)), false);
  // "(display of 15)" prerelease cases are refused, not read as one pack.
  assert.equal(rows.some((r) => /display of/i.test(r.title)), false);
  const box = rows.find((r) => r.title === "MTG Aetherdrift Play Booster Box")!;
  assert.equal(box.identity.groupKey, "dft|play-booster-box");
  assert.equal(box.url, "https://ateliertcg.com/en/product/mtg-aetherdrift-play-booster-box/");
  assert.equal(box.priceCents, 19140);
  assert.equal(box.inStock, true);
  assert.equal(rows.find((r) => r.title === "MTG Bloomburrow Play Booster Box")!.inStock, false);
});

test("a feed `url` off the store's origin is ignored for Shopify's /products/<handle>", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (new URL(url).pathname === "/robots.txt") return new Response("", { status: 404 });
    return new Response(
      JSON.stringify({ products: [{ handle: "box", title: "MTG Box", url: "https://elsewhere.example/box", variants: [{ price: "10.00", available: true }] }] }),
      { status: 200 },
    );
  }) as typeof fetch;
  const read = await readShopifyCollection("https://shop.example", "mtg-sealed").finally(() => {
    globalThis.fetch = realFetch;
  });
  assert.equal(read.products[0].url, "https://shop.example/products/box");
});
