import { test } from "node:test";
import assert from "node:assert/strict";
import { affiliateUrl, cardEbayQuery, ebaySearchUrl, isPaidLink, magicEbayQuery } from "../src/lib/affiliate";

// Placeholder partner ids: the builder reads NEXT_PUBLIC_* at call time and has no default.
const EBAY = "1000000001";
const IMPACT = "https://partner.tcgplayer.com/c/1000001/2000002/3000003";
function withIds<T>(fn: () => T): T {
  const saved = [process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID, process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK];
  process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID = EBAY;
  process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK = IMPACT;
  try {
    return fn();
  } finally {
    for (const [i, k] of ["NEXT_PUBLIC_EBAY_CAMPAIGN_ID", "NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK"].entries()) {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    }
  }
}

test("eBay searches are tagged with our campaign and an mc- custom id", () =>
  withIds(() => {
    const u = new URL(ebaySearchUrl("AU", "MTG Sol Ring 270", "card-board"));
    assert.equal(u.hostname, "www.ebay.com.au");
    assert.equal(u.searchParams.get("mkevt"), "1");
    assert.equal(u.searchParams.get("campid"), EBAY);
    assert.match(u.searchParams.get("customid") ?? "", /^mc-au-card-board-search$/);
  }));

test("Singapore reroutes to ebay.com and still reports as mc-sg", () =>
  withIds(() => {
    const u = new URL(ebaySearchUrl("SG", "MTG Lightning Bolt"));
    assert.equal(u.hostname, "www.ebay.com");
    assert.match(u.searchParams.get("customid") ?? "", /^mc-sg/);
  }));

test("Magic appears in an eBay query exactly once", () => {
  assert.equal(magicEbayQuery("Lightning Bolt, Magic 2011"), "MTG Lightning Bolt Magic 2011");
  assert.equal(magicEbayQuery("MTG The One Ring Borderless"), "MTG The One Ring Borderless");
  assert.equal(magicEbayQuery("Magic The Gathering Counterspell"), "Magic The Gathering Counterspell");
  assert.equal(cardEbayQuery({ name: "Sol Ring", setName: "Commander Masters", number: "270", variant: "Borderless · Extended Art" }), "MTG Sol Ring Commander Masters 270 Borderless Extended Art");
  assert.equal(cardEbayQuery({ name: "Counterspell", foil: true }), "MTG Counterspell foil");
});

test("TCGplayer links go through Impact with an mc- shared id; store links are untouched", () =>
  withIds(() => {
    const t = affiliateUrl("https://www.tcgplayer.com/product/535325", "tcgplayer", "/card/x");
    assert.ok(t.startsWith(`${IMPACT}?u=`));
    assert.match(t, /sharedid=mc-tcgplayer-card/);
    assert.equal(affiliateUrl("https://store.example/products/x", "store"), "https://store.example/products/x");
    assert.equal(isPaidLink("https://store.example/products/x"), false);
    assert.equal(isPaidLink("https://www.ebay.com/sch/i.html?_nkw=x"), true);
  }));

test("with neither id set every link is plain: no campaign, no custom id, never another site's account", () => {
  const saved = [process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID, process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK];
  delete process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID;
  delete process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK;
  try {
    const e = new URL(ebaySearchUrl("US", "sol ring"));
    assert.equal(e.searchParams.get("campid"), null);
    assert.equal(e.searchParams.get("customid"), null);
    assert.equal(affiliateUrl("https://www.tcgplayer.com/product/1"), "https://www.tcgplayer.com/product/1");
    assert.equal(isPaidLink("https://www.ebay.com/sch/i.html?_nkw=x"), false);
    assert.equal(isPaidLink("https://www.tcgplayer.com/product/1"), false);
  } finally {
    if (saved[0] !== undefined) process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID = saved[0];
    if (saved[1] !== undefined) process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK = saved[1];
  }
});
