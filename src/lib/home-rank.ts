// HOME RANKING (owner, 2026-11-18: "the most popular items should be on the homepage in that order … the most likely items
// that will generate us a click and revenue and a purchase"; DECISIONS.md, "Home pages rank items by demand"). The SAME FILE in
// every Compare Empire repo: pure, no React, no network, no database.
//
// What it does: every home list (shelf, grid, deals, picks) is ordered by how likely an item is to earn, highest first.
//   demand  what visitors did with the item, from the site's own data/…/demand.json (RiftCompare's /api/demand/<site>, read
//           once a day by the data job): product page views and buy clicks, last 28 and last 7 days (a recent one counts twice).
//           A buy click weighs CLICK_WEIGHT views. Taken on a log scale, so a runaway item can't swallow the list.
//   value   what a click on it can earn, from the item's own facts: in stock and at how many stores, a paid row (eBay,
//           TCGplayer, Amazon) with a price, the price itself (commission is a share of it), a new release or open
//           pre-order, a price under its usual, a restock.
//   score = value × (1 + demand).
// Safe when data is thin: under MIN_SIGNAL views+clicks across a whole list, demand is left out and the order is value
// alone; equal scores keep the list's own order (a stable sort), so with no data at all the list is what it was.
// No feedback loop: one slot in every EXPLORE_EVERY (the 4th, 12th …) goes to the best item with NO demand yet, so a new
// item is seen before it can be clicked; the 7-day weight lets yesterday's leader fall when it stops being clicked.
// Off switch: NEXT_PUBLIC_HOME_RANK=off (or the caller's `enabled: false`) returns the list untouched.

export interface DemandFile {
  site?: string;
  status?: string;
  fetchedAt?: string;
  /** Product page path → [pageviews 28 days, 7 days]. */
  views?: Record<string, [number, number]>;
  /** Product key → [buy clicks 28 days, 7 days]. */
  clicks?: Record<string, [number, number]>;
}

export interface RankFacts {
  /** The item's product page path(s) as visitors see them ("/us/p/x"); any one region's page counts. */
  paths?: string[];
  /** A path suffix that matches the item's page in EVERY region ("/p/x"): cheaper than listing each region. */
  pathSuffix?: string;
  /** The item's key in buy_product clicks (its slug, usually). */
  clickKey?: string;
  priceCents?: number | null;
  /** Stores with it in stock now (marketplaces not counted). */
  inStock?: number;
  /** Buyable from a marketplace (TCGplayer) even with no store in stock. */
  marketplace?: boolean;
  /** Paid rows the item's page shows with a price (eBay listing, TCGplayer, Amazon). */
  paidRows?: number;
  releaseDate?: string | null;
  preorder?: boolean;
  /** How far under its usual price it sits now (0.18 = 18% under the median), when known. */
  dropPct?: number | null;
  restocked?: boolean;
}

export const CLICK_WEIGHT = 20;
export const MIN_SIGNAL = 30;
export const EXPLORE_EVERY = 8;
export const EXPLORE_SLOT = 3;

const DAY = 86400_000;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;

/** The off switch (NEXT_PUBLIC_HOME_RANK=off). */
export const homeRankOn = () => (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_HOME_RANK : undefined) !== "off";

/** Views and clicks for one item: [views, clicks], each 28-day count plus the 7-day count again (recent counts twice). */
export function demandOf(f: RankFacts, d: DemandFile | null | undefined): [number, number] {
  if (!d) return [0, 0];
  let views = 0;
  const seen = new Set<string>();
  const add = (p: string) => {
    if (seen.has(p)) return;
    seen.add(p);
    const v = d.views?.[p];
    if (v) views += (v[0] || 0) + (v[1] || 0);
  };
  for (const p of f.paths ?? []) add(p);
  if (f.pathSuffix && d.views) for (const p of Object.keys(d.views)) if (p.endsWith(f.pathSuffix)) add(p);
  const c = f.clickKey ? d.clicks?.[f.clickKey] : undefined;
  return [views, c ? (c[0] || 0) + (c[1] || 0) : 0];
}

/** What a click on the item can earn, from its own facts (1 = an ordinary in-stock item). Pure. */
export function valueOf(f: RankFacts, today: string): number {
  let v = 1;
  const stock = f.inStock ?? 0;
  // in stock at more stores: more chances one of them is the buyer's; nothing in stock and no marketplace: little to sell
  if (stock > 0) v *= 1 + Math.log2(1 + stock) / 4;
  else if (!f.marketplace && !f.preorder) v *= 0.35;
  // a paid row with a price is a click that earns
  v *= 1 + 0.2 * Math.min(3, Math.max(0, f.paidRows ?? 0));
  // commission is a share of the price: dearer earns more, on a soft curve (US$10 ≈ 0.75, US$100 ≈ 1, US$500 ≈ 1.15)
  const dollars = (f.priceCents ?? 0) / 100;
  if (dollars > 0) v *= 0.5 + 0.25 * Math.log10(1 + dollars);
  // new releases and open pre-orders are what people search for
  if (f.releaseDate) {
    const age = days(f.releaseDate, today);
    if (age < 0) v *= f.preorder !== false && -age <= 60 ? 1.3 : 1.05;
    else if (age <= 30) v *= 1.5;
    else if (age <= 90) v *= 1.25;
    else if (age > 730) v *= 0.85;
  } else if (f.preorder) v *= 1.3;
  if (f.dropPct && f.dropPct > 0) v *= 1 + Math.min(0.5, f.dropPct);
  if (f.restocked) v *= 1.15;
  return v;
}

export interface Ranked<T> {
  item: T;
  score: number;
  value: number;
  views: number;
  clicks: number;
  explore: boolean;
}

/**
 * The items, most likely to earn first, with the numbers behind each place (for a log or a test). Stable: equal scores keep the
 * input order. `enabled: false` (or the off switch) returns them as they came.
 */
export function rankHome<T>(
  items: readonly T[],
  facts: (t: T) => RankFacts,
  demand: DemandFile | null | undefined,
  o: { today?: string; enabled?: boolean; explore?: boolean } = {},
): Ranked<T>[] {
  const today = o.today ?? new Date().toISOString().slice(0, 10);
  const rows = items.map((item, i) => {
    const f = facts(item);
    const [views, clicks] = demandOf(f, demand);
    return { item, i, value: valueOf(f, today), views, clicks, score: 0, explore: false };
  });
  if (o.enabled === false || !homeRankOn()) return rows.map(({ i: _i, ...r }) => ({ ...r, score: r.value }));
  const signal = rows.reduce((n, r) => n + r.views + r.clicks * CLICK_WEIGHT, 0);
  const useDemand = signal >= MIN_SIGNAL;
  for (const r of rows) r.score = r.value * (1 + (useDemand ? Math.log1p(r.views + r.clicks * CLICK_WEIGHT) : 0));
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.i - b.i);
  if (!useDemand || o.explore === false || sorted.length <= EXPLORE_SLOT + 1) return sorted.map(({ i: _i, ...r }) => r);
  // exploration: the 4th slot (and every 8th after) goes to the best-valued item nobody has seen yet, if one is further down
  const fresh = sorted.filter((r) => r.views === 0 && r.clicks === 0).sort((a, b) => b.value - a.value || a.i - b.i);
  const out = [...sorted];
  for (let slot = EXPLORE_SLOT; slot < out.length && fresh.length; slot += EXPLORE_EVERY) {
    const pick = fresh.shift()!;
    const at = out.indexOf(pick);
    if (at <= slot) continue;
    out.splice(at, 1);
    out.splice(slot, 0, { ...pick, explore: true });
  }
  return out.map(({ i: _i, ...r }) => r);
}

/** Just the items, most likely to earn first. */
export const rankItems = <T,>(items: readonly T[], facts: (t: T) => RankFacts, demand: DemandFile | null | undefined, o?: { today?: string; enabled?: boolean; explore?: boolean }): T[] =>
  rankHome(items, facts, demand, o).map((r) => r.item);
