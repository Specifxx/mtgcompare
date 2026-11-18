// The cost rules every Compare Empire site learned the expensive way, pinned: no ISR timer, no prerendering of data pages, no
// page that reads a cookie or a header (pages are CDN-cached for everyone), no database, no eBay API, and data/ under a size
// that still fits a server function.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])) : []);
const files = walk(join(ROOT, "src")).filter((f) => /\.tsx?$/.test(f));
const text = (f: string) => readFileSync(f, "utf8");

test("no ISR, no prerendering, no request-reading pages", () => {
  for (const f of files) {
    const t = text(f);
    assert.doesNotMatch(t, /export const revalidate\b/, f);
    assert.doesNotMatch(t, /generateStaticParams/, f);
    assert.doesNotMatch(t, /from "next\/headers"/, f);
    assert.doesNotMatch(t, /next\/image|next\/link/, `${f}: plain <a> and <img> only (no prefetch, no image optimisation)`);
  }
  for (const f of files.filter((f) => /\/page\.tsx$/.test(f))) assert.match(text(f), /export const dynamic = "force-dynamic"/, f);
});

test("no database and no eBay API anywhere", () => {
  const pkg = JSON.parse(text(join(ROOT, "package.json"))) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) assert.doesNotMatch(dep, /prisma|pg|neon|mysql|mongo|redis/, dep);
  for (const f of [...files, ...walk(join(ROOT, "scripts")), ...walk(join(ROOT, ".github"))]) assert.doesNotMatch(text(f), /api\.ebay\.com|EBAY_CLIENT/, f);
});

test("data/ still fits a server function (150 MB): past this, move the reads behind lib/store.ts", () => {
  const bytes = walk(join(ROOT, "data")).reduce((n, f) => n + statSync(f).size, 0);
  assert.ok(bytes < 150 * 1024 * 1024, `data/ is ${(bytes / 1048576).toFixed(1)} MB`);
});

test("only live games are routed, and a set can never take a page's slug", () => {
  assert.match(text(join(ROOT, "scripts/import.ts")), /const RESERVED = \["movers", "search", "sets"\]/);
  assert.match(text(join(ROOT, "src/lib/store.ts")), /gameBySlug\(game\)/);
});
