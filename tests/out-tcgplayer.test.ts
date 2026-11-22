import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeBot } from "../src/lib/bot-click";
import { GET } from "../src/app/out/tcgplayer/route";

const human = { "user-agent": "Mozilla/5.0 (Macintosh) Chrome/120", "accept-language": "en-US", "sec-fetch-mode": "navigate", "sec-fetch-site": "same-origin" };
const u = encodeURIComponent("https://www.tcgplayer.com/product/1");
const call = (h: Record<string, string>, qs = `u=${u}&sharedid=rc-us-card`) => GET(new Request(`https://mtgcompare.app/out/tcgplayer?${qs}`, { headers: h }));

test("a person is sent to Impact with the sub-id", () => {
  const r = call(human);
  assert.equal(r.status, 302);
  assert.match(r.headers.get("location")!, /^https:\/\/partner\.tcgplayer\.com\/.*sharedid=rc-us-card/);
  assert.match(r.headers.get("x-robots-tag")!, /noindex/);
  assert.match(r.headers.get("cache-control")!, /no-store/);
});

test("a declared bot goes to TCGplayer untagged", () => {
  for (const h of [{ ...human, "user-agent": "Googlebot/2.1" }, { ...human, "user-agent": "python-requests/2.32" }, { ...human, "user-agent": "" }]) {
    assert.ok(looksLikeBot(new Headers(h)));
    assert.equal(call(h).headers.get("location"), "https://www.tcgplayer.com/product/1");
  }
});

test("owner, 2026-11-22: a real person is never untagged, whatever headers their browser leaves out", () => {
  const people: Record<string, string>[] = [
    { ...human, "sec-fetch-site": "cross-site" },
    { ...human, "sec-fetch-site": "none" },
    { "user-agent": human["user-agent"] },
    { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.6 Mobile/15E148 Safari/604.1", "accept-language": "en-AU" },
  ];
  for (const h of people) {
    assert.equal(looksLikeBot(new Headers(h)), false);
    assert.match(call(h).headers.get("location")!, /^https:\/\/partner\.tcgplayer\.com\/.*sharedid=rc-us-card/);
  }
});

test("not an open redirect", () => {
  assert.equal(call(human, `u=${encodeURIComponent("https://evil.example/")}`).headers.get("location"), "/");
  assert.equal(call(human, `u=${encodeURIComponent("http://www.tcgplayer.com/x")}`).headers.get("location"), "/");
  assert.equal(call(human, "").headers.get("location"), "/");
});
