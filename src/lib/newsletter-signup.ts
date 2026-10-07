import { randomUUID } from "crypto";
import { prisma } from "./db";
import { normalizeCountry, type Country } from "./country";

// THE NEWSLETTER SIGNUP — the request-time half of lib/newsletter.ts, split out
// in wave 2 (2026-10-03) so the routes and pages that take a signup or an
// unsubscribe import NO sending code: this module writes and deletes rows and
// never imports lib/email.ts (tests/no-email-api.test.ts). Sends happen only
// in scripts/newsletter.ts and scripts/email-hourly.ts.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const NEWSLETTER_SOURCES = ["footer", "movers", "article", "alerts"] as const;

/** Parse a signup body; null when it is not one. */
export function parseNewsletterBody(body: unknown): { email: string; market: Country; source: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null;
  const market = normalizeCountry(typeof b.market === "string" ? b.market : null);
  const src = typeof b.source === "string" && (NEWSLETTER_SOURCES as readonly string[]).includes(b.source) ? b.source : null;
  return { email, market, source: src };
}

/**
 * Add an address to the list. Nothing is sent here: the hourly outbox
 * (scripts/email-hourly.ts drainNewsletterWelcomes) sends the welcome and
 * stamps welcomeSentAt. A repeat signup only refreshes the market.
 */
export async function subscribeNewsletter(input: { email: string; market: Country; source: string | null }): Promise<{ created: boolean }> {
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    await prisma.newsletterSubscriber.update({ where: { id: existing.id }, data: { market: input.market } });
    return { created: false };
  }
  await prisma.newsletterSubscriber
    .create({ data: { email: input.email, market: input.market, source: input.source, unsubToken: randomUUID() } })
    .catch((e: unknown) => {
      // A double-submit race lands on the unique email: already subscribed.
      if ((e as { code?: string }).code !== "P2002") throw e;
    });
  return { created: true };
}

/** What an unsubscribe token covers, for the confirm page. Select-limited. */
export async function newsletterSummaryForToken(token: string): Promise<{ active: boolean; email?: string }> {
  if (!token || token.length > 100) return { active: false };
  const sub = await prisma.newsletterSubscriber.findUnique({ where: { unsubToken: token }, select: { email: true } });
  return sub ? { active: true, email: sub.email } : { active: false };
}

/** Remove an address by its unsubscribe token. true when a row was removed. */
export async function unsubscribeNewsletter(token: string): Promise<boolean> {
  if (!token || token.length > 100) return false;
  const r = await prisma.newsletterSubscriber.deleteMany({ where: { unsubToken: token } });
  return r.count > 0;
}

