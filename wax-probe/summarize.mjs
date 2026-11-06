// Joins the shards into results.json and summary.md, judged against the gate:
// 60+ readable shops with 50+ sealed sports products, across 3+ regions, and
// 300+ boxes (one key) sold by 2+ shops in the same currency.
import fs from "node:fs";
const dir = process.argv[2];
let all = [];
for (const d of fs.readdirSync(dir)) for (const f of fs.readdirSync(`${dir}/${d}`)) all = all.concat(JSON.parse(fs.readFileSync(`${dir}/${d}/${f}`, "utf8")));
all.sort((a, b) => a.host.localeCompare(b.host));
const ok = all.filter((r) => r.shopify && r.sealed);
const good = ok.filter((r) => r.sealed >= 50);
const byCur = {};
for (const r of ok) (byCur[r.currency ?? "?"] ??= []).push(r);
let sharedTotal = 0;
const rows = [];
const sharedExamples = {};
for (const [cur, rs] of Object.entries(byCur).sort()) {
  const count = new Map();
  for (const r of rs) for (const k of new Set((r.items ?? []).filter((i) => !i.k.endsWith("|?")).map((i) => i.k))) count.set(k, (count.get(k) ?? 0) + 1);
  const shared = [...count].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  sharedTotal += shared.length;
  sharedExamples[cur] = shared.slice(0, 15);
  rows.push(`| ${cur} | ${rs.length} | ${rs.filter((r) => r.sealed >= 50).length} | ${rs.reduce((a, r) => a + r.sealed, 0)} | ${shared.length} | ${shared.filter(([, n]) => n >= 3).length} |`);
}
const regions = new Set(good.map((r) => r.currency));
const pass = good.length >= 60 && regions.size >= 3 && sharedTotal >= 300;
let md = `# Sealed sports store probe ${new Date().toISOString().slice(0, 10)}\n\n${all.length} candidates, ${all.filter((r) => r.shopify).length} Shopify, ${ok.length} list sealed sports, ${good.length} with 50+.\n\n`;
md += `**Gate: ${pass ? "PASS" : "FAIL"}** (shops 50+: ${good.length}/60, currencies with such a shop: ${regions.size}/3, boxes in 2+ shops of one currency: ${sharedTotal}/300)\n\n`;
md += "| Currency | Shops with sealed sports | With 50+ | Products | Keys in 2+ shops | In 3+ |\n| --- | --- | --- | --- | --- | --- |\n" + rows.join("\n") + "\n\n";
for (const [cur, ex] of Object.entries(sharedExamples)) if (ex.length) md += `**${cur} most shared:** ${ex.map(([k, n]) => `${k} (${n})`).join("; ")}\n\n`;
md += "| Shop | Currency | Sports collections | Scanned | Sealed sports | In stock | With barcode |\n| --- | --- | --- | --- | --- | --- | --- |\n";
for (const r of ok.sort((a, b) => b.sealed - a.sealed)) md += `| ${r.base} | ${r.currency ?? "?"} | ${(r.sportCollections ?? []).length} | ${r.scanned} | ${r.sealed} | ${r.inStock} | ${(r.items ?? []).filter((i) => i.e).length} |\n`;
md += `\nShopify, no sealed sports: ${all.filter((r) => r.shopify && !r.sealed && !r.error).length}. Not readable: ${all.filter((r) => !r.shopify || r.error).length}.\n`;
fs.writeFileSync("wax-probe/results.json", JSON.stringify(all) + "\n");
fs.writeFileSync("wax-probe/summary.md", md);
console.log(md);
