// Support and contact confirmation emails (parity P37): one to the owner's inbox (CONTACT_EMAIL) so a ticket lands where it is read,
// one confirmation back to the sender with their ticket number as a reference. RiftCompare sends these at request time; MTG Compare sends
// nothing from a request (tests/no-email-api.test.ts): src/lib/inbox.ts writes the SupportTicket row and the hourly outbox
// (scripts/email-hourly.ts) calls these for tickets not yet answered, gated on isEmailEnabled() like every sender. Nothing under src/app imports this.
import { prisma } from "./db";
import { EMAIL_COLORS as C, emailShell, escapeHtml, isEmailEnabled, sendEmail } from "./email";
import { formatTicketNumber } from "./order-number";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "./site";

/** The ticket reference people quote: "MC-<number>". */
export const ticketRef = (n: number): string => formatTicketNumber(n)!;

export interface SupportTicketInfo {
  number: number;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
}

const footer = (): string => `<tr><td style="padding:16px 32px 26px;border-top:1px solid ${C.border};font-size:12px;color:${C.muted}">${escapeHtml(SITE_NAME)} Support</td></tr>`;

export interface BuiltSupportEmail { to: string; subject: string; html: string }

/** Pure: the notification to the owner's inbox. Everything needed to act, plus the admin link. A subject line never carries a newline. */
export function buildTicketNotification(t: SupportTicketInfo, to: string = CONTACT_EMAIL): BuiltSupportEmail {
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;color:${C.text}"><strong style="color:${C.white}">${ticketRef(t.number)}</strong> · ${escapeHtml(t.category)}</td></tr>
    <tr><td style="padding:4px 32px 4px;font-size:14px;color:${C.white}">From: ${escapeHtml(t.name)} &lt;${escapeHtml(t.email)}&gt;</td></tr>
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:${C.text};white-space:pre-wrap">${escapeHtml(t.message)}</td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/admin/support" style="display:inline-block;background:${C.button};color:${C.buttonInk};font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Open in admin</a></td></tr>`;
  return { to, subject: `[${ticketRef(t.number)}] ${t.subject.replace(/[\r\n]+/g, " ")}`, html: emailShell("New support ticket", inner, footer()) };
}

/** Pure: the confirmation back to the sender. */
export function buildTicketConfirmation(t: SupportTicketInfo): BuiltSupportEmail {
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:${C.text}">
      We've received your message (ticket <strong style="color:${C.white}">${ticketRef(t.number)}</strong>) and will reply by email, usually within a day or two.
    </td></tr>`;
  return { to: t.email, subject: `We got your message: ${ticketRef(t.number)}`, html: emailShell("Ticket received", inner, footer()) };
}

/** Sends both, only while email is on; the notification is skipped (and the confirmation still goes) when CONTACT_EMAIL is the .invalid placeholder. */
export async function sendTicketEmails(t: SupportTicketInfo, send: (e: BuiltSupportEmail) => Promise<boolean> = (e) => sendEmail(e.to, e.subject, e.html), enabled: boolean = isEmailEnabled()): Promise<{ notified: boolean; confirmed: boolean }> {
  if (!enabled) return { notified: false, confirmed: false };
  const notification = buildTicketNotification(t);
  const notified = notification.to.endsWith(".invalid") ? false : await send(notification);
  const confirmed = await send(buildTicketConfirmation(t));
  return { notified, confirmed };
}

// ── The outbox ───────────────────────────────────────────────────────────────

/** A ticket is mailed only while it is this new: an older one predates the mailer (or was refused for days) and is read in the admin instead. */
export const SUPPORT_MAIL_WINDOW_MS = 72 * 3600_000;
export const SUPPORT_MAIL_PER_RUN = 20;
export const supportMailKey = (number: number): string => `support-mail:${number}`;

export interface SupportMailSummary { pending: number; sent: number; failed: number; skipped: number }

/**
 * Mail the tickets written since the last run: claim-before-send on a Counter row per ticket (a rerun, or two runs at once, mails a ticket once), the claim
 * released after a failed send so the next hour retries it. Email off: nothing is claimed, so the first run with email on finds every recent ticket.
 */
export async function drainSupportEmails(
  now: Date = new Date(),
  io: { db?: Pick<typeof prisma, "supportTicket" | "counter">; send?: typeof sendTicketEmails; enabled?: boolean } = {},
): Promise<SupportMailSummary> {
  const db = io.db ?? prisma;
  const summary: SupportMailSummary = { pending: 0, sent: 0, failed: 0, skipped: 0 };
  if (!(io.enabled ?? isEmailEnabled())) return summary;
  const tickets = await db.supportTicket.findMany({
    where: { createdAt: { gte: new Date(now.getTime() - SUPPORT_MAIL_WINDOW_MS) } },
    orderBy: { createdAt: "asc" },
    take: SUPPORT_MAIL_PER_RUN * 4,
    select: { number: true, name: true, email: true, category: true, subject: true, message: true },
  });
  summary.pending = tickets.length;
  for (const t of tickets) {
    if (summary.sent + summary.failed >= SUPPORT_MAIL_PER_RUN) break;
    const key = supportMailKey(t.number);
    const claim = await db.counter.createMany({ data: [{ key, value: 1 }], skipDuplicates: true });
    if (claim.count === 0) {
      summary.skipped++; // already mailed
      continue;
    }
    const r = await (io.send ?? sendTicketEmails)(t, undefined, true);
    if (r.confirmed) summary.sent++;
    else {
      summary.failed++;
      await db.counter.deleteMany({ where: { key } });
    }
  }
  return summary;
}
