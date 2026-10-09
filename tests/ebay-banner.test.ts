// The chase-strip payload (src/lib/ebay-banner.ts, loaded by getChaseBanner in src/lib/data/ebay.ts): ONE row, live listings only, at most 100 KB, merged run after run from COMPLETED searches.
// Products are real catalogue ids (tests/fixtures/titles/rows.json): The One Ring (LTR) 487805, Sol Ring (Alpha) 1263, Counterspell (Tempest) 5503, Lightning Bolt (Double Masters 2022) 276484.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BANNER_KEEP_HOURS, BANNER_MAX_BYTES, displayable, emptyPayload, freshnessByMarket, mergeBanner, parsePayload, payloadBytes, tileKey, tileOf, trimToBudget,
} from "../src/lib/ebay-banner";
import { bundleOf, parseBannerRow, type BannerTile } from "../src/lib/data/ebay";

const NOW = Date.parse("2026-10-08T23:40:00Z");
const ago = (h: number) => new Date(NOW - h * 3_600_000);
const IMG = (n: number) => `https://i.ebayimg.com/images/g/abc${n}/s-l225.jpg`;
const tile = (id: number, name: string, market: BannerTile["market"], cents: number, hours: number, usd = cents * 2, finish: "N" | "F" = "N"): BannerTile =>
  tileOf({ id, name, finish, market, priceCents: cents, shipCents: 0, itemId: `${300000000000 + id}`, imageUrl: IMG(id), checkedAt: ago(hours), setCode: "LTR", label: null, marketCents: usd })!;
const RING = tile(487805, "The One Ring", "US", 95_000, 2, 175_306, "F");
const SOL = tile(1263, "Sol Ring", "US", 82_500, 3, 86_999);
const COUNTER = tile(5503, "Counterspell", "UK", 41_000, 5, 91_992);

test("a tile needs an eBay-hosted https image, a positive price and an item id; postage is true, false or unknown", () => {
  const base = { id: 276484, name: "Lightning Bolt", finish: "F" as const, market: "AU" as const, priceCents: 4999, shipCents: 0, itemId: "296000000001", imageUrl: IMG(1), checkedAt: ago(1), setCode: "2X2", label: "Foil", marketCents: 5200 };
  const t = tileOf(base)!;
  assert.deepEqual([t.ship, t.finish, t.sc, t.usd, t.market, t.image], [true, "F", "2x2", 5200, "AU", IMG(1)]);
  assert.equal(tileOf({ ...base, shipCents: 350 })!.ship, false);
  assert.equal(tileOf({ ...base, shipCents: null })!.ship, null, "postage not stated is not 'free'");
  assert.equal(tileOf({ ...base, imageUrl: "http://i.ebayimg.com/a.jpg" }), null);
  assert.equal(tileOf({ ...base, imageUrl: "https://evil.example/a.jpg" }), null);
  assert.equal(tileOf({ ...base, imageUrl: null }), null);
  assert.equal(tileOf({ ...base, priceCents: 0 }), null);
  assert.equal(tileOf({ ...base, itemId: "" }), null);
  assert.ok(!JSON.stringify(t).includes("seller"), "no seller identity is ever stored");
  assert.ok(!/https?:\/\/www\./.test(JSON.stringify(t)), "no listing URL is stored: the item id rebuilds it with the current campaign");
});

test("merge: a fresh listing replaces the old, a cleared one is removed, the rest stays while it is under 36 hours old", () => {
  const prev = mergeBanner(null, { fresh: [RING, SOL, COUNTER], cleared: [], poolIds: new Set([487805, 1263, 5503]) }, NOW - 6 * 3_600_000);
  assert.equal(prev.tiles.length, 3);
  const cheaperRing = tile(487805, "The One Ring", "US", 90_000, 0, 175_306, "F");
  const next = mergeBanner(prev, { fresh: [cheaperRing], cleared: [{ id: 1263, market: "US" }], poolIds: new Set([487805, 1263, 5503]) }, NOW);
  assert.deepEqual(next.tiles.map((t) => [t.id, t.market, t.cents]), [[487805, "US", 90_000], [5503, "UK", 41_000]]);
  assert.equal(next.builtAt, Math.floor(NOW / 1000));
  assert.equal(next.v, 1);
});
test("merge: a tile older than the keep window, or of a printing that left the pool, is dropped", () => {
  const old = tile(5503, "Counterspell", "UK", 41_000, BANNER_KEEP_HOURS + 1, 91_992);
  const prev = { v: 1 as const, builtAt: 0, tiles: [RING, SOL, old] };
  const next = mergeBanner(prev, { fresh: [], cleared: [], poolIds: new Set([487805, 5503]) }, NOW);
  assert.deepEqual(next.tiles.map((t) => t.id), [487805], "Sol Ring left the pool, Counterspell is 37 hours old");
  assert.deepEqual(mergeBanner(null, { fresh: [tile(1, "Not in the pool", "US", 100, 0)], cleared: [], poolIds: new Set() }, NOW).tiles, []);
});
test("merge: a cleared market does not clear the same printing's other markets; the order is dearest market value first", () => {
  const ringUk = tile(487805, "The One Ring", "UK", 80_000, 1, 175_306, "F");
  const prev = mergeBanner(null, { fresh: [SOL, RING, ringUk], cleared: [], poolIds: new Set([487805, 1263]) }, NOW - 3_600_000);
  const next = mergeBanner(prev, { fresh: [], cleared: [{ id: 487805, market: "UK" }], poolIds: new Set([487805, 1263]) }, NOW);
  assert.deepEqual(next.tiles.map((t) => `${t.id}|${t.market}`), ["487805|US", "1263|US"]);
  assert.equal(tileKey(RING), "487805|F|US");
});

test("the payload is asserted at most 100 KB: the dearest tiles survive a trim", () => {
  const tiles = Array.from({ length: 900 }, (_, i) => tile(1000 + i, `Chase card number ${i} with a longer than usual name to fill bytes`, (["US", "UK", "AU", "EU", "CA"] as const)[i % 5]!, 5000 + i, 1, 100_000 - i));
  const full = { v: 1 as const, builtAt: 1, tiles };
  assert.ok(payloadBytes(full) > BANNER_MAX_BYTES, "the fixture is over the budget");
  const t = trimToBudget(full);
  assert.ok(payloadBytes(t) <= BANNER_MAX_BYTES);
  assert.ok(t.tiles.length > 100);
  assert.deepEqual(t.tiles.map((x) => x.id), tiles.slice(0, t.tiles.length).map((x) => x.id), "the head (dearest) is kept");
  assert.equal(trimToBudget(emptyPayload(NOW)).tiles.length, 0);
  // a realistic payload: 64 pool printings in four markets
  const real = mergeBanner(null, { fresh: tiles.slice(0, 256), cleared: [], poolIds: new Set(tiles.map((x) => x.id)) }, NOW);
  assert.ok(payloadBytes(real) < BANNER_MAX_BYTES, `${payloadBytes(real)} bytes for 256 tiles`);
});

test("reading is defensive: a malformed row is null, a malformed tile is dropped, never thrown on", () => {
  const good = { v: 1, builtAt: 5, tiles: [RING, { ...SOL, market: "XX" }, { ...COUNTER, image: "https://evil.example/x.jpg" }, { ...COUNTER, cents: -4 }, { nope: true }, { ...COUNTER, checkedAt: "yesterday" }, { ...SOL, ship: "yes" }] };
  for (const parse of [parsePayload, parseBannerRow]) {
    const p = parse(good)!;
    assert.deepEqual(p.tiles.map((t) => [t.id, t.ship]), [[487805, true], [1263, null]], parse.name);
    assert.equal(parse(null), null);
    assert.equal(parse({ v: 2, builtAt: 1, tiles: [] }), null);
    assert.equal(parse({ v: 1, tiles: [] }), null);
    assert.equal(parse("x"), null);
  }
});

test("freshness per market and what the display still shows (24 h tile cap)", () => {
  const p = { v: 1 as const, builtAt: 0, tiles: [RING, SOL, COUNTER, tile(276484, "Lightning Bolt", "AU", 4999, 30, 5200)] };
  const f = freshnessByMarket(p, NOW);
  assert.deepEqual(f.US, { tiles: 2, oldestHours: 3 });
  assert.deepEqual(f.UK, { tiles: 1, oldestHours: 5 });
  assert.deepEqual(f.AU, { tiles: 1, oldestHours: 30 });
  assert.deepEqual(f.EU, { tiles: 0, oldestHours: null });
  assert.deepEqual(freshnessByMarket(null, NOW).US, { tiles: 0, oldestHours: null });
  assert.deepEqual(displayable(p, NOW).map((t) => t.market), ["US", "US", "UK"], "the 30-hour AU tile is past the cap");
});

test("the panel bundle: rows of every market, stale rows dropped, malformed entries skipped, image hosts checked", () => {
  const rows = bundleOf(
    [
      { finish: 1, market: 0, priceCents: 90_000, shipCents: 0, itemId: "300000487805", checkedAt: ago(10) },
      { finish: 0, market: 2, priceCents: 40_000, shipCents: null, itemId: "300000005503", checkedAt: ago(60) },
    ],
    [
      {
        market: 0, checkedAt: ago(10),
        listings: [
          { finish: 1, priceCents: 90_000, shipCents: 0, currency: "USD", itemId: "300000487805", title: "The One Ring LTR Foil", image: IMG(1), rank: 0 },
          { finish: 0, priceCents: 0, currency: "USD", itemId: "x", title: "free?", image: IMG(2), rank: 1 },
          { finish: 0, priceCents: 70_000, shipCents: 500, currency: "USD", itemId: "300000487806", title: "The One Ring Lord of the Rings", image: "https://evil.example/a.jpg", rank: 2 },
        ],
        graded: [{ grader: "PSA", grade: "10", priceCents: 400_000, shipCents: null, currency: "USD", itemId: "300000999", title: "The One Ring PSA 10", image: IMG(3) }, { grader: "", priceCents: 1, currency: "USD", itemId: "z" }],
      },
      { market: 2, checkedAt: ago(60), listings: [{ finish: 0, priceCents: 40_000, currency: "GBP", itemId: "300000005503", title: "Counterspell", image: IMG(4), rank: 0 }], graded: [] },
    ],
    NOW,
  );
  assert.deepEqual(rows.best.map((b) => [b.market, b.finish]), [["US", "F"]], "the 60-hour row is past the 48-hour display cap");
  assert.deepEqual(rows.listings.map((l) => [l.market, l.finish, l.itemId, l.imageUrl === null]), [["US", "F", "300000487805", false], ["US", "N", "300000487806", true]]);
  assert.deepEqual(rows.graded.map((g) => [g.grader, g.grade, g.market]), [["PSA", "10", "US"]]);
  assert.deepEqual(bundleOf([], [], NOW), { best: [], listings: [], graded: [] });
});
