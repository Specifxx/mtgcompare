// Box worth: everything the set page and the ranking need, for one region. Server only.
import { BOX_ODDS, BOX_ODDS_BY_CODE } from "@/content/box-odds";
import { cardOpen } from "../compact";
import { productsBySet, type ProductCardData } from "../data";
import { money } from "../format";
import type { Market, RegionInfo } from "../regions";
import { SET_BY_CODE, SET_BY_SLUG, type MtgSet } from "../sets";
import { resolveSetBoxes } from "./load";
import { boxEv } from "./model";
import type { BoxView } from "./shared";
import type { BoxKind, SetOdds } from "./types";
import { boxView } from "./view";

export const BOX_TYPE: Record<BoxKind, string> = { play: "Play Booster Box", collector: "Collector Booster Box" };
/** The bulk floor the page opens on (and the ranking uses): cards under US$1 count as nothing. */
export const RANK_FLOOR = 100;

export const boxValueHref = (region: string, setSlug: string, kind?: BoxKind): string => `/${region}/box-value/${setSlug}${kind === "collector" ? "#collector" : ""}`;

/** The set's box-worth page exists: we have its odds and its card prices. */
export function hasBoxValue(code: string | null | undefined): boolean {
  return !!code && BOX_ODDS_BY_CODE.has(code);
}

/** The cheapest buyable box of a kind, in one market. */
export function cheapestBox(products: readonly ProductCardData[], kind: BoxKind): ProductCardData | null {
  let best: ProductCardData | null = null;
  for (const p of products) {
    if (p.productType !== BOX_TYPE[kind] || !cardOpen(p) || !p.lowestPriceCents) continue;
    if (!best || p.lowestPriceCents < (best.lowestPriceCents ?? Infinity)) best = p;
  }
  return best;
}

export interface BoxValuePage {
  set: MtgSet;
  odds: SetOdds;
  pricesAt: string;
  /** The card set file the cards come from: its price list is /card-prices/<group>. */
  group: string;
  boxes: BoxView[];
  prices: Partial<Record<BoxKind, { us: { cents: number; href: string; stores: number } | null; local: { text: string; href: string; place: string } | null }>>;
  /** Average box at the default floor, per kind (US cents): the metadata's numbers. */
  ev: Partial<Record<BoxKind, number>>;
}

export async function boxValuePage(r: RegionInfo, setSlug: string): Promise<BoxValuePage | null> {
  const set = SET_BY_SLUG.get(setSlug);
  const odds = set ? BOX_ODDS_BY_CODE.get(set.code) : undefined;
  if (!set || !odds) return null;
  const resolved = resolveSetBoxes(odds);
  if (!resolved) return null;
  const [us, local] = await Promise.all([productsBySet("US" as Market, set.code), r.market === "US" ? Promise.resolve(null) : productsBySet(r.market, set.code)]);
  const boxes: BoxView[] = [];
  const prices: BoxValuePage["prices"] = {};
  const ev: BoxValuePage["ev"] = {};
  for (const kind of ["play", "collector"] as const) {
    const b = resolved.boxes[kind];
    if (!b) continue;
    boxes.push(boxView(kind, b));
    ev[kind] = boxEv(b, RANK_FLOOR);
    const u = cheapestBox(us, kind);
    const l = local ? cheapestBox(local, kind) : null;
    prices[kind] = {
      us: u ? { cents: u.lowestPriceCents!, href: `/us/p/${u.slug}`, stores: u.inStockStores } : null,
      local: l ? { text: money(l.lowestPriceCents, r.market), href: `/${r.region}/p/${l.slug}`, place: r.inName } : null,
    };
  }
  if (!boxes.length) return null;
  return { set, odds, pricesAt: resolved.pricesAt, group: resolved.group, boxes, prices, ev };
}

export interface RankRow {
  set: MtgSet;
  kind: BoxKind;
  ev: number;
  /** US cents, or null when no US store has it. */
  price: number | null;
  /** ev / price. */
  ratio: number | null;
}

/** Every box we can value, best return first (boxes with no US price last, by value). */
export async function boxValueRanking(): Promise<RankRow[]> {
  const rows: RankRow[] = [];
  for (const odds of BOX_ODDS) {
    const set = SET_BY_CODE.get(odds.code);
    const resolved = set ? resolveSetBoxes(odds) : null;
    if (!set || !resolved) continue;
    const us = await productsBySet("US" as Market, set.code);
    for (const kind of ["play", "collector"] as const) {
      const b = resolved.boxes[kind];
      if (!b) continue;
      const evc = boxEv(b, RANK_FLOOR);
      const price = cheapestBox(us, kind)?.lowestPriceCents ?? null;
      rows.push({ set, kind, ev: evc, price, ratio: price ? evc / price : null });
    }
  }
  return rows.sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || b.ev - a.ev);
}
