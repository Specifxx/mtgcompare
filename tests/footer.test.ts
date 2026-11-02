import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { footerSisters } from "../src/lib/family-network";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("footer: one short line of the other card-game sites, then the network page (owner, 2026-11-02: the full list was convoluted)", () => {
  assert.deepEqual(
    footerSisters("mtg").map((s) => s.url),
    ["https://riftcompare.com", "https://opcompare.app", "https://dexcompare.app", "https://gundamcompare.com", "https://lorcanacompare.com", "https://ygocompare.com", "https://cyberpunkcompare.com"],
  );
  const footer = src("src/components/Footer.tsx");
  assert.match(footer, /footerSisters\("mtg"\)\.map/);
  assert.match(footer, /NETWORK_PAGE/);
  assert.match(footer, /rel="noopener"/);
  assert.doesNotMatch(footer, /nofollow|sponsored/);
});
