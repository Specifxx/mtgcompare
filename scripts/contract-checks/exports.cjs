// Prints the export index of every file of the contract tree under src/lib (the FROZEN names: a rename in any of them is a contract change, section 9.4).
// Usage: node checks/exports.cjs [path-to-typescript]  ->  JSON { "<path under src/lib>": [names] }
const fs = require("fs"), path = require("path");
const ts = require(process.argv[2] || "/home/user/mtgcompare/node_modules/typescript");
const root = path.resolve(__dirname, "../../src/lib");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".ts") ? [path.join(d, e.name)] : []));
const out = {};
for (const full of walk(root)) {
  const f = path.relative(root, full);
  if (f === "data/index.ts") continue;                       // the barrel is `export *` lines only (7.3)
  const src = ts.createSourceFile(f, fs.readFileSync(full, "utf8"), ts.ScriptTarget.ES2020, true);
  const names = [];
  src.forEachChild((n) => {
    const exported = n.modifiers && n.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause)) { for (const e of n.exportClause.elements) names.push(e.name.text); return; }
    if (!exported) return;
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) { if (ts.isIdentifier(d.name)) names.push(d.name.text); }
    else if ((ts.isFunctionDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isClassDeclaration(n) || ts.isEnumDeclaration(n)) && n.name) names.push(n.name.text);
  });
  if (names.length) out[f] = [...new Set(names)];
}
console.log(JSON.stringify(out, null, 1));
