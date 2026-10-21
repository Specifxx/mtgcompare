// A one-off measurement of the catalogue sweep against real eBay results: how many listings each broad search returns,
// how many the classifier and matcher hand to a product, how many products that covers per marketplace, and samples of
// what did NOT match (so the matcher can be tuned). It WRITES NO LISTINGS; every call is reserved against the day's cap
// like the importer's. Run from the eBay import workflow (input `probe`), never on a schedule.
//
//   DATABASE_URL=… EBAY_CLIENT_ID=… EBAY_CLIENT_SECRET=… npx tsx scripts/ebay-sweep-probe.ts [--pages 2] [--max-calls 60]
process.env.DEXCOMPARE_SCRIPT = "1";

import { prisma } from "../src/lib/db";
import { createTokenManager, EbayError, keysPresent, realDeps, searchPage, type EbayEnv } from "../src/lib/ebay-api";
import { MARKETPLACE_IDS, type MarketplaceId } from "../src/lib/ebay-context";
import { capsFromEnv, type CapEnv } from "../src/lib/ebay-import";
import { relevantToProduct, sealedIdentity } from "../src/lib/ebay-normalise";
import { budgetDay, prismaImportDb } from "../src/lib/ebay-store";
import { buildSweepIndex, SweepCollector, sweepMarketplace, sweepVocabulary, type SweepProduct } from "../src/lib/ebay-sweep";
import { identify, isIdentity } from "../src/lib/sealed-title";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  if (!keysPresent(process.env as EbayEnv)) {
    console.log("no eBay keys: nothing to probe");
    return;
  }
  const pages = Number(opt("pages") ?? 2);
  const maxCalls = Number(opt("max-calls") ?? 60);
  const db = prismaImportDb(prisma);
  const api = realDeps();
  const day = budgetDay(api.now());
  const caps = capsFromEnv(process.env as CapEnv);
  let spent = 0;
  const rows = await db.planRows();
  const vocab = sweepVocabulary(rows);
  const tokens = createTokenManager(api);
  const order: MarketplaceId[] = ["EBAY_US", "EBAY_GB", "EBAY_AU", "EBAY_CA", "EBAY_DE"];
  console.log(`probe: ${rows.length} product rows; ${pages} page(s) per query; at most ${maxCalls} calls; budget day ${day}`);
  for (const mp of order.filter((m) => MARKETPLACE_IDS.includes(m))) {
    const index = buildSweepIndex(rows, mp, vocab);
    const samples = { miss: [] as string[], amb: [] as string[], hit: [] as string[], rej: new Map<string, number>(), strictHits: 0, hits: 0 };
    const collector = new SweepCollector(index, api.now(), (title, o) => {
      if ("product" in o) {
        samples.hits++;
        const p: SweepProduct = o.product;
        if (relevantToProduct(title, { groupKey: p.groupKey, type: p.type, setCode: null })) samples.strictHits++;
        if (samples.hit.length < 25) samples.hit.push(`  HIT  ${title}  =>  ${p.name}`);
        return;
      }
      if (o.miss === "rejected") {
        const why = identify(title, { strict: false });
        const k = isIdentity(why) ? "noise/multi-unit" : why;
        samples.rej.set(k, (samples.rej.get(k) ?? 0) + 1);
        return;
      }
      if (o.miss === "no-product" && samples.miss.length < 30) {
        const id = sealedIdentity(title, false);
        samples.miss.push(`  MISS ${title}  [${id?.groupKey ?? "?"}]`);
      }
      if (o.miss === "ambiguous" && samples.amb.length < 10) samples.amb.push(`  AMB  ${title}`);
    });
    const budget = mp === "EBAY_US" ? pages * 10 : Math.max(1, pages - 1) * 10;
    const progress = await sweepMarketplace(
      collector,
      Math.min(budget, maxCalls - spent),
      async (spec) => {
        const total = await db.reserve(day, 1, caps.daily);
        if (total == null) throw new Error("daily cap reached");
        spent++;
        // The repeat after a 401 is a second call: reserved like the first.
        return searchPage(api, tokens, spec, async () => {
          const ok = (await db.reserve(day, 1, caps.daily)) != null;
          if (ok) spent++;
          return ok;
        });
      },
      {
        concurrency: 3,
        isFatal: (e) => (e instanceof Error && e.message === "daily cap reached") || (e instanceof EbayError && (e.status === 429 || e.status === 401 || e.status === 403 || e.code.startsWith("token"))),
      },
    );
    const feeds = collector.feeds();
    const ge = (n: number) => [...feeds.values()].filter((f) => f.length >= n).length;
    const s = collector.stats;
    console.log(`\n=== ${mp}: ${index.products.length} products in the index`);
    console.log(`pages ${s.pages}, listings ${s.listings}, valid ${s.valid}, matched ${s.matched} (strict rule would take ${samples.strictHits} of ${samples.hits})`);
    console.log(`miss: ${JSON.stringify(s.miss)}; rejected by: ${JSON.stringify(Object.fromEntries(samples.rej))}`);
    console.log(`products with >=1 listing ${ge(1)}, >=2 ${ge(2)}, >=6 ${ge(6)}`);
    console.log(`queries: ${progress.map((p) => `${p.key} ${p.pages}p total=${p.total ?? "?"} gained=${p.gained} ${p.stopped}`).join("; ")}`);
    for (const l of [...samples.hit, ...samples.miss, ...samples.amb]) console.log(l);
    if (spent >= maxCalls) break;
  }
  console.log(`\nprobe made ${spent} calls`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.log(`::error::probe failed (${e instanceof Error ? `${e.name}: ${e.message}` : "error"})`);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
