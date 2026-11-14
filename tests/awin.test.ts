import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { awinProgrammeFor, awinUrl, AWIN_PUBLISHER_ID } from "../src/lib/awin";

const JOINED = [{ id: 1599, name: "Example", domains: ["example-store.co.uk"] }];

test("a joined advertiser's link becomes a tracked Awin deep link to the same page", () => {
  const url = "https://www.example-store.co.uk/p/1?utm_source=x";
  const u = new URL(awinUrl(url, "row", JOINED)!);
  assert.equal(u.hostname, "www.awin1.com");
  assert.equal(u.searchParams.get("awinmid"), "1599");
  assert.equal(u.searchParams.get("awinaffid"), String(AWIN_PUBLISHER_ID));
  assert.equal(u.searchParams.get("ued"), url);
});

test("other stores, look-alikes, eBay and Amazon are left alone", () => {
  assert.equal(awinUrl("https://other.example/p", "row", JOINED), null);
  assert.equal(awinUrl("https://example-store.co.uk.evil.example/p", "row", JOINED), null);
  assert.equal(awinProgrammeFor("https://www.ebay.com/itm/1", [{ id: 2, name: "x", domains: ["ebay.com"] }]), null);
  assert.equal(awinProgrammeFor("https://www.amazon.com/dp/B0", [{ id: 2, name: "x", domains: ["amazon.com"] }]), null);
});

test("the committed Awin list is an empty, public-only default and the build fetches the real one first", () => {
  const f = JSON.parse(readFileSync("src/lib/awin-programmes.json", "utf8"));
  assert.equal(f.publisherId, AWIN_PUBLISHER_ID);
  assert.ok(Array.isArray(f.joined));
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(pkg.scripts.build, /tsx scripts\/fetch-awin\.ts \|\| true/);
});

test("offerLink sends a store that accepted us on Awin through its deep link, sponsored", () => {
  const src = readFileSync("src/lib/affiliate.ts", "utf8");
  assert.match(src, /const awin = awinUrl\(url, clickref\("mtg", region, placement\)\);\n\s+if \(awin\) return \{ href: awin, rel: REL_SPONSORED, sponsored: true \};/);
});

test("Cardboard Hero (GoAffPro): a link to its own site gains our referral code, other stores do not", async () => {
  const { directReferralUrl } = await import("../src/lib/awin");
  assert.equal(awinUrl("https://cardboardhero.com/products/box?utm_source=x", "ref1"), "https://cardboardhero.com/products/box?utm_source=x&ref=apthvqnu");
  assert.equal(awinUrl("https://www.cardboardhero.com/products/box", "ref1"), "https://www.cardboardhero.com/products/box?ref=apthvqnu");
  assert.equal(directReferralUrl("https://cardboardhero.com/?ref=other"), "https://cardboardhero.com/?ref=other");
  assert.equal(awinUrl("https://notcardboardhero.com/products/box", "ref1"), null);
  assert.equal(directReferralUrl("https://cardboardhero.com.evil.example/x"), null);
});
