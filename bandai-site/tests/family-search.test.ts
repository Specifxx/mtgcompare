import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SITE } from "../src/site.config";
import { familySearchLinks } from "../src/lib/family-search";

test("searching another game: each card-game sister site's own search, on its own host, nofollow", () => {
  const links = familySearchLinks(SITE.sisterSites, "Charizard ex");
  assert.ok(links.length >= 5, "every card-game sister site names its search");
  for (const l of links) {
    const site = SITE.sisterSites.find((s) => s.name === l.name)!;
    assert.equal(new URL(l.href).host, new URL(site.url).host, l.href);
    assert.equal(new URL(l.href).searchParams.get("q"), "Charizard ex", l.href);
  }
  assert.ok(!links.some((l) => /CamCompare|Compare Empire/.test(l.name)), "card games only");
  assert.deepEqual(familySearchLinks(SITE.sisterSites, "  "), []);
  assert.match(readFileSync("src/components/FamilySearch.tsx", "utf8"), /rel="noopener nofollow"/);
});
