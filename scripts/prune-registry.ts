// Drop stores that no longer earn their place: read successfully by the last
// import, yet listing fewer than --min sealed Pokémon products. A store that
// FAILED to read is never dropped here (a 429 or an outage says nothing about
// its stock) — look at StoreStat.lastError for those.
//
//   DATABASE_URL=… npx tsx scripts/prune-registry.ts [--min 3] [--write]
//
// Dry run by default: prints what it would remove.
process.env.DEXCOMPARE_SCRIPT = "1";

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
import type { StoreConfig } from "../src/lib/stores";

const args = process.argv.slice(2);
const minIdx = args.indexOf("--min");
const MIN = minIdx >= 0 ? Number(args[minIdx + 1]) : 3;

async function main() {
  const path = join(__dirname, "..", "src", "data", "stores.json");
  const registry: StoreConfig[] = JSON.parse(readFileSync(path, "utf8"));
  const stats = new Map((await prisma.storeStat.findMany({ select: { store: true, listed: true, lastError: true, lastOkAt: true } })).map((s) => [s.store, s]));
  const drop = registry.filter((s) => {
    const st = stats.get(s.key);
    return st && !st.lastError && st.lastOkAt && st.listed < MIN;
  });
  for (const s of drop) console.log(`drop ${s.market} ${s.key} (${s.base}): ${stats.get(s.key)!.listed} sealed listed`);
  const unread = registry.filter((s) => !stats.get(s.key)?.lastOkAt).length;
  console.log(`${drop.length} of ${registry.length} stores below ${MIN}; ${unread} never read successfully (kept).`);
  if (args.includes("--write") && drop.length) {
    const keep = registry.filter((s) => !drop.includes(s));
    writeFileSync(path, JSON.stringify(keep, null, 2) + "\n");
    console.log(`wrote ${keep.length} stores to src/data/stores.json`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
