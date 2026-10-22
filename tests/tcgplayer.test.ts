// TCGplayer search results → import rows. The products are real Magic sealed products from the API (2026-10-21: ids, names, set
// names as the API gives them); the listings are constructed in the shape its three-listing preview returns, to exercise each rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { thumb } from "../src/lib/images";
import { coverageDropped, dropPlaceholderAsks, productStat, readStore, rowsFromReads, type StoreRead } from "../src/lib/importer";
import { TCGPLAYER, type StoreConfig } from "../src/lib/stores";
import {
  readTcgplayerCatalogue,
  shippingLoaded,
  tcgFeedProducts,
  tcgImageUrl,
  tcgProductUrl,
  tcgTitle,
  type TcgListing,
  type TcgProduct,
} from "../src/lib/tcgplayer";
import { identify } from "../src/lib/sealed-title";

function listing(price: number, shippingPrice: number, over: Partial<TcgListing> = {}): TcgListing {
  return { price, shippingPrice, quantity: 3, languageId: 1, language: "English", listingType: "standard", condition: "Unopened", ...over };
}

function product(productId: number, productName: string, setName: string, listings: TcgListing[]): TcgProduct {
  return {
    productId,
    productName,
    productUrlName: productName.replace(/[^A-Za-z0-9 ]/g, ""),
    setName,
    setUrlName: setName.replace(/[:]/g, ""),
    productLineUrlName: "Magic",
    listings,
  };
}

const FIXTURE: TcgProduct[] = [
  // Shipping is excluded: $129.99 + $10.00 shipping lists at $129.99. A custom listing (a partial item) and a Japanese one are
  // cheaper and don't count.
  product(692980, "Reality Fracture - Play Booster Display", "Reality Fracture", [
    listing(5.99, 0, { listingType: "custom" }),
    listing(90, 0, { languageId: 7, language: "Japanese" }),
    listing(129.99, 10),
    listing(131.5, 5.99),
    listing(139, 0),
  ]),
  // $50 + $199.99 shipping is a price loaded into shipping; $65 is sub-floor for a collector box ($120 in the US); out of stock
  // doesn't count.
  product(692963, "The Hobbit - Collector Booster Display", "The Hobbit", [listing(50, 199.99), listing(65, 0), listing(600, 0, { quantity: 0 }), listing(669.99, 6.99)]),
  // Two Commander products of one release: the deck and the set of five are two products.
  product(693140, "Foundations Commander Deck - Calling All Angels", "Commander: Foundations", [listing(49.99, 4.99)]),
  product(707496, "Foundations Commander Decks [Set of 5]", "Commander: Foundations", [listing(195, 0)]),
  // No live listing: TCGplayer has no "sold out", so no row at all.
  product(706138, "Star Trek - Play Booster Display", "Star Trek", []),
  // Its only listing is below the Bundle floor: no believable price, no row.
  product(692985, "Reality Fracture - Bundle", "Reality Fracture", [listing(12, 0)]),
  // Refused by identify(): a sample pack is not the Collector Booster; Mystery Booster 2 is not a set we list.
  product(637653, "FINAL FANTASY - Collector Booster Sample Pack", "FINAL FANTASY", [listing(12.19, 0)]),
  product(563752, "Mystery Booster 2 - Booster Display", "Mystery Booster 2", [listing(299, 0)]),
  // Its only seller asks 20x the market price: a placeholder, not a price.
  { ...product(692969, "The Hobbit Scene Box - Treasures of Smaug", "The Hobbit", [listing(1199.99, 0)]), marketPrice: 58.73 },
  // A repeat of a product already read (the API can page one twice).
  product(692980, "Reality Fracture - Play Booster Display", "Reality Fracture", [listing(1, 0)]),
];

function rows() {
  return rowsFromReads(TCGPLAYER, [{ handle: "magic-the-gathering", ok: true, products: tcgFeedProducts(FIXTURE) }]);
}

test("tcgplayer: the cheapest live standard English listing's item price, shipping excluded", () => {
  const box = rows().find((r) => r.identity.groupKey === "fra|play-booster-box");
  assert.ok(box);
  assert.equal(box.priceCents, 12999);
  assert.equal(box.inStock, true);
  assert.equal(box.title, "Reality Fracture - Play Booster Display");
});

test("tcgplayer: shipping-loaded, sub-floor and out-of-stock listings are skipped", () => {
  assert.equal(shippingLoaded({ price: 50, shippingPrice: 199.99 }), true);
  assert.equal(shippingLoaded({ price: 83.97, shippingPrice: 100 }), true);
  assert.equal(shippingLoaded({ price: 61.97, shippingPrice: 10 }), false); // $10 on a $62 bundle is ordinary
  assert.equal(shippingLoaded({ price: 8, shippingPrice: 7.99 }), false); // a pack's real postage
  assert.equal(shippingLoaded({ price: 2575, shippingPrice: 24.99 }), false); // a case's freight
  const box = rows().find((r) => r.identity.groupKey === "hob|collector-booster-box");
  assert.equal(box?.priceCents, 66999);
});

test("tcgplayer: one row per product; a release's deck and its set of decks are two", () => {
  const keys = rows().map((r) => r.identity.groupKey);
  assert.equal(keys.filter((k) => k === "fra|play-booster-box").length, 1);
  assert.ok(keys.includes("commander-deck|fdn|all-angels-calling"));
  assert.ok(keys.includes("fdn|commander-deck-set"));
});

test("tcgplayer: no listing, only sub-floor or placeholder listings, or a refused title → no row", () => {
  const keys = rows().map((r) => r.identity.groupKey).sort();
  assert.deepEqual(keys, ["commander-deck|fdn|all-angels-calling", "fdn|commander-deck-set", "fra|play-booster-box", "hob|collector-booster-box"]);
  // tcgFeedProducts itself drops products with no buyable listing and repeats.
  const ids = tcgFeedProducts(FIXTURE).map((p) => p.id);
  assert.ok(!ids.includes("706138"));
  assert.ok(!ids.includes("692969"));
  assert.equal(ids.filter((id) => id === "692980").length, 1);
});

test("tcgplayer: a name without a set borrows TCGplayer's set, only for set products", () => {
  // TCGplayer's Magic names carry their set; a bare one (constructed here) borrows it, "Commander:" and "Universes Beyond:" dropped.
  assert.equal(tcgTitle({ productName: "Bundle", setName: "Reality Fracture" }), "Reality Fracture Bundle");
  assert.equal(tcgTitle({ productName: "Play Booster Display", setName: "Universes Beyond: Fallout" }), "Fallout Play Booster Display");
  assert.equal(identify("Fallout Play Booster Display"), "vague", "Fallout sold no Play Boosters: refused, never filed as a box it never had");
  // Names that carry their set, and Secret Lair drops (no set), are left alone.
  assert.equal(tcgTitle({ productName: "Foundations Commander Deck - Calling All Angels", setName: "Commander: Foundations" }), "Foundations Commander Deck - Calling All Angels");
  assert.equal(
    tcgTitle({ productName: "Secret Lair Drop: Secret Lair x Stardew Valley: Welcome to Stardew Valley - Non-Foil Edition", setName: "Secret Lair Drop Series" }),
    "Secret Lair Drop: Secret Lair x Stardew Valley: Welcome to Stardew Valley - Non-Foil Edition",
  );
});

test("tcgplayer: canonical product URL and CDN image, never an affiliate link", () => {
  const [box] = tcgFeedProducts(FIXTURE);
  assert.equal(box.url, "https://www.tcgplayer.com/product/692980/magic-reality-fracture-reality-fracture-play-booster-display");
  assert.equal(box.imageUrl, "https://tcgplayer-cdn.tcgplayer.com/product/692980_in_1000x1000.jpg");
  assert.equal(tcgImageUrl(692980), box.imageUrl);
  assert.equal(box.currency, "USD");
  assert.equal(
    tcgProductUrl({ productId: 707496, productLineUrlName: "Magic", setUrlName: "Commander Foundations", productUrlName: "Foundations Commander Decks Set of 5" }),
    "https://www.tcgplayer.com/product/707496/magic-commander-foundations-foundations-commander-decks-set-of-5",
  );
  for (const r of rows()) assert.doesNotMatch(r.url, /irclickid|partner|utm_|sharedid|\?/);
});

test("tcgplayer: grids ask the CDN for a smaller square rendition", () => {
  const url = tcgImageUrl(684450);
  assert.equal(thumb(url, 120), "https://tcgplayer-cdn.tcgplayer.com/product/684450_in_200x200.jpg");
  assert.equal(thumb(url, 400), "https://tcgplayer-cdn.tcgplayer.com/product/684450_in_400x400.jpg");
  assert.equal(thumb(url, 900), url);
});

test("tcgplayer: a failed or short read is not ok, so yesterday's rows are kept", async () => {
  const realFetch = globalThis.fetch;
  try {
    // A rejected request (not worth retrying).
    globalThis.fetch = (async () => new Response("bad request", { status: 400 })) as typeof fetch;
    const failed = await readStore(TCGPLAYER);
    assert.equal(failed.ok, false);
    assert.equal(failed.rows.length, 0);
    assert.match(failed.error ?? "", /HTTP 400/);
    // A catalogue that stops far short of its stated size.
    const page = { results: [{ totalResults: 2936, results: FIXTURE.slice(0, 3) }] };
    globalThis.fetch = (async () => new Response(JSON.stringify(page), { status: 200 })) as typeof fetch;
    const short = await readStore(TCGPLAYER);
    assert.equal(short.ok, false);
    assert.match(short.error ?? "", /3 of 2936/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── the catalogue read: short reads, retries, time limit ─────────────────────

const FAST = { pageDelayMs: 0, retryWaitsMs: [0, 0, 0] };

/** A page of `n` distinct products starting at `from`, as the API returns it. */
function apiPage(from: number, n: number, totalResults?: number): string {
  const results = Array.from({ length: n }, (_, i) => product(100000 + from + i, `Product ${from + i} Elite Trainer Box`, "SV04: Paradox Rift", []));
  return JSON.stringify({ results: [{ ...(totalResults === undefined ? {} : { totalResults }), results }] });
}

/** A fake fetch answering each request from `answer(from, callNumber)`. */
async function withFetch<T>(answer: (from: number, call: number) => Response, run: () => Promise<T>): Promise<{ result: T | Error; calls: number }> {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => answer(JSON.parse(String(init?.body)).from, ++calls)) as typeof fetch;
  try {
    return { result: await run(), calls };
  } catch (e) {
    return { result: e as Error, calls };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const ok = (body: string) => new Response(body, { status: 200 });

test("tcgplayer: a page that comes back empty mid-read, with totalResults 0, fails the read", async () => {
  const { result } = await withFetch(
    (from) => ok(from === 0 ? apiPage(0, 50, 120) : JSON.stringify({ results: [{ totalResults: 0, results: [] }] })),
    () => readTcgplayerCatalogue(FAST),
  );
  assert.ok(result instanceof Error);
  assert.match(result.message, /no totalResults|50 of 120/);
});

test("tcgplayer: a total that shrinks mid-read is not believed — the largest one counts", async () => {
  // Page 0 says 120; page 1 comes back short and says 70, as if that were all.
  const { result } = await withFetch((from) => ok(from === 0 ? apiPage(0, 50, 120) : apiPage(50, 20, 70)), () => readTcgplayerCatalogue(FAST));
  assert.ok(result instanceof Error);
  assert.match(result.message, /70 of 120/);
});

test("tcgplayer: a response without totalResults fails the read (after its retries)", async () => {
  const { result, calls } = await withFetch(() => ok(apiPage(0, 50)), () => readTcgplayerCatalogue(FAST));
  assert.ok(result instanceof Error);
  assert.match(result.message, /no totalResults/);
  assert.equal(calls, 4);
});

test("tcgplayer: a whole catalogue reads, and a transient 403 or cut-off body is retried", async () => {
  const whole = await withFetch((from) => ok(apiPage(from, from === 100 ? 20 : 50, 120)), () => readTcgplayerCatalogue(FAST));
  assert.ok(Array.isArray(whole.result));
  assert.equal((whole.result as TcgProduct[]).length, 120);
  assert.equal(whole.calls, 3);

  const blocked = await withFetch(
    (from, call) => (call === 1 ? new Response("<html>blocked</html>", { status: 403 }) : ok(apiPage(from, from === 100 ? 20 : 50, 120))),
    () => readTcgplayerCatalogue(FAST),
  );
  assert.equal((blocked.result as TcgProduct[]).length, 120);
  assert.equal(blocked.calls, 4);

  const cut = await withFetch(
    (from, call) => ok(call === 2 ? apiPage(from, 50, 120).slice(0, 200) : apiPage(from, from === 100 ? 20 : 50, 120)),
    () => readTcgplayerCatalogue(FAST),
  );
  assert.equal((cut.result as TcgProduct[]).length, 120);
  assert.equal(cut.calls, 4);
});

test("tcgplayer: the read stops at its time limit instead of holding up the stores", async () => {
  const { result, calls } = await withFetch(
    () => new Response("unavailable", { status: 503 }),
    () => readTcgplayerCatalogue({ pageDelayMs: 0, retryWaitsMs: [5_000, 15_000, 45_000], deadlineMs: 1_000 }),
  );
  assert.ok(result instanceof Error);
  assert.match(result.message, /time limit/);
  assert.equal(calls, 1); // gave up rather than wait 5 s past the limit
});

// ── placeholder asks, coverage, and what a product's summary counts ──────────

const CA_STORE: StoreConfig = { key: "ca1", name: "CA One", base: "https://ca1.example", market: "CA", platform: "shopify", country: "CA", collections: ["magic"] };

function read(store: StoreConfig, products: TcgProduct[] | { title: string; cents: number; inStock: boolean }[]): StoreRead {
  const feed =
    store === TCGPLAYER
      ? tcgFeedProducts(products as TcgProduct[])
      : (products as { title: string; cents: number; inStock: boolean }[]).map((p, i) => ({
          id: String(i),
          title: p.title,
          url: `${store.base}/products/${i}`,
          imageUrl: null,
          currency: null,
          variants: [{ priceCents: p.cents, available: p.inStock }],
        }));
  return { store, ok: true, error: null, products: feed.length, rediscovered: false, ms: 0, rows: rowsFromReads(store, [{ handle: "magic", ok: true, products: feed }]) };
}

test("placeholder asks: far above the stores' asks (sold-out ones count) or the set's own unit are dropped", () => {
  // Real products (TCGplayer, 2026-10-21); the asks are constructed.
  const tcg = read(TCGPLAYER, [
    // One seller asking $188,888.88; two CA stores list it sold out at C$9,999 and C$11,000.
    product(692981, "Reality Fracture - Play Booster Display Case", "Reality Fracture", [listing(188888.88, 0)]),
    // No store lists it; TCGplayer's own bundle is $46.39: a "case" at 430x is no case.
    product(692986, "Reality Fracture - Bundle Case", "Reality Fracture", [listing(19998.95, 0)]),
    product(692985, "Reality Fracture - Bundle", "Reality Fracture", [listing(46.39, 0)]),
    // Out of print at many times the stores' old retail asks: a real price, kept.
    product(180000, "Ultimate Masters Booster Box", "Ultimate Masters", [listing(6989.95, 0)]),
  ]);
  const ca = read(CA_STORE, [
    { title: "Magic: The Gathering - Reality Fracture Play Booster Display Case", cents: 999900, inStock: false },
    { title: "Magic: The Gathering - Reality Fracture Play Booster Display Case", cents: 1100000, inStock: false },
    { title: "Magic: The Gathering - Ultimate Masters Booster Box", cents: 199900, inStock: false },
    { title: "Magic: The Gathering - Ultimate Masters Booster Box", cents: 213100, inStock: false },
  ]);
  // (rowsFromReads keeps one row per product per store, so give the CA asks two stores.)
  const ca2 = { ...ca, store: { ...CA_STORE, key: "ca2" }, rows: ca.rows.map((r) => ({ ...r, priceCents: r.priceCents + 100000 })) };
  const reads = [tcg, ca, ca2];
  assert.equal(dropPlaceholderAsks(reads), 2);
  assert.deepEqual(tcg.rows.map((r) => r.identity.groupKey).sort(), ["fra|bundle", "uma|draft-booster-box"]);
  assert.equal(ca.rows.length + ca2.rows.length, 4, "stores' own rows are never touched");
});

test("coverage: a marketplace read far smaller than last time's is not trusted", () => {
  assert.equal(coverageDropped(14, 1578), true);
  assert.equal(coverageDropped(1500, 1578), false);
  assert.equal(coverageDropped(1120, 1578), false); // 71%: a bad day, but a real read
  assert.equal(coverageDropped(10, 20), false); // too few to judge
  assert.equal(coverageDropped(1577, 0), false); // the first read
});

test("product summary: store counts never include TCGplayer; its open offer sets marketplaceOpen and can be the 'from' price", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  const fresh = new Date(now - 3600_000);
  const stale = new Date(now - 4 * 86400_000);
  assert.deepEqual(
    productStat(
      [
        { store: "tcgplayer", priceCents: 9000, inStock: true, lastSeen: fresh },
        { store: "a", priceCents: 10000, inStock: true, lastSeen: fresh },
        { store: "b", priceCents: 9500, inStock: false, lastSeen: fresh },
      ],
      now,
    ),
    { lowestPriceCents: 9000, inStockStores: 1, listedStores: 2, marketplaceOpen: true, medianOpenCents: null },
  );
  assert.deepEqual(productStat([{ store: "tcgplayer", priceCents: 9000, inStock: true, lastSeen: fresh }], now), {
    lowestPriceCents: 9000,
    inStockStores: 0,
    listedStores: 0,
    marketplaceOpen: true,
    medianOpenCents: null,
  });
  // A TCGplayer row not re-read for days is "unknown": not open, not the price.
  assert.deepEqual(productStat([{ store: "tcgplayer", priceCents: 9000, inStock: true, lastSeen: stale }], now), {
    lowestPriceCents: null,
    inStockStores: 0,
    listedStores: 0,
    marketplaceOpen: false,
    medianOpenCents: null,
  });
});

test("product summary: the median is of open independent-store prices only, null under two; a dormant store's row isn't 'listed'", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  const fresh = new Date(now - 3600_000);
  const list = [
    { store: "tcgplayer", priceCents: 5000, inStock: true, lastSeen: fresh },
    { store: "a", priceCents: 10000, inStock: true, lastSeen: fresh },
    { store: "b", priceCents: 12000, inStock: true, lastSeen: fresh },
    { store: "c", priceCents: 20000, inStock: true, lastSeen: fresh },
    { store: "d", priceCents: 9000, inStock: false, lastSeen: fresh }, // sold out: not in the median
    { store: "sleepy", priceCents: 9500, inStock: false, lastSeen: fresh },
  ];
  const stat = productStat(list, now, new Set(["sleepy"]));
  assert.equal(stat.medianOpenCents, 12000);
  assert.equal(stat.inStockStores, 3);
  assert.equal(stat.listedStores, 4, "a dormant store's sold-out row doesn't count as listed");
  assert.equal(stat.lowestPriceCents, 5000, "TCGplayer can still be the 'from' price");
  assert.equal(productStat(list.slice(0, 2), now).medianOpenCents, null);
  assert.equal(productStat(list.slice(1, 3), now).medianOpenCents, 11000);
});

test("placeholder asks: a pre-release TCGplayer ask over 3x US MSRP is dropped; the same ask on a released set is kept", () => {
  const today = new Date("2026-10-21T00:00:00Z");
  const tcg = read(TCGPLAYER, [
    // Star Trek (2026-11-13) hasn't released: a $6.99 Play Booster at $29.99 is a placeholder, a $149.99 Bundle (2.1x $69.99) is a pre-order price.
    product(706140, "Star Trek - Play Booster Pack", "Star Trek", [listing(29.99, 0)]),
    product(706141, "Star Trek - Bundle", "Star Trek", [listing(149.99, 0)]),
    // No MSRP published for the type: kept.
    product(706138, "Star Trek - Play Booster Display", "Star Trek", [listing(449.99, 0)]),
  ]);
  assert.equal(dropPlaceholderAsks([tcg], today), 1);
  assert.deepEqual(tcg.rows.map((r) => r.identity.groupKey).sort(), ["trk|bundle", "trk|play-booster-box"]);
  // Released: whatever it asks is the market.
  const after = read(TCGPLAYER, [product(706140, "Star Trek - Play Booster Pack", "Star Trek", [listing(29.99, 0)])]);
  assert.equal(dropPlaceholderAsks([after], new Date("2026-12-01T00:00:00Z")), 0);
});

test("tcgplayer: a name with no set of its own borrows the catalogue's set only when that is all it lacks", () => {
  assert.equal(tcgTitle({ productName: "Play Booster Display [Set of 6]", setName: "Bloomburrow" }), "Play Booster Display [Set of 6]"); // refused as a lot either way
  assert.equal(tcgTitle({ productName: "Gift Bundle", setName: "The Hobbit" }), "The Hobbit Gift Bundle");
  assert.equal(tcgTitle({ productName: "Secret Lair Commander Deck: Odds and Ends", setName: "Secret Lair Drop Series" }), "Secret Lair Commander Deck: Odds and Ends");
});
