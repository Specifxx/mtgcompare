// What a store will REALLY charge to post an order — read from each store's own
// checkout (the snapshot in shipping-rates.json), not guessed.
//
// RiftCompare's lib/shipping.ts, ported 2026-10-03 for OP Compare's stores
// (lib/stores.ts). Why it exists there: on 2026-09-25 an Adelaide customer ran
// Best Basket, was shown $2 postage for a store and was quoted $20 at its
// checkout. The $2 was a hand-typed guess in RiftCompare's retailers.ts. The
// probe measured every tracked store the same day: at Obsession Gaming the only option is "Standard" $20.00, for one
// card or fifteen, to every capital, never free — the guess said $2 and "free
// over $50". The one-card guess was too low at 25 of the 27 AU stores measured
// (median real rate $8.00), and every guessed AU free-over threshold was wrong;
// the other markets were wrong the same way.
//
// ── The model ───────────────────────────────────────────────────────────────
// The probe measured a handful of real carts per store (1 card, 10 cards, and
// few-card carts at ~20/50/100/150 in the market currency, plus extra rungs
// around thresholds). For each cart and each group of addresses it recorded the
// cheapest non-letter rate ("std": tracked, or a name like "Standard" that does
// not say) and the cheapest untracked letter ("ltr"). A cart of any other size
// is priced from those points, always erring towards the DEARER answer:
//
//   * A letter / untracked option is only offered to a cart no bigger than the
//     biggest cart it was seen on — in value AND in card count. Stores drop the
//     letter as an order grows (Mana Market's $7 letter is gone at 10 cards,
//     Forbidden Planet's under £20); outside what was seen it is never quoted.
//     Where a SMALLER cart was quoted postage without the letter, the letter
//     also has a floor (Mecha Games: nothing but C$19.99 on a C$0.50 card,
//     the C$3.49 bubble mailer from C$5.00).
//   * A price is the dearest of: the nearest measured cart with at least as
//     many cards, the nearest with at least as much value, and the biggest
//     measured carts the order fully contains. Postage only rises with size
//     apart from free-shipping thresholds, so this never lands under what was
//     measured — and at a measured cart it IS the measured rate. A $0 cart
//     counts for an order only if it had at least as many cards and no more
//     value (a $0 a bigger-value cart got may be a threshold we could not pin).
//   * An order bigger than any measured cart is quoted at the dearest figure
//     that applies and flagged beyondMeasured — shown as "from". Where the
//     price was rising with card count, the optimiser also counts the step.
//   * Free postage needs a measured THRESHOLD: a cart that paid, then a bigger-
//     value cart with no more cards that went free, and every cart above free.
//     The order must reach the first free cart — a threshold between $90.98
//     (paid) and $100.98 (free) is applied from $100.98, never from a guessed
//     round number (nor a US-typical $35/$50/$75/$100: each store's own).
//   * Region: AU by state, the US by Census region or division, the others by
//     the probe's cities/countries. A region is priced from the address(es) we
//     measured for it; one that sits BETWEEN measured addresses (the South
//     Atlantic, between New York and Dallas) is priced at the dearer of them,
//     since a carrier-calculated rate rises with distance from wherever the
//     store posts from. When the buyer's region is not known the HIGHEST
//     regional figure is used and the quote says "up to"; "Elsewhere" (Alaska,
//     an unmeasured province or EU country) is priced the same way and says it
//     was not measured there — for Alaska, Hawaii, the territories and
//     Canada's remote provinces as a floor ("from"). The picker starts from
//     the visitor's geo headers (regionFromGeo).
//   * "Tracked only" rules out untracked letters; a store that only ever
//     quoted untracked postage is then left out, with that reason.
//   * A store the probe could not measure is charged the market's dearest
//     measured one-card tracked rate, flagged basis "estimate" and never shown
//     as measured. OP Compare has no per-store guesses at all (RiftCompare's
//     erred cheap almost everywhere), and an estimate must never be the reason
//     the optimiser picks a store. TCGplayer (US only: its cheapest listing,
//     many sellers, postage per seller) is always on the estimate.
//   * A store posting from another country (the Canadian stores listed in the
//     US market) says so: import duties or brokerage can be due on delivery.
//
// Pure: no database, no request state. The snapshot is a JSON import, so a page
// that uses this adds no query (see the egress rules at the top of lib/db.ts).

import SNAPSHOT_JSON from "./shipping-rates.json";
import { STORES } from "./stores";
import { currencyOf, normalizeCountry, type Country } from "./country";
import { formatMoney } from "./format-currency";
import type { ShippingSnapshot, SnapshotStore, SnapshotZone } from "./shipping-snapshot";

export const SHIPPING_SNAPSHOT = SNAPSHOT_JSON as unknown as ShippingSnapshot;

/** An EU member's ISO code (not "EU" itself): lib/country.ts maps these to the EU market. */
function isEuIso(v: string): boolean {
  const up = v.toUpperCase();
  return up !== "EU" && up !== "US" && normalizeCountry(up) === "EU";
}

// The basket's stores in every market: OP Compare's Shopify stores, plus
// TCGplayer in the US (its cheapest listing — a real buyable price — priced on
// the estimate: postage is each TCGplayer seller's own). eBay is never one.
export const TCGPLAYER_BASKET_KEY = "tcgplayer";
/** A listing source → the basket's store key: "store:cherry" → "cherry", "tcgplayer" → "tcgplayer", eBay → null (never in a basket). */
export function basketStoreKey(source: string): string | null {
  if (source.startsWith("store:")) return source.slice(6) || null;
  if (source === "tcgplayer") return TCGPLAYER_BASKET_KEY;
  return null;
}

interface BasketRetailer {
  key: string;
  name: string;
  country: Country;
  currency?: string;
}
const BASKET_RETAILERS: Record<string, BasketRetailer> = {
  ...Object.fromEntries(STORES.map((s) => [s.key, { key: s.key, name: s.name, country: s.country, currency: s.currency }])),
  [TCGPLAYER_BASKET_KEY]: { key: TCGPLAYER_BASKET_KEY, name: "TCGplayer", country: "US" },
};

// Whether a zone holds any quoted rate (the same test as shipping-snapshot.ts's
// zoneHasPoints, repeated so this module only TYPE-imports that one: it pulls
// in the probe's classifier, which no page needs).
const zoneHasPoints = (z: SnapshotZone): boolean => z.std.some(Boolean) || !!z.ltr?.some(Boolean);

// ── Regions ─────────────────────────────────────────────────────────────────
// `at` lists the probe address ids (lib/shipping-probe.ts PROBE_ADDRESSES) a
// region is priced from; with more than one, the DEARER of them. England is
// priced from London AND Manchester. The picker shows each region by name and
// says under it which address(es) it was priced to ("priced to New York, the
// one address we measured there"): a region is only ever as exact as the
// addresses behind it, and the copy must not claim more.
export interface ShippingRegion {
  key: string;
  label: string; // the region's own name: "Northeast", "South Australia", "Spain"
  phrase?: string; // how a sentence names it, when not the label: "the Northeast"
  at: string[];
  unmeasured?: true; // the "Elsewhere" choice: no address measured there
  remote?: true; // (Elsewhere) further than every measured address: the highest measured rate is a floor there
}

export const SHIPPING_REGIONS: Record<Country, ShippingRegion[]> = {
  AU: [
    { key: "NSW", label: "New South Wales", at: ["syd"] },
    { key: "VIC", label: "Victoria", at: ["mel"] },
    { key: "QLD", label: "Queensland", at: ["bne"] },
    { key: "SA", label: "South Australia", at: ["adl"] },
    { key: "WA", label: "Western Australia", at: ["per"] },
    { key: "TAS", label: "Tasmania", at: ["hba"] },
    { key: "NT", label: "Northern Territory", at: ["drw"] },
    { key: "ACT", label: "ACT", at: ["cbr"] },
  ],
  // The biggest market: a US buyer's state preselects its region
  // (regionFromGeo). The Census regions, split where a region reaches past the
  // one city measured in it: US carriers price by distance from the store, so a
  // state between two measured cities is priced at the DEARER of them — never
  // at one it may be further from. DC and Maryland were priced as Dallas: $3.30
  // under what One Stop TCG's checkout charges New York for a $55 card, the
  // Malik direction. Seattle is further than San Francisco from a West-coast
  // store (PokeBox USA: $7.51 to San Francisco, its cheapest city), and North
  // Dakota two zones further than Chicago from an East-coast one. A state
  // within about a zone of its city stays on it (Ohio or Alabama from a
  // West-coast store): the city either side would overprice the far bigger
  // population next to the measured address.
  US: [
    { key: "NE", label: "Northeast", phrase: "the Northeast", at: ["ny"] },
    { key: "SA", label: "South Atlantic", phrase: "the South Atlantic states", at: ["ny", "dal"] },
    { key: "MW", label: "Midwest", phrase: "the Midwest", at: ["chi"] },
    { key: "PL", label: "Plains", phrase: "the Plains states", at: ["chi", "dal"] },
    { key: "S", label: "South", phrase: "the South", at: ["dal"] },
    { key: "CAL", label: "California", phrase: "California", at: ["sf"] },
    { key: "MTW", label: "Mountain & Northwest", phrase: "the Mountain and Northwest states", at: ["sf", "dal"] },
  ],
  UK: [
    { key: "ENG", label: "England & Wales", at: ["lon", "man"] },
    { key: "SCT", label: "Scotland", at: ["edi"] },
    { key: "NIR", label: "Northern Ireland", at: ["bfs"] },
  ],
  CA: [
    { key: "ON", label: "Ontario", at: ["tor"] },
    { key: "QC", label: "Quebec", at: ["mtl"] },
    { key: "BC", label: "British Columbia", at: ["van"] },
    { key: "AB", label: "Alberta", at: ["cgy"] },
  ],
  EU: [
    { key: "ES", label: "Spain", at: ["es"] },
    { key: "DE", label: "Germany", at: ["de"] },
    { key: "FR", label: "France", at: ["fr"] },
    { key: "NL", label: "Netherlands", at: ["nl"] },
  ],
  SG: [{ key: "SG", label: "Singapore", at: ["sg"] }],
};

// Where the measured regions do not reach: Alaska, Hawaii and the territories;
// Canada's other six provinces and the territories; the 23 EU countries the
// probe never priced. Priced like an unknown region (the highest measured
// figure) and said to be unmeasured — never passed off as a rate for there.
// US and CA "Elsewhere" is REMOTE: further from every store than any address we
// measured (USPS prices Alaska and Hawaii above every lower-48 zone; several
// US stores' free or flat offers leave them out), so the figure is a floor and
// reads "from". Not the EU's: Elsewhere there can be cheaper (Belgium from a
// Dutch store). AU (all eight states and territories), the UK (all four
// nations) and SG are covered by their measured regions.
export const SHIPPING_ELSEWHERE: Partial<Record<Country, ShippingRegion>> = {
  US: { key: "OTHER", label: "Elsewhere in the US", phrase: "elsewhere in the US", at: [], unmeasured: true, remote: true },
  CA: { key: "OTHER", label: "Elsewhere in Canada", phrase: "elsewhere in Canada", at: [], unmeasured: true, remote: true },
  EU: { key: "OTHER", label: "Elsewhere in the EU", phrase: "elsewhere in the EU", at: [], unmeasured: true },
};

export function regionFor(market: Country, key: string | null | undefined): ShippingRegion | null {
  if (!key) return null;
  const el = SHIPPING_ELSEWHERE[market];
  if (el && el.key === key) return el;
  return SHIPPING_REGIONS[market]?.find((r) => r.key === key) ?? null;
}

/** The measured address labels behind a region ("New York"; "London and Manchester"). */
function placesOf(market: Country, region: ShippingRegion, snapshot: ShippingSnapshot): string[] {
  const addrs = snapshot.markets[market]?.addresses ?? [];
  return region.at.map((id) => addrs.find((a) => a.id === id)?.label).filter((x): x is string => !!x);
}

/** "A", "A and B", "A, B and C". */
export function joinPlaces(list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Every address the market's rates were measured to, as a phrase ("New York, San Francisco, Dallas and Chicago"). */
export function marketMeasuredPlaces(market: Country, snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT): string[] {
  return (snapshot.markets[market]?.addresses ?? []).map((a) => a.label);
}

/** How a region is named where it is not served: "Northeast (New York)", "Spain (Madrid)". */
function regionPlace(market: Country, region: ShippingRegion, snapshot: ShippingSnapshot): string {
  const places = placesOf(market, region, snapshot);
  if (!places.length || (places.length === 1 && places[0] === region.label)) return region.label;
  return `${region.label} (${joinPlaces(places)})`;
}

/** Why a store is left out for a region: "Quoted no postage to New York (measured, for the Northeast)". */
function notPostedTo(market: Country, region: ShippingRegion, snapshot: ShippingSnapshot): string {
  const places = placesOf(market, region, snapshot);
  if (!places.length || (places.length === 1 && places[0] === region.label)) return `Quoted no postage to ${region.label} (measured)`;
  return `Quoted no postage to ${joinPlaces(places)} (measured, for ${region.phrase ?? region.label})`;
}

export interface RegionOption {
  key: string;
  label: string; // the picker's text: the region's name only, short enough for a phone ("Northeast")
  phrase: string; // "the Northeast", "South Australia", "elsewhere in the US"
  pricedTo: string; // what the price is measured to, for the line under the picker
  unmeasured?: boolean;
}

/**
 * The delivery picker for one market, in order, ending with "Elsewhere
 * (not measured)" where the measured regions do not cover it. The labels are
 * names only: on a 360–390px phone the select is 264–294px wide, and "Northeast
 * (measured to New York)" was cut to "Northeast (measured to New Y" — the
 * qualifier is what went missing. What each region is priced to is `pricedTo`,
 * shown under the picker for the region chosen.
 */
export function regionOptionsFor(market: Country, snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT): RegionOption[] {
  const out: RegionOption[] = (SHIPPING_REGIONS[market] ?? []).map((r) => {
    const places = placesOf(market, r, snapshot);
    const same = places.length === 1 && places[0] === r.label;
    return {
      key: r.key,
      label: r.label,
      phrase: r.phrase ?? r.label,
      pricedTo: !places.length
        ? "not measured"
        : same
          ? `priced to ${places[0]}, the address we measured`
          : places.length === 1
            ? `priced to ${places[0]}, the one address we measured there`
            : `priced at the dearer of ${joinPlaces(places)}, the addresses we measured either side of it`,
    };
  });
  const el = SHIPPING_ELSEWHERE[market];
  if (el) {
    out.push({
      key: el.key,
      label: "Elsewhere (not measured)",
      phrase: el.phrase ?? el.label,
      pricedTo: el.remote
        ? "not measured — priced at the highest rate we measured, and delivery there usually costs more"
        : "not measured — priced at the highest rate we measured",
      unmeasured: true,
    });
  }
  return out;
}

// ── Geo preselection ────────────────────────────────────────────────────────
// Vercel's x-vercel-ip-country (ISO 3166-1) and x-vercel-ip-country-region
// (the ISO 3166-2 subdivision, without the country prefix: "CA" for
// California, "SA" for South Australia, "ON" for Ontario). Only a guess to
// start from: the buyer's own pick overrides it and is remembered.
const US_REGION_OF_STATE: Record<string, string> = {};
for (const [region, states] of Object.entries({
  NE: "CT ME MA NH RI VT NJ NY PA",
  SA: "DE DC MD VA WV NC SC GA FL",
  MW: "IL IN MI OH WI",
  PL: "IA KS MN MO NE ND SD",
  S: "AL KY MS TN AR LA OK TX",
  CAL: "CA",
  MTW: "WA OR ID MT WY NV UT CO AZ NM",
})) {
  for (const st of states.split(" ")) US_REGION_OF_STATE[st] = region;
}
// Alaska, Hawaii, the territories and military mail: far from any address we
// measured, and dearer to reach — never priced as "West".
const US_ELSEWHERE = new Set(["AK", "HI", "PR", "GU", "VI", "AS", "MP", "UM", "AA", "AE", "AP"]);
const CA_PROVINCES = new Set(["ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE", "YT", "NT", "NU"]);
const US_TERRITORY_COUNTRIES = new Set(["PR", "GU", "VI", "AS", "MP", "UM"]);

/**
 * The delivery region to preselect for a visitor, from Vercel's geo headers,
 * or null when they do not say (or the visitor is outside the market they are
 * browsing — a US visitor looking at AU stores gets no AU state).
 */
export function regionFromGeo(market: Country, ipCountry: string | null | undefined, ipRegion: string | null | undefined): string | null {
  const c = (ipCountry ?? "").trim().toUpperCase();
  const r = (ipRegion ?? "").trim().toUpperCase().replace(/^[A-Z]{2}-/, "");
  if (!c) return null;
  switch (market) {
    case "US":
      if (US_TERRITORY_COUNTRIES.has(c)) return "OTHER";
      if (c !== "US") return null;
      if (US_ELSEWHERE.has(r)) return "OTHER";
      return US_REGION_OF_STATE[r] ?? null;
    case "AU":
      if (c !== "AU") return null;
      return SHIPPING_REGIONS.AU.some((x) => x.key === r) ? r : null;
    case "CA":
      if (c !== "CA") return null;
      if (SHIPPING_REGIONS.CA.some((x) => x.key === r)) return r;
      return CA_PROVINCES.has(r) ? "OTHER" : null;
    case "UK":
      if (c !== "GB" && c !== "UK") return null;
      if (r === "ENG" || r === "WLS") return "ENG";
      if (r === "SCT") return "SCT";
      if (r === "NIR") return "NIR";
      return null;
    case "EU":
      if (SHIPPING_REGIONS.EU.some((x) => x.key === c)) return c;
      return isEuIso(c) ? "OTHER" : null;
    case "SG":
      return c === "SG" ? "SG" : null;
    default:
      return null;
  }
}

// ── Quotes ──────────────────────────────────────────────────────────────────
export interface PostageCart {
  subtotalCents: number;
  items: number; // physical cards in the order at this store
}

export interface PostageOptions {
  region?: string | null; // a SHIPPING_REGIONS / SHIPPING_ELSEWHERE key for the store's market; unknown → highest
  trackedOnly?: boolean; // never pick an untracked letter
}

export interface PostageOption {
  cents: number;
  label: string;
  tracked: boolean | null;
}

export interface PostageQuote {
  cents: number; // what the order is charged (0 = free)
  label: string; // the store's own rate name when measured
  tracked: boolean | null; // true: the name says tracked; false: untracked/letter; null: the name does not say
  basis: "measured" | "estimate";
  free: boolean;
  upTo: boolean; // region unknown and the figure differs by region: this is the highest
  otherOption?: PostageOption; // the letter a tracked-only quote skipped, or the other class beside a letter
  freeFromCents?: number; // the store's measured free-postage cart, when this order is below it
  beyondMeasured?: boolean; // bigger than any cart measured (more cards or more value): "from"
  riskCents?: number; // beyond the measured size, how much dearer postage was rising: the optimiser counts it, the quote does not
  minOrderCents?: number; // the store quotes no postage below this subtotal
  unavailable?: string; // the store does not post here — why
  notServed?: string[]; // (region unknown / elsewhere) regions the store does not post to
  unmeasuredRegion?: boolean; // the buyer picked "Elsewhere": this is the highest measured figure, not a rate for there
  atLeast?: boolean; // (with unmeasuredRegion) a REMOTE region — Alaska, Hawaii, Canada's north: the figure is a floor, "from"
  crossBorder?: string; // it posts from another country: what that can add
  measuredAt?: string; // YYYY-MM-DD
  note?: string;
}

interface Point {
  v: number;
  n: number;
  cents: number;
  name: string;
  tracked: boolean | null;
}

function pointsOf(store: SnapshotStore, zone: SnapshotZone, cls: "std" | "ltr"): Point[] {
  const series = cls === "std" ? zone.std : zone.ltr;
  if (!series) return [];
  const pts: Point[] = [];
  series.forEach((e, j) => {
    if (!e) return;
    const [v, n] = store.carts[j];
    pts.push({
      v,
      n,
      cents: e[0],
      name: store.names[e[1]] ?? "Postage",
      tracked: cls === "ltr" ? false : (e as [number, number, 0 | 1])[2] === 1 ? true : null,
    });
  });
  return pts;
}

/**
 * The smallest subtotal the zone's letter was quoted on, when a smaller cart
 * was quoted postage WITHOUT it — the letter has a floor, and an order under it
 * does not get the letter (Mecha Games: no letter on a C$0.50 card, only its
 * C$19.99 "Standard"; the C$3.49 bubble mailer from C$5.00). Null: no floor seen.
 */
function letterFloor(store: SnapshotStore, zone: SnapshotZone, lp: Point[]): number | null {
  if (!lp.length) return null;
  const minV = Math.min(...lp.map((p) => p.v));
  const refused = store.carts.some(([cv], j) => cv < minV && !!zone.std[j] && !zone.ltr?.[j]);
  return refused ? minV : null;
}

/**
 * The subtotal from which the points are free by a THRESHOLD, or null. It
 * needs a paid cart below it with no more cards (so a $0 that only a small
 * cart gets — Maine Phase's "Standard" $0 for 1–3 cards — is not read as
 * "free over $20"), and every cart from there up free.
 */
export function freeThreshold(points: readonly { v: number; n: number; cents: number }[]): number | null {
  const byV = [...points].sort((a, b) => a.v - b.v || a.n - b.n);
  let runStart = byV.length;
  while (runStart > 0 && byV[runStart - 1].cents === 0) runStart--;
  for (let k = runStart; k < byV.length; k++) {
    const p = byV[k];
    if (byV.slice(0, runStart).some((q) => q.cents > 0 && q.v < p.v && q.n <= p.n)) return p.v;
  }
  return null;
}

interface ClassResult {
  pt: Point;
  free: boolean;
  beyond: boolean;
  freeAt: number | null;
  riskCents: number;
}

function evalClass(points: Point[], cart: PostageCart, bounded: boolean): ClassResult | null {
  if (!points.length) return null;
  const v = Math.max(0, cart.subtotalCents);
  const n = Math.max(1, cart.items);
  const maxV = Math.max(...points.map((p) => p.v));
  const maxN = Math.max(...points.map((p) => p.n));
  // A letter is only offered inside what was seen.
  if (bounded && (v > maxV || n > maxN)) return null;
  let beyond = v > maxV || n > maxN;
  const freeAt = freeThreshold(points);
  if (freeAt != null && v >= freeAt) {
    const pt = points.filter((p) => p.v >= freeAt).sort((a, b) => a.v - b.v || a.n - b.n)[0];
    return { pt, free: true, beyond, freeAt, riskCents: 0 };
  }
  const below = freeAt == null ? points : points.filter((p) => p.v < freeAt);
  // A $0 cart is evidence for THIS order only if it had at least as many
  // cards and no more value. Maine Phase went $0 on a 5-card $150.75 cart
  // through its over-$100 threshold, and on 1–3 card carts through a small-
  // order rate — neither says anything about 5 cards at $10, which paid $6.35+
  // at 10 cards.
  let paid = below.filter((p) => p.cents > 0 || (p.n >= n && p.v <= v));
  if (!paid.length) {
    paid = [below.reduce((best, p) => (p.cents > best.cents ? p : best))];
    beyond = true;
  }
  // The carts the order contains — only the biggest of them (the frontier):
  // a cart that a bigger contained cart was measured cheaper than says
  // nothing more (Always Games: C$16.17 Expedited on small carts, C$10.00
  // "Standard" from C$50.85 / 5 cards — quoted C$10.00 there, not C$16.17).
  const inside = paid.filter((p) => p.v <= v && p.n <= n);
  const frontier = inside.filter((p) => !inside.some((q) => q !== p && q.v >= p.v && q.n >= p.n && (q.v > p.v || q.n > p.n)));
  const contained = [...frontier].sort((a, b) => b.cents - a.cents || b.v - a.v)[0];
  // A proxy the order itself contains is one of those smaller carts: it only
  // counts if it is on the frontier (Danireon's US$15.59 at US$50 / 2 cards
  // says nothing about its measured US$12.52 at US$151 / 2 cards).
  const outer = paid.filter((p) => p.v > v || p.n > n || frontier.includes(p));
  // Past the biggest card count (or value) measured, the nearest cart is the
  // biggest one: an order of 41 cards is at least what the 40-card cart paid,
  // whatever its value.
  const dearest = (ps: Point[]) => ps.sort((a, b) => b.cents - a.cents || a.v - b.v)[0];
  const topOf = (key: "n" | "v") => {
    const top = Math.max(...paid.map((p) => p[key]));
    return dearest(paid.filter((p) => p[key] === top));
  };
  const countProxy = n > maxN ? topOf("n") : outer.filter((p) => p.n >= n).sort((a, b) => a.n - b.n || a.v - b.v)[0];
  const valueProxy = v > maxV ? topOf("v") : outer.filter((p) => p.v >= v).sort((a, b) => a.v - b.v || a.n - b.n)[0];
  let cands = [valueProxy, countProxy, contained].filter((p): p is Point => !!p);
  if (!cands.length) cands = paid;
  const pt = cands.reduce((best, p) => (p.cents > best.cents ? p : best));
  // Beyond the biggest measured card count, a class whose price was already
  // RISING with card count (Card Hub $6 → $12 at 10 cards) keeps rising. The
  // quote stays the dearest measured figure (shown as "from"); the optimiser
  // adds the observed step per further block of cards so that piling a deck
  // onto such a store is not free.
  let riskCents = 0;
  if (n > maxN) {
    const minN = Math.min(...paid.map((p) => p.n));
    const lo = Math.max(...paid.filter((p) => p.n === minN).map((p) => p.cents));
    const hi = Math.max(...paid.filter((p) => p.n === maxN).map((p) => p.cents), -1);
    if (hi > lo && maxN > 0) riskCents = (hi - lo) * Math.ceil((n - maxN) / maxN);
  }
  return { pt, free: pt.cents === 0, beyond, freeAt, riskCents };
}

function storeCurrency(key: string): string | null {
  const r = BASKET_RETAILERS[key];
  if (!r) return null;
  return r.currency ?? currencyOf(r.country);
}

/** The smallest one-card cart a store was measured on (or its smallest cart). */
function oneCardCart(store: SnapshotStore): [number, number] {
  return store.carts.filter(([, n]) => n === 1).sort((a, b) => a[0] - b[0])[0] ?? store.carts[0];
}

// The dearest one-card TRACKED-only rate among a market's measured stores:
// what an unmeasured store is charged. RiftCompare's hand-typed guesses erred
// cheap at 25 of 27 AU and 35 of 39 US stores, so pricing an unmeasured store
// at a guess steered Best Basket towards it — the "$2 shown" failure again,
// labelled "est.". A store posting from another country is left out of the
// figure (an international rate is not what a domestic unmeasured store charges).
const CEILINGS = new WeakMap<ShippingSnapshot, Map<Country, number>>();
export function marketEstimateFloorCents(market: Country, snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT): number {
  let m = CEILINGS.get(snapshot);
  if (!m) {
    m = new Map();
    CEILINGS.set(snapshot, m);
  }
  const hit = m.get(market);
  if (hit != null) return hit;
  let top = 0;
  for (const [k, s] of Object.entries(snapshot.stores)) {
    if (s.market !== market || s.status !== "measured" || s.shipsFrom || !s.carts.length) continue;
    const cur = storeCurrency(k);
    if (cur && s.currency !== cur) continue;
    const [v] = oneCardCart(s);
    const q = measuredQuote(s, { subtotalCents: v, items: 1 }, { trackedOnly: true }, snapshot);
    if (q && !q.unavailable) top = Math.max(top, q.cents);
  }
  m.set(market, top);
  return top;
}

// Before a market has a single measured store (a fresh snapshot), the floor is
// this per-market fallback: a domestic tracked parcel at the dearer end of what
// RiftCompare measured for one card on 2026-09-25 (US$8, A$12, £5, S$6, C$15,
// €8), still flagged "est." and never shown as measured.
export const ESTIMATE_FALLBACK_CENTS: Record<Country, number> = { US: 800, AU: 1200, UK: 500, SG: 600, CA: 1500, EU: 800 };

function estimateCentsFor(key: string, snapshot: ShippingSnapshot): number {
  const market = BASKET_RETAILERS[key]?.country ?? "US";
  return marketEstimateFloorCents(market, snapshot) || ESTIMATE_FALLBACK_CENTS[market];
}

function estimateQuote(key: string, snapshot: ShippingSnapshot, note?: string): PostageQuote {
  return {
    cents: estimateCentsFor(key, snapshot),
    label: "Estimate — not measured",
    tracked: null,
    basis: "estimate",
    free: false,
    upTo: false,
    ...(note ? { note } : {}),
  };
}

function zoneQuote(store: SnapshotStore, zone: SnapshotZone, cart: PostageCart, opts: PostageOptions): PostageQuote {
  if (zone.none) {
    return { cents: 0, label: "No postage", tracked: null, basis: "measured", free: false, upTo: false, unavailable: "Quoted no postage here", measuredAt: store.measuredAt };
  }
  const sp = pointsOf(store, zone, "std");
  const lp = pointsOf(store, zone, "ltr");
  // Tracked-only and the store only ever quoted untracked postage here (GT
  // Games: "Economy (No Tracking)" and nothing else): not a store for this buyer.
  if (opts.trackedOnly && !sp.length) {
    return {
      cents: 0,
      label: "No tracked postage",
      tracked: null,
      basis: "measured",
      free: false,
      upTo: false,
      unavailable: "Offers only untracked postage (measured)",
      measuredAt: store.measuredAt,
    };
  }
  let std = evalClass(sp, cart, false);
  const floor = letterFloor(store, zone, lp);
  const ltr = floor != null && cart.subtotalCents < floor ? null : evalClass(lp, cart, true);
  let beyondFallback = false;
  if (!std && !ltr) {
    // The store only ever quoted letters here and this order is bigger than
    // any of them: the dearest letter seen, flagged.
    std = evalClass(lp, cart, false);
    beyondFallback = true;
    if (!std) return { cents: 0, label: "No postage", tracked: null, basis: "measured", free: false, upTo: false, unavailable: "Quoted no postage here" };
  }
  let chosen: ClassResult;
  let other: ClassResult | null = null;
  if (!std) chosen = ltr!;
  else if (!ltr) chosen = std;
  else if (opts.trackedOnly || std.pt.cents <= ltr.pt.cents) {
    chosen = std;
    if (ltr.pt.cents < std.pt.cents) other = ltr;
  } else {
    chosen = ltr;
    other = std;
  }
  const toOption = (r: ClassResult): PostageOption => ({ cents: r.free ? 0 : r.pt.cents, label: r.pt.name, tracked: r.pt.tracked });
  const q: PostageQuote = {
    cents: chosen.free ? 0 : chosen.pt.cents,
    label: chosen.pt.name,
    tracked: chosen.pt.tracked,
    basis: "measured",
    free: (chosen.free ? 0 : chosen.pt.cents) === 0,
    upTo: false,
    measuredAt: store.measuredAt,
  };
  if (other) q.otherOption = toOption(other);
  if (chosen.beyond || beyondFallback) q.beyondMeasured = true;
  if (chosen.riskCents > 0 && !q.free) q.riskCents = chosen.riskCents;
  // The nearest free-postage threshold this order could reach: the parcel's,
  // or — unless untracked is ruled out, and only for a card count the letter
  // was seen on — the letter's (Card Brawlers' letter is free from C$55; its
  // parcel only from C$150).
  const n = Math.max(1, cart.items);
  const ltrFreeAt = !opts.trackedOnly && lp.length && n <= Math.max(...lp.map((p) => p.n)) ? freeThreshold(lp) : null;
  const stdFreeAt = beyondFallback ? null : (std?.freeAt ?? null);
  const thresholds = [stdFreeAt, ltrFreeAt].filter((x): x is number => x != null);
  const threshold = thresholds.length ? Math.min(...thresholds) : null;
  if (!q.free && threshold != null && cart.subtotalCents < threshold) q.freeFromCents = threshold;
  // Free postage applied as a checkout discount the rates endpoint cannot see
  // (measured separately through the Storefront API — SHIPPING_OVERRIDES).
  if (store.freeFromCents) {
    if (cart.subtotalCents >= store.freeFromCents) {
      q.cents = 0;
      q.free = true;
      q.note = `free ${store.freeNote ?? "at checkout"}`;
      delete q.otherOption;
      delete q.freeFromCents;
      delete q.riskCents;
    } else if (!q.free) {
      q.freeFromCents = Math.min(q.freeFromCents ?? Infinity, store.freeFromCents);
    }
  }
  if (store.minOrderCents && cart.subtotalCents < store.minOrderCents) q.minOrderCents = store.minOrderCents;
  return q;
}

function regionQuote(
  store: SnapshotStore,
  region: ShippingRegion,
  cart: PostageCart,
  opts: PostageOptions,
  snapshot: ShippingSnapshot,
): PostageQuote | null {
  const quotes = region.at
    .map((id) => store.zones.find((z) => z.at.includes(id)))
    // A zone whose every quote errored was never measured: skip it, so the
    // region falls back to the highest regional figure instead of "does not post".
    .filter((z): z is SnapshotZone => !!z && (!!z.none || zoneHasPoints(z)))
    .map((z) => zoneQuote(store, z, cart, opts));
  if (!quotes.length) return null; // no zone measured for this region
  const served = quotes.filter((q) => !q.unavailable);
  if (!served.length) {
    const u = quotes[0].unavailable!;
    return {
      ...quotes[0],
      unavailable: u === "Quoted no postage here" ? notPostedTo(store.market, region, snapshot) : u,
    };
  }
  return served.reduce((best, q) => (q.cents > best.cents ? q : best));
}

// "Ships from Canada": a US buyer can owe import duties or a carrier's
// brokerage fee on delivery that no postage figure shows — unless the rate's
// own name says the duties are paid (Danireon's "UPS Worldwide Expedited
// Duties & Taxes Included").
const DUTIES_PAID = /\bdut(?:y|ies)\b[^()]*\b(?:included|covered|paid|prepaid)\b|\bDDP\b/i;
function crossBorderNote(store: SnapshotStore, label: string): string | undefined {
  if (!store.shipsFrom) return undefined;
  return DUTIES_PAID.test(label)
    ? `ships from ${store.shipsFrom}; this rate's name says duties are included`
    : `ships from ${store.shipsFrom}: import duties or a carrier's brokerage fee may be charged on delivery`;
}

/** A measured store's quote, or null when nothing it quoted is usable (every zone errored). */
function measuredQuote(store: SnapshotStore, cart: PostageCart, opts: PostageOptions, snapshot: ShippingSnapshot): PostageQuote | null {
  const withBorder = (q: PostageQuote): PostageQuote => {
    const cb = q.unavailable ? undefined : crossBorderNote(store, q.label);
    return cb ? { ...q, crossBorder: cb } : q;
  };
  const regions = SHIPPING_REGIONS[store.market] ?? [];
  const chosen = regionFor(store.market, opts.region);
  if (chosen && !chosen.unmeasured) {
    const q = regionQuote(store, chosen, cart, opts, snapshot);
    if (q) return withBorder(q);
  }
  // Region not known, not measured ("Elsewhere"), or not measured for this
  // store: the HIGHEST regional figure.
  const per = regions
    .map((r) => ({ r, q: regionQuote(store, r, cart, opts, snapshot) }))
    .filter((x): x is { r: ShippingRegion; q: PostageQuote } => !!x.q);
  if (!per.length) return null;
  const served = per.filter((x) => !x.q.unavailable);
  const notServed = per.filter((x) => x.q.unavailable).map((x) => regionPlace(store.market, x.r, snapshot));
  if (!served.length) {
    const reasons = [...new Set(per.map((x) => x.q.unavailable))];
    return {
      cents: 0,
      label: "No postage",
      tracked: null,
      basis: "measured",
      free: false,
      upTo: false,
      unavailable:
        reasons.length === 1 && !reasons[0]!.startsWith("Quoted no postage to ")
          ? reasons[0]!
          : (store.note ?? `Quoted no postage to any address we measured (${joinPlaces(marketMeasuredPlaces(store.market, snapshot))})`),
      measuredAt: store.measuredAt,
    };
  }
  const top = served.reduce((best, x) => (x.q.cents > best.q.cents ? x : best));
  // "Up to" says the figure is the dearest of the regions that WERE quoted; a
  // region with no rate at all is not a cheaper case of it, so it is reported
  // separately (notServed) and the plan warns about it.
  const differs = served.some((x) => x.q.cents !== top.q.cents);
  return withBorder({
    ...top.q,
    upTo: chosen?.unmeasured ? false : differs,
    ...(chosen?.unmeasured ? { unmeasuredRegion: true } : {}),
    ...(chosen?.remote ? { atLeast: true } : {}),
    ...(notServed.length ? { notServed } : {}),
  });
}

/**
 * The postage a store will charge for one order. See the header for the rules.
 * `snapshot` is injectable for tests and for the builder's change report.
 */
export function shippingFor(
  storeKey: string,
  cart: PostageCart,
  opts: PostageOptions = {},
  snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT,
): PostageQuote {
  const store = snapshot.stores[storeKey];
  const cur = storeCurrency(storeKey);
  if (!store || store.status === "unmeasured" || (cur && store.currency !== cur)) return estimateQuote(storeKey, snapshot, store?.note);
  if (store.status === "no-post") {
    return {
      cents: 0,
      label: "No postage",
      tracked: null,
      basis: "measured",
      free: false,
      upTo: false,
      unavailable: store.note ?? `Quoted no postage to any address we measured (${joinPlaces(marketMeasuredPlaces(store.market, snapshot))})`,
      measuredAt: store.measuredAt,
    };
  }
  return measuredQuote(store, cart, opts, snapshot) ?? estimateQuote(storeKey, snapshot, "Not measured: every quote errored");
}

// ── Display ─────────────────────────────────────────────────────────────────
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-25" → "25 Sep 2026" (fixed, locale-free: server and client agree). */
export function formatMeasuredDate(iso: string | undefined | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** The date the market's rates were measured, for footers. */
export function marketMeasuredAt(market: Country, snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT): string | null {
  return snapshot.markets[market]?.measuredAt || null;
}

/**
 * Whether a store's prices differ by address — by price, not by rate name (88
 * Games Arena calls the same $8 "3-5 Business Days" in Sydney and Melbourne and
 * "4-7" elsewhere), or because it does not post to some of them.
 */
export function storeIsZonePriced(store: SnapshotStore): boolean {
  const sig = (z: SnapshotZone) =>
    JSON.stringify([z.none ?? false, z.std.map((e) => e?.[0] ?? null), (z.ltr ?? []).map((e) => e?.[0] ?? null)]);
  return new Set(store.zones.map(sig)).size > 1;
}

/** Whether any measured store in the market prices by region (so a picker changes anything). */
export function marketHasZonePricing(market: Country, snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT): boolean {
  return Object.values(snapshot.stores).some((s) => s.market === market && s.status === "measured" && storeIsZonePriced(s));
}

export interface StoreShippingSummary {
  basis: "measured" | "estimate" | "no-post";
  currency: string;
  measuredAt?: string;
  note?: string;
  oneCardSubtotalCents?: number;
  std?: { minCents: number; maxCents: number; label: string; tracked: boolean | null };
  // fromValueCents: the letter was refused below this subtotal (a smaller cart got only the parcel).
  letter?: { minCents: number; maxCents: number; label: string; maxItems: number; maxValueCents: number; fromValueCents?: number };
  // letterFromCents: the untracked letter goes free from here (reported apart from the parcel's threshold).
  free?: { fromCents: number | null; paidAtCents: number | null; upToCents: number; note?: string; letterFromCents?: number | null };
  regions?: { label: string; cents: number | null; label2?: string }[]; // per region, one card (zone-priced stores only)
  notServed?: string[];
  minOrderCents?: number;
  estimateCents?: number;
  shipsFrom?: string;
}

/** The dearest threshold across the zones that have the class; null if any of them never went free. */
function zonesFreeFrom(store: SnapshotStore, cls: "std" | "ltr"): { fromCents: number | null; paidAtCents: number | null } {
  let fromCents: number | null = null;
  let paidAtCents: number | null = null;
  let seen = false;
  for (const z of store.zones) {
    if (z.none || !zoneHasPoints(z)) continue;
    const pts = pointsOf(store, z, cls);
    if (!pts.length) {
      if (cls === "std") return { fromCents: null, paidAtCents: null };
      continue;
    }
    seen = true;
    const at = freeThreshold(pts);
    if (at == null) return { fromCents: null, paidAtCents: null };
    fromCents = Math.max(fromCents ?? 0, at);
    const paid = pts.filter((p) => p.v < at && p.cents > 0).map((p) => p.v);
    if (paid.length) paidAtCents = Math.max(paidAtCents ?? 0, ...paid);
  }
  return seen ? { fromCents, paidAtCents } : { fromCents: null, paidAtCents: null };
}

/** Everything a store page needs to describe its postage, from the snapshot. */
export function shippingSummary(storeKey: string, snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT): StoreShippingSummary {
  const store = snapshot.stores[storeKey];
  const cur = storeCurrency(storeKey) ?? store?.currency ?? "USD";
  const unusable = !!store && store.status === "measured" && !store.zones.some((z) => !z.none && zoneHasPoints(z));
  if (!store || store.status === "unmeasured" || store.currency !== cur || unusable) {
    return { basis: "estimate", currency: cur, note: store?.note, estimateCents: estimateCentsFor(storeKey, snapshot) };
  }
  if (store.status === "no-post") return { basis: "no-post", currency: cur, note: store.note, measuredAt: store.measuredAt };

  const oneCard = oneCardCart(store);
  const cart = { subtotalCents: oneCard[0], items: 1 };
  const regions = SHIPPING_REGIONS[store.market] ?? [];
  const perRegion = regions.map((rg) => ({ rg, t: regionQuote(store, rg, cart, { trackedOnly: true }, snapshot) }));
  const served = perRegion.filter((x) => x.t && !x.t.unavailable) as { rg: ShippingRegion; t: PostageQuote }[];
  const notServed = perRegion.filter((x) => x.t?.unavailable && !/untracked/.test(x.t.unavailable)).map((x) => regionPlace(store.market, x.rg, snapshot));
  const out: StoreShippingSummary = { basis: "measured", currency: cur, measuredAt: store.measuredAt, oneCardSubtotalCents: oneCard[0] };
  if (store.note) out.note = store.note;
  if (store.shipsFrom) out.shipsFrom = store.shipsFrom;
  if (notServed.length) out.notServed = notServed;
  if (store.minOrderCents) out.minOrderCents = store.minOrderCents;
  if (served.length) {
    const cents = served.map((x) => x.t.cents);
    const top = served.reduce((b, x) => (x.t.cents > b.t.cents ? x : b));
    out.std = { minCents: Math.min(...cents), maxCents: Math.max(...cents), label: top.t.label, tracked: top.t.tracked };
    if (new Set(cents).size > 1) out.regions = served.map((x) => ({ label: x.rg.label, cents: x.t.cents, label2: x.t.label }));
  }
  // The letter, across the zones that offer one: its price on the smallest
  // order it is offered on, and the biggest cart it was seen on.
  const letters: { cents: number; label: string; maxItems: number; maxValueCents: number; fromValueCents: number | null }[] = [];
  for (const z of store.zones) {
    if (z.none) continue;
    const pts = pointsOf(store, z, "ltr");
    if (!pts.length) continue;
    const floor = letterFloor(store, z, pts);
    // Below its floor the letter is not offered at all (Mecha Games' C$3.49
    // bubble mailer: from C$5.00, never on the C$0.50 one-card cart).
    const at = floor != null && cart.subtotalCents < floor ? pts.filter((p) => p.v === floor).sort((a, b) => a.n - b.n)[0] : null;
    const one = evalClass(pts, at ? { subtotalCents: at.v, items: at.n } : cart, true);
    if (!one) continue;
    const cents = one.free ? 0 : one.pt.cents;
    // How far THAT price reaches: a store can swap a £1.55 2nd Class letter for
    // a £3.80 1st Class one as the order grows (Union County), and the note
    // must not stretch the cheap one over carts only the dearer one covered.
    const atPrice = pts.filter((p) => p.cents <= cents);
    letters.push({
      cents,
      label: one.pt.name,
      maxItems: Math.max(...atPrice.map((p) => p.n)),
      maxValueCents: Math.max(...atPrice.map((p) => p.v)),
      fromValueCents: floor,
    });
  }
  if (letters.length) {
    const top = letters.reduce((b, l) => (l.cents > b.cents ? l : b));
    const floors = letters.map((l) => l.fromValueCents).filter((x): x is number => x != null);
    out.letter = {
      minCents: Math.min(...letters.map((l) => l.cents)),
      maxCents: top.cents,
      label: top.label,
      maxItems: Math.min(...letters.map((l) => l.maxItems)),
      maxValueCents: Math.min(...letters.map((l) => l.maxValueCents)),
      ...(floors.length ? { fromValueCents: Math.max(...floors) } : {}),
    };
  }
  // Free postage: the dearest (latest) threshold across served zones; none if
  // any served zone never went free. The letter's is reported on its own.
  const upToCents = Math.max(...store.carts.map(([v]) => v));
  const std = zonesFreeFrom(store, "std");
  const ltr = out.letter ? zonesFreeFrom(store, "ltr") : { fromCents: null, paidAtCents: null };
  const letterFromCents = ltr.fromCents != null && (std.fromCents == null || ltr.fromCents < std.fromCents) ? ltr.fromCents : null;
  if (store.freeFromCents && (std.fromCents == null || store.freeFromCents < std.fromCents)) {
    out.free = { fromCents: store.freeFromCents, paidAtCents: null, upToCents, note: store.freeNote };
  } else {
    out.free = { fromCents: std.fromCents, paidAtCents: std.paidAtCents, upToCents, ...(letterFromCents != null ? { letterFromCents } : {}) };
  }
  return out;
}

/**
 * One line for a store card (/stores): measured facts with their date, or a
 * plainly labelled estimate. Never calls an estimate "measured".
 */
export function shippingNoteFor(storeKey: string, snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT): string {
  const s = shippingSummary(storeKey, snapshot);
  const m = (c: number) => formatMoney(c, s.currency);
  if (s.basis === "estimate") {
    return s.estimateCents != null ? `Postage not measured yet · est. ${m(s.estimateCents)} per order` : "Postage not measured yet";
  }
  if (s.basis === "no-post") return `No postage: ${s.note ?? "quoted none"}`;
  const parts: string[] = [];
  const price = (c: number) => (c === 0 ? "free" : m(c));
  if (s.std) {
    parts.push(
      s.std.minCents === s.std.maxCents
        ? `${s.std.label} ${s.std.maxCents === 0 ? "free for one card" : m(s.std.maxCents)}`
        : `${price(s.std.minCents)}–${m(s.std.maxCents)} by region (${s.std.label} ${m(s.std.maxCents)})`,
    );
  }
  if (s.letter && (!s.std || s.letter.minCents < s.std.minCents)) {
    const p = s.letter.minCents === s.letter.maxCents ? price(s.letter.maxCents) : `${price(s.letter.minCents)}–${m(s.letter.maxCents)}`;
    const from = s.letter.fromValueCents != null ? `from ${m(s.letter.fromValueCents)}, ` : "";
    parts.push(`untracked ${p} (${from}up to ${s.letter.maxItems} card${s.letter.maxItems === 1 ? "" : "s"}, ${m(s.letter.maxValueCents)})`);
  }
  if (s.free?.fromCents != null) parts.push(`free from ${m(s.free.fromCents)}`);
  if (s.free?.letterFromCents != null) parts.push(`free untracked from ${m(s.free.letterFromCents)}`);
  if (s.free && s.free.fromCents == null && s.free.letterFromCents == null && s.std && s.std.minCents > 0) {
    parts.push(`no free-postage threshold up to ${m(s.free.upToCents)}`);
  }
  if (s.notServed?.length) parts.push(`does not post to ${s.notServed.join(", ")}`);
  if (s.shipsFrom) parts.push(`ships from ${s.shipsFrom}`);
  return `${parts.join(" · ")} — measured ${formatMeasuredDate(s.measuredAt)}`;
}

// ── Request helpers (the Best Basket and replacement-cost routes) ───────────
/** A region key from a request, kept only if it belongs to the market. */
export function postageOptionsFrom(market: Country, region: unknown, trackedOnly: unknown): PostageOptions {
  const r = typeof region === "string" ? regionFor(market, region) : null;
  return { region: r?.key ?? null, trackedOnly: trackedOnly === true || trackedOnly === "1" || trackedOnly === "true" };
}

/** What a route tells the client about the delivery it priced. */
export function postageContextFor(market: Country, opts: PostageOptions, snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT) {
  const region = regionFor(market, opts.region);
  return {
    region: region?.key ?? null,
    regionLabel: region ? (region.phrase ?? region.label) : null,
    regionUnmeasured: !!region?.unmeasured,
    trackedOnly: !!opts.trackedOnly,
    measuredAt: formatMeasuredDate(marketMeasuredAt(market, snapshot)) || null,
    measuredTo: marketMeasuredPlaces(market, snapshot),
  };
}

/**
 * The subtotals at which a store's quote can change for a fixed card count:
 * the carts it was measured on, and its free-postage and minimum-order
 * overrides. shippingFor compares an order's subtotal with these values and
 * nothing else — every other figure it uses is the store's, the zone's or the
 * card count's — so two orders with the same card count that sit at the same
 * place among them (equal to the same one, or strictly between the same two)
 * get the same quote. A quote that starts depending on the subtotal any other
 * way must add that value here: tests/shipping.test.ts checks the memoised
 * basketStoresFor postage against shippingFor for every store in the snapshot.
 */
export function subtotalBreaks(storeKey: string, snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT): number[] {
  const s = snapshot.stores[storeKey];
  if (!s) return [];
  const at = new Set(s.carts.map(([v]) => v));
  if (s.freeFromCents) at.add(s.freeFromCents);
  if (s.minOrderCents) at.add(s.minOrderCents);
  return [...at].sort((a, b) => a - b);
}

/** Where a subtotal sits among sorted breaks: 2k+1 when it equals breaks[k], 2k when it is below breaks[k] and above breaks[k−1]. */
function breakSlot(breaks: readonly number[], v: number): number {
  let lo = 0;
  let hi = breaks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (breaks[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return 2 * lo + (lo < breaks.length && breaks[lo] === v ? 1 : 0);
}

/**
 * The optimiser's store map for one market: each store's name and its postage
 * function bound to the buyer's options, and — for a store that does not post
 * to them at all — why, so its listings are left out rather than priced.
 *
 * Each postage function remembers its answers for the life of the map (one
 * request): Best Basket's search prices tens of thousands of different
 * (subtotal, cards) orders per store, at ~5–45 µs a quote, and was spending
 * seconds of a 200-card list here. The answer is shippingFor's, looked up by
 * card count and the subtotal's place among subtotalBreaks() — the same quote
 * object for every order in that slot, so callers must not mutate it.
 */
export function basketStoresFor(
  market: Country,
  opts: PostageOptions,
  snapshot: ShippingSnapshot = SHIPPING_SNAPSHOT,
): Record<string, { name: string; postage: (cart: PostageCart) => PostageQuote; unavailable?: string }> {
  return Object.fromEntries(
    Object.values(BASKET_RETAILERS)
      .filter((r) => r.country === market)
      .map((r) => {
        const probe = shippingFor(r.key, { subtotalCents: 0, items: 1 }, opts, snapshot);
        const breaks = subtotalBreaks(r.key, snapshot);
        const seen = new Map<number, PostageQuote>();
        const postage = (cart: PostageCart): PostageQuote => {
          const n = cart.items;
          // Card counts past 2^20 (or not whole) are not remembered, only priced.
          if (!Number.isInteger(n) || n < 0 || n >= 1_048_576) return shippingFor(r.key, cart, opts, snapshot);
          const key = breakSlot(breaks, cart.subtotalCents) * 1_048_576 + n;
          let q = seen.get(key);
          if (!q) {
            q = shippingFor(r.key, cart, opts, snapshot);
            seen.set(key, q);
          }
          return q;
        };
        return [r.key, { name: r.name, postage, ...(probe.unavailable ? { unavailable: probe.unavailable } : {}) }];
      }),
  );
}
