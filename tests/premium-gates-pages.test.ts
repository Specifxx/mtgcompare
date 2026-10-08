// RATCHET (owner WP19; cross-package by design: it reads the pages of WP07 and WP13, the loaders, the feeds and the share images). The gates of src/lib/premium-gates.ts are only real if no side door exists.
// A failure names the file and the package that owns it; the fix is in THAT file, never in this test.
// Two of the five tests police the MIGRATION of OP's existing pages and routes (they fail on OP's source until WP07, WP13 and WP18 land), so they are per-owner ratchets like legacy-vocab
// (tests/helpers/ratchet.ts): each package may only lower its own count in tests/fixtures/ratchet-baseline.json, and RATCHET_STRICT=1 (milestone M2) requires zero. The other three are hard from day one.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ratchet, summary } from "./helpers/ratchet";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name).split(path.sep).join("/")]));
}
const PAGES: { file: string; owner: string; feature: string }[] = [
  { file: "src/app/tools/deal-finder/page.tsx", owner: "WP13", feature: "deal-finder" },
  { file: "src/app/tools/rising/page.tsx", owner: "WP07", feature: "rising" },
  { file: "src/app/tools/demand/page.tsx", owner: "WP07", feature: "demand" },
];
// The loaders that return a ranking a tier pays for. A name here may be imported by a page that also imports premium-gates, and by nothing on the public-surface list below.
const PREMIUM_LOADERS = /\b(getTcgDeals|getVsEbayDeals|getCachedRisingCards|getRisingWeekAgo|getTopDemand|getDemandRanking|readPremiumShard|decryptPremium\w*)\b/;
const PUBLIC_SURFACES = [/^src\/app\/.*opengraph-image\.tsx$/, /^src\/app\/(feed|llms|llms-full|news-sitemap|sitemap)[^/]*(\/route\.ts)?$/, /^src\/app\/sitemaps\//, /^src\/app\/embed\//, /^src\/app\/api\/(search|watchlist|card|sealed|geo|me|promo)\b/, /^src\/lib\/og\//];

/** What is wrong with the source of a premium tool page (empty = fine). Exported shape kept small so the self-test below can feed it synthetic sources. */
export function pageProblems(raw: string): string[] {
  const src = strip(raw), out: string[] = [];
  if (!/from "@\/lib\/premium-gates"/.test(src)) out.push("must import @/lib/premium-gates");
  if (!/\baccessFor\(/.test(src)) out.push("must compute accessFor(...) on the server");
  if (!/\b(rowLimit|gate)\(/.test(src)) out.push("must limit rows with rowLimit()/gate() before rendering them");
  if (!/dynamic = "force-dynamic"/.test(src)) out.push('reads the session, so it is force-dynamic');
  if (/\bblur-(sm|md|lg|xl|2xl|3xl|\[)|backdrop-blur|\bselect-none\b.*\.map\(/.test(src)) out.push("rows are limited in the query, never hidden with CSS");
  return out;
}
test("the page detector flags an ungated page and accepts a gated one (the ratchet below is not vacuous)", () => {
  assert.ok(pageProblems('export default async function P() { const rows = await getTcgDeals(); return rows.map(x => x); }').length >= 4);
  const gated = 'import { accessFor, rowLimit } from "@/lib/premium-gates"; export const dynamic = "force-dynamic"; export default async function P() { const a = accessFor("deal-finder", u); const n = rowLimit("deal-finder", a); return n; }';
  assert.deepEqual(pageProblems(gated), []);
  assert.ok(pageProblems(gated + ' const c = "blur-md";').length === 1, "CSS blur is a problem");
});
test("each premium tool page takes its access from premium-gates and limits the rows it asks for (ratchet per owner)", () => {
  // a page that is not written yet is not an offender: the test is a ratchet, not a todo list
  const offenders = PAGES.filter((p) => exists(p.file) && pageProblems(read(p.file)).length > 0).map((p) => p.file);
  const r = ratchet("premium-gates-pages:tool pages", offenders);
  if (offenders.length) console.log(`  [premium-gates-pages] tool pages: ${summary(r)}  ${offenders.map((f) => `${f}: ${pageProblems(read(f)).join("; ")}`).join(" | ")}`);
  assert.deepEqual(r.failures, []);
});

test("no public surface (share image, feed, sitemap, llms file, embed, open API route) reads a premium ranking", () => {
  const files = [...walk("src/app"), ...walk("src/lib/og")].filter((f) => /\.(ts|tsx)$/.test(f));
  const hits = files.filter((f) => PUBLIC_SURFACES.some((re) => re.test(f))).filter((f) => PREMIUM_LOADERS.test(strip(read(f))));
  assert.deepEqual(hits, [], "a ranking a tier pays for must not appear on a surface everyone (or a crawler) can read");
});

test("the home page and the movers page show only the preview slice of a premium ranking", () => {
  for (const f of ["src/app/page.tsx", "src/app/movers/page.tsx", "src/components/home/home-data.ts"]) {
    if (!exists(f)) continue;
    const src = strip(read(f));
    if (!PREMIUM_LOADERS.test(src)) continue;
    assert.match(src, /\b(FREE_RISING_ROWS|FREE_DEMAND_ROWS|FREE_DEAL_ROWS|rowLimit\(|gate\(|teaserRows\()/, `${f} calls a premium loader and must cap it at the free preview`);
  }
});

test("no API route serves a premium ranking without premium-gates (ratchet per owner)", () => {
  const routes = walk("src/app/api").filter((f) => /route\.ts$/.test(f) && !f.startsWith("src/app/api/admin/"));
  const bad = routes.filter((f) => { const s = strip(read(f)); return PREMIUM_LOADERS.test(s) && !/from "@\/lib\/premium-gates"/.test(s); });
  const r = ratchet("premium-gates-pages:api routes", bad);
  if (bad.length) console.log(`  [premium-gates-pages] api routes: ${summary(r)}  ${bad.join(", ")}`);
  assert.deepEqual(r.failures, []);
});
test("premium sells only our analytics: no Scryfall-derived loader sits behind isPremium (C13)", () => {
  const SCRY_LOADERS = /\b(getOracleBySlug|getOraclePrintings|getCardDetail|getKeywordPage|getCommanderPage|getOracleAZ|getNameIndex|getCardPage|searchCards)\b/;
  const files = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith("src/lib/data/"));
  const hits = files.filter((f) => { const s = strip(read(f)); return /\bisPremium\(/.test(s) && SCRY_LOADERS.test(s) && /isPremium\([^)]*\)\s*\?[^:]*\b(getOracleBySlug|getOraclePrintings|getCardDetail|getKeywordPage|getCommanderPage|getOracleAZ|getCardPage)\b/.test(s); });
  assert.deepEqual(hits, [], "a ternary on isPremium that picks a Scryfall-derived loader paywalls Scryfall data");
});
