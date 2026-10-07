import { test } from "node:test";
import assert from "node:assert/strict";
import { affiliateUrl, cardEbayQuery, ebaySearchUrl, isPaidLink, onePieceEbayQuery } from "../src/lib/affiliate";

test("eBay searches are tagged with our campaign and an oc- custom id", () => {
  const u = new URL(ebaySearchUrl("AU", "One Piece Shanks OP01-120", "card-board"));
  assert.equal(u.hostname, "www.ebay.com.au");
  assert.equal(u.searchParams.get("mkevt"), "1");
  assert.ok(u.searchParams.get("campid"));
  assert.match(u.searchParams.get("customid") ?? "", /^oc-au-card-board-search$/);
});

test("Singapore reroutes to ebay.com and still reports as oc-sg", () => {
  const u = new URL(ebaySearchUrl("SG", "One Piece Nami"));
  assert.equal(u.hostname, "www.ebay.com");
  assert.match(u.searchParams.get("customid") ?? "", /^oc-sg/);
});

test("One Piece appears in an eBay query exactly once", () => {
  assert.equal(onePieceEbayQuery("Shanks, OP01-120"), "One Piece Shanks OP01-120");
  assert.equal(onePieceEbayQuery("One Piece Romance Dawn Booster Box"), "One Piece Romance Dawn Booster Box");
  assert.equal(cardEbayQuery({ name: "Shanks", number: "OP01-120", variant: "Parallel · Manga" }), "One Piece Shanks OP01-120 Parallel Manga");
});

test("TCGplayer links go through Impact with an oc- shared id; store links are untouched", () => {
  const t = affiliateUrl("https://www.tcgplayer.com/product/453506", "tcgplayer", "/card/x");
  assert.match(t, /^https:\/\/partner\.tcgplayer\.com\//);
  assert.match(t, /sharedid=oc-tcgplayer-card/);
  assert.equal(affiliateUrl("https://store.example/products/x", "store"), "https://store.example/products/x");
  assert.equal(isPaidLink("https://store.example/products/x"), false);
  assert.equal(isPaidLink("https://www.ebay.com/sch/i.html?_nkw=x"), true);
});
