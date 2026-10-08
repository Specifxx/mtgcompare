// src/lib/admin-alarms.ts (owner WP21, FROZEN). The traffic lights of the admin console, as pure functions so they are tested by running them (the panels of section 15 only render the result).
// Levels: "ok" (green), "warn" (amber), "bad" (red), "unknown" (grey: the input could not be read; an unreadable input is never green).
import { STALE_DEPLOY_DAYS } from "./release-schedule";

export type Level = "ok" | "warn" | "bad" | "unknown";
export const worst = (levels: readonly Level[]): Level => (levels.includes("bad") ? "bad" : levels.includes("warn") ? "warn" : levels.includes("unknown") ? "unknown" : "ok");

/** Published data: a daily publish is due every 24 h; amber after 26 h (one late run), red after 36 h (a missed day). */
export const FRESH_WARN_HOURS = 26;
export const FRESH_BAD_HOURS = 36;
export function freshness(publishedAtIso: string | null | undefined, now = new Date()): { level: Level; ageHours: number | null } {
  if (!publishedAtIso) return { level: "unknown", ageHours: null };
  const t = Date.parse(publishedAtIso);
  if (!Number.isFinite(t)) return { level: "unknown", ageHours: null };
  const h = (now.getTime() - t) / 3_600_000;
  return { level: h >= FRESH_BAD_HOURS ? "bad" : h >= FRESH_WARN_HOURS ? "warn" : "ok", ageHours: Math.max(0, Math.round(h * 10) / 10) };
}
/** A published file set that shrinks by more than 10% between two publishes is a failed read, not a market event (amber at 5%). */
export function fileCountChange(prev: number | null | undefined, cur: number | null | undefined): { level: Level; pct: number | null } {
  if (!prev || cur == null) return { level: "unknown", pct: null };
  const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
  return { level: pct <= -10 ? "bad" : pct <= -5 ? "warn" : "ok", pct };
}
/** Repository growth against its budget (bytes in KB): amber at 70%, red at 90%; also the days left at the recent daily growth. */
export function repoSize(sizeKb: number | null | undefined, budgetKb: number | null | undefined, dailyGrowthKb: number | null | undefined): { level: Level; usedPct: number | null; daysLeft: number | null } {
  if (sizeKb == null || !budgetKb) return { level: "unknown", usedPct: null, daysLeft: null };
  const usedPct = Math.round((sizeKb / budgetKb) * 1000) / 10;
  const daysLeft = dailyGrowthKb && dailyGrowthKb > 0 ? Math.floor((budgetKb - sizeKb) / dailyGrowthKb) : null;
  return { level: usedPct >= 90 ? "bad" : usedPct >= 70 ? "warn" : "ok", usedPct, daysLeft };
}
/** The eBay day: spend against the cap (amber at 90%: the allocator is about to starve tier B). A refused or latched run is shown by the caller. */
export function spendLevel(spent: number | null | undefined, cap: number | null | undefined): { level: Level; pct: number | null } {
  if (spent == null || !cap) return { level: "unknown", pct: null };
  const pct = Math.round((spent / cap) * 1000) / 10;
  return { level: pct > 100 ? "bad" : pct >= 90 ? "warn" : "ok", pct };
}
/** Neon private tables against the owner's 100 MB target (amber at 70 MB, red at 90 MB). */
export const DB_TARGET_BYTES = 100 * 1024 * 1024;
export function dbLevel(bytes: number | null | undefined): { level: Level; usedPct: number | null } {
  if (bytes == null) return { level: "unknown", usedPct: null };
  const usedPct = Math.round((bytes / DB_TARGET_BYTES) * 1000) / 10;
  return { level: usedPct >= 90 ? "bad" : usedPct >= 70 ? "warn" : "ok", usedPct };
}
/** The running deployment: amber after STALE_DEPLOY_DAYS (a missed weekly release plus a day); never red, because stale CODE does not stop the data. */
export function deployLevel(ageDays: number | null | undefined): Level {
  if (ageDays == null) return "unknown";
  return ageDays >= STALE_DEPLOY_DAYS ? "warn" : "ok";
}
/** Release cadence guard: more than two `[deploy]` subjects in a rolling seven days (the scheduled one plus one urgent) is the burn RiftCompare measured (16 in four days). */
export function releaseBurst(deploysLast7d: number | null | undefined): Level {
  if (deploysLast7d == null) return "unknown";
  return deploysLast7d > 2 ? "bad" : deploysLast7d === 2 ? "warn" : "ok";
}
