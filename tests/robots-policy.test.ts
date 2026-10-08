import { test } from "node:test";
import assert from "node:assert/strict";
import robots from "../src/app/robots";

test("robots lists the sitemap index and news sitemap, never a child, and blocks private paths", () => {
  const r = robots();
  const maps = ([] as string[]).concat(r.sitemap ?? []);
  assert.ok(maps.some((m) => m.endsWith("/sitemap.xml")) && maps.some((m) => m.endsWith("/news-sitemap.xml")));
  assert.ok(!maps.some((m) => m.includes("/sitemaps/")));
  const star = (Array.isArray(r.rules) ? r.rules : [r.rules]).find((x) => x.userAgent === "*")!;
  assert.deepEqual(star.disallow, ["/api/", "/admin", "/login", "/premium/welcome"]);
});
