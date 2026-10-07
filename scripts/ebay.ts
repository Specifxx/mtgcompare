// The eBay pass runner. Run by .github/workflows/ebay-prices.yml at 05:37 and
// 17:37 UTC (before the 07:07 / 19:07 store import, which aggregates the rows),
// or by dispatch:
//
//   npx tsx scripts/ebay.ts
//   EBAY_ONLY_MARKET=US EBAY_DISPATCH_CAP=50 npx tsx scripts/ebay.ts   # smoke test
//   EBAY_FORCE=1 npx tsx scripts/ebay.ts                               # after a matching change
//
// Exit codes: 0 when eBay is not configured (a green no-op) or the pass ran;
// 1 when the keys are set but eBay refuses the token, when the failure breaker
// stopped the run (searches failing without a 429), when calls were spent and
// no search completed, or when the pass threw. The calls spent are recorded on
// the ImportRun in every case (the next run's foreign-spend check reads them).
// This file must not name the credential variables (tests/no-ebay-api.test.ts):
// it asks isEbayEnabled().
import { prisma } from "../src/lib/db";
import { ebaySpentThisRun, isEbayEnabled } from "../src/lib/ebay";
import { runEbayPass } from "../src/lib/ebay-import";
import { ebayRunVerdict, parseOnlyMarket } from "../src/lib/ebay-plan";

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main(): Promise<number> {
  if (process.env.EBAY_REFRESH === "false") {
    log("EBAY_REFRESH=false — skipping (0 calls).");
    return 0;
  }
  if (!isEbayEnabled()) {
    log("eBay not configured — skipping (0 calls).");
    return 0;
  }
  if (!process.env.DATABASE_URL) {
    log("DATABASE_URL is not set — skipping (0 calls).");
    return 0;
  }
  parseOnlyMarket(process.env.EBAY_ONLY_MARKET); // an unknown market code fails before anything is spent
  const run = await prisma.importRun.create({ data: { kind: "ebay" } });
  try {
    const summary = await runEbayPass(log, {
      // Every 100 pairs: a lower bound on the spend survives a timeout kill.
      onProgress: async (spent) => {
        await prisma.importRun.update({ where: { id: run.id }, data: { summary: { spent, partial: true } } });
      },
    });
    const verdict = ebayRunVerdict(summary);
    await prisma.importRun.update({ where: { id: run.id }, data: { ok: verdict.ok, finishedAt: new Date(), summary: summary as object } });
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
