// What a crawler found on the live site on 2026-10-19 (DECISIONS.md, "What Googlebot found"): intermittent 500s from the two ISR tool pages, 404s behind
// keyword links with a comma, internal links that land on a 308, and every Tales of Middle-earth sealed product under one title. Each test pins the fix.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const codeOnly = (s: string) => s.replace(/^\s*\/\/.*$/gm, "");
const files = (dir: string): string[] => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));

test("the tool hub and the fee calculator are plain static pages, never an ISR regeneration", () => {
  for (const f of ["src/app/tools/page.tsx", "src/app/tools/selling-fees/page.tsx"]) {
    assert.match(read(f), /^export const dynamic = "force-static";$/m, f);
    assert.doesNotMatch(codeOnly(read(f)), /export const revalidate/, f);
  }
});

test("a keyword slug is decoded before the lookup: Next hands /keywords/10,000-needles over as 10%2C000-needles", () => {
  const src = codeOnly(read("src/lib/data/facets.ts"));
  const fn = src.slice(src.indexOf("export async function getKeywordPage"));
  assert.ok(fn.indexOf("decodeURIComponent(") > 0 && fn.indexOf("decodeURIComponent(") < fn.indexOf("keywordTable()"), "decoded before the table lookup");
});

test("no page or component links a post as /blog/<slug> by hand (a guide lives at /guides/<slug>; the /blog URL is a 308) or links the legacy /cards/printing/<x> redirect", () => {
  const bad: string[] = [];
  for (const f of [...files("src/components"), ...files("src/app")]) {
    if (f.includes(path.join("app", "cards", "printing"))) continue;
    const s = codeOnly(read(f));
    if (/href=\{`\/blog\/\$\{/.test(s) || /href: `\/blog\/\$\{/.test(s)) bad.push(`${f}: /blog/\${...}`);
    if (/["'`]\/cards\/printing\//.test(s)) bad.push(`${f}: /cards/printing/`);
  }
  assert.deepEqual(bad, []);
});

test("a sealed product's title is its whole name: a 50-character cut gave every Tales of Middle-earth product the same title", () => {
  const s = codeOnly(read("src/app/sealed/[slug]/page.tsx"));
  assert.match(s, /title: \{ absolute: `\$\{s\.name\} Price` \}/);
  assert.doesNotMatch(s, /s\.name\.slice\(/);
});
