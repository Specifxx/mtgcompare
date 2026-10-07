import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROBE_ADDRESSES, classifyRate, type ProbeScenarioResult } from "../src/lib/shipping-probe";
import { condenseStore, type ProbeStoreInput, type ShippingSnapshot } from "../src/lib/shipping-snapshot";
import {
  ESTIMATE_FALLBACK_CENTS,
  SHIPPING_REGIONS,
  TCGPLAYER_BASKET_KEY,
  SHIPPING_SNAPSHOT,
  basketStoresFor,
  freeThreshold,
  marketEstimateFloorCents,
  marketHasZonePricing,
  postageOptionsFrom,
  shippingFor,
  shippingNoteFor,
  shippingSummary,
  subtotalBreaks,
} from "../src/lib/shipping";
import { optimizeBasket, type BasketCard } from "../src/lib/basket";
import { planPostageNotes, postageLineBits, postagePrefix } from "../src/lib/postage-display";
import { STORE_BY_KEY as RETAILERS, STORES as RETAILER_LIST } from "../src/lib/stores";
import { currencyOf, type Country } from "../src/lib/country";

// ─────────────────────────────────────────────────────────────────────────────
// Measured postage (RiftCompare's tests/shipping.test.ts, for OP Compare's
// stores). On RiftCompare, Malik in Adelaide ran Best Basket, was shown "+ $2.00
// post" for a store, and was charged $20 at its checkout. The $2 was a
// hand-typed guess; OP Compare never had guesses at all. These tests pin the model that replaced it: postage from
// each store's own checkout, letters only inside the order sizes they were seen
// on, thresholds only where measured, the HIGHEST region when the buyer's is
// unknown, and a guess never presented as a measurement.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

type Rates = [name: string, dollars: number][];
interface CartSpec {
  id: string;
  v: number; // subtotal, dollars
  n: number; // cards
  rates: Rates | "empty" | ((addr: string) => Rates | "empty");
}

// A synthetic probe run for one store, shaped exactly like the probe's output.
function probe(key: string, market: Country, carts: CartSpec[], currency = currencyOf(market)): ProbeStoreInput {
  const addresses = PROBE_ADDRESSES[market as keyof typeof PROBE_ADDRESSES];
  const scenarios: ProbeScenarioResult[] = carts.map((c) => {
    const byAddress: ProbeScenarioResult["byAddress"] = {};
    for (const a of addresses) {
      const spec = typeof c.rates === "function" ? c.rates(a.id) : c.rates;
      if (spec === "empty" || spec.length === 0) {
        byAddress[a.id] = { status: "empty", rates: [] };
        continue;
      }
      byAddress[a.id] = {
        status: "ok",
        rates: spec.map(([name, d]) => ({ name, cents: Math.round(d * 100), currency, ...classifyRate(name) })),
      };
    }
    return { id: c.id, kind: c.id.startsWith("S") ? "count" : "value", subtotalCents: Math.round(c.v * 100), items: c.n, cartCurrency: currency, byAddress };
  });
  return { key, market, currency, measuredAt: "2026-09-25T04:00:00.000Z", addresses, scenarios };
}

function snapshotOf(...stores: ProbeStoreInput[]): ShippingSnapshot {
  return {
    version: 1,
    note: "test",
    markets: { AU: { measuredAt: "2026-09-25", addresses: [] } },
    stores: Object.fromEntries(stores.map((s) => [s.key, condenseStore(s, {})])),
  };
}

// Obsession Gaming as RiftCompare measured it to all eight capitals: one rate,
// "Standard" $20.00, from a $0.10 card to fifteen cards at $150.03, never free
// (OP Compare's own probe found the same, 2026-10-03).
const OBSESSION = probe("obsessiongaming", "AU", [
  { id: "S1", v: 0.1, n: 1, rates: [["Standard", 20]] },
  { id: "S10", v: 1, n: 10, rates: [["Standard", 20]] },
  { id: "V20", v: 20, n: 2, rates: [["Standard", 20]] },
  { id: "V50", v: 50.97, n: 2, rates: [["Standard", 20]] },
  { id: "V100", v: 100.21, n: 5, rates: [["Standard", 20]] },
  { id: "V150", v: 150.03, n: 15, rates: [["Standard", 20]] },
]);

// A store with a $2 untracked letter that it only offers for small orders
// (seen up to 3 cards and $20), and a $20 parcel otherwise — the shape of the
// "$2 shown, much more at checkout" complaint when the letter is quoted for an
// order it does not cover.
const LETTER_THEN_PARCEL = probe("cherry", "AU", [
  { id: "S1", v: 0.99, n: 1, rates: [["Singles Untracked", 2], ["Tracked Parcel", 20]] },
  { id: "V20", v: 20, n: 3, rates: [["Singles Untracked", 2], ["Tracked Parcel", 20]] },
  { id: "S10", v: 9.9, n: 10, rates: [["Tracked Parcel", 20]] },
  { id: "V50", v: 50, n: 4, rates: [["Tracked Parcel", 20]] },
  { id: "V150", v: 150, n: 6, rates: [["Tracked Parcel", 20]] },
]);

const cart = (dollars: number, items: number) => ({ subtotalCents: Math.round(dollars * 100), items });

test("Malik's case: a measured $20 store is never quoted at its $2 guess, in Adelaide or anywhere", () => {
  const snap = snapshotOf(OBSESSION);
  for (const region of [...SHIPPING_REGIONS.AU.map((r) => r.key), null]) {
    const q = shippingFor("obsessiongaming", cart(30, 5), { region }, snap);
    assert.equal(q.cents, 2000, `region ${region}`);
    assert.equal(q.label, "Standard", "the store's own rate name");
    assert.equal(q.basis, "measured");
  }
  // A $60 order still pays $20: no free threshold was measured.
  assert.equal(shippingFor("obsessiongaming", cart(60, 4), { region: "SA" }, snap).cents, 2000);
});

test("Malik's case in the basket: an Adelaide order that outgrows the $2 letter pays the $20 parcel", () => {
  const snap = snapshotOf(LETTER_THEN_PARCEL);
  const stores = basketStoresFor("AU", { region: "SA" }, snap);
  const cards: BasketCard[] = Array.from({ length: 6 }, (_, i) => ({
    cardId: `c${i}`,
    name: `Card ${i}`,
    slug: null,
    qty: 1,
    listings: [{ retailer: "cherry", retailerName: "Cherry", priceCents: 750, url: "https://example.com" }],
  }));
  const plan = optimizeBasket(cards, stores);
  assert.equal(plan.storeCount, 1);
  const g = plan.stores[0];
  assert.equal(g.items, 6);
  assert.equal(g.subtotalCents, 4500);
  assert.notEqual(g.shippingCents, 200, "never the $2 letter for an order it was never offered on");
  assert.equal(g.shippingCents, 2000);
  assert.equal(g.postage.label, "Tracked Parcel");
  assert.equal(g.postage.otherOption, undefined, "no letter to mention: it is not offered for 6 cards / $45");
  assert.equal(plan.totalCents, 4500 + 2000);
  // …while a one-card order there really does get the $2 letter, labelled as untracked.
  const one = optimizeBasket(cards.slice(0, 1), stores);
  assert.equal(one.stores[0].shippingCents, 200);
  assert.equal(one.stores[0].postage.tracked, false);
  assert.equal(one.stores[0].postage.otherOption?.cents, 2000);
});

test("an untracked letter applies only within the value AND card count it was seen on", () => {
  const snap = snapshotOf(LETTER_THEN_PARCEL);
  const q = (v: number, n: number) => shippingFor("cherry", cart(v, n), { region: "SA" }, snap);
  assert.equal(q(5, 1).cents, 200);
  assert.equal(q(20, 3).cents, 200, "exactly the biggest cart it was seen on");
  assert.equal(q(20.01, 3).cents, 2000, "a cent more value than seen: no letter");
  assert.equal(q(10, 4).cents, 2000, "one card more than seen: no letter");
  assert.equal(q(10, 4).tracked, true);
});

test("tracked-only never picks the letter, and says a cheaper letter was skipped", () => {
  const snap = snapshotOf(LETTER_THEN_PARCEL);
  const q = shippingFor("cherry", cart(5, 1), { region: "SA", trackedOnly: true }, snap);
  assert.equal(q.cents, 2000);
  assert.equal(q.tracked, true);
  assert.deepEqual(q.otherOption, { cents: 200, label: "Singles Untracked", tracked: false });
  assert.deepEqual(postageOptionsFrom("AU", "SA", "1"), { region: "SA", trackedOnly: true });
  assert.deepEqual(postageOptionsFrom("AU", "Texas", null), { region: null, trackedOnly: false }, "a region outside the market is ignored");
});

test("region unknown: the HIGHEST regional rate, flagged 'up to'; a known region gets its own", () => {
  // Zone-priced like Canada Post Expedited: Toronto $10, Vancouver $20.
  const zoned = probe("facetoface", "CA", [
    { id: "S1", v: 1, n: 1, rates: (a) => [["Expedited Parcel", a === "van" ? 20 : a === "cgy" ? 18 : 10]] },
    { id: "V50", v: 50, n: 2, rates: (a) => [["Expedited Parcel", a === "van" ? 20 : a === "cgy" ? 18 : 10]] },
  ]);
  const snap = { ...snapshotOf(zoned), markets: { CA: { measuredAt: "2026-09-25", addresses: [] } } } as ShippingSnapshot;
  const unknown = shippingFor("facetoface", cart(10, 1), {}, snap);
  assert.equal(unknown.cents, 2000, "never the cheapest region");
  assert.equal(unknown.upTo, true);
  const on = shippingFor("facetoface", cart(10, 1), { region: "ON" }, snap);
  assert.equal(on.cents, 1000);
  assert.equal(on.upTo, false);
  assert.equal(shippingFor("facetoface", cart(10, 1), { region: "BC" }, snap).cents, 2000);
  // Identical everywhere (every measured AU store): no "up to".
  assert.equal(shippingFor("obsessiongaming", cart(10, 1), {}, snapshotOf(OBSESSION)).upTo, false);
});

test("a store that does not post to a region is unavailable there, and says where it does not post", () => {
  // Trinket Mage (DE): quoted Berlin, nothing to Madrid, Paris or Amsterdam.
  const deOnly = probe("trinketmage", "EU", [
    { id: "S1", v: 0.25, n: 1, rates: (a) => (a === "de" ? [["Standard", 5.99]] : "empty") },
    { id: "V50", v: 50, n: 5, rates: (a) => (a === "de" ? [["Standard", 5.99]] : "empty") },
  ]);
  const snap = { ...snapshotOf(deOnly), markets: {} } as ShippingSnapshot;
  const es = shippingFor("trinketmage", cart(10, 1), { region: "ES" }, snap);
  assert.match(es.unavailable ?? "", /Spain/);
  const unknown = shippingFor("trinketmage", cart(10, 1), {}, snap);
  assert.equal(unknown.cents, 599);
  // Not "up to €5.99": for Spain, France and the Netherlands there is no rate
  // at all, so the figure caps nothing there. It is reported apart, and the
  // plan headline tells the buyer to pick their region.
  assert.equal(unknown.upTo, false);
  assert.deepEqual(unknown.notServed, ["Spain", "France", "Netherlands"]);
  // The basket leaves it out for a Madrid buyer and says why.
  const stores = basketStoresFor("EU", { region: "ES" }, snap);
  const plan = optimizeBasket(
    [{ cardId: "x", name: "X", slug: null, qty: 1, listings: [{ retailer: "trinketmage", retailerName: "Trinket Mage", priceCents: 100, url: "u" }] }],
    stores,
  );
  assert.deepEqual(plan.unbuyable, [{ name: "X", qty: 1 }]);
  assert.equal(plan.excludedStores[0]?.key, "trinketmage");
  assert.match(plan.excludedStores[0]?.reason ?? "", /^Quoted no postage to Spain \(measured\)$/);
  // Region unknown: it stays in, and the headline says where it does not post.
  const open = optimizeBasket(
    [{ cardId: "x", name: "X", slug: null, qty: 1, listings: [{ retailer: "trinketmage", retailerName: "Trinket Mage", priceCents: 100, url: "u" }] }],
    basketStoresFor("EU", {}, snap),
  );
  assert.deepEqual(planPostageNotes(open, false), ["1 store in this plan doesn't post to Spain, France and Netherlands — pick your region"]);
  assert.deepEqual(planPostageNotes(open, true), [], "a picked region already excluded what does not post there");
});

test("free postage needs a measured threshold, and applies from the first free cart — never a guessed round number", () => {
  // Ozzie as measured: $9.99 up to $90.98, free at $100.98.
  const ozzie = probe("ozzie", "AU", [
    { id: "S1", v: 0.5, n: 1, rates: [["Standard Shipping", 9.99]] },
    { id: "S10", v: 5, n: 10, rates: [["Standard Shipping", 9.99]] },
    { id: "V90", v: 90.98, n: 2, rates: [["Standard Shipping", 9.99]] },
    { id: "V100", v: 100.98, n: 2, rates: [["Free Shipping", 0]] },
    { id: "V150", v: 154.98, n: 2, rates: [["Free Shipping", 0]] },
  ]);
  const snap = snapshotOf(ozzie);
  const at = (v: number, n = 2) => shippingFor("ozzie", cart(v, n), { region: "SA" }, snap);
  assert.equal(at(95).cents, 999, "between the paid and the free cart: still paid");
  assert.equal(at(95).freeFromCents, 10098);
  assert.equal(at(100).cents, 999, "the store's threshold is probably $100, but $100.98 is what was measured");
  assert.equal(at(100.98).cents, 0);
  assert.equal(at(100.98).free, true);
  assert.equal(at(100.98).label, "Free Shipping");
  // retailers.ts guessed "free over $60": never applied.
  assert.equal(at(61).cents, 999);
});

test("a $0 rate only small orders get is not a free-shipping threshold", () => {
  // Maine Phase: "Standard" $0 for 1–3 cards at any value, gone at 10 cards.
  assert.equal(
    freeThreshold([
      { v: 50, n: 1, cents: 0 },
      { v: 500, n: 10, cents: 635 },
      { v: 2095, n: 1, cents: 0 },
      { v: 9390, n: 2, cents: 0 },
      { v: 15075, n: 5, cents: 0 },
    ]),
    null,
  );
  // A paid cart below with no more cards makes it one (wulfgaming: paid at $45.26, free from $50.34).
  assert.equal(freeThreshold([{ v: 4526, n: 2, cents: 135 }, { v: 5034, n: 2, cents: 0 }, { v: 10281, n: 2, cents: 0 }]), 5034);
  // Free, then paid again above: not a threshold.
  assert.equal(freeThreshold([{ v: 1000, n: 1, cents: 500 }, { v: 5000, n: 1, cents: 0 }, { v: 9000, n: 1, cents: 500 }]), null);
});

test("prices between measured carts err dearer: the nearest cart with at least as many cards, or as much value", () => {
  // Card Hub: tracked letter $6 for one card, $12 for ten.
  const hub = probe("cardhub", "AU", [
    { id: "S1", v: 1.5, n: 1, rates: [["Singles Tracked Letter", 6]] },
    { id: "S10", v: 15, n: 10, rates: [["Singles Tracked Letter", 12]] },
    { id: "V50", v: 52.35, n: 1, rates: [["Singles Tracked Letter", 6]] },
  ]);
  const snap = snapshotOf(hub);
  assert.equal(shippingFor("cardhub", cart(20, 5), { region: "SA" }, snap).cents, 1200, "5 cards: priced as the 10-card cart, not the 1-card one");
  assert.equal(shippingFor("cardhub", cart(40, 1), { region: "SA" }, snap).cents, 600);
  const big = shippingFor("cardhub", cart(20, 30), { region: "SA" }, snap);
  assert.equal(big.beyondMeasured, true, "30 cards is more than anything measured, and the quote says so");
  assert.equal(big.cents, 1200);
});

test("a minimum order is reported, and the basket counts the top-up", () => {
  const dice = probe("dicesaloon", "UK", [
    { id: "S1", v: 0.35, n: 1, rates: "empty" },
    { id: "S10", v: 3.5, n: 10, rates: "empty" },
    { id: "V20", v: 20, n: 3, rates: [["Standard", 3.5]] },
  ]);
  const snap = { ...snapshotOf(dice), stores: { dicesaloon: condenseStore(dice, { minOrderCents: 500 }) } } as ShippingSnapshot;
  const q = shippingFor("dicesaloon", cart(3, 1), { region: "ENG" }, snap);
  assert.equal(q.minOrderCents, 500);
  assert.equal(q.cents, 350);
  const plan = optimizeBasket(
    [{ cardId: "x", name: "X", slug: null, qty: 1, listings: [{ retailer: "dicesaloon", retailerName: "Dice Saloon", priceCents: 300, url: "u" }] }],
    basketStoresFor("UK", { region: "ENG" }, snap),
  );
  assert.equal(plan.topUpCents, 200);
  assert.equal(plan.totalCents, 300 + 350 + 200);
  // Detected from the carts alone when no hand check exists: the first quoted cart.
  assert.equal(condenseStore(dice, {}).minOrderCents, 2000);
});

test("an unmeasured store is an estimate: the market's dearest measured one-card tracked rate, never zeroed", () => {
  // The real snapshot with Cape Fear (US) put back on the estimate.
  const snap: ShippingSnapshot = {
    ...SHIPPING_SNAPSHOT,
    stores: { ...SHIPPING_SNAPSHOT.stores, capefear: { ...SHIPPING_SNAPSHOT.stores.capefear, status: "unmeasured" } },
  };
  const q = shippingFor("capefear", cart(150, 3), {}, snap);
  assert.equal(q.basis, "estimate");
  assert.equal(q.label, "Estimate — not measured");
  assert.equal(q.free, false, "no threshold applies to an estimate");
  const floor = marketEstimateFloorCents("US", snap);
  assert.equal(q.cents, floor, "exactly the dearest one-card tracked rate a measured domestic US store charges");
  // …which is at least what a typical measured US store charges.
  const oneCard = Object.entries(SHIPPING_SNAPSHOT.stores)
    .filter(([, s]) => s.market === "US" && s.status === "measured")
    .map(([k, s]) => {
      const one = s.carts.filter(([, n]) => n === 1).sort((a, b) => a[0] - b[0])[0] ?? s.carts[0];
      return shippingFor(k, cart(one[0] / 100, 1), { trackedOnly: true }).cents;
    })
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  assert.ok(q.cents >= oneCard[Math.floor(oneCard.length / 2)], "at least the US measured median");
  // A store posting from Canada is not the yardstick for a domestic one.
  const danireon = shippingFor("danireon", cart(1, 1), { trackedOnly: true }).cents;
  assert.ok(SHIPPING_SNAPSHOT.stores.danireon.shipsFrom === "Canada" && danireon > 0);
  // A snapshot with no measured store in the market: the fallback, still an estimate.
  const est = shippingFor("capefear", cart(10, 1), {}, snapshotOf(OBSESSION));
  assert.equal(est.cents, ESTIMATE_FALLBACK_CENTS.US);
  assert.equal(est.basis, "estimate");
  // TCGplayer (US) is always on the estimate: each seller charges their own postage.
  assert.equal(shippingFor(TCGPLAYER_BASKET_KEY, cart(10, 1)).basis, "estimate");
  assert.equal(shippingFor(TCGPLAYER_BASKET_KEY, cart(10, 1)).cents, marketEstimateFloorCents("US"));
  // The store summary shows the same figure.
  assert.equal(shippingSummary("capefear", snap).estimateCents, shippingFor("capefear", cart(10, 1), {}, snap).cents);
  // A store that really posts nowhere is left out of Best Basket.
  assert.match(shippingFor("punkouter", cart(10, 1)).unavailable ?? "", /Shipping not available/);
});

test("no copy calls an estimate 'measured'", () => {
  const claimsMeasured = (s: string) => /(?<!not |hasn't been |haven't |not been |n't been )measured/i.test(s);
  const est = shippingFor("capefear", cart(10, 1), {}, snapshotOf(OBSESSION));
  assert.ok(!claimsMeasured(est.label), est.label);
  const note = shippingNoteFor("capefear", snapshotOf(OBSESSION));
  assert.ok(!claimsMeasured(note), note);
  assert.match(note, /est\./);
  assert.equal(shippingSummary("capefear", snapshotOf(OBSESSION)).basis, "estimate");
  // A measured store's note says when.
  assert.match(shippingNoteFor("obsessiongaming", snapshotOf(OBSESSION)), /Standard A\$20\.00 .*measured 25 Sep 2026/);
  const ui = read("src/components/BestBasket.tsx");
  const estBranch = ui.slice(ui.indexOf('if (p.basis === "estimate")'), ui.indexOf("const kind ="));
  assert.match(estBranch, /est\. \{fmt\(p\.cents\)\}/);
  assert.match(estBranch, /hasn&apos;t been measured yet/);
  assert.ok(!claimsMeasured(estBranch.replace(/hasn&apos;t been measured/g, "")), "estimate branch must not claim a measurement");
  assert.match(ui, /\+ \{postagePrefix\(s\.postage\)\}/, "the store header marks an estimate through postagePrefix");
  assert.equal(postagePrefix(est), "est. ");
});

test("postage is priced through lib/shipping.ts everywhere Best Basket reads it", () => {
  for (const f of ["src/lib/basket.ts", "src/app/api/basket/route.ts", "src/components/BestBasket.tsx", "src/lib/deck-watch.ts"]) {
    const code = read(f).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /\b(shippingFlatCents|freeOverCents|shippingNote)\b/, `${f} must price postage through lib/shipping.ts`);
  }
  assert.match(read("src/app/api/basket/route.ts"), /basketStoresFor\(country, postageOpts\)/);
  assert.match(read("src/lib/deck-watch.ts"), /basketStoresFor\(opts\.market, postageOptionsFrom\(/);
});

test("the region and tracked-only choices are remembered, guarded, and sent to both routes", () => {
  const prefs = read("src/lib/postage-prefs.ts");
  assert.equal((prefs.match(/try \{/g) ?? []).length, 2, "every localStorage read and write sits in try/catch");
  const ui = read("src/components/BestBasket.tsx");
  assert.match(ui, /readPostagePrefs\(market\)/);
  assert.match(ui, /writePostagePrefs\(market,/);
  assert.match(ui, /Tracked postage only/);
  assert.match(ui, /Not sure \(highest rate\)/);
  assert.match(read("src/lib/postage-display.ts"), /untracked letter \$\{fmt\(p\.otherOption\.cents\)\} also offered/);
  assert.match(ui, /postageLineBits\(group, fmt\)/);
  assert.match(ui, /the store&apos;s own checkout is final/);
  assert.match(prefs, /POSTAGE_PREFS_KEY = "oc_postage"/, "OP Compare's own storage key");
});

// ── The checked-in snapshot ─────────────────────────────────────────────────

test("the snapshot covers every configured store, in its own currency, and stays small", () => {
  for (const r of RETAILER_LIST) {
    const s = SHIPPING_SNAPSHOT.stores[r.key];
    assert.ok(s, `${r.key} is missing from shipping-rates.json — rebuild it`);
    assert.equal(s.market, r.country ?? "AU", r.key);
    if (s.status === "measured") {
      assert.equal(s.currency, r.currency ?? currencyOf((r.country ?? "AU") as Country), `${r.key}: rates in another currency`);
      assert.match(s.measuredAt, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(s.carts.length > 0 && s.zones.length > 0, r.key);
      for (const z of s.zones) assert.equal(z.std.length, s.carts.length, `${r.key}: std series misaligned`);
    }
  }
  assert.ok(statSync(join(ROOT, "src/lib/shipping-rates.json")).size < 200_000, "keep the snapshot condensed — raw probe files are artifacts, not source");
});

test("the real snapshot: Obsession Gaming is $20 to Adelaide, every measured store has carts in its own currency", () => {
  const q = shippingFor("obsessiongaming", cart(30, 5), { region: "SA" });
  assert.equal(q.cents, 2000);
  assert.equal(q.basis, "measured");
  for (const [k, s] of Object.entries(SHIPPING_SNAPSHOT.stores)) {
    if (s.status !== "measured") continue;
    assert.ok(s.carts.length > 0, k);
    assert.equal(s.currency, RETAILERS[k]?.currency ?? currencyOf(s.market), `${k} is in its market's currency`);
  }
  // Some AU stores DO charge by state in OP Compare's measurement, so the AU picker matters.
  assert.equal(marketHasZonePricing("AU"), true);
  assert.equal(marketHasZonePricing("SG"), false, "SG: one store, which posts nowhere we measured");
});

test("condensing: identical addresses collapse, pickup and other currencies are dropped, a store quoting nothing anywhere does not post", () => {
  const s = condenseStore(
    probe("ozzie", "AU", [
      {
        id: "S1",
        v: 0.5,
        n: 1,
        rates: (a) => [
          ["Standard Shipping", 9.99],
          ...(a === "mel" ? ([["In Store Pick Up - Eumemmerring, VIC", 0]] as Rates) : []),
        ],
      },
    ]),
    {},
  );
  assert.equal(s.zones.length, 1, "Melbourne's $0 pickup is not postage, so all eight capitals are one zone");
  assert.equal(s.zones[0].at.length, 8);
  assert.deepEqual(s.zones[0].std, [[999, 0, 0]]);
  const nothing = condenseStore(probe("larrysgamestore", "US", [{ id: "S1", v: 1, n: 1, rates: "empty" }]), {});
  assert.equal(nothing.status, "no-post");
  const usdRatesInAud = probe("ozzie", "AU", [{ id: "S1", v: 1, n: 1, rates: [["Standard", 5]] }], "AUD");
  usdRatesInAud.scenarios[0].byAddress.syd.rates.forEach((r) => (r.currency = "USD"));
  assert.equal(condenseStore(usdRatesInAud, {}).zones.find((z) => z.at.includes("syd"))?.std[0], null, "never mix currencies");
});

test("the refresh workflow re-runs the probe per market, never touches the database, and never commits", () => {
  const wf = read(".github/workflows/shipping-rates.yml");
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /scripts\/probe-shipping-rates\.ts --market=/);
  assert.match(wf, /scripts\/build-shipping-rates\.ts/);
  assert.match(wf, /actions\/upload-artifact@v4/);
  assert.match(wf, /GITHUB_STEP_SUMMARY/);
  assert.doesNotMatch(wf, /DATABASE_URL|secrets\.(?!GITHUB_TOKEN)/, "no database, no secret but the workflow's own token");
  assert.doesNotMatch(wf, /\[deploy\]/i, "the refresh rides the daily release");
  assert.doesNotMatch(wf, /git push|git commit|gh pr create|contents: write/, "the refreshed snapshot is an artifact for the owner to commit, never pushed by the workflow");
  // Monthly at 03:17 UTC: outside the import windows (07:00–08:10, 19:00–20:10).
  const cron = /cron: "(\d+) (\d+) /.exec(wf);
  assert.ok(cron);
  const minutes = Number(cron[2]) * 60 + Number(cron[1]);
  for (const [a, b] of [[7 * 60, 8 * 60 + 10], [19 * 60, 20 * 60 + 10]]) assert.ok(minutes < a || minutes > b, `cron ${cron[2]}:${cron[1]} clears the import window`);
});

test("basketStoresFor remembers quotes by card count and subtotal slot, and every one is exactly shippingFor's", () => {
  // Best Basket's search asks each store for tens of thousands of orders, so
  // the map's postage functions remember answers by (cards, the subtotal's
  // place among subtotalBreaks) — sound only while shippingFor depends on the
  // subtotal through those values alone. Every store in the real snapshot, a
  // spread of options, and several orders per slot (so most are answered from
  // memory) must match a fresh shippingFor exactly.
  let checked = 0;
  for (const market of Object.keys(SHIPPING_REGIONS) as Country[]) {
    for (const opts of [{}, { trackedOnly: true }, { region: SHIPPING_REGIONS[market][0]?.key ?? null }]) {
      const stores = basketStoresFor(market, opts);
      for (const [key, st] of Object.entries(stores)) {
        const breaks = subtotalBreaks(key);
        const subs = new Set<number>([0, 1]);
        breaks.forEach((b, i) => {
          subs.add(b);
          subs.add(b + 1);
          subs.add(Math.max(0, b - 1));
          if (i + 1 < breaks.length) subs.add(Math.floor((b + breaks[i + 1]) / 2));
        });
        if (breaks.length) subs.add(breaks[breaks.length - 1] * 3);
        for (const items of [1, 3, 10, 40]) {
          for (const v of subs) {
            const cart = { subtotalCents: v, items };
            assert.deepEqual(st.postage(cart), shippingFor(key, cart, opts), `${market} ${key} ${JSON.stringify(opts)} ${v}/${items}`);
            checked++;
          }
        }
      }
    }
  }
  assert.ok(checked > 20_000, `${checked}`);
});

test("the optimiser drains a whole store when no single-card move can save its postage", () => {
  // Two cards cheapest at A, two at B, each store $10 postage. Moving ONE card
  // off A saves nothing (A still posts the other), so a single-move climb is
  // stuck at two orders; emptying A onto B pays $1.00 more for cards and saves
  // $10.00 of postage.
  const flat = (cents: number) => () => ({ cents, label: "Standard", tracked: null, basis: "measured" as const, free: false, upTo: false });
  const stores = { a: { name: "A", postage: flat(1000) }, b: { name: "B", postage: flat(1000) } };
  const card = (id: string, a: number, b: number): BasketCard => ({
    cardId: id,
    name: id,
    slug: null,
    qty: 1,
    listings: [
      { retailer: "a", retailerName: "A", priceCents: a, url: "u" },
      { retailer: "b", retailerName: "B", priceCents: b, url: "u" },
    ],
  });
  const cards = [card("1", 100, 150), card("2", 100, 150), card("3", 150, 100), card("4", 150, 100)];
  const plan = optimizeBasket(cards, stores);
  assert.equal(plan.naiveStoreCount, 2);
  assert.equal(plan.naiveTotalCents, 400 + 2000);
  assert.equal(plan.storeCount, 1);
  assert.equal(plan.totalCents, 500 + 1000);
  assert.equal(plan.savedCents, 900);
  // Deterministic: the same input gives the same split.
  assert.deepEqual(optimizeBasket(cards, stores).stores.map((s) => s.key), plan.stores.map((s) => s.key));
});

// ─────────────────────────────────────────────────────────────────────────────
// The postage review (2026-09-25): thirteen places the first measured model
// still showed less than the checkout would charge, or said more than it knew.
// ─────────────────────────────────────────────────────────────────────────────

test("a letter with a floor: not offered below the smallest cart it was seen on when a smaller cart got only the parcel", () => {
  // Mecha Games (CA) as measured: no letter on a C$0.50 card, only "Standard"
  // C$19.99; the C$3.49 bubble mailer on every cart from C$5.00.
  const both = (): Rates => [["Standard", 19.99], ["CARD SINGLES ( Bubble Mailer No tracking)", 3.49]];
  const mecha = probe("animealley", "CA", [
    { id: "S1", v: 0.5, n: 1, rates: [["Standard", 19.99]] },
    { id: "S10", v: 5, n: 10, rates: both },
    { id: "V20", v: 20.04, n: 2, rates: both },
    { id: "V50", v: 51.4, n: 2, rates: both },
    { id: "V100", v: 100.63, n: 1, rates: both },
    { id: "V150", v: 150.28, n: 3, rates: both },
  ]);
  const snap = { ...snapshotOf(mecha), markets: {} } as ShippingSnapshot;
  const q = (v: number, n: number) => shippingFor("animealley", cart(v, n), { region: "ON" }, snap);
  assert.equal(q(0.5, 1).cents, 1999, "the measured cart itself: the checkout offered no letter");
  assert.equal(q(3, 2).cents, 1999, "below the letter's floor");
  assert.equal(q(5, 1).cents, 349);
  assert.equal(q(5, 1).tracked, false);
  const sum = shippingSummary("animealley", snap);
  assert.equal(sum.letter?.fromValueCents, 500);
  assert.equal(sum.letter?.minCents, 349, "the letter's price where it IS offered");
  assert.match(shippingNoteFor("animealley", snap), /untracked C\$3\.49 \(from C\$5\.00, up to 10 cards/);
});

test("tracked-only leaves out a store that only offers untracked postage, and says why", () => {
  // GT Games (CA): "Economy (No Tracking)" and nothing else.
  const gt = probe("bananagames", "CA", [
    { id: "S1", v: 0.09, n: 1, rates: [["Economy (No Tracking)", 2.85]] },
    { id: "S10", v: 1.48, n: 10, rates: [["Economy (No Tracking)", 5.7]] },
  ]);
  const snap = { ...snapshotOf(gt), markets: {} } as ShippingSnapshot;
  const q = shippingFor("bananagames", cart(5, 2), { trackedOnly: true }, snap);
  assert.equal(q.unavailable, "Offers only untracked postage (measured)");
  assert.equal(shippingFor("bananagames", cart(5, 2), { region: "ON", trackedOnly: true }, snap).unavailable, "Offers only untracked postage (measured)");
  assert.equal(shippingFor("bananagames", cart(5, 2), {}, snap).cents, 570, "without the toggle it is priced as before");
  const plan = optimizeBasket(
    [{ cardId: "x", name: "X", slug: null, qty: 1, listings: [{ retailer: "bananagames", priceCents: 100, url: "u" }] }],
    basketStoresFor("CA", { trackedOnly: true }, snap),
  );
  assert.deepEqual(plan.excludedStores, [{ key: "bananagames", name: RETAILERS.bananagames.name, reason: "Offers only untracked postage (measured)" }]);
  // The Left-out heading no longer claims every excluded store "doesn't post to you".
  const ui = read("src/components/BestBasket.tsx");
  assert.match(ui, /Left out of this plan:/);
  assert.doesNotMatch(ui, /post\{" "\}\s*\{regionLabel \? `to \$\{regionLabel\}` : "to you"\}/);
});

test("a zone whose every quote errored was not measured: never 'does not post'", () => {
  const errAt = (s: ProbeStoreInput, ids: string[]) => {
    for (const sc of s.scenarios) for (const id of ids) sc.byAddress[id] = { status: "error", rates: [], error: "HTTP 429" };
    return s;
  };
  const obs = () => probe("obsessiongaming", "AU", [
    { id: "S1", v: 0.1, n: 1, rates: [["Standard", 20]] },
    { id: "V50", v: 50.97, n: 2, rates: [["Standard", 20]] },
  ]);
  const snap = snapshotOf(errAt(obs(), ["adl"]));
  const adl = snap.stores.obsessiongaming.zones.find((z) => z.at.includes("adl"))!;
  assert.equal(adl.none, undefined);
  assert.deepEqual(adl.err, [0, 1]);
  const q = shippingFor("obsessiongaming", cart(30, 2), { region: "SA" }, snap);
  assert.equal(q.unavailable, undefined, "Adelaide was never measured, so it is not 'does not post'");
  assert.equal(q.cents, 2000, "priced at the highest measured region instead");
  assert.equal(basketStoresFor("AU", { region: "SA" }, snap).obsessiongaming.unavailable, undefined);
  // Every address errored: unmeasured (an estimate), never no-post.
  const all = condenseStore(errAt(obs(), PROBE_ADDRESSES.AU.map((a) => a.id)), {});
  assert.equal(all.status, "unmeasured");
  assert.equal(all.note, "Not measured: every quote errored");
  const snapAll = { ...snapshotOf(OBSESSION), stores: { obsessiongaming: all } } as ShippingSnapshot;
  assert.equal(shippingFor("obsessiongaming", cart(30, 2), { region: "SA" }, snapAll).basis, "estimate");
});

test("the builder replaces a market only on a full run; a partial run keeps the rest and dates the market by its oldest store", () => {
  const dir = mkdtempSync(join(tmpdir(), "ship-"));
  const one = probe("wolfdentcg", "US", [{ id: "S1", v: 0.25, n: 1, rates: [["Ground Advantage", 5.72]] }]);
  one.measuredAt = "2026-10-02T03:30:00.000Z";
  writeFileSync(join(dir, "us.json"), JSON.stringify({ market: "US", stores: [one] }));
  execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/build-shipping-rates.ts", join(dir, "us.json"), `--base=src/lib/shipping-rates.json`, `--out=${join(dir, "out.json")}`, `--summary=${join(dir, "sum.md")}`],
    { cwd: ROOT, stdio: "pipe" },
  );
  const out = JSON.parse(readFileSync(join(dir, "out.json"), "utf8")) as ShippingSnapshot;
  const us = Object.entries(out.stores).filter(([, s]) => s.market === "US");
  assert.equal(us.length, Object.values(SHIPPING_SNAPSHOT.stores).filter((s) => s.market === "US").length, "no other US store dropped");
  assert.equal(out.stores.wolfdentcg.measuredAt, "2026-10-02");
  assert.equal(out.stores.capefear.measuredAt, SHIPPING_SNAPSHOT.stores.capefear.measuredAt);
  assert.equal(out.markets.US?.measuredAt, "2026-10-02", "a partial run: as fresh as the OLDEST store");
  assert.match(readFileSync(join(dir, "sum.md"), "utf8"), /US \(partial run\)/);
});

test("at a measured cart the quote IS the measured rate; between carts it is never under a cart the order contains", () => {
  // Always Games (Toronto): C$16.17 Expedited on small carts, then its
  // "Standard" C$10.00 from C$50.85 / 5 cards. Quoted C$16.17 there before.
  const ag = probe("alwaysgames", "CA", [
    { id: "S1", v: 0.35, n: 1, rates: [["Expedited Parcel", 16.17]] },
    { id: "S10", v: 3.5, n: 10, rates: [["Expedited Parcel", 16.17]] },
    { id: "V20", v: 20.45, n: 2, rates: [["Expedited Parcel", 16.17]] },
    { id: "V50", v: 50.85, n: 5, rates: [["Expedited Parcel", 16.17], ["Standard", 10]] },
    { id: "V100", v: 100.05, n: 34, rates: [["Expedited Parcel", 16.17], ["Standard", 10]] },
  ]);
  const snap = { ...snapshotOf(ag), markets: {} } as ShippingSnapshot;
  const q = (v: number, n: number) => shippingFor("alwaysgames", cart(v, n), { region: "ON" }, snap).cents;
  assert.equal(q(50.85, 5), 1000);
  assert.equal(q(100.05, 34), 1000);
  assert.equal(q(60, 11), 1617, "contains the 10-card cart that paid C$16.17: never less");
  // The whole real snapshot: every (store, region, measured cart) quotes
  // exactly what was measured there, except where a checkout discount the
  // rates endpoint cannot see makes it free (goattcg, tefuda).
  let checked = 0;
  const off: string[] = [];
  for (const [k, s] of Object.entries(SHIPPING_SNAPSHOT.stores)) {
    if (s.status !== "measured") continue;
    for (const rg of SHIPPING_REGIONS[s.market]) {
      const zs = rg.at.map((id) => s.zones.find((z) => z.at.includes(id))).filter((z) => !!z);
      if (zs.length !== 1 || zs[0]!.none) continue;
      const z = zs[0]!;
      s.carts.forEach(([v, n], j) => {
        const m = [z.std[j]?.[0], z.ltr?.[j]?.[0]].filter((x): x is number => x != null);
        if (!m.length) return;
        checked++;
        const got = shippingFor(k, { subtotalCents: v, items: n }, { region: rg.key }).cents;
        if (got !== Math.min(...m) && !s.freeFromCents) off.push(`${k} ${rg.key} ${v}/${n}: ${got} vs ${Math.min(...m)}`);
      });
    }
  }
  assert.ok(checked > 3000, `${checked}`);
  assert.deepEqual(off, []);
});

test("a free letter counts in the free-postage hint, and the store page reports it apart from the parcel's", () => {
  // Card Brawlers (Toronto): parcel C$14.29 until free at C$150; letter C$3.49 until free from C$55.
  const cb = probe("cardbrawlers", "CA", [
    { id: "S1", v: 0.25, n: 1, rates: [["Expedited Parcel", 14.29], ["Bubble Mail (NO Tracking)", 3.49]] },
    { id: "S10", v: 2.5, n: 10, rates: [["Expedited Parcel", 14.29], ["Bubble Mail (NO Tracking)", 3.49]] },
    { id: "V20", v: 20, n: 1, rates: [["Expedited Parcel", 14.29], ["Bubble Mail (NO Tracking)", 3.49]] },
    { id: "V50", v: 55, n: 1, rates: [["Expedited Parcel", 14.29], ["Free Bubble Mail (NO Tracking)", 0]] },
    { id: "V100", v: 100, n: 2, rates: [["Expedited Parcel", 14.29], ["Free Bubble Mail (NO Tracking)", 0]] },
    { id: "V150", v: 150, n: 3, rates: [["Free Expedited", 0], ["Free Bubble Mail (NO Tracking)", 0]] },
  ]);
  const snap = { ...snapshotOf(cb), markets: {} } as ShippingSnapshot;
  const q = shippingFor("cardbrawlers", cart(30, 2), { region: "ON" }, snap);
  assert.equal(q.cents, 349);
  assert.equal(q.freeFromCents, 5500, "the letter goes free first — not 'free postage from C$150'");
  assert.equal(shippingFor("cardbrawlers", cart(60, 2), { region: "ON" }, snap).cents, 0);
  assert.equal(shippingFor("cardbrawlers", cart(30, 2), { region: "ON", trackedOnly: true }, snap).freeFromCents, 15000, "tracked-only: the parcel's");
  assert.equal(shippingFor("cardbrawlers", cart(30, 12), { region: "ON" }, snap).freeFromCents, 15000, "more cards than the letter was seen with: the parcel's");
  const sum = shippingSummary("cardbrawlers", snap);
  assert.equal(sum.free?.fromCents, 15000);
  assert.equal(sum.free?.letterFromCents, 5500);
  assert.match(shippingNoteFor("cardbrawlers", snap), /free from C\$150\.00 · free untracked from C\$55\.00/);
});

test("only a rate whose name says tracked is called tracked", () => {
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  const base = { cents: 700, label: "Small Letter Sized", tracked: false, basis: "measured" as const, free: false, upTo: false };
  // Mana Market: the letter, beside a "Small Bubble Mailer" whose name says nothing.
  const mana = postageLineBits({ topUpCents: 0, postage: { ...base, otherOption: { cents: 1000, label: "Small Bubble Mailer", tracked: null } } }, fmt);
  assert.ok(!mana.some((b) => /tracked:/.test(b)), mana.join(" · "));
  assert.ok(mana.includes("or: Small Bubble Mailer $10.00 (tracking not stated)"), mana.join(" · "));
  const real = postageLineBits({ topUpCents: 0, postage: { ...base, otherOption: { cents: 1000, label: "Tracked Parcel", tracked: true } } }, fmt);
  assert.ok(real.includes("tracked: Tracked Parcel $10.00"), real.join(" · "));
  assert.doesNotMatch(read("src/components/BestBasket.tsx"), /`tracked: \$\{p\.otherOption\.label\}/);
});

test("a $0 cart only counts for orders with at least its cards and no more of its value; quotes rise with card count", () => {
  // Maine Phase (New York) as measured: "Standard" $0 for 1–3 card carts, a
  // 10-card $5 cart paid Ground Advantage $6.35, and $0 above $100 by threshold.
  const mp = probe("mainephasehobbies", "US", [
    { id: "S1", v: 0.5, n: 1, rates: [["Standard", 0], ["Ground Advantage", 6.35]] },
    { id: "S10", v: 5, n: 10, rates: [["Ground Advantage", 6.35]] },
    { id: "V20", v: 20.95, n: 1, rates: [["Standard", 0]] },
    { id: "V50", v: 50.9, n: 2, rates: [["Standard", 0]] },
    { id: "V60", v: 64.85, n: 3, rates: [["Standard", 0]] },
    { id: "V100", v: 100.9, n: 2, rates: [["Ground Advantage", 0]] },
    { id: "V150", v: 150.75, n: 5, rates: [["Ground Advantage", 0]] },
  ]);
  const snap = { ...snapshotOf(mp), markets: {} } as ShippingSnapshot;
  const q = (v: number, n: number) => shippingFor("mainephasehobbies", cart(v, n), { region: "NE" }, snap);
  assert.equal(q(10, 5).free, false, "5 cards at $10 is not free: only a $150.75 cart with 5 cards was");
  assert.equal(q(10, 5).cents, 635);
  assert.equal(q(0.5, 1).cents, 0, "the measured one-card cart still is");
  assert.equal(q(150.75, 5).cents, 0);
  for (const v of [1, 10, 30, 60, 90]) {
    let prev = -1;
    for (let n = 1; n <= 15; n++) {
      const c = q(v, n).cents;
      assert.ok(c >= prev, `$${v}: ${n} cards quoted ${c}, fewer cards ${prev}`);
      prev = c;
    }
  }
});

test("an order bigger than any measured is 'from', and the optimiser counts postage that was rising", () => {
  const hub = probe("cardhub", "AU", [
    { id: "S1", v: 1.5, n: 1, rates: [["Singles Tracked Letter", 6]] },
    { id: "S10", v: 15, n: 10, rates: [["Singles Tracked Letter", 12]] },
    { id: "V50", v: 52.35, n: 1, rates: [["Singles Tracked Letter", 6]] },
  ]);
  const snap = snapshotOf(hub, OBSESSION);
  const big = shippingFor("cardhub", cart(40, 60), { region: "SA" }, snap);
  assert.equal(big.beyondMeasured, true);
  assert.equal(big.cents, 1200, "the quote is what was measured");
  assert.equal(big.riskCents, 3000, "$6 more per further 10 cards, for the optimiser");
  assert.equal(postagePrefix(big), "from ");
  assert.equal(`+ ${postagePrefix(big)}${big.cents}`.startsWith("+ from"), true);
  // 60 cards, each 10c cheaper at Card Hub: consolidating there looks $8 cheaper
  // on measured figures alone, but its postage was doubling by 10 cards.
  const cards: BasketCard[] = Array.from({ length: 60 }, (_, i) => ({
    cardId: `c${i}`,
    name: `Card ${i}`,
    slug: null,
    qty: 1,
    listings: [
      { retailer: "cardhub", retailerName: "Card Hub", priceCents: 50, url: "u" },
      { retailer: "obsessiongaming", retailerName: "Obsession", priceCents: 60, url: "u" },
    ],
  }));
  const plan = optimizeBasket(cards, basketStoresFor("AU", { region: "SA" }, snap));
  assert.deepEqual(plan.stores.map((s) => s.key), ["obsessiongaming"]);
  assert.equal(plan.shippingCents, 2000, "reported totals use the quote, not the risk");
  assert.deepEqual(planPostageNotes(plan, true), ["postage for 1 store is for a bigger order than we measured — at least this"]);
  const ui = read("src/components/BestBasket.tsx");
  assert.match(ui, /priced from the nearest order sizes each store&apos;s checkout quoted/);
  assert.doesNotMatch(ui, /own checkout rate for an order this size/);
});
