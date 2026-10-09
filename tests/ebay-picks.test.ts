import { test } from "node:test";
import assert from "node:assert/strict";
import { pickVisible, tileId, type ChaseArt, type ChaseLive } from "../src/lib/listing-panel";
import { isChasePrinting } from "../src/lib/constants";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const art = (id: number, name: string, setCode: string, usd: number): ChaseArt => ({ id, slug: `c${id}`, name, setCode, label: null, finish: "N", marketCents: usd * 100, imageUrl: null });
const live = (id: number, name: string, setCode: string, usd: number, market: ChaseLive["market"] = "US", imageUrl = "https://i.ebayimg.com/images/g/abc/s-l500.jpg"): ChaseLive => ({
  id, name, label: null, setCode, finish: "N", market, priceCents: usd * 100, currency: "USD", freeShipping: true, itemId: `v1|${id}|0`, imageUrl, checkedAt: new Date(NOW - 3_600_000).toISOString(), marketCents: usd * 100,
});

const pool = [
  art(1, "The One Ring", "ltr", 120),
  art(2, "Black Lotus", "lea", 9000),
  art(3, "Sol Ring", "ltr", 4),
  art(4, "Mox Opal", "mbs", 60),
];

test("the server render (no clock) shows art tiles only, in pool order", () => {
  const out = pickVisible(pool, [live(1, "The One Ring", "ltr", 119)], "US", null, 3);
  assert.ok(out.every((t) => t.kind === "art"));
  assert.deepEqual(out.map(tileId), [1, 2, 4]); // Sol Ring shares the set with The One Ring: pushed behind the diverse places
});

test("a fresh live listing of the visitor's market replaces its art tile, dearest first", () => {
  const out = pickVisible(pool, [live(1, "The One Ring", "ltr", 119), live(2, "Black Lotus", "lea", 8800, "AU")], "US", NOW, 4);
  assert.equal(out[0].kind, "live");
  assert.equal(tileId(out[0]), 1);
  assert.equal(out.filter((t) => t.kind === "live").length, 1, "the AU listing never shows to a US visitor");
  assert.ok(out.some((t) => t.kind === "art" && t.art.id === 2));
});

test("a live entry with a foreign image host or a stale check never shows", () => {
  const stale = { ...live(1, "The One Ring", "ltr", 119), checkedAt: new Date(NOW - 80 * 3_600_000).toISOString() };
  const bad = live(4, "Mox Opal", "mbs", 59, "US", "https://example.com/x.jpg");
  const out = pickVisible(pool, [stale, bad], "US", NOW, 4);
  assert.ok(out.every((t) => t.kind === "art"));
});

test("a plain printing is not a chase printing", () => {
  assert.equal(isChasePrinting({ treat: [], flags: 0 }), false);
});
