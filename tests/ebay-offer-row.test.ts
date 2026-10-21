// The eBay row of a product's price table (lib/ebay-offer-row.ts, components/OfferTable.tsx, EbayStrip.tsx OfferRowsWithEbay): the
// owner's call (2026-10-11) that eBay is one of the websites compared, so its cheapest listing of the product is a row of the store
// table, ranked by price, tinted, labelled "Ad", with eBay's blue button; and (a later call the same day) when it is cheaper than every
// store you can buy from it is the best price: its badge, and the product page's best-price card (BestPriceCard.tsx). Never counted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EBAY_CAMPAIGN_ID, PLACEMENTS, REL_SPONSORED } from "../src/lib/affiliate";
import type { OfferView } from "../src/lib/data";
import { displayPacksFromCards, ebayRowIndex, ebayRowNote, listingCents, pickListing, rowPacks, statedPacks, wrongPackCount } from "../src/lib/ebay-offer-row";
import { OfferTable } from "../src/components/OfferTable";
import { BestPriceCard, type BestPriceCardProps } from "../src/components/BestPriceCard";

(globalThis as unknown as { React: typeof React }).React = React;

function render(el: React.ReactElement): string {
  const err = console.error;
  console.error = () => {};
  try {
    return renderToStaticMarkup(el);
  } finally {
    console.error = err;
  }
}

const item = (value: string, currency = "USD", id = value) => ({ id, price: { value, currency } });

test("the listing shown: the lowest-priced of the product's own feed, never one under the store-price floor", () => {
  assert.equal(pickListing([item("59.99"), item("54.50"), item("61")], null)?.id, "54.50");
  // 40% of a US$60 cheapest store price is US$24: a US$9.99 listing is a part or a single card
  assert.equal(pickListing([item("9.99"), item("57.00"), item("58")], { value: 24, currency: "USD" })?.id, "57.00");
  // the floor is in the stores' currency: a feed in another currency is not floored (NZ, SG are never given one)
  assert.equal(pickListing([item("9.99", "AUD")], { value: 24, currency: "USD" })?.id, "9.99");
  assert.equal(pickListing([item("0"), item("abc"), item("-3")], null), null, "no price, no row");
  assert.equal(pickListing([], null), null);
  assert.equal(pickListing([item("50", "USD", "a"), item("50", "USD", "b")], null)?.id, "a", "a tie keeps the feed's order");
  assert.equal(listingCents("54.5"), 5450);
  assert.equal(listingCents("0.005"), 1);
  assert.equal(listingCents("x"), null);
});

test("a listing stating another pack count than the product's is not the product (the cheapest would otherwise rank above every store)", () => {
  // eBay UK, 2026-10-11: the lowest-priced "Surging Sparks Booster Box" listing was an 18-pack display at about half a 36-pack box's price
  assert.deepEqual(statedPacks("Pokémon TCG Scarlet & Violet Surging Sparks Booster Box 18 Packs English 2024"), [18]);
  assert.equal(wrongPackCount("Pokémon TCG Scarlet & Violet Surging Sparks Booster Box 18 Packs English 2024", 36), true);
  assert.equal(wrongPackCount("Pokemon Surging Sparks Booster Box 36 Packs Sealed", 36), false);
  assert.equal(wrongPackCount("Pokemon Surging Sparks 18er Booster Display", 36), true);
  assert.equal(wrongPackCount("Surging Sparks Booster Box 36-Pack (2 x 18)", 36), false, "any stated count that is the product's will do");
  assert.equal(wrongPackCount("Pokemon Prismatic Evolutions Elite Trainer Box 9 Booster Packs", 9), false);
  assert.equal(wrongPackCount("Pokemon Destined Rivals Booster Bundle (6 Packs)", 6), false);
  assert.equal(wrongPackCount("Pokemon Destined Rivals Booster Bundle 2 x Booster Packs", 6), true);
  assert.equal(wrongPackCount("Pokemon Surging Sparks Booster Box Sealed", 36), false, "no count stated: no opinion");
  assert.equal(wrongPackCount("Some Collection 4 Booster Packs", null), false, "no count known (collections, tins): no opinion");
  // eBay UK, 2026-10-11, Pitch Black: 18-pack displays that say so another way
  assert.deepEqual(statedPacks("Pokémon TCG Mega Evolution Pitch Black Sealed Booster Box pack of 18 cards"), [18]);
  assert.deepEqual(displayPacksFromCards("Pokémon TCG Mega Evolution Pitch Black Booster Box 180 Cards English 2026"), [18]);
  assert.equal(wrongPackCount("Pokémon TCG Mega Evolution Pitch Black Booster Box 180 Cards English 2026", 36), true);
  assert.equal(wrongPackCount("Pokemon Surging Sparks Booster Box 36 Packs 360 Cards", 36), false);
  // a card count is read only for a box-sized product, and only at a display's size
  assert.equal(wrongPackCount("Pokémon TCG Evolutions Elite Trainer Box 1 Box English 2016 180 Cards", 8), false, "an ETB's card count says nothing");
  assert.equal(wrongPackCount("Pokémon TCG Evolving Skies Sealed Booster Box 200 Cards English 2021", 36), false, "200 cards is no display size");
  assert.deepEqual(statedPacks("Elite Trainer Box 9 Booster Packs 45 Energy Cards 65 Card Sleeves"), [9], "card counts and sleeves are not packs");
  assert.deepEqual(statedPacks("Booster Box 18 Boosters 108 Cards"), [18]);
  assert.deepEqual(displayPacksFromCards("Booster Box 18 Boosters 108 Cards"), []);
  assert.deepEqual(statedPacks("Pokemon 2024 Booster Box Sealed"), [], "a year is not a count");
  // a product of several units: its listings state one unit's packs, so the row does not check them
  assert.equal(rowPacks("booster-box-case", 216), null);
  assert.equal(rowPacks("etb-case", 90), null);
  assert.equal(rowPacks("booster-bundle-case", null), null);
  assert.equal(rowPacks("build-battle-stadium", 11), null);
  assert.equal(rowPacks("booster-box", 36), 36);
  assert.equal(rowPacks(undefined, 36), null);
  // the set named 151 is not a pack count
  assert.deepEqual(statedPacks("Pokemon 151 Booster Bundle Sealed"), []);
  assert.deepEqual(statedPacks("Pokemon Scarlet Violet 151 Booster Packs x1"), []);
  assert.equal(wrongPackCount("Pokemon 151 Booster Pack Sealed English", 1), false);
  const feed = [
    { title: "Surging Sparks Booster Box 18 Packs", price: { value: "152.11", currency: "GBP" } },
    { title: "Surging Sparks Booster Box Factory Sealed", price: { value: "270.00", currency: "GBP" } },
  ];
  assert.equal(pickListing(feed, null, 36)?.price.value, "270.00");
  assert.equal(pickListing(feed, null)?.price.value, "152.11", "without a pack count the check does nothing");
});

test("where the row goes: before the first in-stock store that costs more (a tie stays with the store), else after the in-stock stores", () => {
  const rows = [
    { open: true, cents: 5000 },
    { open: true, cents: 5500 },
    { open: true, cents: 6000 },
    { open: false, cents: 4000 }, // not checked recently
    { open: false, cents: 3000 }, // sold out
  ];
  assert.equal(ebayRowIndex(rows, 4500), 0, "cheaper than every store: the top");
  assert.equal(ebayRowIndex(rows, 5000), 1, "a tie: after the store");
  assert.equal(ebayRowIndex(rows, 5800), 2);
  assert.equal(ebayRowIndex(rows, 9900), 3, "dearer than every in-stock store: after them, before the sold-out rows");
  assert.equal(ebayRowIndex(rows, 3500), 0, "never ranked against a sold-out store's price");
  assert.equal(ebayRowIndex(rows, null), 3, "no listing (or another currency): after the in-stock stores");
  assert.equal(ebayRowIndex([{ open: false, cents: 100 }], 99999), 0, "nothing in stock: the eBay listing is the first row");
  assert.equal(ebayRowIndex([], 100), 0);
});

const NOW = Date.now();
const offer = (store: string, priceCents: number, inStock = true, extra: Partial<OfferView> = {}): OfferView => ({
  store,
  storeName: store.toUpperCase(),
  storeHost: `${store}.example`,
  title: `${store} title`,
  url: `https://${store}.example/p`,
  priceCents,
  inStock,
  lastSeen: new Date(NOW - 3_600_000).toISOString(),
  marketplace: false,
  ...extra,
});

test("the server table: store rows as before, the eBay row as a search after the in-stock stores (labelled Ad, sponsored, eBay's blue), the note under it", () => {
  const offers = [offer("alpha", 5000), offer("beta", 6000), offer("gamma", 4000, false)];
  const html = render(React.createElement(OfferTable, { offers, region: "us", preorder: false, ebay: { slug: "x-etb", query: "Surging Sparks Elite Trainer Box", floor: null, packs: null } }));
  const rows = [...html.matchAll(/<li data-offer-row=""([^>]*)>/g)].map((m) => m[1]);
  assert.equal(rows.length, 4, "three stores and eBay");
  assert.match(rows[2], /data-ad="listings-offer-row"/, "after the two in-stock stores, before the sold-out one");
  assert.match(rows[2], /data-state="search"/);
  assert.match(rows[2], /bg-ad/, "the sponsored tint");
  const ebay = html.slice(html.indexOf('data-ad="listings-offer-row"'));
  const a = /<a ([^>]*)>([\s\S]*?)<\/a>/.exec(ebay)!;
  const href = /href="([^"]*)"/.exec(a[1])![1].replace(/&amp;/g, "&");
  const u = new URL(href);
  assert.equal(u.hostname, "www.ebay.com");
  assert.equal(u.searchParams.get("campid"), EBAY_CAMPAIGN_ID);
  assert.equal(u.searchParams.get("customid"), "dex-us-listings-offer-row");
  assert.equal(u.searchParams.get("_nkw"), "Pokemon Surging Sparks Elite Trainer Box sealed");
  assert.equal(/rel="([^"]*)"/.exec(a[1])![1], REL_SPONSORED);
  assert.match(a[1], /bg-\[#3665f3\]/, "eBay's blue button, unlike the stores'");
  assert.match(ebay, /class="ad-pill">Ad</);
  assert.match(ebay, /aria-label="eBay"/);
  assert.match(html, /Search Surging Sparks Elite Trainer Box on ebay\.com/);
  // the best store keeps its badge; it reads "Best store price" only when the eBay row is cheaper (a data attribute on the list), and the
  // eBay row then carries "Best price" (client state, checked in a browser: the OfferRowsWithEbay `cheaper` rule is pinned below)
  assert.match(html, /Best <span class="hidden group-data-\[ebay=cheaper\]\/offers:inline">store <\/span>price/);
  assert.match(html, /class="group\/offers divide-y divide-line"/);
  assert.doesNotMatch(html, /data-ebay="cheaper"/, "no listing, nothing to be cheaper");
  assert.ok(html.replace(/&#x27;/g, "'").includes(ebayRowNote("us").trim()), "the note under the table");
  assert.ok((PLACEMENTS as readonly string[]).includes("listings-offer-row"));
  assert.ok(!(PLACEMENTS as readonly string[]).includes("listings-price-rows"), "the old block above the table is gone");
});

test("NZ and SG: the note says whose listings these are; no eBay row without `ebay`", () => {
  const offers = [offer("alpha", 5000)];
  const nz = render(React.createElement(OfferTable, { offers, region: "nz", preorder: false, ebay: { slug: "x", query: "X", floor: null, packs: null } }));
  assert.match(nz, /The eBay row uses eBay Australia/);
  assert.doesNotMatch(nz, /It is an eBay Australia listing/, "true whether the row is a listing or a search");
  const sg = render(React.createElement(OfferTable, { offers, region: "sg", preorder: false, ebay: { slug: "x", query: "X", floor: null, packs: null } }));
  assert.match(sg, /The eBay row uses eBay US \(the eBay Singapore buyers use\)/);
  assert.match(nz, /may have changed: eBay(&#x27;|')s page is final/, "the staleness caveat every eBay unit carries");
  assert.match(nz, /www\.ebay\.com\.au/);
  const plain = render(React.createElement(OfferTable, { offers, region: "us", preorder: false }));
  assert.doesNotMatch(plain, /listings-offer-row|ebay\.com|aria-label="eBay"/);
  assert.equal([...plain.matchAll(/<li data-offer-row/g)].length, 1);
});

test("the product page passes the eBay row to its table, and nothing else draws eBay rows; the row reads only the product's own feed", () => {
  const product = readFileSync(new URL("../src/app/[region]/p/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(product, /<OfferTable [^>]*ebay=\{\{ slug: p\.slug, query: ebayQ, floor: ebayFloor, packs: rowPacks\(type\?\.key, packs\) \}\}/);
  assert.match(product, /const cheapestCents = best\?\.priceCents \?\?/, "the floor is the cheapest in-stock store's price");
  assert.doesNotMatch(product, /EbayPriceRows/);
  const strip = readFileSync(new URL("../src/components/EbayStrip.tsx", import.meta.url), "utf8");
  const src = strip.slice(strip.indexOf("export function useEbayPick"), strip.indexOf("export function OfferRowsWithEbay"));
  assert.match(strip.slice(strip.indexOf("export function OfferRowsWithEbay")), /useEbayPick\(/, "the row reads the shared pick");
  assert.match(src, /state\.a\.feed === "item"/, "only the product's own listings, never its type's");
  assert.match(src, /eager: true/, "fetched when the page runs, so the row is in place before the visitor reaches the table");
  assert.doesNotMatch(strip, /export function EbayPriceRows/);
});

const cardProps = (ebay: BestPriceCardProps["ebay"]): BestPriceCardProps => ({
  region: "us",
  market: "US",
  adjective: "US",
  preorder: false,
  store: { cents: 12990, where: "at TCGORA", marketplace: false, href: "https://tcgora.example/p", rel: "nofollow noopener", sponsored: false, retailer: "TCGORA (US)", button: "Go to TCGORA" },
  packs: 9,
  median: 15000,
  medianStores: 8,
  msrp: 4999,
  openStores: 8,
  storeCount: 21,
  tcgOpen: true,
  openCount: 9,
  highestOpenCents: 20999,
  ebay,
});

test("the best-price card's server HTML is the store's: eBay's top only an invisible, link-free placeholder holding its space", () => {
  const html = render(React.createElement(BestPriceCard, cardProps({ slug: "30th-celebration-elite-trainer-box", floor: null, packs: 9 })));
  // the two stacked cells, in order: the store's (shown), then eBay's (invisible)
  const cells = html.split('class="col-start-1 row-start-1').slice(1);
  assert.equal(cells.length, 2);
  const [storeCell, ebayCell] = cells;
  assert.match(storeCell, /^ ?"/, "the store's cell carries no `invisible`");
  assert.doesNotMatch(storeCell.slice(0, storeCell.indexOf(">")), /aria-hidden/);
  assert.match(storeCell, /Best price in stock/);
  assert.match(storeCell, /\$129\.90/);
  assert.match(storeCell, /≈ \$14\.43 per pack/);
  assert.match(storeCell, /href="https:\/\/tcgora\.example\/p"/, "the store's button, in the shown cell");
  assert.match(storeCell, /13% below the median of 8 stores/);
  assert.match(ebayCell, /^ invisible" aria-hidden="true"/, "eBay's cell is invisible and hidden from screen readers");
  assert.match(ebayCell, /aria-label="eBay"/);
  assert.match(ebayCell, /class="ad-pill">Ad</);
  assert.doesNotMatch(ebayCell, /href=/, "no link at all before the listing arrives");
  assert.match(ebayCell, /flex-nowrap/, "eBay's badge line is one line, whatever the listing");
  // below the rule: the stores' facts, server-rendered, the same whichever top is shown
  const below = html.slice(html.indexOf("border-t border-line"));
  assert.match(below, /you save \$80\.09 by buying at the cheapest/);
  assert.match(below, /best store price 160% above MSRP/);
  // NZ/SG or a pre-order (no `ebay`): the store's card alone
  const plain = render(React.createElement(BestPriceCard, cardProps(null)));
  assert.doesNotMatch(plain, /aria-label="eBay"|invisible/);
  assert.match(plain, /\$129\.90/);
});

test("the product page gives the best-price card the same eBay pick as the table (same floor and pack count), and none where prices are not comparable", () => {
  const product = readFileSync(new URL("../src/app/[region]/p/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(product, /<BestPriceCard[\s\S]*ebay=\{ebayBest \? \{ slug: p\.slug, floor: ebayFloor, packs: rowPacks\(type\?\.key, packs\) \} : null\}/);
  assert.match(product, /const ebayComparable = marketplaceOf\(r\.region\)\.currency === r\.currency;/);
  assert.match(product, /const ebayBest = ebayComparable && !pre;/, "never on a pre-order");
  assert.match(product, /tcgplayerIsBest=\{best\.marketplace && !ebayBest/, "TCGplayer keeps its panel row when the card may turn to eBay");
  const strip = readFileSync(new URL("../src/components/EbayStrip.tsx", import.meta.url), "utf8");
  assert.match(strip, /const bestable = item != null && cents != null && !conditionLabel\(item\.condition\);/, "only a new listing can be the best price");
  assert.match(strip, /const cheaper = allowBest && bestable && cents != null && best != null && cents < best\.cents;/, "the table's badge: the same rule");
  assert.ok((PLACEMENTS as readonly string[]).includes("listings-best-price"));
  const card = readFileSync(new URL("../src/components/BestPriceCard.tsx", import.meta.url), "utf8");
  assert.match(card, /useEbayPick\(/, "the table's pick, not a second rule");
  assert.match(card, /const cheaper = bestable && item != null && cents != null && cents < store\.cents;/, "only a new listing strictly cheaper than the cheapest in-stock store");
  // the note under the table: the best-price clause only where listings are compared
  assert.match(ebayRowNote("us"), /when it is a new listing cheaper than every store, it is the best price/);
  assert.doesNotMatch(ebayRowNote("nz"), /best price/);
  assert.match(ebayRowNote("sg"), /never compared with the stores'/);
});
