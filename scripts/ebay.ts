// The eBay pass runner. Run by .github/workflows/ebay-prices.yml at 04:37, 10:37, 16:37 and 23:37 UTC (the 23:37 run is the main pass, after RiftCompare's evening work), or by dispatch:
//
//   npx tsx scripts/ebay.ts [path-to-the-data-checkout]                 # default .data (scripts/plane-checkout.sh .data)
//   EBAY_ONLY_MARKET=US EBAY_DISPATCH_CAP=50 npx tsx scripts/ebay.ts   # smoke test
//   EBAY_FORCE=1 npx tsx scripts/ebay.ts                               # after a matching change
//
// It READS a checkout of the pointed data commit and WRITES NEON ONLY (EbayTrack, EbayBest, EbayPanel, EbayBanner, EbayLedger, the ImportRun row): eBay data is never written to GitHub.
// Observe-only (EBAY_OBSERVE_ONLY=1: the live quota is read and sampled, zero Browse calls) is opt-in since 2026-10-10.
//
// Exit codes: 0 when eBay is not configured (a green no-op), when the budget is zero (observe-only, kill switch, no quota, nothing left: the reason is on the run page) or the pass ran; 1 when the keys
// are set but eBay refuses the token, when the failure breaker stopped the run (searches failing without a 429), when calls were spent and no search completed, or when the pass threw. The calls
// spent are recorded on the ImportRun in every case. This file must not name the credential variables (tests/no-ebay-api.test.ts): it asks isEbayEnabled().
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { fsTree } from "../src/lib/data/plane/tree";
import { ebaySpentThisRun, isEbayEnabled } from "../src/lib/ebay";
import { prismaEbayStore, runEbayPass } from "../src/lib/ebay-import";
import { prismaLedger } from "../src/lib/ebay-ledger";
import { ebayRunVerdict, parseOnlyMarket } from "../src/lib/ebay-plan";

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** POST the ebay-banner tag (the panels, the chase strip and the ebayLive flag) so the next visit reads the fresh rows; a failure only delays them until their six-hour entries expire, and is a warning on the run page. */
async function purge(): Promise<void> {
  const base = process.env.REVALIDATE_URL?.replace(/\/+$/, "");
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) { log("REVALIDATE_URL or CRON_SECRET is not set: the cached panels refresh within six hours."); console.log("::warning title=eBay purge::REVALIDATE_URL or CRON_SECRET is not set: new eBay rows show within six hours"); return; }
  const res = await fetch(`${base}/api/revalidate?tag=ebay-banner`, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(20_000) });
  log(`revalidate: HTTP ${res.status}`);
  if (!res.ok) console.log(`::warning title=eBay purge::POST /api/revalidate answered HTTP ${res.status} (CRON_SECRET must match Vercel's): new eBay rows show within six hours`);
}

async function main(): Promise<number> {
  if (process.env.EBAY_REFRESH === "false") {
    log("EBAY_REFRESH=false: skipping (0 calls).");
    return 0;
  }
  if (!isEbayEnabled()) {
    log("eBay not configured: skipping (0 calls).");
    return 0;
  }
  if (!process.env.DATABASE_URL) {
    log("DATABASE_URL is not set: skipping (0 calls).");
    return 0;
  }
  parseOnlyMarket(process.env.EBAY_ONLY_MARKET); // an unknown market code fails before anything is spent
  const dir = path.resolve(process.argv[2] ?? ".data", "v1");
  const tree = fs.existsSync(path.join(dir, "meta")) ? fsTree(dir) : null;
  const run = await prisma.importRun.create({ data: { kind: "ebay" } });
  try {
    const summary = await runEbayPass(log, {
      tree,
      // The cron line that started the run (ebay-prices.yml sets EBAY_SCHEDULE: empty for a dispatch, which is a main run); unset outside Actions, where the clock decides.
      // GitHub starts these crons hours late, so the schedule, not the hour, says which run is the 23:37 main pass.
      schedule: process.env.EBAY_SCHEDULE,
      store: prismaEbayStore(prisma),
      ledger: prismaLedger(prisma),
      // No `revalidate` here: the purge runs below, AFTER the ImportRun row says ok and how many searches completed, or a visit in between would cache ebayLive=false for six hours.
      // Every 100 calls: a lower bound on the spend survives a timeout kill.
      onProgress: async (spent) => {
        await prisma.importRun.update({ where: { id: run.id }, data: { summary: { spent, partial: true } } });
      },
    });
    const verdict = ebayRunVerdict(summary);
    await prisma.importRun.update({ where: { id: run.id }, data: { ok: verdict.ok, finishedAt: new Date(), summary: summary as unknown as object } });
    if (summary.completed > 0) await purge().catch((e) => log(`revalidate: ${(e as Error).message}`));
    if (!verdict.ok) {
      log(`eBay run failed: ${verdict.reason}.`);
      return 1;
    }
    return 0;
  } catch (e) {
    await prisma.importRun
      .update({ where: { id: run.id }, data: { ok: false, finishedAt: new Date(), summary: { error: (e as Error).message, spent: ebaySpentThisRun() } } })
      .catch(() => {});
    throw e;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
