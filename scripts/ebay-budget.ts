// Read-only look at the eBay listing import: today's Browse-call counter, the stored feeds and how old they are.
// Changes nothing (no ensureTables, no purge, no write).
//
//   DATABASE_URL=… npx tsx scripts/ebay-budget.ts
process.env.DEXCOMPARE_SCRIPT = "1";

import { prisma } from "../src/lib/db";
import { capsFromEnv } from "../src/lib/ebay-import";
import type { CapEnv } from "../src/lib/ebay-import";
import { parseMaxAgeHours } from "../src/lib/ebay-context";
import { budgetDay, BUDGET_TZ, prismaImportDb } from "../src/lib/ebay-store";

async function main() {
  const db = prismaImportDb(prisma);
  const env = process.env as CapEnv;
  const day = budgetDay(Date.now());
  const caps = capsFromEnv(env);
  const used = await db.used(day);
  console.log(`Budget day ${day} (${BUDGET_TZ}): ${used} Browse calls reserved of a ${caps.daily} daily cap (run cap ${caps.run}); ${Math.max(0, caps.daily - used)} left today.`);
  console.log(`Age bound: ${parseMaxAgeHours(env.EBAY_LISTING_MAX_AGE_HOURS)} h (rows older than that are never shown).`);

  const has = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('public."EbayListing"') IS NOT NULL AS "ok"`;
  if (!has[0]?.ok) {
    console.log("EbayListing: table does not exist yet (run `prisma db push` or the import).");
    return;
  }
  const s = await db.summary();
  console.log(`EbayListing: ${s.rows} rows in ${s.feeds} feeds (${s.itemFeeds} item feeds). Oldest row: ${s.oldest ? `${((Date.now() - s.oldest.getTime()) / 3600_000).toFixed(1)} h ago` : "none"}.`);
  const kinds = await prisma.$queryRaw<{ kind: string; feeds: bigint; rows: bigint; oldest: Date }[]>`
    SELECT split_part(split_part("feed", '|', 2), ':', 1) AS "kind", count(DISTINCT "feed") AS "feeds", count(*) AS "rows", min("fetchedAt") AS "oldest"
    FROM "EbayListing" GROUP BY 1 ORDER BY 1`;
  for (const k of kinds) console.log(`  ${k.kind.padEnd(7)} ${String(k.feeds).padStart(5)} feeds ${String(k.rows).padStart(6)} rows   oldest ${((Date.now() - new Date(k.oldest).getTime()) / 3600_000).toFixed(1)} h`);
  const days = await prisma.$queryRaw<{ day: string; total: number }[]>`SELECT "day", "total" FROM "EbayCallDay" ORDER BY "day" DESC LIMIT 7`;
  console.log("Recent days: " + (days.map((d) => `${d.day}=${d.total}`).join("  ") || "none"));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async () => {
    console.error("ebay-budget failed (is DATABASE_URL set?).");
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
