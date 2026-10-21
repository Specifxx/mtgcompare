// Value discovery (src/lib/deals.ts): the deals bar, the per-pack ranking, below US MSRP, the "new on DexCompare" bulk-day guard,
// the deals page's sections and the copy the deals / cheapest-packs / this-week / region home pages print. Pure parts only, with
// fixtures; the pages' sources are checked for the rules every new route follows (ISR, one strip, capped reads).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ProductCardData } from "../src/lib/data";
import { BANNED_COPY, findBannedCopy } from "../src/lib/copy-rules";
import {
  BULK_DAY,
  DEAL_SECTIONS,
  dealPct,
  dealSectionOf,
  dealsCopy,
  digestCopy,
  fitTitle,
  homeCopy,
  isDeal,
  nearestRegion,
  newlyTrackedFilter,
  newSince,
  packsCopy,
  perPackLeadersOf,
  pickBelowMsrp,
  pickDeals,
  rankPerPack,
  setsAround,
} from "../src/lib/deals";
import { medianSaving } from "../src/lib/format";
import { PACK_TYPES } from "../src/lib/per-pack";
import { REGION_LIST } from "../src/lib/regions";
import { RRP_NOTE } from "../src/lib/rrp";
import { PRODUCT_TYPES } from "../src/lib/sealed-title";
import { SETS } from "../src/lib/sets";

let n = 0;
const card = (o: Partial<ProductCardData> = {}): ProductCardData => ({
  slug: o.slug ?? `p-${n++}`,
  name: "Product",
  productType: "Collection",
  setCode: "me4",
  imageUrl: null,
  lowestPriceCents: 9000,
  inStockStores: 4,
  listedStores: 5,
  marketplaceOpen: false,
  medianOpenCents: 10000,
  releaseDate: null,
  ...o,
});

// ─── The deal bar ───────────────────────────────────────────────────────────────

test("pickDeals: 10% to 50% under the median, inclusive at both ends, and nothing else", () => {
  const at = (lowest: number) => card({ lowestPriceCents: lowest, medianOpenCents: 10000 });
  const keep = [at(9000), at(7500), at(5000)];
  const drop = [at(9001), at(9500), at(10000), at(12000), at(4999), at(1295)];
  const got = pickDeals([...drop, ...keep], "US");
  assert.deepEqual(got.map((p) => p.lowestPriceCents), [5000, 7500, 9000]);
  // The misread listing the 50% floor is for: AU's A$12.95 blister against a A$42.45 median.
  assert.equal(isDeal(card({ productType: "Blister", lowestPriceCents: 1295, medianOpenCents: 4245 }), "AU"), false);
});

test("pickDeals: three or more stores in stock, and a median to compare with", () => {
  assert.equal(pickDeals([card({ inStockStores: 2 })], "US").length, 0, "two stores are not a market");
  assert.equal(pickDeals([card({ inStockStores: 3 })], "US").length, 1);
  assert.equal(pickDeals([card({ medianOpenCents: null })], "US").length, 0);
  assert.equal(pickDeals([card({ lowestPriceCents: null })], "US").length, 0);
});

test("pickDeals: the type's price floor still applies (a $69 'booster box' 31% under is a deposit or a misread, not a deal)", () => {
  // US booster box floor: 7000 cents. Inside the ratio window, under the floor: dropped.
  assert.equal(pickDeals([card({ productType: "Booster Box", lowestPriceCents: 6900, medianOpenCents: 10000 })], "US").length, 0);
  assert.equal(pickDeals([card({ productType: "Booster Box", lowestPriceCents: 7000, medianOpenCents: 10000 })], "US").length, 1);
  // The same price in Australia is under the A$105 floor.
  assert.equal(pickDeals([card({ productType: "Booster Box", lowestPriceCents: 10000, medianOpenCents: 12000 })], "AU").length, 0);
  // An unknown type has no floor.
  assert.equal(pickDeals([card({ productType: "Mystery", lowestPriceCents: 50, medianOpenCents: 60 })], "US").length, 1);
});

test("pickDeals: biggest saving first, then the cheaper, each product once", () => {
  const a = card({ slug: "a", lowestPriceCents: 8000, medianOpenCents: 10000 }); // 0.80
  const b = card({ slug: "b", lowestPriceCents: 3500, medianOpenCents: 5000 }); // 0.70
  const c = card({ slug: "c", lowestPriceCents: 4000, medianOpenCents: 5000 }); // 0.80, cheaper than a
  const dupe = { ...b };
  assert.deepEqual(pickDeals([a, b, c, dupe], "US").map((p) => p.slug), ["b", "c", "a"]);
});

test("every deal's badge is the product page's medianSaving(), and the bar is the same (no deal without a badge)", () => {
  for (let lo = 4000; lo <= 10500; lo += 7) {
    for (const stores of [2, 3, 7]) {
      const p = card({ lowestPriceCents: lo, medianOpenCents: 9999, inStockStores: stores });
      const badge = medianSaving(p.lowestPriceCents, p.medianOpenCents, p.inStockStores);
      if (isDeal(p, "US")) {
        assert.ok(badge, `${lo}/${stores}: a deal always has its badge`);
        assert.equal(badge, `${dealPct(p)}% below the median of ${stores} stores`);
      } else if (lo >= 9999 * 0.5) assert.equal(badge, null, `${lo}/${stores}: no badge, no deal (inside the floor)`);
    }
  }
});

test("the deals page's sections: every product type in exactly one, 48 deals at most, the anchors the type pages link to", () => {
  assert.deepEqual(
    DEAL_SECTIONS.map((s) => s.id),
    ["booster-boxes", "elite-trainer-boxes", "booster-bundles", "collections", "more"],
  );
  for (const t of PRODUCT_TYPES) assert.equal(DEAL_SECTIONS.filter((s) => s.types.includes(t.label)).length, 1, t.label);
  assert.equal(DEAL_SECTIONS.reduce((n, s) => n + s.take, 0), 48);
  assert.equal(dealSectionOf("Pokémon Center Elite Trainer Box").id, "elite-trainer-boxes");
  assert.equal(dealSectionOf("Booster Pack").id, "more");
  assert.equal(dealSectionOf("Something new").id, "more");
});

// ─── Price per pack ─────────────────────────────────────────────────────────────

test("rankPerPack: open pack types with a fixed count, above the floor, cheapest per pack first", () => {
  const box = card({ slug: "box", productType: "Booster Box", setCode: "me4", lowestPriceCents: 14400 }); // 36 → 400
  const etb = card({ slug: "etb", productType: "Elite Trainer Box", setCode: "me4", lowestPriceCents: 4500 }); // 9 → 500
  const bundle = card({ slug: "bundle", productType: "Booster Bundle", setCode: "sv8", lowestPriceCents: 2400 }); // 6 → 400, cheaper product
  const pack = card({ slug: "pack", productType: "Booster Pack", setCode: "me4", lowestPriceCents: 449 });
  const swshEtb = card({ slug: "swsh-etb", productType: "Elite Trainer Box", setCode: "swsh12", lowestPriceCents: 4000 }); // 8 → 500
  const collection = card({ slug: "coll", productType: "Collection", lowestPriceCents: 100 }); // no fixed count
  const blister = card({ slug: "blister", productType: "Blister", name: "Checklane Blister", lowestPriceCents: 600 }); // count varies: no price
  const soldOut = card({ slug: "sold", productType: "Booster Box", lowestPriceCents: 9000, inStockStores: 0 });
  const junk = card({ slug: "junk", productType: "Booster Box", lowestPriceCents: 3600 }); // under the $70 floor
  const ranked = rankPerPack([pack, etb, collection, box, blister, soldOut, junk, swshEtb, bundle], "US");
  assert.deepEqual(ranked.map((r) => r.p.slug), ["bundle", "box", "pack", "swsh-etb", "etb"]);
  assert.deepEqual(ranked.map((r) => r.perPack), [400, 400, 449, 500, 500]);
  assert.deepEqual(ranked.map((r) => r.packs), [6, 36, 1, 8, 9]);
  // US MSRP per pack (rrp.ts): $4.49 for a Mega Evolution box or pack, $49.99 / 9 for its ETB; none for Sword & Shield.
  assert.equal(ranked.find((r) => r.p.slug === "box")!.msrpPerPack, 449);
  assert.equal(ranked.find((r) => r.p.slug === "etb")!.msrpPerPack, 555);
  assert.equal(ranked.find((r) => r.p.slug === "swsh-etb")!.msrpPerPack, null);
  assert.ok(rankPerPack([box], "AU").every((r) => r.msrpPerPack === null), "MSRP is US only");
});

test("perPackLeadersOf: one group per pack type in PACK_TYPES order, and the overall top ten", () => {
  const cards: ProductCardData[] = [];
  for (let i = 0; i < 14; i++) cards.push(card({ productType: "Booster Pack", lowestPriceCents: 400 + i * 10 }));
  for (let i = 0; i < 3; i++) cards.push(card({ productType: "Booster Box", lowestPriceCents: 13000 + i * 100 }));
  cards.push(card({ productType: "Collection", lowestPriceCents: 900 }));
  const { byType, top10 } = perPackLeadersOf(cards, "US");
  assert.deepEqual(byType.map((g) => g.type), ["Booster Box", "Booster Pack"]);
  assert.ok(byType.every((g) => PACK_TYPES.includes(g.type)));
  assert.equal(byType[1].rows.length, 14);
  assert.equal(top10.length, 10);
  assert.ok(top10.every((r, i) => i === 0 || top10[i - 1].perPack <= r.perPack), "cheapest per pack first");
  assert.equal(top10[0].p.productType, "Booster Box", "a box at $3.61 a pack beats every loose pack");
});

// ─── Below US MSRP ──────────────────────────────────────────────────────────────

test("pickBelowMsrp: under the set's MSRP (but not under half of it), furthest under first; no MSRP, no entry", () => {
  const under = card({ slug: "under", productType: "Elite Trainer Box", setCode: "sv8", lowestPriceCents: 4500 }); // 4999
  const at = card({ slug: "at", productType: "Elite Trainer Box", setCode: "sv8", lowestPriceCents: 4999 });
  const boxUnder = card({ slug: "box", productType: "Booster Box", setCode: "me4", lowestPriceCents: 12000 }); // 16164: 0.74
  const half = card({ slug: "half", productType: "Booster Box", setCode: "me4", lowestPriceCents: 8000 }); // under half: a misread
  const swsh = card({ slug: "swsh", productType: "Elite Trainer Box", setCode: "swsh12", lowestPriceCents: 1000 }); // no MSRP we trust
  const coll = card({ slug: "coll", productType: "Collection", setCode: "sv8", lowestPriceCents: 100 });
  const sold = card({ slug: "sold", productType: "Elite Trainer Box", setCode: "sv8", lowestPriceCents: 3000, inStockStores: 0 });
  assert.deepEqual(pickBelowMsrp([at, under, swsh, coll, half, sold, boxUnder]).map((p) => p.slug), ["box", "under"]);
});

// ─── New on DexCompare ──────────────────────────────────────────────────────────

test("newlyTrackedFilter: the last 14 whole days, minus every day with 200+ creations (imports, re-groupings), newest first", () => {
  const now = new Date("2026-10-14T09:00:00Z");
  const rows: { id: string; createdAt: Date }[] = [];
  const at = (iso: string, count: number, tag: string) => {
    for (let i = 0; i < count; i++) rows.push({ id: `${tag}-${i}`, createdAt: new Date(Date.parse(iso) + i * 1000) });
  };
  at("2026-10-12T10:00:00Z", 5, "real"); // a normal day: kept
  at("2026-10-10T03:00:00Z", BULK_DAY, "bulk"); // exactly the bar: a bulk day, dropped
  at("2026-10-08T12:00:00Z", BULK_DAY - 1, "big"); // one under the bar: kept
  at("2026-09-25T00:00:00Z", 7007, "launch"); // the launch import, outside the window anyway
  at("2026-09-30T23:00:00Z", 3, "edge"); // the first day of the window (14 days back, from midnight): kept
  at("2026-09-29T23:59:00Z", 2, "old"); // the day before: out
  const got = newlyTrackedFilter(rows, now);
  const tags = new Set(got.map((r) => r.id.split("-")[0]));
  assert.deepEqual([...tags], ["real", "big", "edge"]);
  assert.equal(got.length, 5 + BULK_DAY - 1 + 3);
  assert.ok(got.every((r, i) => i === 0 || got[i - 1].createdAt >= r.createdAt), "newest first");
  assert.equal(newSince(now).toISOString(), "2026-09-30T00:00:00.000Z", "whole days: a bulk day at the edge is counted in full");
  // A bulk day across "exactly 14 days ago" (09:00) is still counted whole: cut at 09:00 it would count 190 and slip through.
  const straddle = Array.from({ length: 250 }, (_, i) => ({ createdAt: new Date(Date.parse("2026-09-30T08:00:00Z") + i * 60_000) }));
  assert.equal(newlyTrackedFilter(straddle, now).length, 0);
});

// ─── Sets around today ──────────────────────────────────────────────────────────

test("setsAround: releasing in the next 45 days (soonest first) and out in the last 30 (newest first)", () => {
  const { soon, recent } = setsAround("2026-10-14");
  assert.deepEqual(soon.map((s) => s.code), ["me6"], "Delta Reign, 6 November 2026");
  assert.deepEqual(recent.map((s) => s.code), ["cel30"], "30th Celebration, 16 September 2026");
  const later = setsAround("2026-11-06");
  assert.deepEqual(later.soon.map((s) => s.code), []);
  assert.deepEqual(later.recent.map((s) => s.code), ["me6"], "release day counts as released");
  assert.ok(SETS.length > 10);
});

// ─── Copy ───────────────────────────────────────────────────────────────────────

const SAYS_NOW = /\btoday\b|\bchecked\b|\bright now\b/i;

test("deals, cheapest-packs, this-week and home copy: never a history, urgency or value claim; the deals and digest copy says 'today' or 'checked'", () => {
  const best = { p: card({ name: "Chaos Rising Booster Box", productType: "Booster Box", lowestPriceCents: 26995 }), packs: 36, perPack: 750, msrpPerPack: null };
  for (const r of REGION_LIST) {
    const lede = dealsCopy.lede(r);
    const packs = packsCopy.lede(r);
    const all: [string, string, boolean][] = [
      ["deals title", dealsCopy.title(r), false],
      ["deals h1", dealsCopy.h1(r), true],
      ["deals lede", `${lede.lead} 3 hours ago${lede.tail}`, true],
      ["deals description", dealsCopy.description(r, 48, 37), true],
      ["deals description (none)", dealsCopy.description(r, 0, null), true],
      ["deals summary", dealsCopy.summary(12, 22), false],
      ["deals empty", dealsCopy.empty(r), true],
      ["deals rail", dealsCopy.rail, true],
      ["deals rail kicker", dealsCopy.railKicker, false],
      ["packs title", packsCopy.title(r), true],
      ["packs h1", packsCopy.h1(r), false],
      ["packs lede", `${packs.lead} 3 hours ago${packs.tail}`, true],
      ["packs description", packsCopy.description(r, best), true],
      ["packs description (none)", packsCopy.description(r, null), true],
      ["packs answer", packsCopy.answer(r, best), true],
      ["packs method", packsCopy.method, false],
      ["digest title", digestCopy.title(r), false],
      ["digest h1", digestCopy.h1(r), false],
      ["digest intro", digestCopy.intro(r), true],
      ["digest description", digestCopy.description(r), true],
      ["digest new label", digestCopy.newLabel, false],
      ["home title", homeCopy.title(r, 68), false],
      ["home description", homeCopy.description(r, 68, 1591), true],
    ];
    for (const [what, text, now] of all) {
      assert.equal(findBannedCopy(text), null, `${r.region} ${what}: "${text}"`);
      assert.ok(!BANNED_COPY.test(text));
      if (now) assert.match(text, SAYS_NOW, `${r.region} ${what} says today or checked: "${text}"`);
      assert.doesNotMatch(text, /United States|\bin United Kingdom|Europe \(eurozone\)/, `${r.region} ${what} uses inName`);
    }
    assert.match(dealsCopy.title(r), /^Pokémon booster box & ETB deals in /);
    assert.match(dealsCopy.h1(r), new RegExp(`cheaper than most ${r.adjective} stores today$`));
    assert.equal(lede.tail.includes("TCGplayer"), r.region === "us", "the TCGplayer note is the US's alone");
    assert.match(digestCopy.description(r), /.{60,160}/);
    assert.ok(homeCopy.description(r, 68, 1591).length <= 175, homeCopy.description(r, 68, 1591));
  }
  assert.match(digestCopy.newLabel, /not necessarily new releases/);
  assert.match(packsCopy.method, /promos, sleeves and dice are not priced; shipping excluded/);
  assert.match(RRP_NOTE, /MSRP/);
});

test("fitTitle: the ' | DexCompare' template when the whole fits in 65 characters, else the title alone", () => {
  for (const r of REGION_LIST) {
    for (const t of [dealsCopy.title(r), packsCopy.title(r), digestCopy.title(r), homeCopy.title(r, 68)]) {
      const fit = fitTitle(t);
      const shown = typeof fit === "string" ? `${fit} | DexCompare` : fit.absolute;
      assert.ok(typeof fit === "string" ? shown.length <= 65 : t.length + 13 > 65, `${r.region}: ${shown}`);
      assert.match(shown, /Pokémon/);
    }
  }
  assert.equal(fitTitle("Pokémon booster box & ETB deals in the US"), "Pokémon booster box & ETB deals in the US");
  assert.deepEqual(fitTitle("Cheapest Pokémon booster packs in New Zealand — price per pack today"), {
    absolute: "Cheapest Pokémon booster packs in New Zealand — price per pack today",
  });
});

test("nearestRegion: Australia and New Zealand point at each other, the US at Canada, the rest at the US", () => {
  assert.equal(nearestRegion("au"), "nz");
  assert.equal(nearestRegion("nz"), "au");
  assert.equal(nearestRegion("us"), "ca");
  for (const r of ["uk", "ca", "eu", "sg"] as const) assert.equal(nearestRegion(r), "us");
});

// ─── The routes' sources: ISR, one strip each, capped reads ─────────────────────

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("the new routes are CDN-cached per-request renders with no static params, read no request state, and carry exactly one strip with their own placement", () => {
  const pages: [string, string][] = [
    ["app/[region]/deals/page.tsx", "listings-deals"],
    ["app/[region]/cheapest-packs/page.tsx", "listings-packs"],
    ["app/[region]/this-week/page.tsx", "listings-digest"],
  ];
  for (const [file, placement] of pages) {
    const s = src(file);
    // CDN-cached, not ISR (2026-10-17, tests/cache-ttl.test.ts): rendered per request, nothing prerendered.
    assert.match(s, /export const dynamic = "force-dynamic";/, file);
    assert.doesNotMatch(s, /generateStaticParams|export const revalidate/, file);
    assert.match(s, /regionOrNotFound\(params\.region\)/, file);
    assert.doesNotMatch(s, /searchParams|from "next\/headers"|cookies\(|headers\(|unstable_cache/, file);
    assert.equal((s.match(/<EbayStrip\b/g) ?? []).length, 1, `${file}: one strip`);
    assert.match(s, new RegExp(`<EbayStrip [^>]*context="sealed"[^>]*placement="${placement}"`), file);
  }
  assert.match(src("app/[region]/deals/page.tsx"), /tiles="deals"/, "the deals grid asks for its in-feed tiles");
  assert.match(src("app/[region]/cheapest-packs/page.tsx"), /RRP_NOTE/);
  assert.match(src("app/[region]/deals/page.tsx"), /RRP_NOTE/);
  const home = src("app/[region]/page.tsx");
  assert.match(home, /const getOverview = cache\(/, "regionOverview read once for the metadata and the page");
  assert.match(home, /<NoPreFooter \/>/);
  assert.match(home, /dealsInMarket\(r\.market, \{ take: 8 \}\)/);
});

test("deals.ts: tagged-template SQL only, every read capped or grouped, no unstable_cache", () => {
  const s = src("lib/deals.ts").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(s, /\$queryRawUnsafe|\$executeRaw|unstable_cache/);
  const reads = s.split("prisma.$queryRaw").slice(1);
  assert.equal(reads.length, 5, "dealsInMarket, perPackLeaders, belowMsrpUS, newlyTracked, productCountsBySets");
  // Each SQL read is the database half of routeRaw(files, sql) (src/lib/public-data/route.ts): the files answer by default.
  assert.equal((s.match(/routeRaw\(fromFiles, \(\) => prisma\.\$queryRaw/g) ?? []).length, 5, "every read also answers from the public data files");
  for (const r of reads) {
    const sql = r.slice(0, r.indexOf("`)") + 1);
    assert.match(sql, /^<[^>]+>`/, "a tagged template");
    assert.match(sql, /LIMIT \$\{|LIMIT 120|GROUP BY p\."setCode"|rn <= \$\{n\}/, sql.slice(0, 120));
    assert.match(sql, /market = \$\{market\}|market = 'US'/, "one market");
  }
});
