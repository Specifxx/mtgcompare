// The import: TCGplayer catalogue + prices (TCGCSV), store offers, per-market
// aggregates, daily history and the index. Run by scripts/import.ts from
// .github/workflows/import-prices.yml twice a day. Writes ONLY to DATABASE_URL.
//
// The store import never calls eBay. eBay listing prices come from the separate
// eBay pass (scripts/ebay.ts, lib/ebay-import.ts, ebay-prices.yml), which writes
// `ebay` / `ebay_us` Offer rows that aggregate() folds into low<M> (never into
// stores<M>, which counts every store plus TCGplayer, and never eBay).
import fs from "node:fs";
import path from "node:path";
import { prisma } from "./db";
import {
  TCGCSV_BASE,
  assignSlugs,
  foldNameAliases,
  isSealedProduct,
  parseCard,
  parseSealed,
  pickPrice,
  setCode,
  setDisplayName,
  setKind,
  setSlug,
  type CatalogCard,
  type CatalogSealed,
  type TcgcsvGroup,
  type TcgcsvPrice,
  type TcgcsvProduct,
} from "./catalog";
import { MARKETS, currencyOf, type Country } from "./country";
import { toUsdCents } from "./fx";
import {
  anyVariant,
  bestVariant,
  buildCardIndex,
  buildDonIndex,
  conditionRank,
  buildNameIndex,
  matchStoreProduct,
  plausibleSealedPrice,
  skuCardNumber,
  plausibleSinglePrice,
  type SealedRef,
  type StoreMatchIndexes,
} from "./match";
import { STORES, platformOf, type StorePlatform, type StoreInfo } from "./stores";
import { fetchStoreListings, productUrl, type StoreRead } from "./store-import";
import { SITE_URL } from "./site";
import { HISTORY_BUCKETS, KEEP_DAYS, addDays, bucketOf, changeOver, dayNum, highOver, nextIndex, withPoint, type DayFile } from "./history";
import { historyDir, readBucket, readIndex, recentOf, writeBucket, writeDay, writeIndex, writeRecentBucket } from "./history-store";

type Log = (...a: unknown[]) => void;

const UA = { "User-Agent": `OPCompare/1.0 (+${SITE_URL})`, Accept: "application/json" };

// ── TCGCSV ───────────────────────────────────────────────────────────────────
async function tcgcsv<T>(pathPart: string, cacheDir?: string): Promise<T> {
  const file = cacheDir ? path.join(cacheDir, `${pathPart.replace(/\//g, "_")}.json`) : null;
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${TCGCSV_BASE}/${pathPart}`, { headers: UA, cache: "no-store" });
      if (!res.ok) throw new Error(`TCGCSV ${pathPart}: HTTP ${res.status}`);
      const text = await res.text();
      if (file) fs.writeFileSync(file, text);
      return JSON.parse(text) as T;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

// ── Bulk upsert ──────────────────────────────────────────────────────────────
type Col = { name: string; cast?: string };

async function upsert(table: string, cols: Col[], rows: unknown[][], conflict: string, update: string[]): Promise<void> {
  const CHUNK = Math.max(1, Math.floor(30000 / cols.length));
  for (let s = 0; s < rows.length; s += CHUNK) {
    const chunk = rows.slice(s, s + CHUNK);
    const params: unknown[] = [];
    const values = chunk.map(
      (r) =>
        "(" +
        r
          .map((v, i) => {
            params.push(v);
            return `$${params.length}${cols[i].cast ? `::${cols[i].cast}` : ""}`;
          })
          .join(",") +
        ")",
    );
    const sql =
      `INSERT INTO "${table}" (${cols.map((c) => `"${c.name}"`).join(",")}) VALUES ${values.join(",")} ` +
      `ON CONFLICT ("${conflict}") DO UPDATE SET ${update.map((u) => `"${u}"=EXCLUDED."${u}"`).join(",")}`;
    await prisma.$executeRawUnsafe(sql, ...params);
  }
}

// ── Catalogue ────────────────────────────────────────────────────────────────
export interface CatalogResult {
  sets: number;
  cards: number;
  sealed: number;
  tcgplayerOffers: number;
  cardMarket: Map<number, number | null>;
}

export async function importCatalog(log: Log, cacheDir?: string): Promise<CatalogResult> {
  const groups = (await tcgcsv<{ results: TcgcsvGroup[] }>("groups", cacheDir)).results;
  log(`TCGCSV: ${groups.length} One Piece groups`);
  const data = await pool(groups, 4, async (g) => {
    const [p, pr] = await Promise.all([
      tcgcsv<{ results: TcgcsvProduct[] }>(`${g.groupId}/products`, cacheDir),
      tcgcsv<{ results: TcgcsvPrice[] }>(`${g.groupId}/prices`, cacheDir),
    ]);
    return { g, products: p.results ?? [], prices: pr.results ?? [] };
  });

  const cards: (CatalogCard & { low: number | null; market: number | null; finish: string | null })[] = [];
  const sealed: (CatalogSealed & { low: number | null; market: number | null })[] = [];
  const setRows: unknown[][] = [];
  const now = new Date();
  const seen = new Set<number>();
  const setSlugs = new Set<string>();

  for (const { g, products, prices } of data) {
    const kind = setKind(g);
    const code = setCode(g);
    const byId = new Map<number, TcgcsvPrice[]>();
    for (const r of prices) (byId.get(r.productId) ?? byId.set(r.productId, []).get(r.productId)!).push(r);
    let nCards = 0;
    let nSealed = 0;
    for (const p of products) {
      if (seen.has(p.productId)) continue;
      seen.add(p.productId);
      const pr = pickPrice(byId.get(p.productId) ?? []);
      if (isSealedProduct(p)) {
        const s = parseSealed(p, kind, true);
        if (!s) continue;
        sealed.push({ ...s, low: pr.lowCents, market: pr.marketCents });
        nSealed++;
      } else {
        const c = parseCard(p, code, g);
        cards.push({ ...c, low: pr.lowCents, market: pr.marketCents, finish: pr.finish });
        nCards++;
      }
    }
    let slug = setSlug(g);
    if (setSlugs.has(slug)) slug = `${slug}-${g.groupId}`;
    setSlugs.add(slug);
    setRows.push([
      g.groupId,
      slug,
      code,
      setDisplayName(g),
      g.name,
      kind,
      g.publishedOn ? new Date(g.publishedOn.slice(0, 10)) : null,
      nCards,
      nSealed,
      now,
    ]);
  }

  // Sets first (cards reference them).
  await upsert(
    "Set",
    [{ name: "id" }, { name: "slug" }, { name: "code" }, { name: "name" }, { name: "tcgName" }, { name: "kind" }, { name: "releasedOn", cast: "timestamp(3)" }, { name: "cardCount", cast: "int" }, { name: "sealedCount", cast: "int" }, { name: "updatedAt", cast: "timestamp(3)" }],
    setRows,
    "id",
    ["code", "name", "tcgName", "kind", "releasedOn", "cardCount", "sealedCount", "updatedAt"],
  );

  const codeBySet = new Map(data.map(({ g }) => [g.groupId, setCode(g)] as const));
  foldNameAliases(cards, (id) => codeBySet.get(id) ?? "");
  const existingCardSlugs = new Map((await prisma.card.findMany({ select: { id: true, slug: true } })).map((r) => [r.id, r.slug]));
  const cardSlugs = assignSlugs(cards, existingCardSlugs);
  await upsert(
    "Card",
    [
      { name: "id" }, { name: "slug" }, { name: "name" }, { name: "tcgName" }, { name: "number" }, { name: "setId" },
      { name: "rarity" }, { name: "variant" }, { name: "printing" }, { name: "colors", cast: "text[]" }, { name: "cardType" },
      { name: "cost", cast: "int" }, { name: "power", cast: "int" }, { name: "counter", cast: "int" }, { name: "life", cast: "int" },
      { name: "attribute" }, { name: "subtypes", cast: "text[]" }, { name: "effect" }, { name: "finish" }, { name: "hasImage", cast: "boolean" },
      { name: "tcgplayerUrl" }, { name: "marketUsd", cast: "int" }, { name: "updatedAt", cast: "timestamp(3)" },
    ],
    cards.map((c) => [
      c.id, cardSlugs.get(c.id)!, c.name, c.tcgName, c.number, c.setId, c.rarity, c.variant, c.printing, c.colors, c.cardType,
      c.cost, c.power, c.counter, c.life, c.attribute, c.subtypes, c.effect, c.finish, c.hasImage, c.tcgplayerUrl, c.market, now,
    ]),
    "id",
    ["name", "tcgName", "number", "setId", "rarity", "variant", "printing", "colors", "cardType", "cost", "power", "counter", "life", "attribute", "subtypes", "effect", "finish", "hasImage", "tcgplayerUrl", "marketUsd", "updatedAt"],
  );

  const existingSealedSlugs = new Map((await prisma.sealed.findMany({ select: { id: true, slug: true } })).map((r) => [r.id, r.slug]));
  const sealedSlugs = assignSlugs(sealed, existingSealedSlugs);
  await upsert(
    "Sealed",
    [
      { name: "id" }, { name: "slug" }, { name: "name" }, { name: "setId" }, { name: "kind" }, { name: "packCount", cast: "int" },
      { name: "imageUrl" }, { name: "tcgplayerUrl" }, { name: "releasedOn", cast: "timestamp(3)" }, { name: "presale", cast: "boolean" },
      { name: "marketUsd", cast: "int" }, { name: "updatedAt", cast: "timestamp(3)" },
    ],
    sealed.map((s) => [
      s.id, sealedSlugs.get(s.id)!, s.name, s.setId, s.kind, s.packCount, s.imageUrl, s.tcgplayerUrl,
      s.releasedOn ? new Date(s.releasedOn) : null, s.presale, s.market, now,
    ]),
    "id",
    ["name", "setId", "kind", "packCount", "imageUrl", "tcgplayerUrl", "releasedOn", "presale", "marketUsd", "updatedAt"],
  );

  // TCGplayer's cheapest listing is the US market's TCGplayer offer. Replaced
  // wholesale: a product with no listing today has no row today.
  const tcgRows = [
    ...cards.filter((c) => c.low != null).map((c) => ({ productId: c.id, priceCents: c.low!, url: c.tcgplayerUrl })),
    ...sealed.filter((s) => s.low != null).map((s) => ({ productId: s.id, priceCents: s.low!, url: s.tcgplayerUrl })),
  ];
  await prisma.$transaction([
    prisma.offer.deleteMany({ where: { source: "tcgplayer" } }),
    prisma.offer.createMany({
      data: tcgRows.map((r) => ({
        productId: r.productId,
        source: "tcgplayer",
        market: "US",
        priceCents: r.priceCents,
        currency: "USD",
        url: r.url,
        inStock: true,
        condition: null,
        title: null,
        updatedAt: now,
      })),
    }),
  ]);

  const cardMarket = new Map<number, number | null>();
  for (const c of cards) cardMarket.set(c.id, c.market);
  for (const s of sealed) cardMarket.set(s.id, s.market);
  log(`Catalogue: ${setRows.length} sets, ${cards.length} cards, ${sealed.length} sealed; ${tcgRows.length} TCGplayer listings`);
  return { sets: setRows.length, cards: cards.length, sealed: sealed.length, tcgplayerOffers: tcgRows.length, cardMarket };
}

// ── Stores ───────────────────────────────────────────────────────────────────
export interface StoreResult {
  key: string;
  country: Country;
  platform: StorePlatform;
  products: number;
  cards: number;
  sealed: number;
  inStock: number;
  failed: boolean;
  skipped?: string;
  /** Why a read failed (or found nothing), in the reader's words. */
  note?: string;
  misses: Record<string, number>;
}

interface OfferDraft {
  productId: number;
  priceCents: number;
  inStock: boolean;
  condition: string | null;
  title: string;
  url: string;
}

function better(a: OfferDraft, b: OfferDraft): OfferDraft {
  if (a.inStock !== b.inStock) return a.inStock ? a : b;
  const ra = conditionRank(a.condition ?? "");
  const rb = conditionRank(b.condition ?? "");
  if (ra !== rb) return ra < rb ? a : b;
  return a.priceCents <= b.priceCents ? a : b;
}

export async function importStores(log: Log, opts: { only?: string[]; market?: Country } = {}): Promise<StoreResult[]> {
  const cards = await prisma.card.findMany({
    where: { number: { not: null } },
    select: { id: true, name: true, tcgName: true, number: true, variant: true, marketUsd: true, set: { select: { code: true, name: true, tcgName: true } } },
  });
  const idx = buildCardIndex(cards.map((c) => ({ ...c, setCode: c.set.code, setName: c.set.name, setTcgName: c.set.tcgName })));
  // DON!! cards have no number: the name path and the strict DON!! path.
  const dons = await prisma.card.findMany({ where: { number: null }, select: { id: true, tcgName: true, marketUsd: true, set: { select: { code: true, name: true, tcgName: true } } } });
  const nameIdx = buildNameIndex([...cards, ...dons].map((c) => ({ id: c.id, tcgName: c.tcgName, setNames: [c.set.name, c.set.tcgName] })));
  const donIdx = buildDonIndex(dons.map((d) => ({ id: d.id, tcgName: d.tcgName, setCode: d.set.code, setName: d.set.name })));
  for (const d of dons) cards.push({ ...d, name: "DON!! Card", number: null, variant: null, set: { code: "", name: d.set.name, tcgName: d.set.tcgName } });
  const sealedRows = await prisma.sealed.findMany({ select: { id: true, name: true, kind: true, marketUsd: true, set: { select: { code: true, name: true } } } });
  const sealedRefs: SealedRef[] = sealedRows.map((s) => ({ id: s.id, name: s.name, kind: s.kind as SealedRef["kind"], setCode: s.set?.code ?? null, setName: s.set?.name ?? null }));
  const ix: StoreMatchIndexes = { cards: idx, names: nameIdx, dons: donIdx, sealed: sealedRefs };
  const market = new Map<number, number | null>([...cards.map((c) => [c.id, c.marketUsd] as const), ...sealedRows.map((s) => [s.id, s.marketUsd] as const)]);
  const isSealed = new Set(sealedRows.map((s) => s.id));

  let stores: StoreInfo[] = STORES;
  if (opts.only?.length) stores = stores.filter((s) => opts.only!.includes(s.key));
  if (opts.market) stores = stores.filter((s) => s.country === opts.market);

  return pool(stores, 8, async (store): Promise<StoreResult> => {
    const res: StoreResult = { key: store.key, country: store.country, platform: platformOf(store), products: 0, cards: 0, sealed: 0, inStock: 0, failed: false, misses: {} };
    // A store configured to charge in another currency cannot be priced in this
    // market (RiftCompare's offer-currency rule).
    const cur = currencyOf(store.country);
    if (store.currency && store.currency !== cur) {
      res.skipped = `charges ${store.currency}, market is ${cur}`;
      return res;
    }
    let fetched: StoreRead;
    try {
      fetched = await fetchStoreListings(store);
    } catch (e) {
      fetched = { products: [], failed: true, handles: [], note: (e as Error).message };
    }
    res.products = fetched.products.length;
    if (fetched.note) res.note = fetched.note.slice(0, 200);
    if (fetched.failed) {
      res.failed = true;
      log(`  ⚠ ${store.name} (${store.country}, ${res.platform}): ${fetched.note ?? "a configured collection could not be read"} — keeping its existing rows.`);
      return res;
    }
    const drafts = new Map<number, OfferDraft>();
    // Card number → TCGplayer name → DON!! → SKU number → sealed (lib/match.ts).
    const matched = fetched.products.map((p) => ({ p, m: matchStoreProduct(p.title, (p.variants ?? []).map((v) => v.sku), ix, { tags: p.tags, productType: p.product_type }) }));
    // A bare "Name [Set]" title that several of this store's products share is
    // several different cards (the store numbers them -1, -2 ... in the handle),
    // and with no SKU number to tell them apart none of them is safe to price.
    // Counted over EVERY product of the store, not just the name-path matches: the
    // twin that was told apart by its SKU is what proves the title is shared.
    const titleKey = (t: string) => t.trim().toLowerCase();
    const sameTitle = new Map<string, number>();
    for (const { p } of matched) sameTitle.set(titleKey(p.title), (sameTitle.get(titleKey(p.title)) ?? 0) + 1);
    for (const { p, m } of matched) {
      if (!("id" in m)) {
        res.misses[m.miss] = (res.misses[m.miss] ?? 0) + 1;
        continue;
      }
      // A SKU number that agrees with the card (the matcher already refused one that doesn't) settles it.
      if (m.path === "name" && skuCardNumber((p.variants ?? []).map((v) => v.sku)) == null && (sameTitle.get(titleKey(p.title)) ?? 0) > 1) {
        res.misses["name-duplicate-title"] = (res.misses["name-duplicate-title"] ?? 0) + 1;
        continue;
      }
      const id = m.id;
      const best = bestVariant(p.variants ?? []);
      const price = best?.priceCents ?? anyVariant(p.variants ?? []);
      if (price == null) continue;
      const usdCents = toUsdCents(price, cur);
      const mk = market.get(id) ?? null;
      const ok = isSealed.has(id) ? plausibleSealedPrice(usdCents, mk) : plausibleSinglePrice(usdCents, mk);
      if (!ok) {
        res.misses["implausible-price"] = (res.misses["implausible-price"] ?? 0) + 1;
        continue;
      }
      const d: OfferDraft = { productId: id, priceCents: price, inStock: Boolean(best), condition: isSealed.has(id) ? null : best?.condition ?? null, title: p.title.slice(0, 300), url: productUrl(store, p) };
      const prev = drafts.get(id);
      drafts.set(id, prev ? better(prev, d) : d);
    }
    const now = new Date();
    const source = `store:${store.key}`;
    const rows = [...drafts.values()];
    await prisma.$transaction([
      prisma.offer.deleteMany({ where: { source, market: store.country } }),
      prisma.offer.createMany({
        data: rows.map((r) => ({ ...r, source, market: store.country, currency: cur, updatedAt: now })),
      }),
    ]);
    res.cards = rows.filter((r) => !isSealed.has(r.productId)).length;
    res.sealed = rows.filter((r) => isSealed.has(r.productId)).length;
    res.inStock = rows.filter((r) => r.inStock).length;
    log(`  ${store.country} ${store.name}${res.platform === "shopify" ? "" : ` [${res.platform}]`}: ${res.products} products → ${res.cards} cards, ${res.sealed} sealed (${res.inStock} in stock)${fetched.note ? ` — ${fetched.note}` : ""}`);
    return res;
  });
}

// ── Aggregates, history, index ───────────────────────────────────────────────
// low<M> includes eBay and TCGplayer rows (the cheapest ask anywhere); stores<M>
// counts every in-stock seller the comparison shows except eBay (stores plus
// TCGplayer, as RiftCompare's card page counts them; eBay is never a store), so
// a tile and the card page's "In stock at" agree. The registry cleanup touches `store:` rows
// only, never `ebay*`.
/** An offer not refreshed for this long no longer counts as in stock (RiftCompare's 72h rule). */
export const STALE_HOURS = 72;

export async function aggregate(log: Log): Promise<void> {
  // A store removed from the registry leaves no rows behind.
  const known = STORES.map((s) => `store:${s.key}`);
  const removed = await prisma.offer.deleteMany({ where: { source: { startsWith: "store:", notIn: known } } });
  if (removed.count) log(`Removed ${removed.count} offers from stores no longer in the registry`);
  for (const table of ["Card", "Sealed"]) {
    const reset = MARKETS.map((m) => `"low${m}" = NULL, "stores${m}" = 0`).join(", ");
    await prisma.$executeRawUnsafe(`UPDATE "${table}" SET ${reset}`);
    for (const m of MARKETS) {
      await prisma.$executeRawUnsafe(
        `UPDATE "${table}" t SET "low${m}" = a.low, "stores${m}" = a.n
         FROM (SELECT "productId", MIN("priceCents") AS low, COUNT(*) FILTER (WHERE source NOT LIKE 'ebay%')::int AS n FROM "Offer"
               WHERE market = $1 AND "inStock" AND "updatedAt" > now() - make_interval(hours => $2::int) GROUP BY "productId") a
         WHERE a."productId" = t.id`,
        m,
        STALE_HOURS,
      );
    }
  }
  log("Aggregated per-market lowest prices");
}

/** A product's cheapest listing per market, in MARKETS order and each market's own currency. */
export function marketLows(p: { lowUS: number | null; lowAU: number | null; lowUK: number | null; lowSG: number | null; lowCA: number | null; lowEU: number | null }): (number | null)[] {
  return [p.lowUS, p.lowAU, p.lowUK, p.lowSG, p.lowCA, p.lowEU];
}

export async function recordHistory(log: Log, today: Date = utcDay()): Promise<HistoryResult> {
  const day = today.toISOString().slice(0, 10);
  const dn = dayNum(day);
  const [cards, sealed] = await Promise.all([
    prisma.card.findMany({ select: { id: true, marketUsd: true, lowUS: true, lowAU: true, lowUK: true, lowSG: true, lowCA: true, lowEU: true } }),
    prisma.sealed.findMany({ select: { id: true, marketUsd: true, lowUS: true, lowAU: true, lowUK: true, lowSG: true, lowCA: true, lowEU: true } }),
  ]);
  const isCard = new Set(cards.map((c) => c.id));
  type Row = (typeof cards)[number];
  const byBucket = new Map<string, Row[]>();
  for (const p of [...cards, ...sealed]) (byBucket.get(bucketOf(p.id)) ?? byBucket.set(bucketOf(p.id), []).get(bucketOf(p.id))!).push(p);

  const index = readIndex();
  const prev = [...index.days].reverse().find((d) => d.day < day) ?? null;
  const prevN = prev ? dayNum(prev.day) : null;
  const dayFile: DayFile = { v: 2, day, p: {} };
  const cardRows: unknown[][] = [];
  const sealedRows: unknown[][] = [];
  const pairs: [number, number][] = [];
  let total = 0;
  let n = 0;
  for (let i = 0; i < HISTORY_BUCKETS; i++) {
    const b = i.toString(16).padStart(2, "0");
    const file = readBucket(b);
    for (const p of byBucket.get(b) ?? []) {
      const key = String(p.id);
      // v2: every market's low rides with the day's point (lib/history.ts Point).
      const lows = marketLows(p);
      if (p.marketUsd != null || lows.some((x) => x != null)) {
        file.v = 2;
        file.p[key] = withPoint(file.p[key], [dn, p.marketUsd, ...lows]);
        dayFile.p[key] = [p.marketUsd, ...lows];
      }
      const series = file.p[key] ?? [];
      const c7 = p.marketUsd != null ? changeOver(series, dn, 7) : null;
      if (!isCard.has(p.id)) {
        sealedRows.push([p.id, c7]);
        continue;
      }
      cardRows.push([p.id, c7, p.marketUsd != null ? changeOver(series, dn, 30) : null, highOver(series, dn, 90)]);
      if ((p.marketUsd ?? 0) >= 100) {
        total += p.marketUsd!;
        n++;
        const y = prevN ? series.find((x) => x[0] === prevN)?.[1] : null;
        if (y != null && y >= 100) pairs.push([p.marketUsd!, y]);
      }
    }
    // A product TCGplayer no longer lists keeps its series until it ages out.
    for (const [k, series] of Object.entries(file.p)) if (!series.length || (series[series.length - 1][0] as number) <= addDays(dn, -KEEP_DAYS)) delete file.p[k];
    writeBucket(b, file);
    writeRecentBucket(b, recentOf(file, dn)); // the binder chart's 120-day read (collection-alerts)
  }
  writeDay(dayFile);
  const row = nextIndex(prev, pairs, total, n, day);
  index.days = [...index.days.filter((d) => d.day !== day), row].sort((a, b) => a.day.localeCompare(b.day));
  writeIndex(index);

  await bulkUpdate("Card", [{ name: "change7d", cast: "float8" }, { name: "change30d", cast: "float8" }, { name: "high90Usd", cast: "int" }], cardRows);
  await bulkUpdate("Sealed", [{ name: "change7d", cast: "float8" }], sealedRows);
  log(`History: ${Object.keys(dayFile.p).length} prices for ${day} written to ${historyDir()}; index ${row.value.toFixed(1)} over ${n} cards`);
  return { day, products: Object.keys(dayFile.p).length, index: row.value };
}

export interface HistoryResult {
  day: string;
  products: number;
  index: number;
}

/** UPDATE t SET cols FROM (VALUES (id, …)) — rows are [id, ...values]. */
async function bulkUpdate(table: string, cols: Col[], rows: unknown[][]): Promise<void> {
  const CHUNK = Math.max(1, Math.floor(30000 / (cols.length + 1)));
  for (let s = 0; s < rows.length; s += CHUNK) {
    const params: unknown[] = [];
    const values = rows.slice(s, s + CHUNK).map(
      (r) =>
        "(" +
        r
          .map((v, i) => {
            params.push(v);
            return `$${params.length}::${i === 0 ? "int" : cols[i - 1].cast}`;
          })
          .join(",") +
        ")",
    );
    const sql =
      `UPDATE "${table}" AS t SET ${cols.map((c) => `"${c.name}" = v."${c.name}"`).join(", ")} ` +
      `FROM (VALUES ${values.join(",")}) AS v(id, ${cols.map((c) => `"${c.name}"`).join(", ")}) WHERE t.id = v.id`;
    await prisma.$executeRawUnsafe(sql, ...params);
  }
}

export function utcDay(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function revalidateSite(log: Log): Promise<void> {
  const url = process.env.REVALIDATE_URL || (process.env.CRON_SECRET && process.env.NEXT_PUBLIC_SITE_URL ? `${SITE_URL}/api/revalidate` : "");
  if (!url || !process.env.CRON_SECRET) {
    log("Revalidate: skipped (no REVALIDATE_URL / CRON_SECRET)");
    return;
  }
  try {
    const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    log(`Revalidate: HTTP ${r.status}`);
  } catch (e) {
    log(`Revalidate failed: ${(e as Error).message}`);
  }
}
