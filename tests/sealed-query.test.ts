import { test } from "node:test";
import assert from "node:assert/strict";
import { filterSealed, isSealedFiltered, parseSealedQuery, sealedFilterCount, sealedParams, sortSealed, type SealedCtx } from "../src/lib/sealed-query";
import type { SealedLite } from "../src/lib/data";

const S = (id: number, name: string, kind: string, setId: number | null, usLow: number | null, over: Partial<SealedLite> = {}): SealedLite => ({
  id, slug: `s${id}`, name, setId, kind, packCount: 24, imageUrl: null, releasedOn: null, presale: false, marketUsd: null,
  low: { US: usLow, AU: null, UK: null, SG: null, CA: null, EU: null }, stores: { US: usLow ? 2 : 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 }, change7d: null, tcgplayerUrl: "", ...over,
});
const ctx: SealedCtx = { country: "US", setSlugOf: (id) => (id === 1 ? "op01" : id === 2 ? "op02" : undefined), setReleased: (id) => (id === 1 ? "2022-12-02" : id === 2 ? "2023-03-10" : undefined) };
const rows = [S(1, "Romance Dawn Booster Box", "Booster Box", 1, 12000), S(2, "Paramount War Booster Box", "Booster Box", 2, 20000), S(3, "Starter Deck Straw Hat", "Starter Deck", 1, 1500), S(4, "Promo Pack Vol 1", "Promo Pack", null, 500), S(5, "Sold Out Case", "Booster Case", 2, null, { marketUsd: 90000 })];

test("parse: repeated and csv kinds and sets, bad numbers dropped, default sort", () => {
  const q = parseSealedQuery({ kind: ["Booster Box", "Starter Deck"], set: "op01,op02", min: "10", max: "5", sort: "weird", stock: "1", q: "  war " });
  assert.deepEqual(q.kinds, ["Booster Box", "Starter Deck"]);
  assert.deepEqual(q.sets, ["op01", "op02"]);
  assert.equal(q.min, 10);
  assert.equal(q.max, null); // max < min is dropped
  assert.equal(q.sort, "featured");
  assert.equal(q.q, "war");
  assert.equal(q.stock, true);
});

test("filters: text, price band in the visitor's currency, stock, kinds, sets, promo packs hidden by default", () => {
  const f = (sp: Record<string, string>) => filterSealed(rows, parseSealedQuery(sp), ctx).map((r) => r.id);
  assert.deepEqual(f({}), [1, 2, 3, 5]); // promo hidden
  assert.deepEqual(f({ promo: "1" }), [1, 2, 3, 4, 5]);
  assert.deepEqual(f({ kind: "Promo Pack" }), [4]);
  assert.deepEqual(f({ q: "war" }), [2]);
  assert.deepEqual(f({ min: "100", max: "150" }), [1]);
  assert.deepEqual(f({ stock: "1" }), [1, 2, 3]);
  assert.deepEqual(f({ set: "op02" }), [2, 5]);
  assert.deepEqual(f({ set: "op01", kind: "Starter Deck" }), [3]);
});

test("a market-less price falls back to TCGplayer's converted reference for the band", () => {
  assert.deepEqual(filterSealed(rows, parseSealedQuery({ min: "800" }), ctx).map((r) => r.id), [5]);
});

test("sorts: price both ways (unpriced last / first), name, newest, featured by kind then recency", () => {
  const ids = (sort: string) => sortSealed(filterSealed(rows, parseSealedQuery({}), ctx), parseSealedQuery({ sort }).sort, ctx).map((r) => r.id);
  assert.deepEqual(ids("price-asc"), [3, 1, 2, 5]);
  assert.deepEqual(ids("price-desc"), [5, 2, 1, 3]);
  assert.deepEqual(ids("name"), [1, 2, 5, 3].sort((a, b) => rows[a - 1].name.localeCompare(rows[b - 1].name)));
  assert.deepEqual(ids("newest")[0], 2);
  assert.deepEqual(ids("featured"), [2, 1, 5, 3]); // boxes (newest first), case, deck
});

test("filtered flag, count and URL round trip", () => {
  assert.equal(isSealedFiltered(parseSealedQuery({ sort: "name" })), false);
  assert.equal(isSealedFiltered(parseSealedQuery({ stock: "1" })), true);
  const q = parseSealedQuery({ q: "box", min: "5", max: "50", kind: ["Booster Box"], set: "op01,op02", stock: "1", sort: "price-asc" });
  assert.equal(sealedFilterCount(q), 1 + 1 + 1 + 1 + 2);
  assert.deepEqual(parseSealedQuery(Object.fromEntries(sealedParams(q).entries())), { ...q, kinds: q.kinds }); // single kind survives the round trip
});
