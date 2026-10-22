import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchUrl, type SearchSpec } from "../src/lib/ebay-api";
import { runImport } from "../src/lib/ebay-import";
import { typeFloor } from "../src/lib/ebay-normalise";
import {
  buildSweepIndex,
  HOT_SHARE,
  HOT_TYPE_QUERY,
  hotSetWords,
  hotSweepQueries,
  isFiller,
  marketplaceShares,
  matchListing,
  setWordsIn,
  SWEEP_PAGE,
  SWEEP_QUERIES,
  SweepCollector,
  sweepMarketplace,
  sweepSignatureSets,
  sweepSpec,
  sweepVocabulary,
  sweepWithHot,
} from "../src/lib/ebay-sweep";
import type { PlanRow } from "../src/lib/ebay-store";
import { HOT_SET_QUERY, HOT_SETS } from "../src/lib/popular";
import { PRODUCT_TYPES } from "../src/lib/sealed-title";
import { fakeDb, harness, json, NOW, okToken, planRow, requestedReference, summary, withReference } from "./helpers/ebay-fakes";

// A small catalogue, as the store import files it (the real classifier makes the group keys).
function catalogue(): PlanRow[] {
  return [
    planRow("play-booster-box", "US", 16000, { name: "Aetherdrift Play Booster Box", productId: "bb" }),
    planRow("bundle", "US", 5000, { name: "Aetherdrift Bundle", productId: "bun" }),
    planRow("commander-deck", "US", 4000, { name: "Bloomburrow Commander Deck - Animated Army", productId: "army" }),
    planRow("commander-deck", "US", 9000, { name: "Bloomburrow Commander Deck - Animated Army Collector's Edition", productId: "army-ce" }),
    planRow("commander-deck", "US", 4500, { name: "Bloomburrow Commander Deck - Squirreled Away", productId: "squirrel" }),
    planRow("scene-box", "US", 3000, { name: "Final Fantasy Scene Box - Cloud", productId: "scene-cloud" }),
    planRow("scene-box", "US", 3000, { name: "Final Fantasy Scene Box - Tifa", productId: "scene-tifa" }),
    planRow("play-booster", "US", 500, { name: "Aetherdrift Play Booster Pack", productId: "pack" }),
    planRow("bundle", "AU", 9000, { name: "Aetherdrift Bundle", productId: "bun" }),
  ];
}

const usIndex = () => {
  const rows = catalogue();
  return buildSweepIndex(rows, "EBAY_US", sweepVocabulary(rows));
};
const hit = (title: string) => {
  const m = matchListing(title, usIndex());
  return "product" in m ? m.product.productId : m.miss;
};

test("sweep matching: set products by their group key, whatever the seller adds", () => {
  assert.equal(hit("Magic The Gathering Aetherdrift Play Booster Box 30 Packs Factory Sealed FAST SHIP"), "bb");
  assert.equal(hit("IN HAND MTG Aetherdrift Bundle Sealed"), "bun", "seller words do not make a plain Bundle a special one");
  assert.equal(hit("MTG Aetherdrift Bundle - Factory Sealed - Fast Ship"), "bun");
  assert.equal(hit("MTG Aetherdrift Gift Bundle"), "no-product", "a Gift Bundle is not the Bundle");
  assert.equal(hit("MTG Aetherdrift Collector Booster Pack Sealed"), "no-product", "a collector booster is not the play booster product");
  assert.equal(hit("MTG Tarkir Dragonstorm Bundle Sealed"), "no-product", "a product this marketplace does not list");
});

test("sweep matching: a Commander deck or a scene box needs all its words, and nothing that names another product", () => {
  assert.equal(hit("MTG Bloomburrow Commander Deck Animated Army Sealed NEW"), "army");
  assert.equal(hit("MTG Bloomburrow Animated Army Commander Deck Collector's Edition Sealed"), "army-ce", "the most specific product wins");
  assert.equal(hit("MTG Bloomburrow Squirreled Away Commander Deck Factory Sealed"), "squirrel");
  assert.equal(hit("MTG Final Fantasy Scene Box Cloud Sealed"), "scene-cloud");
  assert.equal(hit("MTG Final Fantasy Scene Box Cloud Promo Foil"), "scene-cloud", "promo-card words are filler");
  assert.equal(hit("MTG Bloomburrow Commander Deck Animated Army Squirreled Away"), "no-product", "a word that names another product makes it not this one");
  assert.equal(hit("MTG Bloomburrow Commander Deck"), "rejected", "no identifying word: which deck?");
});

test("sweep matching: lots, several units, random variants, Japanese naming and damage are never handed to a product", () => {
  for (const t of [
    "MTG Final Fantasy Scene Boxes Lot Cloud Tifa",
    "MTG Final Fantasy Scene Box Cloud Full Set",
    "MTG Final Fantasy Scene Box - One Chosen At Random",
    "MTG Aetherdrift Play Booster Box x2 Sealed",
    "MTG Aetherdrift Japanese Play Booster Box",
    "MTG Aetherdrift Play Booster Box Sealed READ (DAMAGE)",
    "MTG Aetherdrift Play Booster Box Presale",
    "Japanese MTG Aetherdrift Play Booster Box",
    "MTG Aetherdrift Play Booster Box EMPTY",
  ])
    assert.equal(hit(t), "rejected", t);
});

test("filler: seller and shipping words are filler, set words only for a set the title names; product words never", () => {
  for (const w of ["fast", "nib", "coin", "holo", "express", "foil", "promo"]) assert.ok(isFiller(w), w);
  for (const w of ["collector", "commander", "gift", "play", "draft", "army", "cloud", "quick", "day", "moon", "ultra"]) assert.ok(!isFiller(w), w);
  const named = setWordsIn("MTG Commander Deck Edge of Eternities World Shaper");
  for (const w of ["edge", "eternities"]) assert.ok(isFiller(w, named), w);
  assert.ok(!isFiller("moon", setWordsIn("MTG Moon Secret Lair")), "Moon is not a set");
});

test("sweep matching: the reviewers' wrong matches stay refused (partials, multi-pack lots, case-fresh boxes, Japanese naming, other sets)", () => {
  const rows = [
    ...catalogue(),
    planRow("play-booster-box-case", "US", 90000, { name: "Aetherdrift Play Booster Box Case", productId: "bbcase" }),
    planRow("bundle", "US", 5000, { name: "Tarkir: Dragonstorm Bundle", productId: "tdm-bun" }),
  ];
  const ix = buildSweepIndex(rows, "EBAY_US", sweepVocabulary(rows));
  const m = (t: string) => {
    const r = matchListing(t, ix);
    return "product" in r ? r.product.productId : r.miss;
  };
  for (const t of [
    "MTG Bloomburrow Commander Deck Animated Army Missing Promo",
    "MTG Bloomburrow Commander Deck Animated Army Without Packs",
    "MTG Final Fantasy Scene Boxes Lot Cloud Tifa",
    "MTG Aetherdrift 5 Play Booster Packs Sealed",
    "MTG Aetherdrift Play Booster Pack - 10 Packs",
    "MTG Aetherdrift Play Booster Packs (5 Packs)",
    "MTG Aetherdrift Play Booster Pack x10",
    "MTG Aetherdrift Play Booster Box Case Fresh",
    "MTG Aetherdrift Play Booster Box - You Choose",
    "MTG Aetherdrift Collector Booster Pulled From Play Booster Box",
    "MTG Final Fantasy Scene Box Cloud - Choose Your Scene",
    "MTG Aetherdrift & Tarkir Dragonstorm Bundle",
  ])
    assert.equal(m(t), "rejected", t);
  assert.equal(m("MTG Tarkir Dragonstorm Bundle Sealed"), "tdm-bun", "a listing that names a set is only that set's product");
  assert.equal(m("MTG Aetherdrift Play Booster Box Case 6 Boxes Sealed"), "bbcase");
  assert.equal(m("MTG Aetherdrift Play Booster Box (30 ct) Factory Sealed"), "bb", "a box's own pack count is not a lot");
  assert.equal(m("MTG Aetherdrift Play Booster Pack Sealed"), "pack");
});

test("collector: a 'New other' or 'Like New' condition is not a sealed product", () => {
  const c = new SweepCollector(usIndex(), NOW);
  c.addPage([
    summary("n1", "MTG Aetherdrift Play Booster Box", 150, "EBAY_US", { condition: "New other (see details)" }),
    summary("n2", "MTG Aetherdrift Play Booster Box", 150, "EBAY_US", { condition: "Like New" }),
    summary("n3", "MTG Aetherdrift Play Booster Box", 150, "EBAY_US", { condition: "Neu: Sonstige (siehe Arti" }),
  ]);
  assert.equal(c.stats.miss.condition, 3);
  assert.equal(c.feeds().size, 0);
});

test("collector: keeps lowest price first, de-duplicated, at most 8; refuses used, under-floor and unmatched listings; counts why", () => {
  const c = new SweepCollector(usIndex(), NOW);
  const page = [
    summary("1", "MTG Aetherdrift Play Booster Box Sealed", 150),
    summary("2", "MTG Aetherdrift Play Booster Box Sealed", 140),
    summary("2", "MTG Aetherdrift Play Booster Box Sealed", 140), // the same listing twice
    summary("3", "MTG Aetherdrift Play Booster Box Sealed", 20), // under the booster box floor
    summary("4", "MTG Aetherdrift Play Booster Box Sealed", 160, "EBAY_US", { condition: "Used" }),
    summary("5", "MTG Mystery Lot of cards", 50),
    summary("6", "MTG Bloomburrow Commander Deck Animated Army", 45),
  ];
  const gain = c.addPage(page);
  assert.equal(gain, 3);
  const feeds = c.feeds();
  assert.deepEqual(feeds.get("bb")!.map((i) => i.price.value), ["140.00", "150.00"]);
  assert.equal(feeds.get("army")!.length, 1);
  assert.equal(c.stats.miss.floor, 1);
  assert.equal(c.stats.miss.condition, 1);
  assert.equal(c.stats.miss.rejected, 1);
  assert.equal(c.stats.matched, 3);
});

test("paging: 200 a page with the offset, round-robin across queries, stops at the end, when dry, at the budget and at eBay's depth", async () => {
  const spec = sweepSpec(SWEEP_QUERIES[0], "EBAY_US", 400);
  const u = new URL(buildSearchUrl(spec));
  assert.equal(u.searchParams.get("limit"), "200");
  assert.equal(u.searchParams.get("offset"), "400");
  assert.equal(u.searchParams.get("q"), "MTG play booster box");
  assert.equal(new URL(buildSearchUrl(sweepSpec(SWEEP_QUERIES[0], "EBAY_US", 0))).searchParams.get("offset"), null);

  // query A: two good pages then the end (a short page); query B: always the same listings (dry after its minimum); query C: errors
  const queries = [
    { key: "a", q: "play booster box", types: ["play-booster-box"] as const },
    { key: "b", q: "bundle", types: ["bundle"] as const },
    { key: "c", q: "scene box", types: ["scene-box"] as const },
  ];
  const seen: string[] = [];
  const c = new SweepCollector(usIndex(), NOW);
  const progress = await sweepMarketplace(
    c,
    50,
    async (s) => {
      seen.push(`${s.q}@${s.offset ?? 0}`);
      if (s.q.endsWith("scene box")) throw new Error("boom");
      if (s.q.endsWith("play booster box")) {
        const n = (s.offset ?? 0) / SWEEP_PAGE;
        const items = Array.from({ length: n < 2 ? SWEEP_PAGE : 3 }, (_, i) => summary(`a${n}-${i}`, "MTG Aetherdrift Play Booster Box Sealed", 150 + i));
        return { items, total: 403 };
      }
      return { items: Array.from({ length: SWEEP_PAGE }, () => summary("b-same", "MTG Aetherdrift Bundle", 60)), total: 9000 };
    },
    { concurrency: 1, queries, isFatal: () => false },
  );
  const by = Object.fromEntries(progress.map((p) => [p.key, p]));
  assert.equal(by.a.stopped, "end");
  assert.equal(by.a.pages, 3);
  assert.equal(by.b.stopped, "dry");
  assert.equal(by.b.pages, 3, "page 1 gains; pages 2 and 3 gain nothing: dry after two");
  assert.equal(by.c.stopped, "error");
  assert.ok(seen.indexOf("MTG play booster box@200") > seen.indexOf("MTG bundle@0"), "round-robin: every query's first page before anyone's second");

  // the budget ends it
  const tight = await sweepMarketplace(new SweepCollector(usIndex(), NOW), 2, async () => ({ items: Array.from({ length: SWEEP_PAGE }, (_, i) => summary(`x${Math.random()}-${i}`, "MTG Aetherdrift Play Booster Box", 150)), total: 100000 }), {
    concurrency: 2,
    queries: [queries[0]],
  });
  assert.equal(tight[0].pages, 2);
  assert.equal(tight[0].stopped, "budget");
});

test("shares: by product count x audience weight (the US first), with a floor for a small marketplace, never more than the budget", () => {
  const rows = [...catalogue(), ...Array.from({ length: 40 }, (_, i) => planRow("secret-lair", "CA", 4000, { name: `Secret Lair Drop - Test Drop ${i}`, productId: `ca${i}` }))];
  const vocab = sweepVocabulary(rows);
  const ix = (["EBAY_US", "EBAY_AU", "EBAY_CA"] as const).map((m) => buildSweepIndex(rows, m, vocab));
  assert.deepEqual(ix.map((x) => x.products.length), [8, 1, 40]);
  const sh = marketplaceShares(ix, 1000);
  const total = [...sh.values()].reduce((a, b) => a + b, 0);
  assert.ok(total <= 1000);
  assert.ok(sh.get("EBAY_CA")! > sh.get("EBAY_US")!, "five times the products at a quarter of the weight: more pages");
  assert.ok(sh.get("EBAY_AU")! >= 70, "the floor");
  // the same products at the US's weight, the UK's and Canada's: the US's share is the largest, Canada's the smallest
  const same = (["EBAY_US", "EBAY_GB", "EBAY_DE", "EBAY_AU", "EBAY_CA"] as const).map((marketplace) => ({ ...ix[0], marketplace }));
  const s2 = marketplaceShares(same, 1000);
  assert.ok(s2.get("EBAY_US")! > s2.get("EBAY_GB")! && s2.get("EBAY_GB")! === s2.get("EBAY_DE")! && s2.get("EBAY_DE")! > s2.get("EBAY_AU")! && s2.get("EBAY_AU")! > s2.get("EBAY_CA")!, JSON.stringify([...s2]));
  // the first full run's catalogue (2026-10-11: US 2,538, UK 2,169, EU 1,593, AU 2,339, CA 3,526 products): the US gets the most
  const sized = (marketplace: "EBAY_US" | "EBAY_GB" | "EBAY_DE" | "EBAY_AU" | "EBAY_CA", n: number) => ({ ...ix[0], marketplace, products: Array.from({ length: n }, () => ix[0].products[0]) });
  const real = marketplaceShares([sized("EBAY_US", 2538), sized("EBAY_GB", 2169), sized("EBAY_DE", 1593), sized("EBAY_AU", 2339), sized("EBAY_CA", 3526)], 2100);
  const us = real.get("EBAY_US")!;
  assert.ok([...real].every(([m, v]) => m === "EBAY_US" || v < us), JSON.stringify([...real]));
  assert.ok(real.get("EBAY_GB")! > real.get("EBAY_AU")! && real.get("EBAY_GB")! > real.get("EBAY_CA")!, "the UK before Australia and Canada");
  assert.ok([...real.values()].reduce((a, b) => a + b, 0) <= 2100);
});

// ─── hot sets (src/lib/popular.ts) ──────────────────────────────────────────────

function hotCatalogue(): PlanRow[] {
  return [
    planRow("play-booster-box", "US", 16000, { name: "Reality Fracture Play Booster Box", productId: "fra-pbb" }),
    planRow("collector-booster-box", "UK", 30000, { name: "Reality Fracture Collector Booster Box", productId: "fra-cbb" }),
    planRow("bundle", "US", 5000, { name: "Reality Fracture Bundle", productId: "fra-bun" }),
    planRow("special-bundle", "US", 9000, { name: "Reality Fracture Bundle - Ugin Edition", productId: "fra-sbun" }),
    planRow("play-booster", "US", 600, { name: "Reality Fracture Play Booster Pack", productId: "fra-pack" }),
    planRow("commander-deck", "AU", 6000, { name: "Reality Fracture Commander Deck - Shattered Time", productId: "fra-cmd" }), // an AU-only type still makes a query
    planRow("bundle", "US", 5500, { name: "The Hobbit Bundle", productId: "hob-bun" }),
    planRow("collector-booster-box-case", "US", 90000, { name: "The Hobbit Collector Booster Box Case", productId: "hob-case" }),
    planRow("play-booster-box", "US", 15000, { name: "Avatar: The Last Airbender Play Booster Box", productId: "tla-pbb" }),
    planRow("play-booster-box", "US", 16000, { name: "Star Trek Play Booster Box", productId: "trk-pbb" }), // hot, not out yet
    planRow("play-booster-box", "US", 16000, { name: "Aetherdrift Play Booster Box", productId: "bb" }), // not a hot set
  ];
}

test("hot queries: per hot set in HOT_SETS order, one per product type the catalogue has for it; The Hobbit is searched as 'hobbit' and Avatar as 'avatar'", () => {
  assert.equal(HOT_SHARE, 0.5);
  assert.deepEqual(HOT_SETS.slice(0, 3), ["trk", "fra", "hob"]);
  assert.equal(HOT_SET_QUERY.hob, "Hobbit");
  const qs = hotSweepQueries(hotCatalogue(), "2026-10-07");
  assert.deepEqual(
    qs.map((x) => [x.key, x.q, [...x.types]]),
    [
      ["hot-fra-play-box", "reality fracture play booster box", ["play-booster-box"]],
      ["hot-fra-collector-box", "reality fracture collector booster box", ["collector-booster-box"]],
      ["hot-fra-bundle", "reality fracture bundle", ["bundle", "special-bundle"]], // a Bundle and a special Bundle share one query
      ["hot-fra-commander", "reality fracture commander deck", ["commander-deck"]],
      ["hot-fra-play-pack", "reality fracture play booster", ["play-booster"]],
      ["hot-hob-bundle", "hobbit bundle", ["bundle"]],
      ["hot-hob-collector-box-case", "hobbit collector booster box case", ["collector-booster-box-case"]],
      ["hot-tla-play-box", "avatar play booster box", ["play-booster-box"]],
    ],
  );
  assert.equal(new Set(qs.map((x) => x.q)).size, qs.length, "no query twice");
  assert.ok(!qs.some((x) => /aetherdrift|star trek/.test(x.q)), "only hot sets that are out");
  // "MTG <words> <phrase>", 200 a page, the lowest floor of its types (the pack's for the pack query)
  const pack = qs.find((x) => x.key === "hot-fra-play-pack")!;
  const u = new URL(buildSearchUrl(sweepSpec(pack, "EBAY_US", 0)));
  assert.equal(u.searchParams.get("q"), "MTG reality fracture play booster");
  assert.equal(u.searchParams.get("limit"), "200");
  const bundle = qs.find((x) => x.key === "hot-fra-bundle")!;
  assert.equal(sweepSpec(bundle, "EBAY_US", 0).minPrice, typeFloor("bundle", "EBAY_US"), "the Bundle's floor, lower than the special Bundle's");
  // every phrase: a case is its box's phrase + "case"
  for (const t of PRODUCT_TYPES) assert.ok(HOT_TYPE_QUERY[t.key].phrase.length > 0, t.key);
  assert.equal(HOT_TYPE_QUERY["play-booster-box-case"].phrase, "play booster box case");
  assert.equal(HOT_TYPE_QUERY["collector-booster-box-case"].phrase, "collector booster box case");
  assert.equal(HOT_TYPE_QUERY["bundle-case"].phrase, "bundle case");
  assert.equal(HOT_TYPE_QUERY["special-bundle"].phrase, "bundle");
  // a hot set that is not out yet is skipped (Reality Fracture came out on 2026-10-02; Star Trek comes out on 2026-11-13)
  const before = hotSweepQueries(hotCatalogue(), "2026-09-01");
  assert.ok(!before.some((x) => x.key.startsWith("hot-fra")));
  assert.equal(before[0].key, "hot-hob-bundle");
  assert.equal(hotSweepQueries(hotCatalogue(), "2026-11-20")[0].key, "hot-trk-play-box", "Star Trek first once it is out");
  // an unknown code, or a hot set the catalogue has nothing of, makes no query
  assert.deepEqual(hotSweepQueries(hotCatalogue(), "2026-10-07", ["nope", "msh"]), []);
  assert.equal(hotSetWords("fra"), "reality fracture");
  assert.equal(hotSetWords("dft"), "aetherdrift");
  assert.equal(hotSetWords("tdm"), "tarkir: dragonstorm");
  assert.equal(hotSetWords("hob"), "hobbit");
  assert.equal(hotSetWords("nope"), null);
});

test("the hot pass runs first, with at most half the marketplace's share; the general queries get the rest", async () => {
  const hot = hotSweepQueries(hotCatalogue(), "2026-10-07");
  const general = SWEEP_QUERIES.slice(0, 4);
  const seen: string[] = [];
  // a collector whose every page gains (no query runs dry): only the budget and the order are under test here
  const ix = () => ({ index: { marketplace: "EBAY_US" }, addPage: () => 1 }) as unknown as SweepCollector;
  const endless = async (s: SearchSpec) => {
    seen.push(s.q);
    return { items: Array.from({ length: SWEEP_PAGE }, () => ({})), total: 100_000 };
  };
  const hotQs = new Set(hot.map((x) => `MTG ${x.q}`));
  const r = await sweepWithHot(ix(), 41, endless, { concurrency: 3, hot, queries: general });
  const lastHot = seen.findLastIndex((q) => hotQs.has(q));
  const firstGeneral = seen.findIndex((q) => !hotQs.has(q));
  assert.ok(lastHot < firstGeneral, "every hot page before the first general one");
  assert.equal(r.hot.reduce((a, p) => a + p.pages, 0), 20, "half of 41, rounded down");
  assert.equal(r.general.reduce((a, p) => a + p.pages, 0), 21, "the rest");
  assert.equal(seen.length, 41, "never past the share");
  assert.equal(seen[0], "MTG reality fracture play booster box", "Reality Fracture first (Star Trek is not out)");
  // round-robin inside the hot pass: every hot query's first page before any second page
  assert.deepEqual(seen.slice(0, hot.length).sort(), [...hotQs].sort());
  // a hot pass that ends early leaves the rest of the share to the general queries
  const short = async (s: SearchSpec) => (hotQs.has(s.q) ? { items: [], total: 0 } : endless(s));
  const r2 = await sweepWithHot(ix(), 41, short, { concurrency: 1, hot, queries: general });
  assert.equal(r2.hot.reduce((a, p) => a + p.pages, 0), hot.length);
  assert.equal(r2.general.reduce((a, p) => a + p.pages, 0), 41 - hot.length);
  // what the hot pass really cost (the importer's count, retries included) comes off the general pass
  let calls = 0;
  const retrying = async (s: SearchSpec) => {
    calls += hotQs.has(s.q) ? 2 : 1; // every hot page needed a retry
    return endless(s);
  };
  const r3 = await sweepWithHot(ix(), 40, retrying, { concurrency: 1, hot, queries: general, spent: () => calls });
  assert.equal(r3.hot.reduce((a, p) => a + p.pages, 0), 20);
  assert.equal(r3.general.reduce((a, p) => a + p.pages, 0), 0, "20 hot pages cost 40 calls: nothing left");
  assert.equal(calls, 40);
  // no hot query (no hot product in the catalogue): the whole share for the general queries
  const r4 = await sweepWithHot(ix(), 10, endless, { concurrency: 1, hot: [], queries: general });
  assert.deepEqual([r4.hot.length, r4.general.reduce((a, p) => a + p.pages, 0)], [0, 10]);
  // once the run is over (a 429 elsewhere), the general pass does not start
  const r5 = await sweepWithHot(ix(), 10, endless, { concurrency: 1, hot, queries: general, shouldStop: () => true });
  assert.deepEqual(r5.general, []);
});

test("run: the sweep writes an item feed for every product with two or more listings, then per-product searches fill only what it missed", async () => {
  const rows = catalogue();
  const db = fakeDb(rows);
  const h = harness((url, init) => {
    if (url.includes("/oauth2/token")) return okToken();
    const u = new URL(url);
    const q = u.searchParams.get("q") ?? "";
    const offset = Number(u.searchParams.get("offset") ?? 0);
    const ref = requestedReference(init);
    if (q === "MTG play booster box" && offset === 0)
      return json({ total: 3, itemSummaries: withReference([summary("s1", "MTG Aetherdrift Play Booster Box Sealed", 150), summary("s2", "Magic The Gathering Aetherdrift Play Booster Box", 145), summary("s3", "MTG Aetherdrift Play Booster Box 30 packs", 155)], ref) });
    if (q === "MTG scene box" && offset === 0)
      return json({ total: 2, itemSummaries: withReference([summary("t1", "MTG Final Fantasy Scene Box Cloud", 35), summary("t2", "MTG Final Fantasy Scene Box Cloud Sealed", 32)], ref) });
    if (q.startsWith("MTG Aetherdrift Bundle"))
      return json({ total: 2, itemSummaries: withReference([summary("e1", "MTG Aetherdrift Bundle", 60), summary("e2", "MTG Aetherdrift Bundle Sealed", 58)], ref) });
    return json({ total: 0, itemSummaries: [] });
  });
  const logs: string[] = [];
  const s = await runImport({ db, api: h.deps, env: { EBAY_SWEEP_CALLS: "200" }, log: (l) => logs.push(l) }, { only: ["sweep", "items"] });
  assert.equal(s.stopped, null, logs.join("\n"));
  // the sweep covered the booster box and the Cloud scene box in the US
  assert.ok(db.feeds.has("EBAY_US|item:bb"));
  assert.deepEqual(db.feeds.get("EBAY_US|item:bb")!.items.map((i) => i.price.value), ["145.00", "150.00", "155.00"]);
  assert.ok(db.feeds.has("EBAY_US|item:scene-cloud"));
  assert.ok(!db.feeds.has("EBAY_US|item:scene-tifa"), "nothing found: no feed");
  // the per-product search ran for the eligible Bundle the sweep did not cover, and never for the box it did
  const itemSearches = h.searches().map((c) => new URL(c.url).searchParams.get("q"));
  assert.ok(itemSearches.some((q) => q?.startsWith("MTG Aetherdrift Bundle")));
  assert.ok(!itemSearches.some((q) => q === "MTG Aetherdrift Play Booster Box"));
  assert.ok(db.feeds.has("EBAY_US|item:bun"));
  assert.equal(s.buckets.items.covered >= 1, true);
  // every sweep link is eBay's own, tagged with the item feed's reference
  for (const it of db.feeds.get("EBAY_US|item:bb")!.items) assert.equal(new URL(it.url).searchParams.get("customid"), "mtg-us-item");
  // budget: every search reserved, never more than the cap
  assert.equal([...db.days.values()].reduce((a, b) => a + b, 0), h.searches().length);
  assert.ok(s.sweep.some((m) => m.marketplace === "EBAY_US" && m.written >= 2));
});

test("run: a 429 during the sweep stops the run, keeps what the sweep already found, and buys no per-product search", async () => {
  const rows = catalogue();
  const db = fakeDb(rows);
  let n = 0;
  const h = harness((url, init) => {
    if (url.includes("/oauth2/token")) return okToken();
    n++;
    if (n === 1) return json({ total: 2, itemSummaries: withReference([summary("e1", "MTG Aetherdrift Play Booster Box", 160), summary("e2", "MTG Aetherdrift Play Booster Box Sealed", 158)], requestedReference(init)) });
    return json({ errors: [] }, 429, { "retry-after": "60" });
  });
  const s = await runImport({ db, api: h.deps, env: { EBAY_SWEEP_CALLS: "100" }, log: () => {} }, { only: ["sweep", "items"], concurrency: 1 });
  assert.equal(s.stopped, "rate-limited");
  assert.ok(db.feeds.has("EBAY_US|item:bb"), "the page that came back is written");
  assert.equal(s.buckets.items.planned, 0);
});
