import test from "node:test";
import assert from "node:assert/strict";
import { creatorMarkFor, hasMark, tagHref, visitMarkFor } from "../src/lib/paid-visit";
import { cleanCampaign } from "../src/lib/campaign";

// Paid creators (owner, 2026-11-20): a creator's link tags its visitors' affiliate sub-ids with cr<handle6>, so RiftCompare's
// earnings dashboard can count the real sales each paid creator sent (lib/paid-visit.ts, the same file as Rift's and Dex's).

test("a creator landing gets cr + six letters of its campaign; a paid ad still wins", () => {
  assert.equal(creatorMarkFor("?utm_source=instagram&utm_medium=creator&utm_campaign=gather.with.greynzz"), "crgather");
  assert.equal(creatorMarkFor("?utm_source=instagram&utm_medium=social&utm_campaign=x1"), null);
  assert.equal(visitMarkFor("?utm_source=facebook&utm_medium=paid"), "fbad");
});

test("our /out/tcgplayer link and an eBay link carry the marker in their sub-id", () => {
  const out = "/out/tcgplayer?u=https%3A%2F%2Fwww.tcgplayer.com%2Fproduct%2F1&sharedid=mtg-us-product";
  assert.equal(tagHref(out, "crgather"), out.replace("sharedid=mtg-us-product", "sharedid=mtg-us-product-crgather"));
  const ebay = "https://www.ebay.com/sch/i.html?_nkw=x&campid=5339155912&customid=mtg-us-product";
  assert.ok(hasMark(new URL(tagHref(ebay, "crgather")!).searchParams.get("customid")!, "crgather"));
});

test("the campaign tag is cleaned", () => {
  assert.equal(cleanCampaign("?utm_campaign=Gather.With.Greynzz"), "gatherwithgreynzz");
  assert.equal(cleanCampaign(""), undefined);
});
