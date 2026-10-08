// /admin/clicks: the outbound-click log (ClickEvent, ported from RiftCompare; OP deleted the feature, this site restored it sampled and batched: click-event.ts is the only writer). Owner-only,
// UNCACHED, select-limited. Retailer is "store:<key>", "tcgplayer", "ebay", "ebay_search", "ebay_chase", "buy_list" ...; the kind is the prefix. No user id is ever shown (rows are anonymous).
import { prisma } from "./db";

type Db = typeof prisma;
const DAY = 86_400_000;
export const CLICK_RECENT_ROWS = 100;
export type ClickKind = "store" | "tcgplayer" | "ebay" | "other";

/** store:<key> -> store, tcgplayer -> tcgplayer, ebay / ebay_search / ebay_chase -> ebay, anything else -> other (pure). */
export function kindOfRetailer(retailer: string): ClickKind {
  if (retailer.startsWith("store:")) return "store";
  if (retailer === "tcgplayer" || retailer.startsWith("tcgplayer_")) return "tcgplayer";
  if (retailer === "ebay" || retailer.startsWith("ebay_")) return "ebay";
  return "other";
}

export interface ClickRollup { k: string; n: number }
export interface ClickReport {
  windows: { d7: number; d30: number; all: number };
  byRetailer: ClickRollup[];
  byCountry: ClickRollup[];
  byPage: ClickRollup[];
  byKind: Record<ClickKind, number>;
  recent: { retailer: string; page: string; slug: string | null; country: string; entry: string | null; createdAt: Date }[];
}

/** Fold per-retailer counts into per-kind totals (pure). */
export function foldKinds(rows: readonly ClickRollup[]): Record<ClickKind, number> {
  const out: Record<ClickKind, number> = { store: 0, tcgplayer: 0, ebay: 0, other: 0 };
  for (const r of rows) out[kindOfRetailer(r.k)] += r.n;
  return out;
}

export async function loadClickReport(db: Db = prisma, now = Date.now()): Promise<ClickReport> {
  const d7 = new Date(now - 7 * DAY), d30 = new Date(now - 30 * DAY);
  const group = async (by: "retailer" | "country" | "page"): Promise<ClickRollup[]> => {
    const rows = await db.clickEvent.groupBy({ by: [by], where: { createdAt: { gte: d30 } }, _count: { _all: true }, orderBy: { _count: { id: "desc" } }, take: 40 });
    return rows.map((r) => ({ k: String((r as Record<string, unknown>)[by]), n: r._count._all }));
  };
  const [c7, c30, all, byRetailer, byCountry, byPage, recent] = await Promise.all([
    db.clickEvent.count({ where: { createdAt: { gte: d7 } } }),
    db.clickEvent.count({ where: { createdAt: { gte: d30 } } }),
    db.clickEvent.count(),
    group("retailer"), group("country"), group("page"),
    db.clickEvent.findMany({ select: { retailer: true, page: true, slug: true, country: true, entry: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: CLICK_RECENT_ROWS }),
  ]);
  return { windows: { d7: c7, d30: c30, all }, byRetailer, byCountry, byPage, byKind: foldKinds(byRetailer), recent };
}
