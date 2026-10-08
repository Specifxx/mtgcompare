// owner: WP08
// src/lib/data/facets.ts: the section "facets.ts" of api.ts (contract 7.12). The counts behind the taxonomy hubs and the Magic keyword hubs. Kind M: both are derived once per
// data commit from the browse index and held in the instance memory (no unstable_cache, no database, nothing per user). The names, arguments, result types and cache kinds are FROZEN (7.12).
import { COLOR_BIT, PRICE_MASK, type ColorPage } from "../constants";
import { keywordLabel } from "../keywords";
import { getBrowseIndex } from "./catalog";
import { oracleFromRow, oracleMiniOf } from "./lite";
import type { OracleShard } from "./plane/formats";
import { indexById, memoByRef, memoKey, optionalOf, planeSource } from "./plane/runtime";
import { oracleShard } from "./plane/shards";
import type { CardQuery, OracleMini } from "./types";

export interface KeywordRow { slug: string; label: string; count: number }                         // count = oracles

/** A treatment hub is a page only while at least this many listed printings carry the treatment (embossed and silverfoil have none today): the sitemap lists the same set. */
export const TREATMENT_HUB_MIN = 1;
export const isIndexableTreatment = (printings: number): boolean => printings >= TREATMENT_HUB_MIN;

const { LISTED } = PRICE_MASK;

/** keyword slug -> oracle numbers that have it, most-played first (EDHREC rank ascending, unranked last, then ordinal). Only oracles with a LISTED class-0 printing count: the page lists cards a visitor can price. */
async function keywordTable(): Promise<Map<string, number[]>> {
  const c = await planeSource();
  return memoByRef("keyword-table", memoKey(c.ptr), async () => {
    const ix = await getBrowseIndex({ withStores: false, withOracle: true });
    const seen = new Set<number>();
    for (let i = 0; i < ix.n; i++) if ((ix.mk[i]! & LISTED) && ix.cls[i] === 0 && ix.or[i]) seen.add(ix.or[i]!);
    const rank = (no: number): number => { const e = ix.oEd[no] ?? -1; return e > 0 ? e : 1e9; };
    const out = new Map<string, number[]>();
    for (const no of [...seen].sort((a, b) => rank(a) - rank(b) || a - b)) {
      const s = ix.odict.keywords[ix.oKw[no] ?? 0] ?? "";
      for (const k of s.split(" ")) if (k) (out.get(k) ?? out.set(k, []).get(k)!).push(no);
    }
    return out;
  });
}
/** P ix/odict.json keyword dictionary + ix/o counts. Biggest first, then by label. */
export async function getKeywordIndex(): Promise<KeywordRow[]> {
  const t = await keywordTable();
  return [...t].map(([slug, nos]) => ({ slug, label: keywordLabel(slug), count: nos.length })).sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : 1));
}
export async function getKeywordPage(slug: string, page: number, per: 24 | 48 | 100 = 48): Promise<{ keyword: KeywordRow | null; total: number; items: OracleMini[] }> {
  const s = String(slug ?? "").toLowerCase(), nos = (await keywordTable()).get(s);
  if (!nos) return { keyword: null, total: 0, items: [] };
  const p = Math.max(1, Math.floor(Number(page)) || 1), want = nos.slice((p - 1) * per, p * per), keyword = { slug: s, label: keywordLabel(s), count: nos.length };
  const { src } = await planeSource(), by = new Map<string, number[]>();
  for (const no of want) (by.get(oracleShard(no)) ?? by.set(oracleShard(no), []).get(oracleShard(no))!).push(no);
  const found = new Map<number, OracleMini>();
  await Promise.all([...by].map(async ([h, ns]) => {
    const f = await optionalOf<OracleShard>(src, `or/${h}.json`); if (!f) return;
    const idx = indexById(f, f.o); for (const no of ns) { const r = idx.get(no); if (r) found.set(no, oracleMiniOf(oracleFromRow(r))); }
  }));
  return { keyword, total: nos.length, items: want.map((no) => found.get(no)).filter((o): o is OracleMini => !!o) };
}
/** M engine, one pass, LISTED class 0: printings per rarity letter, primary type, treatment key and colour letter (W U B R G, C = colourless with an oracle). */
export async function getFacetCounts(): Promise<{ rarity: Record<string, number>; type: Record<string, number>; treat: Record<string, number>; color: Record<string, number> }> {
  const c = await planeSource();
  return memoByRef("facet-counts", memoKey(c.ptr), async () => (await getBrowseIndex({ withStores: false, withOracle: false })).facetCounts());
}

/** The colour filter of a /colors/[color] page. A mono-colour page is EXACTLY that colour (a gold card is on /colors/multicolor only, so the seven counts add up); colorless is no colour. Pure. */
export function colorPageQuery(page: ColorPage): NonNullable<CardQuery["colors"]> {
  if (page === "colorless") return { mask: 0, mode: "colorless" };
  if (page === "multicolor") return { mask: 31, mode: "multi" };
  return { mask: COLOR_BIT[page === "white" ? "W" : page === "blue" ? "U" : page === "black" ? "B" : page === "red" ? "R" : "G"], mode: "exact" };
}

/** The index rule of the oracle hub /cards/name/[oracleSlug] (contract 7.7): at least two LISTED class-0 printings and at least one of them is not THIN. `items` is the first page of getOraclePrintings (market first, so a
 *  non-thin printing is on it whenever one exists with a price); the sitemap applies the same rule to the oracle's nPrint. Pure. */
export function isIndexableOracleHub(listed: number, items: readonly { thin: boolean }[]): boolean {
  return listed >= 2 && items.some((c) => !c.thin);
}
