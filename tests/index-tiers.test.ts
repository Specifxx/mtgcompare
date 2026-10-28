// The indexing round (DexCompare 2026-10-25, ported 2026-10-28): which pages Google is asked to index, which the sitemap lists, and
// what is a real 404. Pure functions plus a few source checks on the pages that apply them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { regionSwitchFollow } from "../src/components/RegionSwitcher";
import { findBannedCopy } from "../src/lib/copy-rules";
import { prevNextSet } from "../src/lib/hub-copy";
import { HEADLINE_TYPES, listings, productInSitemap, productNoindex, productTier } from "../src/lib/index-tiers";
import { productFaq, type FaqInput } from "../src/lib/product-faq";
import { dealsThin, movesThin, packsThin } from "../src/lib/section-thin";
import { SETS } from "../src/lib/sets";
import { regionSitemap, staticSitemap } from "../src/lib/sitemap";
import { REGIONS } from "../src/lib/regions";

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const stat = (inStockStores: number, listedStores: number, marketplaceOpen = false) => ({ inStockStores, listedStores, marketplaceOpen });

test("product tiers: strong, middle, thin, from the import's counts", () => {
  assert.equal(listings(stat(0, 1, true)), 2, "a store and the marketplace are two listings");
  // thin: fewer than two listings
  assert.equal(productTier(stat(1, 1), "Tin"), "thin");
  assert.equal(productTier(stat(0, 0, true), "Play Booster Box"), "thin", "TCGplayer alone");
  assert.equal(productTier(stat(0, 1), "Play Booster Box"), "thin");
  // strong
  assert.equal(productTier(stat(2, 2), "Tin"), "strong");
  assert.equal(productTier(stat(1, 3), "Blister"), "strong");
  assert.equal(productTier(stat(0, 3), "Play Booster Box"), "strong", "a headline product listed by three stores, sold out");
  // middle
  assert.equal(productTier(stat(0, 3), "Blister"), "middle", "sold out, not a headline type");
  assert.equal(productTier(stat(1, 2), "Collection"), "middle");
  assert.equal(productTier(stat(0, 1, true), "Collection"), "middle", "one store and TCGplayer");
  for (const t of HEADLINE_TYPES) assert.equal(productTier(stat(0, 3), t), "strong", t);

  assert.equal(productNoindex(null, "Tin"), true, "no stats row here");
  assert.equal(productNoindex(stat(1, 1), "Tin"), true);
  assert.equal(productNoindex(stat(0, 2), "Tin"), false, "middle stays indexable");
  assert.equal(productInSitemap(stat(0, 2), "Tin"), false, "…but out of the sitemap");
  assert.equal(productInSitemap(stat(2, 2), "Tin"), true);
});

test("the product page's robots tag and hreflang set follow productNoindex", () => {
  const page = src("app/[region]/p/[slug]/page.tsx");
  assert.match(page, /const noindex = productNoindex\(loaded\.here, p\.productType\);/);
  assert.match(page, /return !productNoindex\(p\.stats\.find\(\(st\) => st\.market === x\.market\), p\.productType\);/);
});

test("the sitemap: strong products only; sets and types from three comparable products", () => {
  const route = src("app/sitemap.ts");
  assert.match(route, /productInSitemap\(r, r\.product\.productType\)/);
  assert.equal((route.match(/HAVING COUNT\(\*\) >= \$\{MIN_HUB_PRODUCTS\}/g) ?? []).length, 2);
  assert.match(route, /c >= MIN_HUB_PRODUCTS/);
  // regionSitemap itself lists what it is given
  const urls = regionSitemap(REGIONS.uk, { typeLabels: [], setCodes: [], productSlugs: ["a"], lastmod: null }).map((e) => e.url);
  assert.deepEqual(urls, ["https://mtgcompare.app/uk/p/a"]);
});

test("thin section pages: noindex by the same rule the sitemap leaves them out by", () => {
  assert.equal(dealsThin(5, 5), true);
  assert.equal(dealsThin(6, 0), false);
  assert.equal(dealsThin(0, 6), false);
  assert.equal(packsThin(2), true);
  assert.equal(packsThin(3), false);
  assert.equal(movesThin(2), true);
  assert.equal(movesThin(3), false);
  assert.match(src("app/[region]/deals/page.tsx"), /noindex: dealsThin\(deals\.length, leaders\.top10\.length\)/);
  assert.match(src("app/[region]/cheapest-packs/page.tsx"), /noindex: packsThin\(leaders\.top10\.length\)/);
  assert.match(src("app/[region]/price-moves/page.tsx"), /noindex: movesThin\(data\.up\.length \+ data\.down\.length\)/);
  const all = staticSitemap({}, undefined, "2026-10-25").map((e) => e.url);
  const some = staticSitemap({}, undefined, "2026-10-25", { uk: ["/price-moves", "/deals"], eu: ["/cheapest-packs"] }).map((e) => e.url);
  const gone = all.filter((u) => !some.includes(u));
  assert.deepEqual(gone.sort(), ["https://mtgcompare.app/eu/cheapest-packs", "https://mtgcompare.app/uk/deals", "https://mtgcompare.app/uk/price-moves"]);
});

test("empty set and type pages are real 404s, never an empty 200", () => {
  const set = src("app/[region]/sets/[set]/page.tsx");
  assert.equal((set.match(/if \(!products\.length\) notFound\(\);/g) ?? []).length, 2, "generateMetadata and the page");
  assert.doesNotMatch(set, /noindex: products\.length === 0/);
  const type = src("app/[region]/type/[type]/page.tsx");
  assert.equal((type.match(/if \(!total\) notFound\(\);/g) ?? []).length, 2);
  assert.match(type, /listedTypes\.has\(x\.label\)/, "the type row links only types listed here");
});

test("prevNextSet skips sets the region lists nothing of", () => {
  const i = 5;
  const code = SETS[i].code;
  assert.equal(prevNextSet(code).prev?.code, SETS[i + 1].code);
  const skip = new Set([SETS[i + 1].code, SETS[i - 1].code]);
  const { prev, next } = prevNextSet(code, (c) => !skip.has(c));
  assert.equal(prev?.code, SETS[i + 2].code);
  assert.equal(next?.code, SETS[i - 2].code);
  assert.deepEqual(prevNextSet(code, () => false), { prev: null, next: null });
});

test("the region switcher follows links to pages every region has, nofollow to the rest", () => {
  assert.equal(regionSwitchFollow("/au", "au"), true);
  assert.equal(regionSwitchFollow("/au/deals", "au"), true);
  assert.equal(regionSwitchFollow("/au/p/some-box", "au"), false);
  assert.equal(regionSwitchFollow("/au/sets/pitch-black", "au"), false);
  assert.equal(regionSwitchFollow("/about", null), true, "no region: the links go to region homes");
  // A soft page (no region of its own, showing the visitor's) judges its links as a page with no region.
  assert.match(src("components/RegionSwitcher.tsx"), /rel=\{r\.region !== region && !regionSwitchFollow\(pathname, soft \? null : region\) \? "nofollow" : undefined\}/);
  assert.match(src("components/MobileMenu.tsx"), /const from = soft \? null : region;[\s\S]*rel=\{!on && !regionSwitchFollow\(pathname, from\) \? "nofollow" : undefined\}/);
});

const base: FaqInput = {
  heading: "Magic: The Gathering Test Play Booster Box",
  market: "AU",
  inName: "Australia",
  adjective: "Australian",
  preorder: false,
  here: stat(3, 8),
  cheapest: { cents: 7995, storeName: "Shop A", marketplace: false },
  packs: 9,
  history: [],
  elsewhere: [
    { name: "United States", market: "US", inStockStores: 4, marketplaceOpen: true, lowestPriceCents: 4999 },
    { name: "Canada", market: "CA", inStockStores: 0, marketplaceOpen: false, lowestPriceCents: null },
  ],
};

test("product FAQ: answers from the page's data only, none without data, nothing banned", () => {
  const faq = productFaq(base);
  assert.deepEqual(
    faq.map((f) => f.q),
    ["Is Magic: The Gathering Test Play Booster Box in stock in Australia?", "How much is Magic: The Gathering Test Play Booster Box per booster pack?", "How much is Magic: The Gathering Test Play Booster Box in other regions?"],
    "no history question under MIN_DAYS of prices",
  );
  assert.match(faq[0].a, /^Yes: 3 of the 8 Australian stores we track that list it have it in stock at our latest check, the cheapest at A\$79\.95 at Shop A\./);
  assert.match(faq[1].a, /9 booster packs.*A\$8\.88 a pack/);
  assert.match(faq[2].a, /United States \$49\.99 \(in stock at 4 stores\)/);
  assert.match(faq[2].a, /Sold out at the stores we track in Canada\./);

  const days = Array.from({ length: 10 }, (_, i) => ({ day: 20380 + i, cents: i === 4 ? null : 8000 - i * 10, stores: i === 4 ? 0 : 3 }));
  const withHistory = productFaq({ ...base, history: days });
  const h = withHistory.find((f) => /cost recently/.test(f.q))!;
  assert.match(h.a, /over the last 10 days.*ranged from A\$79\.10 .* to A\$80\.00 .*median of/);
  assert.match(h.a, /On 1 day no store had it in stock\./);

  const sold = productFaq({ ...base, here: stat(0, 2), cheapest: null, elsewhere: [] });
  assert.equal(sold.length, 1);
  assert.match(sold[0].a, /^Not at our latest check: all 2 Australian stores that list it are sold out\./);
  assert.equal(productFaq({ ...base, here: null, cheapest: null, packs: null, elsewhere: [] }).length, 0);

  for (const f of [...withHistory, ...sold, ...productFaq({ ...base, preorder: true })]) {
    assert.equal(findBannedCopy(`${f.q} ${f.a}`), null, f.a);
  }
});

test("internal links: every listed set from the region home, set-less strong products from their type page", () => {
  const home = src("app/[region]/page.tsx");
  assert.match(home, /<SetIndex r=\{r\} counts=\{setCounts\} types=\{listedTypes\} \/>/);
  const idx = src("components/SetIndex.tsx");
  assert.match(idx, /if \(!n\) continue;/, "only sets listed here (an empty set page is a 404)");
  const type = src("app/[region]/type/[type]/page.tsx");
  assert.match(type, /typeIndexRows\(r\.market, t\.label\)/);
  assert.match(type, /indexAll\.filter\(\(x\) => !shown\.has\(x\.slug\)\)/);
  const hub = src("lib/hub-data.ts");
  assert.match(hub, /p\.setCode == null/);
  assert.match(hub, /\.filter\(\(r\) => productInSitemap\(r, label\)\)/, "strong products only");
});
