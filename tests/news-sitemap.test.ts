import { test } from "node:test";
import assert from "node:assert/strict";
import { newsSitemapXml, recentNewsPosts, xmlEscape } from "../src/lib/news-sitemap";
import { llmsFull } from "../src/lib/llms-full";

const P = (slug: string, date: string, category?: "blog" | "guide") => ({ slug, title: `T ${slug} & <co>`, date, category });
const now = new Date("2026-10-04T12:00:00Z");

test("only dated blog posts from the last two days, newest first; guides and the future never", () => {
  const posts = [P("today", "2026-10-04"), P("yesterday", "2026-10-03"), P("two", "2026-10-02"), P("old", "2026-10-01"), P("guide", "2026-10-04", "guide"), P("future", "2026-10-09")];
  assert.deepEqual(recentNewsPosts(posts, now).map((p) => p.slug), ["today", "yesterday", "two"]);
  assert.deepEqual(recentNewsPosts([], now), []);
});

test("the XML is a Google News urlset with escaped titles and the post's own URL", () => {
  const xml = newsSitemapXml([P("a", "2026-10-04")]);
  assert.match(xml, /xmlns:news="http:\/\/www\.google\.com\/schemas\/sitemap-news\/0\.9"/);
  assert.match(xml, /<loc>https:\/\/[^<]+\/blog\/a<\/loc>/);
  assert.match(xml, /<news:title>T a &amp; &lt;co&gt;<\/news:title>/);
  assert.match(xml, /<news:publication_date>2026-10-04<\/news:publication_date>/);
  assert.equal(xmlEscape(`a&b<c>"d"'e'`), "a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;");
  assert.match(newsSitemapXml([]), /<urlset[^>]*><\/urlset>$/);
});

test("llms-full lists only what the data has", () => {
  const card = (id: number, usd: number | null) => ({ id, slug: `c${id}`, name: `C${id}`, number: `OP01-00${id}`, variant: null, marketUsd: usd }) as never;
  const out = llmsFull({
    siteName: "OP Compare", siteUrl: "https://x.test", description: "d",
    cards: [card(1, 500), card(2, null), card(3, 900)],
    sets: [{ id: 1, slug: "op01", code: "OP01", name: "Romance Dawn", kind: "booster", releasedOn: "2022-12-02", cardCount: 3, sealedCount: 0 }, { id: 2, slug: "op99", code: "OP99", name: "Future", kind: "booster", releasedOn: "2999-01-01", cardCount: 0, sealedCount: 0 }],
    storesByMarket: { US: 12, AU: 4 }, guides: [{ title: "G", href: "/guides/g", description: "about g" }], index: { day: "2026-10-04", value: 1042.37 }, pricesAt: "2026-10-04T00:00:00Z",
  });
  assert.match(out, /1\. \[C3 OP01-003\]\(https:\/\/x\.test\/card\/c3\): US\$9\.00/);
  assert.doesNotMatch(out, /C2/); // unpriced: not a "most valuable" card
  assert.match(out, /Romance Dawn \(OP01\)\]\(https:\/\/x\.test\/sets\/op01\), released 2022-12-02/);
  assert.match(out, /## Upcoming\n- \[Future \(OP99\)\]/);
  assert.match(out, /United States \(USD\): 12 stores/);
  assert.match(out, /Singapore \(SGD\): 0 stores/);
  assert.match(out, /Index was 1042\.4 on 2026-10-04/);
  assert.match(out, /\[G\]\(https:\/\/x\.test\/guides\/g\): about g/);
});
