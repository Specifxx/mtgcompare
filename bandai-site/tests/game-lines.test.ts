import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// SITE.lines (2026-11-03): several TCGplayer categories in one catalogue.
// Single-game sites must behave exactly as before.
test("game lines: set slugs stay plain on single-game sites and never collide on multi-game ones", async () => {
  const { uniqueSetSlug } = await import("@/lib/import/tcgcsv");
  const used = new Set<string>();
  // No line: the plain slug, even twice (unchanged behaviour).
  assert.equal(uniqueSetSlug("Promotion Cards", undefined, used), "promotion-cards");
  assert.equal(uniqueSetSlug("Promotion Cards", undefined, used), "promotion-cards");
  const multi = new Set<string>();
  assert.equal(uniqueSetSlug("Promotion Cards", "a", multi), "promotion-cards");
  assert.notEqual(uniqueSetSlug("Promotion Cards", "b", multi), "promotion-cards");
});

test("game lines: eBay words and TCGplayer links follow the set's game, else the site's", async () => {
  const { SITE } = await import("@/site.config");
  const { ebayQueryOf, tcgplayerSlugOf, LINES } = await import("@/lib/lines");
  assert.equal(ebayQueryOf(null), SITE.ebay.query);
  assert.equal(tcgplayerSlugOf({}), SITE.tcgplayerSlug);
  for (const l of LINES) {
    assert.equal(ebayQueryOf({ line: l.id }), l.ebayQuery);
    assert.equal(tcgplayerSlugOf({ line: l.id }), l.tcgplayerSlug);
    assert.match(l.slug, /^[a-z0-9-]+$/);
  }
  assert.equal(new Set(LINES.map((l) => l.id)).size, LINES.length);
  assert.equal(new Set(LINES.map((l) => l.tcgcsvCategoryId)).size, LINES.length);
});

test("game lines: the hubs are cached like every page and listed in the sitemap", () => {
  for (const f of ["src/app/games/page.tsx", "src/app/games/[slug]/page.tsx"]) assert.match(fs.readFileSync(f, "utf8"), /export const revalidate = 86400;/);
  assert.match(fs.readFileSync("src/app/games/[slug]/page.tsx", "utf8"), /generateStaticParams = \(\) => \[\]/);
  assert.match(fs.readFileSync("src/app/sitemap.ts", "utf8"), /\/games\//);
});
