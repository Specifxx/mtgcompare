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

test("Delta Reign: the dates The Pokémon Company announced", () => {
  const g = preorderGuide("me6");
  assert.ok(g);
  assert.equal(SET_BY_CODE.get("me6")?.releaseDate, "2026-11-06");
  assert.equal(g.prereleaseFrom, "2026-10-24");
  assert.equal(g.liveDate, "2026-11-05");
  assert.deepEqual(preorderGuideBySlug("delta-reign")?.set.code, "me6");
  assert.equal(preorderGuideBySlug("chaos-rising"), null, "no guide, no page");
  assert.equal(preorderGuideBySlug("no-such-set"), null);
  assert.equal(preorderPath("au", "me6"), "/au/preorders/delta-reign");
  assert.equal(preorderPath("au", "me4"), null);
  // The Build & Battle Box's list price is disputed (announcement vs lib/rrp.ts): not printed.
  assert.equal(guideShowsMsrp(g, "build-battle"), false);
  assert.equal(guideShowsMsrp(g, "booster-box"), true);
});

test("pre-order pages retire themselves on release day", () => {
  assert.deepEqual(
    openPreorderGuides("2026-10-14").map((x) => x.set.code),
    ["me6"],
  );
  assert.deepEqual(openPreorderGuides("2026-11-06"), [], "release day: no longer a pre-order");
  assert.equal(isPreorderSet("me6", new Date("2026-11-05T23:59:00Z")), true);
  assert.equal(isPreorderSet("me6", new Date("2026-11-06T00:00:00Z")), false);

  const before = new Set(staticSitemap({}, undefined, "2026-10-14").map((e) => e.url));
  for (const r of REGION_LIST) assert.ok(before.has(`${SITE_URL}/${r.region}/preorders/delta-reign`), r.region);
  const after = staticSitemap({}, undefined, "2026-11-06").map((e) => e.url);
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

// ─── The release-date content merged into the page (the growth pack's "Delta Reign release date" piece, 2026-10-16) ─────

const DR = preorderGuide("me6")!;
const DR_SET = SET_BY_CODE.get("me6")!;

test("Delta Reign: the set's make-up, the new card type, the prerelease and the notes are each attributed; nothing unconfirmed is printed", () => {
  assert.ok(DR.makeup.length >= 5);
  assert.match(DR.makeupSource, /PokéGuardian.*20 August 2026/);
  assert.ok(DR.makeup.some((m) => m.startsWith("4 Mega Evolution Pokémon ex")), "the four Mega ex");
  for (const h of DR.headliners) assert.ok(DR.makeup.join(" ").includes(h), h);
  assert.equal(DR.newFeature?.name, "Legendary Stadiums");
  assert.match(DR.newFeature!.source, /\d{4}/);
  assert.deepEqual(DR.prerelease?.promos, ["Masquerain", "Magmortar", "Enamorus", "Kommo-o"]);
  assert.match(DR.prerelease!.source, /ICv2, 1 October 2026/);
  for (const n of DR.notes) assert.match(n.source, /\d{4}$/, `${n.text}: dated`);
  const bb = DR.products.find((p) => p.type === "build-battle")!;
  assert.match(bb.contents, new RegExp(`^${packsFor("build-battle", "me6")} Delta Reign booster packs, a 40-card ready-to-play deck`), "pack count is packs.ts's");
  assert.ok(DR.sources.some((x) => x.url.startsWith("https://icv2.com/")), "ICv2 cited");
  assert.ok(DR.sources.some((x) => x.url.startsWith("https://press.pokemon.com/")), "TPCi's press site cited");
  assert.equal(DR.checked, "2026-10-16");
  const all = JSON.stringify(DR);
  assert.doesNotMatch(all, /\[VERIFY|\[live price|secret rare|18-pack|\$\d/i, "no unconfirmed claims and no typed prices");
});

test("Delta Reign page title and description: the pre-order prices AND the release date, in every region", () => {
  for (const r of REGION_LIST) {
    const t = titleText(preorderTitle(DR_SET, r, true));
    assert.match(t, /^Delta Reign pre-orders in /);
    assert.ok(t.includes(r.inName), `${r.region}: ${t}`);
    assert.match(t, /prices & release date$/);
    assert.ok(t.length <= 65, `${r.region}: ${t.length}`);
    const d = preorderDescription(DR_SET, DR, r, true);
    assert.ok(d.length <= 160, `${r.region}: description is ${d.length} characters`);
    assert.ok(d.includes(formatRelease(DR_SET.releaseDate)), d);
    assert.match(d, /prerelease from 24 October/);
    assert.ok(d.includes(r.currency) && d.includes(r.adjective), d);
    assert.equal(findBannedCopy(`${t} ${d}`), null);
  }
  assert.doesNotMatch(titleText(preorderTitle(DR_SET, REGIONS.au, false)), /pre-order/, "released: no pre-order title");
  assert.match(preorderDescription(DR_SET, DR, REGIONS.au, false), /released on 6 November 2026/);
});

test("the release date at a glance: release, prerelease, TCG Live and the set's size, from the guide and sets.ts", () => {
  const f = glanceFacts(DR_SET, DR);
  assert.deepEqual(
    f.map((x) => [x.key, x.iso ?? x.value]),
    [
      ["release", "2026-11-06"],
      ["prerelease", "2026-10-24"],
      ["live", "2026-11-05"],
      ["cards", "Over 135 cards"],
    ],
  );
  assert.match(f[1].note!, /Build & Battle Boxes, at participating Play! Pokémon stores/);
});

test("US per-pack list prices are rrp.ts ÷ packs.ts, US only, and never the Build & Battle Box's (disputed) or the Pokémon Center ETB's", () => {
  assert.deepEqual(msrpPerPack(DR_SET, DR, REGIONS.au), []);
  const rows = msrpPerPack(DR_SET, DR, REGIONS.us);
  assert.deepEqual(
    rows.map((x) => x.type),
    ["booster-box", "booster-bundle", "etb"],
  );
  for (const row of rows) {
    assert.equal(row.cents, usMsrpCents(row.type, "me6"));
    assert.equal(row.perPack, perPackCents(usMsrpCents(row.type, "me6"), packsFor(row.type, "me6")));
  }
  const sentence = msrpValueSentence(rows)!;
  const box = rows.find((x) => x.type === "booster-box")!;
  const etb = rows.find((x) => x.type === "etb")!;
  assert.ok(sentence.startsWith(`At US MSRP a pack costs ${money(box.perPack, "US")} in the booster box`), sentence);
  assert.ok(sentence.includes(`${money(etb.perPack, "US")} in the Elite Trainer Box`), sentence);
  assert.equal(msrpValueSentence([]), null);
});

test("the FAQ: the release date first, the prerelease kit, live cheapest pre-orders in the region's currency, US MSRP in the US only", () => {
  const cheapest = { "booster-box": 33500, etb: 16999 };
  for (const r of REGION_LIST) {
    const faqs = preorderFaqs(DR_SET, DR, r, cheapest, true);
    assert.match(faqs[0].q, /release date\?$/);
    assert.ok(faqs[0].a.startsWith(`Delta Reign releases on ${formatRelease("2026-11-06")} in English`), faqs[0].a);
    assert.match(faqs[0].a, /24 October 2026/);
    assert.match(faqs[0].a, /5 November 2026/);
    const pre = faqs.find((f) => /prerelease/.test(f.q))!;
    assert.match(pre.a, /a 40-card ready-to-play deck/);
    assert.match(pre.a, /Masquerain, Magmortar, Enamorus and Kommo-o \(ICv2, 1 October 2026\)/);
    const box = faqs.find((f) => /booster box cost/.test(f.q))!;
    assert.ok(box.a.includes(money(33500, r.market)), `${r.region}: live box price in ${r.currency}`);
    const etbQ = faqs.find((f) => /How much is the Delta Reign Elite Trainer Box/.test(f.q))!;
    assert.ok(etbQ.a.includes(money(16999, r.market)));
    const text = faqs.map((f) => `${f.q} ${f.a}`).join(" ");
    assert.equal(findBannedCopy(text), null, r.region);
    assert.ok(!text.includes(money(usMsrpCents("build-battle", "me6"), "US")), "the Build & Battle Box's MSRP is never printed");
    assert.doesNotMatch(text, /\$21\.99/);
    if (r.market === "US") {
      assert.ok(etbQ.a.includes(`US MSRP is ${money(usMsrpCents("etb", "me6"), "US")}`));
      assert.ok(box.a.includes(money(usMsrpCents("booster-box", "me6"), "US")));
    } else {
      assert.doesNotMatch(text, /MSRP|US list price/, `${r.region}: no US list price outside the US`);
      assert.match(etbQ.a, /publishes no list price outside the US/);
    }
    assert.equal(new Set(faqs.map((f) => f.q)).size, faqs.length, "unique questions");
  }
  // Nothing open: said plainly, never a made-up price.
  const none = preorderFaqs(DR_SET, DR, REGIONS.nz, {}, true).find((f) => /booster box cost/.test(f.q))!;
  assert.match(none.a, /No New Zealand store we track has the booster box open for pre-order right now/);
  // Released: past tense, and no live pre-order line.
  const after = preorderFaqs(DR_SET, DR, REGIONS.au, cheapest, false);
  assert.ok(after[0].a.startsWith("Delta Reign released on 6 November 2026"));
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
  { product: { name: "Delta Reign Booster Box", productType: "Booster Box", setCode: "me6" }, offers: BOX_OFFERS },
  { product: { name: "Delta Reign Elite Trainer Box", productType: "Elite Trainer Box", setCode: "me6" }, offers: [off("cherry", 16999), off("north", 15999), tcgOffer(8999)] },
  { product: { name: "Delta Reign Booster Bundle", productType: "Booster Bundle", setCode: "me6" }, offers: [tcgOffer(4999)] },
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
  assert.deepEqual(cheapestStoreByType(GROUPS, NOW), { "booster-box": 33500, etb: 15999 }, "a type only TCGplayer has open gets no store price");
});

test("the summary strip: stores checked (the registry), distinct stores taking pre-orders, the cheapest box at a store with per pack, days to release", () => {
  const s = preorderSummary(GROUPS, storesInMarket("AU").length, SET_BY_CODE.get("me6")!, "2026-10-16", NOW);
  assert.equal(s.storesChecked, STORES.filter((x) => x.market === "AU").length);
  assert.equal(s.taking, 4, "pokebox, cherry, zeta, north: distinct, open, never TCGplayer, never the sold-out or unchecked store");
  assert.deepEqual(s.cheapestBox, { cents: 33500, store: "Pokebox", perPack: perPackCents(33500, packsFor("booster-box", "me6")) });
  assert.equal(s.days, 21);
  assert.equal(preorderSummary([], 60, SET_BY_CODE.get("me6")!, "2026-10-16", NOW).cheapestBox, null);
  assert.equal(reachLine(DR_SET, { stores: 75, markets: 7 }), "Across all seven markets we compare, 75 stores list Delta Reign.");
  assert.equal(reachLine(DR_SET, { stores: 1, markets: 1 }), "Across the seven markets we compare, 1 store lists Delta Reign, in 1 of them.");
  assert.equal(reachLine(DR_SET, null), null);
  assert.equal(reachLine(DR_SET, { stores: 0, markets: 0 }), null);
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
    assert.equal(new URL(ebay.href).searchParams.get("customid"), `dex-${c.region}-preorders-ebay`);
    assert.equal(new URL(ebay.href).searchParams.get("LH_BIN"), "1");
    assert.match(new URL(ebay.href).searchParams.get("_nkw")!, /Delta Reign Booster Box sealed/);
    assert.match(ebay.text, /Search eBay/);
    assert.match(t, /not a price we checked/, "labelled a search, not a price");
    assert.match(html, /btn-ad/);
    assert.match(t, /\bAd\b/);
    assert.match(tcg.href, /^https:\/\/partner\.tcgplayer\.com\//);
    assert.match(decodeURIComponent(tcg.href), new RegExp(`sharedid=dex-${c.region}-preorders-tcgplayer`));
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
  delete process.env.DC2;
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
