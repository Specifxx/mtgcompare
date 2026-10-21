// The scheduled job: read every store and TCGplayer, update the database, then
// ask the live site to re-render its cached pages.
//
//   DATABASE_URL=… npx tsx scripts/import.ts [--only au,cherry] [--concurrency 8]
//
// --only takes store keys and markets; "tcgplayer" (or "US") includes TCGplayer.
//
// Env: DATABASE_URL (required); NEXT_PUBLIC_SITE_URL + REVALIDATE_SECRET
// (refresh the live pages).
process.env.DEXCOMPARE_SCRIPT = "1";

import { appendFileSync } from "node:fs";
import { runImport } from "../src/lib/importer";
import { prisma } from "../src/lib/db";
import { purgeCutoff } from "../src/lib/ebay-context";
import { SITE_URL } from "../src/lib/site";
import { utcTimestamp } from "../src/lib/pg-time";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

// A marketplace that hasn't been read for this long fails the job (see main).
const MARKETPLACE_STALE_MS = 48 * 3600_000;

const FILES_RELEASE = "not needed: the data commit's deploy refreshes every page";

async function revalidate(): Promise<string> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return "skipped (REVALIDATE_SECRET not set)";
  try {
    const res = await fetch(`${SITE_URL}/api/revalidate`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
    // 202: the site serves its bundled files, so this import reaches the pages with the publish step's deploy, not a purge.
    if (res.status === 202) return FILES_RELEASE;
    return res.ok ? "ok" : `failed: HTTP ${res.status}`;
  } catch (e) {
    return `failed: ${(e as Error).message}`;
  }
}

// Fewer product URLs than this across every region's sitemap means the live
// sitemap is broken (a failed query, a stale copy, the wrong database), not
// quiet: the local import lists ~8,000. A full import is the only run that can
// judge it, so --only runs skip the check.
const MIN_SITEMAP_PRODUCTS = 1000;

/**
 * After the pages are refreshed, read the live sitemap index and count product
 * URLs across the regional sitemaps (src/lib/sitemap.ts). Returns a problem
 * sentence, or null. Network trouble is a warning, not a failure: the import
 * itself succeeded, and the next run checks again.
 */
async function checkLiveSitemap(): Promise<string | null> {
  const get = async (url: string) => {
    const res = await fetch(url, { headers: { "user-agent": "dexcompare-import sitemap check" }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  };
  try {
    const index = await get(`${SITE_URL}/sitemap.xml`);
    const files = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /\/sitemap\/\d+\.xml$/.test(u));
    if (!files.length) return `${SITE_URL}/sitemap.xml is not a sitemap index (no /sitemap/<n>.xml entries).`;
    let products = 0;
    const counts: string[] = [];
    for (const f of files) {
      const xml = await get(f);
      const urls = xml.match(/<loc>/g)?.length ?? 0;
      const n = xml.match(/\/p\/[^<]+<\/loc>/g)?.length ?? 0;
      products += n;
      counts.push(`${f.replace(SITE_URL, "")}: ${urls} URLs, ${n} products`);
    }
    console.log(`Live sitemap: ${products} product URLs\n  ${counts.join("\n  ")}`);
    return products < MIN_SITEMAP_PRODUCTS ? `Live sitemap lists ${products} product URLs (expected at least ${MIN_SITEMAP_PRODUCTS}).` : null;
  } catch (e) {
    console.log(`::warning::Live sitemap not checked: ${(e as Error).message}`);
    return null;
  }
}

/**
 * A second line of defence for eBay API License Agreement 3.1(b) (delete copies no longer required): the eBay import
 * (scripts/ebay-import.ts) purges listings older than the age bound + 4 h at the end of each of its runs; this does the
 * same, with one DELETE, at the end of every store import, so a stopped eBay job cannot leave old listings behind. It never
 * fails the import (the table may not exist yet).
 */
async function purgeEbayListings(): Promise<string> {
  try {
    const cutoff = purgeCutoff(Date.now(), process.env.EBAY_LISTING_MAX_AGE_HOURS); // the same helper (and bound) as the eBay import's purge
    const n = await prisma.$executeRaw`DELETE FROM "EbayListing" WHERE "fetchedAt" < ${utcTimestamp(cutoff)}`;
    return `${n} expired eBay listings deleted`;
  } catch {
    return "eBay listing purge skipped (no table yet)";
  }
}

async function main() {
  const only = opt("only")?.split(",").map((s) => (s.length === 2 ? s.toUpperCase() : s));
  const summary = await runImport({ only, concurrency: Number(opt("concurrency") ?? 3) });
  const purged = await purgeEbayListings();
  console.log(purged);
  const reval = await revalidate();
  const sitemapProblem = (reval === "ok" || reval === FILES_RELEASE) && !only ? await checkLiveSitemap() : null;

  // "N stores" counts independent stores only; a marketplace is reported by name.
  const marketplaces = summary.marketplaces.map((m) => `${m.name} ${m.ok ? `read (${m.offers} offers)` : "NOT read"}`);
  const lines = [
    `## DexCompare import`,
    ``,
    [
      ...(summary.stores ? [`${summary.ok}/${summary.stores} stores read`] : []),
      ...marketplaces,
      `${summary.offers} offers written`,
      `${summary.stats} product×market summaries`,
      `${summary.minutes.toFixed(1)} min`,
    ].join(" · "),
    ``,
    `| Market | Stores | Read OK | Offers | In stock |`,
    `| --- | ---: | ---: | ---: | ---: |`,
    ...Object.entries(summary.byMarket)
      .sort()
      .map(([m, s]) => `| ${m} | ${s.stores} | ${s.ok} | ${s.offers} | ${s.inStock} |`),
    ``,
    `Low-price outliers dropped: ${summary.outliers}`,
    `High-price outliers dropped: ${summary.highOutliers}`,
    `Marketplace placeholder asks dropped: ${summary.placeholders}`,
    `Stores written as sold out (in-stock prices under half the market on 5+ products): ${summary.suspectStores.map((s) => `${s.store} (${s.low})`).join(", ") || "none"}`,
    `Dormant stores (20+ listings, none in stock): ${summary.dormant.length ? summary.dormant.join(", ") : "none"}`,
    ...(summary.renamed ? [`Products renamed: ${summary.renamed}`] : []),
    `eBay listings: ${purged}`,
    `Page refresh: ${reval}`,
    ``,
    summary.failed.length ? `### Not read this run (${summary.failed.length}) — their previous rows were kept` : ``,
    ...summary.failed.map((f) => `- ${f.market} \`${f.key}\`: ${f.error}`),
  ];
  console.log("\n" + lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  await prisma.$disconnect();

  // A failed marketplace read is an annotation on the run (GitHub shows
  // "::warning::" lines on the run page, not only in the log)...
  for (const m of summary.marketplaces) if (!m.ok) console.log(`::warning::${m.name} not read: ${m.error ?? "?"}`);
  const problems: string[] = [];
  // ...and a red run once it has lasted: TCGplayer's rows go "unknown" after
  // 72 hours and are pruned after 14 days, and it is the site's income.
  for (const m of summary.marketplaces) {
    const age = m.lastOkAt ? Date.now() - m.lastOkAt.getTime() : Infinity;
    if (!m.ok && age > MARKETPLACE_STALE_MS) {
      problems.push(`${m.name} has not been read for ${m.lastOkAt ? `${Math.round(age / 3600_000)} hours` : "any run yet"} (last error: ${m.error ?? "?"}).`);
    }
  }
  // A run that read almost nothing is broken (network, a platform change), not quiet.
  if (summary.stores > 10 && summary.ok < summary.stores * 0.5) problems.push(`Only ${summary.ok}/${summary.stores} stores read.`);
  // Nothing requested was read at all (e.g. --only tcgplayer, and it failed).
  const requested = summary.stores + summary.marketplaces.length;
  if (requested > 0 && summary.ok === 0 && summary.marketplaces.every((m) => !m.ok)) problems.push(`None of the ${requested} sources requested was read.`);
  if (sitemapProblem) problems.push(sitemapProblem);
  if (problems.length) {
    for (const p of problems) console.log(`::error::${p}`);
    console.error(`${problems.join(" ")} Failing the job so it gets looked at.`);
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
