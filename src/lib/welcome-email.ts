// The one-time welcome email to a NEW account — the run half (the template is
// buildWelcomeEmail in lib/email.ts). RiftCompare's lib/welcome-email.ts,
// ported in wave 2 (2026-10-03) without the trial variant: MTG Compare offers
// no trial, so every new account gets the one ordinary welcome, whose copy
// names only features that ship (lib/plans.ts, lib/free-limits.ts).
//
// Called hourly by scripts/email-hourly.ts (.github/workflows/email.yml), in
// GitHub Actions: the mail keys never reach Vercel.
//
// WHO: accounts created in the last WELCOME_WINDOW_HOURS that have not had it
// (welcomeEmailSentAt null), excluding admins (the flag or an admin address).
// The window is what keeps the first run with email on from mailing every
// account that already existed — they are simply outside it — and it bounds
// the query. Accounts younger than MIN_AGE_MINUTES wait for the next run, so an
// OAuth sign-up still mid-redirect is never emailed before it has landed.
//
// EMAIL OFF: nothing is claimed. Stamping welcomeEmailSentAt while the mailer
// is off would mark the email sent when it never was.
//
// EXACTLY ONCE: each account is CLAIMED with a conditional update (only while
// welcomeEmailSentAt is still null) before anything is sent, so two overlapping
// runs cannot both send. A failed send releases the claim so the next hour
// retries; the window caps that at three days of attempts.
import { prisma } from "./db";
import { isAdminEmail } from "./admin-emails";
import { isEmailEnabled, sendWelcomeEmail } from "./email";

export const WELCOME_WINDOW_HOURS = 72;
export const MIN_AGE_MINUTES = 5;
const BATCH = 100;

export interface WelcomeRunSummary {
  candidates: number;
  sent: number;
  failed: number;
  skipped: "email-off" | null;
}

// `db` exists so tests can run the claim logic against a stub; the run passes nothing.
export async function runWelcomeEmails(now = Date.now(), send = sendWelcomeEmail, db: Pick<typeof prisma, "user"> = prisma): Promise<WelcomeRunSummary> {
  if (!isEmailEnabled()) return { candidates: 0, sent: 0, failed: 0, skipped: "email-off" };
  const users = await db.user.findMany({
    where: {
      welcomeEmailSentAt: null,
      isAdmin: false,
      createdAt: { gte: new Date(now - WELCOME_WINDOW_HOURS * 3600_000), lte: new Date(now - MIN_AGE_MINUTES * 60_000) },
    },
    select: { id: true, email: true, displayName: true },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });

  let sent = 0;
  let failed = 0;
  for (const u of users) {
    if (isAdminEmail(u.email)) continue;
    const claim = await db.user.updateMany({
      where: { id: u.id, welcomeEmailSentAt: null },
      data: { welcomeEmailSentAt: new Date() },
    });
    if (claim.count === 0) continue; // another run got there first

    let ok = false;
    try {
      ok = await send(u.email, { displayName: u.displayName });
    } catch {
      ok = false;
    }
    if (ok) {
      sent++;
    } else {
      failed++;
      await db.user.update({ where: { id: u.id }, data: { welcomeEmailSentAt: null } }).catch(() => {});
    }
  }
  return { candidates: users.length, sent, failed, skipped: null };
}
