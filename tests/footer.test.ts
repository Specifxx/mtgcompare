import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SISTER_SITES } from "../src/lib/site";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("footer: the other games' sites, as plain followed links with descriptive anchors (never this site itself)", () => {
  assert.deepEqual(
    SISTER_SITES.map((s) => s.url),
    ["https://riftcompare.com", "https://opcompare.app", "https://www.dexcompare.app", "https://gundamcompare.com", "https://lorcanacompare.com", "https://ygocompare.com", "https://wargamecompare.com", "https://figurecompare.com", "https://www.camcompare.app", "https://www.compareempire.com"],
  );
  for (const s of SISTER_SITES) assert.match(s.anchor, new RegExp(`^${s.game}\\b.*prices$`), s.name);
  const footer = src("src/components/Footer.tsx");
  assert.match(footer, /SISTER_SITES\.map/);
  assert.match(footer, /rel="noopener"/);
  assert.doesNotMatch(footer, /nofollow|sponsored/);
});
