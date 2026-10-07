import { prisma } from "./db";

// THE IN-APP NOTIFICATION FEED — RiftCompare's lib/notifications.ts and the
// reads behind /api/notifications, ported in wave 2 (2026-10-03).
//
// In RiftCompare a notification is the in-app mirror of an email. OP Compare
// sends no email until a mailer is configured (getEmailStatus), so here a
// notification IS the alert's delivery: the alert run (scripts/alerts.ts,
// collection-alerts track) writes one per trigger through notify(), the
// /dashboard "Recent alerts" panel lists them, and the header heart carries a
// dot while any is unread (the count rides /api/me — no polling).
//
// Cross-track contract (wave2-plan §4): notify(userId, type, title, body, href).
// Always call it fire-and-forget (.catch(() => {})): a failed insert must never
// fail the run that triggered it.
//
// Egress: every read is scoped to one account and bounded (30 rows, one
// indexed count on [userId, readAt]). Called only from /api/* routes and
// account pages (CLAUDE.md, the accounts exception).
export async function notify(userId: string, type: string, title: string, body: string, href?: string | null): Promise<void> {
  await prisma.notification.create({ data: { userId, type, title, body, href: href ?? null } });
}

export const FEED_SIZE = 30;

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
}

/** The newest notifications and the unread count, for one account. */
export async function notificationFeed(userId: string, take = FEED_SIZE): Promise<{ notifications: NotificationRow[]; unreadCount: number }> {
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, take), FEED_SIZE),
      select: { id: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true },
    }),
    unreadCount(userId),
  ]);
  return { notifications, unreadCount: unread };
}

/** One indexed count. */
export function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/** Parse the mark-read body: `{ id }` or `{ all: true }`. */
export function parseReadBody(raw: unknown): { id?: string; all?: true } | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (b.all === true) return { all: true };
  if (typeof b.id === "string" && b.id.length > 0 && b.id.length <= 64) return { id: b.id };
  return null;
}

/** Mark one notification (or the whole feed) read; the userId in the where is the ownership check. */
export async function markRead(userId: string, which: { id?: string; all?: true }): Promise<number> {
  const res = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(which.id ? { id: which.id } : {}) },
    data: { readAt: new Date() },
  });
  return res.count;
}
