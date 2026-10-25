// Pure helpers for scripts/probe-shipping-rates.ts: the weekly measurement of what each Shopify store REALLY charges to post one
// sealed product, read from its own storefront quote (POST /cart/add.js, then GET /cart/shipping_rates.json for an address). Ported
// from the old singles site's probe (git history before 2026-10-21, after RiftCompare's), cut down to what a sealed product page needs:
// ONE item per cart, at a ladder of prices, quoted to several addresses per market.
//
// Why (user feedback, 2026-10-25): "shipping/tax is very different not just between countries but areas within countries; if a bundle is
// $10 cheaper but costs $20 of shipping from that place, it's not cheaper." Postage depends on the zone, the parcel and the order value
// (free over $X), and only the store's own checkout knows it, so we ask it, never guess.
//
// Nothing here touches the network or the database; everything is tested in tests/shipping-probe.test.ts.

export type ProbeMarket = "AU" | "NZ" | "US" | "UK" | "CA" | "EU" | "SG";
export const PROBE_MARKETS: readonly ProbeMarket[] = ["AU", "NZ", "US", "UK", "CA", "EU", "SG"];

// ── Addresses ───────────────────────────────────────────────────────────────
// Representative, not exhaustive: one per zone a carrier is likely to price differently (AU matters most: Australia Post and every
// courier price by zone, and a Sydney quote says nothing about Perth or Darwin). `country` is the NAME Shopify's documented
// shipping_rates example uses; `countryCode` is the retry when a store rejects the name.
export interface ProbeAddress {
  id: string;
  label: string;
  country: string;
  countryCode: string;
  province?: string;
  zip: string;
}

const au = (id: string, label: string, province: string, zip: string): ProbeAddress => ({ id, label, country: "Australia", countryCode: "AU", province, zip });

export const PROBE_ADDRESSES: Record<ProbeMarket, ProbeAddress[]> = {
  AU: [
    au("syd", "Sydney", "NSW", "2000"),
    au("mel", "Melbourne", "VIC", "3000"),
    au("bne", "Brisbane", "QLD", "4000"),
    au("adl", "Adelaide", "SA", "5000"),
    au("per", "Perth", "WA", "6000"),
    au("hba", "Hobart", "TAS", "7000"),
    au("drw", "Darwin", "NT", "0800"),
    au("cbr", "Canberra", "ACT", "2600"),
  ],
  // North Island (Auckland, Wellington) and South Island (Christchurch, Dunedin): NZ Post and the couriers price the islands apart.
  NZ: [
    { id: "akl", label: "Auckland", country: "New Zealand", countryCode: "NZ", province: "AUK", zip: "1010" },
    { id: "wlg", label: "Wellington", country: "New Zealand", countryCode: "NZ", province: "WGN", zip: "6011" },
    { id: "chc", label: "Christchurch", country: "New Zealand", countryCode: "NZ", province: "CAN", zip: "8011" },
    { id: "dud", label: "Dunedin", country: "New Zealand", countryCode: "NZ", province: "OTA", zip: "9016" },
  ],
  US: [
    { id: "ny", label: "New York", country: "United States", countryCode: "US", province: "NY", zip: "10001" },
    { id: "sf", label: "San Francisco", country: "United States", countryCode: "US", province: "CA", zip: "94103" },
    { id: "dal", label: "Dallas", country: "United States", countryCode: "US", province: "TX", zip: "75201" },
    { id: "chi", label: "Chicago", country: "United States", countryCode: "US", province: "IL", zip: "60601" },
  ],
  UK: [
    { id: "lon", label: "London", country: "United Kingdom", countryCode: "GB", zip: "SW1A 1AA" },
    { id: "man", label: "Manchester", country: "United Kingdom", countryCode: "GB", zip: "M1 1AE" },
    { id: "edi", label: "Edinburgh", country: "United Kingdom", countryCode: "GB", zip: "EH1 1YZ" },
    { id: "bfs", label: "Belfast", country: "United Kingdom", countryCode: "GB", zip: "BT1 1AA" },
  ],
  CA: [
    { id: "tor", label: "Toronto", country: "Canada", countryCode: "CA", province: "ON", zip: "M5V 2T6" },
    { id: "van", label: "Vancouver", country: "Canada", countryCode: "CA", province: "BC", zip: "V6B 1A1" },
    { id: "mtl", label: "Montreal", country: "Canada", countryCode: "CA", province: "QC", zip: "H2Y 1C6" },
    { id: "cgy", label: "Calgary", country: "Canada", countryCode: "CA", province: "AB", zip: "T2P 1J9" },
  ],
  SG: [{ id: "sg", label: "Singapore", country: "Singapore", countryCode: "SG", zip: "018989" }],
  // A eurozone store ships across borders at different rates; Spain needs a province at Shopify's checkout, the others do not.
  EU: [
    { id: "es", label: "Madrid", country: "Spain", countryCode: "ES", province: "M", zip: "28001" },
    { id: "de", label: "Berlin", country: "Germany", countryCode: "DE", zip: "10115" },
    { id: "fr", label: "Paris", country: "France", countryCode: "FR", zip: "75001" },
    { id: "nl", label: "Amsterdam", country: "Netherlands", countryCode: "NL", zip: "1012 AB" },
  ],
};

/** The shipping_rates.json query string for one address (no leading `?`). */
export function shippingAddressQuery(a: ProbeAddress, useCode = false): string {
  const p = new URLSearchParams();
  p.set("shipping_address[zip]", a.zip);
  p.set("shipping_address[country]", useCode ? a.countryCode : a.country);
  if (a.province) p.set("shipping_address[province]", a.province);
  return p.toString();
}

// ── What goes in a cart ─────────────────────────────────────────────────────
// One item a cart: a product page row is one item at its price. The ladder covers what decides the quote: the parcel (a pack, a
// bundle, a box) and the order value (free over $X). Rungs are in the market's currency, major units.
export const DEFAULT_LADDER = [40, 80, 150, 300] as const;

export interface Candidate {
  id: number; // Shopify variant id
  priceCents: number;
  title: string;
}

/**
 * The single items to quote: the cheapest candidate (a pack, usually), then for each rung the cheapest candidate priced at or over it
 * (at most 1.6× the rung, so a thin store's $1,200 case is not its "$80 order"). Each item once.
 */
export function planItems(candidates: readonly Candidate[], ladder: readonly number[] = DEFAULT_LADDER): Candidate[] {
  const asc = [...candidates].filter((c) => c.priceCents > 0).sort((a, b) => a.priceCents - b.priceCents || a.id - b.id);
  if (!asc.length) return [];
  const out: Candidate[] = [asc[0]];
  for (const rung of ladder) {
    const cents = Math.round(rung * 100);
    const hit = asc.find((c) => c.priceCents >= cents && c.priceCents <= cents * 1.6);
    if (hit && !out.some((o) => o.id === hit.id)) out.push(hit);
  }
  return out;
}

// Not a sealed product a shopper is posted: gift cards, event entries, digital or services.
const NOT_POSTED = /\bgift\s*cards?\b|\bvouchers?\b|\bentry\b|\btickets?\b|\bevent\b|\btournament\b|\bdigital\b|\bcode\s*card\b|\bmystery\b/i;

/** Whether a feed variant may go in a probe cart: in stock, priced, needs shipping, and a real product title. */
export function isCandidate(v: { productTitle: string; available: boolean; priceCents: number | null; requiresShipping?: boolean }): boolean {
  return !!v.available && (v.priceCents ?? 0) > 0 && v.requiresShipping !== false && !NOT_POSTED.test(v.productTitle);
}

// ── Reading rates ───────────────────────────────────────────────────────────
// Collected, not posted (local pickup, click & collect, local delivery): a $0 pickup "rate" is not free shipping, and local delivery
// exists only near the shop. Both are left out of every figure.
const PICKUP = /\bpick[- ]?up\b|\bpickup\b|click\s*(&|and|\+|n|'n')\s*collect|\bcollect(ion)?\b|\bin[- ]store\b|\blocal delivery\b|\bhand deliver|\babholung\b|\brecogida\b|\bretrait\b|\bafhalen\b/i;

export function isPickup(name: string): boolean {
  return PICKUP.test(name);
}

/** "2.00" / "2" / 2 → 200. Null for anything that is not a finite, non-negative amount. */
export function priceToCents(price: unknown): number | null {
  if (typeof price === "number") return Number.isFinite(price) && price >= 0 ? Math.round(price * 100) : null;
  if (typeof price !== "string") return null;
  const s = price.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export interface ProbeRate {
  name: string;
  cents: number;
  currency: string;
  pickup: boolean;
}

export type AddressOutcome = { status: "ok"; rates: ProbeRate[] } | { status: "empty"; rates: [] } | { status: "error"; rates: []; error: string };

/**
 * Shopify's shipping_rates.json body → rates. A 200 with `shipping_rates: []` is "empty" (the store does not ship there); a body with no
 * `shipping_rates` array is Shopify's validation error shape, e.g. {"zip":["is not valid for Australia"]}. A rate without a currency
 * takes the cart's.
 */
export function parseShippingRates(body: unknown, fallbackCurrency: string): AddressOutcome {
  if (!body || typeof body !== "object") return { status: "error", rates: [], error: "non-object response" };
  const raw = (body as { shipping_rates?: unknown }).shipping_rates;
  if (!Array.isArray(raw)) {
    const msg = Object.entries(body as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : JSON.stringify(v)}`)
      .join("; ");
    return { status: "error", rates: [], error: msg.slice(0, 300) || "no shipping_rates in response" };
  }
  const rates: ProbeRate[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const name = String(r?.presentment_name ?? r?.name ?? "").trim();
    const cents = priceToCents(r?.price);
    if (!name || cents == null) continue;
    const currency = typeof r.currency === "string" && r.currency ? r.currency : fallbackCurrency;
    rates.push({ name, cents, currency, pickup: isPickup(name) });
  }
  return rates.length ? { status: "ok", rates } : { status: "empty", rates: [] };
}

/** The cheapest rate a shopper pays to have it posted (pickup left out), in `currency` only. Null: none. */
export function cheapestPostage(outcome: AddressOutcome | undefined, currency: string): number | null {
  if (!outcome || outcome.status !== "ok") return null;
  let best: number | null = null;
  for (const r of outcome.rates) if (!r.pickup && r.currency === currency && (best == null || r.cents < best)) best = r.cents;
  return best;
}

// ── The committed snapshot (src/data/shipping-rates.json) ───────────────────
/** One measured item: its price (the cart subtotal the store reported) and the cheapest postage per address id (null: no rate there). */
export interface ShippingPoint {
  subtotalCents: number;
  rates: Record<string, number | null>;
}

export interface StoreShipping {
  market: ProbeMarket;
  currency: string;
  measuredAt: string;
  points: ShippingPoint[];
}

export interface ShippingSnapshot {
  version: 1;
  generatedAt: string | null;
  addresses: Partial<Record<ProbeMarket, { id: string; label: string }[]>>;
  stores: Record<string, StoreShipping>;
}

export const EMPTY_SNAPSHOT: ShippingSnapshot = { version: 1, generatedAt: null, addresses: {}, stores: {} };

/** Whether a store's measurement holds at least one rate (else it is left out and shows "Shipping at checkout"). */
export function hasRates(s: StoreShipping): boolean {
  return s.points.some((p) => Object.values(p.rates).some((c) => c != null));
}

/** A snapshot as read from disk, checked: anything malformed is dropped rather than shown. */
export function validSnapshot(raw: unknown): ShippingSnapshot {
  const r = raw as Partial<ShippingSnapshot> | null;
  if (!r || r.version !== 1 || typeof r.stores !== "object" || !r.stores) return EMPTY_SNAPSHOT;
  const stores: Record<string, StoreShipping> = {};
  for (const [key, s] of Object.entries(r.stores)) {
    if (!s || !PROBE_MARKETS.includes(s.market) || typeof s.currency !== "string" || !Array.isArray(s.points)) continue;
    const points = s.points.filter(
      (p) => p && Number.isInteger(p.subtotalCents) && p.subtotalCents > 0 && p.rates && Object.values(p.rates).every((c) => c === null || (Number.isInteger(c) && (c as number) >= 0)),
    );
    const clean = { ...s, points };
    if (hasRates(clean)) stores[key] = clean;
  }
  return { version: 1, generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : null, addresses: r.addresses ?? {}, stores };
}

/**
 * Merge this run's measurements onto the previous snapshot: a store measured now replaces its old entry; one this run could not measure
 * (rate-limited, down) keeps its previous measurement while it is under `maxAgeDays` old, then drops out (to "Shipping at checkout").
 */
export function mergeSnapshots(prev: ShippingSnapshot, fresh: Record<string, StoreShipping>, known: ReadonlySet<string>, now: Date, maxAgeDays = 42): ShippingSnapshot {
  const stores: Record<string, StoreShipping> = {};
  for (const [k, s] of Object.entries(prev.stores)) {
    if (!known.has(k)) continue; // a store no longer listed
    if (now.getTime() - Date.parse(s.measuredAt) <= maxAgeDays * 86_400_000) stores[k] = s;
  }
  for (const [k, s] of Object.entries(fresh)) if (hasRates(s)) stores[k] = s;
  const addresses: ShippingSnapshot["addresses"] = {};
  for (const m of PROBE_MARKETS) addresses[m] = PROBE_ADDRESSES[m].map((a) => ({ id: a.id, label: a.label }));
  const sorted = Object.fromEntries(Object.keys(stores).sort().map((k) => [k, stores[k]]));
  return { version: 1, generatedAt: now.toISOString(), addresses, stores: sorted };
}

// ── Politeness ──────────────────────────────────────────────────────────────
/** Wait before retrying a 429/5xx/network failure: Retry-After when given (capped at 90 s), else exponential from 3 s with jitter, ≤ 60 s. */
export function backoffMs(attempt: number, retryAfter: string | null | undefined, now = Date.now(), rand = Math.random): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(90_000, Math.max(1_000, secs * 1000));
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.min(90_000, Math.max(1_000, at - now));
  }
  return Math.round(Math.min(60_000, 3_000 * 2 ** attempt) * (1 + 0.25 * rand()));
}
