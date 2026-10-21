import { test } from "node:test";
import assert from "node:assert/strict";
import {
  affiliateSubId,
  EBAY_CAMPAIGN_ID,
  ebayLabel,
  ebayRetailer,
  ebaySearchUrl,
  IMPACT_SITE_VERIFICATIONS,
  listingHref,
  offerLink,
  offerRetailer,
  PLACEMENTS,
  REL_SPONSORED,
  REL_STORE,
  searchTerms,
  TCGPLAYER_IMPACT_LINK,
  TCGPLAYER_KEY,
  tcgplayerAffiliateUrl,
  tcgplayerSearchUrl,
} from "../src/lib/affiliate";
import { readFileSync } from "node:fs";
import {
  creativeHref,
  creativeRetailer,
  EBAY_BANNER,
  isEbayHost,
  parseEbayBanner,
} from "../src/lib/affiliate";
import { FEED_EVERY, FEED_FIRST_INDEX, FEED_MAX, FEED_MIN_TAIL, FEED_PLACEMENTS, FEED_WIDE_MIN_TAIL, feedSlots, gridPageHasRoomForFooter, listHasRoomForFooter, preFooterPlan, productAdPlan, soldOutAdPlan, tileSource, withFeed, type FeedSurface } from "../src/lib/ebay-ads";
import { MAX_FEED_ROWS } from "../src/lib/ebay-context";
import { REGION_LIST, type Region } from "../src/lib/regions";
import { STORES, TCGPLAYER } from "../src/lib/stores";

const EPN_EXPECTED: Record<Region, { host: string; mkrid: string; siteid: string }> = {
  au: { host: "www.ebay.com.au", mkrid: "705-53470-19255-0", siteid: "15" },
  nz: { host: "www.ebay.com.au", mkrid: "705-53470-19255-0", siteid: "15" },
  us: { host: "www.ebay.com", mkrid: "711-53200-19255-0", siteid: "0" },
  uk: { host: "www.ebay.co.uk", mkrid: "710-53481-19255-0", siteid: "3" },
  ca: { host: "www.ebay.ca", mkrid: "706-53473-19255-0", siteid: "2" },
  eu: { host: "www.ebay.de", mkrid: "707-53477-19255-0", siteid: "77" },
  sg: { host: "www.ebay.com", mkrid: "711-53200-19255-0", siteid: "0" },
};

test("eBay: every region's search carries the full EPN tag set, on the right site", () => {
  for (const r of REGION_LIST) {
    const u = new URL(ebaySearchUrl("Surging Sparks Booster Box", r.region, "product-marketplace"));
    const want = EPN_EXPECTED[r.region];
    assert.equal(u.protocol, "https:");
    assert.equal(u.hostname, want.host, r.region);
    assert.equal(u.pathname, "/sch/i.html");
    assert.equal(u.searchParams.get("mkevt"), "1");
    assert.equal(u.searchParams.get("mkcid"), "1");
    assert.equal(u.searchParams.get("mkrid"), want.mkrid, r.region);
    assert.equal(u.searchParams.get("siteid"), want.siteid, r.region);
    assert.equal(u.searchParams.get("campid"), EBAY_CAMPAIGN_ID);
    assert.equal(u.searchParams.get("toolid"), "10001");
    assert.equal(u.searchParams.get("customid"), `dex-${r.region}-product-marketplace`);
    assert.equal(u.searchParams.get("LH_BIN"), "1");
    assert.equal(u.searchParams.get("_nkw"), "Pokemon Surging Sparks Booster Box sealed");
  }
  assert.equal(EBAY_CAMPAIGN_ID, "5339155912");
});

test("eBay: NZ lands on ebay.com.au and SG on ebay.com, and the labels say so", () => {
  assert.equal(new URL(ebaySearchUrl("x", "nz", "browse-empty")).hostname, "www.ebay.com.au");
  assert.equal(new URL(ebaySearchUrl("x", "sg", "browse-empty")).hostname, "www.ebay.com");
  assert.equal(ebayLabel("nz"), "ebay.com.au");
  assert.equal(ebayLabel("sg"), "ebay.com");
  assert.equal(ebayRetailer("au"), "eBay (ebay.com.au)");
  assert.equal(ebayRetailer("nz"), "eBay (ebay.com.au)");
  assert.equal(ebayRetailer("sg"), "eBay (ebay.com)");
});

test("eBay: queries say Pokemon once, lose store punctuation, and an empty name searches everything", () => {
  const q = (name: string) => new URL(ebaySearchUrl(name, "au", "browse-empty")).searchParams.get("_nkw");
  assert.equal(q("Pokémon Center Elite Trainer Box"), "Pokemon Center Elite Trainer Box sealed");
  assert.equal(q("Twilight Masquerade Single Pack Blister [Pupitar]"), "Pokemon Twilight Masquerade Single Pack Blister Pupitar sealed");
  assert.equal(q(""), "Pokemon sealed");
});

test("sub-ids are a safe slug, capped at 60 characters", () => {
  assert.equal(affiliateSubId("dex", "au", "product-best"), "dex-au-product-best");
  assert.equal(affiliateSubId("Dex", "US", "a b/c?d=é"), "dex-us-a-b-c-d");
  assert.equal(affiliateSubId(null, undefined, ""), "dex");
  const long = affiliateSubId("dex", "au", "x".repeat(100));
  assert.ok(long.length <= 60);
  assert.match(long, /^[a-z0-9_-]+$/);
  assert.doesNotMatch(long, /-$/);
  for (const p of PLACEMENTS) for (const r of REGION_LIST) assert.match(affiliateSubId("dex", r.region, p), /^dex-[a-z]{2}-[a-z-]+$/);
});

test("TCGplayer: a tcgplayer.com URL is wrapped in the Impact deep link, and u decodes to the original", () => {
  const target = "https://www.tcgplayer.com/product/565606/pokemon-sv08-surging-sparks-surging-sparks-booster-box";
  const wrapped = tcgplayerAffiliateUrl(target, "us", "product-best");
  assert.ok(wrapped.startsWith(`${TCGPLAYER_IMPACT_LINK}?u=`));
  assert.equal(TCGPLAYER_IMPACT_LINK, "https://partner.tcgplayer.com/c/7385758/1780961/21018");
  const u = new URL(wrapped);
  assert.equal(u.hostname, "partner.tcgplayer.com");
  assert.equal(u.searchParams.get("u"), target);
  assert.equal(u.searchParams.get("sharedid"), "dex-us-product-best");
  // Subdomains are TCGplayer too.
  assert.notEqual(tcgplayerAffiliateUrl("https://shop.tcgplayer.com/pokemon", "au", "product-table"), "https://shop.tcgplayer.com/pokemon");
});

test("TCGplayer: never double-wrapped, and never wraps a look-alike, http, relative or garbage URL", () => {
  const once = tcgplayerAffiliateUrl("https://www.tcgplayer.com/product/1/x", "us", "product-table");
  assert.equal(tcgplayerAffiliateUrl(once, "us", "product-table"), once);
  for (const url of [
    "https://tcgplayer.com.evil.com/product/1",
    "https://eviltcgplayer.com/product/1",
    "https://www.tcgplayer.com@evil.com/product/1",
    "http://www.tcgplayer.com/product/1",
    "/product/1",
    "not a url",
    "",
  ]) {
    assert.equal(tcgplayerAffiliateUrl(url, "us", "product-table"), url, url);
  }
});

test("TCGplayer: the search link is a wrapped Pokémon sealed search", () => {
  const u = new URL(tcgplayerSearchUrl("Pokémon Surging Sparks Booster Box", "au", "listings-set"));
  assert.equal(u.origin + u.pathname, TCGPLAYER_IMPACT_LINK);
  assert.equal(u.searchParams.get("sharedid"), "dex-au-listings-set");
  const target = new URL(u.searchParams.get("u")!);
  assert.equal(target.origin + target.pathname, "https://www.tcgplayer.com/search/pokemon/product");
  assert.equal(target.searchParams.get("productLineName"), "pokemon");
  assert.equal(target.searchParams.get("ProductTypeName"), "Sealed Products");
  assert.equal(target.searchParams.get("view"), "grid");
  assert.equal(target.searchParams.get("q"), "Surging Sparks Booster Box");
  // "Pokémon Center" names a product; an empty name searches all sealed.
  const pc = new URL(new URL(tcgplayerSearchUrl("Pokémon Center Elite Trainer Box", "us", "product-table")).searchParams.get("u")!);
  assert.equal(pc.searchParams.get("q"), "Pokemon Center Elite Trainer Box");
  const all = new URL(new URL(tcgplayerSearchUrl("", "us", "browse-empty")).searchParams.get("u")!);
  assert.equal(all.searchParams.has("q"), false);
});

test("offerLink: TCGplayer is wrapped and sponsored; a store's link goes out untouched", () => {
  const tcgUrl = "https://www.tcgplayer.com/product/565606/x";
  const t = offerLink(TCGPLAYER_KEY, tcgUrl, "us", "product-table");
  assert.equal(t.rel, REL_SPONSORED);
  assert.equal(t.sponsored, true);
  assert.equal(new URL(t.href).searchParams.get("u"), tcgUrl);
  assert.equal(new URL(t.href).searchParams.get("sharedid"), "dex-us-product-table");

  for (const s of STORES.slice(0, 25)) {
    const url = `${s.base}/products/surging-sparks-booster-box?variant=1`;
    assert.deepEqual(offerLink(s.key, url, "au", "product-best"), { href: url, rel: REL_STORE, sponsored: false });
  }
  // A store row is never wrapped, even if its URL were somehow a TCGplayer one.
  const odd = offerLink("some-store", tcgUrl, "us", "product-table");
  assert.deepEqual(odd, { href: tcgUrl, rel: REL_STORE, sponsored: false });
  // A TCGplayer row whose URL isn't TCGplayer's is not claimed as sponsored.
  const bad = offerLink(TCGPLAYER_KEY, "https://example.com/x", "us", "product-table");
  assert.deepEqual(bad, { href: "https://example.com/x", rel: REL_STORE, sponsored: false });
  assert.match(REL_SPONSORED, /\bsponsored\b/);
  assert.doesNotMatch(REL_STORE, /\bsponsored\b/);
});

test("retailer labels, and affiliate.ts's TCGplayer key matches the registry's", () => {
  assert.equal(TCGPLAYER_KEY, TCGPLAYER.key);
  assert.equal(offerRetailer(TCGPLAYER_KEY, "TCGplayer", "US"), "TCGplayer");
  assert.equal(offerRetailer("pokebox", "Pokebox", "AU"), "Pokebox (AU)");
  assert.ok(!STORES.some((s) => s.key === TCGPLAYER_KEY), "TCGplayer is not an independent store");
});

test("search queries drop store notes and SKU codes, and never send eBay an operator", () => {
  const ebay = (name: string) => new URL(ebaySearchUrl(name, "ca", "product-marketplace")).searchParams.get("_nkw");
  const tcg = (name: string) => new URL(new URL(tcgplayerSearchUrl(name, "us", "product-marketplace")).searchParams.get("u")!).searchParams.get("q");
  // Real product names from the 2026-09-28 import. TCGplayer finds 0 for the raw one, 36 for the clean one.
  const sylveon = "30th Celebration Sylveon ex Box - LIMIT 1 PER CUSTOMER - LOCAL PICKUP ONLY";
  assert.equal(tcg(sylveon), "30th Celebration Sylveon ex Box");
  assert.equal(ebay(sylveon), "Pokemon 30th Celebration Sylveon ex Box sealed");
  assert.equal(searchTerms("Trainer's Toolkit 2025 1 Per Customer"), "Trainer's Toolkit 2025");
  assert.equal(searchTerms("30th Celebration Ultra-Premium Collection Night (Pre Order)"), "30th Celebration Ultra-Premium Collection Night");
  assert.equal(searchTerms("Phantasmal Flames - 3pk Blister - Weaville MAX 1 PER CUSTOMER"), "Phantasmal Flames 3pk Blister Weaville");
  assert.equal(searchTerms("Mega Charizard Tin [MCAP - 000]"), "Mega Charizard Tin");
  assert.equal(searchTerms("V Battle Deck [Melmetal V] [PGO - 0]"), "V Battle Deck Melmetal V");
  // "-Pikachu" would tell eBay to EXCLUDE Pikachu.
  assert.equal(ebay("World Championships 2023 Yokohama Deck -Pikachu"), "Pokemon World Championships 2023 Yokohama Deck Pikachu sealed");
  // What a product's name needs stays.
  assert.equal(searchTerms("Pokémon Center Ultra-Premium Collection"), "Pokemon Center Ultra-Premium Collection");
  assert.equal(searchTerms("Scarlet & Violet 151 Booster Bundle"), "Scarlet & Violet 151 Booster Bundle");
  // A bracketed number is a year or a set, not a SKU code.
  assert.equal(searchTerms("Kanto Power Mini Tin (2025) - Charizard"), "Kanto Power Mini Tin 2025 Charizard");
  assert.equal(searchTerms("Scarlet & Violet (151) Elite Trainer Box"), "Scarlet & Violet 151 Elite Trainer Box");
});

// ─── eBay everywhere: placements, the in-feed tile, the pre-footer strip, EPN creative ───

test("eBay units: every placement, in every region, is a tagged search on the right site with a customid of <= 60 characters", () => {
  const NEW = ["header", "listings-home", "listings-home-sealed", "listings-landing", "listings-product", "listings-product-soldout", "listings-set", "listings-type", "listings-browse", "listings-browse-feed", "listings-store", "listings-releases", "listings-footer", "listings-notfound", "hot-home", "hot-set", "hot-product"];
  // the text-only banners, chips and links of the previous round are gone
  for (const gone of ["feed", "browse-feed", "set-feed", "type-feed", "card-soldout", "product-related", "product-after-table", "set-banner", "set-related", "type-banner", "releases-card", "releases-banner", "store-banner", "pre-footer", "footer", "not-found", "region-home-hero", "chase-home", "chase-landing"]) assert.ok(!(PLACEMENTS as readonly string[]).includes(gone), `${gone} was removed`);
  for (const p of NEW) assert.ok((PLACEMENTS as readonly string[]).includes(p), `${p} is a placement`);
  assert.equal(new Set(PLACEMENTS).size, PLACEMENTS.length, "no duplicate placement");
  for (const placement of PLACEMENTS) {
    for (const r of REGION_LIST) {
      const u = new URL(ebaySearchUrl("Surging Sparks Booster Box", r.region, placement));
      const id = u.searchParams.get("customid")!;
      assert.equal(id, `dex-${r.region}-${placement}`, `${r.region} ${placement}`);
      assert.ok(id.length <= 60, `${id} is ${id.length} characters`);
      assert.equal(u.hostname, EPN_EXPECTED[r.region].host, `${r.region} ${placement}`);
      assert.equal(u.searchParams.get("campid"), "5339155912");
      assert.equal(u.searchParams.get("mkevt"), "1");
    }
  }
  assert.equal(new URL(ebaySearchUrl("", "nz", "listings-footer")).hostname, "www.ebay.com.au");
  assert.equal(new URL(ebaySearchUrl("", "sg", "header")).hostname, "www.ebay.com");
});

test("eBay units: DEPLOY.md lists every placement the events can carry", () => {
  const doc = readFileSync(new URL("../DEPLOY.md", import.meta.url), "utf8");
  for (const p of PLACEMENTS) assert.ok(doc.includes(`\`${p}\``), `DEPLOY.md names ${p}`);
});

test("growth release placements (the base commit's contract): each new surface has its own, and the dead region-home is gone", () => {
  const GROWTH = ["product-sticky", "soldout-ebay", "listings-soldout-best", "listings-marketplace", "browse-search", "listings-deals", "listings-deals-feed", "listings-packs", "listings-digest", "listings-guide", "guide-tcgplayer", "set-sealed", "set-tcgplayer", "listings-set-feed", "listings-type-feed"];
  for (const p of GROWTH) assert.ok((PLACEMENTS as readonly string[]).includes(p), `${p} is a placement`);
  assert.ok(!(PLACEMENTS as readonly string[]).includes("region-home"), "region-home rendered nothing and was removed");
  // a TCGplayer placement is a sharedid too: the same dex-<region>-<placement> shape
  assert.equal(new URL(tcgplayerSearchUrl("Pitch Black", "us", "set-tcgplayer")).searchParams.get("sharedid"), "dex-us-set-tcgplayer");
  assert.equal(new URL(tcgplayerSearchUrl("", "us", "guide-tcgplayer")).searchParams.get("sharedid"), "dex-us-guide-tcgplayer");
});

test("in-feed tiles: feedSlots puts one after every 16 products, at most two, never within the last eight", () => {
  assert.deepEqual([FEED_EVERY, FEED_MAX, FEED_MIN_TAIL], [16, 2, 8]);
  assert.deepEqual(feedSlots(48), [16, 32], "a full page of 48: two tiles");
  assert.deepEqual(feedSlots(40), [16, 32], "32 + 8: the second still has eight products after it");
  assert.deepEqual(feedSlots(39), [16], "the second would sit within the last eight");
  assert.deepEqual(feedSlots(24), [16]);
  assert.deepEqual(feedSlots(23), []);
  assert.deepEqual(feedSlots(20), [], "16 + 4: too close to the end");
  assert.deepEqual(feedSlots(0), []);
  assert.deepEqual(feedSlots(1000), [16, 32], "never a third (MAX_FEED_ROWS is 8: the 7th and 8th listings)");
  assert.deepEqual(feedSlots(48, { every: 12, max: 3, minTail: 4 }), [12, 24, 36]);
  assert.deepEqual(feedSlots(Number.NaN), []);
  assert.deepEqual(feedSlots(48, { every: 0 }), [], "a zero step never loops");
  for (let n = 0; n <= 400; n++) {
    const k = feedSlots(n);
    assert.ok(k.length <= 2, `${n}`);
    k.forEach((slot, i) => {
      assert.equal(slot, 16 * (i + 1), `${n}`);
      assert.ok(n - slot >= 8, `${n}: eight products after every tile`);
    });
    assert.ok(feedSlots(n + 1).length >= k.length, "a longer grid never loses a tile");
    assert.deepEqual(feedSlots(n), k, "deterministic");
  }
});

test("in-feed tiles: withFeed emits the nth tile after products 16 and 32, keeps every product in order, and none without a surface", () => {
  const items = Array.from({ length: 48 }, (_, i) => i);
  for (const surface of ["browse", "set", "type", "deals"] as const) {
    const entries = withFeed(items, surface);
    assert.equal(entries.length, 50, `${surface}: two tiles`);
    assert.deepEqual(entries.flatMap((e, i) => (e.kind === "feed" ? [[i, e.nth]] : [])), [[16, 0], [33, 1]], `${surface}: after the 16th and the 32nd`);
    assert.deepEqual(entries.flatMap((e) => (e.kind === "item" ? [e.item] : [])), items, "every product, in order, once");
    assert.deepEqual(entries.flatMap((e) => (e.kind === "item" ? [e.index] : [])), items, "each product keeps its own index");
    assert.deepEqual(withFeed(items, surface), entries, "same input, same output (server and client agree)");
  }
  assert.equal(withFeed(items.slice(0, 24), "set").filter((e) => e.kind === "feed").length, 1, "24 products: one");
  // from md up (3-4 cards a row) a tile is a whole row tall: it shows there only with 24 products after it (the 25% density ceiling)
  assert.equal(FEED_WIDE_MIN_TAIL, 24);
  const wide = (n: number) => withFeed(items.concat(items).slice(0, n), "deals").flatMap((e) => (e.kind === "feed" ? [e.wide] : []));
  assert.deepEqual(wide(24), [false], "24 products: a phone tile only");
  assert.deepEqual(wide(39), [false], "39: still phone only");
  assert.deepEqual(wide(40), [true, false], "40: the first everywhere, the second on a phone");
  assert.deepEqual(wide(48), [true, false]);
  assert.deepEqual(wide(56), [true, true], "56: both everywhere");
  for (let n = 0; n <= 120; n++) {
    const e = withFeed(Array.from({ length: n }, (_, i) => i), "type").filter((x) => x.kind === "feed") as { nth: number; wide: boolean }[];
    assert.deepEqual(e.filter((x) => x.wide).map((x) => x.nth), feedSlots(n, { minTail: 24 }).map((_, i) => i), `${n}: the wide tiles are the first ones`);
  }
  assert.equal(withFeed(items.slice(0, 20), "type").filter((e) => e.kind === "feed").length, 0, "20 products: none");
  assert.equal(withFeed(items).length, 48, "no tile where the grid does not ask for one");
  assert.equal(withFeed(items, undefined).length, 48);
  assert.deepEqual(withFeed([], "browse"), []);
});

test("in-feed tiles: each a different listing that no strip or pre-footer strip shows, under its surface's own placement", () => {
  const surfaces: FeedSurface[] = ["browse", "set", "type", "deals"];
  for (const s of surfaces) {
    const a = tileSource(s, 0);
    const b = tileSource(s, 1);
    assert.deepEqual(a, { context: "sealed", index: 6 }, `${s}: the sealed feed's 7th listing`);
    assert.deepEqual(b, { context: "sealed", index: 7 }, `${s}: the 8th`);
    assert.equal(a.index, FEED_FIRST_INDEX);
    // a strip shows the 1st-6th listings (indexes 0-5) and the slim pre-footer strip the 1st-4th: neither reaches a tile's
    for (const t of [a, b]) assert.ok(t.index >= 6 && t.index < MAX_FEED_ROWS, `${s}: index ${t.index} is past every strip and inside the stored rows`);
  }
  assert.equal(MAX_FEED_ROWS, 8, "the importer stores 8 rows a feed: two tiles at most, so it did not change");
  assert.ok(FEED_FIRST_INDEX + FEED_MAX <= MAX_FEED_ROWS, "every tile a grid can have has a stored row to show");
  assert.deepEqual(FEED_PLACEMENTS, { browse: "listings-browse-feed", set: "listings-set-feed", type: "listings-type-feed", deals: "listings-deals-feed" });
  for (const p of Object.values(FEED_PLACEMENTS)) assert.ok((PLACEMENTS as readonly string[]).includes(p), `${p} is a placement`);
  // pages whose own strip is sealed (deals, browse, type pages that cascade to it) get the chase pre-footer strip, so the tiles' sealed
  // listings are never also above the footer; where the pre-footer strip IS sealed (set pages) it shows the 1st-4th only
  assert.deepEqual(preFooterPlan("/us/deals", "us"), { context: "chase" });
  assert.deepEqual(preFooterPlan("/us/sealed", "us"), { context: "chase" });
  assert.deepEqual(preFooterPlan("/us/sets/pitch-black", "us"), { context: "sealed" });
});

test("in-feed tiles: the first lands 12 products after the strip (after product 4), over a screen apart on a phone and a desktop", () => {
  const STRIP_AFTER = 4;
  const [first, second] = feedSlots(48);
  assert.equal(first - STRIP_AFTER, 12);
  // rows of two cards on a phone (~330 px), four on a desktop (~446 px): both clear the 960 px gap between two units
  assert.ok(((first - STRIP_AFTER) / 2) * 330 >= 960 && ((first - STRIP_AFTER) / 4) * 446 >= 960);
  assert.ok(((second - first) / 2) * 330 >= 960 && ((second - first) / 4) * 446 >= 960);
});

test("pre-footer strip: the feed the page's own strip is not; a region's home page has none (two strips of its own, and a feed holds only 8 listings)", () => {
  assert.equal(preFooterPlan("/au", "au"), null);
  assert.equal(preFooterPlan("/au/", "au"), null);
  assert.deepEqual(preFooterPlan("/au/sets/surging-sparks", "au"), { context: "sealed" });
  assert.deepEqual(preFooterPlan("/uk/stores/foo", "uk"), { context: "sealed" });
  assert.deepEqual(preFooterPlan("/au/type/tins", "au"), { context: "chase" });
  assert.deepEqual(preFooterPlan("/au/p/some-product", "au"), { context: "chase" });
  assert.deepEqual(preFooterPlan("/au/sealed/page/2", "au"), { context: "chase" });
  assert.deepEqual(preFooterPlan("/us/sets", "au"), { context: "chase" }, "another region's path is not this region's");
});

test("listing links: eBay's affiliate URL is used exactly as stored; the buy_click carries the placement, the URL the per-feed sub-id", () => {
  const stored = "https://www.ebay.com.au/itm/123456789012?_skw=a+b&hash=item1%3Ag%3AX%2By&amdata=enc%3AAQAKAAAA%2B%2Fx%3D&mkevt=1&mkcid=1&mkrid=705-53470-19255-0&campid=5339155912&customid=dex-au-item&toolid=10001";
  assert.equal(listingHref(stored), stored, "no rewrite of customid, order or encoding");
  assert.equal(listingHref(stored.replace("5339155912", "1111111111")), stored.replace("5339155912", "1111111111"), "the browser does not compare the campaign id with the build's env");
  assert.equal(listingHref(stored.replace(/&campid=\d+/, "")), null, "a campaign id must be present");
  assert.equal(listingHref("https://www.ebay.com.au/sch/i.html?_nkw=x&campid=5339155912"), null, "item pages only");
  assert.equal(listingHref(`${stored}\n`), null);
  assert.equal(listingHref(stored.replace("https://", "http://")), null);
});

test("page budgets: pure, monotonic, and the pre-footer strip gives way on short pages", () => {
  assert.equal(gridPageHasRoomForFooter(3), false);
  assert.equal(gridPageHasRoomForFooter(40), true);
  assert.equal(listHasRoomForFooter(5), false);
  assert.equal(listHasRoomForFooter(48), true);
  // The product page (growth release): the table shows eight rows at most, so the plan counts VISIBLE rows (min(offers + 1, 8): the
  // eBay row is one) and the collapsed groups' summaries, then the "Quick facts" card, never every offer.
  const thin = productAdPlan({ offerRows: 1, elsewhere: 0, related: 0 });
  assert.deepEqual(thin, { tableGroup: false, preFooter: false });
  assert.equal(productAdPlan({ offerRows: 3, elsewhere: 0, related: 8 }).tableGroup, false, "four phone rows and the facts are not a screen");
  assert.deepEqual(productAdPlan({ offerRows: 6, elsewhere: 0, related: 8 }), { tableGroup: false, preFooter: true }, "seven desktop rows and the facts are not a screen there: the strip goes to the bottom");
  assert.deepEqual(productAdPlan({ offerRows: 6, elsewhere: 1, related: 8 }), { tableGroup: true, preFooter: false }, "…the other regions' tiles make it one");
  assert.deepEqual(productAdPlan({ offerRows: 30, summaries: 2, elsewhere: 6, related: 8 }), productAdPlan({ offerRows: 9, summaries: 2, elsewhere: 6, related: 8 }), "30 offers or 9: the same eight visible rows");
  assert.deepEqual(productAdPlan({ offerRows: 4, elsewhere: 0, related: 4 }), { tableGroup: false, preFooter: true }, "a short table: the strip at the bottom, in the pre-footer strip's place");
  // Ad density (at most a quarter of <main>, at 390 and 1440): the collapsed table makes a page shorter, so it holds fewer units.
  assert.deepEqual(productAdPlan({ offerRows: 12, summaries: 1, elsewhere: 3, related: 8 }), { tableGroup: true, preFooter: false }, "the pre-footer strip would take the desktop page past a quarter");
  assert.deepEqual(productAdPlan({ offerRows: 7, elsewhere: 0, related: 0 }), { tableGroup: false, preFooter: false }, "nothing under the facts: one strip would be over a quarter of the page");
  assert.deepEqual(productAdPlan({ offerRows: 12, summaries: 1, elsewhere: 3, related: 0, rail: 4 }), { tableGroup: true, preFooter: false }, "a product with no set: a rail of four");
  // More content never takes a unit away.
  for (let rows = 0; rows < 15; rows++) {
    const a = productAdPlan({ offerRows: rows, elsewhere: 2, related: 4 });
    const b = productAdPlan({ offerRows: rows + 1, elsewhere: 2, related: 4 });
    assert.ok(!a.tableGroup || b.tableGroup);
    assert.ok(Number(b.tableGroup) + Number(b.preFooter) >= Number(a.tableGroup) + Number(a.preFooter), `${rows} rows`);
  }
  // Sold out: the callout's eBay box is the first-screen unit; the strip goes after the table and "In stock instead", or at the bottom.
  assert.deepEqual(soldOutAdPlan({ visibleRows: 8, summaries: 2, alternatives: 4, elsewhere: 6, related: 8 }), { strip: "table", preFooter: true });
  assert.deepEqual(soldOutAdPlan({ visibleRows: 7, alternatives: 4, elsewhere: 5, related: 8 }), { strip: "table", preFooter: false }, "the pre-footer strip would take it past a quarter");
  assert.deepEqual(soldOutAdPlan({ visibleRows: 3, alternatives: 0, elsewhere: 1, related: 8 }), { strip: "bottom", preFooter: false });
  assert.deepEqual(soldOutAdPlan({ visibleRows: 2, alternatives: 0, elsewhere: 0, related: 0 }), { strip: null, preFooter: false });
});

test("EPN creative: https image and an eBay tracking link only; garbage is ignored, never half-applied", () => {
  const ok = { image: "https://i.ebayimg.com/images/g/abc/s-l728.png", href: "https://rover.ebay.com/rover/1/705-53470-19255-0/1?campid=5339155912&customid=x" };
  assert.deepEqual(parseEbayBanner(ok), { ...ok, width: 728, height: 90, alt: "Shop Pokémon sealed on eBay (advertisement)" });
  assert.deepEqual(parseEbayBanner({ ...ok, width: "300", height: "250", alt: "  Pokémon   on eBay " }), { ...ok, width: 300, height: 250, alt: "Pokémon on eBay" });
  assert.equal(parseEbayBanner({ ...ok, href: "https://ebay.us/abc123" })?.href, "https://ebay.us/abc123");
  assert.equal(parseEbayBanner({ ...ok, href: "https://www.ebay.com.au/sch/i.html?_nkw=x&campid=5339155912" })?.width, 728);
  const bad: [string, Parameters<typeof parseEbayBanner>[0]][] = [
    ["unset", {}],
    ["image only", { image: ok.image }],
    ["href only", { href: ok.href }],
    ["http image", { ...ok, image: "http://i.ebayimg.com/a.png" }],
    ["http href", { ...ok, href: "http://rover.ebay.com/rover/1/x" }],
    ["javascript image", { ...ok, image: "javascript:alert(1)" }],
    ["data image", { ...ok, image: "data:image/png;base64,AAAA" }],
    ["relative image", { ...ok, image: "/banner.png" }],
    ["garbage image", { ...ok, image: "not a url" }],
    ["href is not eBay", { ...ok, href: "https://evil.example/rover" }],
    ["look-alike href", { ...ok, href: "https://ebay.com.evil.example/x" }],
    ["look-alike href 2", { ...ok, href: "https://notebay.com/x" }],
    ["credentials in href", { ...ok, href: "https://user:pw@rover.ebay.com/x" }],
    ["width too small", { ...ok, width: "50" }],
    ["width too big", { ...ok, width: "5000" }],
    ["height 0", { ...ok, height: "0" }],
    ["non-numeric width", { ...ok, width: "wide" }],
    ["negative height", { ...ok, height: "-90" }],
    ["decimal height", { ...ok, height: "90.5" }],
    ["blank strings", { image: " ", href: "" }],
    // A paste mistake must not render an ad link that earns nothing, or credits another campaign.
    ["href without a campid", { ...ok, href: "https://www.ebay.com/" }],
    ["href with another campid", { ...ok, href: "https://rover.ebay.com/rover/1/705-53470-19255-0/1?campid=1234567890" }],
    ["image from a third-party host", { ...ok, image: "https://example.com/b.png" }],
    ["image from a look-alike host", { ...ok, image: "https://ebayimg.com.evil.example/b.png" }],
  ];
  for (const [name, env] of bad) assert.equal(parseEbayBanner(env), null, name);
  assert.equal(isEbayHost("rover.ebay.com"), true);
  assert.equal(isEbayHost("www.ebay.co.uk"), true);
  assert.equal(isEbayHost("ebay.com.evil.example"), false);
  assert.equal(EBAY_BANNER, null, "unset in the test environment: native banners only");
  assert.equal(parseEbayBanner({ ...ok, image: "https://ir.ebaystatic.com/cr/v/c01/b.png" })?.width, 728);
  // The creative's own click: our customid is filled in (short links and a set customid are left alone), and the retailer is the host it really goes to.
  const rover = "https://rover.ebay.com/rover/1/705-53470-19255-0/1?campid=5339155912&customid=&toolid=10001";
  assert.equal(new URL(creativeHref(rover, "eu", "listings-footer")).searchParams.get("customid"), "dex-eu-listings-footer");
  assert.equal(creativeHref("https://ebay.us/abc123", "eu", "listings-footer"), "https://ebay.us/abc123");
  assert.equal(creativeHref(ok.href, "au", "listings-home"), ok.href);
  assert.equal(creativeRetailer(rover), "eBay (rover.ebay.com)");
  assert.equal(creativeRetailer("https://www.ebay.de/sch/i.html"), "eBay (ebay.de)");
});

test("search queries drop store-listing noise that eBay would AND into the search", () => {
  assert.equal(searchTerms("Pokemon Meowth VMAX Special Collection International Version Pack Lineup in Description"), "Pokemon Meowth VMAX Special Collection International Version");
  assert.equal(searchTerms("Pokemon League Battle Deck Dragapult ex Miscellaneous Cards & Products"), "Pokemon League Battle Deck Dragapult ex");
  assert.equal(searchTerms("Pokemon Pokeball Tin Series 6 Random Style"), "Pokemon Pokeball Tin Series 6");
  assert.equal(searchTerms("COLLECTION ONLY- Pokemon TCG: Binder Collection 30th Celebration"), "Pokemon TCG: Binder Collection 30th Celebration");
  assert.equal(searchTerms("Pokemon Battle Academy Board Game On Sale"), "Pokemon Battle Academy Board Game");
  assert.equal(searchTerms("Elite Trainer Box 20% VAT"), "Elite Trainer Box");
  assert.equal(searchTerms("Foo PREPRDER 30 May, 2025"), "Foo 30 May, 2025");
  // A real name keeps its hyphens and its words.
  assert.equal(searchTerms("Ultra-Premium Collection"), "Ultra-Premium Collection");
});


test("Impact site verification: both tokens are in the root layout's <head> as meta name=impact-site-verification with a `value` attribute", () => {
  assert.ok(IMPACT_SITE_VERIFICATIONS.includes("f20df7de-d054-4571-b9bc-8777b2eafcdf"), "this site's own property token");
  assert.ok(IMPACT_SITE_VERIFICATIONS.includes("ebb0400c-dec0-45ae-a56e-e7bb1596e965"), "the account's shared token stays");
  assert.equal(new Set(IMPACT_SITE_VERIFICATIONS).size, IMPACT_SITE_VERIFICATIONS.length);
  for (const t of IMPACT_SITE_VERIFICATIONS) assert.match(t, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /IMPACT_SITE_VERIFICATIONS\.map\(\(value\) =>[\s\S]*name: "impact-site-verification", value/);
  assert.ok(layout.indexOf("impact-site-verification") > layout.indexOf("<head>") && layout.indexOf("impact-site-verification") < layout.indexOf("</head>"));
});
