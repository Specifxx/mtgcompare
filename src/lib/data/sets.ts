// owner: WP12
// src/lib/data/sets.ts: the section "sets.ts" of api.ts (contract 7.12). Set checklists, the upcoming sets, the set value stats and the Box EV pools. Every function reads PUBLISHED FILES through the PlaneSource of the
// request (pinned to one data commit) and nothing else: no database, no unstable_cache (kind P of contract 7.5). The names, arguments, result types and cache kinds are FROZEN (7.12).
import { PRICE_MASK, RELEASE_SET_KINDS, TREATMENT_BY_KEY, parseTreat, printingOf, treatmentLabel } from "../constants";
import { MARKET_INDEX, type Country } from "../country";
import { promoOutsideSet, type ChecklistCard } from "../set-scope";
import { getSets } from "./catalog";
import { miniFromBoard } from "./lite";
import type { BoardFile, BoardRow, MarketFile } from "./plane/formats";
import { optionalOf, planeSource } from "./plane/runtime";
import type { PlaneSource } from "./plane/source";
import { boardPath } from "./plane/shards";
import type { CardMini, SetLite } from "./types";

export const SET_CHECKLIST_CHUNK: 2000 = 2000;
/** A board is at most 6,000 rows (three chunks); a runaway `chunks` field never loops. */
const CHUNK_MAX = 4;

/** Every chunk of a set's board, in collector order. [] for a set with no board file (unpriced or unreleased). */
async function readBoard(src: PlaneSource, setId: number): Promise<BoardRow[]> {
  const first = await optionalOf<BoardFile>(src, boardPath(setId));
  if (!first) return [];
  const more = await Promise.all(Array.from({ length: Math.max(0, Math.min(first.chunks, CHUNK_MAX) - 1) }, (_, k) => optionalOf<BoardFile>(src, boardPath(setId, k + 1))));
  return [first, ...more].flatMap((f) => f?.c ?? []);
}

const z = <T>(v: T | 0 | "" | null | undefined): T | null => (v === 0 || v === "" || v == null ? null : v);

/**
 * P st/<setId>[-k].json in collector order. EVERY listed row of the set is a checklist card, THIN rows included (a set tracker is complete; a THIN page is noindex, not absent), and cards of class 0 only
 * (tokens, art cards and helpers are other checklists). minCents / stores are the HEADLINE unit's aggregate in `market` (TCGplayer counts in the US); eBay is not published, so `otherSource` is false.
 */
export async function getSetChecklist(setId: number, market: Country): Promise<ChecklistCard[]> {
  const { src } = await planeSource(), set = (await getSets()).find((s) => s.id === setId);
  if (!set) return [];
  const m = MARKET_INDEX[market] ?? 0;
  return (await readBoard(src, setId))
    .filter((r) => r[5] === 0 && (r[14] & PRICE_MASK.LISTED) !== 0)
    .map((r): ChecklistCard => {
      const treat = parseTreat(r[6]), lows = z(r[15]), counts = z(r[16]), low = lows?.[m] ?? null, stores = counts?.[m] ?? 0;
      return {
        id: r[0], slug: r[1], name: r[2], number: z(r[3]), variant: z(r[7]) ?? (treat.length ? treatmentLabel(treat) : null), printing: printingOf(treat), rarity: r[4] || null,
        setCode: (z(r[9]) ?? set.tok).toUpperCase(), hasImage: true, isPromo: promoOutsideSet(treat.filter((k) => TREATMENT_BY_KEY[k]), set.kind),
        minCents: low != null && low > 0 ? low : null, stores: low != null && low > 0 ? stores : 0, otherSource: false, thin: (r[14] & PRICE_MASK.THIN) !== 0,
      };
    });
}

/** Sets that have not released yet (a release date in the future), soonest first, derived from meta/sets.json. Only the kinds the release calendar shows (constants RELEASE_SET_KINDS: expansion, core, masters, Commander); promos and drops are not announcements. n defaults to 12. */
export async function getUpcomingSets(n = 12): Promise<SetLite[]> {
  const today = new Date().toISOString().slice(0, 10);
  return (await getSets())
    .filter((s) => s.releasedOn != null && s.releasedOn > today && RELEASE_SET_KINDS.includes(s.kind))
    .sort((a, b) => (a.releasedOn! < b.releasedOn! ? -1 : a.releasedOn! > b.releasedOn! ? 1 : a.id - b.id))
    .slice(0, Math.max(0, Math.floor(n)));
}

/** P mk/overview.json: per set, how many of the basket's cards it holds and their market total in cents. Empty when the file is absent. */
export async function getSetValueStats(): Promise<Map<number, { n: number; totalCents: number }>> {
  const { src } = await planeSource(), f = await optionalOf<MarketFile>(src, "mk/overview.json");
  return new Map((f?.sets ?? []).map(([setId, n, totalCents]) => [setId, { n, totalCents }] as const));
}

/** P st/<setId>.json: the listed singles of the set with their prices, for the Box EV pools (class 0, LISTED, every finish unit's headline). All chunks. */
export async function getBoxPools(setId: number): Promise<CardMini[]> {
  const { src } = await planeSource(), set = (await getSets()).find((s) => s.id === setId);
  if (!set) return [];
  return (await readBoard(src, setId)).filter((r) => r[5] === 0 && (r[14] & PRICE_MASK.LISTED) !== 0).map((r) => miniFromBoard(r, set));
}

/** REQ-WP09-1. P st/<setId>.json: the Foil MARKET (cents) of every listed class-0 single of the set, by product id; null when the product has no Foil row or its Foil has no market (a low-only unit is not a price). All chunks. */
export async function getBoxPoolsFoil(setId: number): Promise<Map<number, number | null>> {
  const { src } = await planeSource();
  return new Map((await readBoard(src, setId)).filter((r) => r[5] === 0 && (r[14] & PRICE_MASK.LISTED) !== 0).map((r) => [r[0], (r[14] & PRICE_MASK.HASF) !== 0 && r[11] != null && r[11] > 0 ? r[11] : null] as const));
}
