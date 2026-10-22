// The highlighted eBay button of a popular product or set (lib/popular.ts, components/Ebay.tsx, EbayStrip `highlight`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EBAY_CAMPAIGN_ID, ebaySearchUrl, PLACEMENTS, REL_SPONSORED } from "../src/lib/affiliate";
import { HOT_SETS, isHotSet } from "../src/lib/popular";
import { REGION_LIST } from "../src/lib/regions";
import { SET_BY_CODE } from "../src/lib/sets";
import { firstHotSet, hotProductHighlight, hotSetHighlight, hotSetQuery, isHotReleased, setSealedHighlight } from "../src/components/Ebay";
import { EbayCta, EbayStrip, hotPlacement } from "../src/components/EbayStrip";
import { MarketplacePanel } from "../src/components/Marketplaces";

// The components are compiled with the classic JSX runtime here (tsconfig "jsx": "preserve"; Next uses its own).
(globalThis as unknown as { React: typeof React }).React = React;

const TODAY = new Date("2026-10-11T12:00:00Z");
const hob = SET_BY_CODE.get("hob")!;
const fra = SET_BY_CODE.get("fra")!;

/** Server markup, without React's "useLayoutEffect does nothing on the server" warning (the strip's scroll compensation). */
function render(el: React.ReactElement): string {
  const err = console.error;
  console.error = () => {};
  try {
    return renderToStaticMarkup(el);
  } finally {
    console.error = err;
  }
}

/** Every <a> of the markup whose href is a highlight's (customid mtg-<region>-hot-<surface>), with its rel. */
function hotLinks(html: string): { href: string; rel: string; text: string }[] {
  const out: { href: string; rel: string; text: string }[] = [];
  for (const m of html.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)) {
    const href = /href="([^"]*)"/.exec(m[1])?.[1]?.replace(/&amp;/g, "&") ?? "";
    if (!/customid=mtg-[a-z]+-hot-/.test(href)) continue;
    out.push({ href, rel: /rel="([^"]*)"/.exec(m[1])?.[1] ?? "", text: m[2].replace(/<[^>]+>/g, "").trim() });
  }
  return out;
}

test("one hot placement per surface (home, set, product), each a tagged search with the campaign id in every region", () => {
  for (const p of ["hot-home", "hot-set", "hot-product"] as const) {
    assert.ok((PLACEMENTS as readonly string[]).includes(p), p);
    for (const r of REGION_LIST) {
      const u = new URL(ebaySearchUrl(hotSetQuery(hob), r.region, p));
      assert.equal(u.searchParams.get("campid"), EBAY_CAMPAIGN_ID, r.region);
      assert.equal(u.searchParams.get("customid"), `mtg-${r.region}-${p}`);
      assert.equal(u.searchParams.get("mkevt"), "1");
    }
  }
  assert.equal(hotPlacement("listings-home-sealed"), "hot-home");
  assert.equal(hotPlacement("listings-set"), "hot-set");
  assert.equal(hotPlacement("listings-product"), "hot-product");
  assert.equal(hotPlacement("listings-product-soldout"), "hot-product");
});

test("a hot set's search: 'MTG' + its eBay keyword (The Hobbit is 'Hobbit', so 'LOTR Hobbit' listings match too), + 'sealed'", () => {
  assert.equal(hotSetQuery(hob), "MTG Hobbit");
  const q = (code: string) => new URL(ebaySearchUrl(hotSetQuery(SET_BY_CODE.get(code)!), "us", "hot-set")).searchParams.get("_nkw");
  assert.equal(q("hob"), "MTG Hobbit sealed");
  assert.equal(q("tla"), "MTG Avatar sealed");
  assert.equal(q("fra"), "MTG Reality Fracture sealed", "any other hot set by its name");
  assert.equal(HOT_SETS[0], "trk", "Star Trek is the most wanted");
  for (const code of HOT_SETS) assert.ok(SET_BY_CODE.has(code), `${code} is a set in sets.ts`);
});

test("only a hot set that is out gets a highlight; the home page's is the most wanted one that is out", () => {
  assert.deepEqual(hotSetHighlight(hob, TODAY), { label: "Shop The Hobbit on eBay", query: "MTG Hobbit" });
  assert.equal(isHotSet("blb"), false);
  assert.equal(hotSetHighlight(SET_BY_CODE.get("blb"), TODAY), undefined, "not a hot set");
  assert.equal(hotSetHighlight(null, TODAY), undefined);
  // Reality Fracture came out on 2026-10-02: before then it is a pre-order set and gets nothing, as in the importer; Star Trek
  // (2026-11-13, the most wanted) is not out on TODAY.
  const before = new Date("2026-09-01T00:00:00Z");
  assert.equal(isHotReleased("fra", before), false);
  assert.equal(hotSetHighlight(fra, before), undefined);
  assert.equal(isHotReleased("fra", TODAY), true);
  assert.equal(isHotReleased("trk", TODAY), false);
  assert.equal(isHotReleased(null, TODAY), false);
  assert.equal(firstHotSet(TODAY)?.code, "fra");
  assert.equal(firstHotSet(before)?.code, "hob", "the next hot set that was out");
  assert.equal(firstHotSet(new Date("2026-11-20T00:00:00Z"))?.code, "trk");
  // a product's button names it (cut at about 40 characters): "Shop this" would point at the type's tiles when its own are missing
  assert.deepEqual(hotProductHighlight("The Hobbit Play Booster Box", "q"), { label: "Shop The Hobbit Play Booster Box on eBay", query: "q" });
  assert.equal(hotProductHighlight("Reality Fracture Collector Booster Box Case", "q").label, "Shop Reality Fracture Collector Booster Box… on eBay");
});

test("the strip's server markup (loading): the highlight is the CTA's one visible button, and the invisible reserved box holds it too (same height when the strip replaces it)", () => {
  const highlight = hotSetHighlight(hob, TODAY)!;
  const html = render(React.createElement(EbayStrip, { region: "us", context: "sealed", placement: "listings-home-sealed", search: { kind: "sealed", query: "" }, highlight }));
  const links = hotLinks(html);
  assert.equal(links.length, 2, "one in the visible CTA, one in the reserved box");
  for (const l of links) {
    assert.equal(l.rel, REL_SPONSORED);
    assert.equal(l.text, "Shop The Hobbit on eBay ↗");
    const u = new URL(l.href);
    assert.equal(u.hostname, "www.ebay.com");
    assert.equal(u.searchParams.get("campid"), EBAY_CAMPAIGN_ID);
    assert.equal(u.searchParams.get("_nkw"), "MTG Hobbit sealed");
    assert.equal(u.searchParams.get("customid"), "mtg-us-hot-home", "the home page's own placement");
  }
  assert.ok(html.indexOf('aria-hidden="true" class="ad-box invisible') < html.indexOf("Shop The Hobbit"), "the first copy is inside the invisible box");
  assert.match(html, /min-h-11/, "a 44 px tap target");
  assert.match(html, /data-state="cta"[\s\S]*>Ad</, "still labelled Ad");
  assert.doesNotMatch(html, /Search Magic sealed on eBay/, "the CTA's button is the highlight, not a second search");
  // Without a highlight nothing changes.
  const plain = render(React.createElement(EbayStrip, { region: "us", context: "sealed", placement: "listings-home-sealed", search: { kind: "sealed", query: "" } }));
  assert.equal(hotLinks(plain).length, 0);
  assert.match(plain, /Search Magic sealed on eBay/);
});

test("the compact CTA with a highlight: its words, its search, placement hot-product, labelled Ad; the label wraps, never truncates", () => {
  const html = render(React.createElement(EbayCta, { region: "uk", placement: "listings-product", search: { kind: "sealed", query: "x", label: "Search this product on eBay" }, highlight: hotProductHighlight("Hobbit Commander Deck", "Hobbit Commander Deck") }));
  const [l, ...rest] = hotLinks(html);
  assert.equal(rest.length, 0);
  assert.equal(l.text, "Shop Hobbit Commander Deck on eBay ↗");
  assert.equal(new URL(l.href).searchParams.get("customid"), "mtg-uk-hot-product");
  assert.doesNotMatch(html, /<span class="truncate">Shop /);
  assert.equal(new URL(l.href).hostname, "www.ebay.co.uk");
  assert.equal(new URL(l.href).searchParams.get("_nkw"), "MTG Hobbit Commander Deck sealed");
  assert.doesNotMatch(html, /Search this product on eBay/);
  assert.match(html, /data-ad="listings-product"/);
  assert.match(html, />Ad</);
});

test("a set page's button: a hot set keeps hot-set, any other released set gets 'Shop <set> sealed on eBay' (set-sealed), a pre-order set none", () => {
  const sv1 = SET_BY_CODE.get("tdm")!;
  assert.equal(isHotSet("tdm"), false);
  assert.deepEqual(setSealedHighlight(sv1, TODAY), { label: "Shop Tarkir: Dragonstorm sealed on eBay", query: "MTG Tarkir: Dragonstorm", placement: "set-sealed" });
  assert.deepEqual(setSealedHighlight(hob, TODAY), hotSetHighlight(hob, TODAY), "a hot set that is out: its hot-set button, unchanged");
  assert.equal(setSealedHighlight(hob, TODAY)?.placement, undefined, "the strip picks hot-set for it (hotPlacement)");
  const trk = SET_BY_CODE.get("trk")!; // Star Trek, out 2026-11-13
  assert.equal(setSealedHighlight(trk, TODAY), undefined, "not out yet: no button, as in the importer");
  assert.equal(setSealedHighlight(fra, new Date("2026-09-01T00:00:00Z")), undefined, "a hot set before release: none either");
  assert.equal(setSealedHighlight(null, TODAY), undefined);
  // In the strip (the set page's own props): the reserved box and the CTA each hold it, under set-sealed, a sealed search, labelled Ad.
  const html = render(
    React.createElement(EbayStrip, {
      region: "us",
      context: `set:${sv1.slug}`,
      placement: "listings-set",
      search: { kind: "sealed", query: sv1.name, label: `Search ${sv1.name} on eBay` },
      highlight: setSealedHighlight(sv1, TODAY),
    }),
  );
  const links = [...html.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)]
    .map((m) => ({ href: (/href="([^"]*)"/.exec(m[1])?.[1] ?? "").replace(/&amp;/g, "&"), rel: /rel="([^"]*)"/.exec(m[1])?.[1] ?? "", text: m[2].replace(/<[^>]+>/g, "").trim() }))
    .filter((l) => /customid=mtg-us-set-sealed\b/.test(l.href));
  assert.equal(links.length, 2, "one in the visible CTA, one in the reserved box");
  for (const l of links) {
    assert.equal(l.rel, REL_SPONSORED);
    assert.equal(l.text, "Shop Tarkir: Dragonstorm sealed on eBay ↗");
    const u = new URL(l.href);
    assert.equal(u.searchParams.get("_nkw"), "MTG Tarkir: Dragonstorm sealed");
    assert.equal(u.searchParams.get("campid"), EBAY_CAMPAIGN_ID);
  }
  assert.equal(hotLinks(html).length, 0, "not a hot placement");
  assert.doesNotMatch(html, /Search Tarkir: Dragonstorm on eBay/, "the CTA's button is the highlight");
  assert.match(html, /data-state="cta"[\s\S]*>Ad</, "still labelled Ad");
  assert.ok((PLACEMENTS as readonly string[]).includes("set-sealed"));
});

test("the marketplace panel: eBay's row is always eBay's blue button (every product), and a popular product's 'Popular set' chip sits OUTSIDE the ad link", () => {
  const props = { region: "us" as const, productName: "The Hobbit Play Booster Box", preorder: false, tcgplayer: null };
  const hot = render(React.createElement(MarketplacePanel, { ...props, popular: true }));
  assert.match(hot, /Popular set/);
  assert.match(hot, /class="[^"]*bg-brand-soft[^"]*text-brand-strong[^"]*">Popular set</, "the AA-contrast chip (brand-strong on brand-soft)");
  for (const m of hot.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)) assert.doesNotMatch(m[1], /Popular/, "never part of the ad link's text");
  const plain = render(React.createElement(MarketplacePanel, props));
  assert.doesNotMatch(plain, /Popular/);
  for (const html of [hot, plain, render(React.createElement(MarketplacePanel, { ...props, region: "nz" as const }))]) {
    assert.match(html, /class="btn-ad[^"]*"[^>]*>Search eBay/, "eBay's blue button on every panel");
    assert.match(html, /customid=mtg-[a-z]+-product-marketplace/);
  }
});

test("the pages pass the highlight where the owner asked, and add no unit for it", () => {
  const src = (p: string) => readFileSync(new URL(`../src/app/[region]/${p}`, import.meta.url), "utf8");
  const home = src("page.tsx");
  assert.match(home, /placement="listings-home-sealed"[^\n]*highlight=\{hotHighlight\}/, "the home page's sealed strip");
  assert.doesNotMatch(home, /placement="listings-home" [^\n]*highlight=/, "not the high-end (chase) strip under the stats");
  assert.match(home, /hotSetHighlight\(firstHotSet\(\)\)/);
  assert.match(src("sets/[set]/page.tsx"), /highlight=\{setSealedHighlight\(s\)\}/, "every released set's page: hot sets keep hot-set, the others get set-sealed");
  const product = src("p/[slug]/page.tsx");
  assert.match(product, /const hot = isHotReleased\(p\.setCode\)/);
  assert.doesNotMatch(product, /ebayPrimary/, "the panel's eBay row is a button on every product now");
  assert.match(product, /popular=\{hot\}/);
  assert.match(product, /highlight=\{hot \? hotProductHighlight\(p\.name, ebayQ\) : undefined\}/);
  assert.equal((product.match(/<EbayStrip/g) ?? []).length, 1, "still one strip on a product page");
  assert.equal((home.match(/<EbayStrip/g) ?? []).length, 2, "still two strips on the home page");
});
