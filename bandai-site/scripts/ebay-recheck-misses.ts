// Checks, on eBay, the eligible products that have no eBay result yet (never
// checked, or last check found no matching listing) — run after the matcher changes, so the fix shows today
// instead of after each product's next scheduled refresh. Counts against this
// site's daily share exactly like the daily import (data/state/ebay-usage.json)
// and stops at the share, the app's live remaining count minus a reserve, or
// --max. Then run scripts/import-all.ts with EBAY_REFRESH=false to rebuild.
//
//   EBAY_CLIENT_ID=… EBAY_CLIENT_SECRET=… npx tsx scripts/ebay-recheck-misses.ts --max=400
import fs from "node:fs";
import path from "node:path";
import { SITE } from "@/site.config";
import type { Catalog, Market } from "@/lib/site-types";
import { CURRENCY } from "@/lib/site-types";
import { ebayRemaining, ebayToken, MARKET_SHARE, searchLowest, useSetEditions, type EbayState } from "@/lib/import/ebay";
import { readSummary } from "@/lib/price-store";
import { referenceCents } from "@/lib/import/tcgcsv";

const max = Number(process.argv.find((a) => a.startsWith("--max="))?.split("=")[1] ?? 400);
const STATE = path.join(process.cwd(), "data", "state");

async function main() {
  const cat = JSON.parse(fs.readFileSync("data/public/catalog.json", "utf8")) as Catalog;
  useSetEditions(cat.sets);
  const fx = (JSON.parse(fs.readFileSync("data/public/meta.json", "utf8")) as { fx: Record<string, number> }).fx;
  const sum = readSummary();
  const state = JSON.parse(fs.readFileSync(path.join(STATE, "ebay.json"), "utf8")) as EbayState;
  const usagePath = path.join(STATE, "ebay-usage.json");
  const usage = JSON.parse(fs.readFileSync(usagePath, "utf8")) as { day: string; calls: number };
  const today = new Date().toISOString().slice(0, 10);
  if (usage.day !== today) Object.assign(usage, { day: today, calls: 0 });
  const token = await ebayToken();
  const remaining = await ebayRemaining(token);
  const budget = Math.max(0, Math.min(max, SITE.ebay.dailyBudget - usage.calls, remaining == null ? Infinity : remaining - 100));
  const misses = cat.products
    .map((p) => ({ p, ref: referenceCents(sum[p.id]?.t) ?? 0 }))
    // Eligible products with no eBay result: never checked, or checked with no match.
    .filter(({ p, ref }) => ((p.kind === "sealed" && p.sealedType !== "Insert") || (p.kind === "card" && ref >= SITE.ebay.minPriceUsd * 100)) && !Object.values(state[p.id] ?? {}).some((e) => e?.offer))
    .sort((a, b) => b.ref - a.ref);
  // --markets=US spends a small budget on eBay US first.
  const only = process.argv.find((a) => a.startsWith("--markets="))?.split("=")[1]?.split(",");
  const markets = (Object.keys(MARKET_SHARE) as Market[]).filter((m) => (only ? only.includes(m) : m === "US" || m === "UK" || m === "AU"));
  let calls = 0;
  let found = 0;
  outer: for (const { p, ref } of misses) {
    for (const m of markets) {
      if (calls >= budget) break outer;
      calls++;
      usage.calls++;
      try {
        const offer = await searchLowest(token, p, m, ref || null, fx[CURRENCY[m]] ?? 1);
        (state[p.id] ??= {})[m] = { at: new Date().toISOString(), offer };
        if (offer) found++;
      } catch (e) {
        if ((e as { quota?: boolean }).quota) break outer;
      }
    }
  }
  fs.writeFileSync(path.join(STATE, "ebay.json"), JSON.stringify(state) + "\n");
  fs.writeFileSync(usagePath, JSON.stringify(usage) + "\n");
  console.log(`[recheck] ${misses.length} products without an eBay match; ${calls} calls (app remaining ${remaining}); ${found} new listings found; usage ${usage.calls}/${SITE.ebay.dailyBudget}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
