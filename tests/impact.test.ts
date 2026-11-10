import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { awinProgrammeFor, awinUrl, impactBase, impactDeepLink, impactJoined, isAwinLink, isImpactLink } from "../src/lib/awin";

// Impact brands ride the Awin list (owner, 2026-11-10): an accepted brand's link becomes its tracked deep link.
const IMPACT = impactJoined({ joined: [{ id: 9383, name: "Example Brand", domains: ["example-brand.com"], link: "https://goto.example-brand.com/c/7385758/565706/9383/" }] });
const AWIN = [{ id: 1599, name: "Example", domains: ["example-store.co.uk"] }];

test("an accepted Impact brand's link becomes its tracked deep link to the same page", () => {
  const url = "https://www.example-brand.com/ip/123?x=1";
  const u = new URL(awinUrl(url, "site-row", [...AWIN, ...IMPACT])!);
  assert.equal(u.origin + u.pathname, "https://goto.example-brand.com/c/7385758/565706/9383");
  assert.equal(u.searchParams.get("u"), url);
  assert.equal(u.searchParams.get("sharedid"), "site-row");
  assert.ok(isImpactLink(u.toString()) && isAwinLink(u.toString()));
});

test("Awin entries are untouched and other stores stay untracked", () => {
  assert.equal(new URL(awinUrl("https://www.example-store.co.uk/p", "r", [...AWIN, ...IMPACT])!).hostname, "www.awin1.com");
  assert.equal(awinUrl("https://other.example/p", "r", IMPACT), null);
  assert.equal(awinUrl("https://example-brand.com.evil.example/p", "r", IMPACT), null);
});

test("only our own Impact accounts' tracking links are ever used", () => {
  assert.equal(impactBase("https://goto.example.com/c/1234567/1/2"), null);
  assert.equal(impactBase("http://goto.example.com/c/7385758/1/2"), null);
  assert.equal(impactBase("https://goto.example.com/x/7385758/1/2"), null);
  assert.equal(impactBase("https://topps.sjv.io/c/8139279/1/2"), "https://topps.sjv.io/c/8139279/1/2");
  assert.equal(impactDeepLink("https://evil.example/c/1/2/3", "https://a.example/", "r"), null);
  assert.deepEqual(impactJoined({ joined: [{ id: 1, name: "x", domains: ["x.com"], link: "https://evil.example/c/1/2/3" }] }), []);
  assert.deepEqual(impactJoined(null), []);
});

test("TCGplayer, eBay and Amazon never take an Impact entry", () => {
  const bad = impactJoined({ joined: [{ id: 1, name: "x", domains: ["tcgplayer.com", "ebay.com", "amazon.com"], link: "https://x.example/c/7385758/1/2" }] });
  for (const url of ["https://www.tcgplayer.com/product/1", "https://www.ebay.com/itm/1", "https://www.amazon.com/dp/B0"]) assert.equal(awinProgrammeFor(url, bad), null);
});

test("a link already on Impact keeps its tracking and gains our sharedid once", () => {
  const out = awinUrl("https://goto.example-brand.com/c/7385758/565706/9383?u=https%3A%2F%2Fexample-brand.com%2F", "r", IMPACT)!;
  assert.equal(new URL(out).searchParams.get("sharedid"), "r");
  const again = awinUrl(out, "other", IMPACT)!;
  assert.equal(new URL(again).searchParams.get("sharedid"), "r");
});

test("the committed Impact list is a list", () => {
  const f = JSON.parse(readFileSync("src/lib/impact-programmes.json", "utf8"));
  assert.ok(Array.isArray(f.joined));
});
