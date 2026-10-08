// src/lib/data/plane/budgets.ts (owner WP02, FROZEN). FILE_BUDGETS replaces the draft's CACHE_BUDGETS: a cap per published family, asserted on the published tree by tests/plane-budget.test.ts and by checks/check-plane-tree.ts on the real one.
// Two ceilings explain the global cap of PLANE_FILE_MAX_BYTES = 1,000,000: Next 14.2.35 stops caching a fetch() result at about 1,570,000 raw bytes (the entry is the base64 of the DECODED body plus headers, limit 2 MiB: files of 1,560,000
// were cached, 1,580,000 were not; Vercel documents the same 2 MB item limit), and unstable_cache stops at about 2.09 MB for number-only JSON and 1.95 MB for quote-heavy JSON (the value is stringified twice). 1,000,000 keeps a 1.5x margin on the fetch side.
import { PLANE_FILE_MAX_BYTES } from "./formats";

export interface FileBudget { family: string; maxRawBytes: number; maxFiles: number; why: string }
export const FILE_BUDGETS: readonly FileBudget[] = [
  { family: "cat", maxRawBytes: 100_000, maxFiles: 1_600, why: "256 ids x about 160 B (measured max 40.1 KB with the three oracle columns)" },
  { family: "px", maxRawBytes: 60_000, maxFiles: 1_600, why: "256 ids x about 50 B" },
  { family: "un", maxRawBytes: 80_000, maxFiles: 1_600, why: "tracked units of 256 ids" },
  { family: "of", maxRawBytes: 450_000, maxFiles: 1_600, why: "OFFER_ROWS_BUDGET split over buckets (measured max 125.5 KB at 191,242 offers; 500,000 offers is about 330 KB)" },
  { family: "slug", maxRawBytes: 120_000, maxFiles: 512, why: "256 shards; grows linearly with rows" },
  { family: "sc", maxRawBytes: 400_000, maxFiles: 128, why: "64 shards" },
  { family: "or", maxRawBytes: 120_000, maxFiles: 1_024, why: "512 shards" },
  { family: "nm", maxRawBytes: 900_000, maxFiles: 8, why: "8,000 rows per chunk" },
  { family: "ix/k", maxRawBytes: 950_000, maxFiles: 20, why: "8,192 rows per chunk (measured max 863.9 KB)" },
  { family: "ix/p", maxRawBytes: 950_000, maxFiles: 20, why: "8,192 rows per chunk" },
  { family: "ix/s", maxRawBytes: 950_000, maxFiles: 20, why: "sparse, tracked units of 8,192 rows" },
  { family: "ix/f", maxRawBytes: 950_000, maxFiles: 20, why: "40,000 offers per chunk" },
  { family: "ix/o", maxRawBytes: 950_000, maxFiles: 20, why: "16,384 oracles per chunk" },
  { family: "ix/dict", maxRawBytes: 200_000, maxFiles: 4, why: "dictionaries" },
  { family: "st", maxRawBytes: 900_000, maxFiles: 800, why: "2,000 rows per file (the largest set, Secret Lair Drop Series, is 3,261 rows = 2 files)" },
  { family: "sl/list", maxRawBytes: 900_000, maxFiles: 12, why: "2,500 rows per file" },
  { family: "sl/d", maxRawBytes: 900_000, maxFiles: 128, why: "64 shards" },
  { family: "hist/p", maxRawBytes: 450_000, maxFiles: 3_500, why: "64 ids x 730 days (measured max 155 KB; 376 KB at 85% churn)" },
  { family: "hist/t", maxRawBytes: 150_000, maxFiles: 1_000, why: "512 ids x at most 31 days" },
  { family: "hist/w", maxRawBytes: 900_000, maxFiles: 16, why: "8 shards" },
  { family: "hist/index", maxRawBytes: 500_000, maxFiles: 1, why: "730 daily points" },
  { family: "ss/runs", maxRawBytes: 500_000, maxFiles: 1, why: "per store and market" },
  { family: "ss/l", maxRawBytes: 500_000, maxFiles: 400, why: "48 listings" },
  { family: "meta", maxRawBytes: 500_000, maxFiles: 3, why: "sets, scryfall sets, bucket list" },
  { family: "mv", maxRawBytes: 500_000, maxFiles: 16, why: "top 100" },
  { family: "mk", maxRawBytes: 500_000, maxFiles: 3, why: "fixed shapes" },
  { family: "hm", maxRawBytes: 500_000, maxFiles: 2, why: "fixed shape" },
  { family: "sm", maxRawBytes: 500_000, maxFiles: 16, why: "10,000 paths per section" },
  { family: "pv", maxRawBytes: 50_000, maxFiles: 4, why: "10 searched cards, 3 picks per scope" },
  { family: "manifest.json", maxRawBytes: 900_000, maxFiles: 1, why: "never fetched by the site" },
  { family: "status.json", maxRawBytes: 100_000, maxFiles: 1, why: "admin panel" },
];
export const budgetFor = (family: string): FileBudget | undefined => FILE_BUDGETS.find((b) => b.family === family);
/** What Next measures for a fetch() cache entry of a body of `rawBodyBytes`: the base64 of the DECODED body plus about 780 bytes of headers and wrapper (patch-fetch.js, incremental-cache). The cap is 2 MiB. */
export const fetchEntryBytes = (rawBodyBytes: number, headerBytes = 780): number => Math.ceil(rawBodyBytes / 3) * 4 + headerBytes;
export const NEXT_ENTRY_CEILING = 2 * 1024 * 1024;
/** What Next measures for an unstable_cache entry: the value is stringified, wrapped and stringified again (quotes escaped twice). */
export const unstableEntryBytes = (value: unknown): number => JSON.stringify({ kind: "FETCH", data: { headers: {}, body: JSON.stringify(value), status: 200, url: "" }, revalidate: 0 }).length;
export { PLANE_FILE_MAX_BYTES };
