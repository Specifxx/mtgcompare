// Writes every public table to data/public/ (src/lib/public-data/format.ts), the files the site reads instead of Neon.
// Run by .github/workflows/sealed-import.yml after each import, which commits the result to main: that commit is the
// release that puts the new prices live (a data commit changes the repository, so Vercel builds it).
//
//   DATABASE_URL=… npx tsx scripts/export-public-data.ts [--out data/public]
//
// Reads each table once, whole (rule 3 in src/lib/db.ts: whole-table reads belong in scripts), ~25 MB from Neon per run. Refuses
// to write a snapshot that looks broken (no products, or under half of the last snapshot's products or offers), so a bad import
// or a half-empty database never reaches the site: the last good files stay.
process.env.MTGCOMPARE_SCRIPT = "1";

import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { buildPublicFiles, type Tables } from "../src/lib/public-data/export";
import { META_FILE, type PublicDataMeta } from "../src/lib/public-data/format";
import { execFileSync } from "node:child_process";
import { demandSlugs, focusCatalog, type FocusOffer, type FocusProduct } from "../src/lib/focus";
import { dayOf, HISTORY_FILE, isPriceHistory, updatePriceHistory, type PriceHistory } from "../src/lib/price-history";

const BATCH = 5000;

async function all<T>(read: (skip: number) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let skip = 0; ; skip += BATCH) {
    const page = await read(skip);
    out.push(...page);
    if (page.length < BATCH) return out;
  }
}

const CULLED_FILE = "culled.json";

/** Search Console page demand from this repo's `demand` branch (RiftCompare's sister-demand job); none when it can't be read. */
function readDemand(): Set<string> {
  try {
    execFileSync("git", ["fetch", "--quiet", "--depth=1", "origin", "demand"], { stdio: "ignore", timeout: 60_000 });
    const raw = execFileSync("git", ["show", "FETCH_HEAD:gsc-pages.json"], { encoding: "utf8", timeout: 30_000 });
    const s = demandSlugs((JSON.parse(raw) as { pages?: Record<string, number[]> }).pages ?? {});
    console.log(`[export] ${s.size} product pages with search demand`);
    return s;
  } catch {
    console.log("[export] no demand branch: the focus rule alone decides");
    return new Set();
  }
}

async function main() {
  const outArg = process.argv.indexOf("--out");
  const dir = path.resolve(outArg > 0 ? process.argv[outArg + 1] : path.join(process.cwd(), "data", "public"));
  const tables: Tables = {
    Product: await all((skip) => prisma.product.findMany({ orderBy: { id: "asc" }, skip, take: BATCH })),
    Offer: await all((skip) => prisma.offer.findMany({ orderBy: { id: "asc" }, skip, take: BATCH })),
    ProductStat: await all((skip) => prisma.productStat.findMany({ orderBy: [{ productId: "asc" }, { market: "asc" }], skip, take: BATCH })),
    StoreStat: await all((skip) => prisma.storeStat.findMany({ orderBy: { store: "asc" }, skip, take: BATCH })),
    EbayListing: await all((skip) => prisma.ebayListing.findMany({ orderBy: [{ feed: "asc" }, { rank: "asc" }], skip, take: BATCH })).catch((e) => {
      console.warn(`[export] EbayListing unreadable (${(e as Error).message.slice(0, 120)}); exported empty.`);
      return [];
    }),
  } as unknown as Tables;

  // Sanity: never replace good files with a broken snapshot.
  let previous: PublicDataMeta | null = null;
  try {
    previous = JSON.parse(fs.readFileSync(path.join(dir, META_FILE), "utf8")) as PublicDataMeta;
  } catch {
    /* first export */
  }
  const n = { products: tables.Product.length, offers: tables.Offer.length };
  if (!n.products || !n.offers) throw new Error(`refusing to export: ${n.products} products, ${n.offers} offers`);

  // The low-traction cull (lib/focus.ts, owner 2026-11-07): only listed products, their offers and stats reach the site. The
  // database and the price history below keep everything, so a product that qualifies again comes back with its chart.
  const { keep, culled } = focusCatalog(
    tables.Product as unknown as FocusProduct[],
    tables.Offer as unknown as FocusOffer[],
    readDemand(),
  );
  const listed = { ...tables } as Tables;
  listed.Product = tables.Product.filter((r) => keep.has(String(r.id)));
  listed.Offer = tables.Offer.filter((r) => keep.has(String(r.productId)));
  listed.ProductStat = tables.ProductStat.filter((r) => keep.has(String(r.productId)));
  // Never replace good files with a snapshot under half the last one. The last files hold listed rows once a focused export has
  // run (culled.json is there), the whole tables before that.
  const focused = fs.existsSync(path.join(dir, CULLED_FILE));
  const base = focused ? listed : tables;
  for (const model of ["Product", "Offer"] as const) {
    const before = previous?.counts?.[model] ?? 0;
    const now = base[model].length;
    if (before && now < before / 2) throw new Error(`refusing to export: ${model} fell from ${before} to ${now} rows`);
  }
  console.log(`[export] focus: ${listed.Product.length} of ${tables.Product.length} products listed, ${Object.keys(culled).length} culled`);

  const files = buildPublicFiles(listed, { generatedAt: new Date(), source: process.env.DB_SOURCE_NAME || "DATABASE_URL" });
  fs.mkdirSync(dir, { recursive: true });
  // Culled product slug → its type page's slug ("" = the region's home): the product page 301s there (lib/culled.ts).
  files.set(CULLED_FILE, `${JSON.stringify(Object.fromEntries(Object.entries(culled).sort(([a], [b]) => (a < b ? -1 : 1))))}\n`);
  let bytes = 0;
  for (const [name, body] of files) {
    fs.writeFileSync(path.join(dir, name), body);
    bytes += body.length;
  }
  // The daily price history (lib/price-history.ts): today's cheapest in-stock price and in-stock store count per product per market,
  // folded into the file already in the checkout (the last import's), so the history rides with the snapshot it came from.
  const historyPath = path.join(dir, HISTORY_FILE);
  let prevHistory: PriceHistory | null = null;
  try {
    const j = JSON.parse(fs.readFileSync(historyPath, "utf8")) as unknown;
    prevHistory = isPriceHistory(j) ? j : null;
  } catch {
    /* first run: scripts/backfill-price-history.ts seeds it from git */
  }
  const slugOf = new Map((tables.Product as unknown as { id: string; slug: string }[]).map((p) => [p.id, p.slug]));
  const todayRows = (tables.ProductStat as unknown as { productId: string; market: string; lowestPriceCents: number | null; inStockStores: number; marketplaceOpen: boolean }[])
    .map((s) => ({ market: s.market, slug: slugOf.get(s.productId) ?? "", cents: s.inStockStores > 0 || s.marketplaceOpen ? s.lowestPriceCents : null, stores: s.inStockStores }))
    .filter((r) => r.slug);
  const history = JSON.stringify(updatePriceHistory(prevHistory, todayRows, dayOf(new Date())));
  fs.writeFileSync(historyPath, history);
  bytes += history.length;
  console.log(`[export] wrote ${files.size} files (${(bytes / 1e6).toFixed(1)} MB) to ${path.relative(process.cwd(), dir)}:`, Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[export] failed:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
