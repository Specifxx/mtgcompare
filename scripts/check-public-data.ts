// Parity check for the public data files: runs every site loader twice against the SAME database, once with PUBLIC_DATA_MODE=db
// (the original SQL and Prisma reads) and once with PUBLIC_DATA_MODE=files over a fresh export of that database, and reports every
// difference and every read the file engine refused ([public-data:unsupported]). Run it after changing a loader or the engine:
//
//   DC2=… npx tsx scripts/export-public-data.ts --out /tmp/pd && DC2=… PUBLIC_DATA_DIR=/tmp/pd npx tsx scripts/check-public-data.ts
//
// Exit 1 on any difference or refusal. Rows of GROUP BY reads (no ORDER BY in their SQL) are compared as sets, and a result whose
// rows match but whose equal-key rows come in another order is counted apart (Postgres orders ties arbitrarily; the files order them
// by their stable sort key).
import { REGION_LIST } from "../src/lib/regions";
import * as data from "../src/lib/data";
import * as browse from "../src/lib/browse-data";
import * as deals from "../src/lib/deals";
import * as hub from "../src/lib/hub-data";
import * as guides from "../src/content/guides/data";
import { GUIDES } from "../src/content/guides/index";
import { inStockAlternatives } from "../src/lib/product-data";
import { prisma } from "../src/lib/db";

const refusals: string[] = [];
const warn = console.warn;
console.warn = (...a: unknown[]) => {
  const m = a.map(String).join(" ");
  if (m.includes("[public-data:")) refusals.push(m);
  else warn(...a);
};

function norm(v: unknown, unordered: boolean): unknown {
  if (v instanceof Map) return norm(Object.fromEntries([...v].sort(([a], [b]) => (String(a) < String(b) ? -1 : 1))), unordered);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return Number(v);
  if (Array.isArray(v)) {
    const out = v.map((x) => norm(x, unordered));
    return unordered ? out.map((x) => JSON.stringify(x)).sort().map((x) => JSON.parse(x)) : out;
  }
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, norm(x, unordered)]));
  return v;
}

let checks = 0;
const diffs: string[] = [];
const tieOrder: string[] = [];
async function same(label: string, run: () => Promise<unknown>, unordered = false) {
  checks++;
  process.env.PUBLIC_DATA_MODE = "db";
  const a = JSON.stringify(norm(await run(), unordered));
  process.env.PUBLIC_DATA_MODE = "files";
  const b = JSON.stringify(norm(await run(), unordered));
  if (a !== b) {
    // Same rows, only the order of equal sort keys differs (Postgres leaves ties in no particular order): allowed, counted apart.
    process.env.PUBLIC_DATA_MODE = "db";
    const ua = JSON.stringify(norm(await run(), true));
    process.env.PUBLIC_DATA_MODE = "files";
    const ub = JSON.stringify(norm(await run(), true));
    if (ua === ub) {
      tieOrder.push(label);
      return;
    }
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    diffs.push(`${label}\n    db:    …${a.slice(Math.max(0, i - 80), i + 160)}\n    files: …${b.slice(Math.max(0, i - 80), i + 160)}`);
  }
}

async function main() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  await same("allRegionOverviews", () => data.allRegionOverviews());
  await same("activeStoreKeys", () => hub.activeStoreKeys());
  for (const r of REGION_LIST) {
    const m = r.market;
    await same(`${m} marketProducts`, () => data.marketProducts(m), true);
    await same(`${m} marketProductCount`, () => data.marketProductCount(m));
    await same(`${m} homeRails`, () => data.homeRails(m, today));
    await same(`${m} regionOverview`, () => data.regionOverview(m));
    await same(`${m} lastCheckedAt`, () => data.lastCheckedAt(m));
    await same(`${m} storeStats`, () => data.storeStats(m), true);
    await same(`${m} setCounts`, () => data.setCounts(m));
    await same(`${m} setCountsGrouped`, () => hub.setCountsGrouped(m));
    await same(`${m} marketPage 1`, () => browse.marketPage(m, 1));
    await same(`${m} marketPage 3`, () => browse.marketPage(m, 3));
    await same(`${m} marketIndexCards`, () => browse.marketIndexCards(m));
    await same(`${m} dealsBySection`, () => deals.dealsBySection(m));
    await same(`${m} perPackLeaders`, () => deals.perPackLeaders(m));
    await same(`${m} newlyTracked`, () => deals.newlyTracked(m, 24, now));
    await same(`${m} typeSummary`, () => guides.typeSummary(m, ["me6", "cel30"]), true);
    for (const t of ["Booster Box", "Elite Trainer Box", "Collection", "Tin"]) {
      await same(`${m} productsByType ${t}`, () => data.productsByType(m, t), true);
      await same(`${m} typePageData ${t}`, () => hub.typePageData(m, t));
      await same(`${m} cheapestInStock ${t}`, () => data.cheapestInStock(m, [t], 12));
    }
    for (const set of ["sv8", "me2", "sv8pt5", "cel30"]) {
      await same(`${m} productsBySet ${set}`, () => data.productsBySet(m, set), true);
      await same(`${m} setOfferGroups ${set}`, () => data.setOfferGroups(m, set));
      await same(`${m} productCountsBySets ${set}`, () => deals.productCountsBySets(m, [set, "sv7"]));
    }
    await same(`${m} calendarProducts`, () => data.calendarProducts(m, ["me6", "cel30", "me5"]));
    // Sample products of the market: their page, related products and alternatives.
    process.env.PUBLIC_DATA_MODE = "db";
    const sample = (await data.marketProducts(m)).slice(0, 12);
    for (const p of sample) {
      await same(`${m} productPage ${p.slug}`, () => data.productPage(p.slug, m));
      if (p.setCode) await same(`${m} relatedProducts ${p.slug}`, () => data.relatedProducts(m, p.setCode!, p.slug));
      await same(`${m} inStockAlternatives ${p.slug}`, () => inStockAlternatives(m, p.productType, p.setCode, p.slug));
    }
    for (const g of GUIDES.slice(0, 11)) await same(`${m} guide ${g.slug}`, () => guides.loadGuideData(g.slug, r, now));
  }
  await same("belowMsrpUS", () => deals.belowMsrpUS());
  for (const s of ["pokebox", "tcgplayer", "cherry"]) {
    await same(`storeOffers ${s} 1`, () => data.storeOffers(s, 1));
    await same(`storeStat ${s}`, () => data.storeStat(s));
  }
  await same("marketsWithSet sv8", () => data.marketsWithSet("sv8"), true);
  await same("marketsWithType Booster Box", () => data.marketsWithType("Booster Box"), true);

  console.log(`[check-public-data] ${checks} loader calls compared; ${tieOrder.length} differ only in the order of ties; ${diffs.length} differ; ${refusals.length} refusals.`);
  for (const d of diffs.slice(0, 40)) console.log(`DIFF ${d}`);
  for (const r of [...new Set(refusals)].slice(0, 40)) console.log(`REFUSED ${r}`);
  await prisma.$disconnect();
  if (diffs.length || refusals.length) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
