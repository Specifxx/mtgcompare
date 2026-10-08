// src/lib/data/plane/shards.ts (owner WP01a, FROZEN). Shard functions and path builders of the published data. Pure; shared by the publisher (WP01b), the reader (WP02) and the Actions jobs.
// Why ranges for cards and history: the ids of a set are consecutive, so a set page, a binder, a deck or a sparkline touches a handful of files instead of one per card (hash sharding scatters them).
// Why hashes for slugs, set codes and ordinals: they have no locality and need O(1) lookup. Every bucket family lives in directories of at most 64 files (GitHub recommends at most 3,000 entries per directory).
import { PLANE_PREFIX } from "./formats";

export const CARD_BUCKET = 256, HIST_BUCKET = 64, TAIL_BUCKET = 512, SLUG_SHARDS = 256, SC_SHARDS = 64, ORACLE_SHARDS = 512, SEALED_SHARDS = 64, IX_CHUNK = 8192, IX_FLAT_CHUNK = 40_000, WEEKLY_SHARDS = 8, NAME_CHUNK = 8000, BOARD_CHUNK = 2000, SEALED_LIST_CHUNK = 2500, SITEMAP_SECTION = 10_000;
export const DIR_WIDTH = 64;                                   // files per directory: <family>/<floor(b/64)>/<b>.json

/** FNV-1a 32 bit over the UTF-8 bytes: stable across runtimes, the shard function for text keys. */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export const hex2 = (n: number): string => n.toString(16).padStart(2, "0");
export const hex3 = (n: number): string => n.toString(16).padStart(3, "0");
export const cardBucket = (id: number): number => Math.floor(id / CARD_BUCKET);
export const histBucket = (id: number): number => Math.floor(id / HIST_BUCKET);
export const tailBucket = (id: number): number => Math.floor(id / TAIL_BUCKET);
export const slugShard = (slug: string): string => hex2(fnv1a32(slug) % SLUG_SHARDS);
export const scShard = (code: string): string => hex2(fnv1a32(code) % SC_SHARDS);
export const sealedShard = (slug: string): string => hex2(fnv1a32(slug) % SEALED_SHARDS);
export const oracleShard = (no: number): string => hex3(no % ORACLE_SHARDS);
export const weeklyShard = (uid: number): number => uid % WEEKLY_SHARDS;

export type BucketFamily = "cat" | "px" | "un" | "of" | "hist/p" | "hist/t";
/** <family>/<floor(b/64)>/<b>.json (relative to v1/). b is the bucket number of that family's own width (cat, px, un, of: 256 ids; hist/p: 64 ids; hist/t: 512 ids). */
export const bucketPath = (family: BucketFamily, b: number): string => `${family}/${Math.floor(b / DIR_WIDTH)}/${b}.json`;
/** The same path with the v1/ prefix: what a URL, a git tree and a manifest use. */
export const withPrefix = (rel: string): string => `${PLANE_PREFIX}/${rel}`;
export const stripPrefix = (p: string): string => (p.startsWith(`${PLANE_PREFIX}/`) ? p.slice(PLANE_PREFIX.length + 1) : p);

export const slugPath = (slug: string): string => `slug/${slugShard(slug)}.json`;
export const scPath = (code: string): string => `sc/${scShard(code)}.json`;
export const oraclePath = (no: number): string => `or/${oracleShard(no)}.json`;
export const sealedDetailPath = (slug: string): string => `sl/d/${sealedShard(slug)}.json`;
export const boardPath = (setId: number, chunk = 0): string => (chunk === 0 ? `st/${setId}.json` : `st/${setId}-${chunk}.json`);
export const sealedListPath = (chunk: number): string => `sl/list-${chunk}.json`;
export const ixPath = (kind: "k" | "p" | "s" | "f" | "o", chunk: number): string => `ix/${kind}-${chunk}.json`;
export const weeklyPath = (uid: number): string => `hist/w/${weeklyShard(uid)}.json`;
export const moversPath = (dir: "up" | "down", window: 7 | 30, view: "a" | "n" | "f"): string => `mv/${dir}-${window}-${view}.json`;
export const storeListingsPath = (store: number, market: number): string => `ss/l/${store}-${market}.json`;
export const sitemapPath = (kind: string, n: number): string => `sm/${kind}-${n}.json`;
export const nameChunkPath = (n: number): string => `nm/${n}.json`;

/** The family a path (relative to v1/) belongs to, as the allowlist and the budgets name it. `hist/*` and `ix/*` split by their second segment or file stem. */
export function familyOf(rel: string): string {
  const parts = rel.split("/");
  const top = parts[0]!;
  if (top === "hist") return parts[1] === "p" || parts[1] === "t" || parts[1] === "w" ? `hist/${parts[1]}` : "hist/index";
  if (top === "ix") return parts[1]!.startsWith("dict") || parts[1]!.startsWith("odict") ? "ix/dict" : `ix/${parts[1]!.split("-")[0]}`;
  if (top === "sl") return parts[1] === "d" ? "sl/d" : "sl/list";
  if (top === "ss") return parts[1] === "l" ? "ss/l" : "ss/runs";
  if (top === "meta") return "meta";
  return top.endsWith(".json") ? top : top;
}

/** The files a cold instance reads once per ref to serve the home page, the lists, search and the movers (the data-warm route loads exactly these): 40 index files (k, p, s of every chunk, plus dict), nm/0, meta, hm, mk, mv, ss/runs. */
export function hotSet(rows: number): string[] {
  const chunks = Math.ceil(rows / IX_CHUNK);
  const out = ["ix/dict.json", "meta/sets.json", "meta/buckets.json", "ss/runs.json", "hm/home.json", "mk/overview.json", "mk/records.json", "hist/index.json", "nm/0.json", "pv/demand.json", "pv/rising.json"];
  for (let c = 0; c < chunks; c++) out.push(ixPath("k", c), ixPath("p", c), ixPath("s", c));
  for (const d of ["up", "down"] as const) for (const w of [7, 30] as const) for (const v of ["a", "n", "f"] as const) out.push(moversPath(d, w, v));
  out.push("mv/recent.json");
  return out;
}
