import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCollectionNarrative, collectionWordCount, type CollectionInput } from "../src/lib/content/collection-narrative";
import { setPriceGuideRows } from "../src/lib/set-price-guide";
import type { CardLite } from "../src/lib/data";

const member = (name: string, priceCents: number | null) => ({ name, priceCents });
const base: CollectionInput = {
  kind: "set", label: "Modern Horizons 3", currency: "USD", place: "the United States", siteMedianCents: 150,
  members: [member("Ugin's Labyrinth", 80000), member("Ajani, Nacatl Pariah", 2500), member("Sol Ring", 900), member("Counterspell", 300), member("Lightning Bolt", 80), member("Forest", 40), member("Black Lotus", null)],
};

test("a priced collection gets range, concentration, notable cards and buyer advice", () => {
  const p = buildCollectionNarrative(base);
  const text = p.join(" ");
  assert.ok(p.length >= 4);
  assert.match(text, /MTG Compare lists 7 cards/);
  assert.match(text, /6 of which have a live price/);
  assert.match(text, /heavily concentrated/);
  assert.match(text, /The cards to know: Ugin's Labyrinth at US\$800\.00/);
  assert.match(text, /Box EV calculator/);
  assert.ok(collectionWordCount(p) > 150);
  assert.doesNotMatch(text, /Riftbound|One Piece|Leader|champion|domain|Riot|NaN/);
});

test("an empty or unpriced collection says only what is true", () => {
  assert.match(buildCollectionNarrative({ ...base, members: [] })[0], /no card in the database yet/);
  const none = buildCollectionNarrative({ ...base, members: [member("A", null), member("B", null)] }).join(" ");
  assert.match(none, /none currently has a live listing/);
  assert.doesNotMatch(none, /median/);
  const zeros = buildCollectionNarrative({ ...base, members: [member("A", 0), member("B", 0), member("C", 0), member("D", 0)] }).join(" ");
  assert.doesNotMatch(zeros, /NaN/);
});

test("the same card is not named twice among the cards to know", () => {
  const text = buildCollectionNarrative({ ...base, members: [member("Sol Ring", 80000), member("Sol Ring", 70000), member("Counterspell", 2500), member("Lightning Bolt", 900)] }).join(" ");
  assert.equal((text.match(/Sol Ring at/g) ?? []).length, 1);
});

test("every kind has its own buyer advice", () => {
  for (const kind of ["character", "type", "rarity", "printing", "colour", "set", "keyword"] as const) {
    const t = buildCollectionNarrative({ ...base, kind, label: "X" }).join(" ");
    assert.ok(t.length > 200, kind);
  }
});

const q = (market: number | null) => (market == null ? null : { market, low: market });
const c = (id: number, name: string, number: string | null, us: number | null, o: Partial<CardLite> = {}): CardLite => ({
  id, slug: `c${id}`, name, alt: null, setId: 1, sc: "mh3", setCode: "MH3", number, rarity: "R", cls: 0, treat: [], label: null, flags: 0, oracleNo: null, scryId: null, colorMask: 0, mv: 0, ptype: 0,
  marketUsd: us, headFinish: "N", valueUsd: us, lowOnly: false, n: q(us), f: null, tracked: us ? 1 : 0, listed: true, top: false, thin: false,
  low: { US: us, AU: null, UK: null, SG: null, CA: null, EU: null }, stores: { US: us ? 2 : 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 }, change7d: null, change30d: null, high90Usd: null,
  colors: [], variant: null, printing: "standard", cost: null, cardType: null, hasImage: true, ...o,
});

test("set price guide rows: dearest first, unpriced last by number", () => {
  const rows = setPriceGuideRows([c(1, "A", "10", null), c(2, "B", "2", null), c(3, "C", "1", 500, { variant: "Borderless" }), c(4, "D", "3", 900)], "US");
  assert.deepEqual(rows.map((r) => r.id), [4, 3, 2, 1]);
  assert.equal(rows[1].name, "C (Borderless)");
});
