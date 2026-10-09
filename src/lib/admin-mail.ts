// The data of /admin/mail (contract 15.2): what the mail runners have recorded and how many people and watches are waiting on them. Owner-only traffic, so UNCACHED by design
// (unstable_cache lives in src/lib/data only), and every count is a narrow query; the page wraps the call in try/catch so a Neon outage renders "Neon unreachable", never a failed page.
// It reads and never sends: mail goes out script-side from GitHub Actions only (tests/no-email-api.test.ts), and `email` is what the last run FOUND (Meta "email", written by
// lib/email-status.ts), while `siteSays` is what the public pages promise (the EMAIL_STATUS switch, data/email.ts). The two differing is the thing to look at.
import { prisma } from "./db";
import { getEmailStatus } from "./data/email";

type Db = typeof prisma;
const DAY = 86_400_000;

export interface MailStatus {
  email: "on" | "off" | null;
  /** What the public pages promise right now (the EMAIL_STATUS switch). */
  siteSays: "on" | "off";
  newsletter: { total: number; last7: number; confirmed: number };
  alerts: { price: number; sealed: number; deck: number; release: number; muted: number };
  lastRun: string | null;
  recent: { type: string; createdAt: Date }[];
}

export async function loadMailStatus(db: Db = prisma, now = new Date()): Promise<MailStatus> {
  const since = new Date(now.getTime() - 7 * DAY);
  const [email, total, last7, confirmed, price, sealed, deck, release, muted, run, recent, siteSays] = await Promise.all([
    db.meta.findUnique({ where: { key: "email" }, select: { value: true } }),
    db.newsletterSubscriber.count(),
    db.newsletterSubscriber.count({ where: { createdAt: { gte: since } } }),
    db.newsletterSubscriber.count({ where: { welcomeSentAt: { not: null } } }),
    db.priceAlert.count(),
    db.sealedWatch.count(),
    db.deckWatch.count(),
    db.setReleaseAlert.count(),
    db.alertMute.count(),
    db.meta.findFirst({ where: { key: { startsWith: "alerts." } }, orderBy: { updatedAt: "desc" }, select: { key: true, value: true, updatedAt: true } }),
    db.notification.findMany({ select: { type: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    getEmailStatus(),
  ]);
  return {
    email: email?.value === "on" || email?.value === "off" ? email.value : null,
    siteSays,
    newsletter: { total, last7, confirmed },
    alerts: { price, sealed, deck, release, muted },
    lastRun: run ? `${run.key}: ${run.value.slice(0, 200)} (${run.updatedAt.toISOString()})` : null,
    recent: recent.map((r) => ({ type: r.type, createdAt: r.createdAt })),
  };
}
