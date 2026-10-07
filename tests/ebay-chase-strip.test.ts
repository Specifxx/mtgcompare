import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");

test("the chase strip is on the homepage and never calls eBay or the database", () => {
  assert.match(read("src/app/page.tsx"), /<EbayChase page="home"/);
  for (const f of ["src/components/EbayChase.tsx", "src/components/EbayChaseStrip.tsx"]) {
    const src = read(f);
    assert.doesNotMatch(src, /@\/lib\/db|ebay-api|api\.ebay\.com/);
  }
  const strip = read("src/components/EbayChaseStrip.tsx");
  assert.match(strip, /data-ad-placement/); // ad-free members never see it
  assert.match(strip, /AffiliateDisclosure/);
  assert.match(strip, /outboundRel\(\)/);
});

test("the strip reads only the cached loader, and the homepage stays static", () => {
  assert.match(read("src/components/EbayChase.tsx"), /getChaseStrip/);
  assert.doesNotMatch(read("src/components/EbayChase.tsx"), /getCountry|cookies\(|headers\(/);
});
