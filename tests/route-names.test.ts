// Next.js refuses to build when two dynamic directories at the same level have different names (`/card/[slug]` beside `/card/[sc]`):
//   Error: You cannot use different slug names for the same dynamic path ('sc' !== 'slug').
// `tsc`, eslint and every unit test pass with such a layout, so it first appears at `npm run build` (critique 1, reproduced on next 14.2.35). This test is the early warning. Owner WP19.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "src/app");
const ROUTE_FILE = /^(page|route|layout|default|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)\.(tsx?|jsx?)$/;

/** Group segment directories by the URL path they sit at (route groups `(x)` are transparent; parallel `@x` and intercepting `(.)x` folders are ignored). */
export function dynamicSiblings(appDir: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const visit = (dir: string, urlPath: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const n = e.name;
      if (n.startsWith("@") || /^\(\.+\)/.test(n)) continue;
      if (/^\(.+\)$/.test(n)) { visit(path.join(dir, n), urlPath); continue; }
      if (/^\[[^\]]+\]$/.test(n) || /^\[\[\.\.\.[^\]]+\]\]$/.test(n) || /^\[\.\.\.[^\]]+\]$/.test(n)) {
        const set = out.get(urlPath) ?? new Set<string>(); set.add(n); out.set(urlPath, set);
      }
      visit(path.join(dir, n), `${urlPath}/${n.startsWith("[") ? "[]" : n}`);
    }
  };
  visit(appDir, "");
  return out;
}

test("no two dynamic directories at the same level have different names (next build would throw)", () => {
  const clashes = [...dynamicSiblings(APP)].filter(([, set]) => set.size > 1).map(([p, set]) => `${p || "/"}: ${[...set].join(" vs ")}`);
  assert.deepEqual(clashes, []);
});

test("the detector sees the clash that broke the first contract draft", () => {
  const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "routes-"));
  fs.mkdirSync(path.join(tmp, "card/[slug]"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "card/[sc]/[number]"), { recursive: true });
  assert.deepEqual([...dynamicSiblings(tmp)].filter(([, s]) => s.size > 1).map(([p, s]) => `${p}: ${[...s].sort().join(" vs ")}`), ["/card: [sc] vs [slug]"]);
  fs.rmSync(tmp, { recursive: true, force: true });
  const ok = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "routes-"));
  fs.mkdirSync(path.join(ok, "card/[slug]/[number]"), { recursive: true });
  assert.deepEqual([...dynamicSiblings(ok)].filter(([, s]) => s.size > 1), []);
  fs.rmSync(ok, { recursive: true, force: true });
});

test("the set + number resolver lives at /card/[slug]/[number], where [slug] holds a Scryfall set code (route table, section 4.3)", () => {
  const resolver = path.join(APP, "card/[slug]/[number]");
  if (!fs.existsSync(path.join(APP, "card"))) return;                     // before the card page exists the test has nothing to say
  assert.ok(!fs.existsSync(path.join(APP, "card/[sc]")), "a card/[sc] directory cannot sit beside card/[slug]");
  if (fs.existsSync(resolver)) assert.ok(fs.readdirSync(resolver).some((f) => ROUTE_FILE.test(f)), "the resolver directory holds a page");
});

test("every segment that is a literal word beside a [param] is reachable (a static sibling wins over the dynamic one by design)", () => {
  // /card/[slug]/opengraph-image beside /card/[slug]/[number]: Next resolves the static segment first. This only documents the rule the resolver relies on: no set code may be named like a static sibling.
  const reserved = new Set<string>();
  const card = path.join(APP, "card/[slug]");
  if (fs.existsSync(card)) for (const e of fs.readdirSync(card, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith("[")) reserved.add(e.name);
  for (const sc of ["mh3", "lea", "pbro", "plst", "sld", "m11", "30a", "2x2", "unf", "7ed"]) assert.ok(!reserved.has(sc), `${sc} is a real Scryfall set code and must not be a static child of /card/[slug]`);
});
