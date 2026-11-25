import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planBasket, type BasketCard } from "../src/lib/basket-optimize";
import { BASKET_ROW_MAX_AGE_H, basketListings, basketStores, basketSummary, cleanLines, measuredPostage } from "../src/lib/basket-server";
import type { PostageQuote } from "../src/lib/postage";
import type { OfferView } from "../src/lib/data";
import { basketLinesFrom } from "../src/components/basket/BestBasketView";
import type { CartLine } from "../src/lib/cart-list";

const NOW = Date.parse("2026-11-25T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const offer = (o: Partial<OfferView>): OfferView => ({
  store: "a",
  storeName: "Store A",
  storeHost: "a.com",
  title: "Foundations Play Booster Box",
  url: "https://a.com/products/fdn-box?variant=1",
  priceCents: 20000,
  inStock: true,
  lastSeen: hoursAgo(2),
  marketplace: false,
  ...o,
});

test("a basket uses in-stock store rows read in the last 48 hours, never a marketplace or a pre-order", () => {
  const rows = basketListings(
    {
      setCode: null,
      offers: [
        offer({ store: "a", priceCents: 20000 }),
        offer({ store: "a", priceCents: 19000, inStock: false }), // sold out: never
        offer({ store: "b", priceCents: 15000, lastSeen: hoursAgo(BASKET_ROW_MAX_AGE_H + 1) }), // stale: never
        offer({ store: "c", priceCents: 14000, title: "Foundations Play Booster Box (Pre-Order)" }), // pre-order: never
        offer({ store: "tcgplayer", priceCents: 13000, marketplace: true }), // marketplace: never
        offer({ store: "d", priceCents: 21000, lastSeen: hoursAgo(47) }),
      ],
    },
    NOW,
  );
  assert.deepEqual(
    rows.map((r) => [r.retailer, r.priceCents]),
    [
      ["a", 20000],
      ["d", 21000],
    ],
  );
});

test("an unreleased set's product has no basket rows at all", () => {
  assert.equal(basketListings({ setCode: "nau", offers: [offer({})] }, NOW).length, 0); // nau releases 5 Feb 2027
  assert.equal(basketListings({ setCode: "no-such-set", offers: [offer({})] }, NOW).length, 1);
});

test("the request is cleaned: one line per product, quantities capped, junk dropped", () => {
  assert.deepEqual(cleanLines([{ slug: "Box-1", qty: 2 }, { slug: "box-1", qty: 5 }, { slug: "../etc", qty: 1 }, { slug: "b", qty: 99 }, null]), [
    { slug: "box-1", qty: 5 },
    { slug: "b", qty: 20 },
  ]);
  assert.deepEqual(cleanLines("nope"), []);
});

test("measured postage: the dearest address, free over the measured threshold, 'up to' when more than one item", () => {
  const shipping = { stores: { a: { market: "US", points: [{ subtotalCents: 1000 }] } } } as never;
  const quote = (_k: string, _m: string, cents: number) =>
    cents >= 15000
      ? { minCents: 0, maxCents: 0, freeAtCents: null, addresses: 3, ofAddresses: 3, measuredAt: "2026-11-20" }
      : { minCents: 800, maxCents: 1200, freeAtCents: 15000, addresses: 3, ofAddresses: 3, measuredAt: "2026-11-20" };
  const post = measuredPostage("a", "US", quote, shipping)!;
  const one = post({ subtotalCents: 5000, items: 1 });
  assert.equal(one.cents, 1200);
  assert.equal(one.upTo, true);
  assert.equal(one.freeFromCents, 15000);
  assert.equal(one.basis, "measured");
  assert.equal(post({ subtotalCents: 9000, items: 2 }).beyondMeasured, true);
  assert.equal(post({ subtotalCents: 20000, items: 2 }).free, true);
  // Another market's store, or one we never measured, has no postage: the basket leaves it out.
  assert.equal(measuredPostage("a", "AU", quote, shipping), null);
  assert.equal(measuredPostage("zz", "US", quote, shipping), null);
});

test("an unmeasured store is left out with its reason, never priced at zero shipping", () => {
  const cards: BasketCard[] = [{ cardId: "1", name: "Box", slug: "box", qty: 1, listings: [{ retailer: "cheap", priceCents: 100, url: "https://cheap/x" }, { retailer: "a", priceCents: 200, url: "https://a/x" }] }];
  const flat = (): PostageQuote => ({ cents: 500, label: "Measured shipping", tracked: null, basis: "measured", free: false, upTo: false });
  const stores = basketStores(cards, new Map([["a", "Store A"], ["cheap", "Cheap"]]), "US", (k) => (k === "a" ? flat : null));
  const { plan } = planBasket(cards, stores);
  assert.equal(plan.stores[0].key, "a");
  assert.equal(plan.totalCents, 700);
  assert.deepEqual(plan.excludedStores.map((x) => x.key), ["cheap"]);
});

test("the solver splits across stores only when shipping says so", () => {
  const ship = (cents: number, freeAt?: number) => (cart: { subtotalCents: number }): PostageQuote => {
    const free = freeAt != null && cart.subtotalCents >= freeAt;
    return { cents: free ? 0 : cents, label: "", tracked: null, basis: "measured", free, upTo: false, ...(freeAt && !free ? { freeFromCents: freeAt } : {}) };
  };
  const cards: BasketCard[] = [
    { cardId: "1", name: "Box", slug: "box", qty: 1, listings: [{ retailer: "a", priceCents: 10000, url: "u" }, { retailer: "b", priceCents: 10500, url: "u" }] },
    { cardId: "2", name: "ETB", slug: "etb", qty: 1, listings: [{ retailer: "a", priceCents: 5200, url: "u" }, { retailer: "b", priceCents: 5000, url: "u" }] },
  ];
  // b is free over $150: both at b ($155) beats a ($152 + $10) and the split ($100 + $10 + $50 + $10).
  const { plan } = planBasket(cards, { a: { name: "A", postage: ship(1000) }, b: { name: "B", postage: ship(1000, 15000) } });
  assert.equal(plan.storeCount, 1);
  assert.equal(plan.stores[0].key, "b");
  assert.equal(plan.totalCents, 15500);
  assert.equal(plan.naiveTotalCents, 17000);
  assert.equal(plan.savedCents, 1500);
});

test("a visitor without Premium gets the totals, never the store-by-store plan", () => {
  const cards: BasketCard[] = [{ cardId: "1", name: "Box", slug: "box", qty: 1, listings: [{ retailer: "a", priceCents: 100, url: "https://a/x" }] }];
  const result = planBasket(cards, { a: { name: "A", postage: () => ({ cents: 0, label: "", tracked: null, basis: "measured", free: true, upTo: false }) } });
  const s = basketSummary({ result, missing: [], products: [] }) as Record<string, unknown>;
  assert.equal(s.totalCents, 100);
  for (const k of ["stores", "plan", "alternatives", "excludedStores"]) assert.ok(!(k in s), k);
  const route = readFileSync("src/app/api/basket/[region]/route.ts", "utf8");
  assert.match(route, /premium\s*\?\s*\{[^}]*plan: basket\.result\.plan/);
  assert.match(route, /:\s*\{ premium: false, summary, products: basket\.products, missing: basket\.missing \}/);
  assert.match(route, /"Cache-Control": "no-store"/);
});

test("the shortlist gives one line per product of the page's region", () => {
  const line = (page: string, qty = 1) => ({ page, qty }) as CartLine;
  assert.deepEqual(basketLinesFrom([line("/us/p/box", 1), line("/us/p/box", 2), line("/au/p/etb"), line("/us/p/etb/"), line("/us/sets/x")], "us"), [
    { slug: "box", qty: 2 },
    { slug: "etb", qty: 1 },
  ]);
});

test("the Premium plan's buy links go through the site's own tagged links", () => {
  const src = readFileSync("src/lib/basket-server.ts", "utf8");
  assert.match(src, /offerLink\(key, url, region, "best-basket"\)/);
});

test("a plan line's cart permalink carries its quantity, and a store's permalinks merge into one checkout", async () => {
  const { withQty, storeCheckout } = await import("../src/lib/basket-server");
  assert.equal(withQty("https://a.com/cart/123456789:1?utm_source=dexcompare", 3), "https://a.com/cart/123456789:3?utm_source=dexcompare");
  assert.equal(withQty("https://a.com/en-au/cart/123456789:1", 2), "https://a.com/en-au/cart/123456789:2");
  assert.equal(withQty("https://a.com/products/box?variant=1", 2), "https://a.com/products/box?variant=1");
  const c = storeCheckout([
    { url: "https://a.com/cart/111111111:1?utm_source=dexcompare", qty: 1 },
    { url: "https://a.com/cart/222222222:2?utm_source=dexcompare", qty: 2 },
  ]);
  assert.match(c!, /^https:\/\/a\.com\/cart\/111111111:1,222222222:2\?utm_source=/);
  assert.equal(storeCheckout([{ url: "https://a.com/cart/111111111:1", qty: 1 }, { url: "https://a.com/products/x", qty: 1 }]), null);
  assert.equal(storeCheckout([{ url: "https://a.com/cart/111111111:1", qty: 1 }]), null);
});
