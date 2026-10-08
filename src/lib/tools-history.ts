// The database half of the demand tools (contract 14.5): the DemandDay snapshots and the live counters. Server-only (Prisma). The counters (CardStat) and the daily snapshots of them (DemandDay) are PRIVATE, paid-product data: they live in Neon, are read per
// request behind the entitlement gate (src/lib/data/demand.ts) and are never written to a file. The only demand-derived files are the two clear preview slices, written by scripts/publish-demand.ts through the publisher's overlay mode.
//
// OP Compare wrote the daily snapshot and a "rising feed" of weekly series to its public data branch at the end of the import. Here the importer reads nothing from Neon and writes nothing demand-shaped: the demand-snapshot job calls
// recordDemandDay once a day, and the weekly closes Rising Cards ranks on are the public hist/w files the importer already publishes.
import { prisma } from "./db";
import { DEMAND_DAY_CARDS, buildDemandDay, dayMinus, utcDayKey, type DemandDayFile } from "./demand-snapshot";

/** Rows of snapshots kept: Demand Finder's 30-day window and its previous period (60), Rising Cards' velocity window and the week-ago rebuild (30), with room to spare. */
export const DEMAND_KEEP_DAYS = 120;

export interface Counter { id: number; searchCount: number; viewCount: number }
/** What the demand code needs of the database, narrow enough to stand in for it in a test. */
export interface DemandStore {
  /** The busiest cards by running totals (the top `n` by searches, merged with the top `n` by views). */
  counters(n: number): Promise<Counter[]>;
  /** The days a snapshot exists for. */
  days(): Promise<string[]>;
  /** One day's snapshot; null when there is none. A failed read throws. */
  readDay(day: string): Promise<DemandDayFile | null>;
  writeDay(file: DemandDayFile): Promise<void>;
  /** Deletes snapshots older than `day`. */
  pruneBefore(day: string): Promise<number>;
}

const busy = () => ({ OR: [{ searchCount: { gt: 0 } }, { viewCount: { gt: 0 } }] });
const SELECT = { cardId: true, searchCount: true, viewCount: true } as const;
/** DemandDay.data is `{ "<productId>": [searches, views] }`; anything else in the column is ignored rather than trusted. */
function pairsOf(json: unknown): DemandDayFile["p"] {
  const p: DemandDayFile["p"] = {};
  if (json && typeof json === "object" && !Array.isArray(json)) for (const [id, v] of Object.entries(json as Record<string, unknown>)) if (Array.isArray(v) && typeof v[0] === "number" && typeof v[1] === "number") p[id] = [v[0], v[1]];
  return p;
}

export function prismaDemandStore(): DemandStore {
  return {
    async counters(n) {
      const [bySearch, byView] = await Promise.all([
        prisma.cardStat.findMany({ where: busy(), orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }, { cardId: "asc" }], take: n, select: SELECT }),
        prisma.cardStat.findMany({ where: busy(), orderBy: [{ viewCount: "desc" }, { searchCount: "desc" }, { cardId: "asc" }], take: n, select: SELECT }),
      ]);
      const merged = new Map<number, Counter>();
      for (const r of [...bySearch, ...byView]) merged.set(r.cardId, { id: r.cardId, searchCount: r.searchCount, viewCount: r.viewCount });
      return [...merged.values()];
    },
    async days() { return (await prisma.demandDay.findMany({ select: { day: true }, orderBy: { day: "asc" } })).map((r) => r.day); },
    async readDay(day) {
      const row = await prisma.demandDay.findUnique({ where: { day }, select: { data: true } });
      return row ? { v: 1, day, p: pairsOf(row.data) } : null;
    },
    async writeDay(file) {
      const data = file.p as unknown as object;
      await prisma.demandDay.upsert({ where: { day: file.day }, create: { day: file.day, data }, update: { data } });
    },
    async pruneBefore(day) { return (await prisma.demandDay.deleteMany({ where: { day: { lt: day } } })).count; },
  };
}

export interface DemandDayResult { day: string; cards: number; snapshotDays: number; pruned: number }
/** Today's snapshot of the running totals (a same-day re-run replaces the day), and the old rows pruned. Called by the demand-snapshot job, once a day, before the preview slices are computed. */
export async function recordDemandDay(store: DemandStore, today: string = utcDayKey()): Promise<DemandDayResult> {
  const counters = await store.counters(DEMAND_DAY_CARDS);
  const file = buildDemandDay(today, counters);
  await store.writeDay(file);
  const pruned = await store.pruneBefore(dayMinus(today, DEMAND_KEEP_DAYS));
  const snapshotDays = (await store.days()).length;
  return { day: today, cards: Object.keys(file.p).length, snapshotDays, pruned };
}
