import { test } from "node:test";
import assert from "node:assert/strict";
import { isPickupOnly, pickupText } from "../src/lib/pickup-only";
import { priceOf, rowsFromReads } from "../src/lib/importer";
import type { FeedProduct } from "../src/lib/feeds";
import type { StoreConfig } from "../src/lib/stores";

// Real store wordings (2026-11-05, after a visitor reported a pre-order shown with a shipping price that its store page says is
// collected in store). A rule here may only refuse more, never loosen.
const PICKUP_ONLY = [
  "Magic: The Gathering | Star Trek - Play Booster Display - LOCAL PICKUP ONLY",
  "Edge of Eternities Bundle (In-Store Pickup Only)",
  "Final Fantasy Collector Booster Box - Store Pickup Only - Limit 1",
  "Tarkir Dragonstorm Play Booster Box – pick up only",
  "Innistrad Remastered Draft Booster Box - IN STORE ONLY",
  "Commander deck - Click & Collect only",
  "Secret Lair Bundle *collection only*",
  "Avatar Bundle - available for local pickup only",
  "Pre-release kit. This item is only available for pickup at our Richmond store.",
  "This product is for in-store collection only and cannot be shipped.",
  "Note: this preorder cannot be shipped. Collect from the shop from Friday.",
  "No shipping on this item: pickup in store only.",
  "Sealed case - This item does not ship.",
];

const POSTED = [
  "Magic: The Gathering | Star Trek - Play Booster Display",
  "Star Trek Bundle - Free shipping over $100",
  "Pickup available at Kingston Square, usually ready in 2 hours. Shipping: Nov 6.",
  "Play Booster Box. No shipping fees in the US!",
  "Collector Booster Box - Ships Nov 7. Local pickup also available.",
  "Pre-order: cannot be shipped to PO boxes. Cannot be shipped outside the US.",
  "We do not ship internationally. This item will not ship until release day.",
  "Collection: Final Fantasy. Only one per customer.",
  "In store and online. Free local pickup or flat-rate postage.",
  "Commander Collection: Green premium edition",
  "Edge of Eternities Bundle - releases Nov 6th; ships on release",
];

test("pickup-only wordings are refused", () => {
  for (const t of PICKUP_ONLY) assert.equal(isPickupOnly(t), true, t);
});

test("posted listings, and pickup merely offered, are kept", () => {
  for (const t of POSTED) assert.equal(isPickupOnly(t), false, t);
});

test("pickupText joins the title, tags and HTML description", () => {
  const text = pickupText(["Star Trek Bundle", "preorders, sealed", "<p>Pre-order.</p><p><strong>In-store pickup only.</strong></p>", null]);
  assert.equal(isPickupOnly(text), true);
  assert.equal(isPickupOnly(pickupText(["Star Trek Bundle", "pickup-only-tag-not-present", null])), false);
});

function prod(variants: FeedProduct["variants"], extra: Partial<FeedProduct> = {}): FeedProduct {
  return { id: "p", title: "Star Trek Play Booster Box", url: "https://s1.example/products/p", imageUrl: null, currency: null, variants, ...extra };
}

test("a variant the store never posts (requires_shipping false) is never the price; a pickup-only product has none", () => {
  // the posted variant is dearer: it is still the listing, and the pickup price is never shown with postage
  assert.deepEqual(priceOf(prod([{ priceCents: 10000, available: true, requiresShipping: false }, { priceCents: 11500, available: true, requiresShipping: true }]), 1000), {
    priceCents: 11500,
    inStock: true,
  });
  assert.equal(priceOf(prod([{ priceCents: 10000, available: true, requiresShipping: false }]), 1000), null);
  // a feed that does not say (Woo, older Shopify) is posted, as before
  assert.deepEqual(priceOf(prod([{ priceCents: 10000, available: true }]), 1000), { priceCents: 10000, inStock: true });
  assert.equal(priceOf(prod([{ priceCents: 10000, available: true, requiresShipping: true }], { pickupOnly: true }), 1000), null);
});

test("the importer leaves a pickup-only product out of the store's rows", () => {
  const store: StoreConfig = { key: "s1", name: "Store One", base: "https://s1.example", market: "US", platform: "shopify", country: "US", collections: ["mtg-sealed"] };
  const rows = rowsFromReads(store, [
    {
      handle: "mtg-sealed",
      ok: true,
      products: [
        prod([{ priceCents: 10000, available: true, requiresShipping: true }], { id: "a", url: "https://s1.example/products/a", pickupOnly: true }),
        prod([{ priceCents: 10500, available: true, requiresShipping: true }], { id: "b", url: "https://s1.example/products/b", title: "Star Trek Bundle" }),
      ],
    },
  ]);
  assert.deepEqual(
    rows.map((r) => r.url),
    ["https://s1.example/products/b"],
  );
});
