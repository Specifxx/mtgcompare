// The checked-in postage snapshot (src/lib/shipping-rates.json): its types, and
// the pure step that condenses one store's raw probe output into it.
//
// WHY A SNAPSHOT: an Adelaide customer ran Best Basket, was shown $2 postage
// for a store and was quoted $20 at its checkout (2026-09-25). Every postage
// figure until then was a hand-typed guess in RiftCompare's retailers.ts. The probe
// (scripts/probe-shipping-rates.ts) asks each store's own Shopify checkout what
// it charges for carts of several sizes at several addresses; this file turns
// that ~6 MB of raw output into a few tens of KB the site can import:
//
//   * the measured carts (subtotal, item count) — one list per store;
//   * per group of addresses that were quoted IDENTICALLY (a "zone"), for each
//     cart: the cheapest rate that is not an untracked letter ("std") and the
//     cheapest untracked/letter rate ("ltr"), each with the store's own name;
//   * which carts the store quoted nothing for there (a minimum order, or no
//     delivery to that address at all).
//
// What a cart of any other size costs is worked out at request time by
// lib/shipping.ts from those points, conservatively (see its header). Pickup,
// click & collect and local delivery are never in the snapshot — they are not
// postage. One currency per store, the one the store's carts were priced in;
// a rate in any other currency is dropped, never converted.
//
// Rebuild with `npx tsx scripts/build-shipping-rates.ts <probe output files>`;
// never hand-edit the JSON. Facts that the storefront endpoint cannot show
// (a checkout-only discount, a hand-checked minimum order, a pickup-only
// store) live in SHIPPING_OVERRIDES below, with the evidence for each.

import type { Country } from "./country";
import { classifyRate, type ProbeAddress, type ProbeScenarioResult } from "./shipping-probe";

/** [subtotalCents, items] — a cart the probe really built and read back. */
export type SnapshotCart = [number, number];
/** [cents, index into `names`, 1 = the name says tracked / 0 = it does not say]. */
export type StdEntry = [number, number, 0 | 1];
/** [cents, index into `names`] — an untracked letter / buyer's-risk option. */
export type LtrEntry = [number, number];

export interface SnapshotZone {
  at: string[]; // probe address ids quoted identically (PROBE_ADDRESSES[market][].id)
  std: (StdEntry | null)[]; // aligned with `carts`; null = no such rate quoted for that cart here
  ltr?: (LtrEntry | null)[]; // omitted when no untracked option was ever quoted here
  empty?: number[]; // cart indices the store quoted NO postage for at all here
  err?: number[]; // cart indices whose quote failed here (not measured, not "no postage")
  none?: true; // every measured cart came back empty: the store does not post here
}

export type SnapshotStatus = "measured" | "no-post" | "unmeasured";

export interface SnapshotStore {
  market: Country;
  currency: string;
  measuredAt: string; // YYYY-MM-DD
  status: SnapshotStatus;
  note?: string; // the reason behind a no-post / unmeasured status, or a caveat
  carts: SnapshotCart[];
  names: string[];
  zones: SnapshotZone[];
  minOrderCents?: number; // no postage quoted below this subtotal
  freeFromCents?: number; // free postage the rates endpoint cannot see (a checkout discount)
  freeNote?: string;
  shipsFrom?: string; // the country it posts from, when that is not the market's (import charges may apply)
}

export interface ShippingSnapshot {
  version: 1;
  note: string;
  markets: Partial<Record<Country, { measuredAt: string; addresses: { id: string; label: string }[] }>>;
  stores: Record<string, SnapshotStore>;
}

/** The slice of a probe run's per-store output this needs (see StoreOutput in the script). */
export interface ProbeStoreInput {
  key: string;
  market: Country;
  currency: string;
  measuredAt: string;
  addresses: ProbeAddress[];
  scenarios: ProbeScenarioResult[];
  error?: string;
}

export interface ShippingOverride {
  status?: Exclude<SnapshotStatus, "measured">;
  note?: string;
  minOrderCents?: number;
  freeFromCents?: number;
  freeNote?: string;
  shipsFrom?: string;
  // What the store's own rate DESCRIPTION (or policy) says about tracking, for
  // a rate whose name does not: keyed by the exact rate name. The rates
  // endpoint returns a description the probe does not keep.
  rateService?: Record<string, "tracked" | "untracked">;
  // Checkout rounds this store's converted rates UP (Shopify Markets rounding,
  // read from the Storefront API cart): "whole" — to the next whole unit;
  // "x.50" — to the next price ending in .50. /cart/shipping_rates.json
  // reports the unrounded conversion, so without this the snapshot sits up to
  // 99¢ under what the buyer is charged.
  checkoutRounding?: "whole" | "x.50";
}

/** A rate as the store's checkout charges it, after its currency rounding (0 stays free). */
export function roundAtCheckout(cents: number, rounding: ShippingOverride["checkoutRounding"]): number {
  if (!rounding || cents <= 0) return cents;
  if (rounding === "whole") return Math.ceil(cents / 100) * 100;
  return Math.ceil((cents - 50) / 100) * 100 + 50;
}

// Facts the probe cannot read from /cart/shipping_rates.json, each checked by
// hand on 2026-09-25 for RiftCompare and recorded in its probe runs' notes. A
// store's postage is the store's, whatever game is in the cart, so MTG Compare
// keeps the entries for the stores it also tracks (same key, same domain) and
// drops the rest (2026-10-03). A rebuild keeps them.
export const SHIPPING_OVERRIDES: Record<string, ShippingOverride> = {
  // ── Stores that do not post (at all, or to this market) ──
  evolutiontcg: { status: "no-post", note: "Collection from the store only (its site banner); no postage quoted to any UK address" },
  chonkycollectibles: { status: "no-post", note: "A Toronto store whose shipping policy ships to Canada only" },
  espercards: {
    status: "no-post",
    note: "Quoted no postage to any Canadian address we tried and publishes no shipping policy (pickup only, or rates only inside checkout)",
  },
  // Was "rates only inside checkout", on the estimate. It is not: its own
  // checkout said "Shipping not available — Your order cannot be shipped to the
  // selected address" for one card to New York, and /cart/shipping_rates.json
  // was [] to New York, its own zip 32601, Toronto, London and Sydney.
  punkouter: {
    status: "no-post",
    note: "Offered no postage to any address on 2026-09-25: not on the storefront, not through Shopify's cart API, and not in its own checkout ('Shipping not available'), although its policy promises USPS shipping",
  },
  // Was "rates only inside checkout", on the estimate. /meta.json: Katy TX,
  // ships_to_countries []; its shipping page offers local pickup in Houston.
  atomilicollectables: {
    status: "no-post",
    note: "Has no shipping zone at all (Shopify lists no ship-to countries): local pickup in Houston only",
  },
  // ── Stores listed in the US market that post from Canada (their Shopify
  danireon: {
    shipsFrom: "Canada", // Ottawa
    // Storefront API: US$16.00 at US$50 (endpoint 15.59), US$13.00 at US$151 (12.52).
    checkoutRounding: "whole",
    note: "Ships from Ottawa by UPS with US duties prepaid (its policy: US orders are pre-cleared, no extra fees); checkout rounds the US rate up to the whole dollar",
  },
  npcollectibles: {
    shipsFrom: "Canada", // Markham, Ontario
    // Storefront API: Standard International US$13.00 (endpoint 12.91), Express US$26.00 (25.16).
    checkoutRounding: "whole",
    note: "Ships from Markham, Ontario: flat US$12.91 (checkout rounds to US$13); no free US threshold (C$350 is Canada only); US duties and taxes are the buyer's",
  },
  hobbiesville: {
    shipsFrom: "Canada", // Ottawa
    // Storefront API: Express US$11.00 (endpoint 10.57), FedEx US$18.00 (17.67).
    checkoutRounding: "whole",
    note: "Ships from Ottawa: cheapest US option (US$10.57, checkout US$11) leaves duties to the buyer; FedEx with duties covered US$17.67; free from about US$126 (C$175)",
  },
  // ── Caveats on measured stores ──
  trextcg: { note: "An Italian store: quoted no postage to Spain, Germany, France or the Netherlands (Italy only, checked by hand)" },
  // Storefront API: 0 delivery groups for NYC 10001 and Albany 12207; Chicago Economy $10.00. Policy: $10, $20 oversized.
  grognardgames: { note: "Does not ship to New York State (NYC and Albany quoted nothing; NJ and MA $10); flat $10, $20 for oversized" },
  // ── Minimum orders, measured to the cent by hand (the probe's carts bracket them) ──
  dicesaloon: { minOrderCents: 500 }, // £4.50 got no rates, £5.00 got £3.50
  // ── Thresholds the probe's rungs only bracket, narrowed from the store's own words ──
  // Banner "FREE Shipping On Orders $75+ (48 States)"; no RiftCompare cart existed
  // between $73.00 (paid $9.00) and $80.50 (free). Its policy page's $150 is stale.
  knightandday: { freeFromCents: 7500, freeNote: "on orders of $75+ to the lower 48 (its site banner; a $73.00 cart still paid $9.00, $80.50 went free)" },
};

/** Whether a zone holds any quoted rate at all (not just errors / empties). */
export function zoneHasPoints(z: Pick<SnapshotZone, "std" | "ltr">): boolean {
  return z.std.some(Boolean) || !!z.ltr?.some(Boolean);
}

/**
 * One store's probe output → its snapshot entry. Rates are RE-classified from
 * their names with the current classifier (a probe file carries whatever the
 * classifier said on the day it ran).
 */
export function condenseStore(s: ProbeStoreInput, override: ShippingOverride = SHIPPING_OVERRIDES[s.key] ?? {}): SnapshotStore {
  const base = {
    market: s.market,
    currency: s.currency,
    measuredAt: (s.measuredAt || "").slice(0, 10),
  };
  const usable = s.scenarios
    .filter((x) => !x.error && !x.sameCartAs && x.items > 0 && x.cartCurrency === s.currency)
    .sort((a, b) => a.subtotalCents - b.subtotalCents || a.items - b.items);
  const extra = {
    ...(override.freeFromCents ? { freeFromCents: override.freeFromCents, freeNote: override.freeNote } : {}),
    ...(override.shipsFrom ? { shipsFrom: override.shipsFrom } : {}),
  };
  if (!usable.length) {
    return {
      ...base,
      status: override.status ?? "unmeasured",
      note: override.note ?? (s.error ? `Not measured: ${s.error}` : "Not measured"),
      carts: [],
      names: [],
      zones: [],
      ...extra,
    };
  }

  const names: string[] = [];
  const nameIdx = (n: string) => {
    const i = names.indexOf(n);
    return i >= 0 ? i : names.push(n) - 1;
  };
  const carts: SnapshotCart[] = usable.map((x) => [x.subtotalCents, x.items]);

  type Built = Omit<SnapshotZone, "at">;
  const perAddress: { id: string; z: Built }[] = s.addresses.map((a) => {
    const std: (StdEntry | null)[] = [];
    const ltr: (LtrEntry | null)[] = [];
    const empty: number[] = [];
    const err: number[] = [];
    usable.forEach((x, j) => {
      const out = x.byAddress[a.id];
      if (!out || out.status === "error") {
        err.push(j);
        std.push(null);
        ltr.push(null);
        return;
      }
      if (out.status === "empty") {
        empty.push(j);
        std.push(null);
        ltr.push(null);
        return;
      }
      let bestStd: { cents: number; name: string; tracked: boolean; express: boolean } | null = null;
      let bestLtr: { cents: number; name: string; express: boolean } | null = null;
      for (const r of out.rates) {
        if (r.currency !== s.currency) continue; // never mix currencies
        const c = classifyRate(r.name);
        if (c.pickup) continue; // collected, not posted
        const service = override.rateService?.[r.name] ?? c.service;
        const cents = roundAtCheckout(r.cents, override.checkoutRounding);
        if (service === "untracked") {
          if (!bestLtr || cents < bestLtr.cents || (cents === bestLtr.cents && bestLtr.express && !c.express)) {
            bestLtr = { cents, name: r.name, express: c.express };
          }
        } else {
          const tracked = service === "tracked";
          const better =
            !bestStd ||
            cents < bestStd.cents ||
            (cents === bestStd.cents && tracked && !bestStd.tracked) ||
            (cents === bestStd.cents && tracked === bestStd.tracked && bestStd.express && !c.express);
          if (better) bestStd = { cents, name: r.name, tracked, express: c.express };
        }
      }
      if (!bestStd && !bestLtr) {
        // Only pickup (or other-currency) rates: nothing posted for this cart here.
        empty.push(j);
        std.push(null);
        ltr.push(null);
        return;
      }
      std.push(bestStd ? [bestStd.cents, nameIdx(bestStd.name), bestStd.tracked ? 1 : 0] : null);
      ltr.push(bestLtr ? [bestLtr.cents, nameIdx(bestLtr.name)] : null);
    });
    const z: Built = { std };
    if (ltr.some(Boolean)) z.ltr = ltr;
    if (empty.length) z.empty = empty;
    if (err.length) z.err = err;
    if (empty.length && empty.length + err.length === usable.length) z.none = true;
    return { id: a.id, z };
  });

  // Addresses quoted identically collapse into one zone (every AU store: the
  // same price to all eight capitals).
  const zones: SnapshotZone[] = [];
  const sig = (z: Built) => JSON.stringify([z.std, z.ltr ?? null, z.empty ?? null, z.err ?? null, z.none ?? null]);
  for (const { id, z } of perAddress) {
    const hit = zones.find((zz) => sig(zz) === sig(z));
    if (hit) hit.at.push(id);
    else zones.push({ at: [id], ...z });
  }
  // A zone where every quote ERRORED (a 429-exhausted or capped run leaves the
  // addresses it never reached that way) was not measured: it is neither
  // served nor "does not post". A store with nothing but such zones is
  // unmeasured, never "no-post" — that would drop it from Best Basket on the
  // strength of a failed request.
  const served = zones.some((z) => !z.none && zoneHasPoints(z));
  const erroredOnly = zones.some((z) => !z.none && !zoneHasPoints(z));
  const status: SnapshotStatus = override.status ?? (served ? "measured" : erroredOnly ? "unmeasured" : "no-post");
  const note =
    override.note ??
    (served ? undefined : erroredOnly ? "Not measured: every quote errored" : "Quoted no postage to any address we measured");
  // A minimum order the carts reveal: the smallest carts quoted nothing where
  // bigger ones were quoted (Dice Saloon, 4elements). The probe's rungs only
  // bracket it, so the first cart that WAS quoted is the safe figure; a
  // hand-checked override narrows it.
  let detectedMin = 0;
  for (const z of zones) {
    if (z.none || !z.empty?.includes(0)) continue;
    const firstQuoted = carts.findIndex((_, j) => !z.empty!.includes(j) && !(z.err ?? []).includes(j));
    if (firstQuoted > 0) detectedMin = Math.max(detectedMin, carts[firstQuoted][0]);
  }
  const minOrder = override.minOrderCents ?? (detectedMin || undefined);
  return {
    ...base,
    status,
    ...(note ? { note } : {}),
    carts,
    names,
    zones,
    ...extra,
    ...(minOrder ? { minOrderCents: minOrder } : {}),
  };
}
