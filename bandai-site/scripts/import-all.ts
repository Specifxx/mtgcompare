// The daily import (GitHub Actions, .github/workflows/refresh-prices.yml):
//
//   TCGCSV catalogue + TCGplayer prices → every Shopify store we track →
//   eBay (budgeted, see src/lib/import/ebay.ts) → price history → data/public
//
// It writes ONLY public data, and only to data/. The workflow commits data/ to
// main and then dispatches production-deploy, so the site's data and its
// deployment change once a day, together.
//
// Env: EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (optional; no eBay without them),
// EBAY_REFRESH=false to skip eBay, IMPORT_SKIP_STORES=1 to skip stores (local testing).
import fs from "node:fs";
import path from "node:path";
import { SITE } from "@/site.config";
import type { Catalog, EbayPick, Market, Meta, Offer, PriceEntry, Prices, StoreStatus } from "@/lib/site-types";
import { CURRENCY } from "@/lib/site-types";
import { loadTcgcsv, referenceCents } from "@/lib/import/tcgcsv";
import { fetchStore, storeCurrency } from "@/lib/import/shopify";
import { buildIndex, isPreorder, isUnfitListing, looksSealed, matchCard, matchSealed, printingOf } from "@/lib/import/match";
import {
  ebayCredentials,
  ebayRemaining,
  ebayToken,
  listingMatches,
  planEbayRefresh,
  searchLowest,
  useSetEditions,
  type EbayState,
} from "@/lib/import/ebay";
import { ebayReferenceUsd, ebayTrusted, tcgplayerOfferCents } from "@/lib/import/sanity";
import { appendPoint, dayNumber, pctChange, readSetHistory, writeSetHistory } from "@/lib/import/history";
import { fetchJson } from "@/lib/import/http";
import { readAllPrices, writePrices } from "@/lib/price-store";

const PUBLIC = path.join(process.cwd(), "data", "public");
const STATE = path.join(process.cwd(), "data", "state");
const EBAY_MAX_AGE_H = 120; // an eBay result older than 5 days is not shown
const STORE_CARRY_H = 72; // a failed store's previous offers are kept this long

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data) + "\n");
}

async function fxRates(prev: Record<string, number>): Promise<Record<string, number>> {
  try {
    const d = await fetchJson<{ rates: Record<string, number> }>(
      "https://api.frankfurter.dev/v1/latest?base=USD&symbols=GBP,CAD,AUD,EUR,SGD",
    );
    return { USD: 1, ...d.rates };
  } catch (e) {
    console.warn(`[fx] ${(e as Error).message} — keeping yesterday's rates`);
    return Object.keys(prev).length ? prev : { USD: 1, GBP: 0.75, CAD: 1.4, AUD: 1.42, EUR: 0.89, SGD: 1.28 };
  }
}

async function main() {
  const now = new Date();
  const today = dayNumber(now);
  const prevPrices: Prices = { generatedAt: "", byId: readAllPrices() };
  const prevMeta = readJson<Meta | null>(path.join(PUBLIC, "meta.json"), null);

  // 1. Catalogue + TCGplayer
  console.log(`[tcgcsv] category ${SITE.tcgcsvCategoryId}`);
  const { sets, products, tcg } = await loadTcgcsv(now);
  console.log(`[tcgcsv] ${sets.length} sets, ${products.length} products`);
  // Before release TCGplayer carries placeholder listings ($9,999 boxes) with
  // no market price. For upcoming sets, only a real market price counts.
  const upcomingIds = new Set(sets.filter((s) => s.upcoming).map((s) => s.id));
  for (const p of products)
    if (upcomingIds.has(p.setId) && tcg[p.id])
      for (const [k, v] of Object.entries(tcg[p.id])) if (v.market == null) delete tcg[p.id][k];
  const catalog: Catalog = { generatedAt: now.toISOString(), sets, products };
  const byId = new Map(products.map((p) => [p.id, p]));
  const fx = await fxRates(prevMeta?.fx ?? {});

  // 2. Stores
  const idx = buildIndex(products, sets, SITE.numberStyle, { rarityMustAgree: SITE.rarityMustAgree, rarityAliases: SITE.rarityAliases, setEditions: SITE.setEditions });
  useSetEditions(sets);
  const storeOffers = new Map<number, Offer[]>();
  const storeStatus: Record<string, StoreStatus> = {};
  const addOffer = (id: number, o: Offer) => {
    if (!storeOffers.has(id)) storeOffers.set(id, []);
    storeOffers.get(id)!.push(o);
  };
  if (process.env.IMPORT_SKIP_STORES !== "1") {
    // Stores in parallel (each one still paginates politely, one page at a
    // time): ~200 stores one after another would not fit the Actions timeout.
    const queue = SITE.stores.slice();
    const runStore = async (store: (typeof SITE.stores)[number]) => {
      try {
        const cur = await storeCurrency(store);
        if (cur && cur !== CURRENCY[store.market])
          throw new Error(`store charges ${cur}, but is configured for ${store.market} (${CURRENCY[store.market]}) — fix its market in src/content/stores.ts`);
        const items = await fetchStore(store);
        let matched = 0;
        // Several listings can match one product (NM / foil / pre-order rows):
        // keep the cheapest in-stock one per printing.
        const best = new Map<string, Offer>();
        for (const it of items) {
          if (isUnfitListing(it.title)) continue;
          const sealed = looksSealed(it.title, it.productType, SITE.numberStyle);
          const m = sealed ? matchSealed(it.title, idx) : matchCard(it.title, idx, `${it.productType} | ${it.tags.join(" | ")}`);
          if (!m) continue;
          matched++;
          // Price sanity: a store price under a quarter or over four times the
          // TCGplayer reference is far likelier a bad match (or a damaged /
          // graded copy) than a real deal. Leave it out.
          const ref = referenceCents(tcg[m.product.id]);
          const usd = it.cents / (fx[CURRENCY[store.market]] ?? 1);
          if (ref != null && ref >= 300 && (usd < ref * 0.25 || usd > ref * 4)) continue;
          const offer: Offer = {
            source: store.key,
            market: store.market,
            currency: CURRENCY[store.market],
            cents: it.cents,
            inStock: it.inStock,
            url: it.url,
            title: it.title,
            printing: m.product.kind === "card" ? printingOf(it.title, it.variantTitle, m.product.printings) : undefined,
            preorder: isPreorder(it.title, it.tags) || undefined,
          };
          const k = `${m.product.id}|${offer.printing ?? ""}`;
          const cur = best.get(k);
          if (!cur || (offer.inStock && !cur.inStock) || (offer.inStock === cur.inStock && offer.cents < cur.cents))
            best.set(k, offer);
        }
        for (const [k, o] of best) addOffer(Number(k.split("|")[0]), o);
        storeStatus[store.key] = { ok: true, products: items.length, matched, at: now.toISOString() };
        console.log(`[store] ${store.key}: ${items.length} listings, ${matched} matched, ${best.size} offers`);
      } catch (e) {
        const msg = (e as Error).message.slice(0, 300);
        console.warn(`[store] ${store.key} FAILED: ${msg}`);
        const prev = prevMeta?.stores[store.key];
        storeStatus[store.key] = { ok: false, products: 0, matched: 0, at: prev?.at ?? now.toISOString(), error: msg };
        // Carry yesterday's offers for a short outage rather than blanking the store.
        if (prev?.ok !== false && prev && now.getTime() - new Date(prev.at).getTime() < STORE_CARRY_H * 3_600_000) {
          for (const [id, entry] of Object.entries(prevPrices.byId))
            for (const o of entry.offers) if (o.source === store.key) addOffer(Number(id), o);
        }
      }
    };
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (queue.length) await runStore(queue.shift()!);
      }),
    );
  } else {
    for (const [id, entry] of Object.entries(prevPrices.byId))
      for (const o of entry.offers) if (o.source !== "ebay" && o.source !== "tcgplayer") addOffer(Number(id), o);
  }

  // 3. eBay
  const refUsd = new Map(products.map((p) => [p.id, referenceCents(tcg[p.id])]));
  const ebayState = readJson<EbayState>(path.join(STATE, "ebay.json"), {});
  const usage = readJson<{ day: string; calls: number }>(path.join(STATE, "ebay-usage.json"), { day: "", calls: 0 });
  const dayKey = now.toISOString().slice(0, 10);
  if (usage.day !== dayKey) Object.assign(usage, { day: dayKey, calls: 0 });
  let ebayMeta: Meta["ebay"] = prevMeta?.ebay ?? null;
  if (ebayCredentials() && process.env.EBAY_REFRESH !== "false") {
    try {
      const token = await ebayToken();
      const remaining = await ebayRemaining(token);
      const reserve = Number(process.env.EBAY_RESERVE ?? 100);
      const ownLeft = SITE.ebay.dailyBudget - usage.calls;
      const budget = Math.max(0, Math.min(ownLeft, remaining == null ? ownLeft : remaining - reserve));
      const recentSets = new Set(
        sets
          .filter((s) => s.upcoming || (s.releasedOn && now.getTime() - new Date(s.releasedOn).getTime() < 45 * 86_400_000))
          .map((s) => s.id),
      );
      const plan = planEbayRefresh({
        products,
        refUsdCents: refUsd,
        // No database: demand comes from value, rarity, sealed type and set
        // age only. (The click log that fed it is archived.)
        clicks30d: new Map(),
        newSetIds: recentSets,
        state: ebayState,
        budget,
        now,
      });
      console.log(
        `[ebay] app remaining ${remaining ?? "unknown"}, own ${usage.calls}/${SITE.ebay.dailyBudget} used today → budget ${budget}; ${plan.eligible} products ≥ $${SITE.ebay.minPriceUsd}; ${plan.calls.length} planned`,
      );
      let refreshed = 0;
      let stop = false;
      const queue = plan.calls.slice();
      const worker = async () => {
        while (!stop && queue.length) {
          const c = queue.shift()!;
          const ref = refUsd.get(c.product.id) ?? null;
          try {
            usage.calls++;
            const offer = await searchLowest(token, c.product, c.market, ref, fx[CURRENCY[c.market]] ?? 1);
            (ebayState[c.product.id] ??= {})[c.market] = { at: now.toISOString(), offer };
            refreshed++;
          } catch (e) {
            if ((e as { quota?: boolean }).quota) stop = true;
            console.warn(`[ebay] ${c.product.id} ${c.market}: ${(e as Error).message}`);
          }
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));
      ebayMeta = { day: dayKey, calls: usage.calls, budget: SITE.ebay.dailyBudget, eligible: plan.eligible, refreshed, at: now.toISOString() };
      console.log(`[ebay] refreshed ${refreshed}`);
    } catch (e) {
      console.warn(`[ebay] skipped: ${(e as Error).message}`);
    }
  }
  // Re-check saved eBay results against today's rules (and price floor), so a
  // tightened rule purges old matches without spending calls.
  for (const [id, markets] of Object.entries(ebayState)) {
    const p = byId.get(Number(id));
    const ref = refUsd.get(Number(id));
    for (const [mk, e] of Object.entries(markets ?? {}) as [Market, { at: string; offer: Offer | null }][]) {
      if (!p || !e?.offer) continue;
      const usd = e.offer.cents / (fx[e.offer.currency] ?? 1);
      // A listing read as one printing ("1st Edition") is held to that
      // printing's price: under half of it is a mislabelled or other copy.
      const own = e.offer.printing ? tcg[p.id]?.[e.offer.printing] : undefined;
      const floor = (own && (own.market ?? own.mid ?? own.low)) ?? ref;
      if (!listingMatches(p, e.offer.title) || (floor != null && usd < floor * 0.5)) markets![mk] = { at: e.at, offer: null };
    }
  }
  // Drop state for products that left the catalogue.
  for (const id of Object.keys(ebayState)) if (!byId.has(Number(id))) delete ebayState[id];

  // 4. Prices + history
  const prices: Prices = { generatedAt: now.toISOString(), byId: {} };
  const histories = new Map<number, ReturnType<typeof readSetHistory>>();
  let offerCount = 0;
  for (const p of products) {
    const t = tcg[p.id] ?? {};
    const offers: Offer[] = [...(storeOffers.get(p.id) ?? [])];
    const ref = refUsd.get(p.id);
    const ebayRef = ebayReferenceUsd(ref, offers.filter((o) => o.inStock).map((o) => o.cents / (fx[o.currency] ?? 1)));
    for (const [market, e] of Object.entries(ebayState[p.id] ?? {}) as [Market, { at: string; offer: Offer | null }][]) {
      if (!e.offer || now.getTime() - new Date(e.at).getTime() >= EBAY_MAX_AGE_H * 3_600_000) continue;
      if (!ebayTrusted(e.offer.cents / (fx[e.offer.currency] ?? 1), ebayRef)) continue;
      offers.push({ ...e.offer, market });
    }
    const tcgLow = Object.values(t).map((x) => x.low).filter((x): x is number => x != null);
    const tcgCents = tcgplayerOfferCents(tcgLow, ref);
    if (tcgCents != null) {
      offers.push({
        source: "tcgplayer",
        market: "US",
        currency: "USD",
        cents: tcgCents,
        inStock: tcgLow.length > 0,
        url: p.tcgUrl,
        title: `${p.name} on TCGplayer`,
      });
    }
    offers.sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.cents - b.cents);
    offerCount += offers.length;

    if (!histories.has(p.setId)) histories.set(p.setId, readSetHistory(p.setId));
    const h = histories.get(p.setId)!;
    if (ref != null) h[p.id] = appendPoint(h[p.id] ?? [], today, ref);
    const entry: PriceEntry = {
      tcg: t,
      offers,
      change7d: pctChange(h[p.id], today, 7),
      change30d: pctChange(h[p.id], today, 30),
    };
    prices.byId[p.id] = entry;
  }
  for (const [setId, h] of histories) writeSetHistory(setId, h);

  // 5. eBay Picks (the homepage banner): the most valuable cards with a fresh
  // US listing, newest sets first. No extra calls: reuses step 3's results.
  const setRank = new Map(sets.map((s, i) => [s.id, i]));
  const picks: EbayPick[] = products
    .filter((p) => p.kind === "card")
    .map((p) => ({ p, e: prices.byId[p.id].offers.find((o) => o.source === "ebay" && o.market === "US") }))
    .filter((x) => x.e)
    .sort(
      (a, b) =>
        (setRank.get(a.p.setId)! < 3 ? 0 : 1) - (setRank.get(b.p.setId)! < 3 ? 0 : 1) ||
        (refUsd.get(b.p.id) ?? 0) - (refUsd.get(a.p.id) ?? 0),
    )
    .slice(0, 12)
    .map(({ p, e }) => ({
      productId: p.id,
      name: p.name,
      image: p.image,
      cents: e!.cents,
      currency: e!.currency,
      url: e!.url,
      title: e!.title,
      marketCents: refUsd.get(p.id) ?? null,
    }));

  const meta: Meta = {
    updatedAt: now.toISOString(),
    fx,
    stores: storeStatus,
    ebay: ebayMeta,
    counts: {
      cards: products.filter((p) => p.kind === "card").length,
      sealed: products.filter((p) => p.kind === "sealed").length,
      offers: offerCount,
      sets: sets.length,
    },
  };

  writeJson(path.join(PUBLIC, "catalog.json"), catalog);
  writePrices(prices.byId, products);
  fs.rmSync(path.join(PUBLIC, "prices.json"), { force: true });
  writeJson(path.join(PUBLIC, "meta.json"), meta);
  writeJson(path.join(PUBLIC, "ebay-picks.json"), picks);
  writeJson(path.join(STATE, "ebay.json"), ebayState);
  writeJson(path.join(STATE, "ebay-usage.json"), usage);
  console.log(`[done] ${meta.counts.cards} cards, ${meta.counts.sealed} sealed, ${offerCount} offers`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
