// Pure helpers for scripts/probe-shipping-rates.ts — the measurement that
// gives Best Basket each store's REAL postage, read from its own checkout
// (RiftCompare's lib/shipping-probe.ts, ported for One Piece 2026-10-03: OP
// Compare never had postage guesses at all, so an unmeasured store is priced
// at its market's dearest measured one-card tracked rate, lib/shipping.ts).
//
// Why it exists (RiftCompare, 2026-09-25): an Adelaide customer ran Best
// Basket, was told a store's postage was $2, and was quoted $20 on the store's
// own site. Postage differs by zone, by order size, and the cheap "letter"
// option usually disappears once a cart holds more than a few cards.
//
// Shopify exposes the real quote to any shopper with a cart: POST
// /cart/add.js, then GET /cart/shipping_rates.json?shipping_address[...]. The
// script builds carts (1 card, 10 cards, a value ladder) and asks for rates at
// several addresses per market. This file holds everything about that which can
// be tested without the network: the addresses, the scenarios, which in-stock
// variants to put in a cart, how to read Shopify's rate payload, and how to
// classify a rate by its name.
//
// Nothing here imports the database or the importer (lib/store-import.ts pulls
// in the network helpers); the handle filters below are kept in step with
// store-import.ts SKIP_HANDLE by hand and say so.

export type ProbeMarket = "AU" | "US" | "UK" | "CA" | "EU" | "SG";
export const PROBE_MARKETS: readonly ProbeMarket[] = ["AU", "US", "UK", "CA", "EU", "SG"];

// ── Addresses ───────────────────────────────────────────────────────────────
// Representative, not exhaustive: one per zone a carrier is likely to price
// differently. AU is the one that matters most — Australia Post and every
// courier price by zone, and a Sydney/Melbourne quote says nothing about
// Adelaide, Perth or Darwin. `country` is the NAME Shopify's documented
// shipping_rates example uses ("Canada", "Australia"); `countryCode` is kept
// alongside for the output and for a retry if a store rejects the name.
export interface ProbeAddress {
  id: string;
  label: string;
  country: string;
  countryCode: string;
  province?: string;
  zip: string;
  city: string;
}

const au = (id: string, label: string, province: string, zip: string): ProbeAddress => ({
  id, label, country: "Australia", countryCode: "AU", province, zip, city: label,
});

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
  US: [
    { id: "ny", label: "New York", country: "United States", countryCode: "US", province: "NY", zip: "10001", city: "New York" },
    { id: "sf", label: "San Francisco", country: "United States", countryCode: "US", province: "CA", zip: "94103", city: "San Francisco" },
    { id: "dal", label: "Dallas", country: "United States", countryCode: "US", province: "TX", zip: "75201", city: "Dallas" },
    { id: "chi", label: "Chicago", country: "United States", countryCode: "US", province: "IL", zip: "60601", city: "Chicago" },
  ],
  UK: [
    { id: "lon", label: "London", country: "United Kingdom", countryCode: "GB", zip: "SW1A 1AA", city: "London" },
    { id: "man", label: "Manchester", country: "United Kingdom", countryCode: "GB", zip: "M1 1AE", city: "Manchester" },
    { id: "edi", label: "Edinburgh", country: "United Kingdom", countryCode: "GB", zip: "EH1 1YZ", city: "Edinburgh" },
    { id: "bfs", label: "Belfast", country: "United Kingdom", countryCode: "GB", zip: "BT1 1AA", city: "Belfast" },
  ],
  CA: [
    { id: "tor", label: "Toronto", country: "Canada", countryCode: "CA", province: "ON", zip: "M5V 2T6", city: "Toronto" },
    { id: "van", label: "Vancouver", country: "Canada", countryCode: "CA", province: "BC", zip: "V6B 1A1", city: "Vancouver" },
    { id: "mtl", label: "Montreal", country: "Canada", countryCode: "CA", province: "QC", zip: "H2Y 1C6", city: "Montreal" },
    { id: "cgy", label: "Calgary", country: "Canada", countryCode: "CA", province: "AB", zip: "T2P 1J9", city: "Calgary" },
  ],
  SG: [{ id: "sg", label: "Singapore", country: "Singapore", countryCode: "SG", zip: "018989", city: "Singapore" }],
  // The EU market is scraped as Spain (lib/country.ts EU_ANCHOR_ISO), but a
  // eurozone store ships across borders at different rates — which is exactly
  // what the €4.95 domestic placeholder hides. Spain needs a province at
  // Shopify's checkout; the others do not.
  EU: [
    { id: "es", label: "Madrid", country: "Spain", countryCode: "ES", province: "M", zip: "28001", city: "Madrid" },
    { id: "de", label: "Berlin", country: "Germany", countryCode: "DE", zip: "10115", city: "Berlin" },
    { id: "fr", label: "Paris", country: "France", countryCode: "FR", zip: "75001", city: "Paris" },
    { id: "nl", label: "Amsterdam", country: "Netherlands", countryCode: "NL", zip: "1012 AB", city: "Amsterdam" },
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

// ── Scenarios ───────────────────────────────────────────────────────────────
// COUNT scenarios hold value low and vary the number of cards (letter options
// are weight/thickness-limited); VALUE rungs hold the card count low and vary
// the subtotal (free-shipping thresholds, and "untracked only under $X" rules).
// Keeping the two axes apart is what lets the output say WHY an option vanished.
export type ScenarioSpec =
  | { id: string; kind: "count"; count: number }
  | { id: string; kind: "value"; targetCents: number };

export const DEFAULT_LADDER = [20, 50, 100, 150] as const;

export function scenarioSpecs(ladder: readonly number[] = DEFAULT_LADDER): ScenarioSpec[] {
  return [
    { id: "S1", kind: "count", count: 1 },
    { id: "S10", kind: "count", count: 10 },
    ...ladder.map((v): ScenarioSpec => ({ id: `V${v}`, kind: "value", targetCents: Math.round(v * 100) })),
  ];
}

// ── Choosing what goes in a cart ────────────────────────────────────────────
export interface CartCandidate {
  id: number; // Shopify variant id
  priceCents: number; // in the market's currency (products.json read with ?country=)
  title: string;
  tier: 0 | 1; // 0 = a plain single, 1 = a playset/lot (several physical cards)
}

export interface CartLine {
  id: number;
  quantity: number;
}

// Kept in step with the importer's multi-card rule (not imported: that module
// pulls in the network helpers). A playset is 3 physical cards, so it is a fallback here,
// never the "one card" of S1 when a real single exists.
const MULTI = /\b(playset|lot|lots|bundle|joblot|job lot|x\s*\d+|\d+\s*x|set of|complete set|full set|bulk)\b/i;
// Never in a probe cart: a slab or sealed product ships as a parcel whatever
// the store charges for a card, so it would measure the wrong thing.
const NOT_A_CARD = /\b(psa|bgs|cgc|beckett|graded|slab|booster|display|box|pack|sleeves?|playmats?|deck\s*box|binder|pre-?order|dice|tickets?|japanese|chinese|figure|plush)\b/i;
// The same, in the languages EU stores title accessories in (RiftCompare's
// first EU run put Spanish playmats and sleeves into its €20/€50/€100 rungs,
// and the cross-border quote rose with them).
const NOT_A_CARD_EU = /\b(tapetes?|fundas?|tappetin[oi]|bustine|spielmatten?|h(ü|ue)llen|tapis|protège-cartes)\b/i;
// A store's Magic collection can hold event entries next to its cards
// (Friday Night Magic, prerelease entries), which ship nothing. Tested against the
// product title alone.
const EVENT_LISTING = /^\s*events?\b|\b(entry\s*fee|tournament\s*entry)\b/i;
// Sealed products whose titles carry none of the words above (kept in step
// with lib/match.ts by hand): a theme, commander or challenger deck, an intro
// pack, a bundle, a fat pack, a tin, a Secret Lair drop, a prerelease kit. A
// title with a set code or collector number ("Lightning Bolt (M11) 149") or a
// condition is a single even so ("Sol Ring (C21) 263 - NM").
const SEALED_NAME = /(starter|theme|commander|challenger|planeswalker|duel)\s*decks?|intro\s*packs?|bundles?|fat\s*packs?|gift\s*(collection|box)|\btin\b|(event|pre-?release)\s*kits?|secret\s*lair|scene\s*box|uncut\s*sheet/i;
const SINGLE_TELL = /\([a-z0-9]{2,6}\)|\b\d{1,4}\/\d{1,4}\b|\b(nm|lp|mp|hp)\b|near\s*mint|lightly\s*played/i;

/**
 * Where a variant stands as a probe-cart candidate: 0 a plain single, 1 a
 * multi-card listing (fallback only), null never (not in stock, not a card,
 * no price, or does not ship).
 */
export function candidateTier(v: {
  productTitle: string;
  variantTitle?: string | null;
  available: boolean;
  priceCents: number;
  requiresShipping?: boolean;
}): 0 | 1 | null {
  if (!v.available || !(v.priceCents > 0) || v.requiresShipping === false) return null;
  const text = `${v.productTitle} ${v.variantTitle ?? ""}`;
  if (NOT_A_CARD.test(text) || NOT_A_CARD_EU.test(text) || EVENT_LISTING.test(v.productTitle)) return null;
  if (SEALED_NAME.test(text) && !SINGLE_TELL.test(text)) return null;
  return MULTI.test(text) ? 1 : 0;
}

const byTierThenPrice = (a: CartCandidate, b: CartCandidate) => a.tier - b.tier || a.priceCents - b.priceCents || a.id - b.id;

/**
 * The lines to add for one scenario (or for a top-up of one: pass the shortfall
 * as the count/target and the ids already tried in `exclude`).
 *
 * COUNT: the N cheapest singles, one of each (distinct variants, because the
 * public feed does not report stock depth and a single-copy listing is the
 * norm); playsets only when singles run out; quantities >1 only when every
 * distinct candidate is already used (Shopify caps an over-quantity add at
 * what is in stock — the caller reads the cart back and tops up).
 *
 * VALUE: few cards whose total is AT LEAST the target — greedy from the
 * dearest card that still fits, closing the gap with one card as soon as that
 * overshoots by no more than 10% of the target. "Free over $50" means a $50.00 cart qualifies, so a rung must not land
 * just under its target. Capped at `maxItems` cards; a store whose stock cannot
 * reach the target returns what it can and the result is recorded as short.
 *
 * The closing card may overshoot by at most `maxOvershootCents` (default half
 * the target, at least 5.00). Without that bound a thin store turned a $100
 * rung into a $1,261 cart on the first live run — Cherry's only card above
 * $12 was a $1,199 signature — which measures nothing about $100 orders.
 */
export function planCart(
  candidates: readonly CartCandidate[],
  spec: { kind: "count"; count: number } | { kind: "value"; targetCents: number },
  opts: { exclude?: ReadonlySet<number>; maxItems?: number; maxOvershootCents?: number } = {},
): CartLine[] {
  const maxItems = opts.maxItems ?? 40;
  const pool = candidates.filter((c) => !opts.exclude?.has(c.id)).sort(byTierThenPrice);
  if (!pool.length) return [];

  if (spec.kind === "count") {
    const want = Math.min(spec.count, maxItems);
    if (want <= 0) return [];
    const picked = pool.slice(0, want).map((c) => ({ id: c.id, quantity: 1 }));
    // Out of distinct variants: round-robin extra copies of the cheapest ones.
    for (let i = 0, n = picked.length; n < want; i = (i + 1) % picked.length, n++) picked[i].quantity++;
    return picked;
  }

  if (spec.targetCents <= 0) return [];
  // Singles first; fall back to playsets only if singles alone cannot reach it.
  const singles = pool.filter((c) => c.tier === 0);
  const sumOf = (xs: CartCandidate[]) => xs.reduce((s, c) => s + c.priceCents, 0);
  const source = sumOf(singles) >= spec.targetCents ? singles : pool;

  const asc = [...source].sort((a, b) => a.priceCents - b.priceCents || a.id - b.id);
  const taken = new Set<number>();
  // Close the gap with ONE card whenever that overshoots by little (10% of the
  // target): $40 + $15 is a better $50 rung than $40 + $9 + $0.99 + $0.99.
  const tolerance = Math.max(100, Math.round(spec.targetCents / 10));
  let remaining = spec.targetCents;
  while (remaining > 0 && taken.size < maxItems) {
    const closer = asc.find((c) => !taken.has(c.id) && c.priceCents >= remaining);
    if (closer && closer.priceCents - remaining <= tolerance) {
      taken.add(closer.id);
      remaining -= closer.priceCents;
      break;
    }
    // Otherwise the dearest card that still fits.
    let fit: CartCandidate | undefined;
    for (let i = asc.length - 1; i >= 0; i--) {
      if (!taken.has(asc[i].id) && asc[i].priceCents <= remaining) {
        fit = asc[i];
        break;
      }
    }
    if (!fit) break;
    taken.add(fit.id);
    remaining -= fit.priceCents;
  }
  if (remaining > 0 && taken.size < maxItems) {
    // Nothing unused fits under `remaining` any more, so the cheapest unused
    // card is the smallest overshoot that reaches the target — taken only if
    // the overshoot is bounded.
    const closer = asc.find((c) => !taken.has(c.id));
    const maxOvershoot = opts.maxOvershootCents ?? Math.max(500, Math.round(spec.targetCents / 2));
    if (closer && closer.priceCents - remaining <= maxOvershoot) taken.add(closer.id);
  }
  return source.filter((c) => taken.has(c.id)).map((c) => ({ id: c.id, quantity: 1 }));
}

// ── Reading and classifying rates ───────────────────────────────────────────
export type ServiceClass = "tracked" | "untracked" | "unknown";

export interface RateClass {
  service: ServiceClass;
  express: boolean;
  // Collected, not posted: local pickup, click & collect, local delivery. A $0
  // pickup "rate" is not free shipping, and a local-delivery rate only exists
  // near the shop — both are EXCLUDED from any postage figure (postageRates).
  pickup: boolean;
}

export interface ProbeRate extends RateClass {
  name: string;
  cents: number;
  currency: string;
  source?: string; // Shopify's "source": "shopify" for a manual rate table, else the carrier app
}

// Negated forms first: "untracked" and "non-tracked" both CONTAIN "tracked".
// The first CA run: Invasion Inc's "Small Bubble Mailer (This Option Does Not
// Come With Tracking or Insurance)" read as TRACKED on its "Tracking", and
// Boutique La Pioche's French "Enveloppe sans suivi" (envelope, no tracking)
// as unknown; "Accéléré" is Postes Canada's name for Expedited Parcel.
const UNTRACKED_EXPLICIT = /\bun-?tracked\b|\bnon[- ]?tracked\b|\bno[- ]tracking\b|\bwithout tracking\b|\bnot tracked\b|\bnot (?:come with |include |includes |have )?tracking\b|\bsans suivi\b/i;
// "Signed For" (Royal Mail) is a signature-on-delivery service, not a
// buyer's-risk letter: the first UK run read "1st Class Signed For - Letter"
// and "48 Signed Letter" as untracked on their "Letter".
const TRACKED_EXPLICIT = /\btracked\b|\btracking\b|\bsignature\b|\bregistered\b|\bsigned\b/i;
// USPS spells it "First-Class Mail" (hyphenated): a First-Class letter or
// flat has no tracking, while "First-Class Package" (renamed Ground Advantage
// in 2023) did. Unhyphenated, as most US stores type it, it matched before;
// hyphenated it read as "unknown" and a US$1 letter would have been priced as
// if it covered any order.
const UNTRACKED_HINT = /\bletter\b|lettermail|\bpwe\b|plain white envelope|\benvelope\b|\bstamp(ed)?\b|\b(normal|regular|ordinary|basic|economy) mail\b|\b(1st|2nd|first|second)[- ]class\b(?!.*\b(package|parcel)\b)/i;
// The first EU run's parcel services, in their own languages: PostNL's
// "Brievenbuspakje" (letterbox parcel, track & trace) and "Thuisbezorgd
// (verzekerd)" (home delivery, insured), Correos' "PAQ Premium" / "Paq Light
// Internacional". All read as unknown before. The run found no untracked
// letter option at any of the twelve EU stores.
const TRACKED_HINT_EU = /\bpaq\b|\bpaquete\b|\b(klein)?paket\b|\bpakket\b|brievenbuspakje|thuisbezorgd|\bverzekerd\b|\bpacco\b|\bcolis(simo)?\b/i;
const TRACKED_HINT = /\bparcel\b|\bpackage\b|\bstandard post\b|\bexpress\b|xpresspost|\bcourier\b|\bpriority\b|ground advantage|\bground\b|\bexpedited\b|\bups\b|\bfedex\b|\bdhl\b|\bstarshipit\b|\bsendle\b|\baramex\b|\bninja ?van\b|\bevri\b|\bhermes\b|\bdpd\b|\bparcelforce\b|\bcouriers please\b|\bstar ?track\b|\bpurolator\b|\bcanpar\b|\bj&t\b|\bacc[eé]l[eé]r[eé]|special delivery|\bsmartpac\b/i;
const EXPRESS = /\bexpress\b|xpresspost|\bnext[- ]?day\b|\bovernight\b|\bsame[- ]?day\b|special delivery|\bpriority\b|\b24\s*h(ou)?r?s?\b|\btracked\s*24\b|\b24\s*tracked\b/i;
const PICKUP = /\bpick[- ]?up\b|\bpickup\b|click\s*(&|and|\+|n|'n')\s*collect|\bcollect(ion)?\b|\bin[- ]store\b|\blocal delivery\b|\bhand deliver/i;

/**
 * Tracked vs untracked/letter by the rate's NAME — the only signal Shopify
 * gives. Precedence: an explicit "untracked" beats everything; an explicit
 * "tracked" beats "letter" ("Tracked Large Letter" is tracked); then letter
 * words mean untracked; then parcel/courier/express words mean tracked;
 * anything else is "unknown" rather than a guess.
 */
export function classifyRate(name: string): RateClass {
  const n = name.replace(/\s+/g, " ").trim();
  const pickup = PICKUP.test(n);
  const express = !pickup && EXPRESS.test(n);
  let service: ServiceClass = "unknown";
  if (UNTRACKED_EXPLICIT.test(n)) service = "untracked";
  else if (TRACKED_EXPLICIT.test(n)) service = "tracked";
  // An EXPRESS letter is a tracked service (Australia Post's Express Post
  // envelope, Royal Mail Special Delivery): the first AU run read Fluke &
  // Box's "AU Domestic Express Letter" as untracked on its "Letter".
  else if (express && UNTRACKED_HINT.test(n)) service = "tracked";
  else if (UNTRACKED_HINT.test(n)) service = "untracked";
  else if (TRACKED_HINT.test(n) || TRACKED_HINT_EU.test(n)) service = "tracked";
  return { service, express, pickup };
}

/** "2.00" / "2" / 2 → 200. Null for anything that is not a finite amount. */
export function priceToCents(price: unknown): number | null {
  if (typeof price === "number") return Number.isFinite(price) && price >= 0 ? Math.round(price * 100) : null;
  if (typeof price !== "string") return null;
  const s = price.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export type AddressOutcome =
  | { status: "ok"; rates: ProbeRate[] }
  | { status: "empty"; rates: [] }
  | { status: "error"; rates: []; error: string };

/**
 * Shopify's shipping_rates.json body → rates. A 200 with `shipping_rates: []`
 * is "empty" (the store does not ship this cart there — itself a finding); a
 * body with no `shipping_rates` array is Shopify's validation error shape, e.g.
 * {"zip":["is not valid for Australia"]} or {"country":["is not supported"]}.
 * A rate whose own currency is missing is stamped with `fallbackCurrency` (the
 * cart's), never silently mixed with another.
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
    const rate: ProbeRate = { name, cents, currency, ...classifyRate(name) };
    if (typeof r.source === "string" && r.source) rate.source = r.source;
    rates.push(rate);
  }
  return rates.length ? { status: "ok", rates } : { status: "empty", rates: [] };
}

/** Rates a shopper actually pays to have posted: pickup/local delivery removed, one currency only. */
export function postageRates(rates: readonly ProbeRate[], currency: string): ProbeRate[] {
  return rates.filter((r) => !r.pickup && r.currency === currency);
}

export function cheapestRate(rates: readonly ProbeRate[], currency: string, service?: ServiceClass): ProbeRate | null {
  let best: ProbeRate | null = null;
  for (const r of postageRates(rates, currency)) {
    if (service && r.service !== service) continue;
    if (!best || r.cents < best.cents) best = r;
  }
  return best;
}

// ── Summary ─────────────────────────────────────────────────────────────────
/** A line as the store's own /cart.js reported it — what was really measured. */
export interface ProbeCartLine {
  id: number;
  quantity: number;
  priceCents: number;
  title: string;
}

export interface ProbeScenarioResult {
  id: string;
  kind: "count" | "value";
  targetCents?: number;
  subtotalCents: number;
  items: number;
  cartCurrency: string;
  lines?: ProbeCartLine[];
  short?: boolean; // stock could not reach the scenario's count/target
  sameCartAs?: string; // identical cart to an earlier scenario — not re-queried
  error?: string;
  notes?: string[];
  byAddress: Record<string, AddressOutcome & { httpStatus?: number }>;
}

export interface AddressSummary {
  // S1: the cheapest postage for ONE card, and the cheapest tracked option.
  oneCardCents: number | null;
  oneCardName: string | null;
  oneCardTrackedCents: number | null;
  // Smallest measured subtotal at which a postage rate was $0, and the largest
  // measured subtotal below it that still paid — the threshold lies between.
  freeAtCents: number | null;
  paidAtCents: number | null;
  // Smallest measured cart (by subtotal) with no untracked option, when S1 had one.
  untrackedGoneAt: { scenario: string; subtotalCents: number; items: number } | null;
}

export interface StoreSummary {
  currency: string;
  byAddress: Record<string, AddressSummary>;
  // The cheapest postage, or the cheapest TRACKED postage, differs between
  // addresses in at least one measured cart — the Adelaide-vs-Sydney case. A
  // flat letter rate can sit on top of zone-priced parcels (Face to Face Games:
  // C$2.61 untracked everywhere, tracked C$8.74–16.13 by province), so checking
  // only the cheapest one-card rate would miss it.
  zonePriced: boolean;
  oneCardMinCents: number | null;
  oneCardMaxCents: number | null;
}

export function summarizeStore(
  scenarios: readonly ProbeScenarioResult[],
  addresses: readonly ProbeAddress[],
  currency: string,
): StoreSummary {
  const measured = scenarios.filter((s) => !s.error && !s.sameCartAs && s.items > 0 && s.cartCurrency === currency);
  const bySubtotal = [...measured].sort((a, b) => a.subtotalCents - b.subtotalCents);
  const s1 = measured.find((s) => s.id === "S1");
  const byAddress: Record<string, AddressSummary> = {};
  for (const a of addresses) {
    const s1Rates = s1?.byAddress[a.id]?.rates ?? [];
    const one = cheapestRate(s1Rates, currency);
    const oneTracked = cheapestRate(s1Rates, currency, "tracked");
    const hadUntracked = !!cheapestRate(s1Rates, currency, "untracked");
    let freeAtCents: number | null = null;
    let paidAtCents: number | null = null;
    let untrackedGoneAt: AddressSummary["untrackedGoneAt"] = null;
    for (const s of bySubtotal) {
      const out = s.byAddress[a.id];
      if (!out || out.status !== "ok") continue;
      const cheapest = cheapestRate(out.rates, currency);
      if (cheapest && cheapest.cents === 0) {
        if (freeAtCents == null) freeAtCents = s.subtotalCents;
      } else if (cheapest && freeAtCents == null) {
        paidAtCents = s.subtotalCents;
      }
      if (hadUntracked && !untrackedGoneAt && !cheapestRate(out.rates, currency, "untracked")) {
        untrackedGoneAt = { scenario: s.id, subtotalCents: s.subtotalCents, items: s.items };
      }
    }
    byAddress[a.id] = {
      oneCardCents: one?.cents ?? null,
      oneCardName: one?.name ?? null,
      oneCardTrackedCents: oneTracked?.cents ?? null,
      freeAtCents,
      paidAtCents,
      untrackedGoneAt,
    };
  }
  const ones = Object.values(byAddress).map((s) => s.oneCardCents).filter((c): c is number => c != null);
  const differs = (pick: (rates: ProbeRate[]) => ProbeRate | null) =>
    measured.some((s) => {
      const seen = new Set<number>();
      for (const a of addresses) {
        const out = s.byAddress[a.id];
        const r = out && out.status === "ok" ? pick(out.rates) : null;
        if (r) seen.add(r.cents);
      }
      return seen.size > 1;
    });
  return {
    currency,
    byAddress,
    zonePriced: differs((r) => cheapestRate(r, currency)) || differs((r) => cheapestRate(r, currency, "tracked")),
    oneCardMinCents: ones.length ? Math.min(...ones) : null,
    oneCardMaxCents: ones.length ? Math.max(...ones) : null,
  };
}

// ── Collection discovery (sitemap fallback) ─────────────────────────────────
// Kept in step with SKIP_HANDLE in lib/store-import.ts: a Magic handle that
// is not sealed/accessories and names no rival game.
const NON_SINGLE_HANDLE = /sealed|booster|box|bundle|preorder|pre-order|accessor|playmat|sleeve|merch|deck-?box|gift|case|tin|blister|collection-box|starter|theme-?deck|commander-?deck|secret-?lair|figure|anime|plush|poster|token|proxy/i;
const OTHER_TCG_HANDLE =
  /pokemon|riftbound|one-?piece|yu-?gi-?oh|flesh-?and-?blood|digimon|lorcana|gundam|dragon-?ball|weiss|star-?wars|sorcery|vanguard|metazoo|union-?arena/i;

export function isMagicSinglesHandle(h: string): boolean {
  return /magic|\bmtg\b/i.test(h) && !NON_SINGLE_HANDLE.test(h) && !OTHER_TCG_HANDLE.test(h) && !/\.(jpe?g|png|gif|webp|svg)$/i.test(h);
}

// ── Politeness ──────────────────────────────────────────────────────────────
/**
 * How long to wait before retrying a 429/5xx/network failure. Honours a
 * Retry-After header (seconds or an HTTP date) when present, capped at 90s;
 * otherwise exponential from 3s with up to 25% jitter, capped at 60s.
 */
export function backoffMs(attempt: number, retryAfter: string | null | undefined, now = Date.now(), rand = Math.random): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(90_000, Math.max(1_000, secs * 1000));
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.min(90_000, Math.max(1_000, at - now));
  }
  const base = Math.min(60_000, 3_000 * 2 ** attempt);
  return Math.round(base * (1 + 0.25 * rand()));
}
