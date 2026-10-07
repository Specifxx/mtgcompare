// The production domain is opcompare.app. The code and every workflow default to
// it, so a missing variable can't publish canonicals or a sitemap on another host.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("SITE_URL defaults to https://opcompare.app", async () => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  const { SITE_URL } = await import("../src/lib/site");
  assert.equal(SITE_URL, "https://opcompare.app");
});

test("every workflow that needs the site URL falls back to opcompare.app", () => {
  for (const f of ["import-prices.yml", "search-console.yml", "indexnow.yml"]) {
    const y = read(`.github/workflows/${f}`);
    for (const m of y.matchAll(/vars\.SITE_URL[^}\n]*/g)) assert.match(m[0], /\|\| 'https:\/\/opcompare\.app'/, `${f}: ${m[0]}`);
  }
  assert.match(read(".github/workflows/search-console.yml"), /vars\.GSC_PROPERTY \|\| 'sc-domain:opcompare\.app'/);
});

test("no other production host is named", () => {
  for (const f of ["src/lib/site.ts", ".env.example", "scripts/gsc-report.ts", "next.config.js", "docs/SETUP.md", "docs/CHROME-SETUP-PROMPT.md"]) {
    assert.doesNotMatch(read(f), /opcompare\.(com|net|io|vercel\.app)\b/, f);
  }
});
