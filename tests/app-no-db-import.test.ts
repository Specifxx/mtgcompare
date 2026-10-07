// Egress (CLAUDE.md): pages and API routes read only the loaders in
// src/lib/data.ts, and the per-user exception lives in named src/lib modules
// (auth, premium, accounts, the wave-2 member libraries). So nothing under
// src/app may import the Prisma client module — not by alias, not by a
// relative path, not through a dynamic import.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "src/app");
const DB = path.join(ROOT, "src/lib/db");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/** Every module specifier a file imports (static, re-export, dynamic, require). */
export function specifiers(src: string): string[] {
  const out: string[] = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;
  for (const m of src.matchAll(re)) out.push(m[1]);
  return out;
}

function resolvesToDb(spec: string, fromFile: string): boolean {
  if (spec === "@/lib/db" || spec === "@/lib/db.ts") return true;
  if (!spec.startsWith(".")) return false;
  const abs = path.resolve(path.dirname(fromFile), spec).replace(/\.(ts|tsx|js)$/, "");
  return abs === DB || abs === path.join(DB, "index");
}

test("the specifier scan sees every import shape", () => {
  const src = `import { prisma } from "@/lib/db";\nexport { prisma as p } from '../../lib/db';\nconst m = await import("@/lib/db");\nconst r = require("../lib/db");\nimport "@/lib/db";`;
  assert.deepEqual(specifiers(src), ["@/lib/db", "../../lib/db", "@/lib/db", "../lib/db", "@/lib/db"]);
  assert.ok(resolvesToDb("../../../lib/db", path.join(APP, "api/x/route.ts")));
  assert.ok(!resolvesToDb("../../lib/db", path.join(APP, "api/x/route.ts")), "src/app/lib/db is not the client");
  assert.ok(!resolvesToDb("@/lib/data", path.join(APP, "page.tsx")));
  assert.ok(!resolvesToDb("@/lib/db-helpers", path.join(APP, "page.tsx")));
});

test("nothing under src/app imports @/lib/db", () => {
  const offenders = walk(APP)
    .filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f))
    .filter((f) => specifiers(fs.readFileSync(f, "utf8")).some((s) => resolvesToDb(s, f)))
    .map((f) => path.relative(ROOT, f));
  assert.deepEqual(offenders, [], "read through src/lib/data.ts loaders, or a per-user lib named in CLAUDE.md's accounts exception");
});

test("the root layout reads no session and no per-user library", () => {
  const layout = fs.readFileSync(path.join(APP, "layout.tsx"), "utf8");
  const perUser = ["auth", "premium", "accounts", "watchlist-server", "collection-server", "collection-share", "set-owned", "notifications", "sealed-watch", "deck-watch", "published-decks-server"];
  for (const s of specifiers(layout)) {
    for (const lib of perUser) assert.notEqual(s, `@/lib/${lib}`, `the root layout must not import @/lib/${lib}`);
  }
  assert.doesNotMatch(layout, /getCurrentUser\(/);
});

test("CLAUDE.md names every wave-2 per-user library in the accounts exception", () => {
  const md = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8");
  assert.match(md, /src\/lib\/\{watchlist-server,collection-server,collection-share,set-owned,notifications,sealed-watch,deck-watch,published-decks-server\}\.ts/);
  assert.match(md, /tests\/app-no-db-import\.test\.ts/);
});

test("per-user libraries are imported only by the pages CLAUDE.md names", () => {
  const libs = ["watchlist-server", "collection-server", "collection-share", "set-owned", "notifications", "sealed-watch", "deck-watch", "published-decks-server", "basket-server", "alert-routes", "alert-actions", "alert-subscribe", "alert-mute", "newsletter-signup"];
  const allowed = new Set([
    "src/app/watching/page.tsx",
    "src/app/dashboard/page.tsx",
    "src/app/profile/page.tsx",
    "src/app/portfolio/page.tsx",
    "src/app/portfolio/sets/page.tsx",
    "src/app/portfolio/sets/[set]/page.tsx",
    "src/app/c/[token]/page.tsx",
    "src/app/tools/best-basket/page.tsx",
    "src/app/alerts/action/page.tsx",
  ]);
  const offenders = walk(APP)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => path.relative(ROOT, f))
    .filter((rel) => !rel.startsWith("src/app/api/") && !rel.startsWith("src/app/admin/") && !allowed.has(rel))
    .filter((rel) => specifiers(fs.readFileSync(path.join(ROOT, rel), "utf8")).some((s) => libs.some((l) => s === `@/lib/${l}` || s.endsWith(`/lib/${l}`))));
  assert.deepEqual(offenders, [], "a page that reads per-user rows must be named in CLAUDE.md's accounts exception");
});
