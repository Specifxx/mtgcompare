// Measure what each tracked store REALLY charges for postage, from its own
// checkout — RiftCompare's probe, ported 2026-10-03 for MTG Compare's stores
// (lib/stores.ts), so Best Basket prices delivery from measured rates.
//
// WHY (RiftCompare, 2026-09-25): a customer in Adelaide ran Best Basket, was
// told a store's postage was $2, and was quoted $20 at the store — the figure
// was a hand-typed guess. A store's postage depends on zone, card count and
// order value; only its own checkout knows.
//
// HOW (Shopify only — every MTG Compare store is Shopify):
//   1. read the store's Magic singles feed (products.json?country=XX, the
//      same market context the importer uses) for cheap IN-STOCK variants;
//   2. per scenario, with a FRESH cookie jar, POST /cart/add.js?country=XX
//      (the ?country= puts the cart in the market's currency — verified: Cherry
//      Collectables' cart turns USD with ?country=US) and read /cart.js back
//      for the ACTUAL subtotal and item count (Shopify caps an over-stock add
//      at what it has and says so with a 422; we top up from other variants);
//   3. GET /cart/shipping_rates.json for each representative address of the
//      market (8 AU capitals, 4 US/UK/CA cities, 4 eurozone countries, SG).
//   Scenarios: S1 (one cheapest single), S10 (ten cheap singles), and value
//   rungs V20/V50/V100/V150 (few cards, subtotal ≥ the target in the market
//   currency) — see lib/shipping-probe.ts for why count and value are separate.
//
// It never checks out, never touches our database, and writes one JSON file.
// Carts it creates are anonymous and expire on Shopify's side.
//
// ROBOTS.TXT: Shopify's DEFAULT robots.txt disallows /cart for every store (it
// exists so search engines do not index cart pages). This probe is a one-off,
// low-volume measurement of a quote any shopper sees, not a crawl, so it does
// read /cart — but it records `robots.cartDisallowed` per store so that choice
// stays visible, and it honours robots.txt for products.json exactly as the
// importer does.
//
// POLITENESS: one request per store at a time, ≥700ms apart (--delay-ms), six
// stores at once (--concurrency), exponential backoff honouring Retry-After on
// 429/5xx, and a hard per-store cap on requests and wall time. AU runs ~70
// requests per store (6 scenarios × (add + cart read + 8 addresses)).
//
// Usage:
//   npx tsx scripts/probe-shipping-rates.ts --market=AU --out=shipping-au.json
//   npx tsx scripts/probe-shipping-rates.ts --market=AU --store=cherry,finalboss --out=/tmp/au.json
//   npx tsx scripts/probe-shipping-rates.ts --store=cardgoblin --out=/tmp/uk.json   (market from the store)
// Options: --ladder=20,30,50,100,150  --concurrency=6  --delay-ms=700
//          --max-requests=220  --max-minutes=12
// Then condense the output into the snapshot the site reads:
//   npx tsx scripts/build-shipping-rates.ts shipping-au.json   (→ src/lib/shipping-rates.json)
// or dispatch .github/workflows/shipping-rates.yml, which runs both per market.
export {}; // module scope — avoids global-name collisions with other probe scripts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { STORES, STORE_BY_KEY, type StoreInfo } from "../src/lib/stores";
import { SCRAPE_HEADERS, robotsAllows, sleep } from "../src/lib/scrape";
import { currencyOf, isoCountry } from "../src/lib/country";
import {
  PROBE_ADDRESSES,
  PROBE_MARKETS,
  backoffMs,
  candidateTier,
  isMagicSinglesHandle,
  parseShippingRates,
  planCart,
  priceToCents,
  scenarioSpecs,
  shippingAddressQuery,
  summarizeStore,
  type CartCandidate,
  type CartLine,
  type ProbeAddress,
  type ProbeCartLine,
  type ProbeMarket,
  type ProbeScenarioResult,
  type ScenarioSpec,
  type StoreSummary,
} from "../src/lib/shipping-probe";

// ── CLI ─────────────────────────────────────────────────────────────────────
function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq < 0 ? "" : hit.slice(eq + 1);
}
function numArg(name: string, dflt: number): number {
  const v = arg(name);
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

const DELAY_MS = numArg("delay-ms", 700);
const CONCURRENCY = Math.floor(numArg("concurrency", 6));
const MAX_REQUESTS = Math.floor(numArg("max-requests", 220));
const MAX_MS = numArg("max-minutes", 12) * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_FEED_PAGES = 12; // per store, across all handles
const MAX_CART_ITEMS = 40;

const LADDER = (arg("ladder") ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

function usage(msg: string): never {
  console.error(`${msg}\nUsage: npx tsx scripts/probe-shipping-rates.ts --market=AU|US|UK|CA|EU|SG [--store=key[,key]] --out=<path.json>`);
  process.exit(2);
}

// ── HTTP: per-store throttle, cookie jar, backoff ───────────────────────────
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

interface HttpResult {
  status: number;
  body: unknown; // parsed JSON, or null when the body was not JSON
  text: string;
}

class StoreClient {
  requests = 0;
  retries = 0;
  rateLimited = 0;
  private last = 0;
  private readonly started = Date.now();
  // The origin requests go to. Starts as stores.ts's `base`; if that
  // redirects (apex → www, a renamed domain), the first redirected response
  // moves it, because a redirected POST /cart/add.js arrives as a GET with no
  // body and would read as "this store will not take the item".
  origin: string;
  constructor(readonly store: StoreInfo, readonly log: (m: string) => void) {
    this.origin = store.base;
  }

  private async throttle() {
    if (this.requests >= MAX_REQUESTS) throw new StoreCapError(`request cap (${MAX_REQUESTS}) reached`);
    if (Date.now() - this.started > MAX_MS) throw new StoreCapError(`time cap (${MAX_MS / 60_000} min) reached`);
    const wait = this.last + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
    this.requests++;
  }

  /** One logical request, retried on 429 / 5xx / network error with backoff. */
  async fetch(path: string, init: { method?: string; json?: unknown; jar?: CookieJar } = {}): Promise<HttpResult> {
    const url = path.startsWith("http") ? path : `${this.origin}${path}`;
    let lastErr = "";
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await this.throttle();
      const headers: Record<string, string> = {
        ...SCRAPE_HEADERS,
        Accept: "application/json",
        "Cache-Control": "no-cache",
      };
      const cookie = init.jar?.header();
      if (cookie) headers.Cookie = cookie;
      if (init.json !== undefined) headers["Content-Type"] = "application/json";
      let res: Response;
      try {
        res = await fetch(url, {
          method: init.method ?? "GET",
          headers,
          body: init.json === undefined ? undefined : JSON.stringify(init.json),
          redirect: "follow",
          signal: AbortSignal.timeout(30_000),
        });
      } catch (e) {
        lastErr = (e as Error).message;
        const ms = backoffMs(attempt, null);
        this.retries++;
        this.log(`network error on ${path.split("?")[0]} (${lastErr}) — retry in ${(ms / 1000).toFixed(1)}s`);
        await sleep(ms);
        continue;
      }
      init.jar?.absorb(res);
      if (res.redirected && !path.startsWith("http")) {
        const moved = new URL(res.url).origin;
        if (moved !== this.origin) {
          this.log(`${this.origin} redirects to ${moved} — using that origin`);
          this.origin = moved;
        }
      }
      if (res.status === 429 || res.status >= 500) {
        if (res.status === 429) this.rateLimited++;
        const ms = backoffMs(attempt, res.headers.get("retry-after"));
        lastErr = `HTTP ${res.status}`;
        this.retries++;
        await res.arrayBuffer().catch(() => undefined);
        this.log(`HTTP ${res.status} on ${path.split("?")[0]} — backing off ${(ms / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
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
      return { status: res.status, body, text };
    }
    throw new Error(`gave up after ${MAX_ATTEMPTS} attempts (${lastErr})`);
  }
}

// ── Feed: cheap in-stock variants ───────────────────────────────────────────
interface FeedVariant { id: number; title?: string; price: string; available: boolean; requires_shipping?: boolean }
interface FeedProduct { title: string; handle: string; variants: FeedVariant[] }

async function sitemapHandles(client: StoreClient): Promise<string[]> {
  const index = await client.fetch("/sitemap.xml").catch(() => null);
  let maps = index && index.status === 200
    ? [...index.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /sitemap_collections/i.test(u))
    : [];
  if (!maps.length) maps = [`${client.origin}/sitemap_collections_1.xml`];
  const handles = new Set<string>();
  for (const sm of maps.slice(0, 3)) {
    const r = await client.fetch(sm).catch(() => null);
    if (!r || r.status !== 200) continue;
    for (const m of r.text.matchAll(/\/collections\/([^<\/?#"]+)/g)) if (isMagicSinglesHandle(m[1])) handles.add(m[1]);
  }
  return [...handles];
}

async function loadCandidates(client: StoreClient, iso: string, maxTargetCents: number): Promise<{ candidates: CartCandidate[]; handles: string[]; note?: string }> {
  const allowed = await robotsAllows(client.store.base);
  const byId = new Map<number, CartCandidate>();
  const used: string[] = [];
  let pages = 0;
  const enough = () => {
    const singles = [...byId.values()].filter((c) => c.tier === 0);
    return singles.length >= 30 && singles.reduce((s, c) => s + c.priceCents, 0) >= maxTargetCents * 1.5;
  };
  const readHandle = async (handle: string) => {
    const path = `/collections/${handle}/products.json`;
    if (!allowed(path)) {
      client.log(`robots.txt disallows ${path} — skipping that collection`);
      return;
    }
    for (let page = 1; pages < MAX_FEED_PAGES; page++) {
      pages++;
      const r = await client.fetch(`${path}?limit=250&page=${page}&country=${iso}`);
      if (r.status !== 200 || !r.body) return;
      const products = (r.body as { products?: FeedProduct[] }).products ?? [];
      if (page === 1 && products.length) used.push(handle);
      for (const p of products) {
        for (const v of p.variants ?? []) {
          const priceCents = priceToCents(v.price) ?? 0;
          const tier = candidateTier({
            productTitle: p.title,
            variantTitle: v.title,
            available: !!v.available,
            priceCents,
            requiresShipping: v.requires_shipping,
          });
          if (tier == null || byId.has(v.id)) continue;
          byId.set(v.id, { id: v.id, priceCents, title: `${p.title}${v.title && v.title !== "Default Title" ? ` [${v.title}]` : ""}`, tier });
        }
      }
      if (products.length < 250 || enough()) return;
    }
  };
  const configured = [...new Set(client.store.collections ?? [])];
  for (const h of configured) {
    if (enough()) break;
    await readHandle(h);
  }
  let note: string | undefined;
  if (!byId.size) {
    const found = (await sitemapHandles(client)).filter((h) => !configured.includes(h));
    if (found.length) note = `collections discovered from sitemap: ${found.join(", ")}`;
    for (const h of found) {
      if (enough()) break;
      await readHandle(h);
    }
  }
  return { candidates: [...byId.values()], handles: used, note };
}

// ── One scenario ────────────────────────────────────────────────────────────
interface CartState { subtotalCents: number; items: number; currency: string; lines: ProbeCartLine[] }

async function readCart(client: StoreClient, jar: CookieJar, iso: string): Promise<CartState> {
  const r = await client.fetch(`/cart.js?country=${iso}`, { jar });
  const c = r.body as {
    total_price?: number;
    item_count?: number;
    currency?: string;
    items?: { variant_id: number; quantity: number; price: number; title?: string }[];
  } | null;
  if (r.status !== 200 || !c || typeof c.total_price !== "number") throw new Error(`cart.js returned HTTP ${r.status}`);
  return {
    subtotalCents: c.total_price,
    items: c.item_count ?? 0,
    currency: c.currency ?? "",
    lines: (c.items ?? []).map((i) => ({ id: i.variant_id, quantity: i.quantity, priceCents: i.price, title: (i.title ?? "").slice(0, 90) })),
  };
}

async function addLines(client: StoreClient, jar: CookieJar, iso: string, lines: CartLine[]): Promise<string | null> {
  if (!lines.length) return null;
  const r = await client.fetch(`/cart/add.js?country=${iso}`, { method: "POST", json: { items: lines }, jar });
  if (r.status === 200) return null;
  const b = r.body as { description?: string; message?: string } | null;
  return `add.js HTTP ${r.status}: ${b?.description ?? b?.message ?? r.text.slice(0, 120)}`;
}

async function shippingRatesFor(
  client: StoreClient,
  jar: CookieJar,
  iso: string,
  addr: ProbeAddress,
  cartCurrency: string,
): Promise<ProbeScenarioResult["byAddress"][string]> {
  let r = await client.fetch(`/cart/shipping_rates.json?${shippingAddressQuery(addr)}&country=${iso}`, { jar });
  let out = r.body ? parseShippingRates(r.body, cartCurrency) : null;
  // A store that rejects the country NAME gets one retry with the ISO code.
  if (out?.status === "error" && /country/i.test(out.error)) {
    r = await client.fetch(`/cart/shipping_rates.json?${shippingAddressQuery(addr, true)}&country=${iso}`, { jar });
    out = r.body ? parseShippingRates(r.body, cartCurrency) : out;
  }
  if (!out) return { status: "error", rates: [], error: `HTTP ${r.status}, non-JSON body`, httpStatus: r.status };
  return r.status === 200 ? out : { ...out, httpStatus: r.status };
}

// `onCart` receives the result as soon as the cart is built, before any rate is
// asked for, so a store that hits its cap mid-scenario still keeps what was
// measured up to that point.
async function runScenario(
  client: StoreClient,
  spec: ScenarioSpec,
  candidates: CartCandidate[],
  addresses: ProbeAddress[],
  iso: string,
  prior: { id: string; key: string }[],
  onCart: (r: ProbeScenarioResult) => void,
): Promise<ProbeScenarioResult> {
  const base: ProbeScenarioResult = {
    id: spec.id,
    kind: spec.kind,
    ...(spec.kind === "value" ? { targetCents: spec.targetCents } : {}),
    subtotalCents: 0,
    items: 0,
    cartCurrency: "",
    byAddress: {},
  };
  const planned = planCart(candidates, spec, { maxItems: spec.kind === "count" ? spec.count : MAX_CART_ITEMS });
  if (!planned.length) return { ...base, error: "no in-stock candidates" };

  // Same lines as an earlier scenario (a thin store): the rates would be too.
  const plannedKey = planned.map((l) => `${l.id}x${l.quantity}`).sort().join(",");
  const dup = prior.find((p) => p.key === plannedKey);
  if (dup) return { ...base, sameCartAs: dup.id };

  const jar = new CookieJar();
  const addErrors: string[] = [];
  const tried = new Set<number>();
  let lines = planned;
  let cart: CartState | null = null;
  for (let round = 0; round < 3 && lines.length; round++) {
    lines.forEach((l) => tried.add(l.id));
    const err = await addLines(client, jar, iso, lines);
    if (err) addErrors.push(err);
    cart = await readCart(client, jar, iso);
    const shortCount = spec.kind === "count" ? spec.count - cart.items : 0;
    const shortValue = spec.kind === "value" ? spec.targetCents - cart.subtotalCents : 0;
    if (shortCount <= 0 && shortValue <= 0) break;
    const room = MAX_CART_ITEMS - cart.items;
    if (room <= 0) break;
    lines = spec.kind === "count"
      ? planCart(candidates, { kind: "count", count: shortCount }, { exclude: tried, maxItems: room })
      : planCart(candidates, { kind: "value", targetCents: shortValue }, {
          exclude: tried,
          maxItems: room,
          // Bound the overshoot by the RUNG's target, not the shortfall's.
          maxOvershootCents: Math.max(500, Math.round(spec.targetCents / 2)),
        });
  }
  if (!cart || cart.items === 0) return { ...base, error: addErrors.join(" | ") || "cart stayed empty" };
  const key = cart.lines.map((l) => `${l.id}x${l.quantity}`).sort().join(",");
  prior.push({ id: spec.id, key: plannedKey }, { id: spec.id, key });

  const result: ProbeScenarioResult = {
    ...base,
    subtotalCents: cart.subtotalCents,
    items: cart.items,
    cartCurrency: cart.currency,
    lines: cart.lines,
  };
  if ((spec.kind === "count" && cart.items < spec.count) || (spec.kind === "value" && cart.subtotalCents < spec.targetCents)) result.short = true;
  // A partial add is normal (Shopify caps an add at what is in stock) — the cart
  // read-back above is the truth; the messages are kept for the record.
  if (addErrors.length) result.notes = addErrors;
  onCart(result);
  // A quote for an address the store does not ship to can POISON the cart: on
  // the first EU run Trinket Mage (a German store) quoted Berlin €5.99 on a
  // fresh cart, but once the same cart had been asked for Madrid (no rates),
  // every later address — Berlin included — came back empty. Since the address
  // order is fixed, one unserved address would blank every address after it.
  // So after any address that is not "ok", the next one is quoted on a FRESH
  // cart holding the same lines (one extra add; no cost when every address is
  // served).
  let quoteJar = jar;
  let dirty = false;
  const sameLines = cart.lines.map((l) => ({ id: l.id, quantity: l.quantity }));
  for (const a of addresses) {
    try {
      if (dirty) {
        quoteJar = new CookieJar();
        const err = await addLines(client, quoteJar, iso, sameLines);
        if (err) {
          result.byAddress[a.id] = { status: "error", rates: [], error: `fresh cart for this address: ${err}` };
          continue; // the next address retries a fresh cart too
        }
        (result.notes ??= []).push(`${a.id} quoted on a fresh cart after an earlier address returned no rates`);
        dirty = false;
      }
      result.byAddress[a.id] = await shippingRatesFor(client, quoteJar, iso, a, cart.currency);
    } catch (e) {
      if (e instanceof StoreCapError) throw e;
      result.byAddress[a.id] = { status: "error", rates: [], error: (e as Error).message };
    }
    if (result.byAddress[a.id].status !== "ok") dirty = true;
  }
  return result;
}

// ── One store ───────────────────────────────────────────────────────────────
interface StoreOutput {
  key: string;
  name: string;
  market: ProbeMarket;
  currency: string;
  measuredAt: string;
  base: string;
  robots: { cartDisallowed: boolean };
  collections: string[];
  candidates: number;
  requests: number;
  rateLimited: number;
  addresses: ProbeAddress[];
  scenarios: ProbeScenarioResult[];
  summary?: StoreSummary;
  notes: string[];
  error?: string;
}

function fmt(cents: number | null | undefined, cur: string): string {
  return cents == null ? "—" : `${(cents / 100).toFixed(2)} ${cur}`;
}

async function probeStore(store: StoreInfo, market: ProbeMarket, specs: ScenarioSpec[]): Promise<StoreOutput> {
  const log = (m: string) => console.log(`[${store.key}] ${m}`);
  const iso = isoCountry(market);
  const currency = store.currency ?? currencyOf(market);
  const addresses = PROBE_ADDRESSES[market];
  const client = new StoreClient(store, log);
  const allowed = await robotsAllows(store.base);
  const out: StoreOutput = {
    key: store.key,
    name: store.name,
    market,
    currency,
    measuredAt: new Date().toISOString(),
    base: store.base,
    robots: { cartDisallowed: !allowed("/cart/shipping_rates.json") },
    collections: [],
    candidates: 0,
    requests: 0,
    rateLimited: 0,
    addresses,
    scenarios: [],
    notes: [],
  };
  try {
    const maxTarget = Math.max(0, ...specs.map((s) => (s.kind === "value" ? s.targetCents : 0)));
    const { candidates, handles, note } = await loadCandidates(client, iso, maxTarget);
    out.collections = handles;
    out.candidates = candidates.length;
    if (note) out.notes.push(note);
    log(`${candidates.length} in-stock candidates from ${handles.join(", ") || "no collection"}`);
    if (!candidates.length) {
      out.error = "no in-stock Magic singles found";
      return out;
    }
    // Settle the canonical host BEFORE the first cart. Shopify serves a POST
    // /cart/add.js on the apex but 301s the GET /cart.js to www
    // ("canonical_host_redirection"), and fetch drops a hand-set Cookie header
    // on a cross-origin redirect — so S1's read-back saw an empty cart, topped
    // up, and measured TWO cards (first AU run: turnordergames, generalgames,
    // plenty, trollaustraliamelb). One throwaway GET moves `client.origin` first.
    await client.fetch(`/cart.js?country=${iso}`, { jar: new CookieJar() });
    const prior: { id: string; key: string }[] = [];
    for (const spec of specs) {
      let s: ProbeScenarioResult;
      try {
        s = await runScenario(client, spec, candidates, addresses, iso, prior, (r) => out.scenarios.push(r));
      } catch (e) {
        if (e instanceof StoreCapError) throw e;
        s = { id: spec.id, kind: spec.kind, subtotalCents: 0, items: 0, cartCurrency: "", byAddress: {}, error: (e as Error).message };
      }
      if (!out.scenarios.includes(s)) out.scenarios.push(s);
      if (s.error) {
        log(`${s.id}: ${s.error}`);
        continue;
      }
      if (s.sameCartAs) {
        log(`${s.id}: same cart as ${s.sameCartAs} (store stock too thin) — not re-queried`);
        continue;
      }
      if (s.cartCurrency !== currency) out.notes.push(`${s.id}: cart currency ${s.cartCurrency} ≠ expected ${currency}`);
      const perAddr = addresses
        .map((a) => {
          const o = s.byAddress[a.id];
          if (!o || o.status !== "ok") return `${a.id}=${o?.status ?? "?"}`;
          const cheapest = o.rates.filter((r) => !r.pickup).sort((x, y) => x.cents - y.cents)[0];
          return `${a.id}=${cheapest ? (cheapest.cents / 100).toFixed(2) : "pickup-only"}`;
        })
        .join(" ");
      log(`${s.id}: ${s.items} item(s), ${fmt(s.subtotalCents, s.cartCurrency)}${s.short ? " (SHORT)" : ""} → ${perAddr}`);
    }
    out.summary = summarizeStore(out.scenarios, addresses, currency);
  } catch (e) {
    out.error = (e as Error).message;
    log(`aborted: ${out.error}`);
    if (out.scenarios.length) out.summary = summarizeStore(out.scenarios, addresses, currency);
  } finally {
    out.requests = client.requests;
    out.rateLimited = client.rateLimited;
  }
  log(`done — ${out.requests} requests${out.rateLimited ? `, ${out.rateLimited}× HTTP 429` : ""}`);
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const storeArg = arg("store");
  const keys = storeArg ? storeArg.split(",").map((s) => s.trim()).filter(Boolean) : [];
  for (const k of keys) if (!STORE_BY_KEY[k]) usage(`Unknown store key "${k}".`);
  const marketArg = arg("market")?.toUpperCase();
  const storeMarkets = new Set(keys.map((k) => STORE_BY_KEY[k].country as ProbeMarket));
  const market = (marketArg ?? (storeMarkets.size === 1 ? [...storeMarkets][0] : undefined)) as ProbeMarket | undefined;
  if (!market || !PROBE_MARKETS.includes(market)) usage("Give --market=AU|US|UK|CA|EU|SG (or --store keys from one market).");
  const stores = keys.length ? keys.map((k) => STORE_BY_KEY[k]) : STORES.filter((r) => r.country === market);
  const wrong = stores.filter((s) => s.country !== market);
  if (wrong.length) usage(`Not ${market} stores: ${wrong.map((s) => s.key).join(", ")}.`);
  const outPath = resolve(arg("out") || `shipping-rates-${market.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`);
  const specs = scenarioSpecs(LADDER.length ? LADDER : undefined);

  console.log(
    `Probing ${stores.length} ${market} store(s): ${specs.map((s) => s.id).join("/")} × ${PROBE_ADDRESSES[market].length} address(es); ` +
      `${DELAY_MS}ms per-store spacing, concurrency ${CONCURRENCY}, cap ${MAX_REQUESTS} requests/store. Writing ${outPath}`,
  );

  const results: StoreOutput[] = new Array(stores.length);
  const write = () => {
    mkdirSync(dirname(outPath), { recursive: true });
    const done = results.filter(Boolean);
    writeFileSync(
      outPath,
      JSON.stringify({ market, generatedAt: new Date().toISOString(), addresses: PROBE_ADDRESSES[market], scenarios: specs, stores: done }, null, 2) + "\n",
    );
  };
  let next = 0;
  const worker = async () => {
    while (next < stores.length) {
      const i = next++;
      results[i] = await probeStore(stores[i], market, specs);
      write(); // partial results survive an interrupted run
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, stores.length) }, worker));
  write();

  // A short table: one-card postage range across the market's addresses.
  console.log("\nstore                          1-card min–max            zone?  free at        errors");
  for (const r of results) {
    const s = r.summary;
    const range = s ? `${fmt(s.oneCardMinCents, r.currency)} – ${fmt(s.oneCardMaxCents, r.currency)}` : "—";
    const freeAts = s ? [...new Set(Object.values(s.byAddress).map((a) => a.freeAtCents))].map((c) => fmt(c, r.currency)).join("/") : "—";
    console.log(
      `${r.key.padEnd(30)} ${range.padEnd(25)} ${String(s?.zonePriced ?? "—").padEnd(6)} ${freeAts.padEnd(14)} ${r.error ?? ""}`,
    );
  }
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
