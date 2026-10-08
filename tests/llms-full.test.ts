import { test } from "node:test";
import assert from "node:assert/strict";
import { llmsFull } from "../src/lib/llms-full";

const base = { siteName: "MTG Compare", siteUrl: "https://example.test", description: "d", storesByMarket: { US: 3 }, guides: [{ title: "G", href: "/guides/g", description: "x" }], index: { day: "2026-10-07", value: 1012.34 }, pricesAt: "2026-10-08T05:00:00Z" };

test("llms-full lists only what the data has", () => {
  const out = llmsFull({
    ...base,
    cards: [
      { slug: "the-one-ring", name: "The One Ring", number: "246", label: null, marketUsd: 7500 },
      { slug: "sol-ring", name: "Sol Ring", number: "263", label: null, marketUsd: 150 },
      { slug: "lightning-bolt", name: "Lightning Bolt", number: "1", label: null, marketUsd: null },
    ],
    sets: [
      { slug: "the-lord-of-the-rings", name: "The Lord of the Rings", code: "LTR", kind: "expansion", releasedOn: "2023-06-23" },
      { slug: "pltr", name: "Promos", code: "PLTR", kind: "promo", releasedOn: "2023-06-23" },
      { slug: "future", name: "Future Set", code: "FUT", kind: "expansion", releasedOn: "2027-01-01" },
    ] as never,
    totals: { cards: 3, sets: 3 },
  });
  assert.match(out, /1\. \[The One Ring 246\]\(https:\/\/example\.test\/card\/the-one-ring\): US\$75\.00/);
  assert.match(out, /2\. \[Sol Ring 263\]/);
  assert.ok(!out.includes("Lightning Bolt"));
  assert.match(out, /- \[The Lord of the Rings \(LTR\)\]\(.*\), released 2023-06-23/);
  assert.ok(!out.includes("PLTR"));
  assert.match(out, /## Upcoming\n- \[Future Set \(FUT\)\]/);
  assert.match(out, /1012\.3 on 2026-10-07/);
  assert.match(out, /United States.*: 3 stores/);
});
