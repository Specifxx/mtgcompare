import { test } from "node:test";
import assert from "node:assert/strict";
import { cheaperAlternatives, priceToolChips, sameCharacter, sameNameCount } from "../src/lib/card-related";
import type { CardLite } from "../src/lib/data";

const c = (id: number, over: Partial<CardLite> = {}): CardLite => ({
  id, slug: `c${id}`, name: "X", number: `OP01-${String(id).padStart(3, "0")}`, setId: 1, rarity: "R", variant: null, printing: "standard", colors: ["Red"], cardType: "Character",
  cost: 1, power: 1000, counter: null, life: null, hasImage: true, marketUsd: 100, low: {} as never, stores: {} as never, change7d: null, change30d: null, high90Usd: null, ...over,
});

test("cheaper alternatives are strictly cheaper, same set, colour and type", () => {
  const me = c(1, { marketUsd: 500 });
  const out = cheaperAlternatives(me, [me, c(2, { marketUsd: 499 }), c(3, { marketUsd: 500 }), c(4, { marketUsd: 900 }), c(5, { marketUsd: 50, colors: ["Blue"] }), c(6, { marketUsd: 50, setId: 2 }), c(7, { marketUsd: 50, cardType: "Event" }), c(8, { marketUsd: 20 })]);
  assert.deepEqual(out.map((x) => x.id), [2, 8]);
});

test("an unpriced card has no cheaper alternatives", () => {
  assert.deepEqual(cheaperAlternatives(c(1, { marketUsd: null }), [c(2, { marketUsd: 1 })]), []);
});

test("same character: other numbers only, one tile per number, dearest first", () => {
  const me = c(1, { name: "Luffy", number: "OP01-001" });
  const out = sameCharacter(me, [me, c(2, { name: "Luffy", number: "OP02-001", marketUsd: 10 }), c(3, { name: "Luffy", number: "OP02-001", marketUsd: 900, variant: "Parallel" }), c(4, { name: "Luffy", number: "OP01-001", marketUsd: 5 }), c(5, { name: "Zoro", number: "OP01-025" })]);
  assert.deepEqual(out.map((x) => x.id), [3]);
  assert.equal(sameNameCount(me, [me, c(2, { name: "Luffy", number: "OP02-001" }), c(3, { name: "Luffy", number: "OP02-001" })]), 1);
});

test("tool chips only for routes that apply", () => {
  const chips = priceToolChips({ cardType: "Character", name: "X", setSlug: "op01", hasSealed: false, priced: false });
  assert.deepEqual(chips.map((x) => x.href), ["/deck", "/tools/box-ev"]);
  assert.ok(priceToolChips({ cardType: "Leader", name: "X", setSlug: "op01", hasSealed: true, priced: true }).some((x) => x.href === "/sealed?set=op01"));
});
