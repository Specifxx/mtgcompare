// The database half of the token-addressed alert routes (/api/alerts/action,
// /api/alerts/unsubscribe, /api/alerts/pause, /api/alerts/release/*) and their
// pages (/alerts/action, /alerts/manage, /unsubscribe, /alerts/release) —
// wave 2, 2026-10-03. Route and page files may not import @/lib/db
// (tests/app-no-db-import.test.ts), so they call these.
//
// Egress (CLAUDE.md, the accounts exception): every read is scoped by ONE
// unguessable token (an alert row's unsubToken, a release alert's unsubToken)
// or by the signed-in account's own address, select-limited and capped. Called
// only from those routes and pages, never from a cached loader or the layout.
import { randomUUID } from "crypto";
import { prisma } from "./db";
import { finishFromIndex, unitKey } from "./constants";
import { getCardsByIds, getSealedByIds, getSetBySlug, getSets } from "./data";
import { liveAlertCards, type AlertCardLoader } from "./alert-price";
import { normalizeCountry, type Country } from "./country";
import { RELEASE_ALERT_SOURCES, isUnreleased, releaseAlertSets, type ReleaseAlertSource } from "./release-alerts";
import { isPremium } from "./premium";
import { isAdminEmail } from "./admin-emails";
import { performAlertAction, type AlertActionDb, type AlertActionResult } from "./alert-actions";
import { alertEmailSummary, applyAlertEmailMode, pauseAddress, resumeAddress, type AlertEmailMode, type AlertEmailResult, type AlertEmailSummary, type AlertMuteDb } from "./alert-mute";

const actionDb = prisma as unknown as AlertActionDb;
const muteDb = prisma as unknown as AlertMuteDb;

export function applyAlertActionToken(token: string | null | undefined): Promise<AlertActionResult> {
  return performAlertAction(actionDb, token);
}

export function alertEmailSummaryForToken(token: string): Promise<AlertEmailSummary> {
  return alertEmailSummary(muteDb, token);
}

export function applyAlertEmailModeForToken(token: string, mode: AlertEmailMode, opts: { alertId?: string; source?: string } = {}): Promise<AlertEmailResult> {
  return applyAlertEmailMode(muteDb, token, mode, opts);
}

/** The signed-in account's own "Pause alert emails" switch (the /watching twin of the footer link). */
export async function setAccountAlertPause(email: string, paused: boolean): Promise<void> {
  if (paused) await pauseAddress(muteDb, email, "watchlist");
  else await resumeAddress(muteDb, email);
}

// ── Release alerts ───────────────────────────────────────────────────────────

export interface ReleaseTokenSummary {
  active: boolean;
  sets: { setSlug: string; setName: string; scope: string }[];
}

/** What a release alert's token covers (every row of that address shares it). */
export async function releaseAlertsForToken(token: string): Promise<ReleaseTokenSummary> {
  if (!token || token.length > 200) return { active: false, sets: [] };
  const rows = await prisma.setReleaseAlert.findMany({ where: { unsubToken: token }, select: { setSlug: true, scope: true }, take: 100 });
  if (!rows.length) return { active: false, sets: [] };
  const wanted = new Set(rows.map((r) => r.setSlug));
  const name = new Map((await getSets()).filter((s) => wanted.has(s.slug)).map((s) => [s.slug, s.name] as const));
  return { active: true, sets: rows.map((r) => ({ setSlug: r.setSlug, setName: name.get(r.setSlug) ?? r.setSlug, scope: r.scope })) };
}

const RELEASE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ReleaseSignupBody {
  email: string;
  setSlug: string;
  cardId: number | null;
  market: Country;
  source: ReleaseAlertSource | null;
  honeypot: boolean;
}

/** Pure: a release-alert signup body, or null when it is not one. */
export function parseReleaseBody(body: unknown): ReleaseSignupBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!email || email.length > 200 || !RELEASE_EMAIL_RE.test(email)) return null;
  const setSlug = typeof b.setSlug === "string" ? b.setSlug.trim().toLowerCase() : "";
  if (!/^[a-z0-9-]{1,80}$/.test(setSlug)) return null;
  let cardId: number | null = null;
  if (b.cardId != null && b.cardId !== "") {
    const n = typeof b.cardId === "number" ? b.cardId : Number(b.cardId);
    if (!Number.isSafeInteger(n) || n <= 0) return null;
    cardId = n;
  }
  const source = typeof b.source === "string" && (RELEASE_ALERT_SOURCES as readonly string[]).includes(b.source) ? (b.source as ReleaseAlertSource) : null;
  const market = normalizeCountry(typeof b.market === "string" ? b.market : null);
  return { email, setSlug, cardId, market, source, honeypot: typeof b.website === "string" && b.website.length > 0 };
}

/**
 * The one-field "email me when {set} lands" signup. Only for a set that takes
 * release alerts (unreleased, or released within the window); a card scope
 * must be a card of that set, and its singles email waits for that card's
 * first store price.
 * Idempotent per (email, set, scope); one token per address, so the email's
 * unsubscribe stops every release alert for that address. Nothing is sent here.
 */
export async function subscribeRelease(body: ReleaseSignupBody, now = new Date()): Promise<{ status: number; body: Record<string, unknown> }> {
  const set = await getSetBySlug(body.setSlug);
  const today = now.toISOString().slice(0, 10);
  const releasedOn = set?.releasedOn ? set.releasedOn.slice(0, 10) : null;
  if (!set || !releaseAlertSets([{ releasedOn }], today).length) return { status: 400, body: { error: "Unknown set." } };
  let scope = "set";
  if (body.cardId != null) {
    const card = (await getCardsByIds([body.cardId])).get(body.cardId);
    if (card?.setId !== set.id) return { status: 400, body: { error: "Unknown card." } };
    scope = String(body.cardId);
  }
  try {
    const existing = await prisma.setReleaseAlert.findFirst({ where: { email: body.email }, select: { unsubToken: true } });
    await prisma.setReleaseAlert.upsert({
      where: { email_setSlug_scope: { email: body.email, setSlug: body.setSlug, scope } },
      create: { email: body.email, setSlug: body.setSlug, scope, market: body.market, source: body.source, unsubToken: existing?.unsubToken ?? randomUUID() },
      update: {},
    });
  } catch {
    return { status: 500, body: { error: "Couldn't sign you up right now — please try again." } };
  }
  return { status: 200, body: { ok: true, unreleased: isUnreleased(releasedOn, today) } };
}

/** Stop every release alert on a token. Idempotent. */
export async function stopReleaseAlerts(token: string): Promise<number> {
  if (!token || token.length > 200) return 0;
  const res = await prisma.setReleaseAlert.deleteMany({ where: { unsubToken: token } });
  return res.count;
}

// ── The /alerts/action confirmation page's one read ─────────────────────────

export interface CardActionContext {
  market: string;
  targetCents: number | null;
  snoozedUntil: Date | null;
  entitled: boolean;
  card: { slug: string; name: string };
}

/** One primary-key read of the watch a signed token names (a card watch). */
export async function cardActionContext(id: string, loadCards: AlertCardLoader = liveAlertCards): Promise<CardActionContext | null> {
  const row = await prisma.priceAlert
    .findUnique({
      where: { id },
      select: {
        market: true,
        targetCents: true,
        snoozedUntil: true,
        user: { select: { email: true, isAdmin: true, premiumUntil: true, premiumTier: true } },
        cardId: true,
        finish: true,
      },
    })
    .catch(() => null);
  if (!row) return null;
  const entitled = !!row.user && isPremium({ ...row.user, isAdmin: row.user.isAdmin || isAdminEmail(row.user.email) });
  const unit = { id: row.cardId, finish: finishFromIndex(row.finish) };
  const card = (await loadCards([unit]).catch(() => new Map())).get(unitKey(unit.id, unit.finish));
  if (!card) return null;
  return {
    market: row.market,
    targetCents: row.targetCents,
    snoozedUntil: row.snoozedUntil,
    entitled,
    card: { slug: card.slug, name: `${card.name}${card.variant ? ` (${card.variant})` : ""}` },
  };
}

/** A deck or sealed watch's display name and snooze, for the same page. */
export async function watchActionContext(kind: "deck" | "sealed", id: string): Promise<{ name: string; snoozedUntil: Date | null } | null> {
  if (kind === "deck") return prisma.deckWatch.findUnique({ where: { id }, select: { name: true, snoozedUntil: true } }).catch(() => null);
  return prisma.sealedWatch
    .findUnique({ where: { id }, select: { snoozedUntil: true, sealedId: true } })
    .then(async (r) => {
      if (!r) return null;
      const sealed = (await getSealedByIds([r.sealedId])).get(r.sealedId);
      return sealed ? { name: sealed.name, snoozedUntil: r.snoozedUntil } : null;
    })
    .catch(() => null);
}
