// TCGplayer search results → import rows. The fixture is trimmed from real API
// results (2026-09-27): product fields as the API names them, listings as its
// three-listing preview returns them.
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
    productLineUrlName: "Pokemon",
    listings,
  };
}

const FIXTURE: TcgProduct[] = [
  // Shipping is excluded: $61.97 + $10.00 shipping lists at $61.97. A custom
  // listing (a partial item) and a Japanese one are cheaper and don't count.
  product(684450, "Chaos Rising Elite Trainer Box", "ME04: Chaos Rising", [
    listing(5.99, 0, { listingType: "custom" }),
    listing(40, 0, { languageId: 7, language: "Japanese" }),
    listing(61.97, 10),
    listing(65.99, 5.99),
    listing(71.98, 0),
  ]),
  // Two box arts of one ETB: one product, the cheaper art's price.
  product(512813, "Paradox Rift Elite Trainer Box [Iron Valiant]", "SV04: Paradox Rift", [listing(143, 3.99), listing(145, 4.99)]),
  product(512815, "Paradox Rift Elite Trainer Box [Roaring Moon]", "SV04: Paradox Rift", [listing(126.99, 14.99), listing(140, 5.99)]),
  // $50 + $199.99 shipping is a price loaded into shipping; $65 is sub-floor
  // for a booster box ($70 in the US); out of stock doesn't count.
  product(692939, "Pitch Black Booster Box", "ME05: Pitch Black", [
    listing(50, 199.99),
    listing(65, 0),
    listing(150, 0, { quantity: 0 }),
    listing(189.99, 6.99),
  ]),
  // No live listing: TCGplayer has no "sold out", so no row at all.
  product(100491, 'Ancient Origins Theme Deck - "Iron Tide" [Metagross]', "XY - Ancient Origins", []),
  // Its only listing is below the booster-box floor: no believable price, no row.
  product(624676, "Destined Rivals Booster Box", "SV10: Destined Rivals", [listing(40, 0)]),
  // Refused by identify(): a half box is not the set's booster box, and a
  // retailer bundle is not the plain ETB.
  product(624681, "Destined Rivals Half Booster Box", "SV10: Destined Rivals", [listing(390, 0)]),
  product(644852, "Prismatic Evolutions Elite Trainer Box and Pokeball (Sam's Club)", "Miscellaneous Cards & Products", [listing(183, 0.99)]),
  // Named without its set: TCGplayer's set supplies it.
  product(107106, "Elite Trainer Box [Mewtwo X]", "XY - BREAKthrough", [listing(1999.99, 0)]),
  // Its only seller asks 20x the market price: a placeholder, not a price.
  { ...product(99181, "Team Plasma Tin [Deoxys EX]", "Miscellaneous Cards & Products", [listing(19999.99, 0)]), marketPrice: 1000 },
  // A repeat of a product already read (the API can page one twice).
  product(684450, "Chaos Rising Elite Trainer Box", "ME04: Chaos Rising", [listing(1, 0)]),
];

function rows() {
  return rowsFromReads(TCGPLAYER, [{ handle: "pokemon", ok: true, products: tcgFeedProducts(FIXTURE) }]);
}

test("tcgplayer: the cheapest live standard English listing's item price, shipping excluded", () => {
  const etb = rows().find((r) => r.identity.groupKey === "me4|etb");
  assert.ok(etb);
  assert.equal(etb.priceCents, 6197);
  assert.equal(etb.inStock, true);
  assert.equal(etb.title, "Chaos Rising Elite Trainer Box");
});

test("tcgplayer: shipping-loaded, sub-floor and out-of-stock listings are skipped", () => {
  assert.equal(shippingLoaded({ price: 50, shippingPrice: 199.99 }), true);
  assert.equal(shippingLoaded({ price: 83.97, shippingPrice: 100 }), true);
  assert.equal(shippingLoaded({ price: 61.97, shippingPrice: 10 }), false); // $10 on a $62 ETB is ordinary
  assert.equal(shippingLoaded({ price: 8, shippingPrice: 7.99 }), false); // a cheap blister's real postage
  assert.equal(shippingLoaded({ price: 2575, shippingPrice: 24.99 }), false); // a case's freight
  const box = rows().find((r) => r.identity.groupKey === "me5|booster-box");
  assert.equal(box?.priceCents, 18999);
});

test("tcgplayer: one row per product, the cheaper of two box arts", () => {
  const etbs = rows().filter((r) => r.identity.groupKey === "sv4|etb");
  assert.equal(etbs.length, 1);
  assert.equal(etbs[0].priceCents, 12699);
  assert.match(etbs[0].url, /\/product\/512815\//);
});

test("tcgplayer: no listing, only sub-floor or placeholder listings, or a refused title → no row", () => {
  const keys = rows().map((r) => r.identity.groupKey).sort();
  assert.deepEqual(keys, ["me4|etb", "me5|booster-box", "sv4|etb", "xy8|etb"]);
  // tcgFeedProducts itself drops products with no buyable listing and repeats.
  const ids = tcgFeedProducts(FIXTURE).map((p) => p.id);
  assert.ok(!ids.includes("100491"));
  assert.ok(!ids.includes("99181"));
  assert.equal(ids.filter((id) => id === "684450").length, 1);
});

test("tcgplayer: a name without a set borrows TCGplayer's set, only for set products", () => {
  assert.equal(tcgTitle({ productName: "Elite Trainer Box [Mewtwo X]", setName: "XY - BREAKthrough" }), "BREAKthrough Elite Trainer Box [Mewtwo X]");
  assert.equal(rows().find((r) => r.identity.groupKey === "xy8|etb")?.priceCents, 199999);
  // Names that carry their set, and collections (identified by their own words), are left alone.
  assert.equal(tcgTitle({ productName: "Chaos Rising Elite Trainer Box", setName: "ME04: Chaos Rising" }), "Chaos Rising Elite Trainer Box");
  assert.equal(tcgTitle({ productName: "Knock Out Collection [Kyogre]", setName: "SV: Journey Together" }), "Knock Out Collection [Kyogre]");
  // A catch-all "set" is no set.
  assert.equal(tcgTitle({ productName: "Pokemon Center Elite Trainer Box", setName: "Miscellaneous Cards & Products" }), "Pokemon Center Elite Trainer Box");
});

test("tcgplayer: canonical product URL and CDN image, never an affiliate link", () => {
  const [etb] = tcgFeedProducts(FIXTURE);
  assert.equal(etb.url, "https://www.tcgplayer.com/product/684450/pokemon-me04-chaos-rising-chaos-rising-elite-trainer-box");
  assert.equal(etb.imageUrl, "https://tcgplayer-cdn.tcgplayer.com/product/684450_in_1000x1000.jpg");
  assert.equal(tcgImageUrl(684450), etb.imageUrl);
  assert.equal(etb.currency, "USD");
  assert.equal(
    tcgProductUrl({ productId: 664898, productLineUrlName: "Pokemon", setUrlName: "Miscellaneous Cards and Products", productUrlName: "Team Rocket’s Moltres ex Ultra-Premium Collection" }),
    "https://www.tcgplayer.com/product/664898/pokemon-miscellaneous-cards-and-products-team-rocket-s-moltres-ex-ultra-premium-collection",
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

const CA_STORE: StoreConfig = { key: "ca1", name: "CA One", base: "https://ca1.example", market: "CA", platform: "shopify", country: "CA", collections: ["pokemon"] };

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
  return { store, ok: true, error: null, products: feed.length, rediscovered: false, ms: 0, rows: rowsFromReads(store, [{ handle: "pokemon", ok: true, products: feed }]) };
}

test("placeholder asks: far above the stores' asks (sold-out ones count) or the set's own unit are dropped", () => {
  const tcg = read(TCGPLAYER, [
    // No market price, one seller asking $188,888.88; two CA stores list it sold out at C$9,999 and C$11,000.
    product(475436, "Burning Shadows Booster Box Case", "SM - Burning Shadows", [listing(188888.88, 0)]),
    // No store lists it; TCGplayer's own bundle is $198.49.
    product(479361, "Lost Origin Booster Bundle Case", "SWSH11: Lost Origin", [listing(19998.95, 0)]),
    product(479360, "Lost Origin Booster Bundle", "SWSH11: Lost Origin", [listing(198.49, 0)]),
    // Out of print at many times the stores' old retail asks: a real price, kept.
    product(107000, "Fates Collide Booster Box", "XY - Fates Collide", [listing(6989.95, 0)]),
  ]);
  const ca = read(CA_STORE, [
    { title: "Pokemon Burning Shadows Booster Box Case", cents: 999900, inStock: false },
    { title: "Pokemon Burning Shadows Booster Box Case", cents: 1100000, inStock: false },
    { title: "Pokemon Fates Collide Booster Box", cents: 199900, inStock: false },
    { title: "Pokemon Fates Collide Booster Box", cents: 213100, inStock: false },
  ]);
  // (rowsFromReads keeps one row per product per store, so give the CA asks two stores.)
  const ca2 = { ...ca, store: { ...CA_STORE, key: "ca2" }, rows: ca.rows.map((r) => ({ ...r, priceCents: r.priceCents + 100000 })) };
  const reads = [tcg, ca, ca2];
  assert.equal(dropPlaceholderAsks(reads), 2);
  assert.deepEqual(tcg.rows.map((r) => r.identity.groupKey).sort(), ["swsh11|booster-bundle", "xy10|booster-box"]);
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
  const today = new Date("2026-09-28T00:00:00Z");
  const tcg = read(TCGPLAYER, [
    // Delta Reign (2026-11-06) hasn't released: a $59.99 PC ETB at $449.99 is a placeholder, a $134.95 ETB (2.7x $49.99) is a pre-order price.
    product(700001, "Delta Reign Pokemon Center Elite Trainer Box (Exclusive)", "ME06: Delta Reign", [listing(449.99, 0)]),
    product(700002, "Delta Reign Elite Trainer Box", "ME06: Delta Reign", [listing(134.95, 0)]),
    // Released long ago: whatever it asks is the market.
    product(700003, "Prismatic Evolutions Pokemon Center Elite Trainer Box (Exclusive)", "SV08.5: Prismatic Evolutions", [listing(449.99, 0)]),
    // No MSRP published for the type: kept.
    product(700004, "Delta Reign Elite Trainer Box Case", "ME06: Delta Reign", [listing(1204.36, 0)]),
  ]);
  assert.equal(dropPlaceholderAsks([tcg], today), 1);
  assert.deepEqual(tcg.rows.map((r) => r.identity.groupKey).sort(), ["me6|etb", "me6|etb-case", "sv8pt5|pc-etb"]);
});

test("tcgplayer: a name with no set of its own borrows the catalogue's set only when that is all it lacks", () => {
  assert.equal(tcgTitle({ productName: "Booster Box [Set of 6]", setName: "SV04: Paradox Rift" }), "Booster Box [Set of 6]"); // refused as a lot either way
  assert.equal(tcgTitle({ productName: "Booster Bundle", setName: "SV4.5: Paldean Fates" }), "Paldean Fates Booster Bundle");
  assert.equal(tcgTitle({ productName: "Charizard ex Premium Collection", setName: "SV03: Obsidian Flames" }), "Charizard ex Premium Collection");
});
