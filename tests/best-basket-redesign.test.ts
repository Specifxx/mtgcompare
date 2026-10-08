import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { basketPreview, optimizeBasket, planBasket, singleStartCount, type BasketCard, type BasketStore, type BasketStores } from "../src/lib/basket";
import type { PostageCart, PostageQuote } from "../src/lib/shipping";
import { clampQty, parseBasketRequest } from "../src/lib/basket-request";
import { rateLimit, refundRateLimit } from "../src/lib/rate-limit";
import { BASKET_COLLECTION_SOURCES } from "../src/lib/basket-request";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// Best Basket, rebuilt 2026-09-25. The optimiser tests are BEHAVIOURAL: they
// replace the regex-on-source tests that pinned the old greedy + single-card
// hill-climb (and its UI wiring), which is what let three wrong answers ship:
// $14.00 for a list one store sells for $9.40, six orders where one was
// cheaper, and $400 for a list one store sells for $105.
// ─────────────────────────────────────────────────────────────────────────────

const L = (retailer: string, priceCents: number, condition: string | null = null) => ({
  retailer,
  priceCents,
  url: `https://${retailer}.example/p`,
  condition,
});
const card = (id: string, qty: number, listings: ReturnType<typeof L>[]): BasketCard => ({ cardId: id, name: id, slug: null, qty, listings });
// A store as lib/shipping.ts quotes a measured flat-rate one: one rate per
// ORDER whatever its size, free from a measured threshold (0 = never), and —
// as shippingFor does — that threshold reported as freeFromCents while the
// order is below it. These tests were written for the flat {shippingFlatCents,
// freeOverCents} model that postage functions replaced (2026-09-25); this
// function behaves exactly as that model did, so every total below still holds.
const flat =
  (cents: number, freeOverCents = 0) =>
  (cart: PostageCart): PostageQuote => {
    const free = freeOverCents > 0 && cart.subtotalCents >= freeOverCents;
    return {
      cents: free ? 0 : cents,
      label: "Standard",
      tracked: true,
      basis: "measured",
      free,
      upTo: false,
      ...(freeOverCents > 0 && !free ? { freeFromCents: freeOverCents } : {}),
    };
  };
const store = (name: string, cents: number, freeOverCents = 0): BasketStore => ({ name, postage: flat(cents, freeOverCents) });
// What an order at store k really costs on top of its cards, from the store's
// own postage function: quote + any top-up to a minimum order.
const landed = (stores: BasketStores, k: string, sub: number, items: number) => {
  const q = stores[k].postage({ subtotalCents: sub, items });
  return q.cents + (q.minOrderCents && sub < q.minOrderCents ? q.minOrderCents - sub : 0);
};

test("consolidates two cards off a store: 4 cards / 2 stores costs $9.40 from one store, not $14.00 from two", () => {
  // The old hill-climb moved one card at a time, so it could never empty a
  // store holding two — it returned the naive $14.00 split with no "save" box.
  const stores: BasketStores = { a: store("A", 500), b: store("B", 500) };
  const cards = [
    card("1", 1, [L("a", 100), L("b", 120)]),
    card("2", 1, [L("a", 100), L("b", 120)]),
    card("3", 1, [L("a", 120), L("b", 100)]),
    card("4", 1, [L("a", 120), L("b", 100)]),
  ];
  const { plan, alternatives } = planBasket(cards, stores);
  assert.equal(plan.totalCents, 940);
  assert.equal(plan.storeCount, 1);
  assert.equal(plan.naiveTotalCents, 1400);
  assert.equal(plan.naiveStoreCount, 2);
  assert.equal(plan.savedCents, 460);
  assert.equal(alternatives.singleStore?.totalCents, 940);
  // The best split (1400) is dearer than the one-store order, so the page's
  // two-store card says so instead of showing a worse order.
  assert.equal(alternatives.twoStores, null);
  assert.equal(alternatives.twoStoresNone, "one-store-cheaper");
});

// Twelve cards over six small stores ($1.50 flat postage), plus one hub store
// stocking all twelve at +3% ($3.95, free over $50). From the 2026-09-25 audit.
function hubCase(smallFreeOver: number) {
  const stores: BasketStores = { hub: store("Hub", 395, 5000) };
  for (let s = 0; s < 6; s++) stores["s" + s] = store("S" + s, 150, smallFreeOver);
  const base = [450, 300, 800, 120, 220, 650, 90, 400, 250, 180, 700, 330];
  const cards = base.map((p, i) => card(String(i), 1 + (i % 3), [L("s" + (i % 6), p), L("hub", Math.round(p * 1.03))]));
  const hubTotal = base.reduce((s, p, i) => s + Math.round(p * 1.03) * (1 + (i % 3)), 0);
  return { stores, cards, hubTotal };
}

test("a hub store that stocks the whole list gives ONE order, not six", () => {
  const { stores, cards, hubTotal } = hubCase(0);
  assert.ok(hubTotal >= 5000, "the hub order clears its free-postage threshold");
  const { plan, alternatives } = planBasket(cards, stores);
  assert.equal(plan.naiveStoreCount, 6, "buying each card's cheapest copy takes six orders");
  assert.equal(plan.storeCount, 1);
  assert.equal(plan.stores[0].key, "hub");
  assert.equal(plan.totalCents, hubTotal, "one free-postage order from the hub");
  assert.ok(plan.savedCents > 0 && plan.totalCents < plan.naiveTotalCents);
  assert.equal(alternatives.singleStore?.totalCents, hubTotal);
  assert.equal(plan.stores[0].freeShipping, true);
});

test("the audit's own hub list: never six orders, never dearer than the one-store order", () => {
  // With the small stores' $30 free-postage threshold, one small store's pair
  // of cards clears it too — so hub + that store (both post-free) beats the
  // hub alone. The old answer was six orders for $109.20.
  const { stores, cards, hubTotal } = hubCase(3000);
  const { plan, alternatives } = planBasket(cards, stores);
  assert.equal(alternatives.singleStore?.totalCents, hubTotal);
  assert.ok(plan.totalCents <= hubTotal);
  assert.ok(plan.storeCount <= 2, `expected at most two orders, got ${plan.storeCount}`);
  assert.equal(plan.shippingCents, 0, "both orders clear their thresholds");
  assert.ok(plan.totalCents < 10920 && plan.naiveTotalCents === 10920);
});

test("100-store fan-out: every card 1c cheaper at its own store still buys from the one hub, $105 not $400", () => {
  const stores: BasketStores = { h: store("H", 300) };
  const cards: BasketCard[] = [];
  for (let i = 0; i < 100; i++) {
    stores["s" + i] = store("S" + i, 300);
    cards.push(card(String(i), 1, [L("s" + i, 100), L("h", 102)]));
  }
  const t0 = Date.now();
  const { plan } = planBasket(cards, stores);
  assert.equal(plan.totalCents, 10500);
  assert.equal(plan.storeCount, 1);
  assert.equal(plan.naiveTotalCents, 40000);
  assert.ok(Date.now() - t0 < 2000, "pure CPU and quick");
});

test("postage is charged once per store, and the parts add up", () => {
  const stores: BasketStores = { a: store("A", 1200), b: store("B", 1200) };
  const plan = optimizeBasket([card("one", 1, [L("a", 1000), L("b", 1100)]), card("two", 1, [L("a", 1100), L("b", 1000)])], stores);
  assert.equal(plan.itemsCents + plan.shippingCents, plan.totalCents);
  assert.equal(plan.totalCents, 3300);
  assert.equal(plan.stores.reduce((s, g) => s + g.subtotalCents + g.shippingCents, 0), plan.totalCents);
});

test("free-shipping thresholds are crossed when it pays, and reported per store", () => {
  // Case from the audit: reachable only by moving two cards at once.
  const stores: BasketStores = { a: store("A", 395, 5000), b: store("B", 395, 5000) };
  const cards = [
    card("1", 1, [L("a", 2000), L("b", 2050)]),
    card("2", 1, [L("a", 2000), L("b", 2050)]),
    card("3", 1, [L("a", 1050), L("b", 1000)]),
    card("4", 1, [L("a", 1050), L("b", 1000)]),
  ];
  const plan = optimizeBasket(cards, stores);
  assert.equal(plan.totalCents, 6100);
  assert.equal(plan.storeCount, 1);
  assert.equal(plan.stores[0].freeShipping, true);
  // The store's quote travels with the plan, for the page: the rate it was
  // priced at, for the cards it actually posts.
  assert.equal(plan.stores[0].postage.free, true);
  assert.equal(plan.stores[0].postage.label, "Standard");
  assert.equal(plan.stores[0].items, 4);
});

// Review, 2026-09-25: the only way to the cheapest order is to move TWO cards
// onto s3 at once to clear its $33 free-postage threshold — either card alone
// costs more than the $6 it saves. The one-card polish returned $78.75 for
// both the plan and the "Best two stores" card; the same two stores sell the
// list for $77.54.
test("threshold fill: two cards moved together to clear a store's free postage", () => {
  const stores: BasketStores = {
    s0: store("S0", 400, 2200),
    s1: store("S1", 600, 3200),
    s2: store("S2", 600, 3600),
    s3: store("S3", 600, 3300),
  };
  const cards = [
    card("c0", 2, [L("s2", 708), L("s3", 675)]),
    card("c1", 1, [L("s0", 1104), L("s1", 1381), L("s3", 1568)]),
    card("c2", 1, [L("s0", 886), L("s1", 1211), L("s3", 1101)]),
    card("c3", 1, [L("s0", 692), L("s1", 619), L("s2", 764), L("s3", 707)]),
    card("c4", 2, [L("s0", 492)]),
    card("c5", 1, [L("s0", 1179), L("s2", 1242)]),
    card("c6", 1, [L("s0", 1080), L("s1", 1152)]),
  ];
  const { plan, alternatives } = planBasket(cards, stores);
  assert.equal(plan.totalCents, 7754);
  assert.equal(plan.shippingCents, 0, "both orders clear their thresholds");
  assert.deepEqual(plan.stores.find((g) => g.key === "s3")?.lines.map((l) => l.cardId).sort(), ["c0", "c1", "c3"]);
  assert.equal(alternatives.twoStores?.totalCents, 7754, "the two-store card finds the same order");
  assert.equal(optimizeBasket(cards, stores).totalCents, 7754);
});

// Review, 2026-09-25: a pair whose polish landed on one store used to be
// dropped outright, real splits and all, so the card showed a $76.73 split
// while the same list split $70.89 between two other stores. Every pair is now
// searched for its best split that uses both stores, and a split is shown only
// when it beats the best one-store order ($69.56 here) — so this list says one
// store beats any split, rather than showing either.
test("the two-store card searches every pair's real splits, and shows one only when it beats one store", () => {
  const stores: BasketStores = {
    s0: store("S0", 100),
    s1: store("S1", 1200),
    s2: store("S2", 300, 2000),
    s3: store("S3", 800),
  };
  const cards = [
    card("c0", 4, [L("s1", 2156), L("s2", 1256), L("s3", 1857)]),
    card("c1", 3, [L("s1", 348), L("s2", 493)]),
    card("c3", 3, [L("s0", 162), L("s1", 135), L("s2", 151)]),
  ];
  const { plan, alternatives } = planBasket(cards, stores);
  assert.equal(plan.totalCents, 6956);
  assert.equal(alternatives.singleStore?.totalCents, 6956);
  assert.equal(alternatives.twoStores, null);
  assert.equal(alternatives.twoStoresNone, "one-store-cheaper");
});

// Every two-store order that uses both stores, by brute force: the cheapest.
function bruteTwoStores(cards: BasketCard[], stores: BasketStores): number {
  const keys = Object.keys(stores);
  let best = Infinity;
  for (let a = 0; a < keys.length; a++) {
    for (let b = a + 1; b < keys.length; b++) {
      const opts = cards.map((c) => c.listings.filter((l) => l.retailer === keys[a] || l.retailer === keys[b]));
      if (opts.some((o) => !o.length)) continue;
      const rec = (i: number, pick: { retailer: string; priceCents: number }[]) => {
        if (i === cards.length) {
          const sub: Record<string, number> = {};
          const pcs: Record<string, number> = {};
          let items = 0;
          pick.forEach((l, j) => {
            items += l.priceCents * cards[j].qty;
            sub[l.retailer] = (sub[l.retailer] ?? 0) + l.priceCents * cards[j].qty;
            pcs[l.retailer] = (pcs[l.retailer] ?? 0) + cards[j].qty;
          });
          if (Object.keys(sub).length !== 2) return;
          let ship = 0;
          for (const [k, v] of Object.entries(sub)) ship += landed(stores, k, v, pcs[k]);
          best = Math.min(best, items + ship);
          return;
        }
        for (const l of opts[i]) rec(i + 1, [...pick, l]);
      };
      rec(0, []);
    }
  }
  return best;
}

test("the plan is never dearer than the naive split or either alternative — and optimal on small lists", () => {
  // Brute force over every assignment on small random lists (seeded, so the
  // run is repeatable). The search found the optimum every time on 3,000 of
  // these when it was built; 300 keep the suite quick.
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let trial = 0; trial < 300; trial++) {
    const m = 2 + Math.floor(rnd() * 4);
    const n = 1 + Math.floor(rnd() * 6);
    const stores: BasketStores = {};
    for (let s = 0; s < m; s++) stores["s" + s] = store("S" + s, Math.floor(rnd() * 800), rnd() < 0.5 ? 0 : 500 + Math.floor(rnd() * 3000));
    const cards: BasketCard[] = [];
    for (let i = 0; i < n; i++) {
      let ls = Object.keys(stores)
        .filter(() => rnd() < 0.7)
        .map((k) => L(k, 50 + Math.floor(rnd() * 1500)));
      if (!ls.length) ls = [L("s0", 300)];
      cards.push(card("c" + i, 1 + Math.floor(rnd() * 3), ls));
    }
    let best = Infinity;
    const rec = (i: number, assign: string[]) => {
      if (i === n) {
        const sub: Record<string, number> = {};
        const pcs: Record<string, number> = {};
        let items = 0;
        assign.forEach((k, j) => {
          const p = cards[j].listings.find((l) => l.retailer === k)!.priceCents * cards[j].qty;
          items += p;
          sub[k] = (sub[k] ?? 0) + p;
          pcs[k] = (pcs[k] ?? 0) + cards[j].qty;
        });
        let ship = 0;
        for (const [k, v] of Object.entries(sub)) ship += landed(stores, k, v, pcs[k]);
        best = Math.min(best, items + ship);
        return;
      }
      for (const l of cards[i].listings) rec(i + 1, [...assign, l.retailer]);
    };
    rec(0, []);
    const { plan, alternatives } = planBasket(cards, stores);
    assert.equal(plan.totalCents, best, `trial ${trial}: expected the optimum`);
    assert.ok(plan.totalCents <= plan.naiveTotalCents);
    if (alternatives.singleStore) assert.ok(plan.totalCents <= alternatives.singleStore.totalCents);
    if (alternatives.twoStores) {
      assert.ok(plan.totalCents <= alternatives.twoStores.totalCents);
      assert.equal(alternatives.twoStores.storeCount, 2);
    }
    // The two-store card: the cheapest real split, shown exactly when it beats
    // the best one-store order.
    const two = bruteTwoStores(
      cards.filter((c) => c.listings.length),
      stores
    );
    const single = alternatives.singleStore?.totalCents ?? Infinity;
    if (n > 1 && two < single) assert.equal(alternatives.twoStores?.totalCents, two, `trial ${trial}: the best split`);
    else assert.equal(alternatives.twoStores, null, `trial ${trial}: no split beats one store`);
  }
});

test("wider lists with free-postage thresholds: every answer is consistent and never dearer than what's shown beside it", () => {
  // No brute force here (up to 12 stores): the search is a heuristic above
  // ten, and the page says so. What must always hold is checked instead.
  let seed = 17;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let trial = 0; trial < 150; trial++) {
    const m = 6 + Math.floor(rnd() * 7);
    const n = 2 + Math.floor(rnd() * 6);
    const stores: BasketStores = {};
    for (let s = 0; s < m; s++) {
      stores["s" + s] = store("S" + s, [200, 400, 600, 900][Math.floor(rnd() * 4)], rnd() < 0.8 ? (10 + Math.floor(rnd() * 31)) * 100 : 0);
    }
    const cards: BasketCard[] = [];
    for (let i = 0; i < n; i++) {
      const base = 200 + Math.floor(rnd() * 1300);
      let ls = Object.keys(stores)
        .filter(() => rnd() < 0.5)
        .map((k) => L(k, Math.round(base * (0.8 + rnd() * 0.4))));
      if (!ls.length) ls = [L("s0", base)];
      cards.push(card("c" + i, 1 + Math.floor(rnd() * 3), ls));
    }
    const { plan, alternatives } = planBasket(cards, stores);
    const recomputed = plan.stores.reduce((t, g) => {
      const sub = g.lines.reduce((x, l) => x + l.unitCents * l.qty, 0);
      return t + sub + landed(stores, g.key, sub, g.lines.reduce((x, l) => x + l.qty, 0));
    }, 0);
    assert.equal(recomputed, plan.totalCents, `trial ${trial}: the parts add up`);
    assert.ok(plan.totalCents <= plan.naiveTotalCents);
    const single = alternatives.singleStore;
    if (single) assert.ok(plan.totalCents <= single.totalCents);
    if (alternatives.twoStores) {
      assert.equal(alternatives.twoStores.storeCount, 2);
      assert.ok(plan.totalCents <= alternatives.twoStores.totalCents);
      if (single) assert.ok(alternatives.twoStores.totalCents < single.totalCents, "a split is shown only when it beats one store");
    }
    if (alternatives.twoStoresNone === "one-store-cheaper") assert.ok(single, "one-store-cheaper always has a one-store order to point at");
    assert.equal(optimizeBasket(cards, stores).totalCents, plan.totalCents, "the replacement panel's total is the same answer");
  }
});

test("alternatives are null when no single store / no pair stocks the whole list", () => {
  const stores: BasketStores = { a: store("A", 100), b: store("B", 100), c: store("C", 100) };
  const { alternatives } = planBasket([card("1", 1, [L("a", 100)]), card("2", 1, [L("b", 100)]), card("3", 1, [L("c", 100)])], stores);
  assert.equal(alternatives.singleStore, null);
  assert.equal(alternatives.twoStores, null);
  assert.equal(alternatives.twoStoresNone, "no-pair");
});

// "No two stores between them stock every card" was shown for lists that
// every store stocks (review, 2026-09-25): when every covering pair collapses
// onto one store, that is not "no pair", and the page must say which it is.
test("no two-store card for a one-card list — and it says why, not 'no pair stocks it'", () => {
  const stores: BasketStores = { a: store("A", 100), b: store("B", 100), c: store("C", 100) };
  const { plan, alternatives } = planBasket([card("solo", 2, [L("a", 150), L("b", 160), L("c", 170)])], stores);
  assert.equal(alternatives.singleStore?.totalCents, 400);
  assert.equal(plan.totalCents, 400);
  assert.equal(alternatives.twoStores, null);
  assert.equal(alternatives.twoStoresNone, "one-card");
});

test("when one store is cheapest on every card, the two-store card says one store beats any split", () => {
  const stores: BasketStores = { a: store("A", 300), b: store("B", 300) };
  const cards = [card("1", 1, [L("a", 100), L("b", 130)]), card("2", 1, [L("a", 200), L("b", 210)]), card("3", 1, [L("a", 300), L("b", 390)])];
  const { plan, alternatives } = planBasket(cards, stores);
  assert.equal(alternatives.singleStore?.stores[0].key, "a");
  assert.equal(plan.totalCents, 900);
  assert.equal(alternatives.twoStores, null);
  assert.equal(alternatives.twoStoresNone, "one-store-cheaper");
});

test("a real two-store order is still returned, with no reason attached", () => {
  const stores: BasketStores = { a: store("A", 100), b: store("B", 100) };
  const { alternatives } = planBasket([card("1", 1, [L("a", 100), L("b", 900)]), card("2", 1, [L("a", 900), L("b", 100)])], stores);
  assert.equal(alternatives.twoStores?.storeCount, 2);
  assert.equal(alternatives.twoStoresNone, null);
});

test("single-store starts: every candidate store for a deck-sized list, a budget's worth (never under ten) for the biggest", () => {
  assert.equal(singleStartCount(60, 54), 54, "a 60-card deck across the biggest market starts from every store");
  assert.equal(singleStartCount(40, 28), 28);
  assert.equal(singleStartCount(3, 5), 5, "never more starts than stores");
  const big = singleStartCount(200, 55);
  assert.ok(big >= 10 && big < 55, `200 cards x 55 stores is budgeted (got ${big})`);
  assert.equal(singleStartCount(200, 400), 10, "never fewer than ten");
});

test("a card no tracked store stocks is left out of the total and listed, never priced at $0", () => {
  const stores: BasketStores = { a: store("A", 500) };
  const plan = optimizeBasket([card("have", 1, [L("a", 700)]), card("gone", 2, [])], stores);
  assert.equal(plan.itemsCents, 700);
  assert.deepEqual(plan.unbuyable, [{ name: "gone", qty: 2 }]);
  assert.equal(plan.matchedCards, 1);
  assert.equal(plan.coveredCopies, 1);
});

test("every plan line carries the listing's condition and a link", () => {
  const stores: BasketStores = { a: store("A", 500) };
  const plan = optimizeBasket([card("x", 2, [L("a", 300, "Lightly Played")])], stores, { loc: "/tools/best-basket" });
  const line = plan.stores[0].lines[0];
  assert.equal(line.condition, "Lightly Played");
  assert.equal(line.qty, 2);
  assert.ok(line.url.startsWith("https://a.example/"));
});

test("the non-Premium preview is the aggregate only — no store names, lines or URLs", () => {
  const stores: BasketStores = { a: store("Secret Store", 500), b: store("Other Store", 500) };
  const plan = optimizeBasket([card("1", 2, [L("a", 100), L("b", 120)]), card("2", 1, [L("b", 100)]), card("3", 1, [])], stores);
  const preview = basketPreview(plan, [{ raw: "1 Not A Card", qty: 1 }]);
  assert.deepEqual(Object.keys(preview).sort(), [
    "covered",
    "naiveTotalCents",
    "playedCopies",
    "postageNotes",
    "requested",
    "savedCents",
    "shippingCents",
    "storeCount",
    "topUpCents",
    "totalCents",
    "unmatched",
  ]);
  const json = JSON.stringify(preview);
  for (const leak of ["Secret Store", "Other Store", "example", "url", "stores", "lines"]) assert.ok(!json.includes(leak), `preview leaks "${leak}"`);
  assert.equal(preview.covered, 3);
  assert.equal(preview.requested, 5, "covered + unbuyable + unmatched copies");
  assert.equal(preview.totalCents, plan.totalCents);
});

// ─────────────────────────────────────────────────────────────────────────────
// The search on measured postage (merged 2026-09-25): every cost it weighs is
// the store's own postage(cart) — subtotal AND card count — plus any top-up,
// a store that does not post to the buyer is never in any plan, and the risk
// allowance past the measured sizes steers the search without being reported.
// ─────────────────────────────────────────────────────────────────────────────

// Mana-Market-shaped: an untracked letter up to `maxCards`, a parcel above.
const letterThenParcel =
  (letter: number, maxCards: number, parcel: number) =>
  (cart: PostageCart): PostageQuote =>
    cart.items <= maxCards
      ? { cents: letter, label: "Letter", tracked: false, basis: "measured", free: false, upTo: false }
      : { cents: parcel, label: "Parcel", tracked: true, basis: "measured", free: false, upTo: false };

test("postage is priced on the order's card count, not just its subtotal", () => {
  const asked: PostageCart[] = [];
  const letter = letterThenParcel(100, 3, 1200);
  const stores: BasketStores = {
    l: { name: "Letter store", postage: (c) => (asked.push(c), letter(c)) },
    p: store("Parcel store", 400),
  };
  // Five copies, 10c cheaper each at the letter store — whose $1 letter stops at three cards.
  const cards = [card("x", 2, [L("l", 100), L("p", 110)]), card("y", 3, [L("l", 100), L("p", 110)])];
  const { plan, alternatives } = planBasket(cards, stores);
  assert.equal(plan.naiveTotalCents, 500 + 1200, "all five at the letter store post as a parcel");
  assert.equal(plan.totalCents, 550 + 400);
  assert.deepEqual(plan.stores.map((g) => g.key), ["p"]);
  assert.equal(alternatives.singleStore?.totalCents, 950);
  assert.ok(asked.some((c) => c.items === 5 && c.subtotalCents === 500), "the whole order was priced as five cards");
  assert.ok(asked.every((c) => Number.isInteger(c.items) && c.items >= 1), "never a line count or a zero-card order");
});

test("a store that does not post to the buyer is in no plan, and is listed with its reason", () => {
  const stores: BasketStores = {
    far: { name: "Far Store", postage: flat(0), unavailable: "Quoted no postage to Spain (measured)" },
    a: store("A", 500),
    b: store("B", 500),
  };
  const cards = [card("1", 1, [L("far", 10), L("a", 300), L("b", 320)]), card("2", 1, [L("far", 10), L("b", 300)]), card("3", 1, [L("far", 10)])];
  const { plan, alternatives } = planBasket(cards, stores);
  for (const p of [plan, alternatives.singleStore, alternatives.twoStores]) {
    if (p) assert.ok(!p.stores.some((g) => g.key === "far"), "never priced at a store that cannot deliver");
  }
  assert.deepEqual(plan.excludedStores, [{ key: "far", name: "Far Store", reason: "Quoted no postage to Spain (measured)" }]);
  assert.deepEqual(plan.unbuyable, [{ name: "3", qty: 1 }], "a card only it stocks is unbuyable here");
  assert.equal(plan.totalCents, 300 + 320 + 500, "both cards from B, one postage");
  assert.equal(basketPreview(plan).requested, 3);
});

test("a minimum order's top-up is counted in the plan, the alternatives and the preview alike", () => {
  // A store that quotes nothing under $5 (the Dice Saloon shape): a $3 card
  // there costs $3 + postage + $2 of top-up.
  const min =
    (cents: number, minOrderCents: number) =>
    (cart: PostageCart): PostageQuote => ({
      cents,
      label: "Standard",
      tracked: true,
      basis: "measured",
      free: false,
      upTo: false,
      ...(cart.subtotalCents < minOrderCents ? { minOrderCents } : {}),
    });
  const stores: BasketStores = { m: { name: "Min", postage: min(350, 500) }, o: store("Other", 700) };
  const cards = [card("x", 1, [L("m", 300), L("o", 320)])];
  const { plan, alternatives } = planBasket(cards, stores);
  assert.equal(plan.stores[0].key, "m");
  assert.equal(plan.topUpCents, 200);
  assert.equal(plan.stores[0].topUpCents, 200);
  assert.equal(plan.totalCents, 300 + 350 + 200);
  assert.equal(plan.itemsCents + plan.shippingCents + plan.topUpCents, plan.totalCents);
  assert.equal(alternatives.singleStore?.totalCents, 850);
  const preview = basketPreview(plan);
  assert.equal(preview.topUpCents, 200, "the preview's total includes it, so it says how much");
  assert.equal(preview.totalCents - preview.shippingCents - preview.topUpCents, 300, "and the cards are what is left");
  // Two cards clear the minimum: no top-up, and the search sees that.
  const two = optimizeBasket([card("x", 1, [L("m", 300), L("o", 320)]), card("y", 1, [L("m", 300), L("o", 320)])], stores);
  assert.equal(two.topUpCents, 0);
  assert.equal(two.totalCents, 600 + 350);
});

test("rising postage past the measured sizes steers the search, and is not in the reported totals", () => {
  // Card Hub's shape (tests/shipping.test.ts): $12 at the biggest cart measured,
  // rising $6 per further 10 cards. 60 cards 10c cheaper there look $4 cheaper
  // on the measured figure alone.
  const risky = (cart: PostageCart): PostageQuote => ({
    cents: 1200,
    label: "Tracked Letter",
    tracked: true,
    basis: "measured",
    free: false,
    upTo: false,
    ...(cart.items > 10 ? { beyondMeasured: true, riskCents: 600 * Math.ceil((cart.items - 10) / 10) } : {}),
  });
  const stores: BasketStores = { hub: { name: "Hub", postage: risky }, obs: store("Obsession", 2000) };
  const cards = Array.from({ length: 60 }, (_, i) => card("c" + i, 1, [L("hub", 50), L("obs", 60)]));
  const { plan, alternatives } = planBasket(cards, stores);
  assert.deepEqual(plan.stores.map((g) => g.key), ["obs"]);
  assert.equal(plan.totalCents, 3600 + 2000, "the reported total is the quote");
  assert.equal(plan.naiveTotalCents, 3000 + 1200, "and so is the naive split's: its risk is not reported either");
  assert.equal(plan.savedCents, 0, "never a negative saving");
  assert.equal(alternatives.singleStore?.stores[0].key, "obs", "the one-store order is chosen the same way");
  // The page says why, rather than calling this the cheapest way.
  assert.match(read("src/components/BestBasket.tsx"), /plan\.naiveTotalCents < plan\.totalCents \? \(\s*<RiskyNaive/);
});

test("the preview's postage notes name no store, and say when the total rests on estimates", () => {
  const est = (): PostageQuote => ({ cents: 900, label: "Estimate — not measured", tracked: null, basis: "estimate", free: false, upTo: false });
  const plan = optimizeBasket([card("x", 1, [L("e", 500)])], { e: { name: "Secret Guess Store", postage: est } });
  const preview = basketPreview(plan, [], { picked: true, unmeasured: false });
  assert.deepEqual(preview.postageNotes, ["includes estimated postage for 1 store"]);
  assert.ok(!JSON.stringify(preview).includes("Secret Guess Store"));
});

// ─────────────────────────────────────────────────────────────────────────────
// Wiring that can only be checked in source.
// ─────────────────────────────────────────────────────────────────────────────

test("the card picker is a standalone reusable component with an onPick callback, not a navigate-away link", () => {
  const code = readCode("src/components/CardPicker.tsx");
  assert.match(code, /export function CardPicker/, "must be an exported component");
  assert.match(code, /onPick:\s*\(card:\s*PickerCard\)\s*=>\s*void/, "must expose a select callback");
  assert.match(code, /\/api\/search\?q=/, "must reuse the existing /api/search endpoint, no new backend needed");
  assert.doesNotMatch(code, /next\/link/, "a pick must select the card, not navigate via <Link>");
});

test("the card picker supports keyboard arrow/enter selection", () => {
  const code = readCode("src/components/CardPicker.tsx");
  assert.match(code, /ArrowDown/);
  assert.match(code, /ArrowUp/);
  assert.match(code, /key === "Enter"/);
});

const ROUTE = "src/app/api/basket/route.ts";
const READS = "src/lib/basket-server.ts";

test("the basket route is Premium only: anyone else gets a 403 before any read (owner, 2026-10-07)", () => {
  const code = readCode(ROUTE);
  const gate = code.indexOf('if (!isPremium(user, "premium")) {');
  assert.ok(gate > 0);
  assert.match(code.slice(gate, gate + 220), /premium: "required" \}, \{ status: 403 \}/);
  assert.ok(gate < code.indexOf("rateLimit("), "gated before the rate limit");
  assert.ok(gate < code.indexOf("loadStoreListings("), "gated before any read");
  // The full plan's store links carry the page for the affiliate sub-id.
  assert.match(code, /planBasket\(basketCards, stores, \{ loc: "\/tools\/best-basket" \}\)/);
  // The page renders the tool only for Premium; everyone else sees the wall.
  const page = readCode("src/app/tools/best-basket/page.tsx");
  assert.match(page, /\{user && premium \? \(\n\s*<BestBasket/);
  assert.match(page, /<PlanButton surface="gate:basket" tier="premium" \/>/);
});

test("a failed read answers 503, never a $0.00 plan", () => {
  const code = readCode(ROUTE);
  assert.match(code, /\} catch \(e\) \{[^}]*return fail\("Store prices are unavailable[^;]*, 503\);/);
  assert.doesNotMatch(code, /\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(readCode(READS), /\.catch\(/, "the shared reads must throw, not swallow");
});

test("rate limits: 30 an hour for Premium, keyed by user, before any read", () => {
  const code = readCode(ROUTE);
  assert.match(code, /const HOUR = 3_600_000/);
  assert.match(code, /rateLimit\(`basket-premium:\$\{user\.id\}`, 30, HOUR\)/);
  assert.ok(code.indexOf("rateLimit(") < code.indexOf("loadStoreListings("));
  assert.match(readCode("src/app/api/deck/price/route.ts"), /rateLimit\(`deck-price:\$\{ipKey\(req\)\}`, 30, 60_000\)/);
  // Every 400 and the 503 go through fail().
  assert.match(code, /const fail = \(error: string, status: number\): Outcome => \(\{ res: NextResponse\.json\(\{ error \}, \{ status \}\), priced: false \}\)/);
  for (const status of ["400", "503"]) assert.match(code, new RegExp(`fail\\([^;]*, ${status}\\)`));
});

test("refundRateLimit gives one call back inside the window", () => {
  const key = `test-refund:${Date.now()}`;
  assert.ok(rateLimit(key, 1, 60_000).ok);
  assert.equal(rateLimit(key, 1, 60_000).ok, false, "the second call is over the limit");
  refundRateLimit(key); // the over-limit call
  refundRateLimit(key); // and the first
  assert.ok(rateLimit(key, 1, 60_000).ok, "a refunded slot can be used again");
  refundRateLimit(`never-used:${Date.now()}`); // a no-op, not a throw
});

test("list size: at most 200 lines, picked cards first, and the page says when a list runs past it", () => {
  const code = readCode(ROUTE);
  assert.match(code, /parseDeckList\(text\)\.slice\(0, Math\.max\(0, DECK_LINE_CAP - picked\.length\)\)/);
  assert.doesNotMatch(code, /\.slice\(DECK_LINE_CAP\)\) wanted\.delete/, "no silent trim of the matched cards");
  const ui = read("src/components/BestBasket.tsx");
  assert.match(ui, /const listLines = tab === "deck" \? picked\.length \+ pastedLines : 0;/);
  assert.match(ui, /parseDeckList\(pasteText\)/, "counted the way the route counts");
  assert.match(ui, /\{overCap && <CapNote/, "said before the run");
  assert.ok((ui.match(/overCap && <ResultCapNote \/>/g) ?? []).length >= 3, "and beside every kind of answer");
});

test("the binder's quantities are priced as held, like the portfolio's replacement panel", () => {
  const code = readCode(ROUTE);
  const binder = code.slice(code.indexOf('} else if (source === "binder") {'), code.indexOf("skippedHoldings = binder.skipped"));
  assert.ok(binder.length > 0);
  assert.match(binder, /wanted\.set\(h\.cardId, h\.qty\)/);
  assert.doesNotMatch(binder, /add\(|clampQty/, "no 99-copy clamp on the binder");
});

test("the owned and binder reads are per-user, selected and capped; listings come from the cached loader", () => {
  const code = readCode(READS);
  const owned = code.slice(code.indexOf("export async function loadOwnedQty"), code.indexOf("for (const r of rows) owned.set"));
  assert.match(owned, /where: \{ userId, cardId: \{ in: ids \} \}/);
  assert.match(owned, /select: \{ cardId: true, isFoil: true, quantity: true \}/, "owned copies are summed per unit (card + finish)");
  assert.match(owned, /take: 400/);
  const binder = code.slice(code.indexOf("export async function loadBinderHoldings"));
  assert.match(binder, /where: \{ userId \}/);
  assert.match(binder, /take: BINDER_ROW_CAP/);
  // The listings are the data loader's (published offer files of the page's own units), injectable for the watch run.
  assert.match(code, /read: BasketListingReader = getBasketListings/);
  const loader = read("src/lib/data/deals.ts").slice(read("src/lib/data/deals.ts").indexOf("export async function getBasketListings"));
  assert.match(loader, /includeTcgplayer: true/, "stores and, in the US, TCGplayer's own listing, never eBay");
  assert.match(loader, /slice\(0, 60\)/, "the cheapest 60 listings per unit");
});

test("the basket listings are read for at most one chunk of units a call, never cached by the caller's list", () => {
  const data = read("src/lib/data/deals.ts");
  const loader = data.slice(data.indexOf("export async function getBasketListings"));
  assert.match(loader, /slice\(0, BASKET_ID_CHUNK\)/, "at most 40 units a call");
  assert.match(data, /export const BASKET_ID_CHUNK: 40 = 40;/);
  assert.doesNotMatch(loader.slice(0, loader.indexOf("\n}\n")), /unstable_cache/, "the listing read is not itself cached: the instance's file cache serves a re-run");
});

test("nothing per-user in Best Basket is cached; the shared listings are a data.ts loader", () => {
  for (const f of [ROUTE, READS, "src/app/tools/best-basket/page.tsx"]) {
    assert.doesNotMatch(readCode(f), /unstable_cache|cachedOrDirect/, `${f} must not cache`);
  }
});

test("skipOwned subtracts owned copies (and doesn't apply to the binder itself), once the collection sources are on", () => {
  // Behavioural: the parser takes no account, so what it returns is what ANY
  // signed-in caller may send — the tier only decides the answer.
  assert.deepEqual(parseBasketRequest({ source: "watchlist", skipOwned: true, ids: [12, "13", "x"] }), {
    source: "watchlist", skipOwned: BASKET_COLLECTION_SOURCES, text: "", picked: [], ids: ["12", "13"], minCondition: "any", saveMinCondition: false,
    setSlug: "", scope: "base", rarity: null, maxPriceCents: null, after: null,
  });
  assert.equal(parseBasketRequest({ source: "deck", skipOwned: true, text: "1 Sol Ring" }).skipOwned, BASKET_COLLECTION_SOURCES);
  assert.equal(parseBasketRequest({ source: "binder", skipOwned: true }).skipOwned, false, "the binder prices replacement; skip is ignored");
  assert.equal(parseBasketRequest({ source: "nonsense" }).source, "deck");
  assert.equal(parseBasketRequest(null).skipOwned, false);
  const code = readCode(ROUTE);
  assert.match(code, /parseBasketRequest\(await req\.json\(\)/);
  assert.match(code, /loadOwnedQty\(userId, \[\.\.\.wanted\.keys\(\)\]\)/);
  // Owned copies come off before the tier branch, so a free total skips them too.
  assert.ok(code.indexOf("loadOwnedQty(") < code.indexOf("if (!full) {\n      const preview"));
});

test("picked cards: clamped 1-99 on the server and resolved by exact id, never by name", () => {
  assert.equal(clampQty(0), 1);
  assert.equal(clampQty(-4), 1);
  assert.equal(clampQty(2.6), 3);
  assert.equal(clampQty(500), 99);
  const parsed = parseBasketRequest({ lines: [{ cardId: "101", qty: 3 }, { cardId: 7, qty: 1 }, { cardId: "b", qty: 1 }, { cardId: "9", qty: "x" }, null] });
  assert.deepEqual(parsed.picked, [{ cardId: "101", qty: 3 }], "only well-formed { cardId, qty } lines survive");
  assert.equal(parseBasketRequest({ lines: Array.from({ length: 500 }, (_, i) => ({ cardId: String(i + 1), qty: 1 })) }).picked.length, 200);
  const code = readCode(ROUTE);
  assert.match(code, /const add = \(cardId: string, qty: number\) => wanted\.set\(cardId, clampQty\(/, "a summed quantity is clamped too");
  assert.match(code, /add\(u\.uid, clampQty\(l\.qty\)\)/, "each pick goes in by its own unit, clamped");
  // Bare ids (picker, watchlist) become units by id lookup only (the card's headline finish), named from the published catalogue.
  const at = code.indexOf("const pickedUnits = await unitsFor(picked.map((l) => l.cardId))");
  assert.ok(at > 0);
  const byId = code.slice(at, code.indexOf("const lines = parseDeckList", at));
  assert.doesNotMatch(byId, /resolveDeck|parseDeckList/, "a chosen printing is never re-resolved by name");
  // The page sends picks as ids, not as text.
  assert.match(read("src/components/BestBasket.tsx"), /lines: picked\.map\(\(p\) => \(\{ cardId: String\(p\.card\.id\), qty: p\.qty \}\)\)/);
});

test("the page: auto-run only for Premium, a sign-in prompt signed out, honest copy", () => {
  const page = read("src/app/tools/best-basket/page.tsx");
  assert.match(page, /autoRun=\{premium && handedIn\}/);
  assert.match(page, /Sign in free/);
  for (const banned of [/wishlist/i, /every viable split/i, /ranks the results/i, /price: "0"/]) {
    assert.doesNotMatch(page, banned);
  }
  assert.doesNotMatch(readCode("src/app/tools/best-basket/page.tsx"), /"offers"|offers:/, "no Offer in the JSON-LD");
});

test("the UI: tracked store links, the free preview's own-numbers copy, and its upgrade button", () => {
  const ui = read("src/components/BestBasket.tsx");
  assert.match(ui, /<a\s+href=\{l\.url\}\s+target="_blank"\s+rel=\{outboundRel\(\)\}\s+data-retailer=\{s\.key\}/, "store lines are tagged outbound links with the store key (the click beacon reads data-retailer)");
  // The saving leads, in money, from this list's own savedCents (lib/basket-saving.ts).
  assert.match(ui, /basketSavingPitch\(r\.savedCents, fmt,/);
  assert.match(ui, /Your list: \{fmt\(r\.totalCents\)\} delivered from \{stores\}\. Premium shows which store to buy each card from\./);
  assert.match(ui, /Buying each card&apos;s cheapest copy is already the cheapest way for\s+this list\./);
  assert.match(ui, /<PlanButton surface="gate:basket-limit" tier="premium" \/>/);
  assert.match(ui, /Skip copies I already own/);
  for (const t of ["Paste a list", "My watchlist", "My binder", "Finish a set"]) assert.ok(ui.includes(t), `tab "${t}"`);
  for (const t of ["Cheapest split", "Best single store", "Best two stores"]) assert.ok(ui.includes(t), `plan card "${t}"`);
  assert.match(ui, /l\.condition \?\? "Condition not stated"/, "condition on every line");
  // Changing an input clears the answer on screen…
  assert.match(ui, /function touched\(\) \{\s*(?:chunkStart\.current = null;\s*)?setResult\(null\);/);
  assert.match(ui, /<QtyInput/);
  // …including one still in flight: a response for older inputs is dropped.
  const touched = ui.slice(ui.indexOf("function touched()"), ui.indexOf("\n  }", ui.indexOf("function touched()")));
  assert.match(touched, /reqSeq\.current\+\+/);
  const run = ui.slice(ui.indexOf("async function run()"), ui.indexOf("setResult(built)"));
  assert.match(run, /const seq = \+\+reqSeq\.current;/);
  assert.match(run, /if \(seq !== reqSeq\.current\) return;/);
  // …and a market switch (router.refresh() keeps client state) clears it too.
  assert.match(ui, /shownCountry\.current = country;\s*touched\(\);/);
  assert.match(ui, /\}, \[country\]\);/);
});

test("the UI: every 'nothing priced' and 'no two-store order' case says which it is", () => {
  const ui = read("src/components/BestBasket.tsx");
  assert.match(ui, /None of these lines matched a card\./);
  assert.match(ui, /<NothingPriced r=\{r\} adjective=\{adjective\} \/>/);
  assert.match(ui, /empty=\{TWO_STORES_NONE\[alternatives\.twoStoresNone \?\? "no-pair"\]\}/);
  for (const k of ['"no-pair"', '"one-card"', '"one-store-cheaper"']) assert.ok(ui.includes(`${k}:`), `copy for ${k}`);
  // Copy for everyone without Premium — Plus members included — not "free accounts".
  assert.doesNotMatch(ui, /Free accounts/);
  assert.doesNotMatch(readCode(ROUTE), /Free accounts/);
});
