import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { priceGap, shareText, shareUrl } from "../src/lib/share-link";

// Word of mouth (DECISIONS.md, "Share buttons", 2026-11-02).
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("every shared link carries utm_source=share and its medium", () => {
  assert.equal(shareUrl("https://mtgcompare.app", "/us/p/x", "product"), "https://mtgcompare.app/us/p/x?utm_source=share&utm_medium=product");
});

test("the price gap needs two stores and a real spread", () => {
  const g = priceGap([{ priceCents: 20000, storeName: "A" }, { priceCents: 15000, storeName: "B" }])!;
  assert.equal(g.pct, 25);
  assert.equal(g.low.storeName, "B");
  assert.equal(priceGap([{ priceCents: 1, storeName: "A" }, { priceCents: 2, storeName: "A" }]), null);
  assert.match(shareText("Box", g, (c) => `$${c / 100}`), /\$150 at B, up to \$200 elsewhere \(25% less\)/);
});

test("the share pieces are wired in: product page, quick view, share card, arrival counter, robots", () => {
  assert.match(read("src/app/[region]/p/[slug]/page.tsx"), /url: `\/og\/p\/\$\{r\.region\}\/\$\{p\.slug\}`/);
  assert.match(read("src/components/QuickView.tsx"), /<ShareButton /);
  assert.match(read("src/app/layout.tsx"), /<ShareArrival \/>/);
  assert.match(read("src/app/robots.ts"), /"\/\*utm_source=share"/);
  assert.match(read("src/app/og/p/[region]/[slug]/route.tsx"), /export const dynamic = "force-dynamic";/);
});

// Share-for-a-deal (owner, 2026-11-18): product, set and guide pages, never the quick view (A/B 20 Nov to 3 Dec).
import { pickShareArm } from "../src/lib/share-link";
test("the share-for-a-deal arm is drawn once, half and half, and kept", () => {
  assert.equal(pickShareArm(null, 0.2), "reward");
  assert.equal(pickShareArm(null, 0.8), "plain");
  assert.equal(pickShareArm("plain", 0.2), "plain");
});
test("the share-for-a-deal offer stays out of the quick view", () => {
  const rd = (f: string) => readFileSync(f, "utf8");
  assert.doesNotMatch(rd("src/components/QuickView.tsx"), /<ShareButton [^>]*deal=/);
  for (const f of ["src/app/[region]/p/[slug]/page.tsx", "src/app/[region]/sets/[set]/page.tsx", "src/app/[region]/guides/[slug]/page.tsx"]) assert.match(rd(f), /<ShareButton [^>]*deal=/, f);
});
