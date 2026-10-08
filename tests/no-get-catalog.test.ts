// getCatalog() IS A TRANSITION SHIM, AND A RATCHET OWNS IT (owner WP19; contract 7.9, critique 7). OP's lib/data.ts handed every page the WHOLE catalogue (`cat.cards`, 33 of its 60 callers scan it); at 98,991 listed printings that is
// 77 MB of heap and 0.3 s per instance, so the pages move to the bounded loaders of section 7 (getCardPage, getCardsByIds, getCardLookup, getSetIndex, the precomputed views). The shim (src/lib/data/catalog-shim.ts) keeps the old
// name compiling while 15 packages migrate in parallel. This test counts the files that still import or call it, per owner: a count may only go DOWN, and at milestone M3 (RATCHET_STRICT=1) it must be zero, the commit
// that deletes the shim, `Catalog` in types.ts and the line in api.ts. The offenders are derived from the filesystem: there is no shared allow-list file for fifty hands to edit (critique 6).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, ratchet, stripComments, summary, walk } from "./helpers/ratchet";
import { CatalogShimError, shimAllowed } from "../src/lib/data/catalog-shim";

/** The files that DEFINE or re-export the name; every other mention is a caller. */
export const DEFINITIONS = ["src/lib/data/api.ts", "src/lib/data/catalog.ts", "src/lib/data/catalog-shim.ts", "src/lib/data/index.ts", "src/lib/data/types.ts"];
/** Files under `root` (relative paths) that import or call getCatalog, comments ignored. Pure over the tree, so the rule can be shown to fail. */
export function callers(root: string): string[] {
  const out: string[] = [];
  for (const dir of ["src", "scripts"]) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    const stack = [abs];
    while (stack.length) {
      const d = stack.pop()!;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next") stack.push(p); continue; }
        const rel = path.relative(root, p).split(path.sep).join("/");
        if (!/\.tsx?$/.test(rel) || DEFINITIONS.includes(rel)) continue;
        if (/(?<![.\w])getCatalog\b/.test(stripComments(fs.readFileSync(p, "utf8")))) out.push(rel);
      }
    }
  }
  return out.sort();
}

test("the rule can fail: an import, a call and a re-export are callers; a comment, the definition files and a longer name are not", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gc-"));
  const w = (f: string, s: string): void => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s); };
  w("src/app/market/page.tsx", 'import { getCatalog } from "@/lib/data";\nexport default async function P() { const cat = await getCatalog(); return cat.cards.length; }');
  w("src/lib/blog/context.ts", 'export { getCatalog } from "@/lib/data";');
  w("src/app/sets/page.tsx", '// was getCatalog()\n/* getCatalog */ export const x = 1;');
  w("src/app/cards/page.tsx", 'import { getCatalogPage } from "@/lib/data"; export const y = getCatalogPage;');
  w("src/lib/data/api.ts", "export declare function getCatalog(): Promise<unknown>;");
  w("scripts/feed.ts", "const c = await getCatalog();");
  assert.deepEqual(callers(root), ["scripts/feed.ts", "src/app/market/page.tsx", "src/lib/blog/context.ts"]);
  fs.rmSync(root, { recursive: true });
});
test("RATCHET: the importers of getCatalog() per owner may only go down (57 files at C0); zero at M3", () => {
  const found = callers(ROOT), r = ratchet("no-get-catalog", found);
  if (found.length) console.log(`no-get-catalog: ${found.length} importer(s): ${summary(r)}`);
  assert.ok(r.ok, r.failures.join("\n"));
});
test("the shim refuses to run in a production deployment, with no override, and names its replacements", () => {
  assert.equal(shimAllowed({ VERCEL_ENV: "production" }), false);
  for (const env of [{}, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }]) assert.equal(shimAllowed(env), true);
  assert.equal(shimAllowed({ VERCEL_ENV: "production", ALLOW_CATALOG_SHIM: "1", CATALOG_SHIM: "1" }), false, "no environment variable lifts the refusal");
  const err = new CatalogShimError();
  assert.equal(err.name, "CatalogShimError");
  for (const name of ["getCardPage", "getCardsByIds", "getCardLookup", "getSetIndex"]) assert.ok(err.message.includes(name), `the error says to use ${name}`);
  const src = stripComments(fs.readFileSync(path.join(ROOT, "src/lib/data/catalog-shim.ts"), "utf8"));
  assert.doesNotMatch(src, /process\.env\.(?!VERCEL_ENV)/, "the shim reads no other variable: nothing can switch it on");
});
test("nothing outside the data layer imports the shim file or builds a Catalog by hand", () => {
  const bad = walk("src", (f) => /\.tsx?$/.test(f) && !f.startsWith("src/lib/data/")).filter((f) => /catalog-shim|buildCatalog\b/.test(stripComments(fs.readFileSync(path.join(ROOT, f), "utf8"))));
  assert.deepEqual(bad, [], "pages import getCatalog from @/lib/data (so the ratchet sees them) or, better, a bounded loader; never the shim module itself");
});
test("the shim is a build-time and CI non-event: a page that still calls it fails the preview smoke test, not production", () => {
  // The smoke script runs against the fixture tree with VERCEL_ENV unset (shim allowed) in ci-build.yml, and against the real deployment, where VERCEL_ENV=production refuses: a leftover caller is a 500 there, which the
  // status and smoke gates (scripts/smoke-pages.ts) report. Pin the two facts this relies on.
  assert.match(fs.readFileSync(path.join(ROOT, "scripts/smoke-pages.ts"), "utf8"), /FORBIDDEN_MARKERS[\s\S]{0,200}Internal Server Error/);
  assert.match(fs.readFileSync(path.join(ROOT, ".github/workflows/seo-preview-gate.yml"), "utf8"), /environment == 'Production'/);
});
