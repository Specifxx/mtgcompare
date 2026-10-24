// The product page of the growth release (src/app/[region]/p/[slug]/page.tsx): phone-first buying, the collapsed price table, the
// sold-out page's eBay box and in-stock alternatives, the phone buy bar, the ad plans, and the page's generated words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EBAY_CAMPAIGN_ID, PLACEMENTS, REL_SPONSORED } from "../src/lib/affiliate";
import { BANNED_COPY, findBannedCopy } from "../src/lib/copy-rules";
import type { OfferView, ProductCardData } from "../src/lib/data";
import { moreClosedLabel, moreOpenLabel, splitRows, tableShape, VISIBLE_ROWS } from "../src/lib/ebay-offer-row";
import { productAdPlan, soldOutAdPlan } from "../src/lib/ebay-ads";
import { cheapestPerPackByType } from "../src/lib/per-pack";
import { fitTitle, openWhere, productDescription, productTitle, quickFacts, releaseChip, renderedTitle, shortDate, valueCheck } from "../src/lib/product-copy";
import { altToCard, inStockAlternatives, setCodesNewestFirst, type AltRow } from "../src/lib/product-data";
import { MarketplacePanel, SoldOutCallout } from "../src/components/Marketplaces";
import { OfferTable } from "../src/components/OfferTable";
import { ShareButton } from "../src/components/ShareButton";
import { StickyBuyBar } from "../src/components/StickyBuyBar";

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

/** Every <a> of the markup: its href (entities decoded), rel, class and text. */
function links(html: string) {
  return [...html.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: (/href="([^"]*)"/.exec(m[1])?.[1] ?? "").replace(/&amp;/g, "&"),
    rel: /rel="([^"]*)"/.exec(m[1])?.[1] ?? "",
    cls: /class="([^"]*)"/.exec(m[1])?.[1] ?? "",
    text: m[2].replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").trim(),
  }));
}

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

// ─── The price table ──────────────────────────────────────────────────────────

test("the table: every row of the ranked list (eBay's at its rank) in the server HTML, no collapsed group, one red button, every store link", () => {
  // 14 in stock, 3 not checked recently, 6 sold out: 23 stores + the eBay row
  const offers = [
    ...Array.from({ length: 14 }, (_, i) => offer(`open${i}`, 5000 + i * 100)),
    ...Array.from({ length: 3 }, (_, i) => offer(`stale${i}`, 4000 + i, true, { lastSeen: new Date(NOW - 5 * 86_400_000).toISOString() })),
    ...Array.from({ length: 6 }, (_, i) => offer(`sold${i}`, 3000 + i, false)),
  ];
  const html = render(React.createElement(OfferTable, { offers, region: "us", preorder: false, ebay: { slug: "x-bundle", query: "X Bundle", floor: null, packs: 9 } }));
  const details = html.split("<details").slice(1);
  assert.equal(details.length, 1, "no row group: only 'How these prices work'");
  assert.match(details[0], /How these prices work/);
  assert.doesNotMatch(html, /Show \d+ more|sold out or not checked<\/summary>/);
  const rows = [...html.matchAll(/<li data-offer-row=""[^>]*>/g)].map((m) => m[0]);
  assert.equal(rows.length, 24, "every row is visible in the HTML");
  assert.ok(html.slice(0, html.indexOf("<details")).match(/<li data-offer-row=""/g)!.length === 24, "all of them before 'How these prices work'");
  assert.equal(rows.findIndex((r) => r.includes('data-ad="listings-offer-row"')), 14, "the eBay row ranks straight after the 14 open stores");
  // one red button, on the cheapest open row; the other open rows btn-soft, the closed ones btn-ghost
  assert.equal([...html.matchAll(/class="btn-primary/g)].length, 1);
  const a = links(html);
  assert.ok(a.find((l) => l.href === "https://open0.example/p")!.cls.startsWith("btn-primary"));
  assert.ok(a.find((l) => l.href === "https://open5.example/p")!.cls.startsWith("btn-soft"));
  assert.ok(a.find((l) => l.href === "https://sold0.example/p")!.cls.startsWith("btn-ghost"));
  for (const o of offers) assert.ok(a.some((l) => l.href === o.url), `${o.store}'s link is in the server HTML`);
  for (const l of a.filter((l) => l.href.includes("ebay."))) assert.equal(l.rel, REL_SPONSORED);
  // the footer keeps the short version; the long one is in the details, whole
  assert.match(html, /In stock first, then cheapest\./);
  assert.match(html, /No store pays to rank\./);
  assert.match(html, /Tinted eBay row = Ad\./);
  assert.match(html, /<details class="group\/how mt-3 text-xs text-muted">/);
});

test("the split comes after ranking (mechanics, with an explicit small `visible`): the eBay row keeps its place; by default nothing is hidden", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ key: `s${i}`, open: i < 10 }));
  const ranked = [...rows.slice(0, 10), { key: "ebay", open: true }, ...rows.slice(10)];
  const all = splitRows(ranked);
  assert.equal(all.shown.length, 13, "default: every row shown");
  assert.deepEqual([all.moreOpen, all.moreClosed], [[], []]);
  assert.ok(VISIBLE_ROWS >= 1000);
  const server = splitRows(ranked, 8);
  assert.deepEqual(server.shown.map((r) => r.key), ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"]);
  assert.deepEqual(server.moreOpen.map((r) => r.key), ["s8", "s9", "ebay"]);
  const client = splitRows([...rows.slice(0, 3), { key: "ebay", open: true }, ...rows.slice(3)], 8);
  assert.equal(client.shown.length, server.shown.length, "the same number of visible rows: the visible height does not change");
  assert.deepEqual(client.moreOpen.map((r) => r.key), ["s7", "s8", "s9"]);
  assert.deepEqual(client.moreClosed, server.moreClosed);
  // the shape the ad plan counts: every row visible, no summaries
  assert.deepEqual(tableShape(12, 10), { visible: 13, moreOpen: 0, moreClosed: 0, summaries: 0 });
  assert.deepEqual(tableShape(3, 1), { visible: 4, moreOpen: 0, moreClosed: 0, summaries: 0 });
  assert.deepEqual(tableShape(30, 8), { visible: 31, moreOpen: 0, moreClosed: 0, summaries: 0 });
  assert.equal(moreOpenLabel([{ key: "a" }, { key: "ebay" }]), "Show 1 more in-stock store");
  assert.equal(moreOpenLabel([{ key: "a" }, { key: "tcgplayer" }]), "Show 2 more in-stock offers", "a marketplace is not a store");
  assert.equal(moreOpenLabel([{ key: "ebay" }]), "Show eBay too");
  assert.equal(moreOpenLabel([{ key: "a" }, { key: "b" }], true), "Show 2 more pre-order stores");
  assert.equal(moreClosedLabel(9, false), "9 stores sold out or not checked");
  assert.equal(moreClosedLabel(1, true), "1 more store sold out or not checked");
});

test("no table has row groups: a short one and an all-sold-out one show every row", () => {
  const short = render(React.createElement(OfferTable, { offers: [offer("a", 5000), offer("b", 6000, false)], region: "uk", preorder: false, ebay: { slug: "x", query: "X", floor: null, packs: null } }));
  assert.equal([...short.matchAll(/<details/g)].length, 1, "only 'How these prices work'");
  const sold = Array.from({ length: 11 }, (_, i) => offer(`s${i}`, 3000 + i, false));
  const html = render(React.createElement(OfferTable, { offers: sold, region: "uk", preorder: false, ebay: { slug: "x", query: "X", floor: null, packs: null } }));
  assert.equal([...html.matchAll(/<details/g)].length, 1, "no sold-out group");
  assert.equal([...html.matchAll(/<li data-offer-row=""/g)].length, 12, "11 closed rows and the eBay search, all visible");
  assert.doesNotMatch(html, /more stores? sold out or not checked/);
  for (const o of sold) assert.ok(links(html).some((l) => l.href === o.url));
  assert.doesNotMatch(html, /class="btn-primary/, "nothing open, no red button");
});

// ─── The sold-out callout ─────────────────────────────────────────────────────

test("sold out: the callout's eBay box is the server's search (soldout-ebay, Ad, sponsored, eBay blue), TCGplayer second, no eBay price", () => {
  const tcgplayer = { title: "Aetherdrift Collector Booster Box", url: "https://www.tcgplayer.com/product/222", priceCents: 13653, inStock: true, lastSeen: new Date(NOW - 3_600_000).toISOString() };
  const html = render(
    React.createElement(SoldOutCallout, {
      region: "uk",
      productName: "Aetherdrift Collector Booster Box",
      storesListing: 6,
      notChecked: 0,
      tcgplayer,
      ebayQuery: "Aetherdrift Collector Booster Box",
      pick: { slug: "vivid-voltage-elite-trainer-box", floor: { value: 20, currency: "GBP" }, packs: 8 },
      instead: { href: "/uk/type/collector-booster-boxes", label: "See Collector Booster Boxes in stock in the UK" },
    }),
  );
  assert.match(html, /Sold out at every UK store we track/, "the heading is unchanged");
  assert.match(html, /None of the 6 stores that list it has it in stock\./);
  const box = html.slice(html.indexOf('data-ad="soldout-ebay"'));
  assert.ok(box.length < html.length, "a labelled unit: data-ad=soldout-ebay");
  assert.match(box, /class="ad-pill[^"]*">Ad</);
  assert.match(box, /aria-label="eBay"/);
  const ebay = links(html).filter((l) => new URL(l.href, "https://mtgcompare.app").hostname.endsWith("ebay.co.uk"));
  assert.equal(ebay.length, 1, "ONE eBay link in the server HTML: the search (the listing is browser-only)");
  const u = new URL(ebay[0].href);
  assert.equal(u.searchParams.get("customid"), "mtg-uk-soldout-ebay");
  assert.equal(u.searchParams.get("campid"), EBAY_CAMPAIGN_ID);
  assert.equal(ebay[0].rel, REL_SPONSORED);
  assert.match(ebay[0].cls, /^btn-ad .*w-full/, "a full-width eBay-blue button");
  assert.equal(ebay[0].text, "Find it on ebay.co.uk ↗");
  const tcg = links(html).find((l) => l.href.includes("tcgplayer"))!;
  assert.match(tcg.cls, /^btn-ghost/, "TCGplayer is the secondary button");
  assert.equal(tcg.rel, REL_SPONSORED);
  assert.match(tcg.text, /US\$136\.53 on TCGplayer \(US\)/);
  assert.match(html, /Affiliate links — we may earn a commission, at no cost to you\./);
  assert.ok(html.indexOf("Affiliate links") > html.indexOf("TCGplayer (US)"), "the note under both buttons");
  // no eBay price, no listing in the server HTML (the invisible listing cell is a placeholder with no link)
  assert.doesNotMatch(html, /£\d/);
  assert.doesNotMatch(html, /ebayimg\.com|\/itm\//);
  assert.match(html, /href="\/uk\/type\/collector-booster-boxes"[^>]*>See Collector Booster Boxes in stock in the UK/);
  for (const p of ["soldout-ebay", "listings-soldout-best", "listings-marketplace", "product-sticky"]) assert.ok((PLACEMENTS as readonly string[]).includes(p), p);
  // pre-order, NZ, SG: no pick, the search alone
  const plain = render(React.createElement(SoldOutCallout, { region: "nz", productName: "X", storesListing: 2, notChecked: 1, tcgplayer: null, ebayQuery: "X" }));
  assert.match(plain, /Find it on ebay\.com\.au/);
  assert.doesNotMatch(plain, /invisible/, "no stacked listing cell without a pick");
});

test("the panel's eBay row in the server HTML: the search, eBay's blue button, placement product-marketplace; the listing cell holds no link", () => {
  const html = render(React.createElement(MarketplacePanel, { region: "us", productName: "Bloomburrow Bundle", preorder: false, tcgplayer: null, pick: { slug: "bloomburrow-bundle", floor: null, packs: 9 }, storeCents: 5499 }));
  const ebay = links(html).filter((l) => l.href.includes("ebay.com"));
  assert.equal(ebay.length, 1);
  assert.equal(new URL(ebay[0].href).searchParams.get("customid"), "mtg-us-product-marketplace");
  assert.match(html, /class="btn-ad[^"]*">Search eBay/);
  assert.match(html, /col-start-1 row-start-1 invisible" aria-hidden="true"/, "the listing's cell is reserved, invisible");
  assert.doesNotMatch(html, /\/itm\/|ebayimg/);
});

// ─── The phone buy bar ────────────────────────────────────────────────────────

test("the buy bar's server markup: hidden off-screen (translate-y-full, invisible, aria-hidden), phones only, no listing link, no unit", () => {
  const store = { cents: 5499, storeName: "TCG Card Depot", href: "https://depot.example/p", rel: "nofollow noopener", retailer: "TCG Card Depot (US)", marketplace: false };
  const html = render(React.createElement(StickyBuyBar, { region: "us", anchor: "best", store, pick: { slug: "bloomburrow-bundle", floor: null, packs: 9 } }));
  assert.match(html, /role="region" aria-label="Quick buy"/);
  assert.match(html, /translate-y-full/);
  assert.match(html, /\binvisible\b/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /lg:hidden/);
  assert.match(html, /fixed inset-x-0 bottom-0 z-30/);
  assert.doesNotMatch(html, /transition/, "nothing animates on the first paint");
  const src = readFileSync(new URL("../src/components/StickyBuyBar.tsx", import.meta.url), "utf8");
  assert.match(src, /"translate-y-0 transition-transform duration-200 ease-out motion-reduce:transition-none"/, "it slides in on transform only, and not at all with reduced motion");
  assert.match(src, /sessionStorage\.setItem\(DISMISS_KEY, "1"\)/);
  assert.match(src, /querySelectorAll\("#prices, footer, \[data-ad\]"\)/, "hidden while the table, any unit or the footer is in view");
  assert.match(src, /root\.style\.scrollPaddingBottom = /);
  assert.doesNotMatch(html, /data-ad=/, "not a unit while hidden");
  assert.doesNotMatch(html, /\/itm\/|ebayimg/);
  assert.equal(links(html)[0].href, store.href, "the card's own button");
  assert.match(html, /\$54\.99/);
  assert.match(html, /aria-label="Hide the quick buy bar"[^>]*class="[^"]*h-11 w-11/);
  // TCGplayer: labelled as the affiliate link it is
  const tcg = render(React.createElement(StickyBuyBar, { region: "us", anchor: "best", store: { ...store, storeName: "TCGplayer", marketplace: true, rel: REL_SPONSORED } }));
  assert.match(tcg, /affiliate link/);
  // sold out: the callout's eBay search, labelled Ad, placement product-sticky
  const sold = render(React.createElement(StickyBuyBar, { region: "uk", anchor: "soldout", pick: null, search: { href: "https://www.ebay.co.uk/sch/i.html?_nkw=x&customid=mtg-uk-product-sticky", line: "Sold out at UK stores" } }));
  assert.match(sold, /class="ad-pill[^"]*">Ad</);
  assert.match(sold, /Find on eBay/);
  assert.equal(links(sold)[0].rel, REL_SPONSORED);
});

test("the share button: a 44 px button, the canonical URL, one analytics property", () => {
  const html = render(React.createElement(ShareButton, { title: "MTG Bloomburrow Bundle", path: "/us/p/bloomburrow-bundle", kind: "product" }));
  assert.match(html, /<button type="button" class="[^"]*h-11 w-11/);
  assert.match(html, /aria-label="Share this product"/);
  assert.match(html, /aria-live="polite"/);
  const src = readFileSync(new URL("../src/components/ShareButton.tsx", import.meta.url), "utf8");
  assert.match(src, /track\("share", \{ kind \}\)/, "one property");
  assert.match(src, /\$\{SITE_URL\}\$\{path\}/, "the canonical URL, never location.href");
});

// ─── Ad plans ─────────────────────────────────────────────────────────────────

test("sold-out ad plan: the strip after the table, the alternatives and the facts when that is a screen below the callout's box; else at the bottom; else none", () => {
  // a long sold-out table, alternatives, a few regions, a set: the strip after the facts, and the pre-footer keeps its place
  assert.deepEqual(soldOutAdPlan({ visibleRows: 8, summaries: 1, alternatives: 4, elsewhere: 4, related: 8 }), { strip: "table", preFooter: true });
  // nothing under the strip: the page is too short for a second unit without being more than a quarter ads
  assert.deepEqual(soldOutAdPlan({ visibleRows: 8, summaries: 1, alternatives: 4, elsewhere: 0, related: 0 }), { strip: null, preFooter: false });
  // a two-row table, no alternatives (nothing of the type in stock), but a set's products under it: at the bottom
  const short = soldOutAdPlan({ visibleRows: 2, summaries: 0, alternatives: 0, elsewhere: 2, related: 8 });
  assert.equal(short.preFooter, false, "the bottom strip replaces the pre-footer one");
  assert.ok(short.strip !== "table");
  // a bare page: no strip, no pre-footer
  assert.deepEqual(soldOutAdPlan({ visibleRows: 1, summaries: 0, alternatives: 0, elsewhere: 0, related: 0 }), { strip: null, preFooter: false });
  // more page never takes a unit away
  const rank = (s: { strip: string | null }) => (s.strip === "table" ? 2 : s.strip === "bottom" ? 1 : 0);
  for (let rows = 1; rows < 8; rows++) {
    for (const alternatives of [0, 4]) {
      const a = soldOutAdPlan({ visibleRows: rows, alternatives, elsewhere: 2, related: 4 });
      const b = soldOutAdPlan({ visibleRows: rows + 1, alternatives, elsewhere: 2, related: 4 });
      assert.ok(rank(b) >= rank(a), `${rows} rows`);
    }
  }
});

test("in-stock ad plan counts every row (all visible), and more rows never take a unit away", () => {
  const shape = tableShape(30, 20);
  assert.equal(shape.summaries, 0);
  assert.deepEqual(productAdPlan({ offerRows: 30, summaries: shape.summaries, elsewhere: 3, related: 8 }), { tableGroup: true, preFooter: true }, "a 31-row table is long enough for both");
  assert.deepEqual(productAdPlan({ offerRows: 9, elsewhere: 6, related: 8 }), { tableGroup: true, preFooter: false }, "ten rows: no pre-footer strip (density)");
  for (let rows = 1; rows < 40; rows++) {
    const a = productAdPlan({ offerRows: rows, elsewhere: 3, related: 8 });
    const b = productAdPlan({ offerRows: rows + 1, elsewhere: 3, related: 8 });
    assert.ok(Number(b.tableGroup) + Number(b.preFooter) >= Number(a.tableGroup) + Number(a.preFooter), `${rows} rows`);
  }
});

// ─── Words ────────────────────────────────────────────────────────────────────

test("the title: MTG + name + the cheapest open price and where; TCGplayer named as a marketplace, never counted as a store; fits 65 or goes absolute", () => {
  const open = (stores: number, tcg: boolean) => [...Array.from({ length: stores }, () => ({ marketplace: false })), ...(tcg ? [{ marketplace: true }] : [])];
  assert.equal(openWhere(open(19, false), "US store"), "at 19 US stores");
  assert.equal(openWhere(open(19, true), "US store"), "at 19 US stores and on TCGplayer");
  assert.equal(openWhere(open(0, true), "US store"), "on TCGplayer");
  assert.equal(openWhere(open(1, false), "Australian store"), "at 1 Australian store");
  const t = productTitle({ name: "Edge of Eternities Collector Booster Box", market: "US", inName: "the US", cheapestCents: 5499, where: "at 19 US stores and on TCGplayer" });
  assert.deepEqual(t, { absolute: "MTG Edge of Eternities Collector Booster Box — from $54.99 at 19 US stores and on TCGplayer" });
  const sold = productTitle({ name: "Aetherdrift Bundle", market: "UK", inName: "the UK", cheapestCents: null, where: null });
  assert.equal(sold, "MTG Aetherdrift Bundle — price & stock in the UK");
  assert.equal(renderedTitle(sold), "MTG Aetherdrift Bundle — price & stock in the UK | MTG Compare");
  assert.ok(renderedTitle(sold).length <= 65);
  assert.equal(
    typeof productTitle({ name: "Magic: The Gathering Foundations Starter Collection", market: "AU", inName: "Australia", cheapestCents: null, where: null }),
    "object",
    "an object: too long for the suffix (and never 'MTG Magic: …')",
  );
  assert.deepEqual(fitTitle("x".repeat(51)), "x".repeat(51), "51 + ' | MTG Compare' = 65");
  assert.deepEqual(fitTitle("x".repeat(52)), { absolute: "x".repeat(52) });
  assert.equal(shortDate("2026-07-17"), "17 Jul 2026");
  assert.equal(releaseChip("2026-07-17", false), "Released 17 Jul 2026");
  assert.equal(releaseChip("2026-11-06", true), "Pre-order · out 6 Nov 2026");
});

const card = (slug: string, productType: string, lowestPriceCents: number, open = true): ProductCardData => ({
  slug,
  name: `Edge of Eternities ${productType}`,
  productType,
  setCode: "eoe",
  imageUrl: null,
  lowestPriceCents,
  inStockStores: open ? 3 : 0,
  listedStores: 5,
  marketplaceOpen: false,
  medianOpenCents: null,
  releaseDate: "2025-08-01",
});

test("the value check: this product is the cheapest way to buy the set's packs, or another format is (linked); nothing to compare, nothing said", () => {
  const box = card("edge-of-eternities-play-booster-box", "Play Booster Box", 22500); // 30 packs: A$7.50 a pack
  const bundle = card("edge-of-eternities-bundle", "Bundle", 8820); // 9 packs: A$9.80
  const pack = card("edge-of-eternities-play-booster-pack", "Play Booster Pack", 916); // A$9.16
  const picks = cheapestPerPackByType([box, bundle, pack]);
  const at = { setName: "Edge of Eternities", market: "AU", inName: "Australia", region: "au", picks };
  const a = valueCheck({ ...at, slug: box.slug, productType: "Play Booster Box", perPack: 750 });
  assert.deepEqual(a, { text: "At A$7.50 a pack this is the cheapest way to buy Edge of Eternities packs in Australia today (Bundle A$9.80 and Play Booster A$9.16 a pack)" });
  const b = valueCheck({ ...at, slug: bundle.slug, productType: "Bundle", perPack: 980 });
  assert.deepEqual(b, { text: "The Play Booster Box is cheaper per pack today: A$7.50 a pack", href: "/au/p/edge-of-eternities-play-booster-box" });
  assert.equal(valueCheck({ ...at, slug: box.slug, productType: "Play Booster Box", perPack: 750, picks: cheapestPerPackByType([box]) }), null);
  assert.equal(valueCheck({ ...at, slug: "deck", productType: "Commander Deck", perPack: null }), null);
  for (const v of [a!, b!]) assert.equal(findBannedCopy(v.text), null, v.text);
});

test("quick facts and the description: current facts only, TCGplayer worded as a marketplace, nothing BANNED_COPY matches", () => {
  const lastSeen = new Date(NOW - 3 * 3_600_000).toISOString();
  const facts = quickFacts({
    market: "US",
    inName: "the US",
    adjective: "US",
    packs: 9,
    release: { date: "2026-07-17", preorder: false },
    cheapest: { cents: 5499, storeName: "TCGplayer", marketplace: true, lastSeen },
    openStores: 19,
    storeCount: 28,
    tcgOpen: true,
    msrp: 5999,
    elsewhere: [
      { region: "au", name: "Australia", flag: "🇦🇺", inName: "Australia", market: "AU", lowestPriceCents: 8995, open: true },
      { region: "uk", name: "United Kingdom", flag: "🇬🇧", inName: "the UK", market: "UK", lowestPriceCents: null, open: false },
    ],
  });
  const text = Object.fromEntries(facts.map((f) => [f.term, f.text]));
  assert.equal(text["Booster packs"], "9 in each");
  assert.equal(text["English release"], "17 Jul 2026");
  assert.deepEqual(facts.filter((f) => f.short).map((f) => f.term), ["Booster packs", "English release", "US MSRP"], "the short facts share rows");
  assert.deepEqual(facts.find((f) => f.term === "Other regions")!.regions, [
    { region: "au", name: "Australia", flag: "🇦🇺", text: "from A$89.95" },
    { region: "uk", name: "United Kingdom", flag: "🇬🇧", text: "sold out" },
  ]);
  assert.equal(text["Cheapest right now"], "$54.99 on TCGplayer, a marketplace seller's listing, checked");
  assert.equal(facts.find((f) => f.term === "Cheapest right now")!.checked, lastSeen);
  assert.equal(text["Stock today"], "In stock at 19 of 28 US stores and on TCGplayer");
  assert.equal(text["Other regions"], "from A$89.95 in Australia and sold out in the UK");
  assert.equal(text["US MSRP"], "$59.99");
  const sold = quickFacts({ market: "UK", inName: "the UK", adjective: "UK", packs: null, release: null, cheapest: null, openStores: 0, storeCount: 6, tcgOpen: false, msrp: null, elsewhere: [] });
  assert.deepEqual(sold.map((f) => f.text), ["Sold out at all 6 UK stores that list it"]);
  const desc = productDescription({ name: "Edge of Eternities Collector Booster Box", market: "US", adjective: "US", cheapestCents: 5499, where: "at 19 US stores and on TCGplayer", preorder: false, value: null });
  for (const s of [...facts.map((f) => f.text), ...sold.map((f) => f.text), desc]) assert.ok(!BANNED_COPY.test(s), s);
  assert.match(desc, /^MTG Edge of Eternities Collector Booster Box: in stock at 19 US stores and on TCGplayer, from \$54\.99 today\./);
});

// ─── Alternatives ─────────────────────────────────────────────────────────────

test("in-stock alternatives: one tagged-template query, LIMIT 4, same set first, then newest sets, then cheapest; the headline types when it finds none", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const row = (slug: string, setCode: string | null, cents: number): AltRow => ({ slug, name: slug, productType: "Bundle", setCode, imageUrl: null, lowestPriceCents: cents, inStockStores: 2, listedStores: 4, marketplaceOpen: false, medianOpenCents: null });
  const answer = [row("a", "eoe", 9000), row("b", "fra", 7000), row("c", null, 5000)];
  const db = {
    $queryRaw: async <T,>(q: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: q.join("$?"), values });
      return answer as unknown as T;
    },
  };
  const out = await inStockAlternatives("UK", "Bundle", "eoe", "edge-of-eternities-bundle", 4, { db, today: "2026-10-14", fallback: async () => assert.fail("no fallback when the type has products") });
  assert.deepEqual(out.map((c) => c.slug), ["a", "b", "c"], "the database's order, kept");
  assert.equal(calls.length, 1);
  const { sql, values } = calls[0];
  assert.match(sql, /WHERE s\."market" = \$\? AND \(s\."inStockStores" > 0 OR s\."marketplaceOpen"\) AND p\."productType" = \$\? AND p\."slug" <> \$\?/);
  assert.match(sql, /ORDER BY COALESCE\(p\."setCode" = \$\?, false\) DESC, array_position\(\$\?::text\[\], p\."setCode"\) NULLS LAST, s\."lowestPriceCents" ASC/);
  assert.match(sql, /LIMIT \$\?$/);
  assert.doesNotMatch(sql, /SELECT \*/, "card columns only");
  assert.deepEqual(values.slice(0, 4), ["UK", "Bundle", "edge-of-eternities-bundle", "eoe"]);
  const codes = values[4] as string[];
  assert.equal(codes[0], "fra", "released sets newest first (Reality Fracture, out 2026-10-02)");
  assert.ok(codes.indexOf("eoe") < codes.indexOf("tdm"), "Edge of Eternities before Tarkir: Dragonstorm");
  assert.equal(codes[codes.length - 1], "trk", "a set still to come (Star Trek) last");
  assert.deepEqual(codes, setCodesNewestFirst("2026-10-14"));
  assert.equal(values[5], 4);
  assert.equal(out[2].releaseDate, null);
  assert.equal(altToCard(answer[0]).releaseDate, "2025-08-01", "release dates from sets.ts, as every card");
  // nothing of the type open: the region's cheapest headline products, the product itself never among them
  const empty = { $queryRaw: async <T,>() => [] as unknown as T };
  const fb = await inStockAlternatives("UK", "Secret Lair Drop", null, "x", 4, {
    db: empty,
    fallback: async (market, types, take) => {
      assert.equal(market, "UK");
      assert.deepEqual(types, ["Play Booster Box", "Collector Booster Box", "Bundle"]);
      assert.equal(take, 4);
      return [altToCard(row("x", null, 1)), altToCard(row("y", "fra", 2))];
    },
  });
  assert.deepEqual(fb.map((c) => c.slug), ["y"]);
});

test("the page wires it all: one strip, the anchors the buy bar uses, no compare link, the marketplaces after the table, the alternatives read only where they show", () => {
  const src = readFileSync(new URL("../src/app/[region]/p/[slug]/page.tsx", import.meta.url), "utf8");
  assert.equal((src.match(/<EbayStrip/g) ?? []).length, 1);
  assert.match(src, /<div id="best"/);
  assert.match(src, /<div id="soldout"/);
  assert.match(src, /<Section id="prices"/);
  assert.doesNotMatch(src, /CompareLink|href="#prices"|Compare all/, "every price is visible: no jump link to the table");
  const prices = src.indexOf('<Section id="prices"');
  assert.ok(src.indexOf("<MarketplacePanel") > prices, "the marketplaces panel comes after the price table");
  assert.ok(src.indexOf('<div id="soldout"') > prices && src.indexOf("<SoldOutCallout") > prices, "the sold-out callout too");
  assert.match(src, /fetchPriority="high"/);
  assert.match(src, /hidden aspect-square[^"]*lg:sticky lg:top-\[calc\(var\(--hdr\)\+1\.5rem\)\] lg:flex/);
  assert.match(src, /const alternatives = !best \|\| !p\.setCode \? await inStockAlternatives\(/);
  assert.equal((src.match(/<h1/g) ?? []).length, 1, "one H1");
  assert.doesNotMatch(src, /unstable_cache|searchParams|headers\(\)|cookies\(\)/);
});
