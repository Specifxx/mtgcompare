// /admin/data: the state of the published data, read from status.json and the pointer on the data host, NEVER from Neon (the page works when Neon is down, contract C24).
// This file imports nothing from "./db": the Neon-backed ImportRun strip beside it lives in admin-db-footprint.ts (tests/admin-panels.test.ts pins both).
import { fileCountChange, freshness, repoSize, worst, type Level } from "./admin-alarms";
import type { PublicationStatus } from "./data/plane/status";
import { readPublicationStatus } from "./data/plane/runtime";

export interface PubRow { label: string; value: string; level: Level; note?: string }
export interface PublicationView {
  level: Level;
  rows: PubRow[];
  kinds: { kind: string; files: number; bytes: number }[];
  guards: string[];
  alarms: PublicationStatus["alarms"];
  /** Daily repository size in KB, oldest first (the trend strip). */
  trend: number[];
  dailyGrowthKb: number | null;
}

const mb = (b: number | null) => (b == null ? "unknown" : `${(b / 1_048_576).toFixed(1)} MB`);
const num = (n: number | null) => (n == null ? "unknown" : n.toLocaleString("en-US"));
export const TCGCSV_STALE_HOURS = 30;
export const CATALOG_ROWS_RANGE = [90_000, 110_000] as const;

/** Mean daily growth of the last (up to) 14 trend points, in KB; null with fewer than two points (pure). */
export function dailyGrowthKb(history: readonly [string, number][]): number | null {
  const h = history.slice(-14);
  if (h.length < 2) return null;
  const days = (Date.parse(h[h.length - 1]![0]) - Date.parse(h[0]![0])) / 86_400_000;
  return days > 0 ? Math.round((h[h.length - 1]![1] - h[0]![1]) / days) : null;
}

/** Maps a PublicationStatus (every field nullable) to what the panel renders and the lights it shows (pure; a missing field is grey, never green). */
export function publicationView(s: PublicationStatus, now = new Date()): PublicationView {
  const fresh = freshness(s.pointer.publishedAt, now);
  const count = fileCountChange(s.files.previous, s.files.total);
  const growth = dailyGrowthKb(s.repo.history);
  const repo = repoSize(s.repo.sizeKb, s.repo.budgetKb, growth);
  const tcgAge = s.sources.tcgcsvLastUpdated ? (now.getTime() - Date.parse(s.sources.tcgcsvLastUpdated)) / 3_600_000 : NaN;
  const srcLevel: Level = Number.isFinite(tcgAge) ? (tcgAge > TCGCSV_STALE_HOURS ? "warn" : "ok") : "unknown";
  const runLevel: Level = s.run.ok == null ? "unknown" : s.run.ok ? (s.run.guards && (s.run.guards.flagChange || s.run.guards.groupHold.length || s.run.guards.storeHold.length || s.run.guards.configChanged) ? "warn" : "ok") : "bad";
  const rowsLevel: Level = s.catalog.rows == null ? "unknown" : s.catalog.rows < CATALOG_ROWS_RANGE[0] || s.catalog.rows > CATALOG_ROWS_RANGE[1] ? "warn" : "ok";
  const tokenLevel: Level = s.token.daysLeft == null ? "unknown" : s.token.daysLeft <= 7 ? "bad" : s.token.daysLeft <= 30 ? "warn" : "ok";
  const alarmLevel: Level = s.alarms.some((a) => a.level === "error") ? "bad" : s.alarms.length ? "warn" : "ok";
  const rows: PubRow[] = [
    { label: "Serving commit", value: s.pointer.sha ? s.pointer.sha.slice(0, 10) : "unknown", level: s.pointer.sha ? "ok" : "unknown", note: s.pointer.prev ? `previous ${s.pointer.prev.slice(0, 10)}` : undefined },
    { label: "Published", value: s.pointer.publishedAt ?? "unknown", level: fresh.level, note: fresh.ageHours == null ? undefined : `${fresh.ageHours} h ago` },
    { label: "Price day", value: s.pointer.dataDay ?? "unknown", level: s.pointer.dataDay ? "ok" : "unknown", note: s.pointer.phase ? `phase ${s.pointer.phase}` : undefined },
    { label: "Last run", value: s.run.mode ? `${s.run.mode} ${s.run.ok ? "ok" : "FAILED"}` : "unknown", level: runLevel, note: s.run.errors[0] },
    { label: "Files", value: `${num(s.files.total)} files, ${mb(s.files.bytes)}`, level: count.level, note: count.pct == null ? undefined : `${count.pct > 0 ? "+" : ""}${count.pct}% since the previous publish` },
    { label: "Data size (PlaneFile table or repository)", value: s.repo.sizeKb == null ? "unknown" : `${(s.repo.sizeKb / 1024).toFixed(0)} MB of ${(s.repo.budgetKb / 1024).toFixed(0)} MB`, level: repo.level, note: repo.daysLeft == null ? (growth == null ? undefined : `${growth} KB/day`) : `${repo.daysLeft} days left at ${growth} KB/day` },
    { label: "Catalogue", value: `${num(s.catalog.rows)} rows, ${num(s.catalog.listed)} listed, ${num(s.catalog.thin)} thin, ${num(s.catalog.tracked)} tracked, ${num(s.catalog.oracles)} oracles`, level: rowsLevel },
    { label: "TCGCSV updated", value: s.sources.tcgcsvLastUpdated ?? "unknown", level: srcLevel, note: Number.isFinite(tcgAge) ? `${Math.round(tcgAge)} h ago` : undefined },
    { label: "Scryfall build", value: s.sources.scryfallBuild ?? "unknown", level: s.sources.scryfallBuild ? "ok" : "unknown" },
    { label: "Format", value: s.format.version ?? "unknown", level: s.format.version ? "ok" : "unknown" },
    { label: "Read token (GitHub backend only)", value: s.token.daysLeft == null ? "unknown" : `${s.token.daysLeft} days left`, level: tokenLevel },
    { label: "Alarms", value: s.alarms.length ? s.alarms.map((a) => a.code).join(", ") : "none", level: alarmLevel },
  ];
  const guards: string[] = [];
  const g = s.run.guards;
  if (g?.flagChange) guards.push(`flag change guard: ${g.flagChange}`);
  if (g?.groupHold.length) guards.push(`${g.groupHold.length} TCGplayer group(s) held: ${g.groupHold.slice(0, 8).join(", ")}`);
  if (g?.storeHold.length) guards.push(`${g.storeHold.length} store(s) held: ${g.storeHold.slice(0, 8).join(", ")}`);
  if (g?.configChanged) guards.push("the tracking configuration changed since the last run");
  return {
    level: worst(rows.map((r) => r.level)),
    rows,
    kinds: Object.entries(s.files.byKind).map(([kind, v]) => ({ kind, files: v!.files, bytes: v!.bytes })),
    guards,
    alarms: s.alarms,
    trend: s.repo.history.map(([, kb]) => kb),
    dailyGrowthKb: growth,
  };
}

/** The panel's one read: never throws, a host that does not answer is an all-null status. */
export async function loadPublication(now = new Date()): Promise<{ status: PublicationStatus; view: PublicationView }> {
  const status = await readPublicationStatus();
  return { status, view: publicationView(status, now) };
}
