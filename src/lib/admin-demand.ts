// /admin/demand reads (RiftCompare's /admin/demand page, its data half). Owner-
// only traffic, so UNCACHED by design (unstable_cache lives in lib/data.ts
// only). The window is the same file-based diff Demand Finder uses
// (lib/demand-snapshot.ts via lib/data.ts demandWindowAtOrThrow), but GUARDED:
// this page only displays demand, so a failed read is an empty window, said
// plainly, never a crash.
import { prisma } from "./db";
import { demandWindowAtOrThrow } from "./data";
import { compareDemand, chartMovement, type Movement } from "./demand-movement";
import type { DemandWindowResult } from "./demand-snapshot";
import type { Country } from "./country";

export const ADMIN_DEMAND_TOP_N = 50;

// Selectable windows. `days: null` = all time (no diff at all). Searches and
// views are cumulative counters windowed against the daily snapshot files
// (daily resolution, as far back as the snapshots reach); outbound clicks are
// one ClickEvent row each, windowed exactly.
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

const CARD_SELECT = {
  id: true, slug: true, name: true, number: true, variant: true, searchCount: true, viewCount: true, lastViewedAt: true,
  lowUS: true, lowAU: true, lowUK: true, lowSG: true, lowCA: true, lowEU: true,
  set: { select: { code: true } },
} as const;

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

type CardRow = { id: number; slug: string; name: string; number: string | null; variant: string | null; searchCount: number; viewCount: number; lastViewedAt: Date | null; lowUS: number | null; lowAU: number | null; lowUK: number | null; lowSG: number | null; lowCA: number | null; lowEU: number | null; set: { code: string } };
const toCard = (c: CardRow): AdminDemandCard => ({
  id: c.id, slug: c.slug, name: c.name, number: c.number, variant: c.variant, setCode: c.set.code,
  searchCount: c.searchCount, viewCount: c.viewCount, lastViewedAt: c.lastViewedAt,
  low: { US: c.lowUS, AU: c.lowAU, UK: c.lowUK, SG: c.lowSG, CA: c.lowCA, EU: c.lowEU },
});

export interface AdminDemandData {
  window: DemandWindowResult | null;
  windowUsable: boolean;
  windowFailed: boolean;
  topSearched: AdminDemandCard[];
  topViewed: AdminDemandCard[];
  inWindow: Map<number, { searches: number; views: number }>;
  searchMoves: Map<string, Movement> | null;
  viewMoves: Map<string, Movement> | null;
}

export async function adminDemand(range: AdminDemandRange): Promise<AdminDemandData> {
  let window: DemandWindowResult | null = null;
  let windowFailed = false;
  if (range.days != null) {
    try {
      const ref = (await prisma.meta.findUnique({ where: { key: "historyRef" }, select: { value: true } }))?.value ?? "data";
      window = await demandWindowAtOrThrow(ref, range.days, { previous: true });
    } catch (e) {
      console.warn("[admin/demand] window read failed:", (e as Error).message);
      windowFailed = true;
      window = { rows: [], baselineDay: null, coveredDays: null, totalDays: 0 };
    }
  }
  const windowUsable = !!window && window.baselineDay != null && window.rows.length > 0;
  const inWindow = new Map<number, { searches: number; views: number }>();
  let searchMoves: Map<string, Movement> | null = null;
  let viewMoves: Map<string, Movement> | null = null;

  if (windowUsable && window) {
    for (const r of window.rows) inWindow.set(Number(r.cardId), { searches: r.searches, views: r.views });
    const bySearch = [...window.rows].sort(compareDemand("searches")).slice(0, ADMIN_DEMAND_TOP_N);
    const byView = [...window.rows].sort(compareDemand("views")).slice(0, ADMIN_DEMAND_TOP_N);
    const prev = window.previous ?? null;
    if (prev) {
      searchMoves = chartMovement(bySearch.map((r) => r.cardId), prev.rows, "searches");
      viewMoves = chartMovement(byView.map((r) => r.cardId), prev.rows, "views");
    }
    // One read for the union, then re-split — the two lists overlap heavily.
    const ids = [...new Set([...bySearch, ...byView].map((r) => Number(r.cardId)))];
    const cards = (await prisma.card.findMany({ where: { id: { in: ids } }, select: CARD_SELECT })).map(toCard);
    const byId = new Map(cards.map((c) => [c.id, c]));
    return {
      window, windowUsable, windowFailed, inWindow, searchMoves, viewMoves,
      topSearched: bySearch.flatMap((r) => byId.get(Number(r.cardId)) ?? []),
      topViewed: byView.flatMap((r) => byId.get(Number(r.cardId)) ?? []),
    };
  }
  // All time, or a window the snapshots don't reach: the cumulative counters, said so on the page.
  const [topSearched, topViewed] = await Promise.all([
    prisma.card.findMany({ where: { searchCount: { gt: 0 } }, orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }], take: ADMIN_DEMAND_TOP_N, select: CARD_SELECT }),
    prisma.card.findMany({ where: { viewCount: { gt: 0 } }, orderBy: [{ viewCount: "desc" }, { searchCount: "desc" }], take: ADMIN_DEMAND_TOP_N, select: CARD_SELECT }),
  ]);
  return { window, windowUsable, windowFailed, inWindow, searchMoves, viewMoves, topSearched: topSearched.map(toCard), topViewed: topViewed.map(toCard) };
}
