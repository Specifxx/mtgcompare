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
import { displayPacksFromCards, ebayRowNote, listingCents, pickListing, rowPacks, statedPacks, wrongPackCount } from "../src/lib/ebay-offer-row";
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
  // a 24-pack display listed beside the 36-pack box sells at about two-thirds of its price
  assert.deepEqual(statedPacks("Magic The Gathering Duskmourn Draft Booster Box 24 Packs English"), [24]);
  assert.equal(wrongPackCount("Magic The Gathering Duskmourn Draft Booster Box 24 Packs English", 36), true);
  assert.equal(wrongPackCount("MTG Duskmourn Draft Booster Box 36 Packs Sealed", 36), false);
  assert.equal(wrongPackCount("MTG Bloomburrow 18er Play Booster Display", 30), true);
  assert.equal(wrongPackCount("Bloomburrow Play Booster Box 30-Pack (2 x 15)", 30), false, "any stated count that is the product's will do");
  assert.equal(wrongPackCount("MTG Aetherdrift Bundle 9 Play Boosters", 9), false);
  assert.equal(wrongPackCount("MTG Tarkir Dragonstorm Collector Booster Box (12 Packs)", 12), false);
  assert.equal(wrongPackCount("MTG Tarkir Dragonstorm Collector Booster Box 2 x Booster Packs", 12), true);
  assert.equal(wrongPackCount("MTG Bloomburrow Play Booster Box Sealed", 30), false, "no count stated: no opinion");
  assert.equal(wrongPackCount("Some Commander Deck 2 Collector Booster Packs", null), false, "no count known (decks, collections): no opinion");
  assert.deepEqual(statedPacks("MTG Final Fantasy Sealed Play Booster Box pack of 30 boosters"), [30]);
  // a card count is never read for Magic (14, 15 or 12 cards a pack)
  assert.deepEqual(displayPacksFromCards("MTG Final Fantasy Play Booster Box 420 Cards English"), []);
  assert.equal(wrongPackCount("MTG Final Fantasy Play Booster Box 420 Cards English", 36), false);
  assert.deepEqual(statedPacks("Bundle 9 Play Boosters 30 Basic Lands 1 Spindown Die"), [9], "lands and dice are not packs");
  assert.deepEqual(statedPacks("MTG 2024 Play Booster Box Sealed"), [], "a year is not a count");
  // a product of several units: its listings state one unit's packs, so the row does not check them
  assert.equal(rowPacks("play-booster-box-case", 180), null);
  assert.equal(rowPacks("collector-booster-box-case", 48), null);
  assert.equal(rowPacks("bundle-case", null), null);
  assert.equal(rowPacks("commander-deck-set", 4), null);
  assert.equal(rowPacks("play-booster-box", 30), 30);
  assert.equal(rowPacks(undefined, 36), null);
  const feed = [
    { title: "Duskmourn Draft Booster Box 24 Packs", price: { value: "152.11", currency: "GBP" } },
    { title: "Duskmourn Draft Booster Box Factory Sealed", price: { value: "270.00", currency: "GBP" } },
  ];
  assert.equal(pickListing(feed, null, 36)?.price.value, "270.00");
  assert.equal(pickListing(feed, null)?.price.value, "152.11", "without a pack count the check does nothing");
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

test("the server table: the eBay row FIRST as a search (labelled Ad, sponsored, eBay's blue, a store row's layout), then the stores cheapest first, the note under it", () => {
  const offers = [offer("alpha", 5000), offer("beta", 6000), offer("gamma", 4000, false)];
  const html = render(React.createElement(OfferTable, { offers, region: "us", preorder: false, ebay: { slug: "x-pbb", query: "Bloomburrow Play Booster Box", floor: null, packs: null } }));
  const rows = [...html.matchAll(/<li data-offer-row=""([^>]*)>/g)].map((m) => m[1]);
  assert.equal(rows.length, 4, "three stores and eBay");
  assert.match(rows[0], /data-ad="listings-offer-row"/, "pinned first (owner, 2026-10-26)");
  assert.match(rows[0], /data-state="search"/);
  assert.doesNotMatch(rows[0], /bg-ad|shadow-/, "no sponsored tint: it blends in with the store rows");
  assert.equal(/class="([^"]*)"/.exec(rows[0])![1].trim(), /class="([^"]*)"/.exec(rows[2])![1].trim(), "the same grid as a store row");
  const ebay = html.slice(html.indexOf('data-ad="listings-offer-row"'));
  const a = /<a ([^>]*)>([\s\S]*?)<\/a>/.exec(ebay)!;
  const href = /href="([^"]*)"/.exec(a[1])![1].replace(/&amp;/g, "&");
  const u = new URL(href);
  assert.equal(u.hostname, "www.ebay.com");
  assert.equal(u.searchParams.get("campid"), EBAY_CAMPAIGN_ID);
  assert.equal(u.searchParams.get("customid"), "mtg-us-listings-offer-row");
  assert.equal(u.searchParams.get("_nkw"), "MTG Bloomburrow Play Booster Box sealed");
  assert.equal(/rel="([^"]*)"/.exec(a[1])![1], REL_SPONSORED);
  assert.match(a[1], /class="btn-ad /, "eBay's blue button, unlike the stores'");
  assert.match(ebay, /class="ad-pill">Ad</);
  assert.match(html, /Search Bloomburrow Play Booster Box on ebay\.com/);
  // no listing yet: the cheapest store is the best price (tint, badge, the one red button)
  assert.match(rows[1], /bg-open-soft\/40/, "alpha, the cheapest open store, second");
  assert.match(html, />Best price</);
  assert.doesNotMatch(html, /Best store price/, "nothing cheaper than the store yet");
  assert.match(html, /data-best="store"/);
  assert.ok(html.replace(/&#x27;/g, "'").includes(ebayRowNote("us").trim()), "the note under the table");
  assert.ok((PLACEMENTS as readonly string[]).includes("listings-offer-row"));
  assert.ok(!(PLACEMENTS as readonly string[]).includes("listings-price-rows"), "the old block above the table is gone");
});

test("pinned TCGplayer: second under eBay, its own ink button; in the US its offer (the best price when cheapest), elsewhere US$ and never compared, else a search", () => {
  const tcgOffer = offer("tcgplayer", 4500, true, { storeName: "TCGplayer", storeHost: "tcgplayer.com", url: "https://www.tcgplayer.com/product/1", marketplace: true });
  const offers = [tcgOffer, offer("alpha", 5000), offer("beta", 6000)];
  const us = render(React.createElement(OfferTable, { offers, region: "us", preorder: false, ebay: { slug: "x", query: "X", floor: null, packs: null }, pinned: { productName: "X", tcgplayer: null } }));
  const rows = [...us.matchAll(/<li data-offer-row=""([^>]*)>/g)].map((m) => m[1]);
  assert.equal(rows.length, 5);
  assert.match(rows[0], /data-ad="listings-offer-row"/);
  assert.match(rows[1], /data-row="tcgplayer"/, "TCGplayer second");
  assert.match(rows[2], /data-row="amazon"/, "Amazon US third (lib/amazon.ts), a search row, never highlighted");
  assert.doesNotMatch(rows[2], /bg-open-soft/);
  assert.match(us, /href="https:\/\/www\.amazon\.com\/s\?k=[^"]*&amp;tag=[A-Za-z0-9-]+&amp;ascsubtag=mtg-us-amazon-table"/);
  assert.match(rows[1], /bg-open-soft\/40/, "cheapest of the whole table: highlighted");
  assert.match(us, /data-best="tcg"/);
  assert.match(us, />Best store price</, "the cheapest store says so");
  assert.equal([...us.matchAll(/class="btn-primary/g)].length, 1, "the cheapest store keeps the one red button");
  assert.equal([...us.matchAll(/class="btn-tcg/g)].length, 1);
  assert.match(us, /View deal <span aria-hidden="true">↗<\/span><span class="sr-only"> on TCGplayer<\/span>/, "a store row's label; only the colour differs");
  // the UK: the US$ offer, labelled, never the best price
  const uk = render(
    React.createElement(OfferTable, {
      offers: [offer("alpha", 5000)],
      region: "uk",
      preorder: false,
      ebay: { slug: "x", query: "X", floor: null, packs: null },
      pinned: { productName: "X", tcgplayer: { title: "X", url: "https://www.tcgplayer.com/product/1", priceCents: 100, inStock: true, lastSeen: new Date(NOW - 3_600_000).toISOString() } },
    }),
  );
  assert.match(uk, /US\$1\.00/);
  assert.match(uk, /US\$, ships from the US/);
  assert.match(uk, /data-best="store"/, "a US$ price is never compared with the stores' £");
  // no match: a TCGplayer search
  const none = render(React.createElement(OfferTable, { offers: [offer("alpha", 5000)], region: "uk", preorder: false, ebay: { slug: "x", query: "X", floor: null, packs: null }, pinned: { productName: "X", tcgplayer: null } }));
  assert.match(none, />Search <span aria-hidden="true">↗<\/span><span class="sr-only"> on TCGplayer/);
  assert.match(none, /tcgplayer\.com%2Fsearch%2Fmagic%2Fproduct/);
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
  assert.match(product, /<OfferTable\s[^>]*ebay=\{\{ slug: p\.slug, query: ebayQ, floor: ebayFloor, packs: rowPacks\(type\?\.key, packs\) \}\}/);
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
  const html = render(React.createElement(BestPriceCard, cardProps({ slug: "reality-fracture-bundle", floor: null, packs: 9 })));
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
  assert.match(product, /<BestPriceCard[\s\S]*ebay=\{ebayBest \? \{ slug: p\.slug, floor: ebayFloor, packs: rowPacks\(type\?\.key, packs\), query: ebayQ \} : null\}/);
  assert.match(product, /const ebayComparable = marketplaceOf\(r\.region\)\.currency === r\.currency;/);
  assert.match(product, /const ebayBest = ebayComparable && !pre;/, "never on a pre-order");
  assert.match(product, /pinned=\{\{ productName: p\.name, tcgplayer \}\}/, "TCGplayer pinned under eBay in the table");
  const strip = readFileSync(new URL("../src/components/EbayStrip.tsx", import.meta.url), "utf8");
  assert.match(strip, /const bestable = item != null && cents != null && !conditionLabel\(item\.condition\);/, "only a new listing can be the best price");
  assert.match(strip, /if \(byPrice && allowGiven && bestable && cents != null && cents < low\) top = "ebay";/, "the table's badge: the same rule");
  assert.ok((PLACEMENTS as readonly string[]).includes("listings-best-price"));
  const card = readFileSync(new URL("../src/components/BestPriceCard.tsx", import.meta.url), "utf8");
  assert.match(card, /useEbayPick\(/, "the table's pick, not a second rule");
  assert.match(card, /const cheaper = bestable && item != null && cents != null && cents < store\.cents;/, "only a new listing strictly cheaper than the cheapest in-stock store");
  // the note under the table: the best-price clause only where listings are compared
  assert.match(ebayRowNote("us"), /when it is a new listing cheaper than every store, it is the best price/);
  assert.doesNotMatch(ebayRowNote("nz"), /best price/);
  assert.match(ebayRowNote("sg"), /never compared with the stores'/);
});

test("the listing shown is the cheapest delivered: item plus the postage eBay states (visitor feedback 2026-10-31)", () => {
  const cheapItemDearPost = { id: "a", price: { value: "100.00", currency: "AUD" }, ship: { value: "30.00", currency: "AUD" } };
  const dearerFreePost = { id: "b", price: { value: "110.00", currency: "AUD" }, ship: { free: true } };
  assert.equal(pickListing([cheapItemDearPost, dearerFreePost], null)?.id, "b");
  assert.equal(pickListing([cheapItemDearPost, { ...dearerFreePost, price: { value: "131.00", currency: "AUD" } }], null)?.id, "a");
});
