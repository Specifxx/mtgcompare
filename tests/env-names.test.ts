// THE ENVIRONMENT TABLE IS A TEST (critique 10). tests/fixtures/env-names.json (generated; the same rows as contract Annex B) is the only list of variable names the code may read.
// Owner WP19 (cross-cutting: it reads every package's source). ENV_STRICT=1 (turned on at milestone M4 by WP21) adds the completeness rules: every `new` row is read somewhere, and .env.example lists every row.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const STRICT = process.env.ENV_STRICT === "1";
interface Row { kind: "secret" | "var" | "public" | "platform" | "test"; status: "op" | "new" | "renamed" | "dp"; where: string[]; wf: string[]; at: string }
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/env-names.json"), "utf8")) as { patterns: string[]; names: Record<string, Row> };
const NAMES = FIX.names;
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" || e.name === ".next" ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name).split(path.sep).join("/")]));
}
const SOURCES = [...walk("src"), ...walk("scripts"), ...walk("prisma"), ...(fs.existsSync(path.join(ROOT, "next.config.js")) ? ["next.config.js"] : [])].filter((f) => /\.(tsx?|js|cjs|mjs|sh)$/.test(f));
const glob = (g: string): RegExp => new RegExp(`^${g.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*")}$`);
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** name -> files that read it; templated reads (process.env[`EBAY_MKRID_${x}`]) are returned as the template with ${..} -> {CC}. */
function reads(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (n: string, f: string) => { const s = out.get(n) ?? new Set<string>(); s.add(f); out.set(n, s); };
  for (const f of SOURCES) {
    const s = code(fs.readFileSync(path.join(ROOT, f), "utf8"));
    for (const m of s.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) add(m[1], f);
    for (const m of s.matchAll(/process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g)) add(m[1], f);
    for (const m of s.matchAll(/process\.env\[\s*`([A-Z][A-Z0-9_]*)\$\{[^}]*\}([A-Z0-9_]*)`\s*\]/g)) add(`${m[1]}{CC}${m[2]}`, f);
    if (f.endsWith(".sh")) for (const m of s.matchAll(/\$\{?(VERCEL_[A-Z_]+)\}?/g)) add(m[1], f);
  }
  return out;
}
const wfNames = (): Map<string, Set<string>> => {
  const out = new Map<string, Set<string>>();
  for (const f of walk(".github/workflows").filter((x) => /\.ya?ml$/.test(x))) {
    const y = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^\s*#.*$/gm, "");
    for (const m of y.matchAll(/\$\{\{\s*(?:secrets|vars)\.([A-Z][A-Z0-9_]*)/g)) { const s = out.get(m[1]) ?? new Set<string>(); s.add(path.basename(f)); out.set(m[1], s); }
  }
  return out;
};
const known = (n: string): boolean => n in NAMES || FIX.patterns.includes(n) || (/\{CC\}/.test(n) && FIX.patterns.includes(n));
const rowFor = (n: string): Row | undefined => NAMES[n] ?? (/^(EBAY_MKRID|EBAY_SITEID)_\{CC\}$/.test(n) ? NAMES[n.replace("{CC}", "US")] : undefined);

test("the table is well-formed: public names are NEXT_PUBLIC_*, secrets never are", () => {
  for (const [n, r] of Object.entries(NAMES)) {
    if (r.kind === "public") assert.match(n, /^NEXT_PUBLIC_/, `${n} is kind public`);
    if (r.kind === "secret") assert.doesNotMatch(n, /^NEXT_PUBLIC_/, `${n} is a secret and would be inlined into the browser bundle`);
    if (/^NEXT_PUBLIC_/.test(n)) assert.equal(r.kind, "public", `${n} must be kind public`);
  }
});
test("every variable the source or the scripts read is in the table", () => {
  const unknown = [...reads()].filter(([n]) => !known(n) && !rowFor(n)).map(([n, f]) => `${n} (${[...f][0]})`);
  assert.deepEqual(unknown, [], "add the name to tests/fixtures/env-names.json (the environment table, contract Annex B) with its kind, where it is configured and what it means, or stop reading it");
});
test("a variable is read only where its row says", () => {
  const bad: string[] = [];
  for (const [n, files] of reads()) {
    const r = rowFor(n);
    if (!r || r.where.includes("*") || r.kind === "platform") continue;
    const res = r.where.map(glob);
    for (const f of files) if (!res.some((re) => re.test(f))) bad.push(`${n} read in ${f}; allowed: ${r.where.join(", ")}`);
  }
  assert.deepEqual(bad, []);
});
test("every ${{ secrets.X }} and ${{ vars.X }} of a workflow is in the table and the workflow is allowed to name it", () => {
  const bad: string[] = [];
  for (const [n, wfs] of wfNames()) {
    const r = NAMES[n];
    if (!r) { bad.push(`${n} (${[...wfs].join(", ")}) is not in the table`); continue; }
    if (r.kind === "platform") continue;
    for (const w of wfs) if (!r.wf.includes(w)) bad.push(`${n} named in ${w}; allowed: ${r.wf.join(", ") || "none"}`);
  }
  assert.deepEqual(bad, []);
});
test("there is ONE eBay workflow and its name is ebay-prices.yml", () => {
  const eb = walk(".github/workflows").filter((f) => /ebay/i.test(f)).map((f) => path.basename(f));
  assert.deepEqual(eb.filter((f) => f !== "ebay-prices.yml"), [], "the contract, tests/no-ebay-api.test.ts and tests/no-email-api.test.ts all say ebay-prices.yml");
  for (const [n, r] of Object.entries(NAMES)) if (/^EBAY_CLIENT_/.test(n)) assert.deepEqual(r.wf, ["ebay-prices.yml"]);
});
test("no Rift affiliate literal is a default in src/ or scripts/ (10.20: otherwise every MTG click pays Rift silently)", () => {
  const hits = SOURCES.filter((f) => /5339155912|partner\.tcgplayer\.com\/c\/7385758|\b7385758\b/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  assert.deepEqual(hits, []);
});
test("the retired OP names are gone", () => {
  const retired = ["EBAY_AFFILIATE_CAMPAIGN", "TCGPLAYER_IMPACT_LINK"];
  const hits = [...reads()].filter(([n]) => retired.includes(n)).map(([n, f]) => `${n} (${[...f][0]})`);
  assert.deepEqual(hits, [], "renamed to NEXT_PUBLIC_EBAY_CAMPAIGN_ID / NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK: client components can only read NEXT_PUBLIC_ names");
});
test(".env.example names only variables in the table", () => {
  const f = path.join(ROOT, ".env.example");
  if (!fs.existsSync(f)) return;
  const listed = [...fs.readFileSync(f, "utf8").matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]);
  assert.deepEqual(listed.filter((n) => !known(n) && !rowFor(n)), []);
  for (const n of listed) assert.ok(!/(^|_)(SECRET|KEY|TOKEN)$/.test(n) || !/=\S{12,}/.test(fs.readFileSync(f, "utf8").split("\n").find((l) => l.replace(/^#\s*/, "").startsWith(n + "=")) ?? ""), `${n}: .env.example must not carry a real secret`);
});
test("STRICT: every row that is not data-plane or platform is read somewhere, and .env.example lists every row", { skip: !STRICT }, () => {
  const seen = reads(), wf = wfNames();
  const dead = Object.entries(NAMES).filter(([n, r]) => r.kind !== "platform" && r.kind !== "test" && r.status !== "dp" && !seen.has(n) && !wf.has(n) && !(/^(EBAY_MKRID|EBAY_SITEID)_/.test(n) && seen.has(n.replace(/_[A-Z]{2}$/, "_{CC}")))).map(([n]) => n);
  assert.deepEqual(dead, [], "a row nobody reads is documentation of something that does not exist");
  const ex = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  const missing = Object.entries(NAMES).filter(([n, r]) => r.kind !== "platform" && !new RegExp(`^#?\\s*${n}=`, "m").test(ex)).map(([n]) => n);
  assert.deepEqual(missing, []);
  for (const [n, r] of Object.entries(NAMES)) for (const w of r.wf) assert.ok(fs.existsSync(path.join(ROOT, ".github/workflows", w)), `${n}: workflow ${w} does not exist`);
});
