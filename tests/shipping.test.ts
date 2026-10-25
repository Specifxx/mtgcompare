// Measured shipping: the probe's parsing (lib/shipping-probe.ts), the rate a row shows (lib/shipping-quote.ts) and the
// "Price + shipping" re-ranking (lib/shipping-rank.ts). Real numbers below are from the first probe run (2026-10-25).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROBE_ADDRESSES,
  backoffMs,
  cheapestPostage,
  isCandidate,
  mergeSnapshots,
  parseShippingRates,
  planItems,
  priceToCents,
  shippingAddressQuery,
  validSnapshot,
  type StoreShipping,
} from "../src/lib/shipping-probe";
import { quoteAt, shipCell } from "../src/lib/shipping-quote";
import { ebayIndexTotal, rankRows } from "../src/lib/shipping-rank";

test("parseShippingRates reads Shopify's rates, its empty answer and its validation errors", () => {
  const ok = parseShippingRates(
    { shipping_rates: [{ name: "Australia Post Parcel", price: "15.00", currency: "AUD" }, { name: "Local Pickup", price: "0.00" }, { name: "Express", price: "22.5" }] },
    "AUD",
  );
  assert.equal(ok.status, "ok");
  assert.deepEqual(ok.rates.map((r) => [r.cents, r.pickup]), [[1500, false], [0, true], [2250, false]]);
  // pickup is never "free shipping"
  assert.equal(cheapestPostage(ok, "AUD"), 1500);
  assert.equal(cheapestPostage(ok, "USD"), null);
  assert.equal(parseShippingRates({ shipping_rates: [] }, "AUD").status, "empty");
  const err = parseShippingRates({ zip: ["is not valid for Australia"] }, "AUD");
  assert.equal(err.status, "error");
  assert.match(err.status === "error" ? err.error : "", /zip: is not valid/);
  assert.equal(parseShippingRates("nope", "AUD").status, "error");
  assert.equal(cheapestPostage(undefined, "AUD"), null);
});

test("priceToCents, the address query and the NZ addresses", () => {
  assert.equal(priceToCents("9.95"), 995);
  assert.equal(priceToCents(7), 700);
  assert.equal(priceToCents("-1"), null);
  assert.equal(priceToCents("abc"), null);
  assert.equal(PROBE_ADDRESSES.NZ.length, 4);
  assert.match(shippingAddressQuery(PROBE_ADDRESSES.NZ[2]), /zip%5D=8011.*country%5D=New\+Zealand/);
  assert.match(shippingAddressQuery(PROBE_ADDRESSES.NZ[2], true), /country%5D=NZ/);
  assert.ok(backoffMs(0, "5") === 5000 && backoffMs(9, null, 0, () => 0) === 60_000);
});

test("planItems: the cheapest item, then one per rung within 1.6x of it, each once", () => {
  const c = (id: number, d: number) => ({ id, priceCents: d * 100, title: `#${id}` });
  const items = planItems([c(1, 595), c(2, 7), c(3, 50), c(4, 160), c(5, 80), c(6, 81)]);
  assert.deepEqual(items.map((i) => i.id), [2, 3, 5, 4]); // 300 rung: 595 is over 1.6x, left out
  assert.deepEqual(planItems([]), []);
  assert.equal(isCandidate({ productTitle: "Gift Card", available: true, priceCents: 5000 }), false);
  assert.equal(isCandidate({ productTitle: "Bloomburrow Play Booster Box", available: false, priceCents: 5000 }), false);
  assert.equal(isCandidate({ productTitle: "Bloomburrow Play Booster Box", available: true, priceCents: 5000, requiresShipping: false }), false);
  assert.equal(isCandidate({ productTitle: "Bloomburrow Play Booster Box", available: true, priceCents: 5000 }), true);
});

// 401 Games (CA), measured 2026-10-25: paid by province up to C$89.95, free from C$150.
const games401: StoreShipping = {
  market: "CA",
  currency: "CAD",
  measuredAt: "2026-10-25T00:00:00Z",
  points: [
    { subtotalCents: 2495, rates: { tor: 1095, van: 1495, mtl: 1095, cgy: 1395 } },
    { subtotalCents: 8995, rates: { tor: 1095, van: 1495, mtl: 1095, cgy: 1395 } },
    { subtotalCents: 15000, rates: { tor: 0, van: 0, mtl: 0, cgy: 0 } },
  ],
};
const ca = ["tor", "van", "mtl", "cgy"];
const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

test("quoteAt: the range across addresses, a threshold between two measured items as a range, nothing under the cheapest", () => {
  assert.deepEqual(
    (({ minCents, maxCents, freeAtCents, addresses }) => ({ minCents, maxCents, freeAtCents, addresses }))(quoteAt(games401, ca, 5000)!),
    { minCents: 1095, maxCents: 1495, freeAtCents: 15000, addresses: 4 },
  );
  // C$120 lies between a paid C$89.95 and a free C$150: the threshold may be under it, so free to C$14.95
  const mid = quoteAt(games401, ca, 12000)!;
  assert.equal(mid.minCents, 0);
  assert.equal(mid.maxCents, 1495);
  assert.equal(quoteAt(games401, ca, 20000)!.maxCents, 0);
  // exactly a measured price: that measurement, no range
  assert.equal(quoteAt(games401, ca, 8995)!.minCents, 1095);
  // under the cheapest measured item: unknown (never extrapolated)
  assert.equal(quoteAt(games401, ca, 1000), null);
  assert.equal(quoteAt(games401, ca, 0), null);
  // an address the store does not ship to is left out, not counted as free
  const partial: StoreShipping = { ...games401, points: [{ subtotalCents: 2495, rates: { tor: 1095, van: null, mtl: null, cgy: null } }] };
  assert.deepEqual([quoteAt(partial, ca, 3000)!.addresses, quoteAt(partial, ca, 3000)!.maxCents], [1, 1095]);
});

test("shipCell: the row's words", () => {
  assert.equal(shipCell(quoteAt(games401, ca, 5000), fmt, "Canada")!.text, "+ $10.95–$14.95 shipping");
  assert.equal(shipCell(quoteAt(games401, ca, 5000), fmt, "Canada")!.hint, " · free at $150.00");
  assert.match(shipCell(quoteAt(games401, ca, 5000), fmt, "Canada")!.title, /4 addresses in Canada: \$10\.95 to \$14\.95 depending on where you are\. Free at \$150\.00 and over\. The store's checkout is final\./);
  assert.equal(shipCell(quoteAt(games401, ca, 12000), fmt, "Canada")!.text, "Free–$14.95 shipping");
  assert.equal(shipCell(quoteAt(games401, ca, 20000), fmt, "Canada")!.text, "Free shipping");
  const flat: StoreShipping = { ...games401, points: [{ subtotalCents: 1000, rates: { tor: 995 } }] };
  assert.equal(shipCell(quoteAt(flat, ca, 5000), fmt, "Canada")!.text, "+ $9.95 shipping");
  assert.equal(shipCell(null, fmt, "Canada"), null);
});

test("rankRows: price keeps the server's order; total ranks known shipping by price + cheapest shipping, unknown after, closed last", () => {
  const row = (key: string, cents: number, ship: number | null, open = true) => ({ key, cents, open, ship: ship == null ? null : { min: ship } });
  const rows = [row("a", 5000, 2000), row("b", 5500, 0), row("c", 5600, null), row("d", 6000, 500), row("e", 4000, 0, false)];
  assert.deepEqual(rankRows(rows, "price").map((r) => r.key), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(rankRows(rows, "total").map((r) => r.key), ["b", "d", "a", "c", "e"]);
  // the eBay row in "total": among the unknown-shipping open rows by price, after every known one
  const ranked = rankRows(rows, "total");
  assert.equal(ebayIndexTotal(ranked, 1000), 3);
  assert.equal(ebayIndexTotal(ranked, 9000), 4);
  assert.equal(ebayIndexTotal(ranked, null), 4);
});

test("snapshots: validation drops malformed or rate-less stores; a merge keeps a recent old measurement and drops delisted stores", () => {
  assert.deepEqual(validSnapshot(null).stores, {});
  assert.deepEqual(validSnapshot({ version: 2, stores: {} }).stores, {});
  const v = validSnapshot({ version: 1, generatedAt: null, addresses: {}, stores: { ok: games401, bad: { ...games401, market: "XX" }, none: { ...games401, points: [{ subtotalCents: 100, rates: { tor: null } }] }, neg: { ...games401, points: [{ subtotalCents: 100, rates: { tor: -5 } }] } } });
  assert.deepEqual(Object.keys(v.stores), ["ok"]);
  const now = new Date("2026-11-01T00:00:00Z");
  const prev = validSnapshot({ version: 1, generatedAt: null, addresses: {}, stores: { old: games401, stale: { ...games401, measuredAt: "2026-08-01T00:00:00Z" }, gone: games401 } });
  const merged = mergeSnapshots(prev, { fresh: games401 }, new Set(["old", "stale", "fresh"]), now);
  assert.deepEqual(Object.keys(merged.stores), ["fresh", "old"]);
  assert.equal(merged.addresses.NZ?.length, 4);
});

test("the committed snapshot is valid (an empty one until the weekly workflow writes it)", () => {
  const raw = JSON.parse(readFileSync(new URL("../src/data/shipping-rates.json", import.meta.url), "utf8"));
  assert.equal(raw.version, 1);
  assert.equal(Object.keys(validSnapshot(raw).stores).length, Object.keys(raw.stores).length);
});

test("the price table: the tax line, the switch at Price, and 'Shipping at checkout' on a store with no measurement", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  (globalThis as unknown as { React: unknown }).React = React;
  const { OfferTable } = await import("../src/components/OfferTable");
  const offer = (store: string, priceCents: number) => ({ store, storeName: store, storeHost: `${store}.example`, title: store, url: `https://${store}.example/p`, priceCents, inStock: true, lastSeen: new Date().toISOString(), marketplace: false });
  const err = console.error;
  console.error = () => {};
  let us = "";
  let au = "";
  try {
    us = renderToStaticMarkup(React.createElement(OfferTable, { offers: [offer("nosuchstore", 5000)], region: "us", preorder: false }));
    au = renderToStaticMarkup(React.createElement(OfferTable, { offers: [offer("nosuchstore", 5000)], region: "au", preorder: false }));
  } finally {
    console.error = err;
  }
  assert.match(us, /US prices exclude sales tax/);
  assert.match(au, /Australian stores list prices including GST/);
  assert.match(us, /aria-pressed="true"[^>]*>Price<\/button>/);
  assert.match(us, />Price \+ shipping<\/button>/);
  assert.match(us, /Shipping at checkout/);
  assert.match(us, /import duties/);
});
