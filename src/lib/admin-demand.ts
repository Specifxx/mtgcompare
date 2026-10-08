// /admin/demand reads (RiftCompare's /admin/demand page, its data half). Owner-
// only traffic, so UNCACHED by design (unstable_cache lives in lib/data/ only).
// The window is the same DemandDay diff Demand Finder uses (lib/demand-snapshot.ts
// via lib/data/demand.ts demandWindowAtOrThrow), but GUARDED: this page only
// displays demand, so a failed read is an empty window, said plainly, never a
// crash. The counters are CardStat rows (Neon); the cards are the published ones.
import { prisma } from "./db";
import { demandWindowAtOrThrow, getCardsByIds, getDataRef, type CardLite } from "./data";
import { compareDemand, chartMovement, type Movement } from "./demand-movement";
import type { DemandWindowResult } from "./demand-snapshot";
import type { Country } from "./country";

export const ADMIN_DEMAND_TOP_N = 50;

// Selectable windows. `days: null` = all time (no diff at all). Searches and
// views are cumulative counters windowed against the daily snapshots
// (daily resolution, as far back as the snapshots reach).
export const ADMIN_DEMAND_RANGES = [
  { key: "24h", label: "24h", days: 1 },
  { key: "3d", label: "3 days", days: 3 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
] as const;
export type AdminDemandRange = (typeof ADMIN_DEMAND_RANGES)[number];
export const ADMIN_DEMAND_DEFAULT_RANGE = "30d";

export function parseAdminDemandRange(v: string | undefined): AdminDemandRange {
  return ADMIN_DEMAND_RANGES.find((r) => r.key === v) ?? ADMIN_DEMAND_RANGES.find((r) => r.key === ADMIN_DEMAND_DEFAULT_RANGE)!;
}

export interface AdminDemandCard {
  id: number;
  slug: string;
  name: string;
  number: string | null;
  variant: string | null;
  setCode: string;
  searchCount: number;
  viewCount: number;
  lastViewedAt: Date | null;
  low: Record<Country, number | null>;
}

interface StatRow { cardId: number; searchCount: number; viewCount: number; lastViewedAt: Date | null }
const STAT_SELECT = { cardId: true, searchCount: true, viewCount: true, lastViewedAt: true } as const;
const toCard = (c: CardLite, s: StatRow | undefined): AdminDemandCard => ({
  id: c.id, slug: c.slug, name: c.name, number: c.number, variant: c.variant, setCode: c.setCode,
  searchCount: s?.searchCount ?? 0, viewCount: s?.viewCount ?? 0, lastViewedAt: s?.lastViewedAt ?? null, low: c.low,
});
/** The counters of these cards (the running totals, Neon) joined to their published rows (the plane). A product the catalogue no longer lists is left out. */
async function cardsOf(ids: readonly number[], stats: readonly StatRow[]): Promise<Map<number, AdminDemandCard>> {
  const lite = await getCardsByIds([...ids]), by = new Map(stats.map((s) => [s.cardId, s] as const));
  return new Map([...lite].map(([id, c]) => [id, toCard(c, by.get(id))] as const));
}

export interface AdminDemandData {
  window: DemandWindowResult | null;
  windowUsable: boolean;
  windowFailed: boolean;
  topSearched: AdminDemandCard[];
  topViewed: AdminDemandCard[];
  inWindow: Map<number, { searches: number; views: number }>;
  searchMoves: Map<number, Movement> | null;
  viewMoves: Map<number, Movement> | null;
}

export async function adminDemand(range: AdminDemandRange): Promise<AdminDemandData> {
  let window: DemandWindowResult | null = null;
  let windowFailed = false;
  if (range.days != null) {
    try {
      const ref = (await getDataRef())?.ref ?? "none";
      window = await demandWindowAtOrThrow(ref, range.days, { previous: true });
    } catch (e) {
      console.warn("[admin/demand] window read failed:", (e as Error).message);
      windowFailed = true;
      window = { rows: [], baselineDay: null, coveredDays: null, totalDays: 0 };
    }
  }
  const windowUsable = !!window && window.baselineDay != null && window.rows.length > 0;
  const inWindow = new Map<number, { searches: number; views: number }>();
  let searchMoves: Map<number, Movement> | null = null;
  let viewMoves: Map<number, Movement> | null = null;

  if (windowUsable && window) {
    for (const r of window.rows) inWindow.set(r.cardId, { searches: r.searches, views: r.views });
    const bySearch = [...window.rows].sort(compareDemand("searches")).slice(0, ADMIN_DEMAND_TOP_N);
    const byView = [...window.rows].sort(compareDemand("views")).slice(0, ADMIN_DEMAND_TOP_N);
    const prev = window.previous ?? null;
    if (prev) {
      searchMoves = chartMovement(bySearch.map((r) => r.cardId), prev.rows, "searches");
      viewMoves = chartMovement(byView.map((r) => r.cardId), prev.rows, "views");
    }
    // One read for the union, then re-split — the two lists overlap heavily.
    const ids = [...new Set([...bySearch, ...byView].map((r) => r.cardId))];
    const byId = await cardsOf(ids, await prisma.cardStat.findMany({ where: { cardId: { in: ids } }, select: STAT_SELECT }));
    return {
      window, windowUsable, windowFailed, inWindow, searchMoves, viewMoves,
      topSearched: bySearch.flatMap((r) => byId.get(r.cardId) ?? []),
      topViewed: byView.flatMap((r) => byId.get(r.cardId) ?? []),
    };
  }
  // All time, or a window the snapshots don't reach: the cumulative counters, said so on the page.
  const [searched, viewed] = await Promise.all([
    prisma.cardStat.findMany({ where: { searchCount: { gt: 0 } }, orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }, { cardId: "asc" }], take: ADMIN_DEMAND_TOP_N, select: STAT_SELECT }),
    prisma.cardStat.findMany({ where: { viewCount: { gt: 0 } }, orderBy: [{ viewCount: "desc" }, { searchCount: "desc" }, { cardId: "asc" }], take: ADMIN_DEMAND_TOP_N, select: STAT_SELECT }),
  ]);
  const byId = await cardsOf([...new Set([...searched, ...viewed].map((r) => r.cardId))], [...searched, ...viewed]);
  return { window, windowUsable, windowFailed, inWindow, searchMoves, viewMoves, topSearched: searched.flatMap((r) => byId.get(r.cardId) ?? []), topViewed: viewed.flatMap((r) => byId.get(r.cardId) ?? []) };
}
