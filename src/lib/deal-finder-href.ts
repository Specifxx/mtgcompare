// Every link on /tools/deal-finder — the view tabs, the store picker's Apply,
// the sort tabs, the pager and the "Only my cards" chips — is built by
// hrefFor() below, from ONE parsed parameter set (ported from RiftCompare's
// lib/deal-finder-href.ts). Client-safe, so the store picker and the "only my
// cards" island build their URLs exactly as the server page does.
//
// A control can only drop a parameter by passing an explicit patch for it;
// everything else is carried from the current URL. canonical() is applied on
// the way IN (parse) and OUT (hrefFor), so a link always round-trips:
//
//   tcg      buy, sort, mine, page   (store picker, sort tabs, Only my cards)
//   vs-ebay  sort, mine, page        (no store picker: its store side is fixed)
//   ebay     page                    (free for everyone; no picker, sort or mine)
//
// "Only my cards" (Plus and Premium): "watch" is the watchlist (this browser's list
// plus the account's price alerts), "binder" is the account's collection (parity P29).
import type { DealSort } from "./deals";

export const DEAL_FINDER_PATH = "/tools/deal-finder";

export type MineFilter = "watch" | "binder";

export type DealFinderView = "tcg" | "ebay" | "vs-ebay";
export const DEAL_FINDER_VIEWS: readonly DealFinderView[] = ["tcg", "ebay", "vs-ebay"];

export interface DealFinderParams {
  view: DealFinderView;
  /** Explicit buy-side keys, or null when the URL has none (= the market's default). "tcg" only. */
  buy: string[] | null;
  sort: DealSort;
  page: number;
  /** Honoured only at full access (Plus and Premium) — parseDealFinderParams drops it otherwise. Not on "ebay". */
  mine: MineFilter | null;
}

type Param = string | string[] | undefined;
export type DealFinderSearchParams = { buy?: Param; sort?: Param; page?: Param; mine?: Param; view?: Param };
const one = (v: Param): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Pure: drop what the view does not use, so a URL never carries a dead parameter. */
function canonical(p: DealFinderParams): DealFinderParams {
  if (p.view === "ebay") return { view: "ebay", buy: null, sort: "saving", page: p.page, mine: null };
  if (p.view === "vs-ebay") return { ...p, buy: null };
  return p;
}

/** Pure: a raw ?view= value as a view. Unknown values land on the default. */
export function parseView(raw: string | undefined): DealFinderView {
  if (raw === "ebay" || raw === "deals") return "ebay";
  if (raw === "vs-ebay") return "vs-ebay";
  return "tcg";
}

/**
 * Parse the page's search params. `allowMine` is isPremium(user): a free or
 * signed-out visitor's ?mine= is ignored rather than honoured or refused.
 */
export function parseDealFinderParams(sp: DealFinderSearchParams, opts: { allowMine: boolean }): DealFinderParams {
  const raw = { buy: one(sp.buy), sort: one(sp.sort), page: one(sp.page), mine: one(sp.mine), view: one(sp.view) };
  const view = parseView(raw.view);
  // `buy=` (the explicit "None" selection) parses to [], which must NOT fall
  // back to the default list — only an absent param does.
  const buy: string[] | null = raw.buy !== undefined ? raw.buy.split(",").map((s) => s.trim()).filter(Boolean) : null;
  // "margin" is RiftCompare's pre-2026-09-25 value for "pct"; accepted for symmetry.
  const sort: DealSort = raw.sort === "pct" || raw.sort === "margin" ? "pct" : "saving";
  const page = Math.max(1, parseInt(raw.page ?? "1", 10) || 1);
  const mine: MineFilter | null = opts.allowMine && (raw.mine === "watch" || raw.mine === "binder") ? raw.mine : null;
  return canonical({ view, buy, sort, page, mine });
}

/**
 * The URL for the current parameters with `patch` applied. Defaults are left
 * out, so the canonical URL stays /tools/deal-finder. A control that changes
 * what the list contains (view, sources, sort, mine) should patch page: 1 too.
 */
export function hrefFor(params: DealFinderParams, patch: Partial<DealFinderParams> = {}): string {
  const p = canonical({ ...params, ...patch });
  const q: string[] = [];
  if (p.view !== "tcg") q.push(`view=${p.view}`);
  if (p.buy !== null) q.push(`buy=${p.buy.map(encodeURIComponent).join(",")}`);
  if (p.sort !== "saving") q.push(`sort=${p.sort}`);
  if (p.mine) q.push(`mine=${p.mine}`);
  if (p.page > 1) q.push(`page=${p.page}`);
  return q.length ? `${DEAL_FINDER_PATH}?${q.join("&")}` : DEAL_FINDER_PATH;
}
