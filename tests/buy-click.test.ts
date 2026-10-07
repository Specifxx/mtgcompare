import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buyClickProps, networkOf, pageFromPath } from "../src/lib/buy-click";

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("a buy link becomes a small, lower-cased event with the seller kind", () => {
  assert.deepEqual(buyClickProps({ retailer: "store:Cherry", page: "card", card: "Monkey-D-Luffy-OP16-015", surface: "price-board" }, "/card/x"), {
    retailer: "store:cherry", network: "store", page: "card", card: "monkey-d-luffy-op16-015", surface: "price-board",
  });
  assert.deepEqual(buyClickProps({ retailer: "ebay_search", page: null, card: null, surface: null }, "/price-guide"), { retailer: "ebay_search", network: "ebay", page: "price-guide" });
  assert.equal(buyClickProps({ retailer: "tcgplayer", page: "deal-finder", card: "", surface: " " }, "/")?.network, "tcgplayer");
});

test("no retailer, no event; the page falls back to the path", () => {
  assert.equal(buyClickProps({ retailer: null, page: "card", card: null, surface: null }, "/card/x"), null);
  assert.equal(buyClickProps({ retailer: "  ", page: "card", card: null, surface: null }, "/card/x"), null);
  assert.equal(pageFromPath("/"), "home");
  assert.equal(pageFromPath("/tools/best-basket"), "tools");
  assert.equal(networkOf("ebay_us"), "ebay");
  assert.equal(networkOf("tcgplayer_banner"), "tcgplayer");
});

test("values are clipped, so a long slug can never exceed Vercel's property limit", () => {
  const p = buyClickProps({ retailer: "store:x", page: "card", card: "a".repeat(400), surface: null }, "/card/x");
  assert.ok(p && p.card && p.card.length <= 160);
});

test("the listener sits inside the consent gate and sends only to Vercel", () => {
  const src = read("src/components/ConsentGatedAnalytics.tsx");
  assert.match(src, /track\("buy_click", props\)/);
  assert.match(src, /if \(!analytics\) return null;/);
  assert.doesNotMatch(src, /fetch\(|sendBeacon|\/api\//, "no request to our own server");
  assert.match(src, /startsWith\("\/admin"\)/);
});
