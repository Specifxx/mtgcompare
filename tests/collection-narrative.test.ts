import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCollectionNarrative, collectionWordCount, type CollectionInput } from "../src/lib/content/collection-narrative";
import { setPriceGuideRows } from "../src/lib/set-price-guide";
import type { CardLite } from "../src/lib/data";

const member = (name: string, priceCents: number | null) => ({ name, priceCents });
const base: CollectionInput = {
  kind: "set", label: "Romance Dawn", currency: "USD", place: "the United States", siteMedianCents: 150,
  members: [member("Shanks", 80000), member("Luffy", 2500), member("Zoro", 900), member("Nami", 300), member("Usopp", 80), member("Chopper", 40), member("Brook", null)],
};

test("a priced collection gets range, concentration, notable cards and buyer advice", () => {
  const p = buildCollectionNarrative(base);
  const text = p.join(" ");
  assert.ok(p.length >= 4);
  assert.match(text, /OP Compare tracks 7 cards/);
  assert.match(text, /6 of which have a live price/);
  assert.match(text, /heavily concentrated/);
  assert.match(text, /The cards to know: Shanks at US\$800\.00/);
  assert.match(text, /Box EV calculator/);
  assert.ok(collectionWordCount(p) > 150);
  assert.doesNotMatch(text, /Riftbound|champion|domain|Riot|NaN/);
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
  const text = buildCollectionNarrative({ ...base, members: [member("Shanks", 80000), member("Shanks", 70000), member("Luffy", 2500), member("Zoro", 900)] }).join(" ");
  assert.equal((text.match(/Shanks at/g) ?? []).length, 1);
});

test("every kind has its own buyer advice", () => {
  for (const kind of ["character", "type", "rarity", "printing", "colour", "set", "keyword"] as const) {
    const t = buildCollectionNarrative({ ...base, kind, label: "X" }).join(" ");
    assert.ok(t.length > 200, kind);
  }
});

const c = (id: number, name: string, number: string | null, us: number | null): CardLite => ({
  id, slug: `c${id}`, name, number, setId: 1, rarity: "R", variant: id === 3 ? "Parallel" : null, printing: "standard", colors: [], cardType: null, cost: null, power: null, counter: null, life: null, hasImage: true,
  marketUsd: us, low: { US: us, AU: null, UK: null, SG: null, CA: null, EU: null }, stores: { US: us ? 2 : 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 }, change7d: null, change30d: null, high90Usd: null,
});

test("set price guide rows: dearest first, unpriced last by number", () => {
  const rows = setPriceGuideRows([c(1, "A", "OP01-010", null), c(2, "B", "OP01-002", null), c(3, "C", "OP01-001", 500), c(4, "D", "OP01-003", 900)], "US");
  assert.deepEqual(rows.map((r) => r.id), [4, 3, 2, 1]);
  assert.equal(rows[1].name, "C (Parallel)");
});
