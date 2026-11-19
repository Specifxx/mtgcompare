import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { checkupLines, CHECKUP_MIN_ITEMS, CHECKUP_SERVICE } from "../src/components/vault/CheckupOffer";

// Collection check-up test (DECISIONS.md "Collection check-up test", 2026-11-19): RiftCompare keeps the request.
test("the check-up posts to RiftCompare's shared route and stores nothing here", () => {
  assert.equal(CHECKUP_SERVICE, "https://riftcompare.com/api/checkup");
  assert.equal(CHECKUP_MIN_ITEMS, 10);
  const src = readFileSync("src/components/vault/CheckupOffer.tsx", "utf8");
  assert.doesNotMatch(src, /localStorage|anthropic/i);
  assert.match(src, /credentials: "omit"/);
});

test("each item becomes one readable line", () => {
  const lines = checkupLines([
    { id: "a", name: "Sheoldred, the Apocalypse (foil)", href: "/x", market: "US", currency: "USD", addedCents: 7000, qty: 2, addedAt: "", set: "dmu", nowCents: 8150 },
  ]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^2x Sheoldred, the Apocalypse \(foil\) \(US, single\) .*81\.50.* each, .*70\.00.* when added$/);
});
