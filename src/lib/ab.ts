// The quick view's A/B tests (2026-11-14, DECISIONS.md "A/B tests in the quick view"). Pure: no React, no network, so the tests check
// the dates, the 50/50 split, the keys and the read-out arithmetic.
//
// WHY THE QUICK VIEW ONLY. Over half of all buy clicks start there (7-13 Nov: 2,437 of 4,595), and it is drawn in the browser after a
// tap: it is in no page's server HTML. So a test there changes nothing a crawler reads (no cloaking, no second URL, no cookie on the
// server, no cache key) and needs one release. The product page's own table always draws the control.
//
// THREE TESTS, each an independent coin toss kept in the visitor's own browser (localStorage), 50/50:
//   order  US only (where TCGplayer's row is a real US$ offer). a: eBay's row first, TCGplayer's under it (as now).
//          b: TCGplayer's priced row first, eBay's under it. Both stay pinned above the stores; nothing else moves.
//   mini   DexCompare only (MTG Compare's quick view has no such pair: every visit here carries "-"). Phones only (below 640px). a: the small eBay + TCGplayer pair sits under the price rows (as now, since 2026-11-12).
//          b: it sits above them, as on a desktop.
//   cta    Everyone. a: TCGplayer's priced row's button says "View deal" (as now). b: it says "Buy now". Same button, same place.
// A visitor a test does not apply to carries "-" for it and is counted in neither arm.
//
// WHAT IS RECORDED (Vercel Web Analytics; two properties are kept per event and the API cannot cross two, so each event has ONE,
// `k` = "<region>:<order><mini><cta>", "us:ab-"): ab_seen once a visit when a quick view shows its prices, and on a buy click inside
// it ONE of ab_tcg, ab_ebay, ab_amazon, ab_store (the price rows) or ab_mini_tcg, ab_mini_ebay (the small pair), plus ab_paid for any
// link that pays (all of them but a store with no programme). Each is sent once a visit (its first click), so the read-out is a plain share: visits that clicked over
// visits that saw. Nothing about the visitor is sent. RiftCompare's earnings refresh reads them (its lib/earnings/ab-test.ts) and
// the Monday report and Empire HQ show them.
//
// FIXED DATES. Nothing is split or sent before START (the 19 Nov rechecks of the 12-13 Nov redesigns read an untouched site) or from
// END: everyone gets the control again, and the winner is shipped as an ordinary change.

export const AB_START = Date.parse("2026-11-20T00:00:00Z");
export const AB_END = Date.parse("2026-12-04T00:00:00Z");
/** The browser's key for a visitor's arms. A new round of tests takes a new key. */
export const AB_STORE = "ab1";
/** The visit's key for "ab_seen was sent". */
export const AB_SEEN = "ab1_seen";

export type Arm = "a" | "b";
export type Slot = Arm | "-";
export interface Arms {
  order: Arm;
  mini: Arm;
  cta: Arm;
}
export const CONTROL: Arms = { order: "a", mini: "a", cta: "a" };

export const abActive = (now: number): boolean => now >= AB_START && now < AB_END;

const isArm = (v: unknown): v is Arm => v === "a" || v === "b";

/** The arms a stored value holds, or null (nothing stored, or not ours). */
export function parseArms(raw: string | null): Arms | null {
  if (!raw || !/^[ab]{3}$/.test(raw)) return null;
  const [order, mini, cta] = raw.split("");
  return isArm(order) && isArm(mini) && isArm(cta) ? { order, mini, cta } : null;
}

export const armsString = (a: Arms): string => `${a.order}${a.mini}${a.cta}`;

/** Three fair coins from three random bytes (the low bit of each). */
export function tossArms(bytes: ArrayLike<number>): Arms {
  const coin = (i: number): Arm => ((bytes[i] ?? 0) & 1 ? "b" : "a");
  return { order: coin(0), mini: coin(1), cta: coin(2) };
}

/** What a visit is in: the arms that apply to it ("-" where a test does not), and the event key. */
export interface AbVisit {
  order: Slot;
  mini: Slot;
  cta: Slot;
  k: string;
}

/** The visit's slots: `order` only in the US, `mini` only on a phone. */
export function visitOf(arms: Arms, region: string, phone: boolean): AbVisit {
  const order: Slot = region === "us" ? arms.order : "-";
  const mini: Slot = phone ? arms.mini : "-";
  return { order, mini, cta: arms.cta, k: `${region}:${order}${mini}${arms.cta}` };
}

export type AbOutcome = "ab_tcg" | "ab_ebay" | "ab_amazon" | "ab_store" | "ab_mini_tcg" | "ab_mini_ebay";
/** Every event of the tests: ab_seen (the visits), ab_paid (visits with a click on any paid link), then one per kind of link. */
export const AB_EVENTS = ["ab_seen", "ab_paid", "ab_tcg", "ab_ebay", "ab_amazon", "ab_store", "ab_mini_tcg", "ab_mini_ebay"] as const;

/** The event a buy click inside the quick view sends, from what the link already knows about itself. */
export function outcomeOf(retailer: string, placement: string): AbOutcome {
  if (placement === "tcgplayer-strip-quickview") return "ab_mini_tcg";
  if (placement === "listings-quickview-mini") return "ab_mini_ebay";
  if (placement.startsWith("amazon") || /^amazon/i.test(retailer)) return "ab_amazon";
  if (/^ebay/i.test(retailer)) return "ab_ebay";
  if (/^tcgplayer/i.test(retailer)) return "ab_tcg";
  return "ab_store";
}

// ─── The read-out ─────────────────────────────────────────────────────────────
// The arithmetic of the read-out, kept here with the keys it reads (RiftCompare's reader carries a copy, pinned by its own test).

export type AbTest = "order" | "mini" | "cta";
const SLOT_AT: Record<AbTest, number> = { order: 0, mini: 1, cta: 2 };

/** A key's arm in a test: "a", "b" or null (the test did not apply, or not a key of ours). */
export function armOfKey(k: string, test: AbTest): Arm | null {
  const m = /^[a-z]{2}:([ab-]{3})$/.exec(k);
  const v = m?.[1][SLOT_AT[test]];
  return isArm(v) ? v : null;
}

/** Sum a `k` → count table into a test's two arms. */
export function splitByArm(counts: Record<string, number>, test: AbTest): { a: number; b: number } {
  const out = { a: 0, b: 0 };
  for (const [k, n] of Object.entries(counts)) {
    const arm = armOfKey(k, test);
    if (arm) out[arm] += n;
  }
  return out;
}

/** Two-proportion z-test (pooled), two-sided: b's rate against a's. p is exact to the normal approximation; null with an empty arm. */
export function compare(a: { hits: number; n: number }, b: { hits: number; n: number }): { rateA: number; rateB: number; lift: number | null; z: number; p: number } | null {
  if (a.n <= 0 || b.n <= 0) return null;
  const rateA = a.hits / a.n;
  const rateB = b.hits / b.n;
  const pool = (a.hits + b.hits) / (a.n + b.n);
  const se = Math.sqrt(pool * (1 - pool) * (1 / a.n + 1 / b.n));
  const z = se > 0 ? (rateB - rateA) / se : 0;
  return { rateA, rateB, lift: rateA > 0 ? rateB / rateA - 1 : null, z, p: 2 * (1 - normalCdf(Math.abs(z))) };
}

/** Φ(x), Abramowitz and Stegun 7.1.26 (error under 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}
