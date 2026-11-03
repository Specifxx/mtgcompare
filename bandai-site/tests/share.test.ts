import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { decodeList, encodeList, priceGap, shareText, shareUrl } from "../src/lib/share";
import robots from "../src/app/robots";
import type { Offer } from "../src/lib/site-types";

// Word of mouth (DECISIONS.md, "Share buttons and shared lists").
const o = (source: string, cents: number, extra: Partial<Offer> = {}): Offer => ({ source, market: "US", currency: "USD", cents, inStock: true, url: "", title: "", ...extra });

test("every shared link carries utm_source=share and its medium", () => {
  assert.equal(shareUrl("https://example.com", "/card/x", "card"), "https://example.com/card/x?utm_source=share&utm_medium=card");
  assert.equal(shareUrl("https://example.com", "/list?i=1.2", "list"), "https://example.com/list?i=1.2&utm_source=share&utm_medium=list");
});

test("the price gap is one market's real spread between two sellers, in stock only", () => {
  const g = priceGap([o("ebay", 1000), o("tcgplayer", 400), o("x", 100, { inStock: false }), o("y", 50, { market: "UK", currency: "GBP" })], "US")!;
  assert.equal(g.low.cents, 400);
  assert.equal(g.high.cents, 1000);
  assert.equal(g.pct, 60);
  assert.equal(priceGap([o("ebay", 400), o("ebay", 900)], "US"), null, "one seller is no comparison");
  assert.equal(priceGap([o("ebay", 400), o("tcgplayer", 400)], "US"), null);
  assert.equal(priceGap([], "US"), null);
  assert.match(shareText("Card", g, (c) => `$${c / 100}`), /\$4 at TCGplayer, up to \$10 elsewhere \(60% less\)/);
});

test("a shared list round-trips ids and quantities and refuses junk", () => {
  assert.equal(encodeList([{ id: 12, qty: 4 }, { id: 7, qty: 1 }]), "12*4.7");
  assert.deepEqual(decodeList("12*4.7.junk.12*2.<script>"), [{ id: 12, qty: 6 }, { id: 7, qty: 1 }]);
  assert.deepEqual(decodeList(null), []);
  assert.equal(decodeList(Array.from({ length: 500 }, (_, i) => i + 1).join(".")).length, 100);
});

test("the shared list page stays out of the index and share links stay fetchable", () => {
  assert.match(fs.readFileSync("src/app/list/page.tsx", "utf8"), /robots: \{ index: false/);
  const all = [robots().rules].flat().find((r) => r.userAgent === "*")!;
  assert.ok([all.allow].flat().includes("/*utm_source=share"));
});

test("the share button and the arrival counter are on the card page, the quick view and every page", () => {
  assert.match(fs.readFileSync("src/app/card/[slug]/page.tsx", "utf8"), /<ShareButton /);
  assert.match(fs.readFileSync("src/components/QuickView.tsx", "utf8"), /<ShareButton /);
  assert.match(fs.readFileSync("src/app/layout.tsx", "utf8"), /<ShareArrival \/>/);
  assert.match(fs.readFileSync("src/app/card/[slug]/opengraph-image.tsx", "utf8"), /export const generateStaticParams = \(\) => \[\];/);
});
