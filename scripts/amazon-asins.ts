// Finds each product's ASIN on its region's own Amazon (AU, US, UK, CA, DE for the eurozone) with the Creators API's
// searchItems, in the daily import (sealed-import.yml, after the export). A result counts only when the sealed classifier
// (lib/sealed-title.ts identify) reads its title as the SAME product (the same groupKey): ten results, no match, no ASIN;
// a wrong merge is worse than a missing price, as with the stores. Found ASINs and misses go in
// data/amazon/asins-<region>.json (ASINs may be stored; prices never are) and ride the publish commit; a miss is retried
// after 30 days. Without credentials it does nothing; a store whose account has no API access yet (403) ends that region
// quietly and the next still runs. data/amazon/status-<region>.json says what the last run did.
//   npx tsx scripts/amazon-asins.ts            AMAZON_SEARCH_BUDGET=400 a region by default
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { amazonFor } from "../src/lib/amazon";
import { AmazonRefused, credentialsFor, creatorsClient, MARKETS } from "../src/lib/amazon-creators";
import type { AsinFile } from "../src/lib/amazon-live";
import { searchTerms } from "../src/lib/affiliate";
import type { Region } from "../src/lib/regions";
import { identify } from "../src/lib/sealed-title";
import { regionProducts, type PubProduct } from "./amazon-shared";

const DIR = path.join(process.cwd(), "data", "amazon");
const RECHECK_MISS_DAYS = 30;
export const API_REGIONS: Region[] = ["au", "us", "uk", "ca", "eu"];

/** Whether an Amazon title is this product and no other: the classifier files it under the product's own groupKey. */
export function amazonTitleMatches(p: Pick<PubProduct, "groupKey">, title: string): boolean {
  const id = identify(title);
  return typeof id === "object" && id.groupKey === p.groupKey;
}

const MTG_WORD = /\bmtg\b|\bmagic\b/i;
export const amazonQuery = (name: string) => {
  const t = searchTerms(name);
  return (MTG_WORD.test(t) ? t : `MTG ${t}`).replace(/\s+/g, " ").trim();
};

async function region(r: Region) {
  const store = amazonFor(r);
  if (!store || !MARKETS[r]) return;
  const FILE = path.join(DIR, `asins-${r}.json`);
  const status = (o: object) => writeFileSync(path.join(DIR, `status-${r}.json`), JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n");
  mkdirSync(DIR, { recursive: true });
  const creds = credentialsFor(r);
  if (!creds) {
    status({ state: "off" });
    return console.log(`Amazon ASINs ${r}: no AMAZON_CREATORS_* credentials yet, skipped.`);
  }
  const budget = Number(process.env.AMAZON_SEARCH_BUDGET || 400);
  const today = new Date().toISOString().slice(0, 10);
  const known: AsinFile = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
  const products = regionProducts(r);
  const live = new Set(products.map((x) => x.p.slug));
  const todo = products.filter(({ p }) => {
    const k = known[p.slug];
    if (k?.asin) return false;
    return !k || (Date.parse(today) - Date.parse(k.checked)) / 864e5 >= RECHECK_MISS_DAYS;
  });
  const api = await creatorsClient(r, store.tag, creds).catch((e) => {
    console.log(`Amazon ASINs ${r}: ${(e as Error).message} (no Creators API access yet?), skipped.`);
    status({ state: "refused", note: (e as Error).message.slice(0, 120) });
    return null;
  });
  if (!api) return;
  let found = 0, searched = 0, refused = "";
  for (const { p } of todo.slice(0, budget)) {
    try {
      const items = await api.call("searchItems", { keywords: amazonQuery(p.name), resources: ["itemInfo.title"], itemCount: 10 });
      searched++;
      const hit = items.find((it) => amazonTitleMatches(p, it.itemInfo?.title?.displayValue ?? ""));
      known[p.slug] = { asin: hit?.asin ?? null, checked: today };
      if (hit) found++;
    } catch (e) {
      console.log(`Amazon ASINs ${r}: stopped at ${p.slug}: ${(e as Error).message}`);
      if (e instanceof AmazonRefused) {
        refused = (e as Error).message.slice(0, 120);
        break;
      }
    }
  }
  // Products gone from the region drop out, so the file stays the size of the catalogue.
  const out = Object.fromEntries(Object.entries(known).filter(([k]) => live.has(k)).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(FILE, JSON.stringify(out, null, 0).replace(/},"/g, '},\n"') + "\n");
  const asins = Object.values(out).filter((e) => e.asin).length;
  status({ state: refused && !searched ? "refused" : "ok", searched, found, known: asins, waiting: Math.max(0, todo.length - searched), ...(refused ? { note: refused } : {}) });
  console.log(`Amazon ASINs ${r}: ${searched} searched, ${found} found, ${asins} known, ${Math.max(0, todo.length - searched)} waiting.`);
}

async function main() {
  for (const r of API_REGIONS) await region(r).catch((e) => console.log(`Amazon ASINs ${r} skipped: ${(e as Error).message}`));
}

if (process.argv[1] && /amazon-asins\.ts$/.test(process.argv[1])) main().catch((e) => console.log(`Amazon ASINs skipped: ${(e as Error).message}`));
