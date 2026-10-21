import { test } from "node:test";
import assert from "node:assert/strict";
import fs, { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PreorderMarketplaces } from "../src/components/Marketplaces";
import { OfferTable } from "../src/components/OfferTable";
import { PLACEMENTS } from "../src/lib/affiliate";
import type { OfferView } from "../src/lib/data";
import { buildPublicFiles, type Tables } from "../src/lib/public-data/export";
import { resetPublicData } from "../src/lib/public-data/store";
import { STORES, storesInMarket } from "../src/lib/stores";
import { findBannedCopy } from "../src/lib/copy-rules";
import { money } from "../src/lib/format";
import { titleText } from "../src/lib/hub-copy";
import { packsFor, perPackCents } from "../src/lib/packs";
import {
  cheapestStoreByType,
  cheapestStoreOffer,
  glanceFacts,
  msrpPerPack,
  msrpValueSentence,
  preorderDescription,
  preorderFaqs,
  preorderSummary,
  preorderTitle,
  reachLine,
  storeOffers,
} from "../src/lib/preorder-copy";
import { guideShowsMsrp, openPreorderGuides, preorderGuide, preorderGuideBySlug, preorderPath, PREORDER_GUIDES } from "../src/lib/preorder-guides";
import { formatRelease, isPreorderSet } from "../src/lib/release";
import { REGION_LIST, REGIONS } from "../src/lib/regions";
import { usMsrpCents } from "../src/lib/rrp";
import { TYPE_BY_KEY } from "../src/lib/sealed-title";
import { SET_BY_CODE } from "../src/lib/sets";
import { SITE_URL } from "../src/lib/site";
import { staticSitemap } from "../src/lib/sitemap";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("every pre-order guide is for a known set, with known product types, sourced and dated", () => {
  assert.ok(PREORDER_GUIDES.length > 0);
  for (const g of PREORDER_GUIDES) {
    const set = SET_BY_CODE.get(g.setCode);
    assert.ok(set, `${g.setCode} is in lib/sets.ts`);
    for (const p of g.products) assert.ok(TYPE_BY_KEY.has(p.type), `${g.setCode}: ${p.type} is a product type`);
    assert.equal(new Set(g.products.map((p) => p.type)).size, g.products.length, "one entry per type");
    assert.ok(g.sources.length > 0 && g.sources.every((s) => s.url.startsWith("https://")), "sourced");
    assert.match(g.checked, /^\d{4}-\d{2}-\d{2}$/);
    for (const d of [g.prereleaseFrom, g.liveDate]) if (d) assert.ok(d < set!.releaseDate, "dates before release day");
  }
});

test("Star Trek: the dates Wizards of the Coast announced", () => {
  const g = preorderGuide("trk");
  assert.ok(g);
  assert.equal(SET_BY_CODE.get("trk")?.releaseDate, "2026-11-13");
  assert.equal(g.prereleaseFrom, "2026-11-06");
  assert.equal(g.liveDate, "2026-11-10");
  assert.deepEqual(preorderGuideBySlug("star-trek")?.set.code, "trk");
  assert.equal(preorderGuideBySlug("reality-fracture"), null, "no guide, no page");
  assert.equal(preorderGuideBySlug("no-such-set"), null);
  assert.equal(preorderPath("au", "trk"), "/au/preorders/star-trek");
  assert.equal(preorderPath("au", "fra"), null);
  // Wizards publishes no MSRP for the Prerelease Pack: never printed.
  assert.equal(guideShowsMsrp(g, "prerelease-pack"), false);
  assert.equal(guideShowsMsrp(g, "play-booster"), true);
});

test("pre-order pages retire themselves on release day", () => {
  assert.deepEqual(
    openPreorderGuides("2026-10-21").map((x) => x.set.code),
    ["trk"],
  );
  assert.deepEqual(openPreorderGuides("2026-11-13"), [], "release day: no longer a pre-order");
  assert.equal(isPreorderSet("trk", new Date("2026-11-12T23:59:00Z")), true);
  assert.equal(isPreorderSet("trk", new Date("2026-11-13T00:00:00Z")), false);
  const before = new Set(staticSitemap({}, undefined, "2026-10-21").map((e) => e.url));
  for (const r of REGION_LIST) assert.ok(before.has(`${SITE_URL}/${r.region}/preorders/star-trek`), r.region);
  const after = staticSitemap({}, undefined, "2026-11-13").map((e) => e.url);
  assert.ok(!after.some((u) => u.includes("/preorders/")), "out of the sitemap once released");
});

test("the pre-order page says PreOrder, never InStock, and uses its own placement", () => {
  const page = src("src/app/[region]/preorders/[set]/page.tsx");
  assert.match(page, /schema\.org\/PreOrder/);
  assert.doesNotMatch(page, /schema\.org\/InStock/);
  assert.match(page, /placement="preorders"/);
  assert.match(page, /regionOrNotFound\(params\.region\)/);
  assert.match(page, /export const dynamic = "force-dynamic"/); // CDN-cached, not ISR (tests/cache-ttl.test.ts)
  assert.match(page, /noindex: !pre/);
});

test("set page, release calendar and region home link the pre-order page", () => {
  assert.match(src("src/app/[region]/sets/[set]/page.tsx"), /preorderPath\(r\.region, s\.code\)/);
  assert.match(src("src/app/[region]/releases/page.tsx"), /preorderPath\(r\.region, s\.code\)/);
  assert.match(src("src/app/[region]/page.tsx"), /openPreorderGuides\(\)/);
});

// ─── The release-date content merged into the page ─────────────────────────────────────────────────────────────────────────

const ST = preorderGuide("trk")!;
const ST_SET = SET_BY_CODE.get("trk")!;

test("Star Trek: the new mechanic, the notes and the products are each sourced; nothing unconfirmed is printed", () => {
  assert.equal(ST.newFeature?.name, "Assimilate");
  assert.match(ST.newFeature!.source, /Wizards of the Coast, 14 July 2026/);
  for (const n of ST.notes) assert.match(n.source, /\d{4}$/, `${n.text}: dated`);
  const box = ST.products.find((p) => p.type === "play-booster-box")!;
  assert.match(box.contents, new RegExp(`^${packsFor("play-booster-box", "trk")} Play Boosters`), "pack count is packs.ts's");
  const bundle = ST.products.find((p) => p.type === "bundle")!;
  assert.match(bundle.contents, new RegExp(`^${packsFor("bundle", "trk")} Play Boosters`));
  assert.ok(ST.sources.every((x) => x.url.startsWith("https://magic.wizards.com/") || x.url.startsWith("https://wpn.wizards.com/")), "Wizards' own pages");
  assert.equal(ST.cardCount, "", "Wizards has published no card count: none is printed");
  const all = JSON.stringify(ST);
  assert.doesNotMatch(all, /\[VERIFY|\[live price|\$\d/i, "no unconfirmed claims and no typed prices");
});

test("Star Trek page title and description: the pre-order prices AND the release date, in every region", () => {
  for (const r of REGION_LIST) {
    const t = titleText(preorderTitle(ST_SET, r, true));
    assert.match(t, /^Star Trek pre-orders in /);
    assert.ok(t.includes(r.inName), `${r.region}: ${t}`);
    assert.match(t, /prices & release date$/);
    assert.ok(t.length <= 65, `${r.region}: ${t.length}`);
    const d = preorderDescription(ST_SET, ST, r, true);
    assert.ok(d.length <= 160, `${r.region}: description is ${d.length} characters`);
    assert.ok(d.includes(formatRelease(ST_SET.releaseDate)), d);
    assert.match(d, /prerelease from 6 November/);
    assert.ok(d.includes(r.currency) && d.includes(r.adjective), d);
    assert.equal(findBannedCopy(`${t} ${d}`), null);
  }
  assert.doesNotMatch(titleText(preorderTitle(ST_SET, REGIONS.au, false)), /pre-order/, "released: no pre-order title");
  assert.match(preorderDescription(ST_SET, ST, REGIONS.au, false), /released on 13 November 2026/);
});

test("the release date at a glance: release, prerelease and MTG Arena; no set size Wizards has not given", () => {
  const f = glanceFacts(ST_SET, ST);
  assert.deepEqual(
    f.map((x) => [x.key, x.iso ?? x.value]),
    [
      ["release", "2026-11-13"],
      ["prerelease", "2026-11-06"],
      ["live", "2026-11-10"],
    ],
  );
  assert.match(f[1].note!, /Prerelease Packs, at participating stores/);
  assert.equal(f[2].label, "MTG Arena");
});

test("US per-pack list prices are rrp.ts ÷ packs.ts, US only: a single Play Booster and the Bundle, never a box Wizards gave no price for", () => {
  assert.deepEqual(msrpPerPack(ST_SET, ST, REGIONS.au), []);
  const rows = msrpPerPack(ST_SET, ST, REGIONS.us);
  assert.deepEqual(
    rows.map((x) => x.type),
    ["play-booster", "bundle"],
  );
  for (const row of rows) {
    assert.equal(row.cents, usMsrpCents(row.type, "trk"));
    assert.equal(row.perPack, perPackCents(usMsrpCents(row.type, "trk"), packsFor(row.type, "trk")));
  }
  const sentence = msrpValueSentence(rows)!;
  assert.ok(sentence.startsWith(`At US MSRP a pack costs ${money(699, "US")} in a single Play Booster`), sentence);
  assert.ok(sentence.includes(`${money(perPackCents(6999, 9)!, "US")} in the Bundle`), sentence);
  assert.equal(msrpValueSentence([]), null);
});

test("the FAQ: the release date first, the Prerelease Pack, live cheapest pre-orders in the region's currency, US MSRP in the US only", () => {
  const cheapest = { "play-booster-box": 21500, bundle: 6499 };
  for (const r of REGION_LIST) {
    const faqs = preorderFaqs(ST_SET, ST, r, cheapest, true);
    assert.match(faqs[0].q, /release date\?$/);
    assert.ok(faqs[0].a.startsWith(`Star Trek releases on ${formatRelease("2026-11-13")}, per Wizards of the Coast`), faqs[0].a);
    assert.match(faqs[0].a, /6 November 2026/);
    assert.match(faqs[0].a, /MTG Arena gets the set on 10 November 2026/);
    const pre = faqs.find((f) => /prerelease/.test(f.q))!;
    assert.match(pre.a, /6 Play Boosters, 1 traditional foil rare or mythic rare/);
    const box = faqs.find((f) => /Play Booster Box cost/.test(f.q))!;
    assert.ok(box.a.includes(money(21500, r.market)), `${r.region}: live box price in ${r.currency}`);
    const bundleQ = faqs.find((f) => /How much is the Star Trek Bundle/.test(f.q))!;
    assert.ok(bundleQ.a.includes(money(6499, r.market)));
    assert.ok(faqs.some((f) => /Commander decks/.test(f.q) && /Federation Fleet, Landing Party, Klingon Fury and We Are the Borg/.test(f.a)));
    const text = faqs.map((f) => `${f.q} ${f.a}`).join(" ");
    assert.equal(findBannedCopy(text), null, r.region);
    if (r.market === "US") {
      assert.ok(bundleQ.a.includes(`US MSRP is ${money(6999, "US")}`));
      assert.ok(box.a.includes(money(699, "US")) && /publishes none for the display/.test(box.a));
    } else {
      assert.doesNotMatch(text, /MSRP|US list price/, `${r.region}: no US list price outside the US`);
      assert.match(bundleQ.a, /publishes no list price outside the US/);
    }
    assert.equal(new Set(faqs.map((f) => f.q)).size, faqs.length, "unique questions");
  }
  // Nothing open: said plainly, never a made-up price.
  const none = preorderFaqs(ST_SET, ST, REGIONS.nz, {}, true).find((f) => /Play Booster Box cost/.test(f.q))!;
  assert.match(none.a, /No New Zealand store we track has the Play Booster Box open for pre-order right now/);
  // Released: past tense, and no live pre-order line.
  const after = preorderFaqs(ST_SET, ST, REGIONS.au, cheapest, false);
  assert.ok(after[0].a.startsWith("Star Trek released on 13 November 2026"));
  assert.ok(!after.some((f) => f.a.includes("right now.")), "no pre-order prices once released");
});

test("the page renders the merged content: the release-date box, the set's make-up and the FAQ from preorder-copy.ts", () => {
  const page = src("src/app/[region]/preorders/[set]/page.tsx");
  assert.match(page, /<ReleaseGlance /);
  assert.match(page, /preorderFaqs\(set, guide, r, cheapestStoreByType\(listed, now\), pre\)/, "the FAQ quotes the cheapest STORE");
  assert.match(page, /preorderTitle\(set, r, pre\)/);
  assert.match(page, /guide\.makeup\.map/);
  assert.match(page, /"@type": "FAQPage"/);
});

// ─── The pre-order price lists, marketplaces first (the owner, 2026-10-16) ───────────────────────────────────────────────────

(globalThis as unknown as { React: typeof React }).React = React;
const quiet = (el: React.ReactElement) => {
  const err = console.error;
  console.error = () => {};
  try {
    return renderToStaticMarkup(el);
  } finally {
    console.error = err;
  }
};
const NOW = Date.now();
const fresh = new Date(NOW - 3_600_000).toISOString();
const stale = new Date(NOW - 100 * 3_600_000).toISOString();
const off = (store: string, priceCents: number, inStock = true, extra: Partial<OfferView> = {}): OfferView => ({
  store,
  storeName: store.replace(/^./, (c) => c.toUpperCase()),
  storeHost: `${store}.example`,
  title: `${store} title`,
  url: `https://${store}.example/p`,
  priceCents,
  inStock,
  lastSeen: fresh,
  marketplace: false,
  ...extra,
});
const tcgOffer = (priceCents: number, inStock = true) =>
  off("tcgplayer", priceCents, inStock, { storeName: "TCGplayer", title: "Delta Reign Booster Box", url: "https://www.tcgplayer.com/product/1", marketplace: true });
// A booster box: TCGplayer cheapest of all, three open stores (out of price order), one sold out, one not checked for 100 hours.
const BOX_OFFERS = [off("cherry", 34900), tcgOffer(19990), off("pokebox", 33500), off("gone", 30000, false), off("stale", 29000, true, { lastSeen: stale }), off("zeta", 36999)];
const GROUPS = [
  { product: { name: "Star Trek Play Booster Box", productType: "Play Booster Box", setCode: "trk" }, offers: BOX_OFFERS },
  { product: { name: "Star Trek Bundle", productType: "Bundle", setCode: "trk" }, offers: [off("cherry", 16999), off("north", 15999), tcgOffer(8999)] },
  { product: { name: "Star Trek Gift Bundle", productType: "Gift Bundle", setCode: "trk" }, offers: [tcgOffer(4999)] },
];

test("the stores alone, ranked: open pre-orders cheapest first, then sold out and not checked; TCGplayer is never one of them", () => {
  const ranked = storeOffers(BOX_OFFERS, NOW);
  assert.deepEqual(
    ranked.map((o) => o.store),
    ["pokebox", "cherry", "zeta", "stale", "gone"],
  );
  assert.ok(!ranked.some((o) => o.marketplace));
  assert.equal(cheapestStoreOffer(BOX_OFFERS, NOW)?.store, "pokebox", "the cheapest STORE, though TCGplayer is cheaper");
  assert.equal(cheapestStoreOffer([tcgOffer(100)], NOW), null);
  assert.deepEqual(cheapestStoreByType(GROUPS, NOW), { "play-booster-box": 33500, bundle: 15999 }, "a type only TCGplayer has open gets no store price");
});

test("the summary strip: stores checked (the registry), distinct stores taking pre-orders, the cheapest box at a store with per pack, days to release", () => {
  const s = preorderSummary(GROUPS, storesInMarket("AU").length, SET_BY_CODE.get("trk")!, "2026-10-21", NOW);
  assert.equal(s.storesChecked, STORES.filter((x) => x.market === "AU").length);
  assert.equal(s.taking, 4, "pokebox, cherry, zeta, north: distinct, open, never TCGplayer, never the sold-out or unchecked store");
  assert.deepEqual(s.cheapestBox, { cents: 33500, store: "Pokebox", perPack: perPackCents(33500, packsFor("play-booster-box", "trk")) });
  assert.equal(s.days, 23);
  assert.equal(preorderSummary([], 60, SET_BY_CODE.get("trk")!, "2026-10-21", NOW).cheapestBox, null);
  assert.equal(reachLine(ST_SET, { stores: 75, markets: 7 }), "Across all seven markets we compare, 75 stores list Star Trek.");
  assert.equal(reachLine(ST_SET, { stores: 1, markets: 1 }), "Across the seven markets we compare, 1 store lists Star Trek, in 1 of them.");
  assert.equal(reachLine(ST_SET, null), null);
  assert.equal(reachLine(ST_SET, { stores: 0, markets: 0 }), null);
});

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const anchors = (html: string) =>
  [...html.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ href: (/href="([^"]*)"/.exec(m[1])?.[1] ?? "").replace(/&amp;/g, "&"), rel: /rel="([^"]*)"/.exec(m[1])?.[1] ?? "", text: text(m[2]).trim() }));

test("marketplace rows: eBay first (the region's search, eBay blue, Ad, not a price), then TCGplayer; both sponsored, neither numbered nor 'best'", () => {
  assert.ok((PLACEMENTS as readonly string[]).includes("preorders-ebay") && (PLACEMENTS as readonly string[]).includes("preorders-tcgplayer"));
  const cases = [
    { region: "us" as const, tcg: tcgOffer(19990), host: "www.ebay.com", price: "$199.90" },
    { region: "au" as const, tcg: { title: "Delta Reign Booster Box", url: "https://www.tcgplayer.com/product/1", priceCents: 24494, inStock: true, lastSeen: fresh }, host: "www.ebay.com.au", price: "US$244.94" },
    { region: "nz" as const, tcg: null, host: "www.ebay.com.au", price: null },
    { region: "sg" as const, tcg: null, host: "www.ebay.com", price: null },
  ];
  for (const c of cases) {
    const html = quiet(React.createElement(PreorderMarketplaces, { region: c.region, productName: "Delta Reign Booster Box", tcgplayer: c.tcg }));
    const t = text(html);
    assert.match(html, /^<div data-ad="preorders-ebay"/);
    const [ebay, tcg] = anchors(html);
    assert.equal(new URL(ebay.href).hostname, c.host, `${c.region}: the region's eBay`);
    assert.equal(new URL(ebay.href).searchParams.get("customid"), `mtg-${c.region}-preorders-ebay`);
    assert.equal(new URL(ebay.href).searchParams.get("LH_BIN"), "1");
    assert.match(new URL(ebay.href).searchParams.get("_nkw")!, /Delta Reign Booster Box sealed/);
    assert.match(ebay.text, /Search eBay/);
    assert.match(t, /not a price we checked/, "labelled a search, not a price");
    assert.match(html, /btn-ad/);
    assert.match(t, /\bAd\b/);
    assert.match(tcg.href, /^https:\/\/partner\.tcgplayer\.com\//);
    assert.match(decodeURIComponent(tcg.href), new RegExp(`sharedid=mtg-${c.region}-preorders-tcgplayer`));
    for (const a of [ebay, tcg]) assert.match(a.rel, /^sponsored /, "a paid link");
    assert.ok(html.indexOf("ebay.") < html.indexOf("tcgplayer.com"), "eBay first");
    if (c.price) assert.ok(t.includes(c.price), `${c.region}: TCGplayer's price`);
    else assert.match(tcg.text, /Search on TCGplayer/);
    if (c.region === "us") assert.doesNotMatch(t, /US\$|prices in US\$/);
    else assert.match(t, /US marketplace, prices in US\$/);
    assert.doesNotMatch(t, /Best price|Cheapest|\b1\./, "never ranked, numbered or badged");
    assert.match(t, /Affiliate links — we may earn a commission/);
  }
});

test("a pre-order price list: marketplaces pinned on top, then the stores numbered 1, 2, 3 by price, 'Cheapest store' on #1, closed rows unnumbered", () => {
  const stores = storeOffers(BOX_OFFERS, NOW);
  const html = quiet(
    React.createElement(OfferTable, {
      offers: stores,
      region: "au",
      preorder: true,
      packs: 36,
      placement: "preorders",
      numbered: true,
      bestLabel: { short: "Cheapest", full: "Cheapest store" },
      ranked: "Stores only: open pre-orders first, cheapest first.",
      top: React.createElement(PreorderMarketplaces, { region: "au", productName: "Delta Reign Booster Box", tcgplayer: null }),
    }),
  );
  const t = text(html);
  const firstRow = html.indexOf("data-offer-row");
  assert.ok(html.indexOf('data-ad="preorders-ebay"') < firstRow && html.indexOf("tcgplayer.com") < firstRow, "the marketplaces sit above every store row");
  const rows = [...html.matchAll(/<li data-offer-row=""[\s\S]*?<\/li>/g)].map((m) => text(m[0]));
  assert.deepEqual(
    rows.map((r) => /^\s*(\d+)\./.exec(r)?.[1] ?? "-"),
    ["1", "2", "3", "-", "-"],
  );
  assert.match(rows[0], /Pokebox/);
  assert.match(rows[0], /Cheapest store/);
  assert.equal((t.match(/Cheapest store/g) ?? []).length, 1);
  assert.doesNotMatch(t, /Best (?:store )?price/);
  const prices = rows.slice(0, 3).map((r) => Number(/A\$([\d.,]+)/.exec(r)![1].replace(/,/g, "")));
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b), "ascending");
  for (const a of anchors(html).filter((x) => /example\/p/.test(x.href))) assert.equal(a.rel, "nofollow noopener", "store links stay plain");
  assert.match(t, /Stores only: open pre-orders first, cheapest first\./);
  assert.ok(!rows.some((r) => /TCGplayer/.test(r)), "TCGplayer is not in the store ranking");
  // The product page's table, without the new props, is as it was: no numbers, "Best price".
  const product = quiet(React.createElement(OfferTable, { offers: stores, region: "au", preorder: false }));
  assert.doesNotMatch(product, /aria-label="Number|Cheapest store/);
  assert.match(text(product), /Best (?:store )?price/);
  assert.match(text(product), /In stock first, then cheapest\./);
});

test("the page: marketplaces on top of every product, the stores numbered under placement 'preorders', the summary strip, PreOrder kept", () => {
  const page = src("src/app/[region]/preorders/[set]/page.tsx");
  assert.match(page, /<PreorderMarketplaces region=\{r\.region\}/);
  assert.match(page, /offers=\{stores\}/);
  assert.match(page, /const stores = storeOffers\(g\.offers, now\)/);
  assert.match(page, /numbered\s/);
  assert.match(page, /bestLabel=\{\{ short: "Cheapest", full: "Cheapest store" \}\}/);
  assert.match(page, /placement="preorders"/);
  assert.match(page, /<SummaryStrip /);
  assert.match(page, /storesInMarket\(r\.market\)\.length/);
  assert.match(page, /setStoreReach\(set\.code\)/);
  assert.match(page, /pre && !us \? setMarketplaceOffers\(set\.code\)/, "the US$ TCGplayer offers are read only outside the US");
  assert.match(page, /schema\.org\/PreOrder/);
  assert.doesNotMatch(page, /schema\.org\/InStock/);
  assert.match(DEPLOY, /`preorders-ebay`/);
  assert.match(DEPLOY, /`preorders-tcgplayer`/);
});
const DEPLOY = readFileSync(new URL("../DEPLOY.md", import.meta.url), "utf8");

test("the new reads run on the public data files alone: the set's TCGplayer offers and its reach by store", async () => {
  const T0 = new Date("2026-10-15T23:18:41.716Z");
  const [au1, au2, ca1] = [STORES.find((x) => x.market === "AU")!, STORES.filter((x) => x.market === "AU")[1], STORES.find((x) => x.market === "CA")!];
  const tables: Tables = {
    Product: [
      { id: "p1", groupKey: "me6|booster-box", slug: "delta-reign-booster-box", name: "Delta Reign Booster Box", productType: "Booster Box", setCode: "me6", imageUrl: null, createdAt: T0 },
      { id: "p2", groupKey: "me6|etb", slug: "delta-reign-elite-trainer-box", name: "Delta Reign Elite Trainer Box", productType: "Elite Trainer Box", setCode: "me6", imageUrl: null, createdAt: T0 },
      { id: "p3", groupKey: "me5|booster-box", slug: "pitch-black-booster-box", name: "Pitch Black Booster Box", productType: "Booster Box", setCode: "me5", imageUrl: null, createdAt: T0 },
    ],
    Offer: [
      { id: "o1", productId: "p1", store: "tcgplayer", market: "US", title: "Delta Reign Booster Box", url: "https://www.tcgplayer.com/product/1", priceCents: 24494, inStock: true, imageUrl: null, lastSeen: T0 },
      { id: "o2", productId: "p1", store: au1.key, market: "AU", title: "DR box", url: "https://a/1", priceCents: 33500, inStock: true, imageUrl: null, lastSeen: T0 },
      { id: "o3", productId: "p2", store: au1.key, market: "AU", title: "DR etb", url: "https://a/2", priceCents: 16999, inStock: true, imageUrl: null, lastSeen: T0 },
      { id: "o4", productId: "p2", store: au2.key, market: "AU", title: "DR etb", url: "https://b/2", priceCents: 17999, inStock: false, imageUrl: null, lastSeen: T0 },
      { id: "o5", productId: "p1", store: ca1.key, market: "CA", title: "DR box", url: "https://c/1", priceCents: 27999, inStock: true, imageUrl: null, lastSeen: T0 },
      { id: "o6", productId: "p3", store: "tcgplayer", market: "US", title: "PB box", url: "https://www.tcgplayer.com/product/3", priceCents: 15049, inStock: true, imageUrl: null, lastSeen: T0 },
    ],
    ProductStat: [],
    StoreStat: [],
    EbayListing: [],
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dex-preorders-"));
  for (const [name, body] of buildPublicFiles(tables, { generatedAt: T0, source: "test" })) fs.writeFileSync(path.join(dir, name), body);
  const saved = { PUBLIC_DATA_MODE: process.env.PUBLIC_DATA_MODE, PUBLIC_DATA_DIR: process.env.PUBLIC_DATA_DIR, DATABASE_URL: process.env.DATABASE_URL, DC2: process.env.DC2 };
  Object.assign(process.env, { PUBLIC_DATA_MODE: "files", PUBLIC_DATA_DIR: dir, DATABASE_URL: "postgresql://nobody:nothing@127.0.0.1:1/none" });
  delete process.env.SEALED_DATABASE_URL;
  resetPublicData();
  try {
    const { setMarketplaceOffers, setStoreReach } = await import("../src/lib/data");
    const tcg = await setMarketplaceOffers("me6");
    assert.deepEqual([...tcg.keys()], ["delta-reign-booster-box"], "the set's TCGplayer offers only, by slug");
    assert.equal(tcg.get("delta-reign-booster-box")!.priceCents, 24494);
    assert.equal(tcg.get("delta-reign-booster-box")!.lastSeen, T0.toISOString());
    assert.deepEqual(await setStoreReach("me6"), { stores: 3, markets: 2 }, "distinct stores (never TCGplayer) in two markets");
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetPublicData();
  }
});
