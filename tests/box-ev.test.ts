import { test } from "node:test";
import assert from "node:assert/strict";
import { BOX_ODDS } from "../src/content/box-odds";
import type { CardRow } from "../src/lib/cards";
import { boxEv, cardChances, histogram, notCounted, packEv, pickCards, quantile, resolveBooster, rng, shareAtLeast, simulate, slotEvs } from "../src/lib/box-ev/model";
import { resolveSetBoxes } from "../src/lib/box-ev/load";
import { asBooster, boxOdds } from "../src/lib/box-ev/shared";
import { boxView, pullName } from "../src/lib/box-ev/view";
import { cheapestBox } from "../src/lib/box-ev/page-data";
import type { BoosterOdds } from "../src/lib/box-ev/types";
import type { ProductCardData } from "../src/lib/data";

const card = (no: string, r: string, n: string, p: [number | null, number | null, number | null]): CardRow => ({ id: Number(no.replace(/\D/g, "")) || 1, s: n.toLowerCase().replace(/\W+/g, "-"), n, no, r, p, ix: 0, since: "2026-11-26" });

// A toy set: 2 commons (10c, 30c), 2 rares ($1, $3), 1 mythic ($20, foil $40), one borderless rare at #50 ($10).
const TOY: CardRow[] = [
  card("1", "C", "Goblin", [10, 20, null]),
  card("2", "C", "Elf", [30, 50, null]),
  card("3", "R", "Dragon", [100, 150, null]),
  card("4", "R", "Angel", [300, 400, null]),
  card("5", "M", "Titan", [2000, 4000, null]),
  card("50", "R", "Angel (Borderless)", [1000, 1500, null]),
  card("51", "R", "Unpriced Thing (Borderless)", [null, null, null]),
];
const TOY_ODDS: BoosterOdds = {
  packs: 10,
  slots: [
    { label: "Commons", count: 3, outcomes: [{ label: "Common", pct: 100, pool: true, pick: { r: "C", t: "" } }] },
    {
      label: "Rare",
      count: 1,
      outcomes: [
        { label: "Rare", pct: 80, pick: { r: "R", t: "", n: ["1-49"] } },
        { label: "Mythic", pct: 10, pick: { r: "M", t: "" } },
        { label: "Borderless rare", pct: 9, pick: { r: "R", t: "(Borderless)" } },
        { label: "Borderless mythic", pct: 0, lt1: true, pick: { r: "M", t: "(Borderless)" } },
        { label: "Mystery sheet", pct: 1, pick: null },
      ],
    },
  ],
};
const group = (g: string) => (g === "toy" ? TOY : []);
const toy = resolveBooster(TOY_ODDS, "toy", group);

test("picks match on rarity, exact treatment tags and collector numbers; foil outcomes take the foil price", () => {
  assert.deepEqual(pickCards({ r: "R", t: "" }, "toy", group).map((c) => c.n), ["Dragon", "Angel"]);
  assert.deepEqual(pickCards({ r: "R", t: "(Borderless)" }, "toy", group).map((c) => c.v), [1000, null], "an unpriced card stays, with no price");
  assert.deepEqual(pickCards({ r: "M", t: "", foil: true }, "toy", group).map((c) => c.v), [4000]);
  assert.deepEqual(pickCards({ r: "R", t: ["", "(Borderless)"], n: ["4", "50-50"] }, "toy", group).map((c) => c.n), ["Angel", "Angel (Borderless)"]);
  assert.deepEqual(pickCards({ r: "C", t: "", not: "^elf" }, "toy", group).map((c) => c.n), ["Goblin"]);
});

test("the average: published odds × the mean price of each line's priced cards; less-than-1% and unmatched lines count zero", () => {
  // Commons: 3 × 20c. Rare slot: 0.8 × 200 + 0.1 × 2000 + 0.09 × 1000 (the unpriced borderless card is out of the mean) = 450.
  assert.equal(Math.round(packEv(toy)), 60 + 450);
  assert.equal(Math.round(boxEv(toy)), 5100);
  // A $1 floor: commons are worth nothing; the $1 rare still counts.
  assert.equal(Math.round(packEv(toy, 100)), 450);
  // A $5 floor: only the mythic and the borderless rare.
  assert.equal(Math.round(packEv(toy, 500)), 200 + 90);
  const nc = notCounted(toy);
  assert.deepEqual(nc.map((n) => [n.label, n.why]), [["Borderless mythic", "lt1"], ["Mystery sheet", "unmatched"]]);
  assert.deepEqual(slotEvs(toy).map((s) => Math.round(s.box)), [600, 4500]);
});

test("the simulation agrees with the average, is repeatable, and the helpers read it right", () => {
  const a = simulate(toy, 4000, 7);
  const b = simulate(toy, 4000, 7);
  assert.deepEqual(a, b, "same seed, same boxes (the server's HTML and the browser agree)");
  const mean = a.reduce((t, x) => t + x, 0) / a.length;
  assert.ok(Math.abs(mean - boxEv(toy)) / boxEv(toy) < 0.03, `simulated mean ${mean} vs ${boxEv(toy)}`);
  assert.ok(a.every((x, i) => i === 0 || a[i - 1] <= x), "sorted");
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(shareAtLeast([1, 2, 3, 4], 3), 0.5);
  assert.equal(shareAtLeast([1, 2, 3, 4], 10), 0);
  const h = histogram(a, 10);
  assert.equal(h.length, 10);
  assert.equal(h.reduce((t, x) => t + x.n, 0), a.length, "every box lands in a bin");
  const r = rng(1);
  const xs = Array.from({ length: 1000 }, r);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test("card chances: expected copies per box and the chance of at least one", () => {
  const titan = cardChances(toy).find((c) => c.n === "Titan")!;
  assert.equal(titan.perBox, 1); // 10% a pack × 10 packs
  assert.ok(Math.abs(titan.inBox - (1 - Math.exp(-1))) < 1e-9);
  assert.equal(cardChances(toy).some((c) => c.n.startsWith("Unpriced")), false, "no price, no pull");
  assert.equal(boxOdds(0.05), "1 in 20 boxes");
  assert.equal(boxOdds(0.5), "in about half of boxes");
  assert.equal(boxOdds(0.9), "in most boxes");
});

test("the browser's copy (prices only) gives the same sums as the server's", () => {
  const v = boxView("play", toy);
  const back = asBooster(v);
  assert.equal(boxEv(back), boxEv(toy));
  assert.equal(boxEv(back, 100), boxEv(toy, 100));
  assert.deepEqual(simulate(back, 500, 3), simulate(toy, 500, 3));
  assert.equal(v.pulls[0].name, "Titan");
  assert.equal(pullName("Ancient Tomb (0001) (Borderless)"), "Ancient Tomb (Borderless)");
  assert.equal(pullName("Forest (0276)"), "Forest (0276)");
});

test("the box price is the cheapest BUYABLE box of that kind", () => {
  const p = (slug: string, productType: string, cents: number, stores: number): ProductCardData => ({ slug, name: slug, productType, setCode: "eoe", imageUrl: null, lowestPriceCents: cents, inStockStores: stores, listedStores: stores, marketplaceOpen: false, medianOpenCents: null, releaseDate: null });
  const list = [p("a", "Play Booster Box", 15000, 3), p("b", "Play Booster Box", 12000, 0), p("c", "Collector Booster Box", 30000, 1), p("d", "Play Booster Box", 14000, 1)];
  assert.equal(cheapestBox(list, "play")?.slug, "d", "the sold-out cheaper box is not a price");
  assert.equal(cheapestBox(list, "collector")?.slug, "c");
  assert.equal(cheapestBox([], "play"), null);
});

// ─── The published odds themselves ─────────────────────────────────────────────────────────────────────────────────────────

for (const odds of BOX_ODDS) {
  test(`${odds.code}: copied from Wizards' Collecting article; every slot adds up`, () => {
    assert.match(odds.source, /^https:\/\/magic\.wizards\.com\/en\/news\/feature\/collecting-/);
    assert.match(odds.read, /^\d{4}-\d{2}-\d{2}$/);
    for (const [kind, b] of Object.entries({ play: odds.play, collector: odds.collector })) {
      if (!b) continue;
      assert.ok(b.packs === (kind === "play" ? 30 : 12), `${kind} packs`);
      const cards = b.slots.reduce((t, s) => t + s.count, 0);
      assert.equal(cards, kind === "play" ? 14 : 15, `${kind}: a booster's Magic cards (the token and art card are not cards)`);
      for (const s of b.slots) {
        const sum = s.outcomes.reduce((t, o) => t + o.pct, 0);
        const lt1 = s.outcomes.filter((o) => o.lt1).length;
        // Wizards rounds ("may not sum to 100"); each "less than 1%" line is printed without a number.
        assert.ok(sum <= 100.6 && sum >= 100 - lt1 - 2.5 - (s.unprinted ?? 0), `${kind} / ${s.label}: printed odds sum to ${sum}`);
        for (const o of s.outcomes) {
          if (o.lt1) assert.equal(o.pct, 0, `${s.label} / ${o.label}: "less than 1%" is counted as zero`);
          if (o.pool) assert.ok(o.pick, `${s.label} / ${o.label}: a pool names its cards`);
        }
      }
    }
  });

  test(`${odds.code}: every outcome finds its cards in TCGplayer's list, in the numbers Wizards prints`, () => {
    const r = resolveSetBoxes(odds);
    assert.ok(r, "the set's card file is committed");
    for (const [kind, b] of Object.entries(r.boxes)) {
      const src = kind === "play" ? odds.play! : odds.collector!;
      b!.slots.forEach((s, i) =>
        s.outcomes.forEach((o, j) => {
          const want = src.slots[i].outcomes[j];
          if (!want.pick) return;
          assert.ok(o.cards.length > 0, `${kind} / ${s.label} / ${o.label}: no card matched`);
          if (want.count != null) assert.equal(o.cards.length, want.count, `${kind} / ${s.label} / ${o.label}: Wizards prints ${want.count}`);
          // Nearly every card has a TCGplayer price; a line half unpriced means the pick (or the finish) is wrong.
          if (!o.lt1) assert.ok(o.cards.filter((c) => c.v != null).length >= o.cards.length / 2, `${kind} / ${s.label} / ${o.label}: mostly unpriced`);
        }),
      );
      assert.ok(boxEv(b!) > 0);
    }
  });
}
