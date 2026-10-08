// src/lib/data/plane/status.ts (owner WP01a, FROZEN). status.json: the ONLY data source of /admin/data and of the hourly watchdog, written by every publish, refusal, overlay and (when something changed) every watchdog run, and copied to
// v1/status.json per publish so every ref carries its own record. Pure functions: the alarm rules and the mapping to the shape the admin panel of section 15.3 consumes. No I/O.
import type { PointerFile } from "./formats";

export type RunKind = "catalog" | "full" | "overlay" | "refused" | "noop" | "squash" | "rollback";
export interface StoreRunSummary { key: string; market: string; ok: boolean; matched: number; offers: number; failure?: string }   // the per-store array admin-health.ts and admin-accounts.ts read from ImportRun.summary.stores[] (critique DP-18): kept here so the admin store-health page survives a Neon outage
export interface RunRecord { at: string; startedAt?: string; kind: RunKind; ok: boolean; seconds: number; note: string; errors?: string[]; stores?: StoreRunSummary[] }
export type AlarmCode =
  | "STALE_36H" | "STORE_STALE" | "FILES_DROP_10" | "COUNT_COLLAPSE" | "MANIFEST_MISMATCH" | "POINTER_BEHIND" | "UNPOINTED_DATA_COMMIT" | "REFUSED" | "HOST_DOWN"
  | "REPO_SIZE_WARN" | "REPO_SIZE_CRIT" | "ROTATION_DUE" | "SQUASH_OVERDUE" | "TOKEN_EXPIRING" | "TOKEN_REJECTED" | "DATA_REPO_PUBLIC" | "KEEPALIVE_DUE" | "PREVIEW_STALE";
export interface Alarm { code: AlarmCode; level: "warn" | "error"; since: string; message: string }
export interface Counts { cards: number; listed: number; thin: number; tracked: number; oracles: number; sets: number; sealed: number; offers: number; files: number; bytesRaw: number; bytesGz: number }
export interface StatusFile {
  v: 1; at: string; by: "publish" | "refusal" | "overlay" | "squash" | "watchdog";
  pointer: { seq: number; ref: string; prev: string | null; publishedAt: string; priceDay: string; phase: "catalog" | "full"; tcgcsv: string; scryfall: string; format: "v1"; manifestSha256: string; repo: string; histCut: string; pvAt: string | null };
  counts: Counts;
  families: [name: string, files: number, raw: number, gz: number][];
  config: { trackConfigHash: string; guardTrips: { flagChange: number }; catalogFloorCents: number; indexFloorCents: number };
  groups: [groupId: number, products: number, priced: number][];              // the F2b hold memory (hysteresis): what the importer reads next time instead of Neon
  guards: { flagChange: string | null; groupHold: number[]; storeHold: string[]; configChanged: boolean; countsOk: boolean };
  previous: { files: number; cards: number; listed: number; tracked: number; oracles: number } | null;   // the counts of the publish before this one (the admin's "change since yesterday" and FILES_DROP_10)
  refusals: { at: string; seq: number; code: string; message: string }[];     // newest 20
  runs: RunRecord[];                                                           // newest 30: the admin's "last import run result"
  repo: { kb: number | null; at: string; trend: [day: string, kb: number][]; isPrivate: boolean | null; lastSquashAt: string | null };   // GitHub API `size`, once a day, 400 days
  token: { expiresAt: string | null; daysLeft: number | null; checkedAt: string } | null;
  hosts: { at: string; raw: { ok: boolean; ms: number }; api: { ok: boolean; ms: number } } | null;
  alarms: Alarm[];
}

export const POINTER_STALE_HOURS = 36, REPO_WARN_KB = 1_572_864, REPO_CRIT_KB = 3_145_728 /* 1.5 GB, 3 GB in KB as GitHub reports */, ROTATION_HORIZON_DAYS = 60, SQUASH_OVERDUE_DAYS = 10, TOKEN_WARN_DAYS = 30, TOKEN_BAD_DAYS = 7, KEEPALIVE_WARN_DAYS = 50, PREVIEW_STALE_HOURS = 48;
export interface WatchInput {
  now: Date; pointer: PointerFile | null; status: StatusFile | null;
  headIsUnpointedDataCommit: { sha: string; ageMinutes: number } | null;       // the branch head is a data commit that no pointer names
  servedRef: string | null; minutesSincePointerPush: number | null;              // /api/data-status of the live site
  manifestMismatch: boolean; allowPublic?: boolean; mainLastCommitAgeDays: number | null;
}
const hoursSince = (iso: string | null | undefined, now: Date): number | null => (iso && Number.isFinite(Date.parse(iso)) ? (now.getTime() - Date.parse(iso)) / 3_600_000 : null);
/** Days until the trend reaches `limitKb`, from the last up to 14 daily samples; null when flat, shrinking or too short. A 14-day trend (not one day) because GitHub's server-side maintenance timing is undocumented (critique DP-16). */
export function daysToLimit(trend: readonly [string, number][], limitKb: number): number | null {
  const t = trend.slice(-14); if (t.length < 5) return null;
  const slope = (t[t.length - 1]![1] - t[0]![1]) / (t.length - 1); if (!(slope > 0)) return null;
  return Math.max(0, Math.floor((limitKb - t[t.length - 1]![1]) / slope));
}
/** Every alarm rule of 12.10.3, as a function of its inputs. The caller records `since` from the previous status when the alarm was already raised. */
export function computeAlarms(i: WatchInput): Alarm[] {
  const out: Alarm[] = []; const at = i.now.toISOString(); const prev = new Map((i.status?.alarms ?? []).map((a) => [a.code, a.since] as const));
  const raise = (code: AlarmCode, level: Alarm["level"], message: string) => out.push({ code, level, since: prev.get(code) ?? at, message });
  const s = i.status, p = i.pointer;
  const age = hoursSince(p?.publishedAt, i.now);
  if (!p) raise("STALE_36H", "error", "no pointer could be read");
  else if (age != null && age >= POINTER_STALE_HOURS) raise("STALE_36H", "error", `the pointer is ${Math.round(age)} hours old`);
  if (s) {
    const lastTwo = s.runs.filter((r) => r.kind === "catalog" || r.kind === "full").slice(0, 2);
    if (lastTwo.length === 2 && lastTwo.every((r) => r.kind === "catalog")) raise("STORE_STALE", "warn", "the last two publishes were catalogue-only: the store stage failed or timed out twice");
    const prevC = s.previous;
    if (prevC) {
      if (s.counts.files < prevC.files * 0.9) raise("FILES_DROP_10", "error", `the file count fell from ${prevC.files} to ${s.counts.files}`);
      for (const k of ["cards", "listed", "tracked", "oracles"] as const) if (s.counts[k] < prevC[k] * 0.9) raise("COUNT_COLLAPSE", "error", `${k} fell from ${prevC[k]} to ${s.counts[k]}`);
    }
    const newest = s.runs[0]; if (newest?.kind === "refused") raise("REFUSED", "error", `the newest publish was refused: ${s.refusals[0]?.message ?? newest.note}`);
    if (s.hosts) { if (!s.hosts.raw.ok && !s.hosts.api.ok) raise("HOST_DOWN", "error", "neither raw nor the contents API answered the probe twice"); else if (!s.hosts.raw.ok) raise("HOST_DOWN", "warn", "raw.githubusercontent.com failed the probe; the API fallback answers"); }
    const kb = s.repo.kb;
    if (kb != null) {
      if (kb >= REPO_CRIT_KB) raise("REPO_SIZE_CRIT", "error", `the data repository is ${Math.round(kb / 1024)} MB (stop line 3 GB)`);
      else if (kb >= REPO_WARN_KB) raise("REPO_SIZE_WARN", "warn", `the data repository is ${Math.round(kb / 1024)} MB (alarm line 1.5 GB): run an extra squash and judge by the 14-day trend`);
      const d = daysToLimit(s.repo.trend, REPO_CRIT_KB); if (d != null && d <= ROTATION_HORIZON_DAYS) raise("ROTATION_DUE", "warn", `the size trend reaches 3 GB in ${d} days: rotate the data to a new repository (12.5.7)`);
    }
    const sq = hoursSince(s.repo.lastSquashAt, i.now); if (sq != null && sq >= SQUASH_OVERDUE_DAYS * 24) raise("SQUASH_OVERDUE", "warn", `no squash for ${Math.floor(sq / 24)} days`);
    if (s.repo.isPrivate === false && !i.allowPublic) raise("DATA_REPO_PUBLIC", "error", "the data repository is PUBLIC: premium inputs and licensed data are world-readable (12.3.3); set it private or PLANE_ALLOW_PUBLIC=1 knowingly");
    if (s.token) {
      if (s.token.daysLeft != null && s.token.daysLeft <= TOKEN_BAD_DAYS) raise("TOKEN_EXPIRING", "error", `the read token expires in ${s.token.daysLeft} days; after that EVERY file read answers 404 (measured)`);
      else if (s.token.daysLeft != null && s.token.daysLeft <= TOKEN_WARN_DAYS) raise("TOKEN_EXPIRING", "warn", `the read token expires in ${s.token.daysLeft} days`);
    }
    const pv = hoursSince(s.pointer.pvAt, i.now); if (pv != null && pv >= PREVIEW_STALE_HOURS) raise("PREVIEW_STALE", "warn", `the free demand and rising preview slices are ${Math.round(pv)} hours old (the demand snapshot or Neon is failing)`);
  }
  if (i.manifestMismatch) raise("MANIFEST_MISMATCH", "error", "a sampled file's sha-256 differs from the manifest of the pointed commit");
  if (i.headIsUnpointedDataCommit && i.headIsUnpointedDataCommit.ageMinutes > 30) raise("UNPOINTED_DATA_COMMIT", "warn", `data commit ${i.headIsUnpointedDataCommit.sha.slice(0, 7)} is ${Math.round(i.headIsUnpointedDataCommit.ageMinutes)} minutes old and no pointer names it (a crashed publish; harmless)`);
  if (p && i.servedRef && i.servedRef !== p.ref && (i.minutesSincePointerPush ?? 0) > 15) raise("POINTER_BEHIND", "warn", `the site still serves ${i.servedRef.slice(0, 7)} ${Math.round(i.minutesSincePointerPush ?? 0)} minutes after the pointer moved to ${p.ref.slice(0, 7)}`);
  if (i.mainLastCommitAgeDays != null && i.mainLastCommitAgeDays >= KEEPALIVE_WARN_DAYS) raise("KEEPALIVE_DUE", "error", `main has had no commit for ${Math.floor(i.mainLastCommitAgeDays)} days: GitHub disables scheduled workflows of a public repository after 60 days without activity`);
  return out;
}
/** Set by the pointer reader (PointerState.tokenRejected) or by the watchdog's own probe: every file answers 404. */
export const tokenRejectedAlarm = (now: Date, since?: string): Alarm => ({ code: "TOKEN_REJECTED", level: "error", since: since ?? now.toISOString(), message: "the data host answers 404 to the read token: it is expired, revoked or lost access to the repository" });

// ── the admin panel's shape (section 15.3 of the contract): every field is nullable; the parser tolerates absence ───────────────────────────────────────────
export type FileKind = "catalogue" | "prices" | "history" | "offers" | "views" | "premium";
const KIND: Record<string, FileKind> = { cat: "catalogue", slug: "catalogue", sc: "catalogue", or: "catalogue", nm: "catalogue", meta: "catalogue", sm: "catalogue", "ix/dict": "catalogue", "ix/k": "catalogue", "ix/o": "catalogue", px: "prices", "ix/p": "prices", "hist/p": "history", "hist/t": "history", "hist/w": "history", "hist/index": "history", un: "offers", of: "offers", "ix/s": "offers", "ix/f": "offers", "sl/d": "offers", "ss/runs": "offers", "ss/l": "offers", st: "views", "sl/list": "views", mv: "views", mk: "views", hm: "views", pv: "premium" };
export const kindOfFamily = (name: string): FileKind => KIND[name] ?? "views";
export interface PublicationStatus {
  pointer: { sha: string | null; ref: string | null; prev: string | null; publishedAt: string | null; dataDay: string | null; phase: "catalog" | "full" | null };
  files: { total: number | null; bytes: number | null; byKind: Partial<Record<FileKind, { files: number; bytes: number }>>; previous: number | null };
  repo: { sizeKb: number | null; budgetKb: number; history: [string, number][] };
  run: { ok: boolean | null; startedAt: string | null; finishedAt: string | null; mode: RunKind | null; errors: string[]; guards: { flagChange: string | null; groupHold: number[]; storeHold: string[]; configChanged: boolean } | null };
  sources: { tcgcsvLastUpdated: string | null; scryfallBuild: string | null };
  format: { version: string | null; previousVersion: string | null };
  catalog: { rows: number | null; listed: number | null; thin: number | null; tracked: number | null; oracles: number | null };
  token: { daysLeft: number | null };
  alarms: Alarm[];
}
export function publicationStatusOf(s: StatusFile | null | undefined, p?: PointerFile | null): PublicationStatus {
  const ptr = s?.pointer ?? null; const run = s?.runs?.[0] ?? null; const byKind: PublicationStatus["files"]["byKind"] = {};
  for (const [name, files, raw] of s?.families ?? []) { const k = kindOfFamily(name); const e = (byKind[k] ??= { files: 0, bytes: 0 }); e.files += files; e.bytes += raw; }
  return {
    pointer: { sha: ptr?.ref ?? p?.ref ?? null, ref: ptr?.ref ?? p?.ref ?? null, prev: ptr?.prev ?? p?.prev ?? null, publishedAt: ptr?.publishedAt ?? p?.publishedAt ?? null, dataDay: ptr?.priceDay ?? p?.priceDay ?? null, phase: ptr?.phase ?? p?.phase ?? null },
    files: { total: s?.counts?.files ?? null, bytes: s?.counts?.bytesRaw ?? null, byKind, previous: s?.previous?.files ?? null },
    repo: { sizeKb: s?.repo?.kb ?? null, budgetKb: REPO_CRIT_KB, history: (s?.repo?.trend ?? []).slice(-90) },
    run: { ok: run ? run.ok : null, startedAt: run?.startedAt ?? null, finishedAt: run?.at ?? null, mode: run?.kind ?? null, errors: run?.errors ?? (run && !run.ok ? [run.note] : []), guards: s ? { flagChange: s.guards.flagChange, groupHold: s.guards.groupHold, storeHold: s.guards.storeHold, configChanged: s.guards.configChanged } : null },
    sources: { tcgcsvLastUpdated: ptr?.tcgcsv ?? p?.tcgcsv ?? null, scryfallBuild: ptr?.scryfall ?? p?.scryfall ?? null },
    format: { version: ptr?.format ?? p?.format ?? null, previousVersion: null },
    catalog: { rows: s?.counts?.cards ?? null, listed: s?.counts?.listed ?? null, thin: s?.counts?.thin ?? null, tracked: s?.counts?.tracked ?? null, oracles: s?.counts?.oracles ?? null },
    token: { daysLeft: s?.token?.daysLeft ?? null },
    alarms: s?.alarms ?? [],
  };
}
