// TCGplayer's Cyber Weekend banner (src/lib/tcgplayer-cyber.ts): when it shows, which creative, and that its copy says no price.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CYBER_BANNER, cyberBannerState, cyberBannerText, pickCreatives, type CyberCreative } from "../src/lib/tcgplayer-cyber";

const t = (iso: string) => Date.parse(iso);

test("the banner shows from 24 Nov until the sale ends at 11PM New York time on 1 Dec", () => {
  assert.equal(cyberBannerState(t("2026-11-23T23:59:59Z")), "off");
  assert.equal(cyberBannerState(t("2026-11-24T00:00:00Z")), "soon");
  assert.equal(cyberBannerState(t("2026-11-28T13:59:59Z")), "soon");
  assert.equal(cyberBannerState(t("2026-11-28T14:00:00Z")), "on");
  assert.equal(cyberBannerState(CYBER_BANNER.end - 1), "on");
  assert.equal(cyberBannerState(CYBER_BANNER.end), "off");
});

test("creatives: this phase's first, a wide and a small, nothing outside the window", () => {
  const all: CyberCreative[] = [
    { adId: 1, width: 728, height: 90 },
    { adId: 2, width: 728, height: 90, phase: "bf" },
    { adId: 3, width: 728, height: 90, phase: "cm" },
    { adId: 4, width: 300, height: 250 },
  ];
  assert.deepEqual(pickCreatives(t("2026-11-27T12:00:00Z"), all), { wide: all[1], small: all[3] });
  assert.deepEqual(pickCreatives(t("2026-11-30T12:00:00Z"), all), { wide: all[2], small: all[3] });
  assert.deepEqual(pickCreatives(t("2026-12-03T00:00:00Z"), all), { wide: null, small: null });
  assert.deepEqual(pickCreatives(t("2026-11-27T12:00:00Z"), []), { wide: null, small: null });
});

test("the banner's own copy claims no price and no discount on a product", () => {
  for (const s of ["soon", "on"] as const) {
    const { head, line } = cyberBannerText(s);
    assert.doesNotMatch(`${head} ${line}`, /\$|lowest|was |price drop|cheapest/i);
  }
});
