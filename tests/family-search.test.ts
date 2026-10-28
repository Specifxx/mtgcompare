import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { familySearchLinks } from "../src/lib/family-search";

test("searching another game: the other six card-game sites' own searches, never this one, nofollow", () => {
  const links = familySearchLinks("Pikachu ex");
  assert.equal(links.length, 6);
  assert.ok(!links.some((l) => l.key === "mtg"));
  for (const l of links) {
    assert.equal(new URL(l.href).protocol, "https:");
    assert.equal(new URL(l.href).searchParams.get("q"), "Pikachu ex", l.href);
  }
  assert.deepEqual(familySearchLinks("  "), []);
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  assert.match(read("src/components/FamilySearch.tsx"), /rel="noopener nofollow"/);
  assert.match(read("src/components/BrowseGrid.tsx"), /\{qOn && <FamilySearch q=\{q\}/);
});
