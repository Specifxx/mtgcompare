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

test("a bot goes to TCGplayer untagged", () => {
  for (const h of [
    { ...human, "user-agent": "Googlebot/2.1" },
    { ...human, "sec-fetch-site": "cross-site" },
    { ...human, "sec-fetch-site": "none" },
    { "user-agent": human["user-agent"] },
  ]) {
    assert.ok(looksLikeBot(new Headers(h)));
    assert.equal(call(h).headers.get("location"), "https://www.tcgplayer.com/product/1");
  }
});

test("not an open redirect", () => {
  assert.equal(call(human, `u=${encodeURIComponent("https://evil.example/")}`).headers.get("location"), "/");
  assert.equal(call(human, `u=${encodeURIComponent("http://www.tcgplayer.com/x")}`).headers.get("location"), "/");
  assert.equal(call(human, "").headers.get("location"), "/");
});
