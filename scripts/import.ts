// The daily import. Run by .github/workflows/import-prices.yml (07:00 and 19:00
// UTC) or by hand:
//
//   npm run import                      # catalogue + every store + aggregates
//   IMPORT_STORES=0 npm run import      # catalogue + TCGplayer only (fast, ~30 s)
//   IMPORT_ONLY_STORES=cherry,ozzie npm run import
//   IMPORT_ONLY_COUNTRY=UK npm run import
//   TCGCSV_CACHE_DIR=.cache npm run import   # reuse downloaded TCGCSV files (dev)
//
// Writes today's prices to DATABASE_URL and the price history to HISTORY_DIR
// (default .data/history; the workflow commits it to the `data` branch — see
// lib/history.ts). The store import never calls eBay: the eBay pass is
// scripts/ebay.ts (ebay-prices.yml), and this import aggregates its rows.
import fs from "node:fs";
import { prisma } from "../src/lib/db";
import { pruneBeacons } from "../src/lib/beacons";
import { aggregate, importCatalog, importStores, recordHistory, revalidateSite } from "../src/lib/import";
import { normalizeCountry } from "../src/lib/country";
import { recordToolsHistory } from "../src/lib/tools-history";

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  const withStores = process.env.IMPORT_STORES !== "0";
  const cacheDir = process.env.TCGCSV_CACHE_DIR || undefined;
  if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true });
  const run = await prisma.importRun.create({ data: { kind: withStores ? "full" : "catalog" } });
  const summary: Record<string, unknown> = {};
  try {
    const cat = await importCatalog(log, cacheDir);
    summary.catalog = { sets: cat.sets, cards: cat.cards, sealed: cat.sealed, tcgplayerOffers: cat.tcgplayerOffers };
    if (withStores) {
      const only = (process.env.IMPORT_ONLY_STORES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const market = process.env.IMPORT_ONLY_COUNTRY ? normalizeCountry(process.env.IMPORT_ONLY_COUNTRY) : undefined;
      log(`Stores: reading${only.length ? ` ${only.join(", ")}` : ""}${market ? ` in ${market}` : ""}…`);
      const stores = await importStores(log, { only, market });
      summary.stores = stores;
      const failed = stores.filter((s) => s.failed).map((s) => s.key);
      log(`Stores: ${stores.length} read, ${stores.reduce((a, s) => a + s.cards + s.sealed, 0)} offers, ${failed.length} failed${failed.length ? ` (${failed.join(", ")})` : ""}`);
    }
    await aggregate(log);
    summary.history = await recordHistory(log);
    // Demand snapshots and the Rising Cards feed (lib/tools-history.ts), beside
    // the price history on the data branch. Never fails the import.
    try {
      summary.tools = await recordToolsHistory(log);
    } catch (e) {
      log("Tools history: skipped", String(e));
    }
    // The click beacons' retention (lib/beacons.ts): never fails the import.
    try {
      summary.pruned = await pruneBeacons();
      log("Beacons: pruned", summary.pruned);
    } catch (e) {
      log("Beacons: prune failed", String(e));
    }
    await prisma.importRun.update({ where: { id: run.id }, data: { ok: true, finishedAt: new Date(), summary: summary as object } });
    // In the workflow the history is pushed first and scripts/publish-history.ts
    // revalidates once the site can read it.
    if (process.env.SKIP_REVALIDATE !== "1") await revalidateSite(log);
  } catch (e) {
    await prisma.importRun.update({ where: { id: run.id }, data: { ok: false, finishedAt: new Date(), summary: { ...summary, error: String(e) } as object } });
    throw e;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
