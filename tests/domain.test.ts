// The production domain is NOT DECIDED: mtgcompare.app is the placeholder (src/lib/site.ts says why).
// The code and every workflow default to it, so a missing variable can't publish canonicals or a
// sitemap on another host. Choosing the real domain is one constant and one sed over these files.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
// the hosts nobody may configure: the .com is a live, unrelated "MTG Compare UK" site; the others are the obvious alternatives to the .app placeholder
const FOREIGN = /mtgcompare\.(com|net|io|vercel\.app)\b/;

test("SITE_URL defaults to https://mtgcompare.app", async () => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  const { SITE_URL } = await import("../src/lib/site");
  assert.equal(SITE_URL, "https://mtgcompare.app");
});

test("every workflow that needs the site URL falls back to mtgcompare.app", () => {
  for (const f of ["import-prices.yml", "search-console.yml", "indexnow.yml"]) {
    const y = read(`.github/workflows/${f}`);
    for (const m of y.matchAll(/vars\.SITE_URL[^}\n]*/g)) assert.match(m[0], /\|\| 'https:\/\/mtgcompare\.app'/, `${f}: ${m[0]}`);
  }
  assert.match(read(".github/workflows/search-console.yml"), /vars\.GSC_PROPERTY \|\| 'sc-domain:mtgcompare\.app'/);
});

test("no other production host is named", () => {
  // The code, the config and every workflow: not one occurrence. (.env.example is the owner's file and may not exist yet.)
  const files = ["src/lib/site.ts", ".env.example", "scripts/gsc-report.ts", "next.config.js", "vercel.json", "docs/SETUP.md", ...fs.readdirSync(path.join(ROOT, ".github/workflows")).map((f) => `.github/workflows/${f}`)];
  for (const f of files) if (fs.existsSync(path.join(ROOT, f))) assert.doesNotMatch(read(f), FOREIGN, f);
});

test("the setup prompt names those hosts only in the two sentences that need them, and never as the value of a site URL", () => {
  // docs/CHROME-SETUP-PROMPT.md legitimately says (1) that the FIRST deployment answers on Vercel's own address while no domain is chosen, and (2) that mtgcompare.com is an unrelated live site ("MTG Compare UK"),
  // which is the reason the owner must check a domain name before buying it. Everything else that names a foreign host is a defect, and NO line may hand one to a site-URL setting.
  const doc = read("docs/CHROME-SETUP-PROMPT.md");
  const stripped = doc.replace(/`https:\/\/mtgcompare\.vercel\.app`/g, "").replace(/there is an existing 'MTG Compare UK' site at\s+mtgcompare\.com/g, "");
  assert.doesNotMatch(stripped, FOREIGN, "a foreign host outside the two documented sentences");
  for (const line of doc.split("\n")) if (FOREIGN.test(line)) assert.doesNotMatch(line, /(NEXT_PUBLIC_SITE_URL|\bSITE_URL|GSC_PROPERTY)\s*[=:]/, `a site URL setting points at a foreign host: ${line.trim()}`);
});
