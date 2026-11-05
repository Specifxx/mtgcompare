// Runs first in every Vercel build: today's Amazon prices, in every region with its own Amazon (AU, US, UK, CA, EU), for
// the ASINs scripts/amazon-asins.ts found, written to data/amazon-live/<region>.json (git-ignored). Amazon's licence lets
// a price be kept for 24 hours and shown with its time, so prices are fetched by each build and never committed; the
// product page shows one only while under 24 hours old (lib/amazon-live.ts) and the browser hides it after that.
// Most-compared products first, AMAZON_BUILD_CALLS getItems calls a region (ten ASINs each, one a second; 30 by default,
// about 35 seconds of build each). A price under 60% or over 160% of the product's in-stock store median is dropped (a
// different count, a marketplace seller's fantasy). Without credentials, or on any error, it writes nothing and never
// fails the build; a store whose account has no API access yet (403) is skipped and the next region still runs.
//   npx tsx scripts/fetch-amazon-prices.ts
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { amazonFor } from "../src/lib/amazon";
import { AmazonRefused, credentialsFor, creatorsClient, MARKETS, pickListing, PRICE_RESOURCES } from "../src/lib/amazon-creators";
import type { AsinFile, LiveFile } from "../src/lib/amazon-live";
import type { Region } from "../src/lib/regions";
import { median, regionProducts } from "./amazon-shared";

const API_REGIONS: Region[] = ["au", "us", "uk", "ca", "eu"];
const asinsFile = (r: Region) => path.join(process.cwd(), "data", "amazon", `asins-${r}.json`);
const OUT_DIR = path.join(process.cwd(), "data", "amazon-live");

async function region(r: Region) {
  const store = amazonFor(r);
  const market = MARKETS[r];
  if (!store || !market) return;
  const creds = credentialsFor(r);
  if (!creds || !existsSync(asinsFile(r))) return console.log(`Amazon prices ${r}: no credentials or no ASINs yet, skipped.`);
  const known = JSON.parse(readFileSync(asinsFile(r), "utf8")) as AsinFile;
  const wanted = regionProducts(r).filter((x) => known[x.p.slug]?.asin);
  const todo = wanted.slice(0, Number(process.env.AMAZON_BUILD_CALLS || 30) * 10);
  if (!todo.length) return console.log(`Amazon prices ${r}: no ASINs for in-stock products yet.`);
  const api = await creatorsClient(r, store.tag, creds);
  const fetchedAt = new Date().toISOString();
  const prices: LiveFile["prices"] = {};
  for (let i = 0; i < todo.length; i += 10) {
    const batch = todo.slice(i, i + 10);
    const ids = [...new Set(batch.map((x) => known[x.p.slug].asin!))];
    let items;
    try {
      items = await api.call("getItems", { itemIds: ids, itemIdType: "ASIN", resources: PRICE_RESOURCES });
    } catch (e) {
      console.log(`Amazon prices ${r}: ${(e as Error).message}`);
      if (e instanceof AmazonRefused) break;
      continue;
    }
    for (const x of batch) {
      const asin = known[x.p.slug].asin!;
      const it = items.find((it) => it.asin === asin);
      const pick = it && pickListing(it, market.currency);
      if (!pick) continue;
      const cents = Math.round(pick.amount * 100);
      const ref = median(x.prices);
      if (ref && (cents < ref * 0.6 || cents > ref * 1.6)) continue;
      prices[x.p.slug] = { asin, cents };
    }
  }
  if (!Object.keys(prices).length) return console.log(`Amazon prices ${r}: none (${api.calls()} calls).`);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, `${r}.json`), JSON.stringify({ fetchedAt, prices } satisfies LiveFile) + "\n");
  console.log(`Amazon prices ${r}: ${Object.keys(prices).length} of ${todo.length} ASINs priced in ${api.calls()} calls.`);
}

async function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  for (const r of API_REGIONS) await region(r).catch((e) => console.log(`Amazon prices ${r} skipped: ${(e as Error).message}`));
}

main().catch((e) => console.log(`Amazon prices skipped: ${(e as Error).message}`));
