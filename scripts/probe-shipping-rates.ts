// Measure what each Shopify store REALLY charges to post ONE sealed product, from its own storefront quote, to several addresses per
// market (src/lib/shipping-probe.ts PROBE_ADDRESSES). Run weekly by .github/workflows/shipping-rates.yml; the output is condensed into
// src/data/shipping-rates.json by scripts/build-shipping-rates.ts, which the product page reads (bundled: no database, no runtime fetch).
//
// HOW, per store (src/data/stores.json; Shopify only, a WooCommerce store has no public quote and shows "Shipping at checkout"):
//   1. read its Magic sealed collections (products.json?country=XX, as the importer does) for in-stock sealed products;
//   2. pick single items at a ladder of prices (its cheapest, then ~40/80/150/300 in its currency: planItems);
//   3. per item, with a FRESH cookie jar: POST /cart/add.js (one unit), read /cart.js back for the real subtotal and currency, then
//      GET /cart/shipping_rates.json for each address. After an address that returns no rate, the next is asked on a fresh cart (an
//      unserved address can poison the cart's later quotes: the old probe's Trinket Mage finding).
// It never checks out and writes one JSON file. Carts are anonymous and expire on Shopify's side.
//
// ROBOTS.TXT: Shopify's default robots.txt disallows /cart (so search engines do not index carts). This is a weekly, low-volume reading
// of a quote any shopper sees, not a crawl; it records `cartDisallowed` per store, and honours robots.txt for products.json as the
// importer does.
//
// POLITENESS: one request per store at a time, ≥1 s apart (--delay-ms), three stores at once (--concurrency), backoff honouring
// Retry-After on 429/5xx, and a hard per-store cap on requests and time.
//
// Usage:
//   npx tsx scripts/probe-shipping-rates.ts --market=AU --out=/tmp/ship-au.json
//   npx tsx scripts/probe-shipping-rates.ts --store=88gamesarena,area5 --out=/tmp/ship.json
//   npx tsx scripts/build-shipping-rates.ts /tmp/ship-*.json        (→ src/data/shipping-rates.json)
export {};
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import raw from "../src/data/stores.json";
import { classify } from "../src/lib/sealed-title";
import { currencyOfMarket } from "../src/lib/regions";
import { SCRAPE_HEADERS, robotsAllows, sleep } from "../src/lib/scrape-http";
import {
  PROBE_ADDRESSES,
  PROBE_MARKETS,
  backoffMs,
  cheapestPostage,
  isCandidate,
  parseShippingRates,
  planItems,
  priceToCents,
  shippingAddressQuery,
  type AddressOutcome,
  type Candidate,
  type ProbeAddress,
  type ProbeMarket,
  type ShippingPoint,
  type StoreShipping,
} from "../src/lib/shipping-probe";

interface StoreRow {
  key: string;
  name: string;
  base: string;
  market: string;
  platform: string;
  country: string;
  collections: string[];
}
const STORES = raw as StoreRow[];

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq < 0 ? "" : hit.slice(eq + 1);
}
function numArg(name: string, dflt: number): number {
  const n = Number(arg(name));
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

const DELAY_MS = numArg("delay-ms", 1000);
const CONCURRENCY = Math.floor(numArg("concurrency", 3));
const MAX_REQUESTS = Math.floor(numArg("max-requests", 160));
const MAX_MS = numArg("max-minutes", 8) * 60_000;
const MAX_ATTEMPTS = 4;
const MAX_FEED_PAGES = 4;

class StoreCapError extends Error {}

class CookieJar {
  private m = new Map<string, string>();
  absorb(res: Response) {
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const first = sc.split(";")[0];
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      const k = first.slice(0, eq).trim();
      const v = first.slice(eq + 1).trim();
      if (!v || /max-age=0\b/i.test(sc)) this.m.delete(k);
      else this.m.set(k, v);
    }
  }
  header(): string | undefined {
    return this.m.size ? [...this.m].map(([k, v]) => `${k}=${v}`).join("; ") : undefined;
  }
}

class StoreClient {
  requests = 0;
  rateLimited = 0;
  private last = 0;
  private readonly started = Date.now();
  origin: string;
  constructor(readonly store: StoreRow, readonly log: (m: string) => void) {
    this.origin = store.base;
  }
  private async throttle() {
    if (this.requests >= MAX_REQUESTS) throw new StoreCapError(`request cap (${MAX_REQUESTS}) reached`);
    if (Date.now() - this.started > MAX_MS) throw new StoreCapError(`time cap reached`);
    const wait = this.last + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
    this.requests++;
  }
  async fetch(path: string, init: { method?: string; json?: unknown; jar?: CookieJar } = {}): Promise<{ status: number; body: unknown }> {
    const url = `${this.origin}${path}`;
    let lastErr = "";
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await this.throttle();
      const headers: Record<string, string> = { ...SCRAPE_HEADERS, Accept: "application/json", "Cache-Control": "no-cache" };
      const cookie = init.jar?.header();
      if (cookie) headers.Cookie = cookie;
      if (init.json !== undefined) headers["Content-Type"] = "application/json";
      let res: Response;
      try {
        res = await fetch(url, { method: init.method ?? "GET", headers, body: init.json === undefined ? undefined : JSON.stringify(init.json), redirect: "follow", signal: AbortSignal.timeout(30_000) });
      } catch (e) {
        lastErr = (e as Error).message;
        await sleep(backoffMs(attempt, null));
        continue;
      }
      init.jar?.absorb(res);
      if (res.redirected) {
        const moved = new URL(res.url).origin;
        if (moved !== this.origin) {
          this.log(`${this.origin} redirects to ${moved}: using that origin`);
          this.origin = moved;
        }
      }
      if (res.status === 429 || res.status >= 500) {
        if (res.status === 429) this.rateLimited++;
        const ms = backoffMs(attempt, res.headers.get("retry-after"));
        lastErr = `HTTP ${res.status}`;
        await res.arrayBuffer().catch(() => undefined);
        this.log(`HTTP ${res.status} on ${path.split("?")[0]}: backing off ${(ms / 1000).toFixed(1)}s`);
        await sleep(ms);
        continue;
      }
      const text = await res.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      return { status: res.status, body };
    }
    throw new Error(`gave up after ${MAX_ATTEMPTS} attempts (${lastErr})`);
  }
}

interface FeedProduct {
  title: string;
  variants: { id: number; title?: string; price: string; available: boolean; requires_shipping?: boolean }[];
}

async function loadCandidates(client: StoreClient): Promise<Candidate[]> {
  const allowed = await robotsAllows(client.store.base);
  const byId = new Map<number, Candidate>();
  let pages = 0;
  for (const h of client.store.collections) {
    const path = `/collections/${h}/products.json`;
    if (!allowed(path)) continue;
    for (let page = 1; pages < MAX_FEED_PAGES; page++) {
      pages++;
      const r = await client.fetch(`${path}?limit=250&page=${page}&country=${client.store.country}`);
      const products = r.status === 200 ? ((r.body as { products?: FeedProduct[] })?.products ?? []) : [];
      for (const p of products) {
        if (!classify(p.title)) continue; // a sealed product the site would list (lib/sealed-title.ts)
        for (const v of p.variants ?? []) {
          const priceCents = priceToCents(v.price);
          if (!isCandidate({ productTitle: p.title, available: !!v.available, priceCents, requiresShipping: v.requires_shipping }) || byId.has(v.id)) continue;
          byId.set(v.id, { id: v.id, priceCents: priceCents!, title: p.title.slice(0, 90) });
        }
      }
      if (products.length < 250) break;
    }
  }
  return [...byId.values()];
}

interface Cart {
  subtotalCents: number;
  items: number;
  currency: string;
}

async function freshCart(client: StoreClient, iso: string, id: number): Promise<{ jar: CookieJar; cart: Cart } | string> {
  const jar = new CookieJar();
  const add = await client.fetch(`/cart/add.js?country=${iso}`, { method: "POST", json: { items: [{ id, quantity: 1 }] }, jar });
  if (add.status !== 200) return `add.js HTTP ${add.status}`;
  const r = await client.fetch(`/cart.js?country=${iso}`, { jar });
  const c = r.body as { total_price?: number; item_count?: number; currency?: string } | null;
  if (r.status !== 200 || !c || typeof c.total_price !== "number") return `cart.js HTTP ${r.status}`;
  return { jar, cart: { subtotalCents: c.total_price, items: c.item_count ?? 0, currency: c.currency ?? "" } };
}

async function quote(client: StoreClient, jar: CookieJar, iso: string, a: ProbeAddress, currency: string): Promise<AddressOutcome> {
  let r = await client.fetch(`/cart/shipping_rates.json?${shippingAddressQuery(a)}&country=${iso}`, { jar });
  let out = r.body ? parseShippingRates(r.body, currency) : null;
  if (out?.status === "error" && /country/i.test(out.error)) {
    r = await client.fetch(`/cart/shipping_rates.json?${shippingAddressQuery(a, true)}&country=${iso}`, { jar });
    out = r.body ? parseShippingRates(r.body, currency) : out;
  }
  return out ?? { status: "error", rates: [], error: `HTTP ${r.status}, non-JSON body` };
}

interface StoreResult {
  key: string;
  market: ProbeMarket;
  cartDisallowed: boolean;
  requests: number;
  rateLimited: number;
  shipping?: StoreShipping;
  error?: string;
  notes: string[];
}

async function probeStore(store: StoreRow): Promise<StoreResult> {
  const market = store.market as ProbeMarket;
  const log = (m: string) => console.log(`[${store.key}] ${m}`);
  const client = new StoreClient(store, log);
  const currency = currencyOfMarket(market) ?? "";
  const addresses = PROBE_ADDRESSES[market];
  const allowed = await robotsAllows(store.base);
  const out: StoreResult = { key: store.key, market, cartDisallowed: !allowed("/cart/shipping_rates.json"), requests: 0, rateLimited: 0, notes: [] };
  const points: ShippingPoint[] = [];
  try {
    const items = planItems(await loadCandidates(client));
    if (!items.length) throw new Error("no in-stock sealed product found");
    log(`${items.length} item(s): ${items.map((i) => (i.priceCents / 100).toFixed(2)).join(", ")} ${currency}`);
    await client.fetch(`/cart.js?country=${store.country}`, { jar: new CookieJar() }); // settle the canonical host first
    for (const item of items) {
      let made = await freshCart(client, store.country, item.id);
      if (typeof made === "string") {
        out.notes.push(`${item.id}: ${made}`);
        continue;
      }
      if (made.cart.items !== 1 || made.cart.currency !== currency) {
        out.notes.push(`${item.id}: cart held ${made.cart.items} item(s) in ${made.cart.currency || "?"}; skipped`);
        continue;
      }
      const subtotalCents = made.cart.subtotalCents;
      const rates: Record<string, number | null> = {};
      let dirty = false;
      for (const a of addresses) {
        if (dirty) {
          const again = await freshCart(client, store.country, item.id);
          if (typeof again === "string") {
            rates[a.id] = null;
            continue;
          }
          made = again;
          dirty = false;
        }
        const o = await quote(client, made.jar, store.country, a, currency);
        rates[a.id] = cheapestPostage(o, currency);
        if (o.status !== "ok") {
          dirty = true;
          if (o.status === "error") out.notes.push(`${a.id} @${subtotalCents}: ${o.error.slice(0, 120)}`);
        }
      }
      points.push({ subtotalCents, rates });
      log(`${(subtotalCents / 100).toFixed(2)} ${currency} → ${addresses.map((a) => `${a.id}=${rates[a.id] == null ? "—" : (rates[a.id]! / 100).toFixed(2)}`).join(" ")}`);
    }
  } catch (e) {
    out.error = (e as Error).message;
    log(`stopped: ${out.error}`);
  } finally {
    out.requests = client.requests;
    out.rateLimited = client.rateLimited;
  }
  if (points.length) out.shipping = { market, currency, measuredAt: new Date().toISOString(), points };
  return out;
}

async function main() {
  const keys = (arg("store") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const market = arg("market")?.toUpperCase();
  if (market && !PROBE_MARKETS.includes(market as ProbeMarket)) throw new Error(`--market must be one of ${PROBE_MARKETS.join(", ")}`);
  const unknown = keys.filter((k) => !STORES.some((s) => s.key === k));
  if (unknown.length) throw new Error(`unknown store key(s): ${unknown.join(", ")}`);
  const stores = STORES.filter((s) => s.platform === "shopify" && (keys.length ? keys.includes(s.key) : !market || s.market === market));
  const outPath = resolve(arg("out") || `shipping-probe-${(market ?? "all").toLowerCase()}.json`);
  console.log(`Probing ${stores.length} store(s), ${DELAY_MS} ms per-store spacing, concurrency ${CONCURRENCY}. Writing ${outPath}`);
  const results: StoreResult[] = [];
  const write = () => {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), probed: stores.map((s) => s.key), results }, null, 1) + "\n");
  };
  let next = 0;
  const worker = async () => {
    while (next < stores.length) {
      const s = stores[next++];
      results.push(await probeStore(s));
      write();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, stores.length) }, worker));
  write();
  const ok = results.filter((r) => r.shipping).length;
  console.log(`\nMeasured ${ok} of ${stores.length} store(s); ${results.reduce((n, r) => n + r.rateLimited, 0)}× HTTP 429. Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
