import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "./site";
import { isAdminEmail } from "./admin-emails";
import { isPremium, tierOf, type EntitlementFields } from "./premium";
import { targetAlertLimit } from "./alert-limits";
import { clampTargetCents } from "./target-price";
import type { prisma } from "./db";

// OP COMPARE (wave 2, 2026-10-03): RiftCompare's lib/alert-actions.ts with one
// deliberate change. The links are SIGNED in GitHub Actions (the alert run is
// script-side, scripts/alerts.ts) and VERIFIED on Vercel, so the key cannot be
// derived from AUTH_SECRET — that would mean copying the session secret into
// Actions. It is derived from a NEW shared secret, EMAIL_LINK_SECRET (the same
// value in both places, 32+ characters), with RiftCompare's label. FAIL CLOSED:
// with it unset or short, nothing signs (the run sends no action links) and
// nothing verifies (403). The target actions write the row here rather than
// through the watchlist PATCH (the member track's lib/watchlist-server.ts):
// the same entitlement check, the same Plus limit, and the "already fired at
// this price" seed.

// ─────────────────────────────────────────────────────────────────────────────
// ONE-TAP ACTIONS FROM A PRICE-ALERT EMAIL (2026-09-25).
// ─────────────────────────────────────────────────────────────────────────────
// Every card row in an alert email carries small signed links:
//   • stop         — stop watching this card (deletes that one PriceAlert row)
//   • snooze       — no email about this card for 30 days (snoozedUntil; every
//                    trigger in lib/price-alerts.ts honours it)
//   • target-down  — Plus/Premium: a target 10% under the LOWER of the current
//                    target and the price in the email (value precomputed)
//   • target-set   — verified and applied for links already sent, but no
//                    longer offered (review, 2026-09-25): "set target at this
//                    price" set a target the price already met, so the next
//                    paid run re-sent "hit your target" with nothing changed.
// Either target action that lands at or above the watch's current alert price
// is stored already FIRED at that price (targetEmailedCents), so it re-fires
// only on a real further drop, never on the price the member was looking at.
// A free account's row gets a "Set a target with Plus" link instead, and the
// server refuses a target for it anyway (403).
//
// THE TOKEN. HMAC-SHA256 over "v1.<alertId>.<action>.<value>.<exp>", keyed by
// a key DERIVED from EMAIL_LINK_SECRET (see the OP note above) with the label
// "alert-action:v1".
// Scoped to one row and one action, carries its own value, and expires after
// 90 days. It is a bearer token — a forwarded email forwards it — so it can do
// only what the row's own email already could: the address's unsubscribe
// token (PriceAlert.unsubToken) can delete every watch outright.
//
// LINK SCANNERS. Mail security scanners and prefetchers GET every link in a
// message. So a GET never changes anything: GET /alerts/action shows a small
// confirmation card, and only its form's POST to /api/alerts/action acts. A
// scanner that GETs cannot act; a human taps once more. The one exception is
// List-Unsubscribe's one-click POST (lib/alert-mute.ts), which only PAUSES —
// reversible, and a POST scanners do not send.
//
// If EMAIL_LINK_SECRET is rotated, outstanding links stop verifying (403, "link not
// valid"). The footer's pause and manage links still work: they ride the
// row's unsubToken, not this signature.

export const ALERT_ACTIONS = ["stop", "snooze", "target-set", "target-down"] as const;
export type AlertAction = (typeof ALERT_ACTIONS)[number];

// WHICH KIND OF WATCH a token acts on (2026-09-29). "price" is a PriceAlert
// row (a card); "deck" a DeckWatch (lib/deck-watch.ts); "sealed" a
// SealedWatch (lib/sealed-watch.ts). The kind is INSIDE the signed payload, so
// a deck watch's stop link can never delete a card watch that happens to
// share an id, and the reverse. A card token keeps its original "v1" payload
// (every link already in an inbox stays valid); deck and sealed tokens are a
// "v2" payload that names the kind. Only cards have target actions: a v2
// token carrying one is malformed.
export const ALERT_ACTION_KINDS = ["price", "deck", "sealed"] as const;
export type AlertActionKind = (typeof ALERT_ACTION_KINDS)[number];

/** How long an emailed action link stays valid. */
export const ALERT_ACTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** "Snooze 30 days". */
export const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
/** "Lower target 10%". */
export const TARGET_DOWN_PCT = 10;

const LABEL = "alert-action:v1";
/** The shortest EMAIL_LINK_SECRET accepted; anything shorter is treated as unset. */
export const MIN_LINK_SECRET_LENGTH = 32;

/** Is the shared link secret configured? Without it nothing signs and nothing verifies. */
export function linkSecretConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return (env.EMAIL_LINK_SECRET ?? "").length >= MIN_LINK_SECRET_LENGTH;
}

let derived: { secret: string; key: Buffer } | null = null;
function key(): Buffer {
  const secret = process.env.EMAIL_LINK_SECRET ?? "";
  if (secret.length < MIN_LINK_SECRET_LENGTH) throw new Error("EMAIL_LINK_SECRET is not set (32+ characters): alert action links are off");
  if (!derived || derived.secret !== secret) derived = { secret, key: createHmac("sha256", Buffer.from(secret)).update(LABEL).digest() };
  return derived.key;
}

const b64u = (b: Buffer) => b.toString("base64url");

function mac(payload: string): Buffer {
  return createHmac("sha256", key()).update(payload).digest();
}

export interface AlertActionClaims {
  kind: AlertActionKind;
  alertId: string; // the row's id in the kind's table
  action: AlertAction;
  value: number | null; // target cents for target-set / target-down
  exp: number; // epoch seconds
}

const isAction = (s: string): s is AlertAction => (ALERT_ACTIONS as readonly string[]).includes(s);
const isKind = (s: string): s is AlertActionKind => (ALERT_ACTION_KINDS as readonly string[]).includes(s);
const needsValue = (a: AlertAction) => a === "target-set" || a === "target-down";

/**
 * Sign one action for one row. `value` is required for the two target actions.
 * `kind` defaults to "price" (a card watch); a deck or sealed watch may only
 * be stopped or snoozed.
 */
export function signAlertAction(opts: { alertId: string; action: AlertAction; value?: number | null; now?: Date; kind?: AlertActionKind }): string {
  const { alertId, action } = opts;
  const kind = opts.kind ?? "price";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(alertId)) throw new Error("alert id not signable");
  if (kind !== "price" && needsValue(action)) throw new Error("only a card watch has a target");
  const value = needsValue(action) ? clampTargetCents(opts.value ?? 0) : null;
  const exp = Math.floor(((opts.now ?? new Date()).getTime() + ALERT_ACTION_TTL_MS) / 1000);
  const payload = kind === "price" ? `v1.${alertId}.${action}.${value ?? ""}.${exp}` : `v2.${kind}.${alertId}.${action}.${value ?? ""}.${exp}`;
  return `${b64u(Buffer.from(payload))}.${b64u(mac(payload))}`;
}

export type VerifyResult = ({ ok: true } & AlertActionClaims) | { ok: false; reason: "malformed" | "signature" | "expired" };

/** Verify a token: shape, signature (constant-time), then expiry. */
export function verifyAlertAction(token: string | null | undefined, now: Date = new Date()): VerifyResult {
  if (!token || token.length > 400) return { ok: false, reason: "malformed" };
  if (!linkSecretConfigured()) return { ok: false, reason: "signature" }; // fail closed
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return { ok: false, reason: "malformed" };
  const payloadPart = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(payloadPart) || !/^[A-Za-z0-9_-]+$/.test(sigPart)) return { ok: false, reason: "malformed" };
  const payload = Buffer.from(payloadPart, "base64url").toString("utf8");
  const given = Buffer.from(sigPart, "base64url");
  const expected = mac(payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };
  const parts = payload.split(".");
  let kind: AlertActionKind;
  let rest: string[];
  if (parts.length === 5 && parts[0] === "v1") {
    kind = "price";
    rest = parts.slice(1);
  } else if (parts.length === 6 && parts[0] === "v2" && isKind(parts[1]!)) {
    kind = parts[1] as AlertActionKind;
    rest = parts.slice(2);
  } else return { ok: false, reason: "malformed" };
  const [alertId, action, rawValue, rawExp] = rest as [string, string, string, string];
  if (!alertId || !isAction(action)) return { ok: false, reason: "malformed" };
  if (kind !== "price" && needsValue(action)) return { ok: false, reason: "malformed" };
  const exp = Number(rawExp);
  if (!Number.isInteger(exp)) return { ok: false, reason: "malformed" };
  const value = rawValue === "" ? null : Number(rawValue);
  if (needsValue(action) ? value == null || !Number.isInteger(value) : value != null) return { ok: false, reason: "malformed" };
  if (exp * 1000 <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, kind, alertId, action, value, exp };
}

/** The confirmation page for one signed action. */
export function alertActionUrl(token: string): string {
  return `${SITE_URL}/alerts/action?t=${encodeURIComponent(token)}`;
}

/**
 * The target a one-tap target link sets: 10% under the LOWER of the current
 * target and the price in the email. 10% under the target alone re-armed a
 * target the price was already under (target $15, price $12 → $13.50), which
 * fired again at the next paid run with nothing changed.
 */
export function loweredTargetCents(targetCents: number | null, currentCents: number): number {
  const from = targetCents == null ? currentCents : Math.min(targetCents, currentCents);
  return clampTargetCents(Math.floor((from * (100 - TARGET_DOWN_PCT)) / 100));
}

// The links one email row carries. `canTarget` = the row's account is entitled
// (Plus, Premium, admin) — the same check the run makes; the server re-checks
// on POST. A free or anonymous row gets `upsell` instead of the target links.
export interface AlertActionLinks {
  stop: string;
  snooze: string;
  targetDown: { url: string; cents: number } | null;
  upsell: string | null;
  // The row's own target when it has one ("Lower target" vs "Set target").
  hasTarget: boolean;
}

export function alertActionLinks(opts: {
  alertId: string;
  currentCents: number;
  targetCents: number | null;
  canTarget: boolean;
  now?: Date;
}): AlertActionLinks | null {
  // No shared secret: the row carries no action links (the footer's pause and
  // manage links still work — they ride the unsubscribe token).
  if (!linkSecretConfigured()) return null;
  const { alertId, currentCents, targetCents, canTarget, now } = opts;
  const url = (action: AlertAction, value?: number) => alertActionUrl(signAlertAction({ alertId, action, value, now }));
  const down = loweredTargetCents(targetCents, currentCents);
  return {
    stop: url("stop"),
    snooze: url("snooze"),
    targetDown: canTarget ? { url: url("target-down", down), cents: down } : null,
    upsell: canTarget ? null : `${SITE_URL}/premium?src=alert-email&utm_source=email&utm_medium=email&utm_campaign=price-alert-target-upsell`,
    hasTarget: targetCents != null,
  };
}

// The links a deck or sealed watch's email carries: stop and snooze only.
export interface WatchActionLinks {
  stop: string;
  snooze: string;
}

export function watchActionLinks(opts: { kind: Exclude<AlertActionKind, "price">; id: string; now?: Date }): WatchActionLinks | null {
  if (!linkSecretConfigured()) return null;
  const url = (action: AlertAction) => alertActionUrl(signAlertAction({ alertId: opts.id, action, now: opts.now, kind: opts.kind }));
  return { stop: url("stop"), snooze: url("snooze") };
}

// ── Applying an action (POST /api/alerts/action) ─────────────────────────────

export type AlertActionDb = {
  priceAlert: Pick<typeof prisma.priceAlert, "findUnique" | "deleteMany" | "update" | "count">;
  deckWatch: Pick<typeof prisma.deckWatch, "findUnique" | "deleteMany" | "update">;
  sealedWatch: Pick<typeof prisma.sealedWatch, "findUnique" | "deleteMany" | "update">;
};

// The outcome the confirmation page renders (?r=…). "ok" = done.
export type AlertActionOutcome = "ok" | "gone" | "not-plus" | "limit" | "no-account" | "invalid";

export interface AlertActionResult {
  status: number;
  outcome: AlertActionOutcome;
  body: Record<string, unknown>;
}

/**
 * Verify a posted token and apply it. 403 for a bad, tampered or expired
 * token; every other outcome is about the row itself. Target actions make the
 * watchlist PATCH's checks: entitlement (403), the Plus limit (409,
 * targetAlertLimit) and the re-arm.
 */
export async function performAlertAction(db: AlertActionDb, token: string | null | undefined, now: Date = new Date()): Promise<AlertActionResult> {
  const v = verifyAlertAction(token, now);
  if (!v.ok) return { status: 403, outcome: "invalid", body: { error: "This link is not valid or has expired.", reason: v.reason } };

  // A deck or sealed watch: stop (delete that one row, idempotently) or snooze.
  // The token's kind picks the table; the id is never looked up anywhere else.
  if (v.kind !== "price") {
    const where = { id: v.alertId };
    const found =
      v.kind === "deck"
        ? await db.deckWatch.findUnique({ where, select: { id: true } })
        : await db.sealedWatch.findUnique({ where, select: { id: true } });
    if (v.action === "stop") {
      if (found) {
        if (v.kind === "deck") await db.deckWatch.deleteMany({ where });
        else await db.sealedWatch.deleteMany({ where });
      }
      return { status: 200, outcome: "ok", body: { ok: true, kind: v.kind, action: v.action, removed: found ? 1 : 0 } };
    }
    if (!found) return { status: 404, outcome: "gone", body: { error: "You're no longer watching this." } };
    const until = new Date(now.getTime() + SNOOZE_MS);
    if (v.kind === "deck") await db.deckWatch.update({ where, data: { snoozedUntil: until } });
    else await db.sealedWatch.update({ where, data: { snoozedUntil: until } });
    return { status: 200, outcome: "ok", body: { ok: true, kind: v.kind, action: v.action, snoozedUntil: until.toISOString() } };
  }

  const row = await db.priceAlert.findUnique({
    where: { id: v.alertId },
    select: {
      id: true,
      cardId: true,
      market: true,
      userId: true,
      lastPriceCents: true,
      targetCents: true,
      user: { select: { id: true, email: true, isAdmin: true, premiumUntil: true, premiumTier: true } },
    },
  });

  if (v.action === "stop") {
    // Idempotent: a second tap (or a row already removed) is still "not watching".
    if (row) await db.priceAlert.deleteMany({ where: { id: row.id } });
    return { status: 200, outcome: "ok", body: { ok: true, action: v.action, removed: row ? 1 : 0 } };
  }
  if (!row) return { status: 404, outcome: "gone", body: { error: "You're no longer watching this card." } };

  if (v.action === "snooze") {
    const until = new Date(now.getTime() + SNOOZE_MS);
    await db.priceAlert.update({ where: { id: row.id }, data: { snoozedUntil: until } });
    return { status: 200, outcome: "ok", body: { ok: true, action: v.action, snoozedUntil: until.toISOString() } };
  }

  // target-set / target-down: an account's watch only, and only while entitled.
  if (!row.userId || !row.user) {
    return { status: 403, outcome: "no-account", body: { error: "Target prices need a Plus account." } };
  }
  const user: EntitlementFields & { id: string } = { ...row.user, id: row.userId, isAdmin: row.user.isAdmin || isAdminEmail(row.user.email) };
  if (!isPremium(user)) return { status: 403, outcome: "not-plus", body: { error: "Target prices are part of Plus." } };
  // Plus holds PLUS_TARGET_ALERT_LIMIT targets; a NEW target past it is a 409
  // (changing an existing target never is). Premium is unlimited.
  const limit = targetAlertLimit(tierOf(user));
  if (row.targetCents == null && Number.isFinite(limit)) {
    const used = await db.priceAlert.count({ where: { userId: row.userId, targetCents: { not: null } } });
    if (used >= limit) return { status: 409, outcome: "limit", body: { error: `Plus holds ${limit} target prices.`, action: v.action } };
  }
  const targetCents = clampTargetCents(v.value ?? 0);
  // Stored already FIRED at the current alert price when the new target is at
  // or above it: the member tapped this while looking at that price, so it is
  // not news at the next run. Otherwise the target is re-armed.
  const seeded = row.lastPriceCents != null && targetCents >= row.lastPriceCents ? row.lastPriceCents : null;
  await db.priceAlert.update({ where: { id: row.id }, data: { targetCents, targetEmailedCents: seeded } });
  return { status: 200, outcome: "ok", body: { ok: true, action: v.action, targetCents } };
}
