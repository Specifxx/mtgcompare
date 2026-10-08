// The store readers (lib/store-import.ts and the platform readers beside it) and the S8 stage, against real Magic data.
//
// WHERE THE DATA COMES FROM.
//   tests/fixtures/stores/shadowpos-page.html   a ShadowPOS search fragment captured 2026-10-07 (/api/advanced-search?game=mtg&orderBy=price-desc), whitespace collapsed, trimmed to three listings (The One Ring,
//                                               Mana Vault, Sol Ring). Dollars, not cents, and the finish is in the variant title.
//   tests/fixtures/stores/{ecwid,bigcommerce,nopcommerce,woocommerce}-*      the PAYLOAD SHAPES captured from live storefronts on 2026-10-03 (the markup, the field names, the pager, the stock button). No seed store of the
//                                               registry runs these platforms (all 67 are Shopify, 13 are ShadowPOS), so their product rows were replaced by Magic listings of the same shape, priced from the
//                                               TCGCSV snapshot of 2026-10-07 at tests' fx rates (Counterspell 5503 $3.41, Scalding Tarn 238610 $37.84 / $42.30 foil, The One Ring 487805 $116.19 / $139.67 foil).
//   tests/fixtures/titles/{listings,rows,sealed}.json   the 252 real Shopify listings, the catalogue rows and the sealed products of the matcher's tests (WP03): the S8 stage is run over them.
// What each reader hands over is the Shopify listing shape; the titles it builds go through the SAME matcher as every Shopify title.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseBigCommercePage, parseMoney } from "../src/lib/bigcommerce";
import { uidOf, type Finish } from "../src/lib/constants";
import { ecwidListing, ecwidTokens, type EcwidProduct } from "../src/lib/ecwid";
import type { ImportContext } from "../src/lib/import";
import { bestVariant, type MatchRow } from "../src/lib/match";
import { inStockSpecId, nopPrice, parseNopPage } from "../src/lib/nopcommerce";
import { decodeEntities, limiter, sleep } from "../src/lib/scrape";
import { SHADOWPOS_PAGE, fetchShadowposStore, pageMaxCents, parseShadowposPage, shadowposSearchPath } from "../src/lib/shadowpos";
import { ADMIT_MIN_MATCHED_IN_STOCK, SKIP_HANDLE, buildStageIndex, discoverMagicCollections, fetchStoreProducts, importStores, listingPath, matchListing, newTally, productUrl, shopifyVariant, type StoreListing } from "../src/lib/store-import";
import { memTree } from "../src/lib/data/plane/tree";
import { storeByKey, type StoreInfo } from "../src/lib/stores";
import { magicCategoryIds, wooListing, type WooProduct } from "../src/lib/woocommerce";

const fixture = (f: string) => fs.readFileSync(path.resolve(__dirname, "fixtures/stores", f), "utf8");
const titles = <T,>(f: string): T => JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/titles", f), "utf8")) as T;

// The catalogue rows these fixtures' cards have: the matcher test's rows, plus three TCGCSV products the ShadowPOS page names (Mana Vault 308 in Double Masters 2022, Sol Ring 1604 in Secret Lair Drop).
const allRows = titles<MatchRow[]>("rows.json");
const rows: MatchRow[] = [
  ...allRows.filter((r) => [5503, 238610, 487805].includes(r.id)),
  { id: 276291, groupId: 3070, names: ["mana vault"], sc: "2x2", setNames: ["double masters 2022"], nkey: "308", treat: [], hasN: true, hasF: true, etched: false, rootId: null, cls: 0, label: null, abbr: "2x2" },
  { id: 555447, groupId: 2576, names: ["sol ring"], sc: "sld", setNames: ["secret lair drop"], nkey: "1604", treat: [], hasN: true, hasF: false, etched: false, rootId: null, cls: 0, label: null, abbr: "sld" },
];
// TCGplayer market prices of 2026-10-07 in USD cents, per (product, finish): the plausibility reference.
const MARKET: [number, Finish, number][] = [[487805, "N", 11619], [487805, "F", 13967], [238610, "N", 3784], [238610, "F", 4230], [276291, "N", 11606], [555447, "N", 8864], [5503, "N", 341]];
const tree = () => {
  const t = memTree();
  t.write("px/0/0.json", JSON.stringify({ v: 1, b: 0, p: [...new Set(MARKET.map((m) => m[0]))].map((id) => [id, MARKET.find((m) => m[0] === id && m[1] === "N")?.[2] ?? null, MARKET.find((m) => m[0] === id && m[1] === "F")?.[2] ?? null, null, null, 0]) }));
  return t;
};
const tracked = new Set(MARKET.filter((m) => m[2] >= 500).map((m) => uidOf(m[0], m[1])));
const si = buildStageIndex({ match: rows, work: tree(), tracked });

const store = (platform: StoreInfo["platform"], country: StoreInfo["country"] = "US", base = "https://x.example"): StoreInfo => ({ id: 32001, key: "x", name: "X", base, country, collections: [], platform, status: "unverified" });
const offersOf = (s: StoreInfo, listings: StoreListing[]) => {
  const t = newTally();
  for (const l of listings) matchListing(s, l, si, t);
  return t;
};

// ── ShadowPOS ────────────────────────────────────────────────────────────────

test("ShadowPOS: the search fragment becomes listings with the set in trailing brackets, dollars as prices and the finish in the variant", () => {
  const got = parseShadowposPage(fixture("shadowpos-page.html"), "https://gameandcompany.com");
  assert.ok(got);
  assert.deepEqual(
    got.map((p) => p.title),
    ["The One Ring (0246) [The Lord of the Rings: Tales of Middle-earth]", "Mana Vault (308/331) [Double Masters 2022]", "Sol Ring (1604) [Secret Lair Drop]"],
  );
  for (const p of got) {
    assert.match(p.url!, /^https:\/\/gameandcompany\.com\/products\/product_[a-z0-9]+$/);
    assert.equal(p.handle, p.url!.split("/products/")[1]);
    assert.ok(p.variants.length >= 1);
    for (const v of p.variants) assert.match(v.price, /^\d+\.\d{2}$/);
  }
  // In stock = available AND a positive inventory; the condition comes from "Normal / Near Mint".
  const ring = got[0]!;
  assert.deepEqual(ring.variants[0], { title: "Normal / Near Mint", price: "119.00", available: true, options: ["Normal", "Near Mint"] });
  assert.equal(ring.variants[1]!.available, false, "Normal / Lightly Played has no inventory");
  assert.equal(bestVariant(ring.variants)?.condition, "NM");
  assert.equal(bestVariant(ring.variants)?.priceCents, 11900);
});

test("ShadowPOS titles match through the shared matcher, printing, set and finish included, and are priced against TCGplayer's market", () => {
  const got = parseShadowposPage(fixture("shadowpos-page.html"), "https://gameandcompany.com")!;
  const t = offersOf(store("shadowpos", "US", "https://gameandcompany.com"), got);
  assert.equal(t.products, 3);
  assert.equal(t.matched, 3);
  assert.deepEqual(
    t.drafts.map((d) => [d.productId, d.finish, d.priceCents, d.condition, d.inStock]),
    [[487805, "N", 11900, "NM", true], [487805, "F", 14000, "NM", true], [276291, "N", 11600, "NM", true], [555447, "N", 4450, null, false]],
  );
  for (const d of t.drafts) assert.match(d.path, /^\/products\/product_[a-z0-9]+$/);
});

test("ShadowPOS: anything but a search-results fragment is a failed read, not an empty store; the search is Magic's, dearest first", () => {
  assert.equal(parseShadowposPage("<html><body>Just a moment...</body></html>", "https://x.example"), null);
  assert.deepEqual(parseShadowposPage('<div id="products-container" data-advanced-search-results></div>', "https://x.example"), []);
  assert.equal(shadowposSearchPath(100), `/api/advanced-search?game=mtg&limit=${SHADOWPOS_PAGE}&offset=100&orderBy=price-desc&inStockOnly=true`);
});

test("ShadowPOS: a price-sorted read stops at the floor, a short page ends it, and only US stores are read", async () => {
  const got = parseShadowposPage(fixture("shadowpos-page.html"), "https://gameandcompany.com")!;
  assert.equal(pageMaxCents(got), 15300);
  assert.equal(pageMaxCents([]), 0);
  const seen: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
    return new Response(fixture("shadowpos-page.html"), { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  try {
    const r = await fetchShadowposStore({ ...store("shadowpos"), base: "https://gameandcompany.com" }, { stopBelowCents: 100 });
    assert.equal(r.failed, false);
    assert.equal(r.products.length, 3);
    assert.equal(seen.filter((u) => u.includes("/api/advanced-search")).length, 1, "a page shorter than the page size is the last one");
    assert.ok(seen.some((u) => u.includes("game=mtg") && u.includes("orderBy=price-desc")));
    const au = await fetchShadowposStore(store("shadowpos", "AU"));
    assert.equal(au.failed, true);
    assert.match(au.note!, /only US stores/);
  } finally {
    globalThis.fetch = real;
  }
});

// ── Ecwid ────────────────────────────────────────────────────────────────────

test("Ecwid: every public token on the storefront, in order", () => {
  assert.deepEqual(ecwidTokens(fixture("ecwid-storefront.html")), [
    "public_dMHYS7Y6wStVRJN8CKLPEVwLNiUCqjd9",
    "public_Z538RtEQgXJ3mrUryKZF51CuPwDMr34z",
    "public_BMFmu4K5UQznXf9ShvMbGzmq7bPVaP4F",
  ]);
});

test("Ecwid: a product is one variant at its price, in stock as the API says, and its title goes through the matcher", () => {
  const d = JSON.parse(fixture("ecwid-products.json")) as { total: number; items: EcwidProduct[] };
  const got = d.items.map(ecwidListing);
  assert.deepEqual(got[0], {
    title: "Counterspell Tempest TMP 57",
    handle: "862780342",
    url: "https://mightytoys.com.au/products/counterspell-tempest-tmp-57-862780342",
    variants: [{ title: "", price: "5.12", available: true }],
  });
  assert.equal(ecwidListing({ ...d.items[0]!, inStock: false })!.variants[0]!.available, false);
  assert.equal(ecwidListing({ ...d.items[0]!, enabled: false }), null);
  // Counterspell is under the track floor: matched, not carried. The One Ring has no number the title states in a form the matcher trusts: skipped, never guessed.
  const t = offersOf(store("ecwid", "AU", "https://mightytoys.com.au"), got.map((l) => l!));
  assert.equal(t.products, 3);
  assert.deepEqual(t.drafts, []);
});

// ── BigCommerce ──────────────────────────────────────────────────────────────

test("BigCommerce: category cards with price, currency and the stock button", () => {
  const got = parseBigCommercePage(fixture("bigcommerce-category.html"), "AUD");
  assert.deepEqual(
    got.map((p) => [p.title, p.variants[0]!.price, p.variants[0]!.available]),
    [
      ["Scalding Tarn [MH2 - 254] (Foil)", "63.45", false],
      ["The One Ring [LTR - 246] (Foil)", "209.51", true],
      ["Counterspell [TMP - 57]", "5.12", true],
    ],
  );
  assert.equal(got[2]!.url, "https://grandjgames.com/counterspell-tmp-57-5503/");
  // [SET - NUM] is a key: the foil title picks the Foil unit; the out-of-stock Scalding Tarn is carried as an out-of-stock offer. A title that states no finish at all ("Counterspell [TMP - 57]") is skipped:
  // the matcher never infers a finish from the headline.
  const t = offersOf(store("bigcommerce", "AU", "https://grandjgames.com"), got);
  assert.equal(t.matched, 2);
  assert.deepEqual(t.misses, { "finish-unknown": 1 });
  assert.deepEqual(
    t.drafts.map((d) => [d.productId, d.finish, d.priceCents, d.inStock]),
    [[238610, "F", 6345, false], [487805, "F", 20951, true]],
  );
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
    listings.map((l) => [l.title, l.variants[0]!.price, l.variants[0]!.available]),
    [
      ["The One Ring [LTR - 246] (Foil)", "110.34", true],
      ["The One Ring [LTR - 246] (Non-Foil)", "91.79", true],
    ],
  );
  assert.match(listings[0]!.url!, /^https:\/\/unicorncards\.co\.uk\/the-one-ring-0246-foil-/);
  // Two products, two finishes, one number: each title picks its own unit (the foil word decides, never a tag).
  const t = offersOf(store("nopcommerce", "UK", "https://unicorncards.co.uk"), listings);
  assert.deepEqual(
    t.drafts.map((d) => [d.productId, d.finish, d.priceCents]),
    [[487805, "F", 11034], [487805, "N", 9179]],
  );
});

test("nopCommerce: a page served in the visitor's currency (USD) is never read as GBP", () => {
  const { listings, cards: n } = parseNopPage(fixture("nopcommerce-category-usd.html"), "https://unicorncards.co.uk", "GBP");
  assert.equal(n, 1);
  assert.deepEqual(listings, []);
  assert.equal(nopPrice("&#xA3;1,234.50", "GBP"), 1234.5);
  assert.equal(nopPrice("$13.07", "GBP"), null);
});

// ── WooCommerce ──────────────────────────────────────────────────────────────

test("WooCommerce: Magic singles categories only, never the sealed one", () => {
  const cats = JSON.parse(fixture("woocommerce-categories.json")) as { id: number; name: string; slug: string }[];
  assert.deepEqual(magicCategoryIds(cats), [71]); // "magic", not "magic-scelles"
  assert.deepEqual(magicCategoryIds(cats, ["wizards"]).sort((a, b) => a - b), [71, 75]);
});

test("WooCommerce: minor units, the stated currency, and a variable product's top price", () => {
  const ps = JSON.parse(fixture("woocommerce-products.json")) as WooProduct[];
  const l = wooListing(ps[1]!, "EUR")!;
  assert.equal(l.title, "Counterspell Tmp 57 Tempest");
  assert.deepEqual(l.variants, [{ title: "", price: "3.14", available: true }]);
  assert.equal(l.url, ps[1]!.permalink);
  assert.equal(wooListing(ps[1]!, "GBP"), null);
  // A variable product (conditions as options) records its range's MAXIMUM as Near Mint.
  const variable = { ...ps[1]!, type: "variable", prices: { ...ps[1]!.prices, price_range: { min_amount: "199", max_amount: "314" } } };
  assert.deepEqual(wooListing(variable, "EUR")!.variants, [{ title: "Near Mint", price: "3.14", available: true }]);
});

// ── Shopify ──────────────────────────────────────────────────────────────────

test("Shopify: products.json variants carry their SKU and option values; collection handles skip sealed, foreign and accessory collections", () => {
  assert.deepEqual(shopifyVariant({ title: "Near Mint / English / Foil", price: "50.00", available: true, sku: "7505943", option1: "Near Mint", option2: "English", option3: "Foil" }), {
    title: "Near Mint / English / Foil", price: "50.00", available: true, sku: "7505943", options: ["Near Mint", "English", "Foil"],
  });
  assert.deepEqual(shopifyVariant({ title: "Default Title", price: "1.00", available: false, option1: "Default Title" }).options, []);
  for (const h of ["mtg-japanese-singles", "magic-the-gathering-accessories", "mtg-psa-graded", "magic-tokens", "mtg-art-series", "mtg-deck-boxes-supplies"]) assert.ok(SKIP_HANDLE.test(h), h);
  for (const h of ["mtg-singles", "magic-the-gathering-singles-in-stock", "mtg-singles-all-products", "magic-singles-instock"]) assert.ok(!SKIP_HANDLE.test(h), h);
});

const sitemap = (...handles: string[]) => `<?xml version="1.0"?><urlset>${handles.map((h) => `<url><loc>https://x.example/collections/${h}</loc></url>`).join("")}</urlset>`;
const sitemapIndex = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://x.example/sitemap_collections_1.xml</loc></sitemap></sitemapindex>`;
/** A fetch that serves a store: robots, a sitemap, meta.json and the products.json pages of its collections. */
function serve(files: Record<string, string | ((u: URL) => string)>, log: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const u = new URL(String(input));
    log.push(u.pathname + u.search);
    const hit = files[u.pathname];
    return hit === undefined ? new Response("", { status: 404 }) : new Response(typeof hit === "function" ? hit(u) : hit, { status: 200 });
  }) as typeof fetch;
}
const page = (n: number, from = 0) => JSON.stringify({ products: Array.from({ length: n }, (_, i) => ({ title: `Card ${from + i}`, handle: `card-${from + i}`, variants: [{ title: "Near Mint", price: "5.00", available: true, sku: null }] })) });

test("Shopify discovery reads the sitemap: Magic handles, singles and sealed apart", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = serve({ "/sitemap.xml": sitemapIndex, "/sitemap_collections_1.xml": sitemap("mtg-singles", "magic-the-gathering-sealed", "pokemon-singles", "mtg-accessories", "mtg-booster-boxes", "magic-singles-in-stock") });
  try {
    const d = await discoverMagicCollections("https://x.example");
    assert.deepEqual(d.singles, ["mtg-singles", "magic-singles-in-stock"]);
    assert.deepEqual(d.sealed, ["magic-the-gathering-sealed", "mtg-booster-boxes"]);
  } finally {
    globalThis.fetch = real;
  }
});

test("Shopify read: pages of 250, the store's page budget, an in-stock handle read first and its superset skipped, products streamed and never held", async () => {
  const real = globalThis.fetch;
  const log: string[] = [];
  const s: StoreInfo = { ...store("shopify"), collections: ["mtg-singles-all-products"], maxPages: 3 };
  globalThis.fetch = serve(
    {
      "/sitemap.xml": sitemapIndex,
      "/sitemap_collections_1.xml": sitemap("mtg-singles-in-stock", "mtg-singles-all-products"),
      "/collections/mtg-singles-in-stock/products.json": (u) => (u.searchParams.get("page") === "1" ? page(250) : page(40, 250)),
      "/collections/mtg-singles-all-products/products.json": () => page(250, 9000),
    },
    log,
  );
  try {
    const got: string[] = [];
    const r = await fetchStoreProducts(s, { sink: (p) => got.push(...p.map((x) => x.handle)) });
    assert.equal(r.failed, false);
    assert.equal(r.count, 290);
    assert.equal(r.products.length, 0, "streamed to the sink, not kept");
    assert.equal(got.length, 290);
    assert.ok(log.filter((l) => l.includes("mtg-singles-in-stock/products.json")).every((l) => l.includes("limit=250") && l.includes("country=US")));
    assert.ok(!log.some((l) => l.includes("mtg-singles-all-products/products.json")), "the superset of an in-stock handle is not read");
    // Without a sink the products come back.
    const kept = await fetchStoreProducts({ ...s, maxPages: 1 });
    assert.equal(kept.products.length, 250, "one page of the budget");
  } finally {
    globalThis.fetch = real;
  }
});

test("Shopify read: a configured handle that cannot be read is a FAILED read; past the deadline it is too", async () => {
  const real = globalThis.fetch;
  const s: StoreInfo = { ...store("shopify"), collections: ["mtg-singles"] };
  globalThis.fetch = serve({ "/sitemap.xml": sitemapIndex, "/sitemap_collections_1.xml": sitemap("mtg-singles"), "/collections/mtg-singles/products.json": () => "<html>Just a moment...</html>" });
  try {
    const r = await fetchStoreProducts(s);
    assert.equal(r.failed, true);
    assert.match(r.note!, /mtg-singles could not be read/);
    globalThis.fetch = serve({ "/collections/mtg-singles/products.json": page(10) });
    const late = await fetchStoreProducts(s, { deadline: Date.now() - 1 });
    assert.equal(late.failed, true);
    assert.match(late.note!, /time budget/);
  } finally {
    globalThis.fetch = real;
  }
});

// ── Shared ───────────────────────────────────────────────────────────────────

test("a listing's own URL wins over Shopify's /products/<handle>; the path is below the store's origin or the row is dropped", () => {
  const s = store("shopify");
  assert.equal(productUrl(s, { title: "t", handle: "h", variants: [] }), "https://x.example/products/h");
  assert.equal(productUrl(s, { title: "t", handle: "h", url: "https://x.example/p/1", variants: [] }), "https://x.example/p/1");
  assert.equal(listingPath(s, { title: "t", handle: "h", variants: [] }), "/products/h");
  assert.equal(listingPath(s, { title: "t", handle: "h", url: "https://x.example/p/1?v=2", variants: [] }), "/p/1?v=2");
  assert.equal(listingPath(s, { title: "t", handle: "h", url: "https://elsewhere.example/p/1", variants: [] }), null);
});

test("entities in scraped titles are decoded once", () => {
  assert.equal(decodeEntities("Kid &amp; Killer"), "Kid & Killer");
  assert.equal(decodeEntities("Ain&#x27;t Even Worth Killing Time!!"), "Ain't Even Worth Killing Time!!");
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

// ── The stage (S8) over the 252 real listings of the matcher's tests ─────────────────────────────

interface Fx { key: string; store: string; title: string; handle: string; ptype: string; tags: string[]; options: [string, string[]][]; variants: [string, string, boolean, string][]; expect: string[]; explicitFoil?: boolean }
const listings = titles<Fx[]>("listings.json");
const sealed = titles<{ id: number; name: string; setCode: string | null; kind: string }[]>("sealed.json");

/** products.json of the fixture listings: the variant title split into option1..3 as Shopify does. */
const productsJson = (fx: Fx[]): string =>
  JSON.stringify({
    products: fx.map((l) => ({
      title: l.title, handle: l.handle, product_type: l.ptype, tags: l.tags,
      variants: l.variants.map((v) => ({ title: v[0], price: v[1], available: v[2], sku: v[3], ...Object.fromEntries(v[0].split(" / ").slice(0, 3).map((o, i) => [`option${i + 1}`, o])) })),
    })),
  });

/** An ImportContext with the catalogue of the matcher's tests: every unit the recorded answers name is tracked. */
function context(): { ctx: ImportContext; expected: Map<number, string> } {
  const expected = new Map<number, string>();
  const t = memTree();
  const codes = [...new Set(sealed.map((s) => s.setCode).filter((c): c is string => Boolean(c)))];
  t.write("meta/sets.json", JSON.stringify({ v: 1, at: "x", sets: codes.map((c, i) => [i + 1, `set-${i + 1}`, c.toLowerCase(), c, c, c, "expansion", "2026-01-01", 0, c]) }));
  t.write("sl/list-0.json", JSON.stringify({ v: 1, at: "x", chunk: 0, chunks: 1, s: sealed.map((s) => [s.id, `s-${s.id}`, s.name, s.setCode ? codes.indexOf(s.setCode) + 1 : 0, s.kind, 0, 0, 0, null, null, 0, 0, null]) }));
  const unitsOf = new Set<number>();
  for (const l of listings) for (const e of l.expect) { const m = /^(\d+)\.([NF])\.(\w[\w-]*)$/.exec(e); if (m && m[3] !== "sealed") unitsOf.add(uidOf(Number(m[1]), m[2] as Finish)); }
  const ctx = { log: () => undefined, match: titles<MatchRow[]>("rows.json"), work: t, tracked: unitsOf, cfg: { trackFloorCents: 500, trackExitRatio: 0.8 }, offers: { cards: [], sealed: [], reads: [] } } as unknown as ImportContext;
  return { ctx, expected };
}

test("S8 over real listings: every recorded answer of a listing comes out as a staged offer of the store, one per (product, finish), and the read is recorded", async () => {
  const goodgames = storeByKey("goodgames")!;
  const was = goodgames.status;
  (goodgames as { status: string }).status = "verified";
  const real = globalThis.fetch;
  // The registry flags no store explicitFoil (the production probe sets it), so the listings of stores whose recorded answers assumed that convention are left out.
  const mine = listings.filter((l) => !l.explicitFoil);
  globalThis.fetch = serve({ "/collections/mtg-singles-all-products/products.json": (u) => (u.searchParams.get("page") === "1" ? productsJson(mine) : '{"products":[]}') });
  try {
    const { ctx } = context();
    const res = await importStores(ctx, { only: ["goodgames"] });
    assert.equal(res.length, 1);
    const r = res[0]!;
    assert.equal(r.key, "goodgames");
    assert.equal(r.country, "AU");
    assert.equal(r.failed, false, r.note);
    assert.equal(r.products, mine.length);
    // Every listing with at least one matched variant counts once, whatever the number of its variants.
    const answered = mine.filter((l) => l.expect.some((e) => /^\d+\.[NF]\./.test(e)));
    assert.equal(r.matched, answered.length);
    const reads = ctx.offers!.reads;
    assert.deepEqual(reads.map((x) => [x.store, x.market, x.ok]), [[goodgames.id, 1, true]]);
    // The recorded (product, finish) pairs of tracked singles are all there, once each, with the registry id and market 1 (AU).
    const want = new Set<number>();
    for (const l of mine) for (const e of l.expect) { const m = /^(\d+)\.([NF])\.(?!sealed)\w/.exec(e); if (m) want.add(uidOf(Number(m[1]), m[2] as Finish)); }
    const got = ctx.offers!.cards.map((c) => c.uid);
    assert.equal(new Set(got).size, got.length, "one row per unit");
    for (const c of ctx.offers!.cards) { assert.equal(c.store, goodgames.id); assert.equal(c.market, 1); assert.ok(c.path.startsWith("/products/")); assert.ok(c.priceCents > 0); }
    for (const u of got) assert.ok(want.has(u), `unexpected unit ${u}`);
    assert.ok(got.length >= want.size * 0.9, `${got.length} of ${want.size} recorded units staged`);
    assert.equal(r.cards, ctx.offers!.cards.length);
    assert.equal(r.sealed, ctx.offers!.sealed.length);
    assert.ok(r.sealed > 0, "the sealed listings of the fixture are staged as sealed offers");
    for (const s of ctx.offers!.sealed) assert.equal(s.condition, null);
  } finally {
    globalThis.fetch = real;
    (goodgames as { status: string }).status = was;
  }
});

test("S8: an unverified store is published only when it passes admission on this read (at least 20 matched in-stock listings, 10.26); a currency that differs from the market's is refused before any read", async () => {
  const goodgames = storeByKey("goodgames")!;
  const real = globalThis.fetch;
  const log: string[] = [];
  globalThis.fetch = serve({ "/meta.json": '{"currency":"AUD"}', "/collections/mtg-singles-all-products/products.json": (u) => (u.searchParams.get("page") === "1" ? productsJson(listings.filter((l) => l.store === "goodgames")) : '{"products":[]}') }, log);
  try {
    const { ctx } = context();
    const [r] = await importStores(ctx, { only: ["goodgames"] });
    assert.match(r!.skipped!, /^not admitted: \d+ matched in-stock listings \(needs 20\)$/);
    assert.equal(ADMIT_MIN_MATCHED_IN_STOCK, 20);
    assert.deepEqual(ctx.offers!.reads, [], "nothing is published for the pair, its previous rows stay");
    assert.deepEqual(ctx.offers!.cards, []);
    // The Mythic Store charges CAD in the US market: refused with no request at all.
    log.length = 0;
    const [m] = await importStores(ctx, { only: ["mythicstore"] });
    assert.equal(m!.skipped, "charges CAD, market is USD");
    assert.deepEqual(log, []);
    // A Shopify storefront that states another currency than its market's is refused after one meta.json request.
    globalThis.fetch = serve({ "/meta.json": '{"currency":"USD"}' }, log);
    const [c] = await importStores(ctx, { only: ["goodgames"] });
    assert.equal(c!.skipped, "charges USD, market is AUD");
  } finally {
    globalThis.fetch = real;
  }
});

test("S8: a read that could not be completed pushes ok: false and stages nothing; the stage tolerates a thrown reader", async () => {
  const goodgames = storeByKey("goodgames")!;
  const was = goodgames.status;
  (goodgames as { status: string }).status = "verified";
  const real = globalThis.fetch;
  globalThis.fetch = serve({ "/collections/mtg-singles-all-products/products.json": () => "<html>Just a moment...</html>" });
  try {
    const { ctx } = context();
    const [r] = await importStores(ctx, { only: ["goodgames"] });
    assert.equal(r!.failed, true);
    assert.deepEqual(ctx.offers!.reads.map((x) => x.ok), [false]);
    assert.deepEqual(ctx.offers!.cards, []);
    globalThis.fetch = (async () => { throw new Error("socket hang up"); }) as typeof fetch;
    const { ctx: c2 } = context();
    const [t] = await importStores(c2, { only: ["goodgames"] });
    assert.equal(t!.failed, true);
  } finally {
    globalThis.fetch = real;
    (goodgames as { status: string }).status = was;
  }
});

test("S8: the public price feeds are OFF unless FEED_SOURCES names them", async () => {
  const { ctx } = context();
  const real = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("no network in this test"); }) as typeof fetch;
  try {
    const res = await importStores(ctx, { only: ["cardkingdom", "manapool"] });
    assert.deepEqual(res, []);
  } finally {
    globalThis.fetch = real;
  }
});
