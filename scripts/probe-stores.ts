// Probe candidate stores LIVE and decide which ones DexCompare should read.
//
//   npx tsx scripts/probe-stores.ts --in candidates.json [--in more.json] \
//     [--out probe-output/probe.json] [--write] [--min 3] [--concurrency 8]
//
// Input: JSON array of { name, base, country|market, key?, platform? }.
// For each store it:
//   1. finds the platform (Shopify products.json, else the WooCommerce Store API),
//   2. reads the checkout currency and refuses a store whose currency isn't
//      its market's (a CAD store listed as US would show C$ prices as US$),
//   3. ranks its collections (Shopify sitemap / Woo categories) and reads the
//      most promising ones,
//   4. runs every title through identify() — the same gate the importer uses —
//      and counts the Pokémon sealed products it would actually list,
//   5. picks the fewest collections (max 4) that cover what it found.
//
// With --write, stores that clear --min products are merged into
// src/data/stores.json (existing entries keep their key; collections are
// refreshed). Nothing here touches the database.
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  isPokemonCollection,
  rankCollections,
  readShopifyCollection,
  readWooCategory,
  shopifyMeta,
  sitemapCollections,
  wooCategories,
  WOO_API,
  type CollectionRead,
} from "../src/lib/feeds";
import { get, RateLimitedError, sleep, REQUEST_DELAY_MS } from "../src/lib/scrape-http";
import { identify, isIdentity, type Rejection } from "../src/lib/sealed-title";
import { REGIONS, isRegion, type Market } from "../src/lib/regions";
import type { StoreConfig } from "../src/lib/stores";

interface Candidate {
  key?: string;
  name: string;
  base: string;
  country?: string;
  market?: string;
  platform?: string;
}

interface ProbeResult {
  key: string;
  name: string;
  base: string;
  market: Market;
  platform: "shopify" | "woocommerce" | null;
  currency: string | null;
  currencyOk: boolean;
  country: string;
  collections: string[]; // chosen
  sealedProducts: number; // distinct accepted products across chosen collections
  inStock: number;
  allFound: number; // distinct accepted across every collection read
  read: { handle: string; ok: boolean; products: number; accepted: number }[];
  rejections: Partial<Record<Rejection, number>>;
  samples: { reason: string; title: string }[];
  error: string | null;
  ms: number;
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const inputs = args.flatMap((a, i) => (a === "--in" && args[i + 1] ? [args[i + 1]] : []));
const OUT = opt("out", "probe-output/probe.json");
const MIN = Number(opt("min", "3"));
const CONCURRENCY = Number(opt("concurrency", "3"));
const MAX_CANDIDATES = 8; // collections read per Shopify store
const PROBE_PAGES = 3; // pages per collection (1,000 products)

const CONVENTIONAL = ["pokemon-sealed", "pokemon-sealed-products", "pokemon", "pokemon-tcg", "sealed", "pre-orders", "preorders", "booster-boxes"];

function normBase(u: string): string {
  const url = new URL(u.trim().startsWith("http") ? u.trim() : `https://${u.trim()}`);
  return `https://${url.host.toLowerCase()}`;
}

function keyFromBase(base: string): string {
  const host = new URL(base).host.replace(/^www\./, "");
  const label = host.split(".")[0].replace(/[^a-z0-9]/g, "");
  return label || host.replace(/[^a-z0-9]/g, "");
}

function marketOf(c: Candidate): Market | null {
  const m = (c.market ?? c.country ?? "").toLowerCase().replace(/^gb$/, "uk");
  return isRegion(m) ? REGIONS[m].market : null;
}

async function detectPlatform(base: string): Promise<"shopify" | "woocommerce" | null> {
  const shop = (await get(`${base}/products.json?limit=1`)) as { products?: unknown[] } | null;
  if (shop && Array.isArray(shop.products)) return "shopify";
  await sleep(REQUEST_DELAY_MS);
  const woo = await get(`${base}${WOO_API}/products?per_page=1`);
  if (Array.isArray(woo)) return "woocommerce";
  return null;
}

async function probe(c: Candidate & { key: string; base: string; market: Market }): Promise<ProbeResult> {
  const t0 = Date.now();
  const res: ProbeResult = {
    key: c.key,
    name: c.name,
    base: c.base,
    market: c.market,
    platform: null,
    currency: null,
    currencyOk: false,
    country: REGIONS[c.market.toLowerCase() as keyof typeof REGIONS].shopifyCountry ?? "DE",
    collections: [],
    sealedProducts: 0,
    inStock: 0,
    allFound: 0,
    read: [],
    rejections: {},
    samples: [],
    error: null,
    ms: 0,
  };
  const expected = REGIONS[c.market.toLowerCase() as keyof typeof REGIONS].currency;
  try {
    res.platform = await detectPlatform(c.base);
    if (!res.platform) {
      res.error = "no public Shopify or WooCommerce feed";
      return res;
    }

    let reads: CollectionRead[] = [];
    if (res.platform === "shopify") {
      const meta = await shopifyMeta(c.base, res.country);
      res.currency = meta.currency;
      res.currencyOk = res.currency === expected;
      if (meta.country && (c.market === "EU" || meta.country === res.country)) res.country = meta.country;
      if (!res.currencyOk) {
        res.error = `charges ${res.currency ?? "?"}, market ${c.market} is ${expected}`;
        return res;
      }
      const handles = await sitemapCollections(c.base);
      let ranked = rankCollections(handles);
      if (!ranked.length) ranked = CONVENTIONAL;
      const country = res.country;
      for (const h of ranked.slice(0, MAX_CANDIDATES)) {
        await sleep(REQUEST_DELAY_MS);
        reads.push(await readShopifyCollection(c.base, h, { country, maxPages: PROBE_PAGES }));
      }
    } else {
      const cats = await wooCategories(c.base);
      const ids = new Map(cats.map((x) => [x.slug, x.id]));
      const pokemonCats = cats
        .filter((x) => /pok[eé]?mon|pkmn/i.test(`${x.name} ${x.slug}`))
        .filter((x) => rankCollections([x.slug]).length > 0 || /pok[eé]?mon/i.test(x.slug))
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
      const slugs = rankCollections(pokemonCats.map((x) => x.slug)).slice(0, 6);
      if (!slugs.length) slugs.push("search:pokemon");
      for (const s of slugs) {
        await sleep(REQUEST_DELAY_MS);
        reads.push(await readWooCategory(c.base, s, ids, PROBE_PAGES));
      }
      const cur = reads.flatMap((r) => r.products).find((p) => p.currency)?.currency ?? null;
      res.currency = cur;
      res.currencyOk = cur === expected;
      if (!res.currencyOk) {
        res.error = `charges ${cur ?? "?"}, market ${c.market} is ${expected}`;
        return res;
      }
    }

    // Which products each collection yields, by product id.
    const accepted = new Map<string, Set<string>>();
    const inStockIds = new Set<string>();
    const all = new Set<string>();
    for (const r of reads) {
      const strict = !isPokemonCollection(r.handle) && !r.handle.startsWith("search:");
      const ids = new Set<string>();
      for (const p of r.products) {
        const id = identify(p.title, { strict });
        if (!isIdentity(id)) {
          res.rejections[id] = (res.rejections[id] ?? 0) + 1;
          if ((id === "no-set" || id === "unclassified" || id === "vague") && res.samples.length < 12 && !strict) {
            res.samples.push({ reason: id, title: p.title });
          }
          continue;
        }
        ids.add(p.id);
        all.add(p.id);
        if (p.variants.some((v) => v.available)) inStockIds.add(p.id);
      }
      accepted.set(r.handle, ids);
      res.read.push({ handle: r.handle, ok: r.ok, products: r.products.length, accepted: ids.size });
    }
    res.allFound = all.size;

    // Greedy cover: the collection adding the most new products per page read.
    const chosen: string[] = [];
    const covered = new Set<string>();
    while (chosen.length < 4) {
      let best: { h: string; gain: number; cost: number } | null = null;
      for (const r of reads) {
        if (chosen.includes(r.handle) || !r.ok) continue;
        const ids = accepted.get(r.handle)!;
        let gain = 0;
        for (const id of ids) if (!covered.has(id)) gain++;
        const cost = Math.max(1, Math.ceil(r.products.length / 250));
        if (gain > 0 && (!best || gain / cost > best.gain / best.cost)) best = { h: r.handle, gain, cost };
      }
      if (!best) break;
      // Stop once the remaining collections add little for their cost.
      if (chosen.length && best.gain < 2 && covered.size >= all.size * 0.9) break;
      chosen.push(best.h);
      for (const id of accepted.get(best.h)!) covered.add(id);
    }
    res.collections = chosen;
    res.sealedProducts = covered.size;
    res.inStock = [...covered].filter((id) => inStockIds.has(id)).length;
  } catch (e) {
    res.error = e instanceof RateLimitedError ? `rate limited (${e.message})` : (e as Error).message;
  } finally {
    res.ms = Date.now() - t0;
  }
  return res;
}

async function main() {
  if (!inputs.length) {
    console.error("usage: tsx scripts/probe-stores.ts --in candidates.json [--write]");
    process.exit(1);
  }
  const seen = new Set<string>();
  const usedKeys = new Set<string>();
  const registryPath = join(__dirname, "..", "src", "data", "stores.json");
  const registry: StoreConfig[] = JSON.parse(readFileSync(registryPath, "utf8"));
  for (const s of registry) usedKeys.add(s.key);
  const byBase = new Map(registry.map((s) => [s.base, s]));

  const queue: (Candidate & { key: string; base: string; market: Market })[] = [];
  for (const file of inputs) {
    for (const c of JSON.parse(readFileSync(file, "utf8")) as Candidate[]) {
      let base: string;
      try {
        base = normBase(c.base);
      } catch {
        console.warn(`skip: bad base ${c.base}`);
        continue;
      }
      const market = marketOf(c);
      if (!market) {
        console.warn(`skip: ${c.name} has no known market (${c.country ?? c.market})`);
        continue;
      }
      if (seen.has(base)) continue;
      seen.add(base);
      let key = byBase.get(base)?.key ?? c.key ?? keyFromBase(base);
      if (!byBase.has(base)) {
        let k = key;
        let n = 2;
        while (usedKeys.has(k)) k = `${key}${market.toLowerCase()}${n > 2 ? n : ""}`, n++;
        key = k;
        usedKeys.add(key);
      }
      queue.push({ ...c, key, base, market });
    }
  }
  console.log(`probing ${queue.length} stores, ${CONCURRENCY} at a time…`);

  const results: ProbeResult[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < queue.length) {
        const c = queue[next++];
        const r = await probe(c);
        results.push(r);
        const verdict = r.error ? `✗ ${r.error}` : r.sealedProducts >= MIN ? `✓ ${r.sealedProducts} sealed (${r.inStock} in stock)` : `– only ${r.sealedProducts}`;
        console.log(`[${results.length}/${queue.length}] ${c.market} ${c.name} (${c.base}): ${verdict} · ${r.collections.join(", ")} · ${(r.ms / 1000).toFixed(0)}s`);
      }
    }),
  );

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(results, null, 1));
  const ok = results.filter((r) => !r.error && r.sealedProducts >= MIN);
  const byMarket: Record<string, number> = {};
  for (const r of ok) byMarket[r.market] = (byMarket[r.market] ?? 0) + 1;
  console.log(`\n${ok.length}/${results.length} stores clear the bar (≥${MIN} sealed products):`, byMarket);
  console.log(`full results: ${OUT}`);

  if (flag("write")) {
    for (const r of ok) {
      const entry: StoreConfig = { key: r.key, name: r.name, base: r.base, market: r.market, platform: r.platform!, country: r.country, collections: r.collections };
      byBase.set(r.base, { ...byBase.get(r.base), ...entry, key: byBase.get(r.base)?.key ?? r.key });
    }
    const out = [...byBase.values()].sort((a, b) => a.market.localeCompare(b.market) || a.key.localeCompare(b.key));
    writeFileSync(registryPath, JSON.stringify(out, null, 2) + "\n");
    console.log(`wrote ${out.length} stores to src/data/stores.json`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
