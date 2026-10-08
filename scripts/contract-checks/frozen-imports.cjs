#!/usr/bin/env node
// checks/frozen-imports.cjs: the C0 smoke rule. Every name that the CURRENT repository (OP Compare, at C0) imports from a module the contract freezes
// either still exists in the contract tree, or is listed in checks/removed.json with its replacement. Usage:
//   node checks/frozen-imports.cjs <repo-root> <tree-root> [--json out.json]
// The TypeScript package is taken from <repo-root>/node_modules. Exit code 1 when a name is neither exported nor removed.
const fs = require("fs"), path = require("path");
const repo = path.resolve(process.argv[2] || "."), tree = path.resolve(process.argv[3] || ".");
const ts = require(path.join(repo, "node_modules/typescript"));
const FROZEN = ["constants", "catalog", "images", "history", "price", "import", "search", "data", "stores", "match", "track"];   // modules of src/lib (data = data.ts in OP, data/ in the tree). country.ts is OP's file UNCHANGED plus MARKET_INDEX, so no name can disappear from it and it is not checked
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.name === "node_modules" || e.name === ".next" ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
function exportsOf(files, rootDir, opts) {
  const prog = ts.createProgram(files, { ...opts, noEmit: true, skipLibCheck: true, allowJs: false });
  const ck = prog.getTypeChecker(); const names = new Set();
  for (const f of files) { const sf = prog.getSourceFile(f); if (!sf) continue; const sym = ck.getSymbolAtLocation(sf); if (!sym) continue; for (const e of ck.getExportsOfModule(sym)) names.add(e.getName()); }
  return names;
}
const base = { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, esModuleInterop: true, types: [], jsx: ts.JsxEmit.Preserve };
// OP exports per frozen module
const opExports = {};
for (const m of FROZEN) { const f = path.join(repo, "src/lib", m + ".ts"); if (fs.existsSync(f)) opExports[m] = exportsOf([f], repo, { ...base, baseUrl: repo, paths: { "@/*": ["src/*"] } }); }
// tree exports per frozen module (data = union of the data/ declaration files that pages see)
const treeExports = {};
for (const m of FROZEN) {
  if (m === "data") { const fs2 = ["types", "api", "core", "catalog", "history", "card-page", "lists", "search", "demand", "facets", "sealed", "decks", "commanders", "sets", "deals", "stores", "email", "ebay", "home", "sitemap", "site"].map((x) => path.join(tree, "src/lib/data", x + ".ts")).filter(fs.existsSync); treeExports[m] = exportsOf(fs2, tree, { ...base, baseUrl: tree, paths: { "@/*": ["src/*"] } }); }
  else { const f = path.join(tree, "src/lib", m + ".ts"); if (fs.existsSync(f)) treeExports[m] = exportsOf([f], tree, { ...base, baseUrl: tree, paths: { "@/*": ["src/*"] } }); }
}
// importers in the repo (src, tests, scripts)
const files = [...walk(path.join(repo, "src")), ...walk(path.join(repo, "tests")), ...walk(path.join(repo, "scripts"))].filter((f) => /\.(ts|tsx|mts|cts)$/.test(f));
const imp = {};   // module -> name -> Set(file)
function moduleOf(spec, from) {
  let p = null;
  if (spec.startsWith("@/lib/")) p = spec.slice(6);
  else if (spec.startsWith(".")) { const abs = path.resolve(path.dirname(from), spec); const rel = path.relative(path.join(repo, "src/lib"), abs); if (!rel.startsWith("..")) p = rel; }
  if (!p) return null;
  p = p.replace(/\.(ts|tsx)$/, "").replace(/\/index$/, "");
  return FROZEN.includes(p) ? p : null;
}
for (const f of files) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.ES2020, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(repo, f);
  const visit = (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const m = moduleOf(n.moduleSpecifier.text, f);
      if (m) {
        const named = ts.isImportDeclaration(n) ? n.importClause?.namedBindings : n.exportClause;
        if (named && (ts.isNamedImports(named) || ts.isNamedExports(named))) for (const el of named.elements) { const nm = (el.propertyName ?? el.name).text; ((imp[m] ??= {})[nm] ??= new Set()).add(rel); }
        else if (ts.isImportDeclaration(n) && n.importClause?.namedBindings && ts.isNamespaceImport(n.importClause.namedBindings)) ((imp[m] ??= {})["*"] ??= new Set()).add(rel);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
// C0 amendment (requests/AMENDMENTS.md): in the repository the table sits at scripts/contract-checks/removed.json (Annex H), in the contract tree at checks/removed.json.
const removedPath = ["checks/removed.json", "scripts/contract-checks/removed.json"].map((x) => path.join(tree, x)).find((x) => fs.existsSync(x));
const removed = removedPath ? JSON.parse(fs.readFileSync(removedPath, "utf8")) : {};
const out = { missing: [], removedOk: [], present: 0, byModule: {} };
for (const m of Object.keys(imp)) for (const [nm, set] of Object.entries(imp[m])) {
  if (nm === "*") continue;
  const key = `${m}:${nm}`;
  if (treeExports[m]?.has(nm)) { out.present++; continue; }
  // a name moved to another frozen module still counts if some tree module exports it
  const moved = Object.keys(treeExports).find((k) => treeExports[k].has(nm));
  const row = { module: m, name: nm, files: set.size, example: [...set].slice(0, 3), movedTo: moved && moved !== m ? moved : undefined };
  const rep = removed[key] ?? removed[nm];
  // 'DP: KEEP...' marks a DEMAND to restore the name, not a removal (code critique 2: the first draft claimed price.ts and history.ts were 'kept byte for byte' and they were not); the final table has none.
  if (rep && /^DP: KEEP/.test(rep)) out.missing.push({ ...row, demand: rep });
  else if (rep) out.removedOk.push({ ...row, replacement: rep });
  else out.missing.push(row);
}
out.missing.sort((a, b) => b.files - a.files);
for (const r of out.missing) (out.byModule[r.module] ??= []).push(`${r.name} (${r.files}${r.movedTo ? ", now in " + r.movedTo : ""})`);
if (process.argv.includes("--json")) fs.writeFileSync(process.argv[process.argv.indexOf("--json") + 1], JSON.stringify({ ...out, imp: Object.fromEntries(Object.entries(imp).map(([m, o]) => [m, Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v]]))])), opExports: Object.fromEntries(Object.entries(opExports).map(([k, v]) => [k, [...v]])) }, null, 1));
console.log(`present: ${out.present}  removed-with-replacement: ${out.removedOk.length}  MISSING: ${out.missing.length}`);
for (const [m, l] of Object.entries(out.byModule)) console.log(`  ${m}: ${l.join(", ")}`);
process.exit(out.missing.length ? 1 : 0);
