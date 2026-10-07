import type { prisma } from "./db";
import { sourceLabel } from "./stores";

// AN UNCACHED READ OF THE SEALED OFFERS, FOR THE SEALED ALERT PASS ONLY —
// RiftCompare's lib/sealed-alert-read.ts, ported over OP Compare's Offer table
// in wave 2 (2026-10-03).
//
// The pass (lib/sealed-watch-run.ts, called by scripts/alerts.ts in GitHub
// Actions straight after the import) needs, for each watched (product, market),
// the REAL-STORE listings: a `store:<key>` row, never eBay and never the
// `tcgplayer` row (RiftCompare's rule: TCGplayer's sealed row is a market
// reference, not stock — counting it would make every product TCGplayer lists
// look open forever, so no restock could ever fire). So it reads Offer itself,
// narrowly: the watched product ids only, one market per OR branch, six narrow
// columns, `take`-capped. Never a page, never a cached loader, no write.

export const SEALED_ALERT_ROWS_PER_PRODUCT = 60;

/** A store listing as the sealed run reads it (the RiftCompare SealedGroup listing shape). */
export interface SealedListing {
  retailer: string; // Offer.source, "store:<key>"
  retailerName: string;
  priceCents: number;
  url: string;
  inStock: boolean;
  /** ISO timestamp of the import's last refresh of this row. */
  lastSeen: string;
}

/** A real store's listing: `store:` only — never eBay, never the TCGplayer row. */
export const isRealSealedStore = (source: string) => source.startsWith("store:");

export type SealedAlertDb = { offer: Pick<typeof prisma.offer, "findMany"> };

/** {market → {sealedId → listings}} for the watched pairs. Throws on a failed read. */
export async function readSealedListings(
  db: SealedAlertDb,
  pairs: readonly { sealedId: number; market: string }[],
): Promise<Map<string, Map<number, SealedListing[]>>> {
  const byMarket = new Map<string, Set<number>>();
  for (const p of pairs) (byMarket.get(p.market) ?? byMarket.set(p.market, new Set()).get(p.market)!).add(p.sealedId);
  const out = new Map<string, Map<number, SealedListing[]>>();
  if (!byMarket.size) return out;
  const count = [...byMarket.values()].reduce((n, s) => n + s.size, 0);
  const rows = await db.offer.findMany({
    where: {
      source: { startsWith: "store:" },
      OR: [...byMarket].map(([market, ids]) => ({ market, productId: { in: [...ids] } })),
    },
    select: { productId: true, market: true, source: true, priceCents: true, url: true, inStock: true, updatedAt: true },
    orderBy: { priceCents: "asc" },
    take: count * SEALED_ALERT_ROWS_PER_PRODUCT,
  });
  for (const r of rows) {
    if (!isRealSealedStore(r.source)) continue;
    const m = out.get(r.market) ?? out.set(r.market, new Map()).get(r.market)!;
    const list = m.get(r.productId) ?? m.set(r.productId, []).get(r.productId)!;
    list.push({ retailer: r.source, retailerName: sourceLabel(r.source, r.market), priceCents: r.priceCents, url: r.url, inStock: r.inStock, lastSeen: r.updatedAt.toISOString() });
  }
  return out;
}
