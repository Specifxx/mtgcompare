import test from "node:test";
import assert from "node:assert/strict";
import { STORES } from "../src/lib/stores";
import {
  PROBE_ADDRESSES,
  PROBE_MARKETS,
  backoffMs,
  candidateTier,
  cheapestRate,
  classifyRate,
  isMagicSinglesHandle,
  parseShippingRates,
  planCart,
  priceToCents,
  scenarioSpecs,
  shippingAddressQuery,
  summarizeStore,
  type CartCandidate,
  type ProbeRate,
  type ProbeScenarioResult,
} from "../src/lib/shipping-probe";

// scripts/probe-shipping-rates.ts measures real checkout postage per store
// (RiftCompare's probe, after an Adelaide customer was shown $2 postage and
// quoted $20, 2026-09-25; ported for OP Compare's stores). These pin the pure half.

// ── Addresses and scenarios ─────────────────────────────────────────────────

test("every market a tracked store sells in has probe addresses", () => {
  for (const r of STORES) {
    const m = r.country;
    assert.ok(PROBE_MARKETS.includes(m), `${r.key}: market ${m} has no probe addresses`);
    assert.ok(PROBE_ADDRESSES[m].length > 0);
  }
});

test("AU is probed at every state and territory capital, Adelaide included", () => {
  const au = PROBE_ADDRESSES.AU;
  assert.deepEqual(au.map((a) => `${a.province} ${a.zip}`).sort(), [
    "ACT 2600", "NSW 2000", "NT 0800", "QLD 4000", "SA 5000", "TAS 7000", "VIC 3000", "WA 6000",
  ]);
  for (const m of PROBE_MARKETS) {
    const ids = PROBE_ADDRESSES[m].map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length, `${m}: duplicate address id`);
  }
  // The EU market is four member states, not four Spanish cities.
  assert.deepEqual(PROBE_ADDRESSES.EU.map((a) => a.countryCode), ["ES", "DE", "FR", "NL"]);
});

test("shipping address query uses Shopify's bracketed keys", () => {
  const adl = PROBE_ADDRESSES.AU.find((a) => a.id === "adl")!;
  const q = new URLSearchParams(shippingAddressQuery(adl));
  assert.equal(q.get("shipping_address[zip]"), "5000");
  assert.equal(q.get("shipping_address[country]"), "Australia");
  assert.equal(q.get("shipping_address[province]"), "SA");
  assert.equal(new URLSearchParams(shippingAddressQuery(adl, true)).get("shipping_address[country]"), "AU");
  const lon = PROBE_ADDRESSES.UK.find((a) => a.id === "lon")!;
  assert.equal(new URLSearchParams(shippingAddressQuery(lon)).has("shipping_address[province]"), false);
});

test("scenarios: one card, ten cards, then the value ladder", () => {
  assert.deepEqual(scenarioSpecs().map((s) => s.id), ["S1", "S10", "V20", "V50", "V100", "V150"]);
  const custom = scenarioSpecs([30, 75]);
  assert.deepEqual(custom.map((s) => s.id), ["S1", "S10", "V30", "V75"]);
  assert.deepEqual(custom[3], { id: "V75", kind: "value", targetCents: 7500 });
});

// ── Rate classification ─────────────────────────────────────────────────────

const cls = (n: string) => classifyRate(n);

test("Cherry Collectables' real rate names classify as expected", () => {
  // Live 2026-09-25, Adelaide 5000, one card.
  assert.deepEqual(cls("Singles Untracked (3-7 Days)"), { service: "untracked", express: false, pickup: false });
  assert.deepEqual(cls("Singles Tracked (3-7 Days)"), { service: "tracked", express: false, pickup: false });
  assert.deepEqual(cls("Standard Post"), { service: "tracked", express: false, pickup: false });
  assert.deepEqual(cls("Express Post"), { service: "tracked", express: true, pickup: false });
});

test("negated tracking words mean untracked, not tracked", () => {
  assert.equal(cls("Canada Post First Class (NOT TRACKED/INSURED)").service, "untracked");
  assert.equal(cls("Non-Tracked Letter").service, "untracked");
  assert.equal(cls("Standard Letter - no tracking").service, "untracked");
  assert.equal(cls("Untracked").service, "untracked");
  // The first CA run: a negation the words above missed, and Quebec's French names.
  assert.equal(cls("Small Bubble Mailer (This Option Does Not Come With Tracking or Insurance)").service, "untracked");
  assert.equal(cls("Enveloppe sans suivi").service, "untracked");
  assert.equal(cls("Postes Canada Accéléré").service, "tracked");
  assert.equal(cls("Lettre - Tracking").service, "tracked");
  assert.equal(cls("CARD SINGLES ONLY - 100 MAX SINGLES - TRACKED - BUBBLE ENVELOPE (UPS/FEDEX/CANPOS)").service, "tracked");
});

test("an explicit 'tracked' beats a letter word; letter words alone mean untracked", () => {
  assert.equal(cls("Tracked Large Letter").service, "tracked");
  assert.equal(cls("48 Tracked Royal Mail").service, "tracked");
  assert.equal(cls("Large Letter").service, "untracked");
  assert.equal(cls("Royal Mail 2nd Class").service, "untracked");
  assert.equal(cls("Canada Post Lettermail").service, "untracked");
  assert.equal(cls("PWE (Plain White Envelope)").service, "untracked");
  assert.equal(cls("USPS First Class Package").service, "tracked");
});

test("parcel/courier names mean tracked; bare names stay unknown", () => {
  assert.equal(cls("Expedited Parcel").service, "tracked");
  assert.equal(cls("DPD").service, "tracked");
  assert.equal(cls("USPS Ground Advantage").service, "tracked");
  assert.equal(cls("Chitchats U.S. Edge with Signature Required").service, "tracked");
  assert.equal(cls("Standard").service, "unknown");
  assert.equal(cls("ChitChats Select").service, "unknown");
  assert.equal(cls("Free Shipping").service, "unknown");
  // The first EU run's parcel services, named in Dutch and Spanish.
  assert.equal(cls("PostNL – Brievenbuspakje").service, "tracked");
  assert.equal(cls("PostNL – Thuisbezorgd (verzekerd)").service, "tracked");
  assert.equal(cls("Correos - PAQ Premium").service, "tracked");
  assert.equal(cls("Correos-Paq Light Internacional").service, "tracked");
  assert.equal(cls("Standard Internazionale").service, "unknown");
  assert.equal(cls("Estándar 0-5kg").service, "unknown");
});

test("express letters, Signed For, Special Delivery and Smartpac are tracked services", () => {
  // The first AU run: Fluke & Box's "Express Letter" is Australia Post's
  // tracked Express Post envelope, not a buyer's-risk letter.
  assert.deepEqual(cls("AU Domestic Express Letter"), { service: "tracked", express: true, pickup: false });
  // The first UK run: Royal Mail's signature services and Special Delivery.
  assert.equal(cls("Royal Mail 1st Class Signed For - Letter").service, "tracked");
  assert.equal(cls("Royal Mail 48 Signed Letter").service, "tracked");
  assert.equal(cls("Signed For").service, "tracked");
  assert.equal(cls("Royal Mail Special Delivery Guaranteed by 1pm").service, "tracked");
  // The SG run: SingPost's tracked Smartpac.
  assert.equal(cls("Singpost Smartpac").service, "tracked");
  // Unchanged: plain letters, and an explicit "no tracking" even when express.
  assert.equal(cls("Royal Mail 2nd Class").service, "untracked");
  assert.equal(cls("Small Letter Sized").service, "untracked");
  assert.equal(cls("Express Letter (no tracking)").service, "untracked");
});

test("express flag", () => {
  assert.equal(cls("Express").express, true);
  assert.equal(cls("Canada Post Xpresspost").express, true);
  assert.equal(cls("24 Tracked Royal Mail").express, true);
  assert.equal(cls("48 Tracked Royal Mail").express, false);
  assert.equal(cls("Expedited Parcel").express, false);
});

test("pickup and local delivery are flagged; a store name with 'Collectables' is not", () => {
  for (const n of ["Local Pickup", "Store pick up", "Click & Collect", "Click and Collect", "Collect in store", "Local Delivery"]) {
    assert.equal(cls(n).pickup, true, n);
  }
  assert.equal(cls("Cherry Collectables Express").pickup, false);
  assert.equal(cls("Collectors Club Free Shipping").pickup, false);
});

// ── Parsing Shopify's payload ───────────────────────────────────────────────

const CHERRY_BODY = {
  shipping_rates: [
    { name: "Singles Untracked (3-7 Days)", presentment_name: "Singles Untracked (3-7 Days)", price: "2.00", currency: "AUD", source: "shopify" },
    { name: "Singles Tracked (3-7 Days)", price: "9.00", currency: "AUD", source: "shopify" },
    { name: "Standard Post", price: "9.00", currency: "AUD", source: "shopify" },
    { name: "Express Post", price: "15.00", currency: "AUD", source: "shopify" },
  ],
};

test("parseShippingRates reads a real Shopify body into cents", () => {
  const out = parseShippingRates(CHERRY_BODY, "AUD");
  assert.equal(out.status, "ok");
  assert.deepEqual(out.rates.map((r) => [r.name, r.cents, r.currency, r.service]), [
    ["Singles Untracked (3-7 Days)", 200, "AUD", "untracked"],
    ["Singles Tracked (3-7 Days)", 900, "AUD", "tracked"],
    ["Standard Post", 900, "AUD", "tracked"],
    ["Express Post", 1500, "AUD", "tracked"],
  ]);
  assert.equal(out.rates[0].source, "shopify");
});

test("parseShippingRates: empty list, validation error, missing currency", () => {
  assert.deepEqual(parseShippingRates({ shipping_rates: [] }, "AUD"), { status: "empty", rates: [] });
  const err = parseShippingRates({ zip: ["is not valid for Australia"] }, "AUD");
  assert.equal(err.status, "error");
  assert.match((err as { error: string }).error, /zip: is not valid for Australia/);
  assert.equal(parseShippingRates(null, "AUD").status, "error");
  const noCur = parseShippingRates({ shipping_rates: [{ name: "Standard", price: "10.00" }] }, "GBP");
  assert.equal(noCur.rates[0].currency, "GBP");
  // A rate with an unreadable price is dropped rather than read as free.
  assert.equal(parseShippingRates({ shipping_rates: [{ name: "Weird", price: "N/A" }] }, "AUD").status, "empty");
});

test("priceToCents", () => {
  assert.equal(priceToCents("2.00"), 200);
  assert.equal(priceToCents("15"), 1500);
  assert.equal(priceToCents("0.99"), 99);
  assert.equal(priceToCents(2.5), 250);
  assert.equal(priceToCents("abc"), null);
  assert.equal(priceToCents("-1.00"), null);
  assert.equal(priceToCents(undefined), null);
});

const rate = (name: string, cents: number, currency = "AUD"): ProbeRate => ({ name, cents, currency, ...classifyRate(name) });

test("a $0 pickup is not free postage, and another currency is never mixed in", () => {
  const rates = [rate("Local Pickup", 0), rate("Standard Post", 900), rate("Letter", 150, "USD")];
  assert.equal(cheapestRate(rates, "AUD")?.name, "Standard Post");
  assert.equal(cheapestRate(rates, "AUD", "untracked"), null);
});

// ── Choosing a cart ─────────────────────────────────────────────────────────

const cand = (id: number, cents: number, tier: 0 | 1 = 0): CartCandidate => ({ id, priceCents: cents, title: `c${id}`, tier });

test("candidateTier: in-stock singles in, playsets as fallback, slabs/sealed/out-of-stock out", () => {
  const base = { available: true, priceCents: 99 };
  assert.equal(candidateTier({ ...base, productTitle: "Nami - OP01-016 - Rare" }), 0);
  assert.equal(candidateTier({ ...base, productTitle: "PLAYSET (4) 4x Nami OP01-016" }), 1);
  assert.equal(candidateTier({ ...base, productTitle: "Shanks OP01-120 PSA 10" }), null);
  assert.equal(candidateTier({ ...base, productTitle: "Romance Dawn Booster Box [OP-01]" }), null);
  assert.equal(candidateTier({ ...base, available: false, productTitle: "Nami - OP01-016" }), null);
  assert.equal(candidateTier({ ...base, priceCents: 0, productTitle: "Nami - OP01-016" }), null);
  assert.equal(candidateTier({ ...base, requiresShipping: false, productTitle: "Nami - OP01-016" }), null);
  // Sealed titles without "box"/"pack": a parcel, not a card.
  assert.equal(candidateTier({ ...base, productTitle: "One Piece Card Game - Starter Deck 01: Straw Hat Crew [ST-01]" }), null);
  assert.equal(candidateTier({ ...base, productTitle: "One Piece Card Game Premium Card Collection - Best Selection Vol.2" }), null);
  assert.equal(candidateTier({ ...base, productTitle: "One Piece Card Game - Double Pack Set Vol.5 [DP-05]" }), null);
  assert.equal(candidateTier({ ...base, productTitle: "One Piece Card Game Gift Collection 2024" }), null);
  // …but a single from a starter deck is still a single (it names its number).
  assert.equal(candidateTier({ ...base, productTitle: "Monkey.D.Luffy - ST01-001 (Starter Deck 01) - NM" }), 0);
  assert.equal(candidateTier({ ...base, productTitle: "Roronoa Zoro (Parallel) [Romance Dawn] OP01-025" }), 0);
  // Playmats, sleeves, dice, figures, Japanese cards and event entries.
  assert.equal(candidateTier({ ...base, productTitle: "One Piece Card Game Official Playmat - Luffy" }), null);
  assert.equal(candidateTier({ ...base, productTitle: "One Piece Official Sleeves - Zoro (70)" }), null);
  assert.equal(candidateTier({ ...base, productTitle: "Mystery Dice Set – Random 7-Piece Polyhedral Dice with Dice Bag" }), null);
  assert.equal(candidateTier({ ...base, productTitle: "Events - One Piece Store Treasure Cup - Saturday" }), null);
  assert.equal(candidateTier({ ...base, productTitle: "Nami OP01-016 Japanese" }), null);
  // EU stores' own words for playmats and sleeves.
  assert.equal(candidateTier({ ...base, productTitle: "Tapete One Piece — Luffy", variantTitle: "English / Normal" }), null);
  assert.equal(candidateTier({ ...base, productTitle: "Fundas One Piece (70) – Nami", variantTitle: "English / Normal" }), null);
  assert.equal(candidateTier({ ...base, productTitle: "Nami (OP01-016) Near Mint Englisch" }), 0);
});

test("count scenarios take the cheapest distinct singles, playsets only when singles run out", () => {
  const pool = [cand(1, 50), cand(2, 20, 1), cand(3, 30), cand(4, 10)];
  assert.deepEqual(planCart(pool, { kind: "count", count: 1 }), [{ id: 4, quantity: 1 }]);
  assert.deepEqual(planCart(pool, { kind: "count", count: 3 }), [
    { id: 4, quantity: 1 },
    { id: 3, quantity: 1 },
    { id: 1, quantity: 1 },
  ]);
  assert.deepEqual(planCart(pool, { kind: "count", count: 4 }).map((l) => l.id), [4, 3, 1, 2]);
  // More cards wanted than distinct variants: extra copies, round-robin.
  const tiny = [cand(1, 10), cand(2, 20)];
  assert.deepEqual(planCart(tiny, { kind: "count", count: 5 }), [
    { id: 1, quantity: 3 },
    { id: 2, quantity: 2 },
  ]);
  // A top-up never re-picks a variant already tried.
  assert.deepEqual(planCart(pool, { kind: "count", count: 1 }, { exclude: new Set([4]) }), [{ id: 3, quantity: 1 }]);
  assert.deepEqual(planCart([], { kind: "count", count: 1 }), []);
});

const sum = (pool: CartCandidate[], lines: { id: number; quantity: number }[]) =>
  lines.reduce((s, l) => s + pool.find((c) => c.id === l.id)!.priceCents * l.quantity, 0);

test("value rungs reach the target with few cards and a bounded overshoot", () => {
  const pool = [cand(1, 4000), cand(2, 1500), cand(3, 900), cand(4, 500), cand(5, 99), cand(6, 99), cand(7, 2500)];
  // $40 + $15, not $40 + $9 + $0.99 + $0.99: one closing card within 10%.
  const v50 = planCart(pool, { kind: "value", targetCents: 5000 });
  assert.deepEqual(v50.map((l) => l.id).sort(), [1, 2]);
  assert.ok(sum(pool, v50) >= 5000, "a rung must not land under its target");
  const v20 = planCart(pool, { kind: "value", targetCents: 2000 });
  assert.equal(sum(pool, v20), 2000);
  assert.ok(v20.length <= 2);
});

test("a thin store's $1,199 card never closes a $100 rung (Cherry, first live run)", () => {
  // Cherry 2026-09-25: dozens of 0.99 cards, two ~$10 cards, one $1,199.99 signature.
  const pool = [...Array.from({ length: 50 }, (_, i) => cand(100 + i, 99)), cand(1, 999), cand(2, 1199), cand(3, 119999)];
  const v100 = planCart(pool, { kind: "value", targetCents: 10000 }, { maxItems: 40 });
  assert.ok(!v100.some((l) => l.id === 3), "the $1,199.99 card overshoots by more than half the target");
  assert.ok(sum(pool, v100) < 10000, "short is the honest outcome here");
  assert.ok(v100.length <= 40);
});

test("value rungs use playsets only when singles cannot reach the target", () => {
  const singlesEnough = [cand(1, 3000), cand(2, 2500), cand(3, 6000, 1)];
  assert.ok(!planCart(singlesEnough, { kind: "value", targetCents: 5000 }).some((l) => l.id === 3));
  const singlesShort = [cand(1, 1000), cand(3, 6000, 1)];
  assert.ok(planCart(singlesShort, { kind: "value", targetCents: 5000 }).some((l) => l.id === 3));
});

// ── Summary ─────────────────────────────────────────────────────────────────

const AU = PROBE_ADDRESSES.AU;
function scenario(id: string, subtotalCents: number, items: number, perAddr: (addrId: string) => ProbeRate[]): ProbeScenarioResult {
  const byAddress: ProbeScenarioResult["byAddress"] = {};
  for (const a of AU) {
    const rates = perAddr(a.id);
    byAddress[a.id] = rates.length ? { status: "ok", rates } : { status: "empty", rates: [] };
  }
  return { id, kind: id.startsWith("V") ? "value" : "count", subtotalCents, items, cartCurrency: "AUD", byAddress };
}

test("summary: the Adelaide case — $2 in Sydney, $20 in Adelaide — is zone-priced", () => {
  const s1 = scenario("S1", 99, 1, (a) => (a === "adl" ? [rate("Standard Post", 2000)] : [rate("Letter", 200), rate("Standard Post", 900)]));
  const sum1 = summarizeStore([s1], AU, "AUD");
  assert.equal(sum1.zonePriced, true);
  assert.equal(sum1.byAddress.syd.oneCardCents, 200);
  assert.equal(sum1.byAddress.adl.oneCardCents, 2000);
  assert.equal(sum1.oneCardMinCents, 200);
  assert.equal(sum1.oneCardMaxCents, 2000);
});

test("summary: a flat letter rate over zone-priced parcels still counts as zone-priced", () => {
  const s1 = scenario("S1", 29, 1, (a) => [rate("First Class (NOT TRACKED)", 261), rate("Expedited Parcel", a === "per" ? 1613 : 1157)]);
  assert.equal(summarizeStore([s1], AU, "AUD").zonePriced, true);
  const flat = scenario("S1", 29, 1, () => [rate("First Class (NOT TRACKED)", 261), rate("Expedited Parcel", 1157)]);
  assert.equal(summarizeStore([flat], AU, "AUD").zonePriced, false);
});

test("summary: free threshold bracket, untracked cut-off, pickup never counts as free", () => {
  const scenarios = [
    scenario("S1", 99, 1, () => [rate("Local Pickup", 0), rate("Singles Untracked", 200), rate("Tracked", 900)]),
    scenario("S10", 990, 10, () => [rate("Local Pickup", 0), rate("Tracked", 900)]),
    scenario("V50", 5078, 3, () => [rate("Tracked", 900)]),
    scenario("V100", 10020, 4, () => [rate("Free Tracked Shipping", 0), rate("Tracked", 900)]),
  ];
  const s = summarizeStore(scenarios, AU, "AUD").byAddress.adl;
  assert.equal(s.oneCardCents, 200, "the $0 pickup is not the one-card postage");
  assert.equal(s.oneCardTrackedCents, 900);
  assert.equal(s.freeAtCents, 10020);
  assert.equal(s.paidAtCents, 5078);
  assert.deepEqual(s.untrackedGoneAt, { scenario: "S10", subtotalCents: 990, items: 10 });
});

test("summary ignores carts in the wrong currency and re-used carts", () => {
  const usd = { ...scenario("S1", 99, 1, () => [rate("Letter", 100, "USD")]), cartCurrency: "USD" };
  const s = summarizeStore([usd], AU, "AUD");
  assert.equal(s.byAddress.syd.oneCardCents, null);
  const reused = { ...scenario("V150", 0, 0, () => []), sameCartAs: "V100" };
  assert.equal(summarizeStore([reused], AU, "AUD").byAddress.syd.freeAtCents, null);
});

// ── Discovery and politeness ────────────────────────────────────────────────

test("sitemap fallback keeps One Piece singles handles only", () => {
  assert.equal(isMagicSinglesHandle("one-piece-singles"), true);
  assert.equal(isMagicSinglesHandle("one-piece-romance-dawn-singles"), true);
  assert.equal(isMagicSinglesHandle("one-piece-booster-box"), false);
  assert.equal(isMagicSinglesHandle("all-singles-one-piece-pokemon-riftbound"), false);
  assert.equal(isMagicSinglesHandle("one-piece-starter-decks"), false);
  assert.equal(isMagicSinglesHandle("pokemon-paradox-rift"), false);
});

test("backoff honours Retry-After, else grows exponentially with a cap", () => {
  assert.equal(backoffMs(0, "5"), 5000);
  assert.equal(backoffMs(0, "600"), 90_000);
  const now = Date.parse("2026-09-25T00:00:00Z");
  assert.equal(backoffMs(0, "Fri, 25 Sep 2026 00:00:10 GMT", now), 10_000);
  assert.equal(backoffMs(0, null, now, () => 0), 3000);
  assert.equal(backoffMs(2, null, now, () => 0), 12_000);
  assert.equal(backoffMs(10, null, now, () => 0), 60_000);
  assert.ok(backoffMs(1, null, now, () => 1) <= 6000 * 1.25);
});
