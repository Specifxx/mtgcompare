// SEO audit (2026-11-03): every product, set and eBay photo carries a name as alt text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(p, "utf8");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test("no page or component draws a photo with empty alt text (share images and the quick view aside)", () => {
  for (const f of walk("src").filter((f) => /\.(tsx|ts)$/.test(f) && !f.includes("opengraph-image") && !f.includes("/og/") && !f.endsWith("QuickView.tsx") && !f.endsWith("Flag.tsx"))) {
    // Flag.tsx: a decorative flag beside its region\'s written name (alt="" so the name is not read twice), not a photo.
    assert.ok(!/<img\b[^>]*\balt=""/.test(read(f)), f);
  }
});

test("old singles URLs still 301 to the sealed site", () => {
  const cfg = read("next.config.js");
  assert.match(cfg, /source: "\/sets\/:set\*", destination: "\/us\/sets", permanent: true/);
  assert.match(cfg, /:path\(card\|cards\|singles/);
});
