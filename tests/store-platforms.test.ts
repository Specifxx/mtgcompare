// The non-Shopify store readers' parsing, against real payloads captured on
// 2026-10-03 (tests/fixtures/stores/, whitespace collapsed and trimmed to a few
// products). Each reader must hand lib/import.ts the Shopify listing shape, and
// the titles it builds must go through the SAME matcher as every Shopify title.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseBigCommercePage, parseMoney } from "../src/lib/bigcommerce";
import { ecwidListing, ecwidTokens, type EcwidProduct } from "../src/lib/ecwid";
import { bestVariant, buildCardIndex, buildDonIndex, buildNameIndex, matchStoreProduct, type StoreMatchIndexes } from "../src/lib/match";
import { inStockSpecId, nopPrice, parseNopPage } from "../src/lib/nopcommerce";
import { decodeEntities, limiter, sleep } from "../src/lib/scrape";
import { parseShadowposPage, shadowposSearchPath } from "../src/lib/shadowpos";
import { productUrl } from "../src/lib/store-import";
import type { StoreInfo } from "../src/lib/stores";
import { onePieceCategoryIds, wooListing, type WooProduct } from "../src/lib/woocommerce";

const fixture = (f: string) => fs.readFileSync(path.resolve(__dirname, "fixtures/stores", f), "utf8");

// The catalogue rows these fixtures' cards have (ids, names, variants and sets as TCGplayer lists them).
const cards = [
  { id: 541057, name: "Absalom", number: "OP06-081", variant: null, setCode: "OP06", setName: "Wings of the Captain" },
  { id: 541058, name: "Absalom", number: "OP06-081", variant: "Alternate Art", setCode: "OP06", setName: "Wings of the Captain" },
  { id: 657260, name: "Ace & Sabo & Luffy", number: "OP13-007", variant: null, setCode: "OP13", setName: "Carrying On His Will" },
  { id: 657261, name: "Ace & Sabo & Luffy", number: "OP13-007", variant: "Alternate Art", setCode: "OP13", setName: "Carrying On His Will" },
  { id: 710702, name: "Ace & Sabo & Luffy", number: "OP13-007", variant: "English Version 3rd Anniversary Set", setCode: "OP-PR", setName: "One Piece Promotion Cards" },
  { id: 544526, name: "Kid & Killer", number: "EB01-003", variant: null, setCode: "EB-01", setName: "Extra Booster: Memorial Collection" },
  { id: 646722, name: "Kid & Killer", number: "EB01-003", variant: "Offline Regional Participation Pack 2025 Vol.2", setCode: "OP-PR", setName: "One Piece Promotion Cards" },
  { id: 671449, name: "Kid & Killer", number: "EB01-003", variant: "SP", setCode: "OP14", setName: "The Azure Sea's Seven" },
  { id: 629089, name: "Karoo", number: "EB02-001", variant: null, setCode: "EB-02", setName: "Extra Booster: Anime 25th Collection" },
  { id: 486357, name: "Nico Robin", number: "OP02-037", variant: null, setCode: "OP02", setName: "Paramount War" },
  { id: 486749, name: "Nico Robin", number: "OP02-037", variant: "Pre-Release", setCode: "OP02 PRE", setName: "Paramount War Pre-Release Cards" },
];
const ix: StoreMatchIndexes = {
  cards: buildCardIndex(cards),
  names: buildNameIndex([]),
  dons: buildDonIndex([]),
  sealed: [],
};
const match = (title: string) => {
  const m = matchStoreProduct(title, [], ix);
  return "id" in m ? m.id : m.miss;
};

// ── ShadowPOS ────────────────────────────────────────────────────────────────

test("ShadowPOS: the search fragment becomes listings with the set in trailing brackets", () => {
  const got = parseShadowposPage(fixture("shadowpos-page.html"), "https://thecleverkobold.com");
  assert.ok(got);
  assert.deepEqual(
    got.map((p) => p.title),
    [
      "Absalom (OP06-081 — Alternate Art) [Wings of the Captain]",
      "Ace & Sabo & Luffy (OP13-007) [Carrying On His Will]",
      "Ace & Sabo & Luffy (OP13-007 — Alternate Art) [Carrying On His Will]",
    ],
  );
  for (const p of got) {
    assert.match(p.url!, /^https:\/\/thecleverkobold\.com\/products\/product_[a-z0-9]+$/);
    assert.equal(p.handle, p.url!.split("/products/")[1]);
    assert.ok(p.variants.length >= 1);
    for (const v of p.variants) assert.match(v.price, /^\d+\.\d{2}$/);
  }
  // In stock = available AND a positive inventory; condition from "Normal / Near Mint".
  for (const p of got) assert.ok(bestVariant(p.variants), p.title);
  assert.equal(bestVariant(got[0].variants)?.condition, "NM");
});

test("ShadowPOS titles match through the shared matcher, printing and set included", () => {
  assert.equal(match("Absalom (OP06-081 — Alternate Art) [Wings of the Captain]"), 541058);
  // The plain card, not the OP-PR anniversary print that shares its number.
  assert.equal(match("Ace & Sabo & Luffy (OP13-007) [Carrying On His Will]"), 657260);
  assert.equal(match("Ace & Sabo & Luffy (OP13-007 — Alternate Art) [Carrying On His Will]"), 657261);
});

test("ShadowPOS: anything but a search-results fragment is a failed read, not an empty store", () => {
  assert.equal(parseShadowposPage("<html><body>Just a moment...</body></html>", "https://x.example"), null);
  assert.deepEqual(parseShadowposPage('<div id="products-container" data-advanced-search-results></div>', "https://x.example"), []);
  assert.equal(shadowposSearchPath(200), "/api/advanced-search?game=onepiece&limit=100&offset=200&orderBy=title&inStockOnly=true");
});

// ── Ecwid ────────────────────────────────────────────────────────────────────

test("Ecwid: every public token on the storefront, in order", () => {
  assert.deepEqual(ecwidTokens(fixture("ecwid-storefront.html")), [
    "public_dMHYS7Y6wStVRJN8CKLPEVwLNiUCqjd9",
    "public_Z538RtEQgXJ3mrUryKZF51CuPwDMr34z",
    "public_BMFmu4K5UQznXf9ShvMbGzmq7bPVaP4F",
  ]);
});

test("Ecwid: a product is one variant at its price, in stock as the API says", () => {
  const d = JSON.parse(fixture("ecwid-products.json")) as { total: number; items: EcwidProduct[] };
  const got = d.items.map(ecwidListing);
  assert.deepEqual(got[0], {
    title: "Nico Robin UC Paramount War OP02-037",
    handle: "862780342",
    url: "https://mightytoys.com.au/products/nico-robin-uc-paramount-war-op02-037-862780342",
    variants: [{ title: "", price: "1.50", available: true }],
  });
  assert.equal(match(got[0]!.title), 486357);
  assert.equal(ecwidListing({ ...d.items[0], inStock: false })!.variants[0].available, false);
  assert.equal(ecwidListing({ ...d.items[0], enabled: false }), null);
});

// ── BigCommerce ──────────────────────────────────────────────────────────────

test("BigCommerce: category cards with price, currency and the stock button", () => {
  const got = parseBigCommercePage(fixture("bigcommerce-category.html"), "AUD");
  assert.deepEqual(
    got.map((p) => [p.title, p.variants[0].price, p.variants[0].available]),
    [
      ["[EB01-003] Kid & Killer (Offline Regional 2025 Vol. 2) (Foil)", "22.00", false],
      ["[EB01-003](R) Kid & Killer (OP-14 SPs) (Foil)", "105.50", true],
      ["[EB02-001](C) Karoo", "0.75", true],
    ],
  );
  assert.equal(got[2].url, "https://grandjgames.com/OPEB02-001C/");
  assert.equal(match(got[2].title), 629089);
  // The OP14 SP reprint is not said the way TCGplayer says it: skipped, not guessed.
  assert.equal(typeof match(got[1].title), "string");
  // A page priced in another currency yields nothing.
  assert.deepEqual(parseBigCommercePage(fixture("bigcommerce-category.html"), "USD"), []);
});

test("BigCommerce money: thousands separators, and only the market's currency", () => {
  assert.equal(parseMoney("3,096.00$ AUD", "AUD"), 3096);
  assert.equal(parseMoney("22.00$ AUD", "AUD"), 22);
  assert.equal(parseMoney("22.00$ USD", "AUD"), null);
  assert.equal(parseMoney("", "AUD"), null);
});

// ── nopCommerce ──────────────────────────────────────────────────────────────

test("nopCommerce: the in-stock filter's option id, read from the page", () => {
  assert.equal(inStockSpecId(fixture("nopcommerce-category-gbp.html")), "1");
  assert.equal(inStockSpecId("<div>no filters</div>"), null);
});

test("nopCommerce: in-stock cards in GBP, and the pager's last page", () => {
  const { listings, cards: n, lastPage } = parseNopPage(fixture("nopcommerce-category-gbp.html"), "https://unicorncards.co.uk", "GBP");
  assert.equal(n, 2);
  assert.equal(lastPage, 51);
  assert.deepEqual(
    listings.map((l) => [l.title, l.variants[0].price, l.variants[0].available]),
    [
      ["DON!! Card (Big Mom) : Foil English One Piece TCG Card : PRB01: One Piece Card The Best: Premium Booster", "9.90", true],
      ["DON!! Card (Big Mom) : Non-Foil English One Piece TCG Card : PRB01: One Piece Card The Best: Premium Booster", "4.90", true],
    ],
  );
  assert.match(listings[0].url!, /^https:\/\/unicorncards\.co\.uk\/don-card-big-mom-foil-/);
});

test("nopCommerce: a page served in the visitor's currency (USD) is never read as GBP", () => {
  const { listings, cards: n } = parseNopPage(fixture("nopcommerce-category-usd.html"), "https://unicorncards.co.uk", "GBP");
  assert.equal(n, 1);
  assert.deepEqual(listings, []);
  assert.equal(nopPrice("&#xA3;1,234.50", "GBP"), 1234.5);
  assert.equal(nopPrice("$13.07", "GBP"), null);
});

// ── WooCommerce ──────────────────────────────────────────────────────────────

test("WooCommerce: One Piece singles categories only, never the sealed one", () => {
  const cats = JSON.parse(fixture("woocommerce-categories.json")) as { id: number; name: string; slug: string }[];
  assert.deepEqual(onePieceCategoryIds(cats), [95]); // "onepiece", not "onepiece-scelles"
  assert.deepEqual(onePieceCategoryIds(cats, ["promo"]).sort((a, b) => a - b), [95, 135]);
});

test("WooCommerce: minor units, the stated currency, and a variable product's top price", () => {
  const ps = JSON.parse(fixture("woocommerce-products.json")) as WooProduct[];
  const l = wooListing(ps[1], "EUR")!;
  assert.equal(l.title, "Zoro-Juurou Op05-067 Promo");
  assert.deepEqual(l.variants, [{ title: "", price: "15.99", available: true }]);
  assert.equal(l.url, ps[1].permalink);
  assert.equal(wooListing(ps[1], "GBP"), null);
  // A variable product (conditions as options) records its range's MAXIMUM as Near Mint.
  const variable = { ...ps[1], type: "variable", prices: { ...ps[1].prices, price_range: { min_amount: "999", max_amount: "1599" } } };
  assert.deepEqual(wooListing(variable, "EUR")!.variants, [{ title: "Near Mint", price: "15.99", available: true }]);
});

// ── Shared ───────────────────────────────────────────────────────────────────

test("a listing's own URL wins over Shopify's /products/<handle>", () => {
  const store = { key: "x", name: "X", base: "https://x.example", country: "US", collections: [] } as StoreInfo;
  assert.equal(productUrl(store, { title: "t", handle: "h", variants: [] }), "https://x.example/products/h");
  assert.equal(productUrl(store, { title: "t", handle: "h", url: "https://x.example/p/1", variants: [] }), "https://x.example/p/1");
});

test("entities in scraped titles are decoded once", () => {
  assert.equal(decodeEntities("Kid &amp; Killer"), "Kid & Killer");
  assert.equal(decodeEntities("You Ain&#x27;t Even Worth Killing Time!!"), "You Ain't Even Worth Killing Time!!");
  assert.equal(decodeEntities("&amp;lt;"), "&lt;");
  assert.equal(decodeEntities("&#xA3;0.75"), "£0.75");
});

test("limiter: never more than n at once", async () => {
  const gate = limiter(2);
  let active = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: 7 }, () =>
      gate(async () => {
        active++;
        peak = Math.max(peak, active);
        await sleep(5);
        active--;
      }),
    ),
  );
  assert.equal(peak, 2);
});
