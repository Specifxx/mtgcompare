import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROBE_ADDRESSES, classifyRate, type ProbeScenarioResult } from "../src/lib/shipping-probe";
import { SHIPPING_OVERRIDES, condenseStore, roundAtCheckout, type ProbeStoreInput, type ShippingSnapshot } from "../src/lib/shipping-snapshot";
import {
  SHIPPING_REGIONS,
  SHIPPING_SNAPSHOT,
  basketStoresFor,
  marketHasZonePricing,
  postageOptionsFrom,
  regionFromGeo,
  regionOptionsFor,
  shippingFor,
  shippingNoteFor,
  shippingSummary,
} from "../src/lib/shipping";
import { optimizeBasket } from "../src/lib/basket";
import { freePrefix, planPostageNotes, postageLineBits, postagePrefix } from "../src/lib/postage-display";
import { effectiveRegion } from "../src/lib/postage-prefs";
import { STORE_BY_KEY } from "../src/lib/stores";

// ─────────────────────────────────────────────────────────────────────────────
// US buyers first-class (2026-09-25). The US is the biggest market, so its
// postage has to read the way an American would say it — Census regions, each
// priced to the city (or the dearer of the cities) measured for it,
// preselected from the visitor's state
// — and the model has to handle what is specific to US stores: USPS
// First-Class letters that vanish as an order grows, carrier-calculated
// Ground Advantage that varies by zone, "Standard"/"Economy" names that do not
// say whether they are tracked, stores in the US market posting from Canada,
// and free-shipping thresholds applied from the measured cart, never a
// guessed $35/$50/$75/$100.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const cart = (dollars: number, items: number) => ({ subtotalCents: Math.round(dollars * 100), items });
type Rates = [name: string, dollars: number][];

function probeUS(key: string, carts: { id: string; v: number; n: number; rates: (addr: string) => Rates }[]): ProbeStoreInput {
  const addresses = PROBE_ADDRESSES.US;
  const scenarios: ProbeScenarioResult[] = carts.map((c) => {
    const byAddress: ProbeScenarioResult["byAddress"] = {};
    for (const a of addresses) {
      byAddress[a.id] = { status: "ok", rates: c.rates(a.id).map(([name, d]) => ({ name, cents: Math.round(d * 100), currency: "USD", ...classifyRate(name) })) };
    }
    return { id: c.id, kind: c.id.startsWith("S") ? "count" : "value", subtotalCents: Math.round(c.v * 100), items: c.n, cartCurrency: "USD", byAddress };
  });
  return { key, market: "US", currency: "USD", measuredAt: "2026-09-25T04:00:00.000Z", addresses, scenarios };
}
const snapOf = (...s: ProbeStoreInput[]): ShippingSnapshot => ({
  version: 1,
  note: "test",
  markets: { US: SHIPPING_SNAPSHOT.markets.US },
  stores: Object.fromEntries(s.map((x) => [x.key, condenseStore(x, {})])),
});

// Gear Gaming as measured: USPS Ground Advantage by zone (NY $5.72, SF $5.82,
// Dallas $5.38, Chicago $5.50) and a 75¢ "USPS First Class Mail" letter seen
// on 1 card and on 10 cards at $2.50, gone by $20.07.
const GA: Record<string, number> = { ny: 5.72, sf: 5.82, dal: 5.38, chi: 5.5 };
const GEAR = probeUS("mysterymtg", [
  { id: "S1", v: 0.25, n: 1, rates: (a) => [["Ground Advantage", GA[a]], ["USPS First Class Mail", 0.75], ["Priority Mail", 9.85]] },
  { id: "S10", v: 2.5, n: 10, rates: (a) => [["Ground Advantage", GA[a]], ["USPS First Class Mail", 0.75]] },
  { id: "V20", v: 20.07, n: 2, rates: (a) => [["Ground Advantage", GA[a]]] },
  { id: "V50", v: 50, n: 3, rates: (a) => [["Ground Advantage", GA[a]]] },
  { id: "V100", v: 100.04, n: 5, rates: (a) => [["Ground Advantage", GA[a]]] },
]);

test("the US picker reads like America: Census regions, each saying what it was priced to, then 'Elsewhere'", () => {
  const opts = regionOptionsFor("US");
  assert.deepEqual(
    opts.map((o) => o.label),
    ["Northeast", "South Atlantic", "Midwest", "Plains", "South", "California", "Mountain & Northwest", "Elsewhere (not measured)"],
  );
  assert.deepEqual(opts.map((o) => o.phrase), [
    "the Northeast",
    "the South Atlantic states",
    "the Midwest",
    "the Plains states",
    "the South",
    "California",
    "the Mountain and Northwest states",
    "elsewhere in the US",
  ]);
  const to = Object.fromEntries(opts.map((o) => [o.key, o.pricedTo]));
  assert.equal(to.NE, "priced to New York, the one address we measured there");
  assert.equal(to.SA, "priced at the dearer of New York and Dallas, the addresses we measured either side of it");
  assert.equal(to.MTW, "priced at the dearer of San Francisco and Dallas, the addresses we measured either side of it");
  assert.match(to.OTHER, /^not measured — .*usually costs more/);
  // Short enough for a phone: at 360–390px the select is 264–294px wide and
  // clipped "Northeast (measured to New York)" (224px of Inter 16px text, 308px
  // with the select's padding and arrow) to "Northeast (measured to New Y".
  // The longest label now, "Elsewhere (not measured)", is 167px of text: it
  // fits the ~180px a 360px phone leaves (headless Chromium, 2026-09-25).
  for (const m of ["AU", "US", "UK", "CA", "EU", "SG"] as const) {
    for (const o of regionOptionsFor(m)) assert.ok(o.label.length <= 24, `${m}: "${o.label}" is too long for a phone's select`);
  }
  const ui = read("src/components/BestBasket.tsx");
  assert.match(ui, /<option value="">Not sure \(highest rate\)<\/option>/);
  assert.match(ui, /regionOpt\.pricedTo/, "what the chosen region is priced to is said under the picker");
  assert.deepEqual(postageOptionsFrom("US", "OTHER", null), { region: "OTHER", trackedOnly: false });
  assert.equal(regionOptionsFor("AU").some((o) => o.unmeasured), false, "all eight AU states and territories are measured");
  assert.equal(regionOptionsFor("EU").at(-1)?.label, "Elsewhere (not measured)");
  assert.doesNotMatch(regionOptionsFor("EU").at(-1)?.pricedTo ?? "", /costs more/, "Elsewhere in the EU can be cheaper — not remote");
});

test("the visitor's state preselects their region (Vercel geo headers), for every market", () => {
  const us = (st: string | null) => regionFromGeo("US", "US", st);
  assert.equal(us("NY"), "NE");
  assert.equal(us("PA"), "NE");
  assert.equal(us("OH"), "MW");
  assert.equal(us("IL"), "MW");
  assert.equal(us("ND"), "PL");
  assert.equal(us("TX"), "S");
  assert.equal(us("FL"), "SA");
  assert.equal(us("DC"), "SA", "between New York and Dallas — never priced as Dallas alone");
  assert.equal(us("MD"), "SA");
  assert.equal(us("CA"), "CAL");
  assert.equal(us("WA"), "MTW", "Seattle is further than San Francisco from a West-coast store");
  assert.equal(us("US-CA"), "CAL", "an ISO 3166-2 code with its country prefix");
  assert.equal(us("AK"), "OTHER", "Alaska is not priced as San Francisco");
  assert.equal(us("HI"), "OTHER");
  assert.equal(regionFromGeo("US", "PR", null), "OTHER", "Puerto Rico geolocates as its own country");
  assert.equal(us(null), null);
  assert.equal(us("ZZ"), null);
  assert.equal(regionFromGeo("US", "AU", "SA"), null, "an Australian browsing US stores gets no US region");
  assert.equal(regionFromGeo("AU", "AU", "SA"), "SA");
  assert.equal(regionFromGeo("AU", "AU", "ACT"), "ACT");
  assert.equal(regionFromGeo("CA", "CA", "ON"), "ON");
  assert.equal(regionFromGeo("CA", "CA", "MB"), "OTHER");
  assert.equal(regionFromGeo("UK", "GB", "SCT"), "SCT");
  assert.equal(regionFromGeo("UK", "GB", "WLS"), "ENG");
  assert.equal(regionFromGeo("UK", "GB", "NIR"), "NIR");
  assert.equal(regionFromGeo("EU", "DE", null), "DE");
  assert.equal(regionFromGeo("EU", "IT", "RM"), "OTHER", "an Italian buyer: rates were not measured to Italy");
  assert.equal(regionFromGeo("SG", "SG", null), "SG");
  // The pages pass it from the server; the buyer's own pick still wins and is remembered.
  for (const f of ["src/app/tools/best-basket/page.tsx"]) {
    assert.match(read(f), /regionFromGeo\(country, [^)]*x-vercel-ip-country"\)[^)]*x-vercel-ip-country-region"\)\)/, f);
  }
  assert.match(read("src/components/BestBasket.tsx"), /geoRegion=|geoRegion,/);
  const ok = () => true;
  assert.equal(effectiveRegion({ region: null, regionChosen: false, trackedOnly: false }, "MW", ok), "MW", "never chosen: the geo guess");
  assert.equal(effectiveRegion({ region: "W", regionChosen: true, trackedOnly: false }, "MW", ok), "W", "the buyer's pick wins");
  assert.equal(effectiveRegion({ region: null, regionChosen: true, trackedOnly: false }, "MW", ok), null, "'Not sure' is a choice too");
  const prefs = read("src/lib/postage-prefs.ts");
  assert.equal((prefs.match(/try \{/g) ?? []).length, 2, "localStorage stays inside try/catch");
});

test("a US store's First-Class letter only covers the orders it was seen on; Ground Advantage is priced by zone", () => {
  const snap = snapOf(GEAR);
  const q = (v: number, n: number, region: string | null = "MW", trackedOnly = false) =>
    shippingFor("mysterymtg", cart(v, n), { region, trackedOnly }, snap);
  assert.equal(q(1.5, 5).cents, 75, "5 cards, $1.50: inside what the letter was seen on");
  assert.equal(q(1.5, 5).tracked, false);
  assert.deepEqual(q(1.5, 5).otherOption, { cents: 550, label: "Ground Advantage", tracked: true });
  assert.ok(postageLineBits({ topUpCents: 0, postage: q(1.5, 5) }, (c) => `$${(c / 100).toFixed(2)}`).includes("tracked: Ground Advantage $5.50"));
  // More cards than the letter was ever seen with: no letter.
  const eleven = q(2.75, 11);
  assert.equal(eleven.cents, 550);
  assert.equal(eleven.label, "Ground Advantage");
  assert.equal(eleven.beyondMeasured, true);
  assert.equal(postagePrefix(eleven), "from ");
  // More value than it was seen with: no letter.
  assert.equal(q(25, 2).cents, 550);
  // By zone: the buyer's region, or the dearest ("up to") when unknown.
  assert.equal(q(25, 2, "S").cents, 538);
  assert.equal(q(25, 2, "CAL").cents, 582);
  assert.equal(q(25, 2, "SA").cents, 572, "the South Atlantic: the dearer of New York ($5.72) and Dallas ($5.38)");
  const unknown = q(25, 2, null);
  assert.equal(unknown.cents, 582);
  assert.equal(unknown.upTo, true);
  assert.equal(postagePrefix(unknown), "up to ");
  // Tracked only: Ground Advantage, and the skipped letter is named.
  const tracked = q(1, 1, "NE", true);
  assert.equal(tracked.cents, 572);
  assert.equal(tracked.otherOption?.label, "USPS First Class Mail");
  // "Elsewhere in the US" (Alaska, Hawaii…): the dearest measured, and a floor there.
  const el = q(25, 2, "OTHER");
  assert.equal(el.cents, 582);
  assert.equal(el.upTo, false);
  assert.equal(el.unmeasuredRegion, true);
  assert.equal(el.atLeast, true);
  assert.equal(postagePrefix(el), "from ");
});

test("a preselected US region is never priced under a measured city it sits beside", () => {
  // Every state, every measured US store, every measured cart: the region its
  // state preselects quotes at least what each city it is priced from paid.
  const states = "AL AR AZ CA CO CT DC DE FL GA IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY".split(" ");
  const regions = regionOptionsFor("US");
  let checked = 0;
  for (const st of states) {
    const key = regionFromGeo("US", "US", st);
    assert.ok(key && regions.some((r) => r.key === key && !r.unmeasured), `${st} preselects a measured region`);
    const at = SHIPPING_REGIONS.US.find((r) => r.key === key)!.at;
    for (const [k, s] of Object.entries(SHIPPING_SNAPSHOT.stores)) {
      if (s.market !== "US" || s.status !== "measured") continue;
      for (const [v, n] of s.carts) {
        const q = shippingFor(k, { subtotalCents: v, items: n }, { region: key });
        if (q.unavailable) continue;
        for (const id of at) {
          const z = s.zones.find((zz) => zz.at.includes(id));
          if (!z || z.none) continue;
          const one = shippingFor(k, { subtotalCents: v, items: n }, { region: key }, { ...SHIPPING_SNAPSHOT, stores: { [k]: { ...s, zones: [{ ...z, at: at.slice() }] } } });
          if (one.unavailable) continue;
          checked++;
          assert.ok(q.cents >= one.cents, `${st} (${key}) ${k} ${v}/${n}: ${q.cents} under ${id}'s ${one.cents}`);
        }
      }
    }
  }
  assert.ok(checked > 1000, `${checked}`);
});

// Stores and carts found in the REAL snapshot (OP Compare's own probe), so
// these tests follow the data rather than pin one store's price.
const usMeasured = () => Object.entries(SHIPPING_SNAPSHOT.stores).filter(([, s]) => s.market === "US" && s.status === "measured");
function usStoreWhere(pred: (key: string) => boolean): string {
  const hit = usMeasured().find(([k]) => pred(k));
  assert.ok(hit, "a US store in the snapshot fits");
  return hit[0];
}

test("Alaska and Hawaii: the dearest lower-48 rate is a floor there, and free is not promised", () => {
  const ak = regionFromGeo("US", "US", "AK");
  const paid = usStoreWhere((k) => shippingFor(k, cart(5, 1), { region: "NE" }).cents > 0 && !shippingFor(k, cart(5, 1), { region: ak }).unavailable);
  const q = shippingFor(paid, cart(5, 1), { region: ak });
  assert.equal(q.unmeasuredRegion, true);
  assert.equal(q.atLeast, true);
  assert.equal(postagePrefix(q), "from ");
  const highest = Math.max(...SHIPPING_REGIONS.US.map((r) => shippingFor(paid, cart(5, 1), { region: r.key })).filter((x) => !x.unavailable).map((x) => x.cents));
  assert.equal(q.cents, highest, "the dearest measured region's rate");
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  const bits = postageLineBits({ topUpCents: 0, postage: q }, fmt);
  assert.ok(bits.some((b) => /usually costs more than the highest rate we measured; confirm at checkout/.test(b)), bits.join(" · "));
  // A store that posts free to every measured city: not promised free in Honolulu.
  const freeStore = usStoreWhere((k) => SHIPPING_REGIONS.US.every((r) => shippingFor(k, cart(500, 3), { region: r.key }).free));
  const hi = shippingFor(freeStore, cart(500, 3), { region: regionFromGeo("US", "US", "HI") });
  assert.equal(hi.free, true);
  assert.equal(hi.unmeasuredRegion, true);
  assert.equal(freePrefix(hi), "est. ");
  const hb = postageLineBits({ topUpCents: 0, postage: hi }, fmt);
  assert.ok(hb.some((b) => /^free to every address we measured, but not measured to your region/.test(b)), hb.join(" · "));
  assert.ok(!hb.some((b) => /this is the highest rate we measured/.test(b)), "a free quote is not 'the highest rate'");
  assert.equal(freePrefix(shippingFor(freeStore, cart(500, 3), { region: "NE" })), "");
  const ui = read("src/components/BestBasket.tsx");
  assert.match(ui, /\+ \{freePrefix\(s\.postage\)\}free post/);
  assert.match(ui, /\$\{freePrefix\(p\)\}free/);
  const plan = optimizeBasket(
    [{ cardId: "a", name: "A", slug: null, qty: 1, listings: [{ retailer: paid, priceCents: 500, url: "u" }] }],
    basketStoresFor("US", { region: ak }),
  );
  assert.ok(planPostageNotes(plan, false, true).includes("postage for 1 store is not measured to your region — delivery there usually costs more"));
});

test("'from' is only said where it is a floor, and never about free postage", () => {
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  // A zone-priced store, region unknown, an order bigger than any measured: the
  // dearest region's figure is not a floor for a buyer somewhere cheaper.
  const zoned = usStoreWhere((k) => {
    const c = SHIPPING_REGIONS.US.map((r) => shippingFor(k, cart(1, 60), { region: r.key })).filter((q) => !q.unavailable && !q.free).map((q) => q.cents);
    return c.length > 1 && new Set(c).size > 1;
  });
  const unknown = shippingFor(zoned, cart(1, 60), {});
  assert.equal(unknown.beyondMeasured, true);
  assert.equal(unknown.upTo, true);
  assert.equal(postagePrefix(unknown), "est. ");
  assert.ok(postageLineBits({ topUpCents: 0, postage: unknown }, fmt).includes("a bigger order than any we measured, priced at the dearest region — pick yours"));
  const one = shippingFor(zoned, cart(1, 60), { region: "NE" });
  if (!one.unavailable && !one.free) assert.equal(postagePrefix(one), "from ");
  // Free on an order bigger than any measured: not "at least free".
  const freeStore = usStoreWhere((k) => {
    const q = shippingFor(k, cart(500, 80), { region: "NE" });
    return q.free && !!q.beyondMeasured;
  });
  const big = shippingFor(freeStore, cart(500, 80), { region: "NE" });
  const bits = postageLineBits({ topUpCents: 0, postage: big }, fmt);
  assert.ok(bits.includes("free on the orders we measured, but this one is bigger than any of them — confirm at checkout"), bits.join(" · "));
  assert.ok(!bits.some((b) => /so at least this/.test(b)));
});

test("a buyer who picked 'Elsewhere' is not told to pick a region; a guessed region says it was guessed", () => {
  const gap = usStoreWhere((k) => {
    const q = shippingFor(k, cart(10, 1), {});
    return !q.unavailable && (q.notServed?.length ?? 0) > 0;
  });
  const plan = optimizeBasket(
    [{ cardId: "a", name: "A", slug: null, qty: 1, listings: [{ retailer: gap, priceCents: 1000, url: "u" }] }],
    basketStoresFor("US", { region: "OTHER" }),
  );
  const notes = planPostageNotes(plan, false, true);
  assert.ok(notes.some((n) => /^1 store in this plan doesn't post to .* — it may not post to you either; check at checkout$/.test(n)), notes.join(" | "));
  assert.ok(!notes.some((n) => /pick your region/.test(n)));
  assert.ok(planPostageNotes(plan, false).some((n) => /pick your region$/.test(n)), "region unknown: still asked to pick");
  const ui = read("src/components/BestBasket.tsx");
  assert.match(ui, /planPostageNotes\(plan, !!regionLabel, !!regionOpt\?\.unmeasured\)/);
  assert.match(ui, /Picked from your location: \$\{regionOpt\.phrase\}\. Change it if that's wrong\./);
});

test("USPS's own spelling, 'First-Class Mail', is an untracked letter; 'First-Class Package' is not", () => {
  assert.equal(classifyRate("USPS First-Class Mail®").service, "untracked");
  assert.equal(classifyRate("First-Class Mail Letter").service, "untracked");
  assert.equal(classifyRate("USPS First-Class Package").service, "tracked");
  assert.equal(classifyRate("USPS Ground Advantage").service, "tracked");
  assert.equal(classifyRate("Economy").service, "unknown", "a name that does not say is never guessed");
});

test("a US free-shipping threshold starts at the measured free cart, never a guessed round $50", () => {
  // Knight and Day as measured: $9.00 at $65.50, free at $80.50 (guessed "free over $50").
  const kd = probeUS("zulusgames", [
    { id: "S1", v: 0.5, n: 1, rates: () => [["Economy", 9]] },
    { id: "V50", v: 50.5, n: 2, rates: () => [["Economy", 9]] },
    { id: "V60", v: 65.5, n: 2, rates: () => [["Economy", 9]] },
    { id: "V75", v: 80.5, n: 2, rates: () => [["Free Shipping", 0]] },
    { id: "V100", v: 100.5, n: 2, rates: () => [["Free Shipping", 0]] },
  ]);
  const snap = snapOf(kd);
  const at = (v: number) => shippingFor("zulusgames", cart(v, 2), { region: "NE" }, snap);
  assert.equal(at(55).cents, 900, "the guessed $50 is never applied");
  assert.equal(at(75).cents, 900, "$75 is probably the real threshold, but $80.50 is what was measured");
  assert.equal(at(75).freeFromCents, 8050);
  assert.equal(at(80.5).cents, 0);
  assert.equal(at(55).tracked, null, "'Economy' does not say whether it is tracked");
  assert.match(shippingNoteFor("zulusgames", snap), /free from US\$80\.50/);
});

test("US stores that post nowhere are left out of Best Basket, and each says why", () => {
  const noPost = Object.entries(SHIPPING_SNAPSHOT.stores).filter(([, s]) => s.market === "US" && s.status === "no-post");
  assert.ok(noPost.length > 0);
  for (const [key] of noPost) {
    const q = shippingFor(key, cart(20, 2), { region: "MW" });
    assert.ok(q.unavailable, key);
    assert.equal(basketStoresFor("US", {})[key].unavailable, q.unavailable, `${key} is left out of Best Basket`);
  }
  assert.match(shippingFor("atomilicollectables", cart(20, 2)).unavailable ?? "", /local pickup in Houston only/);
});

test("the Canadian stores in the US market: checkout rounding and duties", () => {
  assert.equal(roundAtCheckout(1291, "whole"), 1300);
  assert.equal(roundAtCheckout(1300, "whole"), 1300);
  assert.equal(roundAtCheckout(252, "x.50"), 350);
  assert.equal(roundAtCheckout(504, "x.50"), 550);
  assert.equal(roundAtCheckout(1081, "x.50"), 1150);
  assert.equal(roundAtCheckout(0, "x.50"), 0, "free stays free");
  // Every store that carries a checkout-rounding override is quoted in whole units (or .50) when the registry has it.
  for (const [k, o] of Object.entries(SHIPPING_OVERRIDES)) {
    if (!o.checkoutRounding || !SHIPPING_SNAPSHOT.stores[k] || !STORE_BY_KEY[k]) continue;
    const q = shippingFor(k, cart(10, 1), { region: "NE" });
    if (!q.unavailable && q.cents > 0 && o.checkoutRounding === "whole") assert.equal(q.cents % 100, 0, `${k}: ${q.cents}`);
  }
});

test("the builder can add a re-probe's carts to a full run instead of replacing the store", () => {
  const dir = mkdtempSync(join(tmpdir(), "ship-us-"));
  const first = probeUS("zulusgames", [
    { id: "S1", v: 0.5, n: 1, rates: () => [["Economy", 9]] },
    { id: "V100", v: 101.5, n: 1, rates: () => [["Economy", 0]] },
  ]);
  const rungs = probeUS("zulusgames", [
    { id: "S1", v: 0.5, n: 1, rates: () => [["Economy", 9.5]] },
    { id: "V70", v: 73, n: 1, rates: () => [["Economy", 9]] },
  ]);
  rungs.measuredAt = "2026-09-25T06:42:42.586Z";
  writeFileSync(join(dir, "a.json"), JSON.stringify({ market: "US", stores: [first] }));
  writeFileSync(join(dir, "b.json"), JSON.stringify({ market: "US", stores: [rungs] }));
  const build = (...extra: string[]) => {
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/build-shipping-rates.ts", join(dir, "a.json"), join(dir, "b.json"), "--base=src/lib/shipping-rates.json", `--out=${join(dir, "out.json")}`, ...extra],
      { cwd: ROOT, stdio: "pipe" },
    );
    return (JSON.parse(readFileSync(join(dir, "out.json"), "utf8")) as ShippingSnapshot).stores.zulusgames;
  };
  assert.deepEqual(build().carts, [[50, 1], [7300, 1]], "by default the later input replaces the store");
  const merged = build("--add-carts");
  assert.deepEqual(merged.carts, [[50, 1], [7300, 1], [10150, 1]]);
  assert.equal(merged.zones[0].std[0]?.[0], 950, "the same cart measured twice: the later run wins");
});

test("a store in the US market that posts from Canada says import charges may be due", () => {
  const abroad = probeUS("zulusgames", [
    { id: "S1", v: 0.5, n: 1, rates: () => [["Economy", 9]] },
    { id: "V100", v: 101.5, n: 1, rates: () => [["Economy", 9]] },
  ]);
  const snap: ShippingSnapshot = { ...snapOf(abroad), stores: { zulusgames: condenseStore(abroad, { shipsFrom: "Canada" }) } };
  const q = shippingFor("zulusgames", cart(10, 1), { region: "NE" }, snap);
  assert.match(q.crossBorder ?? "", /^ships from Canada: import duties or a carrier's brokerage fee may be charged on delivery$/);
  assert.equal(shippingSummary("zulusgames", snap).shipsFrom, "Canada");
  const plan = optimizeBasket(
    [{ cardId: "a", name: "A", slug: null, qty: 1, listings: [{ retailer: "zulusgames", priceCents: 100, url: "u" }] }],
    basketStoresFor("US", { region: "NE" }, snap),
  );
  assert.ok(plan.stores.some((g) => g.key === "zulusgames"));
  assert.ok(planPostageNotes(plan, true).includes("1 store ships from abroad — import charges may be due on delivery"), planPostageNotes(plan, true).join(" | "));
});

test("the real US snapshot: zone pricing is real, a store's regional gap is named, and the copy claims no 'exact' rates", () => {
  assert.equal(marketHasZonePricing("US"), true);
  const gap = usStoreWhere((k) => SHIPPING_REGIONS.US.some((r) => /^Quoted no postage to /.test(shippingFor(k, cart(10, 1), { region: r.key }).unavailable ?? "")));
  const r = SHIPPING_REGIONS.US.find((x) => /^Quoted no postage to /.test(shippingFor(gap, cart(10, 1), { region: x.key }).unavailable ?? ""))!;
  assert.match(shippingFor(gap, cart(10, 1), { region: r.key }).unavailable ?? "", /\(measured/);
  for (const f of ["src/components/BestBasket.tsx", "src/app/tools/best-basket/page.tsx", "src/lib/content/hub-intros.ts"]) {
    assert.doesNotMatch(read(f), /exact (regional )?rates/i, f);
  }
  assert.match(read("src/app/tools/best-basket/page.tsx"), /whether its name says it's tracked/);
});

test("the refresh runs monthly on its own, every market, and still never commits", () => {
  const wf = read(".github/workflows/shipping-rates.yml");
  assert.match(wf, /schedule:\s*\n\s*- cron: "17 3 2 \* \*"/, "monthly, off the hour, away from the 08:00 UTC release");
  assert.match(wf, /github\.event_name == 'schedule' \|\| inputs\.market == 'all'/, "a scheduled run has no inputs: it probes every market");
  assert.match(wf, /max-parallel: 2/, "the politeness cap across markets stays");
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /actions\/upload-artifact@v4/);
  assert.match(wf, /GITHUB_STEP_SUMMARY/);
  assert.doesNotMatch(wf, /git push|git commit|contents: write|DATABASE_URL/);
  const builder = read("scripts/build-shipping-rates.ts");
  assert.match(builder, /newly does not post/);
  assert.match(builder, /more than 50%/);
});
