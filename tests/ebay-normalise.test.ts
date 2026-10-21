import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EBAY_CAMPAIGN_ID } from "../src/lib/affiliate";
import {
  baseItem,
  CHASE_FLOOR,
  imageKey,
  isJunkTitle,
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
  type ItemTarget,
} from "../src/lib/ebay-normalise";
import { cleanTitle, MARKETPLACE_IDS, MARKETPLACES, type MarketplaceId } from "../src/lib/ebay-context";
import { identify, isIdentity } from "../src/lib/sealed-title";
import { NOW, summary } from "./helpers/ebay-fakes";

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/ebay-search-us.json", import.meta.url), "utf8"));
const RAW: unknown[] = FIXTURE.itemSummaries;
const by = (needle: string) => RAW.find((r) => (r as { title: string }).title.includes(needle));

// ─── chase cards (ported from the on-demand client's tests: same filters) ────────

test("normaliseChase: accepts the good fixtures and keeps only whitelisted fields, with shipping", () => {
  const good = RAW.map((r) => normaliseChase(r, "EBAY_US", NOW)).filter(Boolean);
  assert.equal(good.length, 7, good.map((g) => g!.title).join("\n"));
  for (const g of good) {
    assert.deepEqual(Object.keys(g!).filter((k) => !["condition", "ship"].includes(k)).sort(), ["id", "imageUrl", "price", "title", "url"]);
    assert.equal(g!.price.currency, "USD");
    assert.ok(Number(g!.price.value) >= CHASE_FLOOR.USD);
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
  assert.equal(good[1]!.condition, "Graded");
});

test("normaliseChase: every reject case is rejected, garbage never throws", () => {
  assert.equal(normaliseChase(by("Custom Proxy"), "EBAY_US", NOW), null);
  assert.equal(normaliseChase(by("Japanese"), "EBAY_US", NOW), null);
  assert.equal(normaliseChase(by("Mewtwo ex 231/217"), "EBAY_US", NOW), null, "EUR price on EBAY_US");
  assert.equal(normaliseChase(by("Mega Charizard X"), "EBAY_US", NOW), null, "converted price");
  assert.equal(normaliseChase(by("223/197"), "EBAY_US", NOW), null, "below the USD 15 floor");
  assert.equal(normaliseChase(by("auction"), "EBAY_US", NOW), null, "AUCTION only");
  assert.equal(normaliseChase(by("lot of 20"), "EBAY_US", NOW), null, "a lot");
  assert.equal(normaliseChase(by("Booster Box"), "EBAY_US", NOW), null, "sealed product");
  assert.equal(normaliseChase(by("ENDED"), "EBAY_US", NOW), null, "ended");
  assert.equal(normaliseChase(by("Blastoise"), "EBAY_US", NOW), null, "image off eBay hosts");
  assert.equal(normaliseChase(by("no photo"), "EBAY_US", NOW), null, "no image");
  assert.equal(normaliseChase(by("Espeon"), "EBAY_US", NOW), null, "no price");
  assert.equal(normaliseChase(by("lovely thing"), "EBAY_US", NOW), null, "not recognisably a card");
  for (const g of [null, undefined, 5, "x", [], {}, { itemId: 1 }, { itemId: "a", title: "x" }, { itemId: "a", title: "Charizard ex 1/2", price: "5" }]) assert.equal(normaliseChase(g, "EBAY_US", NOW), null);
  const ok = by("Umbreon");
  assert.ok(normaliseChase(ok, "EBAY_US", NOW));
  assert.equal(normaliseChase({ ...(ok as object), adultOnly: true }, "EBAY_US", NOW), null, "adult-only");
});

test("baseItem: eBay's affiliate URL is kept EXACTLY; a missing one is rebuilt from itemWebUrl with the EPN tags and the feed's sub-id; a foreign or http one is not trusted", () => {
  const umbreon = baseItem(by("Umbreon"), "EBAY_US", NOW, "chase")!;
  const u = new URL(umbreon.url);
  assert.equal(u.searchParams.get("mkevt"), "1");
  assert.equal(u.searchParams.get("mkrid"), "711-53200-19255-0");
  assert.equal(u.searchParams.get("campid"), EBAY_CAMPAIGN_ID);
  assert.equal(u.searchParams.get("customid"), "dex-us-chase", "the fallback names its own feed");
  assert.equal(baseItem(by("Umbreon"), "EBAY_AU", NOW, "item"), null, "a USD price is not valid on EBAY_AU");
  assert.equal(new URL(baseItem({ ...(by("Umbreon") as object), price: { value: "70.00", currency: "AUD" } }, "EBAY_AU", NOW, "item")!.url).searchParams.get("customid"), "dex-au-item");
  // an eBay-issued URL passes through untouched, whatever it holds (query order, encodings, a customid of eBay's own)
  const issued = "https://www.ebay.com.au/itm/123456789012?_skw=a+b&hash=item1%3Ag%3AX%2By&amdata=enc%3AAQAKAAAA%2B%2Fx%3D&mkevt=1&mkcid=1&mkrid=705-53470-19255-0&campid=5339155912&customid=dex-au-sealed&toolid=10001";
  const raw = { ...(by("Umbreon") as object), itemAffiliateWebUrl: issued, price: { value: "70.00", currency: "AUD" } };
  assert.equal(baseItem(raw, "EBAY_AU", NOW, "sealed")!.url, issued);
  // not ours (another campaign) or not an item page: rebuilt from itemWebUrl instead, never edited
  const other = baseItem({ ...raw, itemAffiliateWebUrl: issued.replace("5339155912", "1111111111") }, "EBAY_AU", NOW, "sealed")!;
  assert.notEqual(other.url, issued);
  assert.equal(new URL(other.url).searchParams.get("campid"), EBAY_CAMPAIGN_ID);
  assert.equal(new URL(other.url).searchParams.get("customid"), "dex-au-sealed");
  for (const n of ["Alakazam", "Venusaur"]) {
    const it = baseItem(by(n), "EBAY_US", NOW, "chase")!;
    assert.equal(new URL(it.url).protocol, "https:", n);
    assert.equal(new URL(it.url).searchParams.get("campid"), EBAY_CAMPAIGN_ID, n);
    assert.ok(!it.url.includes("1111111111"), n);
  }
  assert.equal(baseItem({ ...(by("Umbreon") as object), itemWebUrl: "https://evil.com/itm/1" }, "EBAY_US", NOW, "chase"), null);
});

test("baseItem: the thumbnail stands in for a missing primary image", () => {
  const pikachu = baseItem(RAW.find((r) => (r as { title: string }).title.startsWith("Pikachu ex 238/191 Special Illustration Rare Surging")), "EBAY_US", NOW, "chase")!;
  assert.match(pikachu.imageUrl, /ccc333/);
});

test("chase price floors and currencies per marketplace (AUD, GBP, CAD, EUR, USD)", () => {
  assert.deepEqual(CHASE_FLOOR, { USD: 15, AUD: 20, GBP: 12, CAD: 20, EUR: 15 });
  const mk = (value: string, currency: string) => ({ ...(RAW[0] as object), price: { value, currency } });
  const cases: [MarketplaceId, string, string, string][] = [
    ["EBAY_US", "USD", "14.99", "15.00"],
    ["EBAY_AU", "AUD", "19.99", "20.00"],
    ["EBAY_GB", "GBP", "11.99", "12.00"],
    ["EBAY_CA", "CAD", "19.99", "20.00"],
    ["EBAY_DE", "EUR", "14.99", "15.00"],
  ];
  for (const [mp, cur, below, atFloor] of cases) {
    assert.equal(MARKETPLACES[mp].currency, cur);
    assert.equal(normaliseChase(mk(below, cur), mp, NOW), null, `${mp} ${below}`);
    assert.ok(normaliseChase(mk(atFloor, cur), mp, NOW), `${mp} ${atFloor}`);
  }
  assert.equal(normaliseChase(mk("30.00", "USD"), "EBAY_AU", NOW), null, "USD on the AU marketplace is the wrong currency");
});

test("junk titles: reproductions, foreign cards that do not say so, sealed product, kits, merchandise", () => {
  const junk = [
    "Custom Charizard ex Special Illustration Rare", "Charizard ex Proxy 199/165", "Pikachu ex SIR Replica", "Reprint Charizard ex 199/165", "Orica Charizard ex", "Fan Art Charizard ex holo",
    "Lot of 10 Charizard ex rare", "Charizard ex rare damaged", "Japanese Charizard ex SIR", "Korean Charizard ex SIR", "Charizard ex SIR Deutsch", "Pokemon 151 Booster Bundle holo rare",
    "Umbreon ex 161/131 Prismatic Evolutions Reproduction Card Holo",
    "Pokemon Card Game Charizard ex SAR 201/165 sv2a Scarlet & Violet 151 Mint",
    "PSA 10 Charizard 003/032 CLL Holo Kartenspiel Pokemon Classic Japanisch 2023",
    "Pokémon: 30 Jahre - Gengar ex - Special Illustration Rare - 30C DE 154/128",
    "Pokemon Mew ex 152/128 Special Illustration Rare 30th Celebration DE",
    "Glurak Charizard ex 199/165 SV 151 SIR EN Holo PSA 8 ENG",
    "Dracaufeu ex 199/165 Illustration Spéciale Rare 151 FR",
    "Charizard ex 223/197 Special Illustration Rare FR Obsidian Flames",
    "Umbreon ex SAR 217/187 Pokemon Card sv8a Terastal Fest",
    "Charizard ex Illustration Rare 199/165 Pokemon Russian Card",
    "Charizard ex Tarjeta Pokemon Rara 199/165",
    "Pokemon Karte Glurak ex 199/165 Sammelkarte",
    "PSA 10 Charizard 003/032 CLL Holo Kartenspiel Pokemon Classic Japanisch 2023",
    "Charizard ex Ultra Premium Collection Pokemon TCG Special Illustration Rare",
    "Charizard ex League Battle Deck 199/165",
    "Charizard ex Oversized Jumbo Promo Card 199/165",
    "Charizard ex Art Print Special Illustration Rare 8x10",
    "Charizard ex SIR Toploader Holder 199/165",
    "Charizard ex Ultra Premium", "Rare Candy Pokemon trainer", "Pikachu holo",
  ];
  for (const t of junk) assert.ok(isJunkTitle(t), t);
  for (const t of [
    "Charizard ex 199/165 Special Illustration Rare Scarlet & Violet 151 NM",
    "Umbreon ex Special Illustration Rare 161/131 Prismatic Evolutions Pokemon Card",
    "PSA 10 Charizard ex 199/165 Pokemon 151 SIR",
    "Mega Charizard X ex 013/132 Mega Evolution Ultra Rare Holo",
    "Pikachu ex 238/191 SIR Surging Sparks sv8 English NM",
  ])
    assert.ok(!isJunkTitle(t), t);
});

test("normaliseSetChase: a card that names another set is refused, one naming this set or none is kept", () => {
  const mk = (t: string) => summary("1", t, 80);
  assert.ok(normaliseSetChase(mk("Pikachu ex 238/191 Special Illustration Rare Surging Sparks"), "EBAY_US", NOW, "sv8"));
  assert.ok(normaliseSetChase(mk("Pikachu ex 238/191 Special Illustration Rare"), "EBAY_US", NOW, "sv8"));
  assert.equal(normaliseSetChase(mk("Umbreon ex 161/131 Special Illustration Rare Prismatic Evolutions"), "EBAY_US", NOW, "sv8"), null);
});

// ─── images, shipping, money ────────────────────────────────────────────────────

test("upgradeImage: s-l225 → s-l500 on the same path; never a downgrade, never another shape; still https on *.ebayimg.com", () => {
  assert.equal(upgradeImage("https://i.ebayimg.com/images/g/AbC~dEfAAOSw/s-l225.jpg"), "https://i.ebayimg.com/images/g/AbC~dEfAAOSw/s-l500.jpg");
  assert.equal(upgradeImage("https://i.ebayimg.com/images/g/AbC/s-l64.webp"), "https://i.ebayimg.com/images/g/AbC/s-l500.webp");
  assert.equal(upgradeImage("https://i.ebayimg.com/images/g/AbC/s-l1600.jpg"), "https://i.ebayimg.com/images/g/AbC/s-l1600.jpg");
  assert.equal(upgradeImage("https://i.ebayimg.com/images/g/AbC/s-l500.jpg"), "https://i.ebayimg.com/images/g/AbC/s-l500.jpg");
  assert.equal(upgradeImage("https://i.ebayimg.com/thumbs/images/g/AbC/s-l225.jpg"), "https://i.ebayimg.com/thumbs/images/g/AbC/s-l225.jpg");
  assert.equal(upgradeImage("not a url"), "not a url");
  const it = baseItem(summary("9", "Charizard ex 199/165 Special Illustration Rare", 80), "EBAY_US", NOW, "chase")!;
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

const mkItem = (id: string, photo: string, price = 30) => ({ ...summary(id, `Charizard ex ${id} 199/165 Special Illustration Rare`, price), image: { imageUrl: `https://i.ebayimg.com/images/g/${photo}/s-l225.jpg` } });

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
  const items = norm([mkItem("c", "pc", 50), mkItem("a", "pa", 20), mkItem("b", "pb", 20), mkItem("a", "pz", 5), mkItem("d", "pa", 1), mkItem("e", "pe", 99)]);
  const out = lowestPriceFirst(items, 3);
  assert.deepEqual(out.map((o) => o.price.value), ["20.00", "20.00", "50.00"]);
  assert.deepEqual(out.map((o) => o.id), ["v1|a|0", "v1|b|0", "v1|c|0"], "ties by id; a repeated id or photo is dropped");
  // no derived statistics anywhere in the output
  for (const o of out) for (const k of Object.keys(o)) assert.ok(["id", "title", "imageUrl", "price", "ship", "condition", "url"].includes(k), k);
});

// ─── floors ─────────────────────────────────────────────────────────────────────

test("type floors in each marketplace's currency, and US$ thresholds", () => {
  assert.equal(typeFloor("booster-box", "EBAY_US"), 70);
  assert.equal(typeFloor("booster-box", "EBAY_AU"), 105);
  assert.equal(typeFloor("etb", "EBAY_GB"), 20); // 25 x 0.78 = 19.5, rounded up
  assert.equal(typeFloor("booster-box", "EBAY_DE"), 63);
  assert.equal(typeFloor("booster-box", "EBAY_CA"), 96); // 95.9
  assert.equal(usdToMarketplace(30, "EBAY_US"), 30);
  assert.equal(usdToMarketplace(30, "EBAY_AU"), 45);
  assert.equal(usdToMarketplace(30, "EBAY_GB"), 24); // 23.4
  for (const id of MARKETPLACE_IDS) assert.ok(typeFloor("tin", id) >= 1);
});

// ─── sealed feeds ───────────────────────────────────────────────────────────────

test("sealed feeds refuse pre-sales, 'read description' notes, dented boxes and eBay Live lots; a Pre-Release kit stays", () => {
  const ok = (t: string, p = 150) => normaliseSealed(summary("1", t, p), "EBAY_US", NOW);
  for (const t of [
    "Pokemon Delta Reign Booster Box Presale 11/6",
    "Pokemon Delta Reign Elite Trainer Box 11/6 PRESALE",
    "PRE SALE Pokemon Delta Reign Booster Box",
    "Pokemon Delta Reign Booster Box Pre-Order",
    "Pokemon Astral Radiance Booster Box SEALED DENTS READ DESC",
    "Check Desc Pokemon Astral Radiance Booster Box",
    "Pokemon Surging Sparks Booster Box dented corner",
    "#001 - [EBAY LIVE] Pokemon Surging Sparks Booster Box",
  ]) assert.equal(ok(t), null, t);
  assert.ok(ok("Pokemon Surging Sparks Booster Box Factory Sealed"));
  const target: ItemTarget = { groupKey: "surging-sparks|booster-box", type: "booster-box", setCode: "sv8" };
  assert.equal(relevantToProduct("Pokemon Surging Sparks Booster Box Presale", target), false);
});

test("titles lose emoji and decoration, and 'Pokemon Pokemon' is said once", () => {
  assert.equal(cleanTitle("🔥 Pokemon Charizard ex 234/091 PSA 10 ✅"), "Pokemon Charizard ex 234/091 PSA 10");
  assert.equal(cleanTitle("Pokemon Pokemon Card Game MEGA Charizard ex"), "Pokemon Card Game MEGA Charizard ex");
  assert.equal(cleanTitle("💙 *** Pokémon Pokémon Surging Sparks ETB *** 💙"), "Pokémon Surging Sparks ETB");
  assert.equal(cleanTitle("Charizard ex — 199/165 (Mint) ★"), "Charizard ex — 199/165 (Mint)");
  assert.equal(cleanTitle("x".repeat(200)).length, 80);
  assert.equal(cleanTitle(undefined), "");
  const it = baseItem(summary("1", "🔥 Pokemon Pokemon Charizard ex 199/165 PSA 10 ✅", 150), "EBAY_US", NOW, "chase");
  assert.equal(it?.title, "Pokemon Charizard ex 199/165 PSA 10");
});

test("normaliseSealed: only whole sealed products the classifier accepts, over their type's floor", () => {
  const ok = (t: string, p = 150) => normaliseSealed(summary("1", t, p), "EBAY_US", NOW);
  assert.ok(ok("Pokemon TCG Surging Sparks Booster Box Factory Sealed NEW"));
  assert.ok(ok("Pokemon Prismatic Evolutions Elite Trainer Box ETB Sealed", 90));
  assert.equal(ok("Pokemon Surging Sparks Booster Pack", 150), null, "a pack is not a feed product");
  assert.equal(ok("Pokemon Surging Sparks Booster Box Japanese"), null);
  assert.ok(ok("Pokemon Surging Sparks Booster Box"), "a plain title that says Pokemon");
  assert.equal(ok("Pokemon Surging Sparks Booster Box", 40), null, "under the booster box floor");
  assert.equal(ok("Magic the Gathering Booster Box Sealed"), null);
  assert.equal(ok("Surging Sparks Elite Trainer Box", 90), null, "strict: the title must say Pokemon");
  // several units in one listing never reach the sealed feed (a 2-8 unit price under one product's name)
  for (const title of [
    "Pokemon Surging Sparks Booster Box x2 Sealed",
    "Pokemon Surging Sparks Elite Trainer Box (2) Sealed",
    "Pokemon Two Surging Sparks Elite Trainer Boxes Sealed",
    "Pokemon Surging Sparks Elite Trainer Box 2-Pack",
    "Pokemon Prismatic Evolutions Costco 8-Pack Mini Tin Box",
    "Pokemon 3 Surging Sparks Booster Boxes",
    "Pokemon Surging Sparks Elite Trainer Box Qty 2",
  ])
    assert.equal(ok(title, 200), null, title);
  assert.ok(ok("Pokemon Scarlet & Violet 151 Elite Trainer Box ETB Sealed", 90), "151 is a set, not a quantity");
});

test("normaliseType: exactly the type's products", () => {
  const t = (title: string, type: "etb" | "booster-box" | "booster-box-case", p = 200) => normaliseType(summary("1", title, p), "EBAY_US", NOW, type);
  assert.ok(t("Pokemon Surging Sparks Elite Trainer Box Sealed", "etb", 60));
  assert.equal(t("Pokemon Surging Sparks Booster Box Sealed", "etb"), null);
  assert.equal(t("Pokemon Surging Sparks Elite Trainer Box Case 10 Count Sealed", "etb", 700), null, "a case is not an ETB");
  assert.ok(t("Pokemon Surging Sparks Booster Box Case 6 Boxes Sealed", "booster-box-case", 900));
  assert.equal(t("Pokemon Surging Sparks Booster Box Case 6 Boxes Sealed", "booster-box"), null);
  // several units in one listing never reach a type feed either
  assert.equal(t("Pokemon Surging Sparks Elite Trainer Box x2 Sealed", "etb", 120), null);
  assert.equal(t("Pokemon 2 Surging Sparks Elite Trainer Boxes Sealed", "etb", 120), null);
  assert.equal(t("Pokemon Surging Sparks Booster Box Set of Two", "booster-box", 400), null);
  assert.ok(t("Pokemon Scarlet & Violet 151 Elite Trainer Box Sealed", "etb", 80));
});

// ─── one product: relevance ─────────────────────────────────────────────────────

function target(name: string): ItemTarget {
  const id = identify(name);
  assert.ok(isIdentity(id), name);
  return { groupKey: id.groupKey, type: id.type, setCode: id.set?.code ?? null };
}
const ETB = target("Surging Sparks Elite Trainer Box");
const BOX = target("Surging Sparks Booster Box");
const COLLECTION = target("Charizard ex Premium Collection");
const TIN = target("Paldea Evolved Pikachu Mini Tin");
const BUNDLE = target("Surging Sparks Booster Bundle");
const BLISTER = target("Paldea Evolved 3-Pack Blister");
const S151_ETB = target("Scarlet & Violet 151 Elite Trainer Box");
const S151_UPC = target("Scarlet & Violet 151 Ultra-Premium Collection");
const LUCARIO = target("Lucario Collection Box 2025");

// [title, target, accepted]
const RELEVANCE: [string, ItemTarget, boolean][] = [
  // the right product, noisy SEO titles, in every spelling sellers use
  ["Pokemon TCG Scarlet & Violet Surging Sparks Elite Trainer Box ETB Sealed NEW", ETB, true],
  ["Surging Sparks Elite Trainer Box - Pokemon TCG - Factory Sealed - Fast Ship", ETB, true],
  ["Pokémon SV8 Surging Sparks ETB Elite Trainer Box 9 Packs Brand New", ETB, true],
  ["Scarlet & Violet Surging Sparks Elite Trainer Box USA Seller Free Shipping", ETB, true],
  ["NEW Pokemon TCG: Surging Sparks Elite Trainer Box (Pikachu) Sealed!", ETB, true],
  ["Pokemon Surging Sparks ETB - Sealed - Ships Today", ETB, true],
  ["Pokemon TCG Scarlet & Violet Surging Sparks Booster Box 36 Packs Sealed", BOX, true],
  ["Surging Sparks Booster Box Display - Factory Sealed English", BOX, true],
  ["Pokemon Surging Sparks Booster Box SV8 Brand New Sealed Fast Shipping", BOX, true],
  ["Pokemon TCG Charizard ex Premium Collection Box Sealed NEW Fast Ship", COLLECTION, true],
  ["Charizard ex Premium Collection - Pokemon TCG - Brand New Factory Sealed", COLLECTION, true],
  ["Pokemon Paldea Evolved Pikachu Mini Tin Sealed NEW", TIN, true],
  // other products, singles, cases, lots, empty or opened, other languages, damaged
  ["Surging Sparks Elite Trainer Box Case 10 Count Factory Sealed", ETB, false],
  ["Pokemon Surging Sparks Booster Box 36 Packs", ETB, false],
  ["Pokemon Surging Sparks Pokemon Center Elite Trainer Box PC ETB", ETB, false],
  ["Pokemon Surging Sparks Elite Trainer Box EMPTY BOX ONLY", ETB, false],
  ["Pokemon Surging Sparks Elite Trainer Box Japanese", ETB, false],
  ["Prismatic Evolutions Elite Trainer Box Sealed", ETB, false],
  ["Surging Sparks Elite Trainer Box opened no shrink wrap", ETB, false],
  ["2x Surging Sparks Elite Trainer Box Lot Sealed", ETB, false],
  ["Surging Sparks Pikachu ex 238/191 Special Illustration Rare Pokemon Card", ETB, false],
  ["Surging Sparks Elite Trainer Box Sleeves and Dice Accessory Set", ETB, false],
  ["Surging Sparks Elite Trainer Box Damaged Box Dent on corner", ETB, false],
  ["Pokemon Surging Sparks Booster Bundle 6 Packs", ETB, false],
  ["Costco Surging Sparks Elite Trainer Box", ETB, false],
  ["Pokemon Surging Sparks Elite Trainer Box Korean", ETB, false],
  ["Pokemon Surging Sparks Elite Trainer Box + Booster Bundle Combo", ETB, false],
  ["Surging Sparks Booster Box Case (6 Boxes) Sealed", BOX, false],
  ["Pokemon Surging Sparks Half Booster Box 18 packs", BOX, false],
  ["Pokemon Surging Sparks Booster Pack Single Sealed", BOX, false],
  ["Pokemon Surging Sparks Elite Trainer Box", BOX, false],
  ["Pokemon Surging Sparks Booster Box Japanese", BOX, false],
  ["Pokemon Surging Sparks Booster Box EMPTY", BOX, false],
  ["Pokemon Stellar Crown Booster Box Sealed", BOX, false],
  ["Pokemon Pikachu ex Premium Collection Box Sealed", COLLECTION, false],
  ["Pokemon Charizard ex Special Collection Box Sealed", COLLECTION, false],
  ["Pokemon Charizard ex Premium Collection EMPTY box", COLLECTION, false],
  ["Pokemon Charizard ex Premium Collection Japanese", COLLECTION, false],
  ["Pokemon Charizard ex Premium Collection Case of 6", COLLECTION, false],
  ["Pokemon Charizard ex Tin Sealed", COLLECTION, false],
  ["Pokemon Paldea Evolved Eevee Mini Tin Sealed", TIN, false],
  ["Pokemon Paldea Evolved Pikachu Tin Sealed", TIN, false],
  ["Magic The Gathering Surging Sparks Elite Trainer Box", ETB, false],
  ["Yu-Gi-Oh Booster Box Sealed", BOX, false],
  ["Pokemon Paldea Evolved Pikachu Mini Tin x3 Lot", TIN, false],
  // several units in one listing: the price is not one product's (review F3)
  ["Pokemon Surging Sparks Elite Trainer Box x2 Sealed", ETB, false],
  ["Two Surging Sparks Elite Trainer Boxes", ETB, false],
  ["Pokemon Surging Sparks Elite Trainer Box X2 sealed", ETB, false],
  ["Pokemon Surging Sparks Elite Trainer Box (2)", ETB, false],
  ["Pokemon Surging Sparks Elite Trainer Box Qty 2", ETB, false],
  ["2 Surging Sparks Elite Trainer Boxes", ETB, false],
  ["Surging Sparks 2 ETBs Sealed", ETB, false],
  ["Pokemon Surging Sparks Elite Trainer Box Set of Two", ETB, false],
  ["Pokemon Surging Sparks Elite Trainer Box Double Pack", ETB, false],
  ["Pokemon Surging Sparks Elite Trainer Box 2-Pack", ETB, false],
  ["Pokemon Surging Sparks Elite Trainer Box - 4 Boxes", ETB, false],
  ["Pokemon Surging Sparks Elite Trainer Box Multi-buy", ETB, false],
  ["Pokemon Surging Sparks Bundle 2 ETB", ETB, false],
  ["Pokemon Surging Sparks Booster Box x 2", BOX, false],
  ["Three Surging Sparks Booster Boxes", BOX, false],
  // ...and wording that only LOOKS like a quantity stays accepted
  ["Pokemon Surging Sparks Elite Trainer Box 9 Packs Sealed", ETB, true],
  ["Pokemon Surging Sparks Booster Box 36 Booster Packs in Box", BOX, true],
  ["Pokemon Surging Sparks Elite Trainer Box ETB SV8 Pikachu NEW", ETB, true],
  // legitimate product names that contain numbers: all accepted (the owner's list)
  ["Pokemon Paldea Evolved 3-Pack Blister Sealed NEW", BLISTER, true],
  ["Pokemon TCG 3 Pack Blister Paldea Evolved Factory Sealed", BLISTER, true],
  ["Pokemon Surging Sparks Booster Bundle (6 Packs) Sealed", BUNDLE, true],
  ["Pokemon Surging Sparks Booster Bundle 6 Booster Packs Brand New", BUNDLE, true],
  ["Pokemon Scarlet & Violet 151 Elite Trainer Box ETB Sealed", S151_ETB, true],
  ["Pokemon 151 Elite Trainer Box - Factory Sealed - Fast Ship", S151_ETB, true],
  ["Pokemon Scarlet & Violet 151 Ultra-Premium Collection UPC Sealed", S151_UPC, true],
  ["Pokemon SV3.5 151 Ultra Premium Collection Mew Sealed", S151_UPC, true],
  ["Pokemon Lucario Collection Box 2025 Sealed NEW", LUCARIO, true],
  // ...and the same products sold several at a time are refused
  ["Pokemon Paldea Evolved 3-Pack Blister x2 Sealed", BLISTER, false],
  ["Pokemon Surging Sparks Booster Bundle x2 (12 Packs)", BUNDLE, false],
  ["Pokemon Surging Sparks Booster Bundle Qty 2", BUNDLE, false],
  ["Two Pokemon 151 Elite Trainer Boxes Sealed", S151_ETB, false],
  ["Pokemon 151 2 ETBs Sealed", S151_ETB, false],
  ["Pokemon Scarlet & Violet 151 Ultra-Premium Collection Set of Two", S151_UPC, false],
  ["Pokemon Lucario Collection Box 2025 (2) Sealed", LUCARIO, false],
  ["Pokemon Lucario Collection Box 2025 Lot of 3", LUCARIO, false],
];

test("multiUnit: quantity wording per type; N-pack is fine for a blister, bundle or tin", () => {
  assert.equal(multiUnit("Prismatic Evolutions Costco 8-Pack Mini Tin Box", "tin"), true, "Costco combo");
  assert.equal(multiUnit("Pokemon Prismatic Evolutions Mini Tin 2 Pack", "tin"), false);
  assert.equal(multiUnit("Pokemon 3-Pack Blister Sealed", "blister"), false);
  assert.equal(multiUnit("Pokemon Elite Trainer Box 3-Pack", "etb"), true);
  assert.equal(multiUnit("Pokemon Scarlet & Violet 151 Elite Trainer Box", "etb"), false, "151 is the set");
  assert.equal(multiUnit("Pokemon SV3.5 151 Ultra-Premium Collection", "upc"), false, "3.5 is the set");
  assert.equal(multiUnit("Pokemon Double Crisis Booster Box", "booster-box"), false, "Double Crisis is a set");
});
test("a multi-unit Costco mini tin is not the single Prismatic Evolutions Mini Tin", () => {
  const PRISM_TIN = target("Prismatic Evolutions Mini Tin");
  assert.equal(relevantToProduct("Prismatic Evolutions Costco 8-Pack Mini Tin Box", PRISM_TIN), false);
  assert.equal(relevantToProduct("Pokemon Prismatic Evolutions Mini Tin Sealed", PRISM_TIN), true);
});

test(`relevantToProduct: ${RELEVANCE.length} realistic eBay titles, the right product accepted and every wrong one refused`, () => {
  assert.ok(RELEVANCE.length >= 70);
  assert.ok(RELEVANCE.filter((r) => r[2]).length >= 20 && RELEVANCE.filter((r) => !r[2]).length >= 40, "both ways");
  for (const [title, tgt, want] of RELEVANCE) assert.equal(relevantToProduct(title, tgt), want, `${want ? "should accept" : "should refuse"}: ${title}`);
});

test("normaliseItemFeed: relevance, the type's floor, currency, shipping and the affiliate URL together", () => {
  const good = summary("77", "Pokemon TCG Surging Sparks Elite Trainer Box Sealed NEW", 79, "EBAY_US", { shippingOptions: [{ shippingCost: { value: "8.00", currency: "USD" } }] });
  const it = normaliseItemFeed(good, "EBAY_US", NOW, ETB)!;
  assert.ok(it);
  assert.deepEqual(it.ship, { value: "8.00", currency: "USD" });
  assert.equal(new URL(it.url).searchParams.get("campid"), EBAY_CAMPAIGN_ID);
  assert.equal(normaliseItemFeed(summary("78", "Pokemon TCG Surging Sparks Elite Trainer Box Sealed NEW", 19), "EBAY_US", NOW, ETB), null, "under the ETB floor (US$25)");
  assert.equal(normaliseItemFeed(summary("79", "Pokemon TCG Surging Sparks Elite Trainer Box Sealed NEW", 80, "EBAY_AU"), "EBAY_US", NOW, ETB), null, "AUD on the US marketplace");
  assert.equal(normaliseItemFeed(summary("80", "Pokemon TCG Surging Sparks Elite Trainer Box Sealed", 80, "EBAY_US", { buyingOptions: ["AUCTION"] }), "EBAY_US", NOW, ETB), null, "auction");
  assert.equal(normaliseItemFeed(summary("81", "Pokemon TCG Surging Sparks Elite Trainer Box Sealed", 80, "EBAY_US", { image: { imageUrl: "https://evil.example/x.jpg" }, thumbnailImages: [] }), "EBAY_US", NOW, ETB), null, "an image that is not eBay's");
});

test("a booster pack's own search refuses multi-pack lots and other non-units, as the sweep does", () => {
  const target: ItemTarget = { groupKey: "cel30|booster-pack", type: "booster-pack", setCode: "cel30" };
  const ok = (t: string) => normaliseItemFeed(summary("1", t, 20), "EBAY_US", NOW, target);
  for (const t of [
    "Pokemon 30th Celebration 5 Booster Packs Sealed",
    "Pokemon TCG 30th Celebration Booster Packs",
    "Pokemon 30th Celebration Booster Pack - 4 Packs",
    "Pokemon 30th Celebration Booster Pack x10",
    "Pokemon 30th Celebration Booster Pack Lot",
  ])
    assert.equal(ok(t), null, t);
  assert.ok(ok("Pokemon 30th Celebration Booster Pack Sealed"));
});
