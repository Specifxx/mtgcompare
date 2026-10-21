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
const cel30 = SET_BY_CODE.get("cel30")!;

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

/** Every <a> of the markup whose href is a highlight's (customid dex-<region>-hot-<surface>), with its rel. */
function hotLinks(html: string): { href: string; rel: string; text: string }[] {
  const out: { href: string; rel: string; text: string }[] = [];
  for (const m of html.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)) {
    const href = /href="([^"]*)"/.exec(m[1])?.[1]?.replace(/&amp;/g, "&") ?? "";
    if (!/customid=dex-[a-z]+-hot-/.test(href)) continue;
    out.push({ href, rel: /rel="([^"]*)"/.exec(m[1])?.[1] ?? "", text: m[2].replace(/<[^>]+>/g, "").trim() });
  }
  return out;
}

test("one hot placement per surface (home, set, product), each a tagged search with the campaign id in every region", () => {
  for (const p of ["hot-home", "hot-set", "hot-product"] as const) {
    assert.ok((PLACEMENTS as readonly string[]).includes(p), p);
    for (const r of REGION_LIST) {
      const u = new URL(ebaySearchUrl(hotSetQuery(cel30), r.region, p));
      assert.equal(u.searchParams.get("campid"), EBAY_CAMPAIGN_ID, r.region);
      assert.equal(u.searchParams.get("customid"), `dex-${r.region}-${p}`);
      assert.equal(u.searchParams.get("mkevt"), "1");
    }
  }
  assert.equal(hotPlacement("listings-home-sealed"), "hot-home");
  assert.equal(hotPlacement("listings-set"), "hot-set");
  assert.equal(hotPlacement("listings-product"), "hot-product");
  assert.equal(hotPlacement("listings-product-soldout"), "hot-product");
});

test("a hot set's search: 'Pokemon' + its eBay keyword (30th Celebration is '30th', so '30th Anniversary' listings match too), + 'sealed'", () => {
  assert.equal(hotSetQuery(cel30), "Pokemon 30th");
  const q = (code: string) => new URL(ebaySearchUrl(hotSetQuery(SET_BY_CODE.get(code)!), "us", "hot-set")).searchParams.get("_nkw");
  assert.equal(q("cel30"), "Pokemon 30th sealed");
  assert.equal(q("sv3pt5"), "Pokemon 151 sealed");
  assert.equal(q("sv8pt5"), "Pokemon Prismatic Evolutions sealed", "any other hot set by its name");
  for (const code of HOT_SETS) assert.ok(SET_BY_CODE.has(code), `${code} is a set in sets.ts`);
});

test("only a hot set that is out gets a highlight; the home page's is the most wanted one that is out", () => {
  assert.deepEqual(hotSetHighlight(cel30, TODAY), { label: "Shop 30th Celebration on eBay", query: "Pokemon 30th" });
  assert.equal(isHotSet("sv1"), false);
  assert.equal(hotSetHighlight(SET_BY_CODE.get("sv1"), TODAY), undefined, "not a hot set");
  assert.equal(hotSetHighlight(null, TODAY), undefined);
  // 30th Celebration came out on 2026-09-16: before then it is a pre-order set and gets nothing, as in the importer.
  const before = new Date("2026-09-01T00:00:00Z");
  assert.equal(isHotReleased("cel30", before), false);
  assert.equal(hotSetHighlight(cel30, before), undefined);
  assert.equal(isHotReleased("cel30", TODAY), true);
  assert.equal(isHotReleased(null, TODAY), false);
  assert.equal(firstHotSet(TODAY)?.code, "cel30");
  assert.equal(firstHotSet(before)?.code, "me5", "the next hot set that was out");
  // a product's button names it (cut at about 40 characters): "Shop this" would point at the type's tiles when its own are missing
  assert.deepEqual(hotProductHighlight("30th Celebration Booster Bundle", "q"), { label: "Shop 30th Celebration Booster Bundle on eBay", query: "q" });
  assert.equal(hotProductHighlight("30th Celebration Pokémon Center Elite Trainer Box", "q").label, "Shop 30th Celebration Pokémon Center Elite T… on eBay");
});

test("the strip's server markup (loading): the highlight is the CTA's one visible button, and the invisible reserved box holds it too (same height when the strip replaces it)", () => {
  const highlight = hotSetHighlight(cel30, TODAY)!;
  const html = render(React.createElement(EbayStrip, { region: "us", context: "sealed", placement: "listings-home-sealed", search: { kind: "sealed", query: "" }, highlight }));
  const links = hotLinks(html);
  assert.equal(links.length, 2, "one in the visible CTA, one in the reserved box");
  for (const l of links) {
    assert.equal(l.rel, REL_SPONSORED);
    assert.equal(l.text, "Shop 30th Celebration on eBay ↗");
    const u = new URL(l.href);
    assert.equal(u.hostname, "www.ebay.com");
    assert.equal(u.searchParams.get("campid"), EBAY_CAMPAIGN_ID);
    assert.equal(u.searchParams.get("_nkw"), "Pokemon 30th sealed");
    assert.equal(u.searchParams.get("customid"), "dex-us-hot-home", "the home page's own placement");
  }
  assert.ok(html.indexOf('aria-hidden="true" class="ad-box invisible') < html.indexOf("Shop 30th Celebration"), "the first copy is inside the invisible box");
  assert.match(html, /min-h-11/, "a 44 px tap target");
  assert.match(html, /data-state="cta"[\s\S]*>Ad</, "still labelled Ad");
  assert.doesNotMatch(html, /Search Pok[ée]mon sealed on eBay/, "the CTA's button is the highlight, not a second search");
  // Without a highlight nothing changes.
  const plain = render(React.createElement(EbayStrip, { region: "us", context: "sealed", placement: "listings-home-sealed", search: { kind: "sealed", query: "" } }));
  assert.equal(hotLinks(plain).length, 0);
  assert.match(plain, /Search Pokémon sealed on eBay/);
});

test("the compact CTA with a highlight: its words, its search, placement hot-product, labelled Ad; the label wraps, never truncates", () => {
  const html = render(React.createElement(EbayCta, { region: "uk", placement: "listings-product", search: { kind: "sealed", query: "x", label: "Search this product on eBay" }, highlight: hotProductHighlight("30th Celebration Sylveon ex Box", "30th Celebration Sylveon ex Box") }));
  const [l, ...rest] = hotLinks(html);
  assert.equal(rest.length, 0);
  assert.equal(l.text, "Shop 30th Celebration Sylveon ex Box on eBay ↗");
  assert.equal(new URL(l.href).searchParams.get("customid"), "dex-uk-hot-product");
  assert.doesNotMatch(html, /<span class="truncate">Shop /);
  assert.equal(new URL(l.href).hostname, "www.ebay.co.uk");
  assert.equal(new URL(l.href).searchParams.get("_nkw"), "Pokemon 30th Celebration Sylveon ex Box sealed");
  assert.doesNotMatch(html, /Search this product on eBay/);
  assert.match(html, /data-ad="listings-product"/);
  assert.match(html, />Ad</);
});

test("a set page's button: a hot set keeps hot-set, any other released set gets 'Shop <set> sealed on eBay' (set-sealed), a pre-order set none", () => {
  const sv1 = SET_BY_CODE.get("sv1")!;
  assert.equal(isHotSet("sv1"), false);
  assert.deepEqual(setSealedHighlight(sv1, TODAY), { label: "Shop Scarlet & Violet sealed on eBay", query: "Pokemon Scarlet & Violet", placement: "set-sealed" });
  assert.deepEqual(setSealedHighlight(cel30, TODAY), hotSetHighlight(cel30, TODAY), "a hot set that is out: its hot-set button, unchanged");
  assert.equal(setSealedHighlight(cel30, TODAY)?.placement, undefined, "the strip picks hot-set for it (hotPlacement)");
  const me6 = SET_BY_CODE.get("me6")!; // Delta Reign, out 2026-11-06
  assert.equal(setSealedHighlight(me6, TODAY), undefined, "not out yet: no button, as in the importer");
  assert.equal(setSealedHighlight(cel30, new Date("2026-09-01T00:00:00Z")), undefined, "a hot set before release: none either");
  assert.equal(setSealedHighlight(null, TODAY), undefined);
  // In the strip (the set page's own props): the reserved box and the CTA each hold it, under set-sealed, a sealed search, labelled Ad.
  const html = render(
    React.createElement(EbayStrip, {
      region: "us",
      context: `set:${sv1.slug}`,
      placement: "listings-set",
      search: { kind: "card", query: `${sv1.name} special illustration rare`, label: `Search ${sv1.name} on eBay` },
      highlight: setSealedHighlight(sv1, TODAY),
    }),
  );
  const links = [...html.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)]
    .map((m) => ({ href: (/href="([^"]*)"/.exec(m[1])?.[1] ?? "").replace(/&amp;/g, "&"), rel: /rel="([^"]*)"/.exec(m[1])?.[1] ?? "", text: m[2].replace(/<[^>]+>/g, "").trim() }))
    .filter((l) => /customid=dex-us-set-sealed\b/.test(l.href));
  assert.equal(links.length, 2, "one in the visible CTA, one in the reserved box");
  for (const l of links) {
    assert.equal(l.rel, REL_SPONSORED);
    assert.equal(l.text, "Shop Scarlet &amp; Violet sealed on eBay ↗");
    const u = new URL(l.href);
    assert.equal(u.searchParams.get("_nkw"), "Pokemon Scarlet & Violet sealed");
    assert.equal(u.searchParams.get("campid"), EBAY_CAMPAIGN_ID);
  }
  assert.equal(hotLinks(html).length, 0, "not a hot placement");
  assert.doesNotMatch(html, /Search Scarlet &amp; Violet on eBay/, "the CTA's button is the highlight");
  assert.match(html, /data-state="cta"[\s\S]*>Ad</, "still labelled Ad");
  assert.ok((PLACEMENTS as readonly string[]).includes("set-sealed"));
});

test("the marketplace panel: eBay's row is always eBay's blue button (every product), and a popular product's 'Popular set' chip sits OUTSIDE the ad link", () => {
  const props = { region: "us" as const, productName: "30th Celebration Sylveon ex Box", preorder: false, tcgplayer: null };
  const hot = render(React.createElement(MarketplacePanel, { ...props, popular: true }));
  assert.match(hot, /Popular set/);
  assert.match(hot, /class="[^"]*bg-brand-soft[^"]*text-brand-strong[^"]*">Popular set</, "the AA-contrast chip (brand-strong on brand-soft)");
  for (const m of hot.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)) assert.doesNotMatch(m[1], /Popular/, "never part of the ad link's text");
  const plain = render(React.createElement(MarketplacePanel, props));
  assert.doesNotMatch(plain, /Popular/);
  for (const html of [hot, plain, render(React.createElement(MarketplacePanel, { ...props, region: "nz" as const }))]) {
    assert.match(html, /class="btn-ad[^"]*"[^>]*>Search eBay/, "eBay's blue button on every panel");
    assert.match(html, /customid=dex-[a-z]+-product-marketplace/);
  }
});

test("the pages pass the highlight where the owner asked, and add no unit for it", () => {
  const src = (p: string) => readFileSync(new URL(`../src/app/[region]/${p}`, import.meta.url), "utf8");
  const home = src("page.tsx");
  assert.match(home, /placement="listings-home-sealed"[^\n]*highlight=\{hotHighlight\}/, "the home page's sealed strip");
  assert.doesNotMatch(home, /placement="listings-home" [^\n]*highlight=/, "not the chase strip under the stats");
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
