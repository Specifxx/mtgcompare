// File I/O for the history (lib/history.ts): the import reads and writes a local
// checkout of the `data` branch (HISTORY_DIR, default .data/history), and the
// import workflow commits it. Server-only.
import fs from "node:fs";
import path from "node:path";
import { addDays, type BucketFile, type DayFile, type IndexFile } from "./history";

export const historyDir = () => path.resolve(process.env.HISTORY_DIR || ".data/history");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

export const readBucket = (b: string) => readJson<BucketFile>(path.join(historyDir(), "products", `${b}.json`), { v: 2, p: {} });
export const writeBucket = (b: string, f: BucketFile) => writeJson(path.join(historyDir(), "products", `${b}.json`), f);
export const writeDay = (f: DayFile) => writeJson(path.join(historyDir(), "days", `${f.day}.json`), f);
export const readIndex = () => readJson<IndexFile>(path.join(historyDir(), "index.json"), { v: 1, days: [] });
export const writeIndex = (f: IndexFile) => writeJson(path.join(historyDir(), "index.json"), f);

// ── wave2:tools — demand snapshots and the Rising Cards feed ─────────────────
// history/demand/YYYY-MM-DD.json, history/demand/days.json (lib/demand-snapshot.ts)
// and history/rising.json (lib/rise-predictor.ts), written by lib/tools-history.ts.
import type { DemandDayFile, DemandDaysFile } from "./demand-snapshot";
import type { RiseFile } from "./rise-predictor";

export const readDemandDay = (day: string) => readJson<DemandDayFile | null>(path.join(historyDir(), "demand", `${day}.json`), null);
export const writeDemandDay = (f: DemandDayFile) => writeJson(path.join(historyDir(), "demand", `${f.day}.json`), f);
export const readDemandDays = () => readJson<DemandDaysFile>(path.join(historyDir(), "demand", "days.json"), { v: 1, days: [] });
export const writeDemandDays = (f: DemandDaysFile) => writeJson(path.join(historyDir(), "demand", "days.json"), f);
export const writeRiseFile = (f: RiseFile) => writeJson(path.join(historyDir(), "rising.json"), f);

// ── wave2:collection-alerts: history/recent ──────────────────────────────────
// history/recent/<bb>.json: each bucket's last RECENT_DAYS days, written beside
// products/<bb>.json on every import. The binder's value chart (getPortfolio,
// lib/collection-server.ts) reads THESE: a products bucket grows to ~0.9 MB at
// 730 days and a big binder touches dozens of buckets per render, while 120
// days stays near 150 KB a file — and well under Next's 2 MB fetch-cache item
// ceiling, so a pinned file is fetched once and kept. The site falls back to
// products/<bb>.json until the first import writes a recent file.
export const RECENT_DAYS = 120;

/** The last `days` days of every series in a bucket (pure; tests/portfolio-performance.test.ts). */
export function recentOf(file: BucketFile, today: number, days = RECENT_DAYS): BucketFile {
  const cutoff = addDays(today, -days);
  const p: BucketFile["p"] = {};
  for (const [k, series] of Object.entries(file.p)) {
    const recent = series.filter((x) => (x[0] as number) > cutoff);
    if (recent.length) p[k] = recent;
  }
  return { v: file.v, p };
}

export const writeRecentBucket = (b: string, f: BucketFile) => writeJson(path.join(historyDir(), "recent", `${b}.json`), f);
// ── end wave2:collection-alerts ──────────────────────────────────────────────
