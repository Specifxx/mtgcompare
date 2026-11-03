import { test } from "node:test";
import assert from "node:assert/strict";
import type { Offer, Product } from "@/lib/site-types";
import { cleanEbayUrl, selectCardAds, topUp, type AdRow } from "@/lib/card-ads";
import { summarize } from "@/lib/price-store";
import { footerStripsAllowed } from "@/components/FooterCardAds";

const p = (id: number, over: Partial<Product> = {}): Product => ({ id, slug: `c-${id}`, name: `Card ${id}`, kind: "card", setId: 1, number: null, rarity: null, attrs: {}, sealedType: null, image: `https://tcgplayer-cdn.tcgplayer.com/product/${id}_200w.jpg`, tcgUrl: "", printings: [], ...over });
const ebay = (market: "US" | "UK" | "AU", cents: number, extra: Partial<Offer> = {}): Offer => ({ source: "ebay", market, currency: { US: "USD", UK: "GBP", AU: "AUD" }[market], cents, inStock: true, url: `https://www.ebay.com/itm/${cents}?hash=x&customid=old`, title: "", ...extra });
const tcg: Offer = { source: "tcgplayer", market: "US", currency: "USD", cents: 900, inStock: true, url: "https://www.tcgplayer.com/product/1", title: "" };
const row = (prod: Product, ref: number | null, ebays: Offer[], setRank = 0, t: Offer | null = tcg): AdRow => ({ p: prod, ref, ebay: ebays, tcgplayer: t, setRank });

test("tiles are real products by value, newest sets first, per eBay market", () => {
  const ads = selectCardAds([
    row(p(1), 5000, [ebay("US", 4500)], 5),
    row(p(2), 2000, [ebay("US", 1900), ebay("UK", 1500)], 0),
    row(p(3), 9000, [ebay("US", 8000)], 1),
  ]);
  assert.deepEqual(ads.ebay.US!.map((t) => t.id), [3, 2, 1]);
  assert.deepEqual(ads.ebay.UK!.map((t) => [t.id, t.currency]), [[2, "GBP"]]);
  assert.equal(ads.ebay.US![0].url, "https://www.ebay.com/itm/8000");
  // TCGplayer tiles show the market price, not the cheapest listing.
  assert.deepEqual(ads.tcgplayer.map((t) => [t.id, t.cents]), [[3, 9000], [2, 2000], [1, 5000]]);
});

test("no photo, inserts, the page's own product and cheap cards stay out", () => {
  const ads = selectCardAds(
    [row(p(1, { image: null }), 5000, [ebay("US", 1)]), row(p(2, { sealedType: "Insert", kind: "sealed" }), 5000, [ebay("US", 1)]), row(p(3), 5000, [ebay("US", 1)]), row(p(4), 50, [], 0)],
    { exclude: 3 },
  );
  assert.deepEqual(ads.ebay, {});
  assert.deepEqual(ads.tcgplayer, []);
});

test("a thin set is topped up without repeating a product", () => {
  const a = selectCardAds([row(p(1), 5000, [ebay("US", 4000)])], { setId: 1 });
  const b = selectCardAds([row(p(1), 5000, [ebay("US", 4000)]), row(p(9, { setId: 2 }), 3000, [ebay("US", 2500)])]);
  assert.deepEqual(topUp(a, b, 10).ebay.US!.map((t) => t.id), [1, 9]);
});

test("the summary keeps the cheapest in-stock eBay listing per market, never a pre-order", () => {
  const s = summarize({ tcg: {}, change7d: null, change30d: null, offers: [ebay("US", 900), ebay("US", 700), ebay("UK", 500, { inStock: false }), ebay("AU", 300, { preorder: true })] });
  assert.deepEqual(s.e?.map((t) => [t[1], t[6]]), [[700, "US"]]);
});

test("eBay item links lose their old tracking; /go tags them again", () => {
  assert.equal(cleanEbayUrl("https://www.ebay.co.uk/itm/Some-title/123456?mkevt=1&customid=x"), "https://www.ebay.co.uk/itm/123456");
  assert.equal(cleanEbayUrl("https://www.ebay.com/sch/i.html?_nkw=x"), "https://www.ebay.com/sch/i.html?_nkw=x");
});

test("the footer pair stays off pages with their own strips and off policy pages", () => {
  for (const path of ["/", "/card/x", "/sets/x", "/kits", "/kit/x", "/kits/grade/hg", "/privacy", "/terms", "/about"]) assert.equal(footerStripsAllowed(path), false, path);
  for (const path of ["/cards", "/sealed", "/movers", "/blog/x", "/sets", "/tools/deal-finder"]) assert.equal(footerStripsAllowed(path), true, path);
});
