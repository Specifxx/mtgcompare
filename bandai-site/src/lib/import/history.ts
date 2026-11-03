// Public price history, as committed JSON (the Rift Compare model since
// 2026-10-03: history is not in Neon). One file per set,
// data/history/<setId>.json: { [productId]: [[day, usdCents], ...] } where
// day = days since 1970-01-01. A point is appended only when the reference
// price changes, so a quiet card costs nothing and a year of a busy card is a
// few hundred bytes.
import fs from "node:fs";
import path from "node:path";

import type { Series } from "@/lib/series";
export type { Series } from "@/lib/series";
export { dayToDate } from "@/lib/series";
export type SetHistory = Record<string, Series>;

export const HISTORY_DIR = path.join(process.cwd(), "data", "history");
const KEEP_DAYS = 730;

export function dayNumber(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000);
}

export function readSetHistory(setId: number): SetHistory {
  try {
    return JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, `${setId}.json`), "utf8"));
  } catch {
    return {};
  }
}

export function appendPoint(series: Series, day: number, cents: number): Series {
  const last = series[series.length - 1];
  if (last && last[0] === day) {
    last[1] = cents;
    return series;
  }
  if (last && last[1] === cents) return series;
  series.push([day, cents]);
  const floor = day - KEEP_DAYS;
  while (series.length > 2 && series[1][0] < floor) series.shift();
  return series;
}

/** The value in effect on a given day (last point at or before it). */
export function valueOn(series: Series | undefined, day: number): number | null {
  if (!series?.length) return null;
  let v: number | null = null;
  for (const [d, c] of series) {
    if (d > day) break;
    v = c;
  }
  return v;
}

export function pctChange(series: Series | undefined, today: number, days: number): number | null {
  const now = valueOn(series, today);
  const then = valueOn(series, today - days);
  if (now == null || then == null || then === 0) return null;
  return Math.round(((now - then) / then) * 1000) / 10;
}

export function writeSetHistory(setId: number, h: SetHistory) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const keys = Object.keys(h).sort((a, b) => Number(a) - Number(b));
  const body = "{\n" + keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(h[k])}`).join(",\n") + "\n}\n";
  fs.writeFileSync(path.join(HISTORY_DIR, `${setId}.json`), body);
}
