import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptItem,
  acceptResponse,
  clampMaxAgeMs,
  conditionLabel,
  DEFAULT_MAX_AGE_HOURS,
  feedKey,
  feedReference,
  formatAge,
  formatMoney,
  formatPrice,
  hoursToMs,
  isContextString,
  isFresh,
  listingsUrl,
  MARKETPLACE_OF_REGION,
  marketplaceOf,
  parseFeedKey,
  parseMaxAgeHours,
  purgeCutoff,
  regionsOfMarketplace,
  shipLabel,
  type ListingsResponse,
} from "../src/lib/ebay-context";
import { parseContext } from "../src/lib/ebay-context-parse";
import { EBAY_CAMPAIGN_ID } from "../src/lib/affiliate";
import { REGION_LIST } from "../src/lib/regions";

const NOW = Date.parse("2026-10-07T12:00:00Z");
// A realistic itemAffiliateWebUrl, as the importer stores it: eBay's string, with its opaque parts, byte for byte.
const URL_OK = `https://www.ebay.com/itm/1?_skw=pokemon+elite+trainer+box&hash=item1%3Ag%3AaBcAAOSw&amdata=enc%3AAQAKAAAA%2Bx%3D%3D&mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=${EBAY_CAMPAIGN_ID}&customid=dex-us-chase&toolid=10001`;
const item = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Item ${id}`,
  imageUrl: `https://i.ebayimg.com/images/g/${id}/s-l500.jpg`,
  price: { value: "12.34", currency: "AUD" },
  ship: { free: true },
  condition: "Brand New",
  url: URL_OK,
  ...over,
});
const res = (items: unknown[], ageH: number, over: Record<string, unknown> = {}) => ({ feed: "set", items, fetchedAt: new Date(NOW - ageH * 3600_000).toISOString(), maxAgeMs: hoursToMs(26), ...over });

test("marketplaces: au+nz share EBAY_AU, us+sg EBAY_US, uk EBAY_GB, ca EBAY_CA, eu EBAY_DE", () => {
  assert.deepEqual(MARKETPLACE_OF_REGION, { au: "EBAY_AU", nz: "EBAY_AU", us: "EBAY_US", sg: "EBAY_US", uk: "EBAY_GB", ca: "EBAY_CA", eu: "EBAY_DE" });
  assert.deepEqual(new Set(Object.values(MARKETPLACE_OF_REGION)).size, 5);
  assert.deepEqual(regionsOfMarketplace("EBAY_AU").sort(), ["au", "nz"]);
  assert.deepEqual(regionsOfMarketplace("EBAY_US").sort(), ["sg", "us"]);
  assert.equal(marketplaceOf("nz").currency, "AUD");
  assert.equal(marketplaceOf("eu").country, "DE");
  for (const r of REGION_LIST) assert.ok(marketplaceOf(r.region));
});

test("feed keys round-trip", () => {
  assert.equal(feedKey("EBAY_US", "chase"), "EBAY_US|chase");
  assert.equal(feedKey("EBAY_GB", "set", "surging-sparks"), "EBAY_GB|set:surging-sparks");
  assert.deepEqual(parseFeedKey("EBAY_US|item:cm1abc"), { marketplace: "EBAY_US", kind: "item", arg: "cm1abc" });
  assert.deepEqual(parseFeedKey("EBAY_AU|sealed"), { marketplace: "EBAY_AU", kind: "sealed", arg: null });
  for (const bad of ["", "EBAY_XX|chase", "EBAY_US|nope", "chase", "EBAY_US|"]) assert.equal(parseFeedKey(bad), null, bad);
});

test("the age bound: default 26 h, configurable (compliant mode 5.5), garbage falls back, clamped", () => {
  assert.equal(DEFAULT_MAX_AGE_HOURS, 26);
  assert.equal(parseMaxAgeHours(undefined), 26);
  assert.equal(parseMaxAgeHours(""), 26);
  assert.equal(parseMaxAgeHours("5.5"), 5.5);
  assert.equal(hoursToMs(parseMaxAgeHours("5.5")), 19_800_000);
  assert.equal(parseMaxAgeHours(" 12 "), 12);
  for (const bad of ["abc", "0", "-3", "NaN", "Infinity"]) assert.equal(parseMaxAgeHours(bad), 26, bad);
  assert.equal(parseMaxAgeHours("0.2"), 1);
  assert.equal(parseMaxAgeHours("9999"), 72);
  assert.equal(clampMaxAgeMs(19_800_000), 19_800_000);
  assert.equal(clampMaxAgeMs("x"), hoursToMs(26));
  assert.equal(clampMaxAgeMs(1e15), hoursToMs(72), "the browser never believes more than the hard maximum");
  assert.equal(clampMaxAgeMs(5), hoursToMs(1));
});

test("formatAge rounds UP, so a strip never looks fresher than it is", () => {
  assert.equal(formatAge(0), "just now");
  assert.equal(formatAge(30_000), "just now");
  assert.equal(formatAge(61_000), "2 min ago");
  assert.equal(formatAge(59 * 60_000), "59 min ago");
  assert.equal(formatAge(3600_000), "1 h ago");
  assert.equal(formatAge(8.2 * 3600_000), "9 h ago");
  assert.equal(formatAge(26 * 3600_000), "26 h ago");
  assert.equal(formatAge(49 * 3600_000), "3 d ago");
  assert.equal(formatAge(-5), "just now");
});

test("money as eBay returned it: A$, NZ$, C$, £, €, US$ — never converted", () => {
  assert.equal(formatMoney("717.90", "AUD"), "A$717.90");
  assert.equal(formatMoney("1362.70", "AUD"), "A$1,362.70");
  assert.equal(formatMoney("99.5", "NZD"), "NZ$99.50");
  assert.equal(formatMoney("24.99", "CAD"), "C$24.99");
  assert.equal(formatMoney("18.50", "GBP"), "£18.50");
  assert.equal(formatMoney("45", "EUR"), "€45.00");
  assert.equal(formatMoney("24.99", "USD"), "US$24.99");
  assert.equal(formatMoney("1000", "JPY"), "JPY 1,000.00");
  assert.equal(formatPrice({ value: "717.90", currency: "AUD" }), "A$717.90");
  assert.equal(formatMoney("x", "AUD"), "x AUD");
});

test("shipping line: Free shipping, + A$12.00 shipping, or Shipping on eBay; condition only when not new", () => {
  assert.deepEqual(shipLabel({ free: true }), { text: "Free shipping", free: true });
  assert.deepEqual(shipLabel({ value: "12.00", currency: "AUD" }), { text: "+ A$12.00 shipping", free: false });
  assert.deepEqual(shipLabel(undefined), { text: "Shipping on eBay", free: false });
  assert.deepEqual(shipLabel({}), { text: "Shipping on eBay", free: false });
  for (const n of ["Brand New", "New", "New with tags", "Neu", "Neuf", "Nuovo", "", undefined]) assert.equal(conditionLabel(n), "", String(n));
  for (const u of ["Used", "Graded", "Pre-owned", "Open box", "Near Mint or Better"]) assert.equal(conditionLabel(u), u);
  // the marketplace's own language → plain English
  for (const g of ["Bewertet", "Gradée", "Gradé", "Valutata", "Valutato", "Calificada", "Gegradeerd"]) assert.equal(conditionLabel(g), "Graded", g);
  for (const u of ["Nicht bewertet", "Niet gecategoriseerd", "Sin clasificar", "Non gradée", "Non valutata", "Ungraded"]) assert.equal(conditionLabel(u), "Ungraded", u);
});

test("acceptItem: whitelisted fields, an eBay item URL with a campaign id (kept EXACTLY as stored) and an eBay image, or nothing", () => {
  const ok = acceptItem(item("a"))!;
  assert.ok(ok);
  assert.deepEqual(Object.keys(ok).sort(), ["condition", "href", "id", "imageUrl", "price", "ship", "title", "url"]);
  // eBay's affiliate URL is used AS RETURNED (its spec says so): not re-serialised, no parameter added, changed or removed
  assert.equal(ok.href, URL_OK);
  assert.equal(ok.url, URL_OK);
  assert.equal(new URL(ok.href).searchParams.get("customid"), "dex-us-chase", "the per-feed reference the importer asked eBay for survives");
  assert.equal(new URL(ok.href).searchParams.get("campid"), EBAY_CAMPAIGN_ID);
  // the browser does not depend on NEXT_PUBLIC_EBAY_CAMPAIGN_ID matching the importer's: any numeric campaign id is accepted
  assert.ok(acceptItem(item("o", { url: "https://www.ebay.com/itm/1?campid=1111111111&customid=x" })), "another numeric campaign id");
  assert.ok(acceptItem(item("p", { url: "https://www.ebay.co.uk/itm/some-title-slug/123456789012?campid=5339155912" })), "the long item path");
  for (const bad of [
    item("b", { url: "https://evil.com/itm/1?campid=" + EBAY_CAMPAIGN_ID }),
    item("c", { url: "https://www.ebay.com/itm/1?mkevt=1" }), // no campaign id at all
    item("c2", { url: "https://www.ebay.com/itm/1?campid=" }),
    item("c3", { url: "https://www.ebay.com/itm/1?campid=abc" }),
    item("c4", { url: "https://www.ebay.com/itm/1?campid=1&campid=2" }), // EPN could read either
    item("d", { url: "http://www.ebay.com/itm/1?campid=" + EBAY_CAMPAIGN_ID }),
    item("d2", { url: "https://www.ebay.com:8443/itm/1?campid=" + EBAY_CAMPAIGN_ID }),
    item("d3", { url: "https://signin.ebay.com/ws/eBayISAPI.dll?SignIn&campid=" + EBAY_CAMPAIGN_ID }), // an eBay host, but not an item page
    item("d4", { url: "https://www.ebay.com/itm/1?campid=" + EBAY_CAMPAIGN_ID + "\n&x=1" }),
    item("e", { url: "javascript:alert(1)" }),
    item("f", { imageUrl: "https://evil.com/x.jpg" }),
    item("g", { imageUrl: "http://i.ebayimg.com/x.jpg" }),
    item("h", { price: { value: "abc", currency: "AUD" } }),
    item("i", { price: { value: "10", currency: "aud" } }),
    item("j", { title: "" }),
    item("k", { id: "" }),
    null,
    5,
    "x",
  ])
    assert.equal(acceptItem(bad), null, JSON.stringify(bad));
  // seller-controlled text: control and bidi characters are stripped, the title is cut at 80
  const t = acceptItem(item("l", { title: "A‮B\u0000C " + "x".repeat(200) }))!;
  assert.ok(!/[‮\u0000]/.test(t.title) && t.title.length <= 80);
  // a malformed shipping object is dropped, not rendered
  assert.equal(acceptItem(item("m", { ship: { value: "-1", currency: "AUD" } }))!.ship, undefined);
});

test("feedReference: dex-<market>-<feed kind>, a safe sub-id of at most 60 characters, one per marketplace and kind (the EPN report's split)", () => {
  assert.equal(feedReference("EBAY_US", "chase"), "dex-us-chase");
  assert.equal(feedReference("EBAY_AU", "item"), "dex-au-item");
  assert.equal(feedReference("EBAY_GB", "set"), "dex-uk-set");
  assert.equal(feedReference("EBAY_CA", "type"), "dex-ca-type");
  assert.equal(feedReference("EBAY_DE", "sealed"), "dex-eu-sealed");
  const seen = new Set<string>();
  for (const mp of ["EBAY_US", "EBAY_AU", "EBAY_GB", "EBAY_CA", "EBAY_DE"] as const)
    for (const kind of ["chase", "sealed", "type", "set", "item"] as const) {
      const r = feedReference(mp, kind);
      assert.match(r, /^dex-(us|au|uk|ca|eu)-(chase|sealed|type|set|item)$/);
      assert.ok(r.length <= 60);
      seen.add(r);
    }
  assert.equal(seen.size, 25);
});

test("purgeCutoff: the bound plus 4 h, one helper for the eBay import and the store import", () => {
  assert.equal(purgeCutoff(NOW, undefined).getTime(), NOW - hoursToMs(30));
  assert.equal(purgeCutoff(NOW, "").getTime(), NOW - hoursToMs(30));
  assert.equal(purgeCutoff(NOW, "5.5").getTime(), NOW - hoursToMs(9.5));
  assert.equal(purgeCutoff(NOW, "garbage").getTime(), NOW - hoursToMs(30));
  assert.equal(purgeCutoff(NOW, "500").getTime(), NOW - hoursToMs(76), "clamped to the 72 h hard maximum, plus 4");
});

test("acceptResponse: the age bound the route reported is enforced in the browser (26 h default, 5.5 h compliant mode)", () => {
  const items = [item("1"), item("2"), item("3")];
  assert.ok(acceptResponse(res(items, 9), NOW));
  assert.ok(acceptResponse(res(items, 25.9), NOW));
  assert.equal(acceptResponse(res(items, 26.1), NOW), null, "older than 26 h");
  // compliant mode: the route reports 5.5 h
  const strict = (h: number) => res(items, h, { maxAgeMs: hoursToMs(5.5) });
  assert.ok(acceptResponse(strict(5.4), NOW));
  assert.equal(acceptResponse(strict(5.6), NOW), null);
  // the browser clamps what the route says: a huge bound is not believed
  assert.equal(acceptResponse(res(items, 80, { maxAgeMs: 1e15 }), NOW), null);
  assert.ok(acceptResponse(res(items, 70, { maxAgeMs: 1e15 }), NOW), "inside the 72 h hard maximum it is the route's word");
  // a missing or bad bound falls back to 26 h
  assert.equal(acceptResponse(res(items, 30, { maxAgeMs: undefined }), NOW), null);
  assert.ok(acceptResponse(res(items, 20, { maxAgeMs: "x" }), NOW));
  // a clock that cannot be right
  assert.equal(acceptResponse(res(items, -3), NOW), null);
  // envelope garbage
  for (const bad of [null, undefined, 5, "x", [], {}, { items: [] }, { feed: "bogus", items, fetchedAt: new Date(NOW).toISOString() }, { feed: "set", items: "x", fetchedAt: new Date(NOW).toISOString() }, { feed: "set", items, fetchedAt: "yesterday" }])
    assert.equal(acceptResponse(bad, NOW), null, JSON.stringify(bad));
  // fewer than `min` valid items left: none
  assert.equal(acceptResponse(res([item("1"), item("2", { url: "https://evil.com" })], 1), NOW, 2), null);
  assert.ok(acceptResponse(res([item("1"), item("2", { url: "https://evil.com" })], 1), NOW, 1));
  // duplicates collapse
  assert.equal(acceptResponse(res([item("1"), item("1"), item("2")], 1), NOW)!.items.length, 2);
});

test("isFresh: the timer re-check", () => {
  const a = { fetchedAtMs: NOW - 25 * 3600_000, maxAgeMs: hoursToMs(26) };
  assert.ok(isFresh(a, NOW));
  assert.ok(!isFresh(a, NOW + 2 * 3600_000), "a tab left open crosses the bound");
  assert.ok(!isFresh({ fetchedAtMs: NOW - 6 * 3600_000, maxAgeMs: hoursToMs(5.5) }, NOW));
});

test("contexts: shape and whitelist, and a fuzz that never throws", () => {
  for (const ok of ["chase", "sealed", "set:surging-sparks", "type:booster-boxes", "item:surging-sparks-elite-trainer-box"]) assert.ok(isContextString(ok), ok);
  for (const bad of ["", "home", "generic", "set:", "set:UPPER", "set:../etc", "item:a b", "type:", `item:${"a".repeat(101)}`, "set:a:b", 5, null, undefined, {}]) assert.ok(!isContextString(bad), String(bad));
  assert.deepEqual(parseContext("chase"), { id: "chase", kind: "chase", slug: null });
  assert.deepEqual(parseContext("set:surging-sparks"), { id: "set:surging-sparks", kind: "set", slug: "surging-sparks" });
  assert.deepEqual(parseContext("type:booster-boxes"), { id: "type:booster-boxes", kind: "type", slug: "booster-boxes" });
  assert.deepEqual(parseContext("item:whatever-slug"), { id: "item:whatever-slug", kind: "item", slug: "whatever-slug" });
  for (const bad of ["set:not-a-set", "type:nope", "home", "product:none", "SET:surging-sparks", "set:Surging-Sparks", " chase", "chase ", "set:surging-sparks/../x", "item:"]) assert.equal(parseContext(bad), null, bad);
  // fuzz: random strings, only exact members parse
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789-:%./\\ _ABC\u0000‮";
  let parsed = 0;
  for (let i = 0; i < 5000; i++) {
    const s = Array.from({ length: Math.floor(rnd() * 130) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join("");
    const r = parseContext(s);
    if (r) {
      parsed++;
      assert.match(s, /^(?:chase|sealed|(?:set|type|item):[a-z0-9][a-z0-9-]{0,99})$/);
    }
  }
  assert.ok(parsed < 50);
  for (const weird of [undefined, null, 5, {}, [], Symbol.iterator, "x".repeat(10_000)]) assert.equal(parseContext(weird), null);
  assert.equal(listingsUrl("au", "set:surging-sparks"), "/api/ebay/au?c=set%3Asurging-sparks");
});

test("the response type carries exactly what the spec lists", () => {
  const r: ListingsResponse = { feed: "item", items: [], fetchedAt: null, maxAgeMs: 1, reason: "empty" };
  assert.deepEqual(Object.keys(r).sort(), ["feed", "fetchedAt", "items", "maxAgeMs", "reason"]);
});

test("importCadence: the disclosure's words follow the age bound (daily by default, several times a day in the compliant mode)", async () => {
  const { importCadence, hoursToMs } = await import("../src/lib/ebay-context");
  assert.equal(importCadence(hoursToMs(26)), "about once a day");
  assert.equal(importCadence(hoursToMs(5.5)), "several times a day");
  assert.equal(importCadence(hoursToMs(12)), "several times a day");
  assert.equal(importCadence(hoursToMs(13)), "about once a day");
});
