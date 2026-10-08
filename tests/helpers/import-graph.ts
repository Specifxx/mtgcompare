// tests/helpers/import-graph.ts (owner WP19). A tiny static import graph over src/ for the render-path tests (build-no-data, public-no-neon). Regex based, no TypeScript program: it follows `import ... from`, `export ... from` and `import("...")`,
// resolves "@/..." and relative specs to files under src/, ignores `import type`, and does NOT follow the data barrel (@/lib/data, @/lib/data/*) or @/lib/db: those are the leaves the rules look for.
import fs from "node:fs";
import path from "node:path";

export interface Edge { spec: string; typeOnly: boolean }
export function importsOf(src: string): Edge[] {
  const out: Edge[] = [];
  for (const m of src.matchAll(/(?:^|\n)\s*(import|export)\s+(type\s+)?([^;'"`]*?)\s*from\s*["']([^"']+)["']/g)) { const typeOnly = !!m[2] || /^\{(?:\s*type\s+[^,}]+,?)+\s*\}$/.test((m[3] ?? "").trim()); out.push({ spec: m[4]!, typeOnly }); }
  for (const m of src.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) out.push({ spec: m[1]!, typeOnly: false });
  for (const m of src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push({ spec: m[1]!, typeOnly: false });
  return out;
}
export function resolveSpec(from: string, spec: string, root: string): string | null {
  let base: string | null = null;
  if (spec.startsWith("@/")) base = path.join(root, "src", spec.slice(2)); else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}
export const isDataLeaf = (spec: string): boolean => spec === "@/lib/data" || spec.startsWith("@/lib/data/");
export const isDbLeaf = (spec: string): boolean => spec === "@/lib/db" || /\/lib\/db$/.test(spec);
export interface Closure { files: Set<string>; dataLeaf: boolean; dbLeaf: boolean }
/** Every file reachable from `entry` by value imports, not crossing the data barrel or the db module. */
export function closure(entry: string, root: string): Closure {
  const files = new Set<string>(); let dataLeaf = false, dbLeaf = false; const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!; if (files.has(f)) continue; files.add(f);
    let src = ""; try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
    for (const e of importsOf(src)) { if (e.typeOnly) continue; if (isDataLeaf(e.spec)) { dataLeaf = true; continue; } if (isDbLeaf(e.spec)) { dbLeaf = true; continue; } const r = resolveSpec(f, e.spec, root); if (r && r.startsWith(path.join(root, "src/lib/data") + path.sep)) { dataLeaf = true; continue; } if (r && r.startsWith(path.join(root, "src"))) stack.push(r); }   // C0 amendment (requests/AMENDMENTS.md): a RELATIVE import of the barrel ("./data", "../data") is the same leaf as "@/lib/data"
  }
  return { files, dataLeaf, dbLeaf };
}
export function appRoutes(root: string): string[] {
  const dir = path.join(root, "src/app"); if (!fs.existsSync(dir)) return [];
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  return walk(dir).filter((f) => /\/(page|route|layout|opengraph-image|sitemap|robots|manifest)\.(ts|tsx)$/.test(f.split(path.sep).join("/")));
}
export const routeOf = (root: string, file: string): string => "/" + path.relative(path.join(root, "src/app"), path.dirname(file)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join("/");
/** Loaders that read Neon. A public page must not call them from a server component. */
export const NEON_LOADERS = ["getEbayPanel", "getEbayPicks", "getChaseStrip", "getChaseBanner", "getDecksUsingCard", "getApprovedReviews", "getLaunchPromo", "getLibraryDecks", "getPublishedDeck", "getTopDemand", "getRisingSnapshot", "getCommanderDecks", "recordCardView", "getCurrentUser"];
