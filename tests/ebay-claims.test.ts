// EPN rules (RiftCompare's ebay-clicks-funnel guard): no guarantee or
// buyer-protection claims anywhere a visitor reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(tsx?|mdx?)$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

test("no money-back or buyer-protection copy in pages or components", () => {
  const hits = [...walk(path.join(ROOT, "src/app")), ...walk(path.join(ROOT, "src/components"))]
    .filter((f) => /money.?back|buyer protection/i.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f));
  assert.deepEqual(hits, []);
});

// With no eBay secrets the site must read as it did before the eBay API: copy
// that says we collect eBay prices sits behind a flag that comes from data
// (getSiteStats().ebayLive, src/lib/data/site.ts: a successful eBay run in the last 3 days).
test("eBay-collection copy is gated on data, so 'off' keeps the old wording", () => {
  const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\s+/g, " ");
  const gated = (file: string, flag: string, phrase: string) => {
    const src = read(file);
    const at = src.indexOf(phrase);
    assert.ok(at > 0, `${file}: "${phrase}"`);
    const cond = src.lastIndexOf(`${flag} ?`, at);
    assert.ok(cond > 0 && at - cond < 400, `${file}: "${phrase}" must sit inside {${flag} ? … }`);
  };
  gated("src/components/PriceBoard.tsx", "hasEbayRow", "eBay&apos;s Buy It Now listings");
  gated("src/lib/home-faq.ts", "opts.ebayLive", "the cheapest matching eBay listing");
  gated("src/components/home/RegionHome.tsx", "ebayLive", "plus the cheapest matching eBay listing");
  gated("src/app/methodology/page.tsx", "ebayLive", "We search eBay four times a day");
  gated("src/app/methodology/page.tsx", "ebayLive", "an eBay row shows the postage eBay states");
  gated("src/app/about/page.tsx", "ebayLive", "eBay prices are the cheapest matching Buy It Now listing");
  gated("src/app/editorial-policy/page.tsx", "ebayLive", "eBay listing prices");
  // The flag is data: a recent successful ImportRun of kind "ebay" that completed a search (an observe-only or budget-stopped run reads the quota and searches nothing).
  const data = read("src/lib/data/site.ts");
  assert.match(data, /return runs\.some\(\(r\) => completedSearches\(r\.summary\) > 0\)/);
  assert.match(data, /kind: "ebay", ok: true, finishedAt: \{ gte:/);
});

test("a run that searched nothing never makes eBay live", async () => {
  const { completedSearches } = await import("../src/lib/data/site");
  assert.equal(completedSearches({ stop: "observe-only", spent: 0, completed: 0 }), 0);
  assert.equal(completedSearches({ spent: 3, partial: true }), 0);
  assert.equal(completedSearches(null), 0);
  assert.equal(completedSearches({ completed: "12" }), 0);
  assert.equal(completedSearches({ completed: Number.NaN }), 0);
  assert.equal(completedSearches({ spent: 410, completed: 377 }), 377);
});
