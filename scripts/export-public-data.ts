// Writes every public table to data/public/ (src/lib/public-data/format.ts), the files the site reads instead of Neon.
// Run by .github/workflows/dexcompare-public-data.yml after each import, which commits the result to main: that commit is the
// release that puts the new prices live (a data commit changes apps/dexcompare-sealed, so Vercel builds it).
//
//   DC2=… npx tsx scripts/export-public-data.ts [--out data/public]
//
// Reads each table once, whole (rule 3 in src/lib/db.ts: whole-table reads belong in scripts), ~25 MB from Neon per run. Refuses
// to write a snapshot that looks broken (no products, or under half of the last snapshot's products or offers), so a bad import
// or a half-empty database never reaches the site: the last good files stay.
process.env.DEXCOMPARE_SCRIPT = "1";

import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { buildPublicFiles, type Tables } from "../src/lib/public-data/export";
import { META_FILE, type PublicDataMeta } from "../src/lib/public-data/format";

const BATCH = 5000;

async function all<T>(read: (skip: number) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let skip = 0; ; skip += BATCH) {
    const page = await read(skip);
    out.push(...page);
    if (page.length < BATCH) return out;
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
  for (const [model, now] of [["Product", n.products], ["Offer", n.offers]] as const) {
    const before = previous?.counts?.[model] ?? 0;
    if (before && now < before / 2) throw new Error(`refusing to export: ${model} fell from ${before} to ${now} rows`);
  }

  const files = buildPublicFiles(tables, { generatedAt: new Date(), source: process.env.DB_SOURCE_NAME || "DC2" });
  fs.mkdirSync(dir, { recursive: true });
  let bytes = 0;
  for (const [name, body] of files) {
    fs.writeFileSync(path.join(dir, name), body);
    bytes += body.length;
  }
  console.log(`[export] wrote ${files.size} files (${(bytes / 1e6).toFixed(1)} MB) to ${path.relative(process.cwd(), dir)}:`, Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[export] failed:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
