import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AUTHORS, POSTS, postHref } from "../src/lib/blog";
import { BLOG_PICKS, GUIDE_PICKS } from "../src/lib/content/featured";
import { guidesForCatalogue } from "../src/lib/content/catalogue-guides";

test("guides are served at /guides, everything else at /blog", () => {
  assert.equal(postHref({ slug: "x", category: "guide" }), "/guides/x");
  assert.equal(postHref({ slug: "x" }), "/blog/x");
  assert.equal(postHref({ slug: "x", category: "blog" }), "/blog/x");
});

test("the evergreen rarities, where-to-buy and cheaper-abroad posts are guides, with FAQs and unique slugs", () => {
  const bySlug = new Map(POSTS.map((p) => [p.slug, p]));
  assert.equal(new Set(POSTS.map((p) => p.slug)).size, POSTS.length);
  for (const s of ["magic-card-rarities-explained", "where-to-buy-magic-cards", "are-magic-cards-cheaper-abroad"]) {
    assert.equal(bySlug.get(s)?.category, "guide", s);
    assert.ok((bySlug.get(s)?.faq?.length ?? 0) >= 4, s);
  }
  assert.equal(bySlug.get("where-to-buy-magic-cards")?.marketData, true);
});

test("a post's FAQ answers are plain prose with only internal links", () => {
  for (const p of POSTS) for (const f of p.faq ?? []) {
    assert.ok(f.q.endsWith("?") && f.a.length > 40, `${p.slug}: ${f.q}`);
    for (const m of f.a.matchAll(/\]\(([^)]*)\)/g)) assert.match(m[1], /^\/(?!\/)/);
  }
});

test("editor's picks name published posts in the category their list says", () => {
  const bySlug = new Map(POSTS.map((p) => [p.slug, p]));
  for (const s of GUIDE_PICKS) assert.equal(bySlug.get(s)?.category, "guide", s);
  for (const s of BLOG_PICKS) assert.notEqual(bySlug.get(s)?.category, "guide", s);
});

test("related-guide links resolve to a post's real href", () => {
  for (const route of ["card", "sealed", "sets", "price-guide", "market", "movers"] as const) {
    for (const g of guidesForCatalogue(route)) {
      const p = POSTS.find((x) => x.slug === g.slug)!;
      assert.equal(g.href, postHref(p));
    }
  }
});

test("authors are a file with unique slugs; the sitemap, feeds and llms.txt follow postHref", () => {
  assert.equal(new Set(AUTHORS.map((a) => a.slug)).size, AUTHORS.length);
  const root = path.resolve(__dirname, "..");
  for (const f of ["src/app/sitemaps/[section]/route.ts", "src/app/feed.xml/route.ts", "src/app/feed.json/route.ts", "src/app/llms.txt/route.ts"]) assert.match(fs.readFileSync(path.join(root, f), "utf8"), /postHref/, f);
  assert.match(fs.readFileSync(path.join(root, "src/app/robots.ts"), "utf8"), /news-sitemap\.xml/);
});
