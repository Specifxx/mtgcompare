import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { demoteSuspectStores, distrustRead, dormantStores, dropHighOutliers, dropLowOutliers, offerRef, pickName, planMoves, priceOf, rankImages, rowsFromReads, sourcesFor, type StoreRead } from "../src/lib/importer";
import { readShopifyCollection } from "../src/lib/feeds";
import { headlineOffer, offerStock, openStoreCount, rankOffers, OFFER_STALE_MS } from "../src/lib/sealed-offers";
import type { FeedProduct } from "../src/lib/feeds";
import { STORES, STORE_BY_KEY, TCGPLAYER, type StoreConfig } from "../src/lib/stores";
import { identify, isIdentity } from "../src/lib/sealed-title";

const store: StoreConfig = { key: "s1", name: "Store One", base: "https://s1.example", market: "AU", platform: "shopify", country: "AU", collections: ["pokemon"] };

function prod(id: string, title: string, variants: [number, boolean][]): FeedProduct {
  return { id, title, url: `https://s1.example/products/${id}`, imageUrl: null, currency: null, variants: variants.map(([priceCents, available]) => ({ priceCents, available })) };
}

test("price: cheapest AVAILABLE variant, never a sub-floor deposit variant", () => {
  const p = prod("a", "Surging Sparks Booster Box", [[100, true], [26995, true], [24995, false]]);
  assert.deepEqual(priceOf(p, 10500), { priceCents: 26995, inStock: true });
  const sold = prod("b", "Surging Sparks Booster Box", [[26995, false], [25995, false]]);
  assert.deepEqual(priceOf(sold, 10500), { priceCents: 25995, inStock: false });
  assert.equal(priceOf(prod("c", "x", [[500, true]]), 10500), null);
});

test("price: a multi-unit option is never the product's price", () => {
  const tin = prod("t", "Pokemon 30th Celebration Mini Tin", []);
  tin.variants = [
    { priceCents: 2995, available: false, title: "Single Tin" },
    { priceCents: 27999, available: true, title: "Display (10 Tins)" },
  ];
  assert.deepEqual(priceOf(tin, 600), { priceCents: 2995, inStock: false });
  const one = prod("o", "Pokemon Surging Sparks Booster Box", []);
  one.variants = [{ priceCents: 26995, available: true, title: "Default Title" }];
  assert.deepEqual(priceOf(one, 10500), { priceCents: 26995, inStock: true });
});

test("a store keeps its best listing per product: in stock beats cheaper-but-sold-out", () => {
  const rows = rowsFromReads(store, [
    {
      handle: "pokemon",
      ok: true,
      products: [
        prod("etb-1", "Pokémon Surging Sparks Elite Trainer Box", [[7995, false]]),
        prod("etb-2", "Surging Sparks ETB (Pikachu)", [[8995, true]]),
        prod("single", "Pikachu ex 238/191 Surging Sparks", [[5000, true]]),
      ],
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].identity.groupKey, "sv8|etb");
  assert.equal(rows[0].priceCents, 8995);
  assert.equal(rows[0].inStock, true);
});

test("titles in a non-Pokémon collection must say Pokémon", () => {
  const rows = rowsFromReads(store, [
    { handle: "pre-orders", ok: true, products: [prod("x", "Surging Sparks Booster Box", [[26995, true]]), prod("y", "Pokemon Surging Sparks Booster Box", [[26995, true]])] },
  ]);
  assert.deepEqual(rows.map((r) => r.title), ["Pokemon Surging Sparks Booster Box"]);
});

test("in-stock listings far below the market median are dropped", () => {
  const mk = (key: string, price: number): StoreRead => ({
    store: { ...store, key },
    ok: true,
    error: null,
    products: 1,
    rediscovered: false,
    ms: 0,
    rows: rowsFromReads({ ...store, key }, [{ handle: "pokemon", ok: true, products: [prod("p", "Pokemon Charizard Ultra-Premium Collection", [[price, true]])] }]),
  });
  // A$89.95 against A$600+ for the same UPC: a mislisting. A$299.95 is a big
  // discount, but stores do sell old stock at old prices, so it stays.
  const reads = [mk("a", 59995), mk("b", 61995), mk("c", 64995), mk("d", 8995), mk("e", 29995)];
  assert.equal(dropLowOutliers(reads), 1);
  assert.equal(reads[3].rows.length, 0);
  assert.equal(reads[4].rows.length, 1);
});

/** A store read of one in-stock listing per title. */
function readOf(key: string, items: { title: string; cents: number; inStock?: boolean; market?: string }[]): StoreRead {
  const s = { ...store, key, market: (items[0]?.market ?? "AU") as StoreConfig["market"] };
  const products = items.map((it, i) => prod(`${key}-${i}`, it.title, [[it.cents, it.inStock ?? true]]));
  return { store: s, ok: true, error: null, products: products.length, rediscovered: false, ms: 0, rows: rowsFromReads(s, [{ handle: "pokemon", ok: true, products }]) };
}

test("in-stock listings far above the market median are dropped: packs, blisters and bundles at 4x, boxes and ETBs of recent sets at 3x", () => {
  const today = new Date("2026-09-28T00:00:00Z");
  const reads = [
    // "Perfect Order Booster Pack x 50 (LIVE)" is refused by identify(); a plain pack at 50x the median is the same lot in disguise.
    readOf("a", [{ title: "Perfect Order Booster Pack", cents: 599 }, { title: "Pitch Black Booster Box", cents: 27000 }, { title: "Evolving Skies Booster Box", cents: 90000 }]),
    readOf("b", [{ title: "Perfect Order Booster Pack", cents: 649 }, { title: "Pitch Black Booster Box", cents: 28000 }, { title: "Evolving Skies Booster Box", cents: 95000 }]),
    readOf("c", [{ title: "Perfect Order Booster Pack", cents: 699 }, { title: "Pitch Black Booster Box", cents: 29000 }, { title: "Evolving Skies Booster Box", cents: 100000 }]),
    readOf("d", [
      { title: "Perfect Order Booster Pack", cents: 29999 }, // 46x: dropped
      { title: "Pitch Black Booster Box", cents: 99000 }, // 3.5x, set released 2026-07: dropped
      { title: "Evolving Skies Booster Box", cents: 350000 }, // 3.7x, but Evolving Skies is from 2021: kept
    ]),
    readOf("e", [{ title: "Perfect Order Booster Pack", cents: 2300 }]), // 3.5x a pack: under the 4x bar, kept
  ];
  assert.equal(dropHighOutliers(reads, today), 2);
  assert.deepEqual(reads[3].rows.map((r) => r.identity.groupKey), ["swsh7|booster-box"]);
  assert.equal(reads[4].rows.length, 1);
  // Sold-out asks are not judged (and don't make the median).
  const sold = [readOf("x", [{ title: "Perfect Order Booster Pack", cents: 29999, inStock: false }]), ...reads.slice(0, 3)];
  assert.equal(dropHighOutliers(sold, today), 0);
});

test("a store with five or more in-stock prices under half the market median is written as sold out", () => {
  const items = ["Surging Sparks Elite Trainer Box", "Paradox Rift Elite Trainer Box", "Obsidian Flames Elite Trainer Box", "Paldea Evolved Elite Trainer Box", "Temporal Forces Elite Trainer Box", "Twilight Masquerade Elite Trainer Box"];
  const market = (key: string, cents: number) => readOf(key, items.map((title) => ({ title, cents })));
  const reads = [market("a", 12000), market("b", 13000), market("c", 14000), market("depot", 5000), readOf("once", [{ title: "Surging Sparks Elite Trainer Box", cents: 5000 }])];
  assert.deepEqual(demoteSuspectStores(reads), [{ store: "depot", low: 6 }]);
  assert.ok(reads[3].rows.every((r) => !r.inStock), "its rows stay, as sold out");
  assert.ok(reads[4].rows.every((r) => r.inStock), "one cheap listing is a deal, not a pattern");
  assert.ok(reads[0].rows.every((r) => r.inStock));
});

test("a cheap store is not a suspect store: 5 low prices among many ordinary ones", () => {
  const sets = ["Surging Sparks", "Paradox Rift", "Obsidian Flames", "Paldea Evolved", "Temporal Forces", "Twilight Masquerade", "Stellar Crown", "Silver Tempest", "Journey Together", "Destined Rivals"];
  const items = sets.flatMap((s) => [`${s} Elite Trainer Box`, `${s} Booster Box`, `${s} Booster Bundle`]);
  const market = (key: string, cents: number) => readOf(key, items.map((title) => ({ title, cents })));
  const cheap = readOf(
    "discounter",
    items.map((title, k) => ({ title, cents: k < 5 ? 14000 : 30000 })),
  );
  const reads = [market("a", 30000), market("b", 31000), market("c", 32000), cheap];
  assert.equal(cheap.rows.length, 30);
  assert.deepEqual(demoteSuspectStores(reads), []);
  assert.ok(cheap.rows.every((r) => r.inStock));
});

test("dormant: 20+ listings and none in stock; small or selling stores and TCGplayer are not", () => {
  const counts = new Map([
    ["gatheringgames", { listed: 285, inStock: 0 }],
    ["cardtribe", { listed: 21, inStock: 0 }],
    ["tiny", { listed: 19, inStock: 0 }],
    ["busy", { listed: 300, inStock: 1 }],
    ["tcgplayer", { listed: 1500, inStock: 0 }],
  ]);
  assert.deepEqual([...dormantStores(counts)].sort(), ["cardtribe", "gatheringgames"].filter((k) => STORES.some((s) => s.key === k)).sort());
});

test("images: TCGplayer's photo first, then a store photo named for the product, then the largest", () => {
  const words = ["surging", "sparks", "pikachu"];
  const generic = { url: "https://cdn.shopify.com/s/files/1/pokemon-banner.jpg", marketplace: false, area: 4_000_000, words };
  const named = { url: "https://cdn.shopify.com/s/files/1/Surging-Sparks-ETB_pikachu.png?v=1", marketplace: false, area: 500_000, words };
  const small = { url: "https://cdn.shopify.com/s/files/1/etb.jpg", marketplace: false, area: 90_000, words };
  const unknown = { url: "https://woo.example/wp-content/uploads/x.jpg", marketplace: false, area: 0, words };
  const tcg = { url: "https://tcgplayer-cdn.tcgplayer.com/product/1_in_1000x1000.jpg", marketplace: true, area: 0, words };
  assert.deepEqual(rankImages([unknown, small, generic, named, tcg]), [tcg.url, named.url, generic.url, small.url, unknown.url]);
  assert.deepEqual(rankImages([small, small, generic]), [generic.url, small.url]);
});

test("stock states: stale rows are unknown and never the headline", () => {
  const now = Date.parse("2026-09-25T12:00:00Z");
  const fresh = new Date(now - 3600_000).toISOString();
  const stale = new Date(now - OFFER_STALE_MS - 1).toISOString();
  const offers = [
    { store: "a", priceCents: 100, inStock: true, lastSeen: stale },
    { store: "b", priceCents: 300, inStock: true, lastSeen: fresh },
    { store: "c", priceCents: 200, inStock: false, lastSeen: fresh },
  ];
  assert.equal(offerStock(offers[0], now), "unknown");
  assert.equal(headlineOffer(offers, now)?.store, "b");
  assert.equal(openStoreCount(offers, now), 1);
  assert.deepEqual(rankOffers(offers, now).map((o) => o.store), ["b", "a", "c"]);
});

test("a run reads TCGplayer too, first; --only tcgplayer and --only US include it", () => {
  const all = sourcesFor();
  assert.equal(all.length, STORES.length + 1);
  assert.equal(all[0].key, "tcgplayer");
  assert.deepEqual(sourcesFor(["tcgplayer"]).map((s) => s.key), ["tcgplayer"]);
  const us = sourcesFor(["US"]);
  assert.equal(us[0].key, "tcgplayer");
  assert.equal(us.length, STORES.filter((s) => s.market === "US").length + 1);
  assert.ok(!sourcesFor(["AU"]).some((s) => s.key === "tcgplayer"));
});

// ── products follow their listings to a new key (planMoves) ──────────────────

/** Stored offers: product id → its listings' refs ("unread…" refs are from a store not read this run). */
function stored(offers: Record<string, string[]>) {
  return Object.entries(offers).flatMap(([productId, refs]) => refs.map((ref) => ({ productId, ref, store: ref.startsWith("unread") ? "down" : "up" })));
}
const READ = new Set(["up"]);

test("moves: a product follows most of its listings to a key no product holds", () => {
  const existing = [{ id: "P", groupKey: "blister|-|2pack-discovery-neo" }];
  const prev = stored({ P: ["a", "b", "c"] });
  const now = new Map([["a", "blister|-|2pack-discovery-neo-unlimited"], ["b", "blister|-|2pack-discovery-neo-unlimited"], ["c", "blister|-|2pack-discovery-neo"]]);
  assert.deepEqual(planMoves(existing, prev, now, READ), [{ id: "P", from: "blister|-|2pack-discovery-neo", to: "blister|-|2pack-discovery-neo-unlimited" }]);
  // Half is not most; nor are listings of stores that weren't read this run.
  assert.deepEqual(planMoves(existing, stored({ P: ["a", "b", "c", "d"] }), now, READ), []);
  assert.deepEqual(planMoves(existing, stored({ P: ["a", "b", "unread1", "unread2", "unread3"] }), now, READ), []);
});

test("moves: a product whose listings all leave, split several ways, follows them instead of dying", () => {
  // The merged "First Partner Illustration Collection" splits into Series 1, 2 and 3.
  const existing = [{ id: "P", groupKey: "fpic", nameKey: "fpic-series3" }];
  const now = new Map([["a", "fpic-series1"], ["b", "fpic-series1"], ["c", "fpic-series3"], ["d", "fpic-series2"]]);
  // To the series its own name says, though Series 1 got more of its listings.
  assert.deepEqual(planMoves(existing, stored({ P: ["a", "b", "c", "d"] }), now, READ), [{ id: "P", from: "fpic", to: "fpic-series3" }]);
  // A name that says none of them: where most went.
  assert.deepEqual(planMoves([{ id: "P", groupKey: "fpic", nameKey: "fpic" }], stored({ P: ["a", "b", "c", "d"] }), now, READ), [{ id: "P", from: "fpic", to: "fpic-series1" }]);
  // Most of its listings went to a key another product holds: it keeps the rest, as its name says.
  assert.deepEqual(
    planMoves(
      [
        { id: "P", groupKey: "blister|-|espathra", nameKey: "blister|-|2pack-espathra" },
        { id: "T", groupKey: "blister|-|1pack-espathra" },
      ],
      stored({ P: ["s1", "s2", "s3", "d1", "d2"], T: ["t"] }),
      new Map([["s1", "blister|-|1pack-espathra"], ["s2", "blister|-|1pack-espathra"], ["s3", "blister|-|1pack-espathra"], ["d1", "blister|-|2pack-espathra"], ["d2", "blister|-|2pack-espathra"], ["t", "blister|-|1pack-espathra"]]),
      READ,
    ),
    [{ id: "P", from: "blister|-|espathra", to: "blister|-|2pack-espathra" }],
  );
  // Also when a listing vanished from a store that was read: it goes with the rest.
  assert.deepEqual(planMoves(existing, stored({ P: ["a", "b", "c", "d", "gone"] }), now, READ), [{ id: "P", from: "fpic", to: "fpic-series3" }]);
  // Not when a listing stays, or when a store that lists it wasn't read this run (it isn't dying).
  assert.deepEqual(planMoves(existing, stored({ P: ["a", "b", "c", "d", "e"] }), new Map([...now, ["e", "fpic"]]), READ), []);
  assert.deepEqual(planMoves(existing, stored({ P: ["a", "b", "c", "d", "unread"] }), now, READ), []);
});

test("moves: two products after the same free key — exactly one moves", () => {
  const existing = [
    { id: "A", groupKey: "k-a" },
    { id: "B", groupKey: "k-b" },
  ];
  const now = new Map([["a1", "K"], ["a2", "K"], ["b1", "K"]]);
  const moves = planMoves(existing, stored({ A: ["a1", "a2"], B: ["b1"] }), now, READ);
  assert.deepEqual(moves, [{ id: "A", from: "k-a", to: "K" }]);
});

test("moves: a swap blocks itself; a chain resolves whatever the order", () => {
  const swap = planMoves(
    [
      { id: "A", groupKey: "k1" },
      { id: "B", groupKey: "k2" },
    ],
    stored({ A: ["a"], B: ["b"] }),
    new Map([["a", "k2"], ["b", "k1"]]), READ);
  assert.deepEqual(swap, []);
  // A wants B's key; B wants a free one. A is visited first but moves second.
  const chain = planMoves(
    [
      { id: "A", groupKey: "k1" },
      { id: "B", groupKey: "k2" },
    ],
    stored({ A: ["a"], B: ["b"] }),
    new Map([["a", "k2"], ["b", "k3"]]), READ);
  assert.deepEqual(chain, [
    { id: "B", from: "k2", to: "k3" },
    { id: "A", from: "k1", to: "k2" },
  ]);
  // Written in that order, no two products ever hold one key; run again on
  // the moved state, nothing moves.
  const after = [
    { id: "A", groupKey: "k2" },
    { id: "B", groupKey: "k3" },
  ];
  assert.deepEqual(planMoves(after, stored({ A: ["a"], B: ["b"] }), new Map([["a", "k2"], ["b", "k3"]]), READ), []);
});

test("offer refs: the same hash the database computes (md5 of 'store url', 16 hex)", () => {
  // Postgres: SELECT left(md5('pokebox https://pokebox.example/products/x'), 16)
  assert.equal(offerRef("pokebox", "https://pokebox.example/products/x"), "7be11a29113a75c4");
  assert.match(offerRef("tcgplayer", "https://www.tcgplayer.com/product/1/x"), /^[0-9a-f]{16}$/);
  assert.notEqual(offerRef("a", "https://x"), offerRef("b", "https://x"));
});

test("renames: TCGplayer's name if it has one, else the name most listings give", () => {
  assert.equal(pickName([{ name: "30th Celebration 1x Mini Tin", marketplace: false }, { name: "30th Celebration Mini Tin", marketplace: true }]), "30th Celebration Mini Tin");
  assert.equal(
    pickName([
      { name: "Checklane Blister (Drifloon) | ME01", marketplace: false },
      { name: "Mega Evolution Checklane Blister Drifloon", marketplace: false },
      { name: "Mega Evolution Checklane Blister Drifloon", marketplace: false },
    ]),
    "Mega Evolution Checklane Blister Drifloon",
  );
  assert.equal(pickName([]), null);
});

test("a feed that fails after page 1 is marked cut off, not read as a small catalogue", async () => {
  const realFetch = globalThis.fetch;
  const page = (n: number) => ({ products: Array.from({ length: n }, (_, i) => ({ handle: `p${i}`, title: `Box ${i}`, variants: [{ price: "10.00", available: true }] })) });
  try {
    globalThis.fetch = (async (url: string) => {
      const u = new URL(url);
      if (u.pathname === "/robots.txt") return new Response("", { status: 404 });
      if (u.searchParams.get("page") === "1") return new Response(JSON.stringify(page(250)), { status: 200 });
      return new Response("upstream timeout", { status: 504 });
    }) as typeof fetch;
    const r = await readShopifyCollection("https://cut.example", "pokemon-sealed", { country: "AU" });
    assert.equal(r.ok, true);
    assert.equal(r.products.length, 250);
    assert.equal(r.truncatedAtPage, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("short reads: refused the first time, accepted for a store when the last run saw the same", () => {
  const rows = (n: number) => Array.from({ length: n }, () => ({}) as StoreRead["rows"][number]);
  const cut = { store, rows: rows(180), partial: "feed cut off at page 2 of pokemon" };
  assert.deepEqual(distrustRead(cut, 400, null), { reason: cut.partial, accept: false });
  assert.equal(distrustRead(cut, 400, "feed cut off at page 2 of pokemon; kept the previous rows")?.accept, true);
  assert.equal(distrustRead(cut, 400, "coverage dropped from 400 to 150 offers; kept the previous rows")?.accept, false);

  // A store's main collection failed and only a side collection read: 243 → 16.
  assert.equal(distrustRead({ store, rows: rows(16) }, 243, null)?.accept, false);
  assert.equal(distrustRead({ store, rows: rows(16) }, 243, "coverage dropped from 243 to 17 offers; kept the previous rows")?.accept, true);
  assert.equal(distrustRead({ store, rows: rows(130) }, 243, null), null); // a real sell-out, not a broken read
  assert.equal(distrustRead({ store, rows: rows(3) }, 15, null), null); // too small to judge
  assert.equal(distrustRead({ store, rows: rows(0) }, 0, null), null); // a new store

  // A marketplace's short read is never waved through: its rows are kept until pruned.
  const tcg = { store: TCGPLAYER, rows: rows(14) };
  assert.equal(distrustRead(tcg, 1578, null)?.accept, false);
  assert.equal(distrustRead(tcg, 1578, "coverage dropped from 1578 to 14 offers; kept the previous rows")?.accept, false);
});

// Beaches TCG's whole Pokémon collection as its live feed served it on 2026-10-19
// (/collections/pokemon-tcg/products.json, trimmed to handle, title and variants),
// through the importer's own read and rowsFromReads: the store's dry run.
test("a new store's live feed: Beaches TCG lists its English sealed product and nothing else", async () => {
  const store = STORE_BY_KEY.get("beachestcg")!;
  assert.deepEqual(store, {
    key: "beachestcg",
    name: "Beaches TCG",
    base: "https://beachestcg.com.au",
    market: "AU",
    platform: "shopify",
    country: "AU",
    collections: ["pokemon-tcg"],
  });
  const feed = readFileSync(new URL("./fixtures/beachestcg-pokemon-tcg-2026-10-19.json", import.meta.url), "utf8");
  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (url: string) => {
    const u = new URL(url);
    if (u.pathname === "/robots.txt") return new Response("", { status: 404 });
    asked.push(`${u.pathname}?${u.searchParams}`);
    return new Response(feed, { status: 200 });
  }) as typeof fetch;
  const read = await readShopifyCollection(store.base, store.collections[0], { country: store.country }).finally(() => {
    globalThis.fetch = realFetch;
  });
  // One page (54 products, under 250), in A$ (?country=AU).
  assert.deepEqual(asked, ["/collections/pokemon-tcg/products.json?limit=250&page=1&country=AU"]);
  assert.equal(read.products.length, 54);

  const rows = rowsFromReads(store, [read]);
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.title, r.identity.groupKey])), {
    "Chaos rising toxel blister": "blister|me4|toxel",
    "Pokemon 30th Anniversary Booster Pack": "cel30|booster-pack",
    "Pokemon 30th Anniversary Binder Collection": "collection|cel30|binder",
    "Pokemon 30th Anniversary Poster Collection": "collection|cel30|poster",
    "Pokemon 30th Anniversary Knock Out Collection": "collection|cel30|knock-out",
    "Pokemon 30th anniversary ETB": "cel30|etb",
    "Pokémon TCG: First Partner Illustration Collection—Series 2- 2 PER PERSON LIMIT": "collection|-|first-illustration-partner-series2",
    "journey together 3 pk blister": "blister|sv9|",
    "Pokemon Mega Greninja ex Premium Collection": "collection|-|ex-greninja-mega",
    "Pokemon Pitch Black Elite Trainer Box": "me5|etb",
    "Pokemon Pitch Black Booster Box": "me5|booster-box",
    "Pokemon Pitch Black Booster Bundle": "me5|booster-bundle",
    "Pokemon Pitch Black Three Booster Blister": "blister|me5|",
    "Pokemon Pitch Black Single Booster Pack": "me5|booster-pack",
    "Pokemon Mega Zygarde ex Premium Collection": "collection|-|ex-mega-zygarde",
    "Pokemon Chaos Rising Three Booster Blister": "blister|me4|",
    "Pokemon Chaos Rising ETB": "me4|etb",
    "Pokemon Chaos Rising Booster Bundle": "me4|booster-bundle",
    "Pokemon Chaos Rising Booster box": "me4|booster-box",
    "Stella Crown Booster pack": "sv7|booster-pack",
    "Destined Rivals - Booster Pack": "sv10|booster-pack",
    "Mega Evolution - Booster Pack": "me1|booster-pack",
    "Surging Sparks - Booster Pack": "sv8|booster-pack",
    "Journey Together - Booster Pack": "sv9|booster-pack",
    "Phantasmal Flames - Booster Pack": "me2|booster-pack",
    "Ascended Heroes - Elite Trainer Box": "me2pt5|etb",
    "Raikou - 2 Pack Blister": "blister|-|2pack-raikou",
    "Ascended Heroes - 2 pack blisters": "blister|me2pt5|2pack",
    "Perfect Order - Elite Trainer Box": "me3|etb",
    "Perfect Order - Three Booster Blister": "blister|me3|",
    "Perfect Order - Booster Box": "me3|booster-box",
    "Perfect Order - Booster Bundle": "me3|booster-bundle",
  });
  // Of five products in stock, only one is English sealed product: two accessories, two Japanese.
  assert.deepEqual(
    rows.filter((r) => r.inStock).map((r) => [r.title, r.priceCents]),
    [["Chaos rising toxel blister", 1199]],
  );
  // Everything else is refused, and why.
  const listed = new Set(rows.map((r) => r.title));
  const refused = Object.fromEntries(
    read.products.filter((p) => !listed.has(p.title)).map((p) => [p.title, ((id) => (isIdentity(id) ? id.groupKey : id))(identify(p.title))]),
  );
  assert.deepEqual(refused, {
    "Ultra pro pikachu top loaders plus sleeves 25 pack": "accessory",
    "nahil zero Booste box Japanese": "foreign",
    "Lost abyss Japanese booster pack": "foreign",
    "Ultra Pro Playmat Mega Charizard X & Mega Charizard Y": "accessory",
    // Greninja ex or Sylveon ex Box: one of two products.
    "Pokemon 30th anniversary ex box assorted": "vague",
    "Pokemon 30th anniversary Tech Sticker Pack": "accessory",
    // The Charizard ex Special Collection by its photo, which the title alone would file as the Premium Collection.
    "Pokemon - Charizard Ex Box": "vague",
    // Black or White Kyurem? (The photo is the Black.) Never a page of its own.
    "Pokemon Kyurem ex box": "vague",
    "Stella miracle Japanese pack": "foreign",
    // No tin is called "Mega Gengar" (it is probably the Mega Moonlit Tin): never a page of its own.
    "Mega Gengar tin": "vague",
    "mega brave Japanese booster box": "foreign",
    "Mega Dream Booster box  Japanese": "foreign",
    "Ninja Spinner Booster Box Japanese": "foreign",
    // Japanese too (its description says so): no English set has the name.
    "Pokemon Ninja Spinner booster pack": "no-set",
    "Terastal Festival ex JPN - Booster Box": "foreign",
    "Terastal Festival ex JPN - Booster Pack": "foreign",
    "Inferno X JPN - Booster Pack": "foreign",
    "Mega Symphonia JPN - Booster Pack": "foreign",
    "Mega Brave JPN - Booster Pack": "foreign",
    "Mega Dream JPN - Booster Pack": "foreign",
    "Nihil Zero JPN - Booster Pack": "foreign",
    // Mega Charizard X or Y: one of two products.
    "Mega Charizard Tin - Assorted": "vague",
  });
});
