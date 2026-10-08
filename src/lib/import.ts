// src/lib/import.ts (owner WP01b, FROZEN): the row types of the importer's in-memory MODEL, the context, and the stage functions that other packages call or are called by. Contract section 6.
// WHAT CHANGED against OP's import.ts (a 530-line module that wrote nine tables): the importer reads NOTHING from Neon and writes NOTHING to it but one courtesy ImportRun row. Its memory of last time is a PrevState (plane/prevstate.ts) rebuilt from a depth-1 checkout of the
// pointed data commit; its output is a tree of JSON files (plane/formats.ts) handed to the publisher (plane/publisher.ts) that validates, commits, verifies and points. The stage NAMES survive (importCatalog, aggregate, recordHistory, revalidateSite) so scripts/import.ts reads as before.
import type { Country } from "./country";
import type { Finish, Rarity, SealedKind, SetKind, TreatmentKey, UnitRef } from "./constants";
import type { TrackConfig } from "./track";
import type { LinkLevel, ScryfallRow } from "./scryfall";
import type { MatchRow } from "./match";
import type { StoreResult } from "./stores";
import type { PrevState } from "./data/plane/prevstate";
import type { MutableTree } from "./data/plane/tree";
import type { Phase } from "./data/plane/validate";
import type { PointerFile } from "./data/plane/formats";

// ── the model: one row per catalogue object, in memory (never a table). The writers of plane/formats.ts turn them into files. ─────────────────────────────────────────────────
export interface SetRow { id: number; slug: string; tok: string; code: string; name: string; tcgName: string; kind: SetKind; releasedOn: string | null; bucket: boolean; scry: string | null }
export interface OracleRow { no: number; scryfallId: string; slug: string; name: string; nameKey: string; manaCost: string; manaValue: number; typeLine: string; colors: number; identity: number; legal: string; edhrecRank: number | null; flags: number; layout: string; pt: string | null; loyalty: string | null; oracleText: string | null; keywords: string; faces: number; nPrint: number }
export interface CardRow { id: number; slug: string; name: string; alt: string | null; tcgName: string; setId: number; sc: string | null; number: string | null; tn: string | null; fnum: string | null; nkey: string | null; nsort: number; rarity: Rarity; cls: number; treat: string; label: string | null; flags: number; link: number; oracleNo: number | null; scryId: string | null; rootId: number | null; colors: number; mv: number; ptype: number }
export interface CardPriceRow { cardId: number; marketN: number | null; marketF: number | null; lowN: number | null; lowF: number | null; mask: number }
export interface SealedModelRow { id: number; slug: string; name: string; setId: number | null; kind: SealedKind; packCount: number | null; releasedOn: string | null; presale: boolean; marketUsd: number | null; lowTcg: number | null; contents: string | null; gone: boolean }
/** One per catalogue product after the join. `row` is the primary Scryfall printing (null when unjoined): WP05's chase pool reads layout, setType, releasedAt, imageStatus, fullArt, frameEffects, promoTypes, edhrecRank, reserved from it. */
export interface JoinedProduct { id: number; linkLevel: LinkLevel; row: ScryfallRow | null; starRow: ScryfallRow | null; oracleNo: number | null; rootId: number | null }
export interface CatalogueSnapshot { day: string; sets: SetRow[]; oracles: OracleRow[]; cards: CardRow[]; prices: CardPriceRow[]; sealed: SealedModelRow[]; units: UnitRef[] }
/** Everything a stage needs. `prev` is the importer's memory (6.2); `work` is the v1/ tree being built (a copy of the previous tree under the publisher); `phase` says which families this run may write (`catalog` = everything except the store families, `full` = all). */
export interface ImportContext {
  log: (...a: unknown[]) => void; day: string; cfg: TrackConfig; prev: PrevState; phase: Phase; work: MutableTree;
  snapshot: CatalogueSnapshot; match: MatchRow[]; joined: ReadonlyMap<number, JoinedProduct>; tracked: ReadonlySet<number> /* uid */;
}
export interface CatalogResult { summary: Partial<ImportSummaryV1>; guards: { flagChange: string | null; groupHold: number[]; storeHold: string[]; configChanged: boolean; countsOk: boolean }; groups: [groupId: number, products: number, priced: number][] }
export interface HistoryResult { day: string; units: number; files: number; cut: boolean; skipped?: string }
export interface ImportSummaryV1 {
  v: 1; priceDay: string; mode: Phase;
  tcgcsv?: { lastUpdated: string; groups: number; products: number; singles: number; sealed: number; priceRows: number; bytes: number };
  scryfall?: { mode: "fresh" | "cached" | "off"; updatedAt: string; rows: number };
  catalogue?: { rows: number; added: number; listed: number; unlisted: number; gone: number; trackedCards: number; units: number; oracles: number; specials: number; reservedUnpriced: number; offersPruned: number };
  writes?: { filesWritten: number; filesUnchanged: number; filesRemoved: number; bytes: number };
  history?: HistoryResult;
  stores?: StoreResult[];
  magic?: { join: Record<LinkLevel, number>; unjoinedCatalogue: number; reskins: number; reskinAmbiguous: number; etchedFlagged: number; etchedAnomalies: number; sharedPairs: number; sharedOdd: number; finishConflicts: number; classCounts: Record<string, number>; classDemoted: number; unknownWords: [string, number][]; treatDisagree: number; unknownSubtypes: string[]; unknownFormats: string[]; unknownLayouts: string[]; slugSuffixed: number; noNumber: number };
  guards?: { flagChange?: string; priceSanity?: string; degraded?: string[] };
  timings?: Record<string, number>; failsafe?: string; error?: string; neon?: "recorded" | "skipped" | "failed";
}

// ── the stages (contract 6.1). The numbers are the S-numbers of the table; each stage is pure over its inputs plus the tree. ─────────────────────────────────────────────────────────────────────────
/** S0b..S7: previous state in, TCGCSV and Scryfall fetched, parsed, joined, classified, selected (flags, THIN, TRACKN/F, GONE/GONEP, the group hold F2b, flagChangeGuard with { configChanged, priorTrips }) and the match index built. NO Neon, no tree write. */
export declare function importCatalog(ctx: Pick<ImportContext, "log" | "cfg" | "prev">, opts: { cacheDir?: string; scryfallCacheDir?: string; bootstrapGroups?: number }): Promise<{ ctx: ImportContext; result: CatalogResult }>;
/** S6 + the free views of S11 that need only phase 1: cat, px, slug, sc, or, nm, meta, st, sl/list, ix/k p o dict, mv, mk, hm, sm, hist/index. A file is rewritten only if its bytes differ (stable order, no timestamps in unchanged files). Calls reconcileStoreFamilies first in phase `catalog`. */
export declare function writeCatalogueFiles(ctx: ImportContext): { written: number; unchanged: number; removed: number; bytes: number };
/** S8 is WP04's importStores(ctx, opts): Promise<StoreResult[]> in store-import.ts. S9: folds the offers of the stage and TCGplayer's own lows into un, of, ix/s, ix/f, sl/d, ss, the lows and counts of st and sl/list. eBay is never an input. */
export declare function aggregate(ctx: ImportContext, stores: readonly StoreResult[]): { units: number; offers: number; files: number };
/** S10: appendDay on every tracked unit of the base or the tail (never rewrites a day, refuses an older day, a gap becomes a null run), the cut on a cut day (every 28 days, a Sunday), hist/w on Sundays, hist/index, mv/recent, and c7 / c30 / hi90 into px. */
export declare function recordHistory(ctx: ImportContext, today?: Date): Promise<HistoryResult>;
/** S13: after the pointer commit, POST /api/data-warm { ref } (loads the hot set into the regional Data Cache) and poll GET /api/data-status until the site serves `ref`. Never throws: a site that does not answer only delays the 20-second pointer memo. */
export declare function revalidateSite(log: ImportContext["log"], o: { pointer: PointerFile }): Promise<void>;
// WP04 implements lib/store-import.ts: importStores(ctx: ImportContext, opts: { only?: string[]; market?: Country }): Promise<StoreResult[]>   (S8)
// WP05 implements the eBay job; it reads a checkout of the pointed tree (scripts/plane-checkout.sh) and writes Neon only. No import of this module.

/** Per-market lows in MARKETS order (kept from OP: tests/history.test.ts pins it). */
export function marketLows(p: { lowUS: number | null; lowAU: number | null; lowUK: number | null; lowSG: number | null; lowCA: number | null; lowEU: number | null }): (number | null)[] {
  return [p.lowUS, p.lowAU, p.lowUK, p.lowSG, p.lowCA, p.lowEU];
}
export function utcDay(d: Date = new Date()): Date { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
export type { Country, Finish };
