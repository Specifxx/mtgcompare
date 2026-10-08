import { test } from "node:test";
import assert from "node:assert/strict";
import { storeBadgeSnippet, storeBadgeSvg } from "../src/lib/store-badge";

test("store badge links to the store page and hosts nothing remote", () => {
  const s = storeBadgeSnippet("cardkingdom", "https://example.test");
  assert.match(s, /href="https:\/\/example\.test\/stores\/cardkingdom"/);
  assert.ok(!/src="https?:/.test(s));
  assert.match(storeBadgeSvg(), /Listed on MTG Compare/);
});
