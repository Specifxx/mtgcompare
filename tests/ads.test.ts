import { test } from "node:test";
import assert from "node:assert/strict";
import { adsTxtBody, adsenseLoaderSrc, parseAdsenseClientId } from "../src/lib/adsense";
import { parseCreatives } from "../src/lib/tcgplayer-creatives";

test("a publisher id is ca-pub- plus 16 digits, or nothing; it never throws", () => {
  assert.equal(parseAdsenseClientId("ca-pub-1234567890123456"), "ca-pub-1234567890123456");
  assert.equal(parseAdsenseClientId(" ca-pub-1234567890123456 "), "ca-pub-1234567890123456");
  for (const bad of [undefined, null, "", "pub-1234567890123456", "ca-pub-123", "ca-pub-12345678901234567"]) assert.equal(parseAdsenseClientId(bad), null);
});

test("ads.txt is the seller line, and only with an id", () => {
  assert.equal(adsTxtBody(null), null);
  assert.equal(adsTxtBody("ca-pub-1234567890123456"), "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  assert.match(adsenseLoaderSrc("ca-pub-1234567890123456"), /adsbygoogle\.js\?client=ca-pub-1234567890123456$/);
});

test("this build has no AdSense id, so every slot is a house promo", async () => {
  const m = await import("../src/lib/adsense");
  if (!process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID) {
    assert.equal(m.AD_UNITS_ENABLED, false);
    assert.equal(m.ADSENSE_CLIENT_ID, null);
  }
});

test("TCGplayer creative ids come only from the owner's env, malformed ones dropped", () => {
  assert.deepEqual(parseCreatives("3841228:336x280, 3841229:728x90"), [{ id: "3841228", w: 336, h: 280 }, { id: "3841229", w: 728, h: 90 }]);
  assert.deepEqual(parseCreatives("abc:1x1,12:3x4,3841228:336"), []);
  assert.deepEqual(parseCreatives(undefined), []);
});
