import { getSealedByIds, getSealedDetail } from "./data/sealed";
import { sourceLabel } from "./stores";

// A READ OF THE SEALED OFFERS, FOR THE SEALED ALERT PASS ONLY.
//
// The pass (lib/sealed-watch-run.ts, called by scripts/alerts.ts in GitHub
// Actions straight after the import) needs, for each watched (product, market),
// the REAL-STORE listings: a `store:<key>` row, never eBay and never the
// `tcgplayer` row (a market reference, not stock: counting it would make every
// product TCGplayer lists look open forever, so no restock could ever fire).
// Sealed offers are published files now (sl/d/<h>), so it reads exactly the
// watched products' detail files through the data layer: no database, no write,
// and the eBay panel is never in them.

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

/** One product's offers by slug, the shape of getSealedDetail's `offers`. */
export type SealedOfferReader = (sealedId: number) => Promise<readonly { source: string; market: string; priceCents: number; url: string; inStock: boolean; updatedAt: string }[]>;

/** The caller's handle: the read does not touch a database. A caller (the alert run's tests) may carry a `sealedOffers` reader to stand in for the published files (REQ-WP09-2). */
export type SealedAlertDb = { sealedOffers?: SealedOfferReader } | unknown;

const planeReader: SealedOfferReader = async (id) => {
  const lite = (await getSealedByIds([id])).get(id);
  return lite ? ((await getSealedDetail(lite.slug))?.offers ?? []) : [];
};

const READ_PARALLEL = 6;

/** {market -> {sealedId -> listings}} for the watched pairs. Throws on a failed read. */
export async function readSealedListings(
  db: SealedAlertDb,
  pairs: readonly { sealedId: number; market: string }[],
): Promise<Map<string, Map<number, SealedListing[]>>> {
  const out = new Map<string, Map<number, SealedListing[]>>();
  if (!pairs.length) return out;
  const wanted = new Map<number, Set<string>>();
  for (const p of pairs) (wanted.get(p.sealedId) ?? wanted.set(p.sealedId, new Set()).get(p.sealedId)!).add(p.market);
  const read = (db as { sealedOffers?: SealedOfferReader } | null)?.sealedOffers ?? planeReader;
  const ids = [...wanted.keys()];
  for (let i = 0; i < ids.length; i += READ_PARALLEL) {
    await Promise.all(ids.slice(i, i + READ_PARALLEL).map(async (id) => {
      const markets = wanted.get(id)!;
      for (const o of (await read(id)).slice(0, SEALED_ALERT_ROWS_PER_PRODUCT)) {
        if (!isRealSealedStore(o.source) || !markets.has(o.market)) continue;
        const m = out.get(o.market) ?? out.set(o.market, new Map()).get(o.market)!;
        const list = m.get(id) ?? m.set(id, []).get(id)!;
        list.push({ retailer: o.source, retailerName: sourceLabel(o.source, o.market), priceCents: o.priceCents, url: o.url, inStock: o.inStock, lastSeen: o.updatedAt });
      }
    }));
  }
  for (const m of out.values()) for (const l of m.values()) l.sort((a, b) => a.priceCents - b.priceCents);
  return out;
}
