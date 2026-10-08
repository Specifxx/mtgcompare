import { test } from "node:test";
import assert from "node:assert/strict";
import { newsSitemapXml, recentNewsPosts, xmlEscape } from "../src/lib/news-sitemap";
import { postTitle } from "../src/lib/seo";

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

test("a recent post's headline comes from the post and the data's date, not from a catalogue", () => {
  const post = { slug: "p", category: "blog" as const, date: "2026-10-04", title: (ctx: never) => `Most Expensive Magic Cards (${(ctx as { cat: { pricesAt: string } }).cat.pricesAt.slice(0, 7)})` };
  const [one] = recentNewsPosts([{ slug: post.slug, category: post.category, date: post.date, title: postTitle(post, "2026-10-04T00:00:00Z") }], now);
  assert.equal(one!.title, "Most Expensive Magic Cards (2026-10)");
  const xml = newsSitemapXml([one!]);
  assert.match(xml, /<news:title>Most Expensive Magic Cards \(2026-10\)<\/news:title>/);
  assert.match(xml, /<news:name>MTG Compare<\/news:name>/, "the publication is the site");
});
