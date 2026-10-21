// The on-disk format of data/public/, shared by the writer (src/lib/public-data/export.ts, scripts/export-public-data.ts) and the
// reader (store.ts), so the two cannot drift. Bump PUBLIC_DATA_FORMAT on any incompatible change: the reader refuses a format it does
// not know and the site asks Neon instead.
//
//   data/public/meta.json             format, when, from which database, row counts, each store's last import minute
//   data/public/products.json         Product
//   data/public/offers.json           Offer (no id: derived from productId + store; lastSeen only when not its store's common one)
//   data/public/product-stats.json    ProductStat
//   data/public/store-stats.json      StoreStat
//   data/public/ebay-listings.json    EbayListing
//
// KEPT SMALL IN GIT (RiftCompare's rules): one row per line, sorted by a stable key, fields in schema order, so an import changes only
// the lines whose price or stock changed and git stores a delta, not a new copy. Offer ids are not stored: the importer replaces a
// store's rows on every successful read, so their database ids change every run; a stable id is derived on load instead.
import { createHash } from "node:crypto";
import path from "node:path";
import type { ModelName } from "./models";

export const PUBLIC_DATA_FORMAT = 1;

/** data/public/ under the app, or PUBLIC_DATA_DIR (tests and the exporter point it elsewhere). Read per call. */
export function publicDataDir(): string {
  return process.env.PUBLIC_DATA_DIR || path.join(process.cwd(), "data", "public");
}

export const META_FILE = "meta.json";

export const FILES: Record<ModelName, string> = {
  Product: "products.json",
  Offer: "offers.json",
  ProductStat: "product-stats.json",
  StoreStat: "store-stats.json",
  EbayListing: "ebay-listings.json",
};

export interface PublicDataMeta {
  format: number;
  generatedAt: string;
  /** Which database the export read ("DC2", …). */
  source: string;
  counts: Partial<Record<ModelName, number>>;
  /** Store key → when its offers were last written (the common Offer.lastSeen, exact). */
  seen: Record<string, string>;
}

/** Models whose database id churns every import, and the fields that identify a row instead. */
export const DERIVED_ID: Partial<Record<ModelName, readonly string[]>> = {
  Offer: ["productId", "store"],
};

/** Row order inside each file (also the order a scan returns them in). */
export const SORT_KEY: Record<ModelName, readonly string[]> = {
  Product: ["slug"],
  Offer: ["productId", "store"],
  ProductStat: ["productId", "market"],
  StoreStat: ["store"],
  EbayListing: ["feed", "rank"],
};

/** Deterministic id for a row whose database id is not stable. */
export function stableId(model: ModelName, row: Record<string, unknown>): string {
  const fields = DERIVED_ID[model];
  if (!fields) return String(row.id);
  const key = fields.map((f) => (row[f] === null || row[f] === undefined ? "" : String(row[f]))).join("\u0000");
  return `pd_${createHash("sha1").update(`${model}\u0000${key}`).digest("hex").slice(0, 24)}`;
}

/** One row per line, so git diffs (and deltas) stay line-sized. */
export function serializeRows(rows: readonly Record<string, unknown>[]): string {
  if (!rows.length) return "[]\n";
  return `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`;
}
