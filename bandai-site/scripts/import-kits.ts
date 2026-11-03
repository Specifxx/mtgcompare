// The model-kit import (SITE.kits; a no-op without it), run by
// refresh-prices.yml after import-all.ts:
//
//   every kit store's Shopify collections (products.json: each variant's SKU
//   and the description) or Neto category pages (each card's maker item
//   number, lib/import/kits-neto.ts) → one JAN per listing (lib/import/kits.ts) → kits
//   listed by two or more stores → data/public/kits.json
//
// Stores are read two at a time: Shopify answers 429 to a runner that pages
// many shops at once (the Warhammer store probe, 2026-10-28). A store that
// fails keeps its previous offers for three days, then drops out.
import fs from "node:fs";
import path from "node:path";
import { SITE } from "@/site.config";
import { CURRENCY, type Kit, type KitStoreConfig, type Meta, type StoreConfig, type StoreStatus } from "@/lib/site-types";
import { fetchJson, fetchText, sleep } from "@/lib/import/http";
import { parseNetoCategory } from "@/lib/import/kits-neto";
import { countryOf, storeCurrency } from "@/lib/import/shopify";
import { gradeOf, isKitPreorder, isKitTitle, janOf, kitName, kitsEnabled, keepConsistent, type KitListing } from "@/lib/import/kits";
import { slugify } from "@/lib/slug";
import { KITS_FILE, encodeKitOffer, readKitFile, type KitFile } from "@/lib/kit-store";

const STORE_CARRY_H = 72;
const MAX_PAGES = 30;
/** A kit needs this many stores (any market) to get a page: one shop's
 *  listing is not a comparison. */
const MIN_STORES = 2;

interface ShopifyKitProduct {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  tags: string[] | string;
  images?: { src: string }[];
  variants: { id: number; title: string; price: string; available: boolean; sku?: string | null; barcode?: string | null }[];
}

async function readStore(store: KitStoreConfig, prefixes: string[], itemPrefix: string | undefined): Promise<{ listings: KitListing[]; products: number }> {
  const seen = new Set<number>();
  const out: KitListing[] = [];
  for (const handle of store.collections) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${store.base}/collections/${handle}/products.json?limit=250&page=${page}&country=${countryOf(store as StoreConfig)}`;
      const data = await fetchJson<{ products: ShopifyKitProduct[] }>(url);
      for (const p of data.products) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        if (!isKitTitle(p.title)) continue;
        const tags = Array.isArray(p.tags) ? p.tags : String(p.tags || "").split(",").map((t) => t.trim());
        const vs = p.variants.filter((v) => Number(v.price) > 0);
        if (!vs.length) continue;
        // One kit per product: variants that are different kits (a "choose
        // your grade" listing) have no single JAN and are skipped. The
        // description counts only for a one-variant product.
        const hits = vs.map((v) => janOf({ title: p.title, sku: v.sku, barcode: v.barcode, body: vs.length === 1 ? p.body_html : null }, prefixes, itemPrefix));
        const jans = new Set(hits.map((h) => h?.jan ?? null));
        if (jans.size !== 1 || !hits[0]) continue;
        const v = vs.filter((x) => x.available).sort((a, b) => Number(a.price) - Number(b.price))[0] ?? vs[0];
        out.push({
          jan: hits[0].jan,
          derived: hits.some((h) => h!.derived),
          title: p.title,
          grade: gradeOf(p.title),
          image: p.images?.[0]?.src ?? null,
          source: store.key,
          market: store.market,
          cents: Math.round(Number(v.price) * 100),
          inStock: v.available,
          preorder: isKitPreorder(p.title, tags) || undefined,
          ref: `${p.handle}?variant=${v.id}`,
        });
      }
      if (data.products.length < 250) break;
      await sleep(900);
    }
  }
  return { listings: out, products: seen.size };
}

/** A Neto shop: its category pages, 96 cards a page; the robots.txt crawl
 *  delay is a second, so pages are fetched two seconds apart. */
async function readNetoStore(store: KitStoreConfig, prefixes: string[], itemPrefix: string | undefined): Promise<{ listings: KitListing[]; products: number }> {
  const seen = new Set<string>();
  const out: KitListing[] = [];
  for (const cat of store.collections) {
    let last = 1;
    for (let page = 1; page <= Math.min(last, MAX_PAGES); page++) {
      const html = await fetchText(`${store.base}/${cat.replace(/^\/|\/$/g, "")}/?pgnum=${page}`);
      const { cards, lastPage } = parseNetoCategory(html);
      last = lastPage;
      for (const c of cards) {
        if (seen.has(c.sku)) continue;
        seen.add(c.sku);
        if (c.currency && c.currency !== CURRENCY[store.market]) throw new Error(`store charges ${c.currency}, configured for ${store.market} (${CURRENCY[store.market]})`);
        if (!isKitTitle(c.title) || c.cents <= 0) continue;
        const hit = janOf({ title: c.title, sku: c.sku, barcode: null, body: null }, prefixes, itemPrefix);
        if (!hit) continue;
        out.push({
          jan: hit.jan,
          derived: hit.derived,
          title: c.title,
          grade: gradeOf(c.title),
          image: c.image ? new URL(c.image, store.base).toString() : null,
          source: store.key,
          market: store.market,
          cents: c.cents,
          inStock: c.inStock,
          preorder: isKitPreorder(c.title, []) || undefined,
          ref: c.path,
        });
      }
      if (!cards.length) break;
      await sleep(2000);
    }
  }
  return { listings: out, products: seen.size };
}

async function main() {
  if (!kitsEnabled(SITE.kits)) {
    console.log("[kits] SITE.kits is not set — nothing to do");
    return;
  }
  const cfg = SITE.kits;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const prev: KitFile = readKitFile();
  const prevKits = new Map(prev.kits.map((k) => [k.jan, k]));
  // import-all.ts runs first and writes the day's exchange rates.
  let fx: Record<string, number> = { USD: 1 };
  try {
    fx = (JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "public", "meta.json"), "utf8")) as Meta).fx;
  } catch {}
  const listings: KitListing[] = [];
  const status: Record<string, StoreStatus> = {};
  const queue = cfg.stores.slice();
  await Promise.all(
    [0, 1].map(async () => {
      while (queue.length) {
        const store = queue.shift()!;
        try {
          if (store.platform !== "neto") {
            const cur = await storeCurrency(store as StoreConfig);
            if (cur && cur !== CURRENCY[store.market]) throw new Error(`store charges ${cur}, configured for ${store.market} (${CURRENCY[store.market]})`);
          }
          const read = store.platform === "neto" ? readNetoStore : readStore;
          const { listings: ls, products } = await read(store, cfg.janPrefixes, cfg.itemCodeJanPrefix);
          // Several listings of one JAN in one store: the cheapest in stock.
          const best = new Map<string, KitListing>();
          for (const l of ls) {
            const c = best.get(l.jan);
            if (!c || (l.inStock && !c.inStock) || (l.inStock === c.inStock && l.cents < c.cents)) best.set(l.jan, l);
          }
          listings.push(...best.values());
          status[store.key] = { ok: true, products, matched: best.size, at: now.toISOString() };
          console.log(`[kits] ${store.key}: ${products} products, ${best.size} kits with a JAN (${[...best.values()].filter((l) => l.derived).length} by item number)`);
        } catch (e) {
          const msg = (e as Error).message.slice(0, 300);
          console.warn(`[kits] ${store.key} FAILED: ${msg}`);
          const p = prev.stores[store.key];
          status[store.key] = { ok: false, products: 0, matched: 0, at: p?.at ?? now.toISOString(), error: msg };
          if (p?.ok !== false && p && now.getTime() - new Date(p.at).getTime() < STORE_CARRY_H * 3_600_000) {
            for (const [jan, offers] of Object.entries(prev.offers))
              for (const o of offers)
                if (o[0] === store.key)
                  listings.push({ jan, derived: false, title: "", grade: null, image: null, source: o[0], market: store.market, cents: o[1], inStock: (o[2] & 1) === 1, preorder: (o[2] & 2) === 2 || undefined, ref: o[3] });
          }
        }
        await sleep(1500);
      }
    }),
  );

  const byJan = new Map<string, KitListing[]>();
  for (const l of listings) byJan.set(l.jan, [...(byJan.get(l.jan) ?? []), l]);
  const kits: Kit[] = [];
  const offers: KitFile["offers"] = {};
  // Kits seen before keep their slug, so a URL never changes.
  const usedSlugs = new Set(prev.kits.map((k) => k.slug));
  let dropped = 0;
  for (const jan of [...byJan.keys()].sort()) {
    const all = byJan.get(jan)!;
    const ls = keepConsistent(all, fx);
    dropped += all.length - ls.length;
    if (new Set(ls.map((l) => l.source)).size < MIN_STORES) continue;
    const old = prevKits.get(jan);
    const titles = ls.filter((l) => !l.derived).map((l) => l.title).filter(Boolean);
    const named = kitName(titles.length ? titles : ls.map((l) => l.title).filter(Boolean));
    let slug = old?.slug;
    if (!slug) {
      const base = slugify(named.name) || jan;
      slug = usedSlugs.has(base) ? `${base}-${jan.slice(-5)}` : base;
      usedSlugs.add(slug);
    }
    kits.push({
      jan,
      slug,
      name: named.name || old?.name || jan,
      grade: named.grade ?? old?.grade ?? null,
      scale: named.scale ?? old?.scale ?? null,
      image: ls.find((l) => l.image && !l.derived)?.image ?? ls.find((l) => l.image)?.image ?? old?.image ?? null,
      firstSeen: old?.firstSeen ?? today,
    });
    offers[jan] = ls.sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.cents - b.cents).map(encodeKitOffer);
  }
  kits.sort((a, b) => a.name.localeCompare(b.name));
  const file: KitFile = { generatedAt: now.toISOString(), kits, offers, stores: status };
  fs.mkdirSync(path.dirname(KITS_FILE), { recursive: true });
  fs.writeFileSync(KITS_FILE, JSON.stringify(file) + "\n");
  const ok = Object.values(status).filter((s) => s.ok).length;
  console.log(`[kits] ${kits.length} kits from ${ok}/${cfg.stores.length} stores; ${listings.length} listings with a JAN, ${dropped} dropped as inconsistent`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
