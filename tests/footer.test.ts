import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { footerSisters } from "../src/lib/family-network";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("footer: one link to /our-sites, which lists every other site once by name (2026-11-08: no site-wide keyword cross-links)", () => {
  const footer = src("src/components/Footer.tsx");
  assert.match(footer, /href="\/our-sites"/);
  assert.doesNotMatch(footer, /footerSisters|NETWORK_PAGE|https?:\/\//, "no external site links in the footer");
  const page = src("src/app/(site)/our-sites/page.tsx");
  assert.match(page, /FAMILY_SITES\.filter\(\(s\) => s\.id !== "mtg"\)/);
  assert.match(page, /rel="noopener"/);
  assert.doesNotMatch(page, /nofollow|sponsored/);
  assert.ok(footerSisters("mtg").length > 0, "the shared helper still exists for the other sites");
});
