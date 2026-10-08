// src/lib/release-schedule.ts (owner WP21, FROZEN). When production ships CODE: once a week. Pure and client-safe; no I/O.
// The cron below is the SAME string as .github/workflows/production-deploy.yml (tests/deploy-cadence.test.ts pins the two together), so /admin/deploys, the docs and CLAUDE.md quote one fact.
// Data does not wait for this: the daily import publishes prices, stores and history to the data repository and moves one pointer (nothing is purged or deployed); a week-old deployment serves today's prices (contract sections 12 and 13).
export const RELEASE_CRON = "0 8 * * 2";
export const RELEASE = { weekday: 2, weekdayName: "Tuesday", hourUtc: 8, minuteUtc: 0 } as const;          // 0 = Sunday, as cron and Date#getUTCDay
export const RELEASE_SUBJECT = "release: weekly production deploy [deploy]";
export const DEPLOY_MARKER = "[deploy]";
/** One sentence for the admin panel, the docs and the footer's "what's new" line. */
export const RELEASE_COPY = `Code ships once a week (${RELEASE.weekdayName} ${String(RELEASE.hourUtc).padStart(2, "0")}:${String(RELEASE.minuteUtc).padStart(2, "0")} UTC). Prices, stores and history are published every day and never wait for a release.`;

/** A five-field cron with a fixed minute, hour and single weekday: "M H * * D". null for anything else (so a daily or hourly cron fails the cadence test instead of passing silently). */
export function parseWeeklyCron(cron: string): { minute: number; hour: number; weekday: number } | null {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* ([0-6])$/.exec(cron.trim());
  if (!m) return null;
  const minute = Number(m[1]), hour = Number(m[2]), weekday = Number(m[3]);
  return minute <= 59 && hour <= 23 ? { minute, hour, weekday } : null;
}
const at = (d: Date, dayOffset: number): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayOffset, RELEASE.hourUtc, RELEASE.minuteUtc, 0, 0));
/** The first scheduled release strictly after `from`. */
export function nextRelease(from: Date): Date {
  for (let i = 0; i <= 7; i++) { const c = at(from, i); if (c.getUTCDay() === RELEASE.weekday && c.getTime() > from.getTime()) return c; }
  return at(from, 7);
}
/** The latest scheduled release at or before `from`. */
export function lastScheduledRelease(from: Date): Date {
  for (let i = 0; i >= -7; i--) { const c = at(from, i); if (c.getUTCDay() === RELEASE.weekday && c.getTime() <= from.getTime()) return c; }
  return at(from, -7);
}
/** Is a commit subject a release? The marker, case-insensitive, SUBJECT only (a body that discusses it does not count: scripts/vercel-ignore-build.sh). */
export const isReleaseSubject = (subject: string): boolean => subject.toLowerCase().includes(DEPLOY_MARKER);
/** A deployment older than this many days is "stale code" for the admin panel's amber light (one missed release plus a day). */
export const STALE_DEPLOY_DAYS = 8;
export interface DeployFacts { sha: string | null; subject: string | null; builtAt: string | null }
export function deployAgeDays(builtAtIso: string | null, now = new Date()): number | null {
  if (!builtAtIso) return null;
  const t = Date.parse(builtAtIso);
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / 86_400_000) : null;
}
