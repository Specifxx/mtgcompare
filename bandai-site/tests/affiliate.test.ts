import { test } from "node:test";
import assert from "node:assert/strict";
import { AMAZON_AU_TAG, amazonSearchUrl, amazonSearchUrls, goHref, subId, tagged } from "@/lib/affiliate";
import { SITE } from "@/site.config";

test("eBay links carry the EPN campaign and a per-site customid", () => {
  const u = new URL(tagged("https://www.ebay.com/itm/123", subId("us", "home", 1)));
  assert.equal(u.searchParams.get("campid"), "5339155912");
  assert.equal(u.searchParams.get("mkevt"), "1");
  assert.match(u.searchParams.get("customid") ?? "", new RegExp(`^${SITE.key}-`));
  assert.ok(new URL(tagged("https://www.ebay.co.uk/itm/1")).searchParams.get("mkrid"));
});

test("TCGplayer links go through the Impact partner link", () => {
  const t = tagged("https://www.tcgplayer.com/product/1/x");
  assert.ok(t.startsWith("https://partner.tcgplayer.com/"));
  assert.ok(t.includes(encodeURIComponent("https://www.tcgplayer.com/product/1/x")));
});

test("Amazon search links carry an Associates tag", () => {
  assert.match(amazonSearchUrl("booster box")!, /[?&]tag=/);
});

test("buy links route through /go with retailer and market for click events", () => {
  const h = goHref({ url: "https://x.com/p", source: "ebay", market: "UK" }, 5, "card");
  const q = new URLSearchParams(h.split("?")[1]);
  assert.equal(q.get("s"), "ebay");
  assert.equal(q.get("m"), "UK");
  assert.equal(q.get("p"), "5");
});

test("every partner tag starts with the site key, so earnings split by site", () => {
  const sub = "x-us-card-7";
  const e = new URL(tagged("https://www.ebay.com/itm/1", sub));
  assert.equal(e.searchParams.get("customid"), sub);
  const t = new URL(tagged("https://www.tcgplayer.com/product/1/x", sub));
  assert.equal(t.searchParams.get("sharedid"), sub);
  assert.equal(t.searchParams.get("subId1"), sub);
  const a = new URL(tagged(amazonSearchUrl("booster box")!, sub));
  assert.equal(a.searchParams.get("ascsubtag"), sub);
  assert.ok(a.searchParams.get("tag"));
  assert.match(subId("us", "card_pinned", 12), /^[a-z]+-us-card_pinned-12$/);
});

test("/go tags with site, market, placement and product", async () => {
  const { GET } = await import("@/app/go/route");
  const res = GET(new Request("https://example.test/go?" + new URLSearchParams({ u: "https://www.ebay.com/itm/9", s: "ebay", m: "UK", p: "42", from: "card_top" })));
  const loc = new URL(res.headers.get("location")!);
  assert.match(loc.searchParams.get("customid")!, /^[a-z]+-uk-card_top-42$/);
});

test("store links carry a referral utm_source and keep their own", () => {
  const s = new URL(tagged("https://shop.example/products/x"));
  assert.equal(s.searchParams.get("utm_medium"), "referral");
  assert.ok(s.searchParams.get("utm_source"));
  assert.equal(new URL(tagged("https://shop.example/p?utm_source=mine")).searchParams.get("utm_source"), "mine");
});

test("each market's Amazon gets its own store's tag, and Singapore gets no Amazon", () => {
  assert.equal(AMAZON_AU_TAG, SITE.amazonAuTag ?? "compareempire-22");
  assert.match(AMAZON_AU_TAG, /^[a-z0-9]+-22$/);
  assert.equal(amazonSearchUrl("booster box", "AU"), `https://www.amazon.com.au/s?k=booster%20box&tag=${AMAZON_AU_TAG}`);
  assert.match(amazonSearchUrl("booster box", "UK")!, /^https:\/\/www\.amazon\.co\.uk\/s\?.*tag=compareempi03-21$/);
  assert.match(amazonSearchUrl("booster box", "CA")!, /amazon\.ca\/.*tag=compareempire-20$/);
  assert.match(amazonSearchUrl("booster box", "EU")!, /amazon\.de\/.*tag=compareempire-21$/);
  assert.equal(amazonSearchUrl("booster box", "SG"), null, "amazon.sg has no Associates programme");
  const all = amazonSearchUrls("booster box")!;
  assert.deepEqual(Object.keys(all).sort(), ["AU", "CA", "EU", "UK", "US"]);
  // /go re-tags by host: the AU link keeps the AU tag, never the US one.
  assert.equal(new URL(tagged(all.AU!, "s")).searchParams.get("tag"), AMAZON_AU_TAG);
  assert.notEqual(new URL(tagged(all.US!, "s")).searchParams.get("tag"), AMAZON_AU_TAG);
});

test("Amazon tags are hard-coded: no Vercel variable decides one (owner, 2026-11-02)", async () => {
  const { readFileSync } = await import("node:fs");
  assert.doesNotMatch(readFileSync(new URL("../src/lib/affiliate.ts", import.meta.url), "utf8"), /process\.env\.AMAZON|AMAZON_TAG_|AMAZON_ASSOCIATE_TAG/);
});
