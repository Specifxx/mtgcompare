// The daily eBay listing import: GitHub Actions runs this once a day (.github/workflows/dexcompare-ebay-import.yml).
//
//   DATABASE_URL=… EBAY_CLIENT_ID=… EBAY_CLIENT_SECRET=… npx tsx scripts/ebay-import.ts \
//        [--dry-run] [--only chase,sealed,types,sets,sweep,items] [--max-calls N] [--force]
//
// It reads ProductStat/Offer, plans which eBay searches to make (src/lib/ebay-import.ts: priority, caps,
// eligibility), reserves each Browse call in the database BEFORE making it (one atomic statement: overlapping runs
// and manual dispatches cannot pass the daily cap), searches with concurrency 3, and REPLACES each feed's rows in the
// EbayListing table (never appends; an empty or failed refresh keeps the old rows until the age bound). A run, in order:
//   1. the fixed feeds: chase, sealed, types, sets (265 calls);
//   2. the CATALOGUE SWEEP (src/lib/ebay-sweep.ts): per marketplace (US, UK, EU first, then AU, CA), broad searches paged 200
//      listings a call, each listing handed to the product the classifier says it is (one call can feed dozens of products); an
//      item feed for every product found, cheap ones included, written 100 feeds to a transaction; up to EBAY_SWEEP_CALLS (2,100)
//      of the run cap. Each marketplace starts with the HOT PASS: the hot sets' own searches ("Pokemon 30th elite trainer box"…),
//      at most half its share;
//   3. one search per product the sweep did not cover, with whatever is left of the run cap: first every HOT-SET product of the
//      US, UK and EU (any type, any price), then every ELIGIBLE product, most valuable first.
// The hot sets and the market order are the owner's, in src/lib/popular.ts (DEPLOY.md, "Priorities: markets and hot sets").
// (One search per product alone reached 1,735 of the 7,701 eligible keys a day, and 44% of those searches came back empty.)
// It ends with the purge of rows older than the bound + 4 h. The website reads the table; only this job holds eBay credentials.
// scripts/ebay-sweep-probe.ts (the workflow's `probe` input) measures the sweep with ~60 calls and writes no listings.
//
// A feed refreshed within min(2 h, a quarter of the age bound) is not bought again, and a marketplace with many such item feeds
// is not swept again (a re-run, an overlapping run, a retry after a crash); --force buys everything again. The run stops, with
// ::error::, when eBay refuses the keyset (401/403 on a search), or 6 searches in a row fail, or 30 in a row come back with no
// listings at all (BREAKER_FAILURES, BREAKER_EMPTY).
//
// --dry-run prints the plan and the expected calls: no network and no database writes (it does read the product tables); the
// sweep's coverage shows only in a real run (the summary's Sweep table).
// Env: DATABASE_URL; EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (DEXCOMPARE_EBAY_CLIENT_ID / _SECRET win when set);
// optional EBAY_DAILY_CAP (2500, max 2500: this site's share of a 5,000 keyset shared with the owner's other site; set it on
// BOTH sites), EBAY_RUN_CAP (2500), EBAY_SWEEP_CALLS (2100), EBAY_LISTING_MAX_AGE_HOURS (26).
// Exit 1: token failure (only eBay's OAuth error category is printed), a search refusal or the circuit breaker, or fewer than
// half of the planned feeds refreshed (the fixed feeds and the per-product searches; the sweep is reported on its own).
process.env.DEXCOMPARE_SCRIPT = "1";

import { appendFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { keysPresent, realDeps, type EbayEnv } from "../src/lib/ebay-api";
import { BREAKER_EMPTY, BREAKER_FAILURES, BUCKETS, runImport, type Bucket, type CapEnv } from "../src/lib/ebay-import";
import { capacityReport, runReport } from "../src/lib/ebay-report";
import { prismaImportDb } from "../src/lib/ebay-store";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function summaryFile(lines: string[]) {
  console.log("\n" + lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

async function main() {
  const dry = flag("dry-run");
  const onlyArg = opt("only");
  const only = onlyArg ? (onlyArg.split(",").map((s) => s.trim()).filter(Boolean) as Bucket[]) : undefined;
  if (only?.some((b) => !BUCKETS.includes(b))) {
    console.error(`--only takes ${BUCKETS.join(", ")}`);
    process.exit(2);
  }
  const maxCalls = opt("max-calls") !== undefined ? Number(opt("max-calls")) : undefined;
  if (maxCalls !== undefined && !(Number.isFinite(maxCalls) && maxCalls >= 0)) {
    console.error("--max-calls takes a number");
    process.exit(2);
  }
  if (!dry && !keysPresent(process.env as EbayEnv)) {
    summaryFile(["## DexCompare eBay import", "", "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not set for this job: nothing imported (the site keeps showing the previous listings until they age out)."]);
    return;
  }

  const summary = await runImport(
    { db: prismaImportDb(prisma), api: realDeps(), env: process.env as CapEnv, log: (l) => console.log(l) },
    { dryRun: dry, only, maxCalls, force: flag("force") },
  );

  const lines = ["## DexCompare eBay import", "", ...runReport(summary), ...(dry ? ["", "### Capacity model", "", ...capacityReport(summary.plan)] : [])];
  summaryFile(lines);
  await prisma.$disconnect();

  if (dry) return;
  const problems: string[] = [];
  if (summary.stopped === "token") problems.push(`eBay token request failed: ${summary.tokenError ?? "error"}. Check the keys are a PRODUCTION keyset (not Sandbox) with Buy API access.`);
  else if (summary.stopped === "forbidden") problems.push(`eBay refused the search (${summary.tokenError ?? "http 401/403"}). The keyset needs Buy API (Browse) access in the production environment; see DEPLOY.md, Troubleshooting. The run stopped after the first refusal.`);
  else if (summary.stopped === "failing") problems.push(`${BREAKER_FAILURES} searches in a row failed (last: ${summary.tokenError ?? "error"}); the run stopped to protect the daily call budget.`);
  else if (summary.stopped === "empty") problems.push(`${BREAKER_EMPTY} searches in a row returned no listings at all; the run stopped to protect the daily call budget. Check the filter syntax and the keyset (DEPLOY.md, Troubleshooting).`);
  else if (summary.feedsPlanned > 0 && summary.feedsRefreshed < summary.feedsPlanned * 0.5) {
    problems.push(`Only ${summary.feedsRefreshed} of ${summary.feedsPlanned} planned feeds refreshed${summary.stopped ? ` (run stopped: ${summary.stopped})` : ""}.`);
  }
  if (summary.stopped === "rate-limited") console.log("::warning::eBay answered 429 (rate limited): the run stopped; the previous rows were kept.");
  if (problems.length) {
    for (const p of problems) console.log(`::error::${p}`);
    process.exit(1);
  }
}

main().catch(async (e) => {
  // No detail beyond the error's name: nothing here may print a credential.
  console.log(`::error::eBay import failed unexpectedly (${e instanceof Error ? e.name : "error"}${e && typeof e === "object" && "code" in e ? ` ${String((e as { code: unknown }).code)}` : ""}).`);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
