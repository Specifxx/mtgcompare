import { test } from "node:test";
import assert from "node:assert/strict";
import { cardPostText } from "../src/lib/share";

test("post text carries the real price and link; a missing price is left out", () => {
  const t = cardPostText({ name: "Sol Ring", slug: "sol-ring", setCode: "C21", number: "263", marketUsd: 150, change7d: -2.5 }, "https://example.test");
  assert.match(t, /Sol Ring \(C21 263\) is US\$1\.50 on TCGplayer \(market\), down 2\.5% this week/);
  assert.match(t, /https:\/\/example\.test\/card\/sol-ring/);
  assert.ok(!/\$/.test(cardPostText({ name: "The One Ring", slug: "the-one-ring", marketUsd: null }, "https://example.test")));
});
