import { test } from "node:test";
import assert from "node:assert/strict";
import { filterSealed, isSealedFiltered, parseSealedQuery, sealedFilterCount, sealedParams, sortSealed, type SealedCtx } from "../src/lib/sealed-query";
import type { SealedLite } from "../src/lib/data";
import type { SealedKind } from "../src/lib/constants";

// Real Modern Horizons 3 sealed products (TCGplayer ids and USD cents, TCGCSV group 23444, 2026-10-07).
const S = (id: number, name: string, kind: SealedKind, setId: number | null, usLow: number | null, over: Partial<SealedLite> = {}): SealedLite => ({
  id, slug: `s${id}`, name, setId, kind, packCount: null, releasedOn: null, presale: false, marketUsd: null, lowTcg: null,
  low: { US: usLow, AU: null, UK: null, SG: null, CA: null, EU: null }, stores: { US: usLow ? 2 : 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 }, change7d: null, ...over,
});
const ctx: SealedCtx = { country: "US", setSlugOf: (id) => (id === 1 ? "mh3" : id === 2 ? "otj" : undefined), setReleased: (id) => (id === 1 ? "2024-06-14" : id === 2 ? "2024-04-19" : undefined) };
const rows = [
  S(541164, "Modern Horizons 3 - Play Booster Display", "Booster Box", 1, 29899, { packCount: 36, marketUsd: 30393 }),
  S(541179, "Modern Horizons 3 - Collector Booster Display", "Booster Box", 1, 89498, { packCount: 12, marketUsd: 89882 }),
  S(541185, "Modern Horizons 3 - Bundle", "Bundle", 1, 13398, { marketUsd: 12908 }),
  S(541166, "Modern Horizons 3 - Play Booster Display Case", "Case", 1, null, { marketUsd: 167503 }),
  S(900001, "Secret Lair Drop Series: Example", "Secret Lair Drop", null, 5000),
  S(541159, "Modern Horizons 3 - Prerelease Pack", "Prerelease Pack", 2, 7090, { marketUsd: 7194 }),
];

test("parse: repeated and csv kinds and sets, bad numbers dropped, default sort", () => {
  const q = parseSealedQuery({ kind: ["Booster Box", "Bundle"], set: "mh3,otj", min: "10", max: "5", sort: "weird", stock: "1", q: "  play " });
  assert.deepEqual(q.kinds, ["Booster Box", "Bundle"]);
  assert.deepEqual(q.sets, ["mh3", "otj"]);
  assert.equal(q.min, 10);
  assert.equal(q.max, null); // max < min is dropped
  assert.equal(q.sort, "featured");
  assert.equal(q.q, "play");
  assert.equal(q.stock, true);
});

test("filters: text, price band in the visitor's currency, stock, kinds, sets, Secret Lair drops hidden by default", () => {
  const f = (sp: Record<string, string>) => filterSealed(rows, parseSealedQuery(sp), ctx).map((r) => r.id);
  assert.deepEqual(f({}), [541164, 541179, 541185, 541166, 541159]); // the drop is hidden
  assert.deepEqual(f({ lair: "1" }).length, 6);
  assert.deepEqual(f({ kind: "Secret Lair Drop" }), [900001]);
  assert.deepEqual(f({ q: "collector" }), [541179]);
  assert.deepEqual(f({ min: "250", max: "400" }), [541164]);
  assert.deepEqual(f({ stock: "1" }), [541164, 541179, 541185, 541159]);
  assert.deepEqual(f({ set: "otj" }), [541159]);
  assert.deepEqual(f({ set: "mh3", kind: "Bundle" }), [541185]);
});

test("a market-less price falls back to TCGplayer's converted reference for the band", () => {
  assert.deepEqual(filterSealed(rows, parseSealedQuery({ min: "1500" }), ctx).map((r) => r.id), [541179, 541166]);
});

test("sorts: price both ways (unpriced last / first), name, newest, featured by kind then recency", () => {
  const ids = (sort: string) => sortSealed(filterSealed(rows, parseSealedQuery({}), ctx), parseSealedQuery({ sort }).sort, ctx).map((r) => r.id);
  assert.deepEqual(ids("price-asc"), [541159, 541185, 541164, 541179, 541166]);
  assert.deepEqual(ids("price-desc"), [541166, 541179, 541164, 541185, 541159]);
  assert.deepEqual(ids("name")[0], 541185, "Bundle sorts before Collector and Play");
  assert.deepEqual(ids("newest")[0], 541164, "the set released 2024-06-14 beats the one from April");
  assert.deepEqual(ids("featured"), [541164, 541179, 541166, 541185, 541159]); // boxes (newest first), case, bundle, prerelease pack
});

test("filtered flag, count and URL round trip", () => {
  assert.equal(isSealedFiltered(parseSealedQuery({ sort: "name" })), false);
  assert.equal(isSealedFiltered(parseSealedQuery({ stock: "1" })), true);
  assert.equal(isSealedFiltered(parseSealedQuery({ lair: "1" })), true);
  const q = parseSealedQuery({ q: "box", min: "5", max: "50", kind: ["Booster Box"], set: "mh3,otj", stock: "1", sort: "price-asc" });
  assert.equal(sealedFilterCount(q), 1 + 1 + 1 + 1 + 2);
  assert.deepEqual(parseSealedQuery(Object.fromEntries(sealedParams(q).entries())), { ...q, kinds: q.kinds }); // single kind survives the round trip
});
