import type { prisma } from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// PAUSE ALERT EMAILS, KEEP THE WATCHLIST (2026-09-25).
// ─────────────────────────────────────────────────────────────────────────────
// The footer of every alert email used to say "Unsubscribe from price-drop
// emails" and DELETE every PriceAlert row for the address — every watch, and a
// Plus member's every target — when most people only wanted fewer emails. Now:
//   • pause   — an AlertMute row for the address: no alert email from any run,
//               watchlist untouched (the default, and the only thing the
//               List-Unsubscribe one-click POST can do: it is reversible)
//   • resume  — delete that row
//   • delete  — delete every watch for the address: an explicit, separate
//               button on the page, never a link's default
//   • remove  — delete one watch (the manage page's per-card button)
// All addressed by the address's PriceAlert.unsubToken (a random UUID shared
// by every row of the address), exactly as the old unsubscribe was: no session,
// because the click comes from a mail client with no cookie.
//
// The route (src/app/api/alerts/unsubscribe) is a thin shell over these so the
// logic is tested against a stub client. Every read is scoped by the token and
// capped. (RiftCompare's lib/alert-mute.ts, ported in wave 2, 2026-10-03.)

export type AlertMuteDb = {
  priceAlert: Pick<typeof prisma.priceAlert, "findFirst" | "findMany" | "deleteMany">;
  alertMute: Pick<typeof prisma.alertMute, "findUnique" | "upsert" | "deleteMany">;
};

export type AlertEmailMode = "pause" | "resume" | "delete" | "remove";

export interface AlertEmailSummary {
  active: boolean; // any watch for this token
  email?: string; // masked
  paused: boolean;
  count: number;
  cards: { id: string; name: string; setCode: string; number: string | null; market: string; snoozedUntil: string | null }[];
}

// Mask an email for display on the (public, token-addressed) page so the full
// address is never echoed back. "bill.jyang101@gmail.com" → "bi***@gmail.com".
export function maskEmail(email: string): string {
  const [local = "", domain] = email.split("@");
  if (!domain) return "your email";
  const head = local.slice(0, 2);
  return `${head}${local.length > 2 ? "***" : "*"}@${domain}`;
}

// The address a token covers, or null (bad link, or every watch deleted). A
// paused address with no watches left is not addressable any more — nothing
// would email it anyway.
async function addressFor(db: AlertMuteDb, token: string): Promise<string | null> {
  if (!token) return null;
  const row = await db.priceAlert.findFirst({ where: { unsubToken: token }, select: { email: true } });
  return row?.email ?? null;
}

export async function alertEmailSummary(db: AlertMuteDb, token: string): Promise<AlertEmailSummary> {
  if (!token) return { active: false, paused: false, count: 0, cards: [] };
  const rows = await db.priceAlert.findMany({
    where: { unsubToken: token },
    orderBy: { createdAt: "desc" },
    // The subscribe route caps one request at 500 cards; this is a page, not an export.
    take: 500,
    select: { id: true, email: true, market: true, snoozedUntil: true, card: { select: { name: true, variant: true, number: true, set: { select: { code: true } } } } },
  });
  if (rows.length === 0) return { active: false, paused: false, count: 0, cards: [] };
  const email = rows[0]!.email;
  const mute = await db.alertMute.findUnique({ where: { email }, select: { email: true } });
  return {
    active: true,
    email: maskEmail(email),
    paused: mute != null,
    count: rows.length,
    cards: rows.map((r) => ({
      id: r.id,
      name: `${r.card.name}${r.card.variant ? ` (${r.card.variant})` : ""}`,
      setCode: r.card.set.code,
      number: r.card.number,
      market: r.market,
      snoozedUntil: r.snoozedUntil ? r.snoozedUntil.toISOString() : null,
    })),
  };
}

export async function pauseAddress(db: Pick<AlertMuteDb, "alertMute">, email: string, source: string, now: Date = new Date()): Promise<void> {
  await db.alertMute.upsert({ where: { email }, create: { email, source, mutedAt: now }, update: {} });
}

export async function resumeAddress(db: Pick<AlertMuteDb, "alertMute">, email: string): Promise<void> {
  await db.alertMute.deleteMany({ where: { email } });
}

export interface AlertEmailResult {
  status: number;
  body: Record<string, unknown>;
}

/** Apply one mode for a token. Pause is the default everywhere a mode is optional. */
export async function applyAlertEmailMode(
  db: AlertMuteDb,
  token: string,
  mode: AlertEmailMode,
  opts: { alertId?: string; source?: string; now?: Date } = {},
): Promise<AlertEmailResult> {
  const email = await addressFor(db, token);
  if (!email) return { status: 404, body: { ok: false, error: "This link is not valid, or there are no watches left on it." } };
  switch (mode) {
    case "pause":
      await pauseAddress(db, email, opts.source ?? "page", opts.now);
      return { status: 200, body: { ok: true, paused: true } };
    case "resume":
      await resumeAddress(db, email);
      return { status: 200, body: { ok: true, paused: false } };
    case "delete": {
      const res = await db.priceAlert.deleteMany({ where: { unsubToken: token } });
      return { status: 200, body: { ok: true, removed: res.count } };
    }
    case "remove": {
      if (!opts.alertId) return { status: 400, body: { ok: false, error: "Which card?" } };
      // Scoped by the token AND the id: a token can only remove its own rows.
      const res = await db.priceAlert.deleteMany({ where: { unsubToken: token, id: opts.alertId } });
      return { status: res.count ? 200 : 404, body: { ok: res.count > 0, removed: res.count } };
    }
  }
}

/**
 * The addresses among `emails` that are paused — read once per alert run, for
 * the addresses it is about to email only. A failed read THROWS: emailing an
 * address that asked for no email is worse than a run that retries next time.
 */
export async function pausedAddresses(db: { alertMute: Pick<typeof prisma.alertMute, "findMany"> }, emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const rows = await db.alertMute.findMany({ where: { email: { in: emails } }, select: { email: true }, take: emails.length });
  return new Set(rows.map((r) => r.email));
}

const MODES: readonly AlertEmailMode[] = ["pause", "resume", "delete", "remove"];

/** The page's JSON body (RiftCompare's zod schema, written out). null = 400. */
export function parseUnsubscribeBody(raw: unknown): { token: string; mode: AlertEmailMode; alertId?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.token !== "string" || b.token.length < 1 || b.token.length > 200) return null;
  const mode = b.mode === undefined ? "pause" : b.mode;
  if (typeof mode !== "string" || !MODES.includes(mode as AlertEmailMode)) return null;
  if (b.alertId !== undefined && (typeof b.alertId !== "string" || b.alertId.length < 1 || b.alertId.length > 64)) return null;
  return { token: b.token, mode: mode as AlertEmailMode, ...(typeof b.alertId === "string" ? { alertId: b.alertId } : {}) };
}
