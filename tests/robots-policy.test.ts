import { test } from "node:test";
import assert from "node:assert/strict";
import robots from "../src/app/robots";

test("robots lists the sitemap index and news sitemap, never a child, and blocks private paths", () => {
  const r = robots();
  const maps = ([] as string[]).concat(r.sitemap ?? []);
  assert.ok(maps.some((m) => m.endsWith("/sitemap.xml")) && maps.some((m) => m.endsWith("/news-sitemap.xml")));
  assert.ok(!maps.some((m) => m.includes("/sitemaps/")));
  const star = (Array.isArray(r.rules) ? r.rules : [r.rules]).find((x) => x.userAgent === "*")!;
  assert.deepEqual(star.disallow, ["/api/", "/admin", "/login", "/premium/welcome", "/*?"]);
  // Query-string URLs are not crawled (2026-10-16): no sitemap URL carries one and each canonicalises to its bare URL (the card page's ?finish= link above
  // all). Next's assets (?dpl=), the share images (opengraph-image?<hash>) and the icons stay crawlable: an Allow longer than "/*?" wins.
  for (const a of ["/", "/_next/", "/*opengraph-image", "/icon"]) assert.ok((star.allow as string[]).includes(a), `* must allow ${a}`);
  const blocked = (Array.isArray(r.rules) ? r.rules : [r.rules]).filter((x) => x.disallow === "/").flatMap((x) => ([] as string[]).concat(x.userAgent ?? []));
  for (const bot of ["Googlebot", "Bingbot", "bingbot", "AhrefsBot", "SemrushBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot", "DuckDuckBot", "Applebot"]) assert.ok(!blocked.includes(bot), `${bot} must not be blocked`);
});
