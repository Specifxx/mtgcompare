import { prisma } from "./db";

/**
 * "When did this account last USE the site", and "how many distinct days has
 * it used the site" — RiftCompare's lib/activity.ts, ported in wave 2
 * (2026-10-03). lastLoginAt records authentication (the OAuth callback), an
 * event a daily visitor might not repeat for a month; these two answer the
 * questions the admin accounts page actually asks.
 *
 * THE WRITE IS THROTTLED, AND THAT IS THE WHOLE DESIGN. MTG Compare's root
 * layout never reads the session, so the stamp runs where getCurrentUser
 * already does: /api/me (the header asks once per signed-in page view) and
 * the account pages. Stamping unconditionally would still be one UPDATE per
 * signed-in page view, so:
 *
 *   • The READ is free: getCurrentUser's one select-limited row already
 *     carries lastActiveAt and activeDays.
 *   • The WRITE happens at most once per ACTIVITY_STAMP_INTERVAL_MS per user
 *     (an hour of browsing is 2 writes, not 60), or on a new UTC day.
 *   • It is never awaited, and a failure costs nothing but a stale number.
 *
 * Days are UTC days here (RiftCompare buckets by Sydney; MTG Compare's import
 * and history files are UTC throughout).
 */
export const ACTIVITY_STAMP_INTERVAL_MS = 30 * 60_000;

export interface ActivityRow {
  id: string;
  lastActiveAt: Date | null;
  activeDays: number;
}

/** "2026-10-03" — the UTC calendar day of an instant. */
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** What should be written for this row, or null when nothing should be. Pure. */
export function activityUpdate(
  row: Pick<ActivityRow, "lastActiveAt" | "activeDays">,
  now = new Date(),
): { lastActiveAt: Date; activeDays?: { increment: 1 } } | null {
  const last = row.lastActiveAt;
  if (!last) return { lastActiveAt: now, activeDays: { increment: 1 } };
  // A NEW CALENDAR DAY always writes, however recently they were here: 23:58
  // then 00:02 is two days even though it is four minutes.
  if (utcDay(now) !== utcDay(last)) return { lastActiveAt: now, activeDays: { increment: 1 } };
  if (now.getTime() - last.getTime() < ACTIVITY_STAMP_INTERVAL_MS) return null;
  return { lastActiveAt: now };
}

/** Record that this account is using the site, if enough has changed to be worth a write. Fire-and-forget. */
export function touchActivity(row: ActivityRow, now = new Date()): void {
  const data = activityUpdate(row, now);
  if (!data) return;
  void prisma.user.update({ where: { id: row.id }, data }).catch(() => {
    /* bookkeeping only — a dropped stamp must never surface to the visitor */
  });
}
