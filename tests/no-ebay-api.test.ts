// eBay API only behind its boundary. OP Compare calls the eBay Browse API with
// its OWN eBay application (never RiftCompare's), script-side only: the hosts
// live in src/lib/ebay*.ts, the credentials there and in the one workflow that
// passes them, and nothing a visitor can reach imports the client.
// (This file used to forbid the eBay API outright — DECISIONS 2026-10-03 "No
// eBay API at all", superseded by "eBay Browse API with OP Compare's own keyset".)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const HOSTS = [
  /api\.ebay\.com/i,
  /api\.sandbox\.ebay\.com/i,
  /\b(?:svcs|apiz)\.(?:sandbox\.)?ebay\.com/i, // Finding / Merchandising / Shopping, and the apiz hosts
  /SECURITY-APPNAME/i, // the Finding API's App ID query parameter
  /identity\/v1\/oauth2/i,
  /buy\/browse\/v1/i,
  /developer\/analytics/i,
];
const CREDS = [/EBAY_CLIENT_(ID|SECRET)/];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx|js|mjs|yml|yaml|sh)$/.test(e.name) ? [p] : [];
  });
}
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const FILES = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "scripts")), ...walk(path.join(ROOT, ".github"))];
const EBAY_LIB = /^src\/lib\/ebay[^/]*\.ts$/;

test("eBay API hosts appear only in src/lib/ebay*.ts", () => {
  const hits = FILES.filter((f) => !EBAY_LIB.test(rel(f))).flatMap((f) => {
    const text = fs.readFileSync(f, "utf8");
    return HOSTS.filter((re) => re.test(text)).map((re) => `${rel(f)}: ${re}`);
  });
  assert.deepEqual(hits, []);
  // Every eBay API host family is covered, not only api.ebay.com.
  for (const h of ["https://svcs.ebay.com/services/search/FindingService/v1", "https://svcs.sandbox.ebay.com/x", "https://apiz.ebay.com/commerce/x", "https://open.api.ebay.com/x", "SECURITY-APPNAME=abc"])
    assert.ok(HOSTS.some((re) => re.test(h)), h);
  assert.ok(!HOSTS.some((re) => re.test("https://www.ebay.com/sch/i.html?_nkw=OP01-120")), "search links are fine");
});

test("the eBay credentials are named only in src/lib/ebay*.ts and ebay-prices.yml", () => {
  const allowed = (r: string) => EBAY_LIB.test(r) || r === ".github/workflows/ebay-prices.yml";
  const hits = FILES.filter((f) => !allowed(rel(f))).flatMap((f) => {
    const text = fs.readFileSync(f, "utf8");
    return CREDS.filter((re) => re.test(text)).map((re) => `${rel(f)}: ${re}`);
  });
  assert.deepEqual(hits, []);
});

test("the deletion route names only its own two variables", () => {
  const text = fs.readFileSync(path.join(ROOT, "src/app/api/ebay/marketplace-deletion/route.ts"), "utf8");
  for (const re of [...HOSTS, ...CREDS]) assert.doesNotMatch(text, re);
  const envs = [...text.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(envs)].sort(), ["EBAY_DELETION_ENDPOINT", "EBAY_VERIFICATION_TOKEN"]);
});

/** Every module specifier a file names: import/export … from, import(), require(), side-effect import. */
function specifiers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(?:from|import)\s*\(?\s*["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']/g)) out.push(m[1] ?? m[2]);
  return out;
}
/** Does a specifier written in `file` resolve to one of the eBay modules (src/lib/ebay*.ts)? */
function namesEbayModule(file: string, spec: string): boolean {
  let target: string;
  if (spec.startsWith("@/")) target = path.join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) target = path.resolve(path.dirname(file), spec);
  else return false;
  return EBAY_LIB.test(`${rel(target).replace(/\.ts$/, "")}.ts`);
}

test("only the eBay modules themselves import the eBay modules (no page, route, component or loader can reach the client)", () => {
  // Through any form: a static or dynamic import, export … from, require, or a
  // re-export from another src/lib module a page imports.
  const hits = FILES.filter((f) => rel(f).startsWith("src/") && !EBAY_LIB.test(rel(f))).flatMap((f) =>
    specifiers(fs.readFileSync(f, "utf8"))
      .filter((sp) => namesEbayModule(f, sp))
      .map((sp) => `${rel(f)} → ${sp}`),
  );
  assert.deepEqual(hits, []);
  // The guard itself sees every form.
  const probe = path.join(ROOT, "src/app/x/page.tsx");
  for (const t of ['import { a } from "@/lib/ebay";', 'const m = await import("@/lib/ebay-import");', 'export * from "../../lib/ebay-plan";', 'require("@/lib/ebay-match")', 'import "@/lib/ebay";'])
    assert.ok(specifiers(t).some((sp) => namesEbayModule(probe, sp)), t);
  assert.ok(!specifiers('import { x } from "@/components/EbaySearchPanel";').some((sp) => namesEbayModule(probe, sp)));
});

test("the store import never holds the eBay credentials; the runner never names them", () => {
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, ".github/workflows/import-prices.yml"), "utf8"), /EBAY_CLIENT/);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "scripts/ebay.ts"), "utf8"), /EBAY_CLIENT/);
});

test("no Vercel cron reaches an eBay path", () => {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")) as { crons?: { path: string }[] };
  assert.deepEqual((v.crons ?? []).filter((c) => /ebay/i.test(c.path)), []);
});
