import { test } from "node:test";
import assert from "node:assert/strict";
import { cheaperAlternatives, priceToolChips, sameCharacter, sameNameCount } from "../src/lib/card-related";
import type { CardLite } from "../src/lib/data";

const c = (id: number, over: Partial<CardLite> = {}): CardLite =>
  ({
    id, slug: `c${id}`, name: "Lightning Bolt", number: String(id), setId: 1, rarity: "U", variant: null, printing: "standard", colors: ["Red"], cardType: "Instant",
    cost: 1, hasImage: true, marketUsd: 100, ...over,
  }) as unknown as CardLite;

test("cheaper alternatives are strictly cheaper, same set, colour and type", () => {
  const me = c(1, { marketUsd: 500 });
  const out = cheaperAlternatives(me, [me, c(2, { marketUsd: 499 }), c(3, { marketUsd: 500 }), c(4, { marketUsd: 900 }), c(5, { marketUsd: 50, colors: ["Blue"] }), c(6, { marketUsd: 50, setId: 2 }), c(7, { marketUsd: 50, cardType: "Sorcery" }), c(8, { marketUsd: 20 })]);
  assert.deepEqual(out.map((x) => x.id), [2, 8]);
});

test("an unpriced card has no cheaper alternatives", () => {
  assert.deepEqual(cheaperAlternatives(c(1, { marketUsd: null }), [c(2, { marketUsd: 1 })]), []);
});

test("same card elsewhere: other sets only, one tile per set, dearest first", () => {
  const me = c(1, { name: "Sol Ring", setId: 1 });
  const out = sameCharacter(me, [me, c(2, { name: "Sol Ring", setId: 2, marketUsd: 10 }), c(3, { name: "Sol Ring", setId: 2, marketUsd: 900, variant: "Borderless" }), c(4, { name: "Sol Ring", setId: 1, marketUsd: 5 }), c(5, { name: "Counterspell", setId: 3 })]);
  assert.deepEqual(out.map((x) => x.id), [3]);
  assert.equal(sameNameCount(me, [me, c(2, { name: "Sol Ring", setId: 2 }), c(3, { name: "Sol Ring", setId: 2 }), c(4, { name: "Sol Ring", setId: 3 })]), 2);
});

test("tool chips only for routes that apply", () => {
  const chips = priceToolChips({ cardType: "Instant", name: "Counterspell", setSlug: "mh2", hasSealed: false, priced: false });
  assert.deepEqual(chips.map((x) => x.href), ["/deck", "/tools/box-ev"]);
  assert.ok(priceToolChips({ cardType: "Instant", name: "Counterspell", setSlug: "mh2", hasSealed: true, priced: true }).some((x) => x.href === "/sealed?set=mh2"));
});
