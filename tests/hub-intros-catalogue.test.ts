import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CATALOGUE_HUB_INTROS } from "../src/lib/content/hub-intros-catalogue";
import { HUB_INTROS, hubIntro } from "../src/lib/content/hub-intros";
import { POSTS } from "../src/lib/blog";

const LINK = /\[([^\]]+)\]\(([^)\s]*)\)/g;
const routes = new Set(["/market", "/movers", "/price-guide", "/sets", "/sealed", "/leaders", "/colors", "/deck", "/tools/box-ev", "/tools/best-basket", "/blog"]);

test("every catalogue hub has an intro, and HUB_INTROS carries them", () => {
  for (const p of ["/market", "/movers", "/price-guide", "/sets", "/sealed", "/leaders", "/colors"]) {
    assert.ok(CATALOGUE_HUB_INTROS[p], p);
    assert.equal(hubIntro(p).length >= 2, true, p);
    assert.equal(HUB_INTROS[p], CATALOGUE_HUB_INTROS[p]);
  }
});

test("links are internal single-slash paths that resolve to a page or a published post", () => {
  const slugs = new Set(POSTS.map((p) => p.slug));
  for (const [route, intro] of Object.entries(CATALOGUE_HUB_INTROS)) {
    for (const para of intro.paragraphs) {
      for (const m of para.matchAll(LINK)) {
        const href = m[2];
        assert.match(href, /^\/(?!\/)/, `${route}: ${href}`);
        const ok = routes.has(href) || (href.startsWith("/blog/") && slugs.has(href.slice(6)));
        assert.ok(ok, `${route} links to ${href}`);
      }
    }
  }
});

test("no sentence appears in two intros, and none names a number a constant owns", () => {
  const seen = new Map<string, string>();
  for (const [route, intro] of Object.entries(CATALOGUE_HUB_INTROS)) {
    for (const s of intro.paragraphs.join(" ").replace(LINK, "$1").split(/(?<=[.!?])\s+/)) {
      const k = s.trim().toLowerCase();
      assert.ok(!seen.has(k) || seen.get(k) === route, `"${s}" is in ${seen.get(k)} and ${route}`);
      seen.set(k, route);
    }
    assert.doesNotMatch(intro.paragraphs.join(" "), /Riftbound|RiftCompare|\bOP\d{2}\b/);
  }
});

test("each intro is short enough that the page still starts near the top", () => {
  for (const [route, intro] of Object.entries(CATALOGUE_HUB_INTROS)) assert.ok(intro.paragraphs.join(" ").split(/\s+/).length <= 130, route);
});

test("the catalogue pages render the intro", () => {
  const root = path.resolve(__dirname, "..");
  
  for (const f of ["sets", "leaders", "colors", "sealed", "price-guide", "market", "movers"].map((x) => `src/app/${x}/page.tsx`)) assert.match(fs.readFileSync(path.join(root, f), "utf8"), /HubIntro/, f);
});
