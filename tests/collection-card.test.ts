import { test } from "node:test";
import assert from "node:assert/strict";
import { cardLink, cardModel } from "../src/components/vault/collection-card";

// More shareable artefacts (DECISIONS.md, 2026-11-18): My collection's share picture.
test("the collection card carries the visitor's own totals, three items at most, and a tagged link", () => {
  const m = cardModel({ site: "Site", what: "sealed", host: "example.com", total: "$1,234.00", change: { up: true, text: "$100.00 (+9%) since I added them" }, units: 7, market: "US", top: [1, 2, 3, 4].map((n) => ({ name: `A very long product name number ${n} that goes on`, price: "$10.00" })), date: new Date("2026-11-18T00:00:00Z") });
  assert.equal(m.top.length, 3);
  assert.ok(m.top.every((t) => t.name.length <= 30));
  assert.equal(m.meta, "7 items · US store prices · Nov 18, 2026");
  assert.equal(m.footer, "Track yours free at example.com");
  assert.equal(cardLink("https://example.com"), "https://example.com/?utm_source=share&utm_medium=collection&utm_campaign=collection-card");
});
