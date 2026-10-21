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

test("the table: eight rows of the ranked list (eBay's among them), the rest in two server-rendered <details>, one red button, every store link in the HTML", () => {
  // 14 in stock, 3 not checked recently, 6 sold out: 23 stores + the eBay row
  const offers = [
    ...Array.from({ length: 14 }, (_, i) => offer(`open${i}`, 5000 + i * 100)),
    ...Array.from({ length: 3 }, (_, i) => offer(`stale${i}`, 4000 + i, true, { lastSeen: new Date(NOW - 5 * 86_400_000).toISOString() })),
    ...Array.from({ length: 6 }, (_, i) => offer(`sold${i}`, 3000 + i, false)),
  ];
  const html = render(React.createElement(OfferTable, { offers, region: "us", preorder: false, ebay: { slug: "x-etb", query: "X Elite Trainer Box", floor: null, packs: 9 } }));
  const first = html.indexOf("<details");
  const before = html.slice(0, first);
  assert.equal([...before.matchAll(/<li data-offer-row=""/g)].length, VISIBLE_ROWS, "exactly 8 rows before the first <details>");
  assert.equal([...html.matchAll(/<li data-offer-row=""/g)].length, 24, "every row is in the HTML");
  // the groups: the 6 other open stores and the eBay search (server state: straight after the open stores), then the 9 closed ones
  const groups = html.split("<details").slice(1);
  assert.equal(groups.length, 3, "two row groups, then 'How these prices work'");
  assert.match(groups[0], /Show 6 more in-stock stores/);
  assert.match(groups[0], /data-ad="listings-offer-row"/, "the eBay row ranks after the 14 open stores: in the first group");
  assert.match(groups[1], /9 stores sold out or not checked/);
  assert.equal([...groups[1].matchAll(/<li data-offer-row=""/g)].length, 9);
  for (const g of groups.slice(0, 2)) assert.match(g, /<summary class="btn-ghost[^"]*w-full[^"]*justify-center/);
  assert.match(groups[2], /How these prices work/);
  // one red button, on the cheapest open row; the other open rows btn-soft, the closed ones btn-ghost
  assert.equal([...html.matchAll(/class="btn-primary/g)].length, 1);
  const a = links(html);
  assert.ok(a.find((l) => l.href === "https://open0.example/p")!.cls.startsWith("btn-primary"));
  assert.ok(a.find((l) => l.href === "https://open5.example/p")!.cls.startsWith("btn-soft"));
  assert.ok(a.find((l) => l.href === "https://sold0.example/p")!.cls.startsWith("btn-ghost"));
  for (const o of offers) assert.ok(a.some((l) => l.href === o.url), `${o.store}'s link is in the server HTML`);
  // the footer keeps the short version; the long one is in the details, whole
  assert.match(html, /In stock first, then cheapest\./);
  assert.match(html, /No store pays to rank\./);
  assert.match(html, /Tinted eBay row = Ad\./);
  assert.match(html, /<details class="group\/how mt-3 text-xs text-muted">/);
});

test("the split comes after ranking: the eBay row takes its place in the first eight and pushes the eighth store into the first group", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ key: `s${i}`, open: i < 10 }));
  const server = splitRows([...rows.slice(0, 10), { key: "ebay", open: true }, ...rows.slice(10)]);
  assert.deepEqual(server.shown.map((r) => r.key), ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"]);
  assert.deepEqual(server.moreOpen.map((r) => r.key), ["s8", "s9", "ebay"]);
  const client = splitRows([...rows.slice(0, 3), { key: "ebay", open: true }, ...rows.slice(3)]);
  assert.equal(client.shown.length, server.shown.length, "the same number of visible rows: the visible height does not change");
  assert.deepEqual(client.moreOpen.map((r) => r.key), ["s7", "s8", "s9"]);
  assert.deepEqual(client.moreClosed, server.moreClosed);
  // the shape the ad plan counts is the same in both states
  assert.deepEqual(tableShape(12, 10), { visible: 8, moreOpen: 3, moreClosed: 2, summaries: 2 });
  assert.deepEqual(tableShape(3, 1), { visible: 4, moreOpen: 0, moreClosed: 0, summaries: 0 });
  assert.deepEqual(tableShape(7, 7), { visible: 8, moreOpen: 0, moreClosed: 0, summaries: 0 });
  assert.deepEqual(tableShape(8, 8), { visible: 8, moreOpen: 1, moreClosed: 0, summaries: 1 });
  assert.equal(moreOpenLabel([{ key: "a" }, { key: "ebay" }]), "Show 1 more in-stock store");
  assert.equal(moreOpenLabel([{ key: "a" }, { key: "tcgplayer" }]), "Show 2 more in-stock offers", "a marketplace is not a store");
  assert.equal(moreOpenLabel([{ key: "ebay" }]), "Show eBay too");
  assert.equal(moreOpenLabel([{ key: "a" }, { key: "b" }], true), "Show 2 more pre-order stores");
  assert.equal(moreClosedLabel(9, false), "9 stores sold out or not checked");
  assert.equal(moreClosedLabel(1, true), "1 more store sold out or not checked");
});

test("a short table has no groups; a sold-out table shows its first eight closed rows and says 'more' for the rest", () => {
  const short = render(React.createElement(OfferTable, { offers: [offer("a", 5000), offer("b", 6000, false)], region: "uk", preorder: false, ebay: { slug: "x", query: "X", floor: null, packs: null } }));
  assert.equal([...short.matchAll(/<details/g)].length, 1, "only 'How these prices work'");
  const sold = Array.from({ length: 11 }, (_, i) => offer(`s${i}`, 3000 + i, false));
  const html = render(React.createElement(OfferTable, { offers: sold, region: "uk", preorder: false, ebay: { slug: "x", query: "X", floor: null, packs: null } }));
  assert.match(html, /4 more stores sold out or not checked/, "7 closed rows and the eBay search show, 4 wait");
  assert.doesNotMatch(html, /class="btn-primary/, "nothing open, no red button");
});

// ─── The sold-out callout ─────────────────────────────────────────────────────

test("sold out: the callout's eBay box is the server's search (soldout-ebay, Ad, sponsored, eBay blue), TCGplayer second, no eBay price", () => {
  const tcgplayer = { title: "Vivid Voltage Elite Trainer Box", url: "https://www.tcgplayer.com/product/222", priceCents: 13653, inStock: true, lastSeen: new Date(NOW - 3_600_000).toISOString() };
  const html = render(
    React.createElement(SoldOutCallout, {
      region: "uk",
      productName: "Vivid Voltage Elite Trainer Box",
      storesListing: 6,
      notChecked: 0,
      tcgplayer,
      ebayQuery: "Vivid Voltage Elite Trainer Box",
      pick: { slug: "vivid-voltage-elite-trainer-box", floor: { value: 20, currency: "GBP" }, packs: 8 },
      instead: { href: "/uk/type/elite-trainer-boxes", label: "See Elite Trainer Boxes in stock in the UK" },
    }),
  );
  assert.match(html, /Sold out at every UK store we track/, "the heading is unchanged");
  assert.match(html, /None of the 6 stores that list it has it in stock\./);
  const box = html.slice(html.indexOf('data-ad="soldout-ebay"'));
  assert.ok(box.length < html.length, "a labelled unit: data-ad=soldout-ebay");
  assert.match(box, /class="ad-pill[^"]*">Ad</);
  assert.match(box, /aria-label="eBay"/);
  const ebay = links(html).filter((l) => new URL(l.href, "https://www.dexcompare.app").hostname.endsWith("ebay.co.uk"));
  assert.equal(ebay.length, 1, "ONE eBay link in the server HTML: the search (the listing is browser-only)");
  const u = new URL(ebay[0].href);
  assert.equal(u.searchParams.get("customid"), "dex-uk-soldout-ebay");
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
  assert.match(html, /href="\/uk\/type\/elite-trainer-boxes"[^>]*>See Elite Trainer Boxes in stock in the UK/);
  for (const p of ["soldout-ebay", "listings-soldout-best", "listings-marketplace", "product-sticky"]) assert.ok((PLACEMENTS as readonly string[]).includes(p), p);
  // pre-order, NZ, SG: no pick, the search alone
  const plain = render(React.createElement(SoldOutCallout, { region: "nz", productName: "X", storesListing: 2, notChecked: 1, tcgplayer: null, ebayQuery: "X" }));
  assert.match(plain, /Find it on ebay\.com\.au/);
  assert.doesNotMatch(plain, /invisible/, "no stacked listing cell without a pick");
});

test("the panel's eBay row in the server HTML: the search, eBay's blue button, placement product-marketplace; the listing cell holds no link", () => {
  const html = render(React.createElement(MarketplacePanel, { region: "us", productName: "Pitch Black ETB", preorder: false, tcgplayer: null, pick: { slug: "pitch-black-elite-trainer-box", floor: null, packs: 9 }, storeCents: 5499 }));
  const ebay = links(html).filter((l) => l.href.includes("ebay.com"));
  assert.equal(ebay.length, 1);
  assert.equal(new URL(ebay[0].href).searchParams.get("customid"), "dex-us-product-marketplace");
  assert.match(html, /class="btn-ad[^"]*">Search eBay/);
  assert.match(html, /col-start-1 row-start-1 invisible" aria-hidden="true"/, "the listing's cell is reserved, invisible");
  assert.doesNotMatch(html, /\/itm\/|ebayimg/);
});

// ─── The phone buy bar ────────────────────────────────────────────────────────

test("the buy bar's server markup: hidden off-screen (translate-y-full, invisible, aria-hidden), phones only, no listing link, no unit", () => {
  const store = { cents: 5499, storeName: "TCG Card Depot", href: "https://depot.example/p", rel: "nofollow noopener", retailer: "TCG Card Depot (US)", marketplace: false };
  const html = render(React.createElement(StickyBuyBar, { region: "us", anchor: "best", store, pick: { slug: "pitch-black-elite-trainer-box", floor: null, packs: 9 } }));
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
  const sold = render(React.createElement(StickyBuyBar, { region: "uk", anchor: "soldout", pick: null, search: { href: "https://www.ebay.co.uk/sch/i.html?_nkw=x&customid=dex-uk-product-sticky", line: "Sold out at UK stores" } }));
  assert.match(sold, /class="ad-pill[^"]*">Ad</);
  assert.match(sold, /Find on eBay/);
  assert.equal(links(sold)[0].rel, REL_SPONSORED);
});

test("the share button: a 44 px button, the canonical URL, one analytics property", () => {
  const html = render(React.createElement(ShareButton, { title: "Pokémon Pitch Black Elite Trainer Box", path: "/us/p/pitch-black-elite-trainer-box", kind: "product" }));
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

test("in-stock ad plan counts the visible rows and the group summaries, not every offer", () => {
  // 30 offers or 10: the same eight visible rows (and two summaries): the same plan
  assert.deepEqual(productAdPlan({ offerRows: 30, summaries: 2, elsewhere: 3, related: 8 }), productAdPlan({ offerRows: 10, summaries: 2, elsewhere: 3, related: 8 }));
  assert.deepEqual(productAdPlan({ offerRows: 30, summaries: 2, elsewhere: 3, related: 8 }), { tableGroup: true, preFooter: false }, "the strip after the facts; no pre-footer strip (density)");
  assert.deepEqual(productAdPlan({ offerRows: 30, summaries: 2, elsewhere: 6, related: 8 }), { tableGroup: true, preFooter: false });
});

// ─── Words ────────────────────────────────────────────────────────────────────

test("the title: Pokémon + name + the cheapest open price and where; TCGplayer named as a marketplace, never counted as a store; fits 65 or goes absolute", () => {
  const open = (stores: number, tcg: boolean) => [...Array.from({ length: stores }, () => ({ marketplace: false })), ...(tcg ? [{ marketplace: true }] : [])];
  assert.equal(openWhere(open(19, false), "US store"), "at 19 US stores");
  assert.equal(openWhere(open(19, true), "US store"), "at 19 US stores and on TCGplayer");
  assert.equal(openWhere(open(0, true), "US store"), "on TCGplayer");
  assert.equal(openWhere(open(1, false), "Australian store"), "at 1 Australian store");
  const t = productTitle({ name: "Pitch Black Elite Trainer Box", market: "US", inName: "the US", cheapestCents: 5499, where: "at 19 US stores and on TCGplayer" });
  assert.deepEqual(t, { absolute: "Pokémon Pitch Black Elite Trainer Box — from $54.99 at 19 US stores and on TCGplayer" });
  const sold = productTitle({ name: "Vivid Voltage ETB", market: "UK", inName: "the UK", cheapestCents: null, where: null });
  assert.equal(sold, "Pokémon Vivid Voltage ETB — price & stock in the UK");
  assert.equal(renderedTitle(sold), "Pokémon Vivid Voltage ETB — price & stock in the UK | DexCompare");
  assert.ok(renderedTitle(sold).length <= 65);
  assert.equal(productTitle({ name: "Pokémon Center Elite Trainer Box", market: "AU", inName: "Australia", cheapestCents: null, where: null }).toString().startsWith("Pokémon Center"), false, "an object: too long for the suffix");
  assert.deepEqual(fitTitle("x".repeat(52)), "x".repeat(52), "52 + ' | DexCompare' = 65");
  assert.deepEqual(fitTitle("x".repeat(53)), { absolute: "x".repeat(53) });
  assert.equal(shortDate("2026-07-17"), "17 Jul 2026");
  assert.equal(releaseChip("2026-07-17", false), "Released 17 Jul 2026");
  assert.equal(releaseChip("2026-11-06", true), "Pre-order · out 6 Nov 2026");
});

const card = (slug: string, productType: string, lowestPriceCents: number, open = true): ProductCardData => ({
  slug,
  name: `Chaos Rising ${productType}`,
  productType,
  setCode: "me4",
  imageUrl: null,
  lowestPriceCents,
  inStockStores: open ? 3 : 0,
  listedStores: 5,
  marketplaceOpen: false,
  medianOpenCents: null,
  releaseDate: "2026-05-22",
});

test("the value check: this product is the cheapest way to buy the set's packs, or another format is (linked); nothing to compare, nothing said", () => {
  const box = card("chaos-rising-booster-box", "Booster Box", 27000); // A$7.50 a pack
  const etb = card("chaos-rising-elite-trainer-box", "Elite Trainer Box", 8820); // A$9.80
  const bundle = card("chaos-rising-booster-bundle", "Booster Bundle", 5496); // A$9.16
  const picks = cheapestPerPackByType([box, etb, bundle]);
  const a = valueCheck({ slug: box.slug, productType: "Booster Box", perPack: 750, setName: "Chaos Rising", market: "AU", inName: "Australia", region: "au", picks });
  assert.deepEqual(a, { text: "At A$7.50 a pack this is the cheapest way to buy Chaos Rising packs in Australia today (ETB A$9.80 and bundle A$9.16 a pack)" });
  const b = valueCheck({ slug: etb.slug, productType: "Elite Trainer Box", perPack: 980, setName: "Chaos Rising", market: "AU", inName: "Australia", region: "au", picks });
  assert.deepEqual(b, { text: "The booster box is cheaper per pack today: A$7.50 a pack", href: "/au/p/chaos-rising-booster-box" });
  assert.equal(valueCheck({ slug: box.slug, productType: "Booster Box", perPack: 750, setName: "Chaos Rising", market: "AU", inName: "Australia", region: "au", picks: cheapestPerPackByType([box]) }), null);
  assert.equal(valueCheck({ slug: "tin", productType: "Tin", perPack: null, setName: "Chaos Rising", market: "AU", inName: "Australia", region: "au", picks }), null);
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
  const desc = productDescription({ name: "Pitch Black Elite Trainer Box", market: "US", adjective: "US", cheapestCents: 5499, where: "at 19 US stores and on TCGplayer", preorder: false, value: null });
  for (const s of [...facts.map((f) => f.text), ...sold.map((f) => f.text), desc]) assert.ok(!BANNED_COPY.test(s), s);
  assert.match(desc, /^Pokémon Pitch Black Elite Trainer Box: in stock at 19 US stores and on TCGplayer, from \$54\.99 today\./);
});

// ─── Alternatives ─────────────────────────────────────────────────────────────

test("in-stock alternatives: one tagged-template query, LIMIT 4, same set first, then newest sets, then cheapest; the headline types when it finds none", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const row = (slug: string, setCode: string | null, cents: number): AltRow => ({ slug, name: slug, productType: "Elite Trainer Box", setCode, imageUrl: null, lowestPriceCents: cents, inStockStores: 2, listedStores: 4, marketplaceOpen: false, medianOpenCents: null });
  const answer = [row("a", "me4", 9000), row("b", "me5", 7000), row("c", null, 5000)];
  const db = {
    $queryRaw: async <T,>(q: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: q.join("$?"), values });
      return answer as unknown as T;
    },
  };
  const out = await inStockAlternatives("UK", "Elite Trainer Box", "me4", "vivid-voltage-elite-trainer-box", 4, { db, today: "2026-10-14", fallback: async () => assert.fail("no fallback when the type has products") });
  assert.deepEqual(out.map((c) => c.slug), ["a", "b", "c"], "the database's order, kept");
  assert.equal(calls.length, 1);
  const { sql, values } = calls[0];
  assert.match(sql, /WHERE s\."market" = \$\? AND \(s\."inStockStores" > 0 OR s\."marketplaceOpen"\) AND p\."productType" = \$\? AND p\."slug" <> \$\?/);
  assert.match(sql, /ORDER BY COALESCE\(p\."setCode" = \$\?, false\) DESC, array_position\(\$\?::text\[\], p\."setCode"\) NULLS LAST, s\."lowestPriceCents" ASC/);
  assert.match(sql, /LIMIT \$\?$/);
  assert.doesNotMatch(sql, /SELECT \*/, "card columns only");
  assert.deepEqual(values.slice(0, 4), ["UK", "Elite Trainer Box", "vivid-voltage-elite-trainer-box", "me4"]);
  const codes = values[4] as string[];
  assert.equal(codes[0], "cel30", "released sets newest first (30th Celebration, out 2026-09-16)");
  assert.ok(codes.indexOf("me5") < codes.indexOf("sv8"), "Pitch Black before Surging Sparks");
  assert.equal(codes[codes.length - 1], "me6", "a set still to come (Delta Reign) last");
  assert.deepEqual(codes, setCodesNewestFirst("2026-10-14"));
  assert.equal(values[5], 4);
  assert.equal(out[2].releaseDate, null);
  assert.equal(altToCard(answer[0]).releaseDate, "2026-05-22", "release dates from sets.ts, as every card");
  // nothing of the type open: the region's cheapest headline products, the product itself never among them
  const empty = { $queryRaw: async <T,>() => [] as unknown as T };
  const fb = await inStockAlternatives("UK", "Tin", null, "x", 4, {
    db: empty,
    fallback: async (market, types, take) => {
      assert.equal(market, "UK");
      assert.deepEqual(types, ["Booster Box", "Elite Trainer Box", "Booster Bundle", "Pokémon Center Elite Trainer Box"]);
      assert.equal(take, 4);
      return [altToCard(row("x", null, 1)), altToCard(row("y", "me5", 2))];
    },
  });
  assert.deepEqual(fb.map((c) => c.slug), ["y"]);
});

test("the page wires it all: one strip, the anchors the buy bar and the compare link use, the alternatives read only where they show", () => {
  const src = readFileSync(new URL("../src/app/[region]/p/[slug]/page.tsx", import.meta.url), "utf8");
  assert.equal((src.match(/<EbayStrip/g) ?? []).length, 1);
  assert.match(src, /<div id="best"/);
  assert.match(src, /<div id="soldout"/);
  assert.match(src, /<Section id="prices"/);
  assert.match(src, /href="#prices"/);
  assert.match(src, /fetchPriority="high"/);
  assert.match(src, /hidden aspect-square[^"]*lg:sticky lg:top-\[calc\(var\(--hdr\)\+1\.5rem\)\] lg:flex/);
  assert.match(src, /const alternatives = !best \|\| !p\.setCode \? await inStockAlternatives\(/);
  assert.equal((src.match(/<h1/g) ?? []).length, 1, "one H1");
  assert.doesNotMatch(src, /unstable_cache|searchParams|headers\(\)|cookies\(\)/);
});
