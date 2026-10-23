// Build data/public/price-history.json from the public-data snapshots already in git (lib/price-history.ts). Every import since
// 2026-10-15 committed data/public/product-stats.json and products.json to main, so the history of each product's cheapest in-stock
// price and in-stock store count is in git: real snapshots, not estimates. The last commit of each UTC day is folded in, oldest first.
//
//   npx tsx scripts/backfill-price-history.ts            (from apps/dexcompare-sealed, in a checkout with the history)
//
// Run once, when the history file is introduced; from then on scripts/export-public-data.ts adds each import's day.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { dayOf, HISTORY_FILE, updatePriceHistory, type PriceHistory, type TodayRow } from "../src/lib/price-history";

const DIR = "data/public";
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

type Stat = { productId: string; market: string; lowestPriceCents: number | null; inStockStores: number; marketplaceOpen: boolean };

function rowsAt(commit: string): TodayRow[] {
  const stats = JSON.parse(git("show", `${commit}:./${DIR}/product-stats.json`)) as Stat[];
  const products = JSON.parse(git("show", `${commit}:./${DIR}/products.json`)) as { id: string; slug: string }[];
  const slugOf = new Map(products.map((p) => [p.id, p.slug]));
  return stats
    .map((s) => ({ market: s.market, slug: slugOf.get(s.productId) ?? "", cents: s.inStockStores > 0 || s.marketplaceOpen ? s.lowestPriceCents : null, stores: s.inStockStores }))
    .filter((r) => r.slug);
}

const log = git("log", "--format=%H %cI", "--", `${DIR}/product-stats.json`).trim().split("\n").reverse();
const lastOfDay = new Map<number, string>();
for (const line of log) {
  const [hash, when] = line.split(" ");
  lastOfDay.set(dayOf(new Date(when)), hash);
}
let h: PriceHistory | null = null;
for (const [day, hash] of [...lastOfDay].sort((a, b) => a[0] - b[0])) {
  h = updatePriceHistory(h, rowsAt(hash), day);
  console.log(`${new Date(day * 86_400_000).toISOString().slice(0, 10)} ← ${hash.slice(0, 7)}`);
}
if (!h) throw new Error("no snapshots in git");
fs.writeFileSync(path.join(DIR, HISTORY_FILE), JSON.stringify(h));
const series = Object.values(h.series).reduce((n, m) => n + Object.keys(m).length, 0);
console.log(`wrote ${HISTORY_FILE}: ${series} series, ${(fs.statSync(path.join(DIR, HISTORY_FILE)).size / 1e3).toFixed(0)} KB`);
