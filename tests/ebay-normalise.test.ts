import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EBAY_CAMPAIGN_ID } from "../src/lib/affiliate";
import {
  baseItem,
  CHASE_FLOOR,
  HIGH_END_FLOOR_USD,
  imageKey,
  lowestPriceFirst,
  multiUnit,
  normaliseChase,
  normaliseItemFeed,
  normaliseSealed,
  normaliseSetChase,
  normaliseType,
  relevantToProduct,
  roundRobin,
  shippingFrom,
  typeFloor,
  upgradeImage,
  usdToMarketplace,
  refusedForType,
  refusedListing,
  type ItemTarget,
} from "../src/lib/ebay-normalise";
import { cleanTitle, MARKETPLACE_IDS, MARKETPLACES, type MarketplaceId } from "../src/lib/ebay-context";
import { identify, isIdentity } from "../src/lib/sealed-title";
import { NOW, summary } from "./helpers/ebay-fakes";

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/ebay-search-us.json", import.meta.url), "utf8"));
const RAW: unknown[] = FIXTURE.itemSummaries;
const by = (needle: string) => RAW.find((r) => (r as { title: string }).title.includes(needle));

// ─── the high-end sealed ("chase") feed ─────────────────────────────────────────
// MTG Compare lists no single cards: the "chase" feed key now holds collector booster boxes, cases, Secret Lair drops and Commander
// deck sets, through the same classifier as every other feed.

test("normaliseChase: accepts the good fixtures and keeps only whitelisted fields, with shipping", () => {
  const good = RAW.map((r) => normaliseChase(r, "EBAY_US", NOW)).filter(Boolean);
  assert.equal(good.length, 7, good.map((g) => g!.title).join("\n"));
  for (const g of good) {
    assert.deepEqual(Object.keys(g!).filter((k) => !["condition", "ship"].includes(k)).sort(), ["id", "imageUrl", "price", "title", "url"]);
    assert.equal(g!.price.currency, "USD");
    assert.ok(Number(g!.price.value) >= HIGH_END_FLOOR_USD);
    assert.match(g!.imageUrl, /^https:\/\/i\.ebayimg\.com\//);
    const u = new URL(g!.url);
    assert.equal(u.protocol, "https:");
    assert.equal(u.searchParams.get("campid"), EBAY_CAMPAIGN_ID);
    assert.ok(!JSON.stringify(g).includes("card_vault_99"), "no seller data");
  }
  assert.equal(good[0]!.price.value, "189.99"); // exactly as eBay returned it
  // ...and so is the link: eBay's itemAffiliateWebUrl, byte for byte (its spec says to use it as is), never rebuilt or edited
  for (const g of good) {
    const raw = RAW.find((r) => (r as { itemId: string }).itemId === g!.id) as { itemAffiliateWebUrl?: string; itemWebUrl: string };
    if (raw.itemAffiliateWebUrl?.startsWith("https://") && raw.itemAffiliateWebUrl.includes(`campid=${EBAY_CAMPAIGN_ID}&`)) assert.equal(g!.url, raw.itemAffiliateWebUrl, g!.title);
  }
  assert.deepEqual(good[0]!.ship, { value: "4.5", currency: "USD" });
  assert.equal(good[1]!.condition, "Brand New");
});

test("normaliseChase: every reject case is rejected, garbage never throws", () => {
  assert.equal(normaliseChase(by("Custom Proxy"), "EBAY_US", NOW), null);
  assert.equal(normaliseChase(by("Japanese"), "EBAY_US", NOW), null);
  assert.equal(normaliseChase(by("Sealed EUR"), "EBAY_US", NOW), null, "EUR price on EBAY_US");
  assert.equal(normaliseChase(by("converted"), "EBAY_US", NOW), null, "converted price");
  assert.equal(normaliseChase(by("below the floor"), "EBAY_US", NOW), null, "below the collector box floor");
  assert.equal(normaliseChase(by("auction"), "EBAY_US", NOW), null, "AUCTION only");
  assert.equal(normaliseChase(by("lot of 2"), "EBAY_US", NOW), null, "a lot");
  assert.equal(normaliseChase(by("Play Booster Box Sealed"), "EBAY_US", NOW), null, "sealed, but not high-end");
  assert.equal(normaliseChase(by("ENDED"), "EBAY_US", NOW), null, "ended");
  assert.equal(normaliseChase(by("Thunder Junction"), "EBAY_US", NOW), null, "image off eBay hosts");
  assert.equal(normaliseChase(by("no photo"), "EBAY_US", NOW), null, "no image");
  assert.equal(normaliseChase(by("no price"), "EBAY_US", NOW), null, "no price");
  assert.equal(normaliseChase(by("lovely thing"), "EBAY_US", NOW), null, "not recognisably a product");
  for (const g of [null, undefined, 5, "x", [], {}, { itemId: 1 }, { itemId: "a", title: "x" }, { itemId: "a", title: "MTG Final Fantasy Collector Booster Box", price: "5" }]) assert.equal(normaliseChase(g, "EBAY_US", NOW), null);
  const ok = by("Tarkir Dragonstorm");
  assert.ok(normaliseChase(ok, "EBAY_US", NOW));
  assert.equal(normaliseChase({ ...(ok as object), adultOnly: true }, "EBAY_US", NOW), null, "adult-only");
});

test("normaliseChase: high-end sealed only (no single card, no pack, no play box), and never a card pulled from a box", () => {
  const ok = (t: string, p = 700) => normaliseChase(summary("1", t, p), "EBAY_US", NOW);
  for (const t of [
    "MTG Final Fantasy Collector Booster Box Sealed",
    "MTG Aetherdrift Collector Booster Box Case 4 Boxes Sealed",
    "MTG Edge of Eternities Play Booster Box Case 6 Boxes",
    "MTG Bloomburrow Commander Deck Set of 4 Sealed",
    "Secret Lair x Final Fantasy Sealed Foil Edition",
  ])
    assert.ok(ok(t), t);
  for (const t of [
    "MTG Final Fantasy Play Booster Box Sealed",
    "MTG Final Fantasy Bundle Sealed",
    "MTG Edge of Eternities Collector Booster Pack",
    "MTG Bloomburrow Commander Deck Animated Army Sealed",
    "MTG Final Fantasy Cloud Strife Borderless Foil 1/1 Pulled From Collector Booster Box",
    "Sephiroth #412 Serialized MTG Final Fantasy From Collector Booster Box",
    "Pokemon Surging Sparks Booster Box Sealed",
  ])
    assert.equal(ok(t), null, t);
  assert.equal(ok("MTG Final Fantasy Collector Booster Box Sealed", 99), null, "under the US$100 high-end floor");
});

test("baseItem: eBay's affiliate URL is kept EXACTLY; a missing one is rebuilt from itemWebUrl with the EPN tags and the feed's sub-id; a foreign or http one is not trusted", () => {
  const tdm = baseItem(by("Tarkir Dragonstorm"), "EBAY_US", NOW, "chase")!;
  const u = new URL(tdm.url);
  assert.equal(u.searchParams.get("mkevt"), "1");
  assert.equal(u.searchParams.get("mkrid"), "711-53200-19255-0");
  assert.equal(u.searchParams.get("campid"), EBAY_CAMPAIGN_ID);
  assert.equal(u.searchParams.get("customid"), "mtg-us-chase", "the fallback names its own feed");
  assert.equal(baseItem(by("Tarkir Dragonstorm"), "EBAY_AU", NOW, "item"), null, "a USD price is not valid on EBAY_AU");
  assert.equal(new URL(baseItem({ ...(by("Tarkir Dragonstorm") as object), price: { value: "70.00", currency: "AUD" } }, "EBAY_AU", NOW, "item")!.url).searchParams.get("customid"), "mtg-au-item");
  // an eBay-issued URL passes through untouched, whatever it holds (query order, encodings, a customid of eBay's own)
  const issued = "https://www.ebay.com.au/itm/123456789012?_skw=a+b&hash=item1%3Ag%3AX%2By&amdata=enc%3AAQAKAAAA%2B%2Fx%3D&mkevt=1&mkcid=1&mkrid=705-53470-19255-0&campid=5339155912&customid=mtg-au-sealed&toolid=10001";
  const raw = { ...(by("Tarkir Dragonstorm") as object), itemAffiliateWebUrl: issued, price: { value: "70.00", currency: "AUD" } };
  assert.equal(baseItem(raw, "EBAY_AU", NOW, "sealed")!.url, issued);
  // not ours (another campaign) or not an item page: rebuilt from itemWebUrl instead, never edited
  const other = baseItem({ ...raw, itemAffiliateWebUrl: issued.replace("5339155912", "1111111111") }, "EBAY_AU", NOW, "sealed")!;
  assert.notEqual(other.url, issued);
  assert.equal(new URL(other.url).searchParams.get("campid"), EBAY_CAMPAIGN_ID);
  assert.equal(new URL(other.url).searchParams.get("customid"), "mtg-au-sealed");
  for (const n of ["Wilds of Eldraine", "Lost Caverns"]) {
    const it = baseItem(by(n), "EBAY_US", NOW, "chase")!;
    assert.equal(new URL(it.url).protocol, "https:", n);
    assert.equal(new URL(it.url).searchParams.get("campid"), EBAY_CAMPAIGN_ID, n);
    assert.ok(!it.url.includes("1111111111"), n);
  }
  assert.equal(baseItem({ ...(by("Tarkir Dragonstorm") as object), itemWebUrl: "https://evil.com/itm/1" }, "EBAY_US", NOW, "chase"), null);
});

test("baseItem: the thumbnail stands in for a missing primary image", () => {
  const eoe = baseItem(RAW.find((r) => (r as { title: string }).title.startsWith("MTG Edge of Eternities Collector Booster Box")), "EBAY_US", NOW, "chase")!;
  assert.match(eoe.imageUrl, /ccc333/);
});

test("search price floors and currencies per marketplace (AUD, GBP, CAD, EUR, USD); the high-end floor on top", () => {
  assert.deepEqual(CHASE_FLOOR, { USD: 15, AUD: 20, GBP: 12, CAD: 20, EUR: 15 });
  const mk = (value: string, currency: string) => ({ ...(RAW[0] as object), price: { value, currency } });
  for (const mp of MARKETPLACE_IDS) {
    const cur = MARKETPLACES[mp].currency;
    const floor = Math.max(typeFloor("collector-booster-box", mp), usdToMarketplace(HIGH_END_FLOOR_USD, mp));
    assert.equal(normaliseChase(mk((floor - 0.01).toFixed(2), cur), mp, NOW), null, `${mp} under ${floor}`);
    assert.ok(normaliseChase(mk(floor.toFixed(2), cur), mp, NOW), `${mp} ${floor}`);
  }
  assert.equal(normaliseChase(mk("300.00", "USD"), "EBAY_AU", NOW), null, "USD on the AU marketplace is the wrong currency");
});

test("normaliseSetChase: sealed product of THIS set only; another set's, a single and a lot are refused", () => {
  const mk = (t: string, p = 150) => summary("1", t, p);
  assert.ok(normaliseSetChase(mk("MTG Final Fantasy Play Booster Box Sealed"), "EBAY_US", NOW, "fin"));
  assert.ok(normaliseSetChase(mk("MTG Final Fantasy Bundle Sealed", 60), "EBAY_US", NOW, "fin"));
  assert.ok(normaliseSetChase(mk("MTG Final Fantasy Collector Booster Box Sealed", 300), "EBAY_US", NOW, "fin"));
  assert.equal(normaliseSetChase(mk("MTG Aetherdrift Play Booster Box Sealed"), "EBAY_US", NOW, "fin"), null, "another set");
  assert.equal(normaliseSetChase(mk("MTG Final Fantasy Cloud Strife 1/1 Pulled From Collector Booster Box"), "EBAY_US", NOW, "fin"), null, "a card");
  assert.equal(normaliseSetChase(mk("MTG Final Fantasy Play Booster Box x2 Sealed", 300), "EBAY_US", NOW, "fin"), null, "two boxes");
  assert.equal(normaliseSetChase(mk("MTG Final Fantasy Play Booster Box Sealed", 40), "EBAY_US", NOW, "fin"), null, "under the box floor");
});

// ─── images, shipping, money ────────────────────────────────────────────────────

test("upgradeImage: s-l225 → s-l500 on the same path; never a downgrade, never another shape; still https on *.ebayimg.com", () => {
  assert.equal(upgradeImage("https://i.ebayimg.com/images/g/AbC~dEfAAOSw/s-l225.jpg"), "https://i.ebayimg.com/images/g/AbC~dEfAAOSw/s-l500.jpg");
  assert.equal(upgradeImage("https://i.ebayimg.com/images/g/AbC/s-l64.webp"), "https://i.ebayimg.com/images/g/AbC/s-l500.webp");
  assert.equal(upgradeImage("https://i.ebayimg.com/images/g/AbC/s-l1600.jpg"), "https://i.ebayimg.com/images/g/AbC/s-l1600.jpg");
  assert.equal(upgradeImage("https://i.ebayimg.com/images/g/AbC/s-l500.jpg"), "https://i.ebayimg.com/images/g/AbC/s-l500.jpg");
  assert.equal(upgradeImage("https://i.ebayimg.com/thumbs/images/g/AbC/s-l225.jpg"), "https://i.ebayimg.com/thumbs/images/g/AbC/s-l225.jpg");
  assert.equal(upgradeImage("not a url"), "not a url");
  const it = baseItem(summary("9", "MTG Final Fantasy Collector Booster Box Sealed", 180), "EBAY_US", NOW, "chase")!;
  assert.match(it.imageUrl, /^https:\/\/i\.ebayimg\.com\/images\/g\/img9\/s-l500\.jpg$/);
  assert.equal(imageKey("https://i.ebayimg.com/images/g/AbC/s-l225.jpg"), imageKey("https://i.ebayimg.com/images/g/AbC/s-l1600.webp?x=1"));
  assert.notEqual(imageKey("https://i.ebayimg.com/images/g/AbC/s-l225.jpg"), imageKey("https://i.ebayimg.com/images/g/XyZ/s-l225.jpg"));
});

test("shippingFrom: free when zero, a cost when given, nothing when eBay gave none or it is malformed", () => {
  const opt = (shippingCost: unknown) => ({ shippingOptions: [{ shippingCostType: "FIXED", shippingCost }] });
  assert.deepEqual(shippingFrom(opt({ value: "0.00", currency: "AUD" })), { free: true });
  assert.deepEqual(shippingFrom(opt({ value: "0", currency: "USD" })), { free: true });
  assert.deepEqual(shippingFrom(opt({ value: "12.50", currency: "AUD" })), { value: "12.50", currency: "AUD" });
  assert.deepEqual(shippingFrom(opt({ value: "4.5", currency: "USD" })), { value: "4.5", currency: "USD" });
  assert.equal(shippingFrom({ shippingOptions: [{ shippingCostType: "CALCULATED" }] }), undefined);
  assert.equal(shippingFrom({}), undefined);
  assert.equal(shippingFrom({ shippingOptions: [] }), undefined);
  assert.equal(shippingFrom({ shippingOptions: "x" }), undefined);
  for (const bad of [{ value: "-3", currency: "USD" }, { value: "abc", currency: "USD" }, { value: "5", currency: "usd" }, { value: 5, currency: "USD" }, null, "x"]) assert.equal(shippingFrom(opt(bad)), undefined, JSON.stringify(bad));
  // only the FIRST option counts
  assert.deepEqual(shippingFrom({ shippingOptions: [{ shippingCost: { value: "0.00", currency: "USD" } }, { shippingCost: { value: "9.00", currency: "USD" } }] }), { free: true });
});

// ─── rows of a feed ─────────────────────────────────────────────────────────────

const mkItem = (id: string, photo: string, price = 300) => ({ ...summary(id, "MTG Final Fantasy Collector Booster Box Sealed", price), image: { imageUrl: `https://i.ebayimg.com/images/g/${photo}/s-l225.jpg` } });

test("roundRobin: spread across queries, de-duplicated by id and by photo, capped", () => {
  const norm = (xs: unknown[]) => xs.map((x) => normaliseChase(x, "EBAY_US", NOW)!).filter(Boolean);
  const A = norm(Array.from({ length: 10 }, (_, i) => mkItem(`a${i}`, `pa${i}`)));
  const B = norm(Array.from({ length: 10 }, (_, i) => mkItem(`b${i}`, `pb${i}`)));
  const C = norm([mkItem("c0", "pc0")]);
  const out = roundRobin([A, B, C], 12);
  assert.equal(out.length, 12);
  assert.deepEqual(out.slice(0, 3).map((o) => o.id), ["v1|a0|0", "v1|b0|0", "v1|c0|0"]);
  assert.deepEqual(out.slice(3, 6).map((o) => o.id), ["v1|a1|0", "v1|b1|0", "v1|a2|0"]);
  const dup = roundRobin([norm([mkItem("x1", "same"), mkItem("x2", "other")]), norm([mkItem("y1", "same"), mkItem("x1", "p9"), mkItem("y2", "p8")])], 12);
  assert.deepEqual(dup.map((d) => d.id), ["v1|x1|0", "v1|x2|0", "v1|y2|0"]);
  assert.deepEqual(roundRobin([], 12), []);
  assert.deepEqual(roundRobin([[], []], 12), []);
});

test("lowestPriceFirst: de-duplicated, ascending by price, stable, capped", () => {
  const norm = (xs: unknown[]) => xs.map((x) => normaliseChase(x, "EBAY_US", NOW)!).filter(Boolean);
  const items = norm([mkItem("c", "pc", 500), mkItem("a", "pa", 200), mkItem("b", "pb", 200), mkItem("a", "pz", 150), mkItem("d", "pa", 160), mkItem("e", "pe", 990)]);
  const out = lowestPriceFirst(items, 3);
  assert.deepEqual(out.map((o) => o.price.value), ["200.00", "200.00", "500.00"]);
  assert.deepEqual(out.map((o) => o.id), ["v1|a|0", "v1|b|0", "v1|c|0"], "ties by id; a repeated id or photo is dropped");
  // no derived statistics anywhere in the output
  for (const o of out) for (const k of Object.keys(o)) assert.ok(["id", "title", "imageUrl", "price", "ship", "condition", "url"].includes(k), k);
});

// ─── floors ─────────────────────────────────────────────────────────────────────

test("type floors in each marketplace's currency, and US$ thresholds", () => {
  assert.equal(typeFloor("play-booster-box", "EBAY_US"), 70);
  assert.equal(typeFloor("play-booster-box", "EBAY_AU"), 105);
  assert.equal(typeFloor("bundle", "EBAY_GB"), 20); // 25 x 0.78 = 19.5, rounded up
  assert.equal(typeFloor("play-booster-box", "EBAY_DE"), 63);
  assert.equal(typeFloor("play-booster-box", "EBAY_CA"), 96); // 95.9
  assert.equal(usdToMarketplace(30, "EBAY_US"), 30);
  assert.equal(usdToMarketplace(30, "EBAY_AU"), 45);
  assert.equal(usdToMarketplace(30, "EBAY_GB"), 24); // 23.4
  for (const id of MARKETPLACE_IDS) assert.ok(typeFloor("play-booster", id) >= 1);
});

// ─── sealed feeds ───────────────────────────────────────────────────────────────

test("sealed feeds refuse pre-sales, 'read description' notes, dented boxes and eBay Live lots", () => {
  const ok = (t: string, p = 150) => normaliseSealed(summary("1", t, p), "EBAY_US", NOW);
  for (const t of [
    "MTG Star Trek Play Booster Box Presale 11/13",
    "MTG Star Trek Bundle 11/13 PRESALE",
    "PRE SALE MTG Star Trek Play Booster Box",
    "MTG Star Trek Play Booster Box Pre-Order",
    "MTG Aetherdrift Play Booster Box SEALED DENTS READ DESC",
    "Check Desc MTG Aetherdrift Play Booster Box",
    "MTG Aetherdrift Play Booster Box dented corner",
    "#001 - [EBAY LIVE] MTG Aetherdrift Play Booster Box",
  ]) assert.equal(ok(t), null, t);
  assert.ok(ok("MTG Aetherdrift Play Booster Box Factory Sealed"));
  const target: ItemTarget = { groupKey: "dft|play-booster-box", type: "play-booster-box", setCode: "dft" };
  assert.equal(relevantToProduct("MTG Aetherdrift Play Booster Box Presale", target), false);
});

test("titles lose emoji and decoration, and 'MTG MTG' is said once", () => {
  assert.equal(cleanTitle("🔥 MTG Final Fantasy Collector Booster Box ✅"), "MTG Final Fantasy Collector Booster Box");
  assert.equal(cleanTitle("MTG MTG Final Fantasy Play Booster Box"), "MTG Final Fantasy Play Booster Box");
  assert.equal(cleanTitle("💙 *** Magic Magic Aetherdrift Bundle *** 💙"), "Magic Aetherdrift Bundle");
  assert.equal(cleanTitle("Aetherdrift Bundle — Sealed (Mint) ★"), "Aetherdrift Bundle — Sealed (Mint)");
  assert.equal(cleanTitle("x".repeat(200)).length, 80);
  assert.equal(cleanTitle(undefined), "");
  const it = baseItem(summary("1", "🔥 MTG MTG Final Fantasy Collector Booster Box ✅", 150), "EBAY_US", NOW, "chase");
  assert.equal(it?.title, "MTG Final Fantasy Collector Booster Box");
});

test("normaliseSealed: only whole sealed Magic products the classifier accepts, over their type's floor", () => {
  const ok = (t: string, p = 150) => normaliseSealed(summary("1", t, p), "EBAY_US", NOW);
  assert.ok(ok("Magic The Gathering Aetherdrift Play Booster Box Factory Sealed NEW"));
  assert.ok(ok("MTG Aetherdrift Bundle Sealed", 50));
  assert.ok(ok("MTG Bloomburrow Commander Deck Animated Army Sealed", 50));
  assert.equal(ok("MTG Aetherdrift Play Booster Pack", 150), null, "a pack is not a feed product");
  assert.equal(ok("MTG Aetherdrift Play Booster Box Japanese"), null);
  assert.ok(ok("Aetherdrift Play Booster Box"), "a plain title naming the set");
  assert.equal(ok("MTG Aetherdrift Play Booster Box", 40), null, "under the booster box floor");
  assert.equal(ok("Pokemon Surging Sparks Booster Box Sealed"), null, "another game");
  assert.equal(ok("Yu-Gi-Oh Booster Box Sealed"), null, "another game");
  assert.equal(ok("MTG Aetherdrift Collector Booster Pulled From Collector Booster Box", 150), null, "a product's contents");
  // several units in one listing never reach the sealed feed (a 2-8 unit price under one product's name)
  for (const title of [
    "MTG Aetherdrift Play Booster Box x2 Sealed",
    "MTG Aetherdrift Bundle (2) Sealed",
    "MTG Two Aetherdrift Bundles Sealed",
    "MTG Aetherdrift Bundle Twin Pack",
    "MTG 3 Aetherdrift Play Booster Boxes",
    "MTG Aetherdrift Bundle Qty 2",
  ])
    assert.equal(ok(title, 200), null, title);
  assert.ok(ok("MTG Murders at Karlov Manor Bundle 9 Play Boosters Sealed", 60), "9 packs is the bundle, not a quantity");
});

test("normaliseType: exactly the type's products", () => {
  const t = (title: string, type: "bundle" | "play-booster-box" | "play-booster-box-case", p = 200) => normaliseType(summary("1", title, p), "EBAY_US", NOW, type);
  assert.ok(t("MTG Aetherdrift Bundle Sealed", "bundle", 60));
  assert.equal(t("MTG Aetherdrift Play Booster Box Sealed", "bundle"), null);
  assert.equal(t("MTG Aetherdrift Bundle Case 10 Count Sealed", "bundle", 700), null, "a case is not a bundle");
  assert.ok(t("MTG Aetherdrift Play Booster Box Case 6 Boxes Sealed", "play-booster-box-case", 900));
  assert.equal(t("MTG Aetherdrift Play Booster Box Case 6 Boxes Sealed", "play-booster-box"), null);
  assert.equal(t("MTG Aetherdrift Play Booster Box Case Fresh Sealed", "play-booster-box-case", 900), null, "a case-fresh box is not the case");
  // several units in one listing never reach a type feed either
  assert.equal(t("MTG Aetherdrift Bundle x2 Sealed", "bundle", 120), null);
  assert.equal(t("MTG 2 Aetherdrift Bundles Sealed", "bundle", 120), null);
  assert.equal(t("MTG Aetherdrift Play Booster Box Set of Two", "play-booster-box", 400), null);
  assert.ok(t("MTG Murders at Karlov Manor Bundle 9 Play Boosters Sealed", "bundle", 80));
});

// ─── one product: relevance ─────────────────────────────────────────────────────

function target(name: string): ItemTarget {
  const id = identify(name);
  assert.ok(isIdentity(id), name);
  return { groupKey: id.groupKey, type: id.type, setCode: id.set?.code ?? null };
}
const BUNDLE = target("Aetherdrift Bundle");
const BOX = target("Aetherdrift Play Booster Box");
const CBOX = target("Final Fantasy Collector Booster Box");
const DECK = target("Bloomburrow Commander Deck Animated Army");
const GIFT = target("Bloomburrow Gift Bundle");
const CASE = target("Aetherdrift Play Booster Box Case");
const PACK = target("Aetherdrift Play Booster Pack");
const DSET = target("Duskmourn Commander Deck Set of 4");

// [title, target, accepted]
const RELEVANCE: [string, ItemTarget, boolean][] = [
  // the right product, noisy SEO titles, in every spelling sellers use
  ["Magic The Gathering Aetherdrift Bundle Sealed NEW", BUNDLE, true],
  ["Aetherdrift Bundle - MTG - Factory Sealed - Fast Ship", BUNDLE, true],
  ["MTG Aetherdrift Bundle 9 Play Boosters Brand New", BUNDLE, true],
  ["Magic: The Gathering Aetherdrift Bundle USA Seller Free Shipping", BUNDLE, true],
  ["NEW MTG: Aetherdrift Bundle Sealed!", BUNDLE, true],
  ["MTG Aetherdrift Bundle - Sealed - Ships Today", BUNDLE, true],
  ["MTG Aetherdrift Bundle - Sealed - Ashiok Edition", BUNDLE, false],
  ["Magic The Gathering Aetherdrift Play Booster Box 30 Packs Sealed", BOX, true],
  ["Aetherdrift Play Booster Box Display - Factory Sealed English", BOX, true],
  ["MTG Aetherdrift Play Booster Box DFT Brand New Sealed Fast Shipping", BOX, true],
  ["MTG Final Fantasy Collector Booster Box Sealed NEW Fast Ship", CBOX, true],
  ["Final Fantasy Collector Booster Box - Magic The Gathering - Factory Sealed", CBOX, true],
  ["MTG Bloomburrow Commander Deck Animated Army Sealed NEW", DECK, true],
  ["MTG Bloomburrow Gift Bundle Sealed", GIFT, true],
  ["MTG Aetherdrift Play Booster Box Case 6 Boxes Factory Sealed", CASE, true],
  ["MTG Aetherdrift Play Booster Pack Sealed", PACK, true],
  ["MTG Duskmourn Commander Deck Set of 4 Sealed", DSET, true],
  // other products, singles, cases, lots, empty or opened, other languages, damaged
  ["MTG Aetherdrift Bundle Case 10 Count Factory Sealed", BUNDLE, false],
  ["MTG Aetherdrift Play Booster Box 30 Packs", BUNDLE, false],
  ["MTG Aetherdrift Gift Bundle Sealed", BUNDLE, false],
  ["MTG Aetherdrift Bundle EMPTY BOX ONLY", BUNDLE, false],
  ["MTG Aetherdrift Bundle Japanese", BUNDLE, false],
  ["MTG Tarkir Dragonstorm Bundle Sealed", BUNDLE, false],
  ["MTG Aetherdrift Bundle opened no shrink wrap", BUNDLE, false],
  ["2x MTG Aetherdrift Bundle Lot Sealed", BUNDLE, false],
  ["MTG Aetherdrift Sab-Sunen Borderless 1/1 Pulled From Bundle", BUNDLE, false],
  ["MTG Aetherdrift Bundle Sleeves and Dice Accessory Set", BUNDLE, false],
  ["MTG Aetherdrift Bundle Damaged Box Dent on corner", BUNDLE, false],
  ["Costco MTG Aetherdrift Bundle", BUNDLE, false],
  ["MTG Aetherdrift Bundle Korean", BUNDLE, false],
  ["MTG Aetherdrift Bundle German Deutsch", BUNDLE, false],
  ["MTG Aetherdrift Play Booster Box Case (6 Boxes) Sealed", BOX, false],
  ["MTG Aetherdrift Play Booster Box Case Fresh", CASE, false],
  ["MTG Aetherdrift Play Booster Pack Single Sealed", BOX, false],
  ["MTG Aetherdrift Bundle", BOX, false],
  ["MTG Aetherdrift Play Booster Box Japanese", BOX, false],
  ["MTG Aetherdrift Play Booster Box EMPTY", BOX, false],
  ["MTG Aetherdrift Collector Booster Box Sealed", BOX, false],
  ["MTG Tarkir Dragonstorm Play Booster Box Sealed", BOX, false],
  ["MTG Final Fantasy Play Booster Box Sealed", CBOX, false],
  ["MTG Final Fantasy Collector Booster Pack Sealed", CBOX, false],
  ["MTG Final Fantasy Collector Booster Box EMPTY box", CBOX, false],
  ["MTG Final Fantasy Collector Booster Box Japanese", CBOX, false],
  ["MTG Bloomburrow Commander Deck Squirreled Away Sealed", DECK, false],
  ["MTG Bloomburrow Commander Deck Set of 4 Sealed", DECK, false],
  ["MTG Bloomburrow Bundle Sealed", GIFT, false],
  ["Pokemon Aetherdrift Bundle", BUNDLE, false],
  ["Yu-Gi-Oh Booster Box Sealed", BOX, false],
  ["MTG Aetherdrift Play Booster Pack x10 Lot", PACK, false],
  ["MTG Aetherdrift 5 Play Booster Packs Sealed", PACK, false],
  ["MTG Aetherdrift & Tarkir Dragonstorm Play Booster Box", BOX, false],
  // several units in one listing: the price is not one product's
  ["MTG Aetherdrift Bundle x2 Sealed", BUNDLE, false],
  ["Two MTG Aetherdrift Bundles", BUNDLE, false],
  ["MTG Aetherdrift Bundle X2 sealed", BUNDLE, false],
  ["MTG Aetherdrift Bundle (2)", BUNDLE, false],
  ["MTG Aetherdrift Bundle Qty 2", BUNDLE, false],
  ["2 MTG Aetherdrift Bundles", BUNDLE, false],
  ["MTG Aetherdrift Bundle Set of Two", BUNDLE, false],
  ["MTG Aetherdrift Bundle Double Pack", BUNDLE, false],
  ["MTG Aetherdrift Bundle - 4 Boxes", BUNDLE, false],
  ["MTG Aetherdrift Bundle Multi-buy", BUNDLE, false],
  ["MTG Aetherdrift Play Booster Box x 2", BOX, false],
  ["Three MTG Aetherdrift Play Booster Boxes", BOX, false],
  ["MTG Final Fantasy Collector Booster Box x2 Sealed", CBOX, false],
  ["MTG Bloomburrow Commander Deck Animated Army (2) Sealed", DECK, false],
  ["MTG Bloomburrow Commander Deck Animated Army Lot of 3", DECK, false],
  // ...and wording that only LOOKS like a quantity stays accepted
  ["MTG Aetherdrift Bundle 9 Packs Sealed", BUNDLE, true],
  ["MTG Aetherdrift Play Booster Box 30 Booster Packs in Box", BOX, true],
  ["MTG Final Fantasy Collector Booster Box 12 Packs Sealed", CBOX, true],
  ["MTG Aetherdrift Play Booster Box Case 6 Boxes Sealed", CASE, true],
  ["MTG Duskmourn Commander Deck Set of 4 Decks Sealed", DSET, true],
  ["MTG Bloomburrow Gift Bundle x2", GIFT, false],
];

test("multiUnit: quantity wording per type; N-pack is fine for a bundle or a prerelease kit, a case IS several boxes", () => {
  assert.equal(multiUnit("MTG Aetherdrift Play Booster Box Costco", "play-booster-box"), true, "Costco combo");
  assert.equal(multiUnit("MTG Aetherdrift Bundle 9-Pack", "bundle"), false);
  assert.equal(multiUnit("MTG Aetherdrift Prerelease Pack 6-Pack Kit", "prerelease-pack"), false);
  assert.equal(multiUnit("MTG Aetherdrift Play Booster Box 3-Pack", "play-booster-box"), true);
  assert.equal(multiUnit("MTG Aetherdrift Play Booster Box Case 6 Boxes", "play-booster-box-case"), false, "a case is several boxes");
  assert.equal(multiUnit("MTG Aetherdrift Play Booster Box x2", "play-booster-box"), true);
});

test(`relevantToProduct: ${RELEVANCE.length} realistic eBay titles, the right product accepted and every wrong one refused`, () => {
  assert.ok(RELEVANCE.length >= 70);
  assert.ok(RELEVANCE.filter((r) => r[2]).length >= 20 && RELEVANCE.filter((r) => !r[2]).length >= 40, "both ways");
  for (const [title, tgt, want] of RELEVANCE) {
    const accepted = relevantToProduct(title, tgt) && !refusedListing(title) && !refusedForType(title, tgt.type);
    assert.equal(accepted, want, `${want ? "should accept" : "should refuse"}: ${title}`);
  }
});

test("normaliseItemFeed: relevance, the type's floor, currency, shipping and the affiliate URL together", () => {
  const good = summary("77", "MTG Aetherdrift Bundle Sealed NEW", 49, "EBAY_US", { shippingOptions: [{ shippingCost: { value: "8.00", currency: "USD" } }] });
  const it = normaliseItemFeed(good, "EBAY_US", NOW, BUNDLE)!;
  assert.ok(it);
  assert.deepEqual(it.ship, { value: "8.00", currency: "USD" });
  assert.equal(new URL(it.url).searchParams.get("campid"), EBAY_CAMPAIGN_ID);
  assert.equal(normaliseItemFeed(summary("78", "MTG Aetherdrift Bundle Sealed NEW", 19), "EBAY_US", NOW, BUNDLE), null, "under the bundle floor (US$25)");
  assert.equal(normaliseItemFeed(summary("79", "MTG Aetherdrift Bundle Sealed NEW", 80, "EBAY_AU"), "EBAY_US", NOW, BUNDLE), null, "AUD on the US marketplace");
  assert.equal(normaliseItemFeed(summary("80", "MTG Aetherdrift Bundle Sealed", 80, "EBAY_US", { buyingOptions: ["AUCTION"] }), "EBAY_US", NOW, BUNDLE), null, "auction");
  assert.equal(normaliseItemFeed(summary("81", "MTG Aetherdrift Bundle Sealed", 80, "EBAY_US", { image: { imageUrl: "https://evil.example/x.jpg" }, thumbnailImages: [] }), "EBAY_US", NOW, BUNDLE), null, "an image that is not eBay's");
});

test("a booster pack's own search refuses multi-pack lots and other non-units, as the sweep does", () => {
  const ok = (t: string) => normaliseItemFeed(summary("1", t, 20), "EBAY_US", NOW, PACK);
  for (const t of [
    "MTG Aetherdrift 5 Play Booster Packs Sealed",
    "MTG Aetherdrift Play Booster Packs",
    "MTG Aetherdrift Play Booster Pack - 4 Packs",
    "MTG Aetherdrift Play Booster Pack x10",
    "MTG Aetherdrift Play Booster Pack Lot",
  ])
    assert.equal(ok(t), null, t);
  assert.ok(ok("MTG Aetherdrift Play Booster Pack Sealed"));
});
