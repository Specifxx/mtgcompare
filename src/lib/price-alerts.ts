import { prisma } from "./db";
import { COUNTRIES, currencyOf, type Country } from "./country";
import {
  ALERT_KIND_PRIORITY,
  isEmailEnabled,
  renderedAlertItems,
  sendPriceDropEmail as sendPriceDropEmailImpl,
  sortAlertItems,
  type AlertKind,
  type AlertStore,
  type PriceDropItem,
} from "./email";
import { alertActionLinks } from "./alert-actions";
import { pausedAddresses } from "./alert-mute";
import { SITE_URL } from "./site";
import { notify as notifyImpl } from "./notifications";
import { isPremium, tierOf, type EntitlementFields } from "./premium";
import { targetAlertLimit } from "./alert-limits";
import { scoreVsTcg } from "./deals";
import { honouredTargetIds } from "./target-price";
import { affiliateUrl } from "./affiliate";
import { adminEmails, isAdminEmail } from "./admin-emails";
import { finishFromIndex, unitKey } from "./constants";
import { alertPairKey, computeAlertPrices, liveAlertCards, liveAlertReader, type AlertCard, type AlertCardLoader, type AlertOffer, type AlertOfferReader, type AlertPrice } from "./alert-price";
import { usdCentsToCountry } from "./fx";
import { moneyCode as formatMoney } from "./format";
import { DROP_MIN_CENTS, DROP_MIN_PCT } from "./alert-thresholds";
import { recentlyEmailedAddresses } from "./alert-budget";

type EntitlementUser = EntitlementFields & { email: string };

/** TCGplayer's market figures for one card, as the below-market trigger reads them (RiftCompare lib/arbitrage.ts). */
export interface TcgMarketRef {
  marketCents: number; // TCGplayer US MARKET price, converted into the market's currency
  marketUsdCents: number; // the same figure before conversion
  lowUsdCents: number | null; // TCGplayer's own cheapest US listing (US only matters — scoreVsTcg)
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICE ALERTS — what fires, and when. RiftCompare's lib/price-alerts.ts (rules
// as of 2026-09-25), ported for MTG Compare in wave 2 (2026-10-03).
// ─────────────────────────────────────────────────────────────────────────────
// MTG COMPARE: EMAIL IS OFF UNTIL CONFIGURED (isEmailEnabled, lib/email.ts). The
// rules below are RiftCompare's, unchanged. What changes is DELIVERY:
//   • email ON  — RiftCompare's behaviour: one digest per address, the budget
//     and caps, AlertMute pauses, lastNotifiedAt and the emailed watermark on a
//     successful send, plus one in-app Notification per digest for an account.
//   • email OFF — no email is attempted. Every trigger that would have been
//     emailed to an ACCOUNT is delivered in-app instead: one Notification per
//     card (notify(), the member track's contract) and lastFlaggedAt = now.
//     The baselines advance exactly as after a send (the drop anchor resets to
//     the flagged price, a fired target records targetEmailedCents so it does
//     not re-fire every run), but lastNotifiedAt and lowestEmailedCents are
//     NEVER written: they mean "an email was sent", and the weekly email cap
//     and the emailed watermark must not count a flag. The weekly cap and the
//     paid cooldown read the later of lastNotifiedAt and lastFlaggedAt, so the
//     in-app cadence matches the email one. The send budget, the per-run caps
//     and AlertMute (a pause of EMAIL) do not apply to in-app delivery. An
//     anonymous watch (no account) has nowhere in-app to go: it is held, its
//     baseline kept, until email is on.
// The alert price (lib/alert-price.ts) reads Offer rows: real stores and
// TCGplayer, never eBay, never Card.low<M>. Below-market reads Card.marketUsd
// (TCGplayer US market) converted with OP's fx table.
// Every trigger reads the ALERT PRICE (lib/alert-price.ts): the cheapest
// in-stock Near-Mint (or unstated) copy at a real store, CardTrader or a real
// TCGplayer US listing, seen within 36h — never eBay, never a reference or
// cloned row. Card.lowestPriceCents* (every source, every condition) is read
// only to count `ebayOnly` pairs.
//
// FREE (anonymous and free accounts) — the "all" run, straight after the
// 07:00 UTC import:
//   • NEW LOW    a drop since the last price that is MATERIAL (isMaterialDrop:
//                ≥5% and ≥50 minor units) against the reference — the price we
//                last emailed while that is under WATERMARK_TTL_MS (30 days)
//                old, else the DROP ANCHOR: the price before the current slide
//                (dropAnchorCents; it rises with the price and resets to what
//                we email), so a slow decline in sub-5% steps still fires.
//   • RESTOCK    sold out (soldOutAt) for RESTOCK_MIN_SOLDOUT_MS or more and
//                seen sold out by two runs (soldOutRuns), now priced again.
//   • LISTED     never priced when watched, priced now — labelled PRE-ORDER
//                while the card's set has not released (isPreorderSetCode).
//   At most one digest per address per week; no reminders.
// PLUS (targets up to PLUS_TARGET_ALERT_LIMIT) / PREMIUM (unlimited) — every
// run, i.e. after both imports, with no weekly cap:
//   • TARGET     at or under the member's price and armed; once fired it
//                re-fires only a further 10% down, and re-arms when a run sees
//                the price above the target or sold out.
//   • BELOW MKT  the alert price ≥15% under TCGplayer market (read directly,
//                scoreVsTcg) and material against the reference.
//   • RESTOCK    as above.
//   Each with a per-card cooldown (PAID_COOLDOWN_MS, 20h — under the 24h
//   between same-slot runs, so import-duration jitter never decides it).
// EVERY price trigger: a new low more than 40% under the last price is held
// for one run (pendingLowCents) and fires only if the price is still within
// ±5% of it; a lower figure is held again.
// EVERY run shares ALERT_DAILY_BUDGET distinct addresses per rolling
// ALERT_BUDGET_WINDOW_MS (20h; the free run at most ALL_RUN_SHARE of them),
// opened in priority order. A digest renders at most ALERT_EMAIL_FULL_ROWS +
// ALERT_EMAIL_COMPACT_ROWS items; the rest are held for the next one.
// A push re-import runs `baselineOnly`: baselines move, nothing is sent.

export interface AlertRunSummary {
  alerts: number; // rows examined
  drops: number; // watches whose alert price fell since the last run (emailed, deferred or suppressed)
  listed: number; // watches that got their FIRST alert price in their market (pre-orders included)
  preorders: number; // …of which the card's set has not released yet
  restocks: number; // watches back in stock after being sold out for RESTOCK_MIN_SOLDOUT_MS
  targets: number; // entitled watches at or below their own target, worth telling (sent or deferred)
  belowMarket: number; // entitled watches ≥ BELOW_MARKET_MIN_PCT under TCGplayer market, material vs the reference
  suppressed: number; // drops NOT emailed: not material against the reference — anti-spam
  outlierHeld: number; // new lows > OUTLIER_DROP_PCT under the last price, held for one run
  cooldown: number; // paid triggers skipped inside their PAID_COOLDOWN_MS per-card cooldown (baseline held)
  snoozed: number; // triggers not emailed because the watch is snoozed (baselines still advance)
  paused: number; // triggers not emailed because the ADDRESS paused alert emails (AlertMute; baselines still advance)
  deferred: number; // worth sending, held for the weekly cap, a per-run cap or the daily budget
  budgetDeferred: number; // …of which by ALERT_DAILY_BUDGET
  soldOut: number; // watches that went sold out this run (soldOutAt set)
  unknown: number; // watches whose price a failing feed leaves undecidable (lib/alert-price.ts "unknown") — nothing decided
  ebayOnly: number; // sold out on the alert price but priced on the Card (eBay, played or stale copies only)
  legacyMarket: number; // rows whose market is not a supported one (legacy NZ) — skipped
  emails: number; // recipients emailed
  flagged: number; // email off: watches delivered in-app (a Notification each, lastFlaggedAt set)
  emailOn: boolean; // whether this run could send email at all
  updated: number; // rows written
  held: number; // rows whose baseline was deliberately NOT moved (deferred, cooldown, failed send, digest overflow)
  overflow: number; // items past what one digest renders, held for the next email
  legacyReset: number; // rows seeded from the Card price (eBay-inclusive) reset to "no price" instead of stamped sold out
}

// Which rows one run looks at.
//   • "all"  — every watch, anonymous included: the daily free run, which
//              refresh-prices.yml fires straight after the 07:00 UTC import.
//   • "paid" — only watches owned by an entitled account (Plus, Premium,
//              admin): the runs after each of the two daily imports, so a
//              target is checked after every price update. Free and anonymous
//              rows are never touched by a paid run.
export type AlertScope = "paid" | "all";

// ── Thresholds (named so DECISIONS.md can quote and tune them) ───────────────

// DROP_MIN_PCT (5) and DROP_MIN_CENTS (50 minor units) live in
// lib/alert-thresholds.ts so the confirmation email can quote them.
export { DROP_MIN_CENTS, DROP_MIN_PCT };
/** The "price we last emailed you" watermark counts for this long after the email. */
export const WATERMARK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A new low more than this % under the last price is held one run. */
export const OUTLIER_DROP_PCT = 40;
/** On the next run a held low fires only if the price is still within this % of it. */
export const OUTLIER_CONFIRM_PCT = 5;
/** After a target fires, it fires again only this % further down. */
export const TARGET_REFIRE_STEP_PCT = 10;
/**
 * Paid triggers (target, below-market, restock) email one card at most once
 * per this window. 20h, not 24h (review, 2026-09-25): the runs are 12h and 24h
 * apart, so a window EQUAL to the run period made the outcome hinge on a few
 * minutes of import-duration jitter — a trigger due at the next 07:xx run was
 * held to 19:xx whenever that run started a little earlier than yesterday's.
 */
export const PAID_COOLDOWN_MS = 20 * 60 * 60 * 1000;
/** Below-market fires only this far under TCGplayer market. */
export const BELOW_MARKET_MIN_PCT = 15;
/** A sell-out shorter than this (one missed scrape, a quick restock) is not news. */
export const RESTOCK_MIN_SOLDOUT_MS = 20 * 60 * 60 * 1000;
/**
 * …and it must have been SEEN sold out by at least this many runs. Free rows
 * are evaluated once a day, so a single out-of-stock read was always ≥24h old
 * by the next run and cleared the 20h guard on its own (review, 2026-09-25).
 */
export const RESTOCK_MIN_SOLDOUT_RUNS = 2;

// AT MOST ONE FREE DIGEST PER ADDRESS PER WEEK (owner call, 2026-09-21: "can we
// make price drop emails less frequent? like once every week"). A SECOND,
// independent gate: isMaterialDrop() & co. decide whether something is worth
// telling someone AT ALL, per card; this decides how often that person may be
// told anything, per address. The paid triggers are exempt. A held item keeps
// its baseline and re-detects next run — but a low that has recovered by the
// time the window opens is NOT reported (the /alerts FAQ says so).
export const MIN_DIGEST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

// THE SHARED ALERT BUDGET. Resend's 100/day is also what verification, reset,
// welcome, trial and release-day mail use, so every alert run together may
// email at most this many DISTINCT addresses per ALERT_BUDGET_WINDOW_MS — counted from
// PriceAlert.lastNotifiedAt with one small query, because a paid run cannot
// see the free run's rows. Override with the ALERT_DAILY_BUDGET env var (lower
// it for release week). The free run may use at most ALL_RUN_SHARE, so the
// paid triggers always keep room.
export const ALERT_DAILY_BUDGET = 50;
export const ALL_RUN_SHARE = 35;
// The budget's window: 20h, not 24h, for the same reason as PAID_COOLDOWN_MS —
// yesterday's same-slot run must never fall a minute inside or outside it by
// jitter (it swung the free run's share between 35 and 15). Every run still
// sees the other slot's recipients (12h apart), so any UTC day's two slots
// share one budget.
export const ALERT_BUDGET_WINDOW_MS = 20 * 60 * 60 * 1000;
export function alertDailyBudget(env: Record<string, string | undefined> = process.env): number {
  const v = Number.parseInt(env.ALERT_DAILY_BUDGET ?? "", 10);
  return Number.isFinite(v) && v >= 0 ? v : ALERT_DAILY_BUDGET;
}

// Most NEW digests first-price (and free restock) notices may open in one
// run. Release day lists a whole set at once; the overflow is deferred with
// its baseline held and re-detects next run. Joining a digest already going to
// that address costs no extra email and is not counted.
export const FIRST_PRICE_SEND_CAP = 25;

// Most NEW digests the paid triggers may open in one run, beside the budget —
// a bug must not be able to spend the day's quota on one run.
export const PAID_SEND_CAP = 30;

// Most NEW drop digests one run may open to an address we have NEVER emailed
// (review, 2026-09-25). /api/alerts/subscribe enrols any posted address with no
// double opt-in, so a burst of those must be spread over days instead of
// starving transactional mail. Keyed on "never emailed", not on userId
// (tests/watchlist.test.ts: rows are never filtered by account).
export const FIRST_CONTACT_SEND_CAP = 20;

// Digests open in this order when a cap or the budget binds (defined beside
// the email, which orders its rows and picks its subject by the same rule).
export { ALERT_KIND_PRIORITY };

// ── The pure rules ───────────────────────────────────────────────────────────

/** A drop worth an email: ≥ DROP_MIN_PCT of the reference AND ≥ DROP_MIN_CENTS. */
export function isMaterialDrop(refCents: number, currentCents: number): boolean {
  return refCents - currentCents >= Math.max(Math.ceil((refCents * DROP_MIN_PCT) / 100), DROP_MIN_CENTS);
}

/** The emailed-price watermark while it is live (under WATERMARK_TTL_MS old), else null. */
export function liveWatermark(opts: { lowestEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): number | null {
  const { lowestEmailedCents, lastNotifiedAt, now } = opts;
  if (lowestEmailedCents == null || lastNotifiedAt == null) return null;
  return now.getTime() - lastNotifiedAt.getTime() < WATERMARK_TTL_MS ? lowestEmailedCents : null;
}

/**
 * What a move is measured from — and what an email's "what changed" line
 * quotes: the price we last emailed while that is live, else the DROP ANCHOR
 * (the price before the current slide, dropAnchorCents) when it is above the
 * last price, else the last price.
 *
 * Why an anchor (review, 2026-09-25): measured from the last price, every
 * sub-5% step of a steady decline was "not material" and the baseline still
 * advanced, so a card could lose half its price in small daily steps without
 * one email. The anchor only rises with the price and resets to what we email.
 */
export function alertReference(opts: {
  prev: number | null;
  lowestEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  now: Date;
  anchorCents?: number | null;
}): { cents: number | null; basis: "emailed" | "anchor" | "last" | null } {
  const live = liveWatermark(opts);
  if (live != null) return { cents: live, basis: "emailed" };
  if (opts.prev == null) return { cents: null, basis: null };
  if (opts.anchorCents != null && opts.anchorCents > opts.prev) return { cents: opts.anchorCents, basis: "anchor" };
  return { cents: opts.prev, basis: "last" };
}

/**
 * The drop anchor after a run that saw `current` and sent nothing about it:
 * it starts from the last price, follows the price UP (a recovery ends the
 * slide) and otherwise holds. The run resets it to the emailed price on a send.
 */
export function nextDropAnchor(opts: { anchorCents: number | null; prev: number | null; current: number }): number {
  const start = opts.anchorCents ?? opts.prev ?? opts.current;
  return Math.max(start, opts.current);
}

/** Is this ADDRESS inside its weekly quiet window? */
export function addressInCooldown(opts: { lastEmailedAt: Date | null; now: Date }): boolean {
  const { lastEmailedAt, now } = opts;
  if (lastEmailedAt == null) return false; // never emailed: a first alert arrives at once
  return now.getTime() - lastEmailedAt.getTime() < MIN_DIGEST_INTERVAL_MS;
}

/** Was this CARD emailed inside the paid triggers' 24h cooldown? */
export function inPaidCooldown(lastNotifiedAt: Date | null, now: Date): boolean {
  return lastNotifiedAt != null && now.getTime() - lastNotifiedAt.getTime() < PAID_COOLDOWN_MS;
}

/** Never priced when the watch was created (or when it was last reset), priced now. */
export function isFirstPrice(prev: number | null, current: number | null): boolean {
  return prev == null && current != null;
}

/**
 * The free new-low rule: a drop since the last price, material against the
 * reference (see alertReference). A price sawtoothing back to a figure we
 * already sent stays quiet; a one-cent "new low" never sends; a slow slide
 * fires once it adds up to a material fall from its anchor.
 */
export function shouldEmailDrop(opts: {
  current: number;
  prev: number | null;
  lowestEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  now: Date;
  anchorCents?: number | null;
}): boolean {
  const { current, prev } = opts;
  if (prev == null || current >= prev) return false;
  const ref = alertReference(opts).cents ?? prev;
  return isMaterialDrop(ref, current);
}

/**
 * THE TARGET-PRICE TRIGGER (Plus and Premium). Fires when the alert price is at
 * or under the member's target and the target is ARMED (targetEmailedCents
 * null: never fired, or re-armed because a run saw the price above the target
 * or sold out, or the member changed it). Once fired it fires again only at a
 * further TARGET_REFIRE_STEP_PCT down from the price it last sent. The 24h
 * per-card cooldown is applied by the run (inPaidCooldown).
 */
export function shouldEmailTarget(opts: { current: number; targetCents: number | null; targetEmailedCents: number | null }): boolean {
  const { current, targetCents, targetEmailedCents } = opts;
  if (targetCents == null || current > targetCents) return false;
  if (targetEmailedCents == null) return true;
  return current <= Math.floor((targetEmailedCents * (100 - TARGET_REFIRE_STEP_PCT)) / 100);
}

/** Should a run seeing this price re-arm the target? */
export function shouldRearmTarget(opts: { current: number | null; targetCents: number | null; targetEmailedCents: number | null }): boolean {
  if (opts.targetEmailedCents == null) return false;
  if (opts.current == null) return true; // sold out
  return opts.targetCents != null && opts.current > opts.targetCents;
}

/**
 * THE BELOW-MARKET TRIGGER (Plus and Premium): the alert price scored against
 * TCGplayer market with Deal Finder's own predicate (scoreVsTcg), at least
 * BELOW_MARKET_MIN_PCT under it, and news — its first price, or a material
 * move against the reference. Returns the gap for the email, or null.
 */
export function belowMarketSignal(opts: {
  country: Country;
  current: number;
  prev: number | null;
  lowestEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  now: Date;
  anchorCents?: number | null;
  tcg: TcgMarketRef | null | undefined;
}): { marketCents: number; marketUsdCents: number; belowCents: number; belowPct: number } | null {
  const { country, current, tcg } = opts;
  if (!tcg) return null;
  const score = scoreVsTcg(country, current, tcg.marketCents, tcg.lowUsdCents);
  if (!score || score.belowPct < BELOW_MARKET_MIN_PCT) return null;
  const ref = alertReference(opts).cents;
  if (ref != null && !isMaterialDrop(ref, current)) return null;
  return { marketCents: tcg.marketCents, marketUsdCents: tcg.marketUsdCents, belowCents: score.belowCents, belowPct: score.belowPct };
}

/** A new low implausibly far under the last price — held one run before anything sends. */
export function isOutlierLow(prev: number | null, current: number): boolean {
  return prev != null && current < (prev * (100 - OUTLIER_DROP_PCT)) / 100;
}

/**
 * On the run after a hold: is the price still at the held low, within
 * ±OUTLIER_CONFIRM_PCT of it? BOTH bounds (review, 2026-09-25): with only an
 * upper bound, an even LOWER figure the next run — the one-off bogus low the
 * hold exists to catch — counted as "confirmed" and was emailed at once, and
 * became the watermark that muted real alerts for 30 days. A price under the
 * band is not a confirmation; the run clears the pending low and judges it
 * afresh, which holds it again at the new figure.
 */
export function confirmsPendingLow(pendingLowCents: number, current: number): boolean {
  const lower = Math.ceil((pendingLowCents * (100 - OUTLIER_CONFIRM_PCT)) / 100);
  const upper = Math.floor((pendingLowCents * (100 + OUTLIER_CONFIRM_PCT)) / 100);
  return current >= lower && current <= upper;
}

/** Sold out long enough, seen so by enough runs, and priced again: "back in stock". */
export function isRestock(opts: { prev: number | null; soldOutAt: Date | null; soldOutRuns?: number | null; now: Date }): boolean {
  if (opts.prev == null || opts.soldOutAt == null) return false;
  if ((opts.soldOutRuns ?? 1) < RESTOCK_MIN_SOLDOUT_RUNS) return false;
  return opts.now.getTime() - opts.soldOutAt.getTime() >= RESTOCK_MIN_SOLDOUT_MS;
}

/**
 * Postage for ONE card from this store to the watcher's market. MTG Compare's
 * store rows state no postage and the measured postage model is the tools
 * track's (Best Basket), so an alert says "item price, postage extra" — never
 * a guess dressed as a quote, never "delivered" without known postage.
 */
export function alertPostage(
  _offer: Pick<AlertOffer, "source" | "priceCents">,
  _market: Country,
): Pick<AlertStore, "postageCents" | "postageBasis" | "postageUpTo" | "deliveredCents"> {
  return { postageCents: null, postageBasis: null, postageUpTo: false, deliveredCents: null };
}

const isSupportedMarket = (m: string): m is Country => Object.prototype.hasOwnProperty.call(COUNTRIES, m);

// ── The run ──────────────────────────────────────────────────────────────────

// `deps` exists only so tests can run the whole thing against a stub client,
// sender and notifier (tests/alerts-email-off.test.ts); the run passes nothing.
// `notifyUsers: false` switches the in-app mirror off.
export interface AlertRunDeps {
  db?: Pick<typeof prisma, "priceAlert" | "alertMute" | "deckWatch" | "sealedWatch" | "$transaction">;
  // Where the run reads live offers and the watched cards from: the published
  // files by default (alert-price.ts); tests pass stand-ins.
  readOffers?: AlertOfferReader;
  cards?: AlertCardLoader;
  sendPriceDropEmail?: typeof sendPriceDropEmailImpl;
  notify?: (userId: string, type: string, title: string, body: string, href?: string | null) => Promise<void>;
  now?: Date;
  notifyUsers?: boolean;
  // Defaults to isEmailEnabled() (both mail secrets set).
  emailEnabled?: boolean;
  // Defaults to alertDailyBudget() (env ALERT_DAILY_BUDGET, else 50).
  dailyBudget?: number;
}

export interface AlertRunOptions {
  scope?: AlertScope;
  // BASELINES ONLY, NO EMAIL — after a push-triggered re-import
  // (/api/cron/price-alerts/baseline). A push re-import follows a matcher
  // change, so its price moves are matching fixes, not market news; skipping
  // the alert run alone did not absorb them, because only this run writes the
  // baselines and the next scheduled run then emailed them. Every watch with a
  // price moves to the new alert price (lastPriceCents, soldOutAt, the drop
  // anchor, pending lows, target re-arms); nothing is sent, no watermark or
  // lastNotifiedAt is written. A watch with NO price yet is left alone, so a
  // card a matcher fix newly prices still gets its "now listed" notice.
  // Always scope "all".
  baselineOnly?: boolean;
}

type Patch = {
  lastPriceCents?: number | null;
  startPriceCents?: number | null;
  soldOutAt?: Date | null;
  soldOutRuns?: number | null;
  pendingLowCents?: number | null;
  targetEmailedCents?: number | null;
  dropAnchorCents?: number | null;
};

export async function runPriceAlerts(deps: AlertRunDeps = {}, opts: AlertRunOptions = {}): Promise<AlertRunSummary> {
  const db = deps.db ?? prisma;
  const sendPriceDropEmail = deps.sendPriceDropEmail ?? sendPriceDropEmailImpl;
  const notify = deps.notify ?? notifyImpl;
  const emailOn = deps.emailEnabled ?? isEmailEnabled();
  const baselineOnly = opts.baselineOnly === true;
  const scope: AlertScope = baselineOnly ? "all" : opts.scope ?? "all";
  const now = deps.now ?? new Date();

  // "all" reads EVERY row, unfiltered — anonymous watchers are emailed exactly
  // like account-owned ones (tests/watchlist.test.ts). "paid" narrows the read
  // to rows whose account is inside a paid period, or is an admin — by the DB
  // flag OR by address (ADMIN_EMAILS, the same list the session honours);
  // isPremium() below stays the real check, this only trims the read.
  const paidOnly = scope === "paid"
    ? {
        user: {
          is: {
            OR: [
              { isAdmin: true },
              { premiumUntil: { gt: now } },
              ...(adminEmails().length ? [{ email: { in: adminEmails(), mode: "insensitive" as const } }] : []),
            ],
          },
        },
      }
    : undefined;
  const alerts = await db.priceAlert.findMany({
    where: paidOnly,
    // Oldest watch first, so the order candidates of one priority open digests
    // in is stable between runs. ~200 rows: the sort is free.
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      market: true,
      lastPriceCents: true,
      lowestEmailedCents: true,
      lastNotifiedAt: true,
      lastFlaggedAt: true,
      targetCents: true,
      targetEmailedCents: true,
      // Read for the email's "you started watching at" line. Written here only
      // by the one-time reset of a pre-alert-price (Card-price) baseline.
      startPriceCents: true,
      soldOutAt: true,
      soldOutRuns: true,
      pendingLowCents: true,
      dropAnchorCents: true,
      snoozedUntil: true,
      createdAt: true,
      unsubToken: true,
      // Whether this watch belongs to an account — decides if the email
      // carries the "create a free account" block (anonymous watchers only).
      userId: true,
      user: { select: { email: true, isAdmin: true, premiumUntil: true, premiumTier: true } },
      cardId: true,
      finish: true,
    },
  });
  type Row = (typeof alerts)[number];
  type Live = Row & { market: Country; card: AlertCard };

  const summary: AlertRunSummary = {
    alerts: alerts.length,
    drops: 0,
    listed: 0,
    preorders: 0,
    restocks: 0,
    targets: 0,
    belowMarket: 0,
    suppressed: 0,
    outlierHeld: 0,
    cooldown: 0,
    snoozed: 0,
    paused: 0,
    deferred: 0,
    budgetDeferred: 0,
    soldOut: 0,
    unknown: 0,
    ebayOnly: 0,
    legacyMarket: 0,
    emails: 0,
    flagged: 0,
    emailOn,
    updated: 0,
    held: 0,
    overflow: 0,
    legacyReset: 0,
  };

  // ENTITLEMENT, once per row. A lapsed subscription is simply not entitled:
  // its targets are ignored and the watch runs the free rules.
  const entitled = new Map<string, boolean>();
  // The target each entitled row may use: none when over targetAlertLimit and
  // not one of the oldest (honouredTargetIds — the rule the watchlist shows).
  const honouredTarget = new Map<string, number>();
  const targetRowsByUser = new Map<string, { user: EntitlementUser; rows: Row[] }>();
  for (const a of alerts) {
    const user: EntitlementUser | null = a.user ? { ...a.user, isAdmin: a.user.isAdmin || isAdminEmail(a.user.email) } : null;
    const ok = a.userId != null && user != null && isPremium(user);
    entitled.set(a.id, ok);
    if (!ok || a.targetCents == null) continue;
    const group = targetRowsByUser.get(a.userId!) ?? { user: user!, rows: [] };
    group.rows.push(a);
    targetRowsByUser.set(a.userId!, group);
  }
  for (const { user, rows } of targetRowsByUser.values()) {
    const live = honouredTargetIds(rows, targetAlertLimit(tierOf(user)));
    for (const a of rows) if (live.has(a.id)) honouredTarget.set(a.id, a.targetCents!);
  }
  const inScope = (a: Row) => scope === "all" || entitled.get(a.id) === true;

  // Rows this run evaluates: in scope, on a supported market (legacy NZ rows
  // would otherwise be priced as AU).
  const scoped: (Row & { market: Country })[] = [];
  for (const a of alerts) {
    if (!inScope(a)) continue;
    if (!isSupportedMarket(a.market)) {
      summary.legacyMarket++;
      continue;
    }
    scoped.push(a as Row & { market: Country });
  }
  // The watched cards, read once from the published catalogue (user rows hold
  // a plain product id and a finish). A product the catalogue no longer has
  // cannot be priced or named: its row is left alone this run.
  const cardsByUnit = await (deps.cards ?? liveAlertCards)(scoped.map((a) => ({ id: a.cardId, finish: finishFromIndex(a.finish) })));
  const rows: Live[] = [];
  for (const a of scoped) {
    const card = cardsByUnit.get(unitKey(a.cardId, finishFromIndex(a.finish)));
    if (card) rows.push({ ...a, card });
  }

  // THE ALERT PRICE for every evaluated (card, market): one bounded query.
  // A failed read throws — nothing is safe to compare, and it must never be
  // read as every watched card selling out.
  const prices = await computeAlertPrices(deps.readOffers ?? liveAlertReader(), rows.map((a) => ({ cardId: a.card.id, finish: a.card.finish, market: a.market })), now);
  const lowOf = (a: Live): number | null => a.card.low[a.market] ?? null;
  const preorderOf = (a: Live): boolean => a.card.releasedOn != null && a.card.releasedOn.getTime() > now.getTime();
  const priceOf = (a: Live): AlertPrice | undefined => prices.get(alertPairKey(a.market, a.card.id, a.card.finish));

  // TCGplayer market for the below-market trigger: Card.marketUsd (already
  // read with the row), converted into the watch's currency; TCGplayer's own
  // cheapest US listing, when the alert price names it, is the US guard.
  const tcgOf = (a: Live, ap: AlertPrice): TcgMarketRef | null =>
    a.card.marketUsd != null && a.card.marketUsd > 0
      ? {
          marketCents: usdCentsToCountry(a.card.marketUsd, a.market),
          marketUsdCents: a.card.marketUsd,
          lowUsdCents: a.market === "US" ? ap.stores.find((s) => s.source === "tcgplayer")?.priceCents ?? null : null,
        }
      : null;

  // THE DAILY BUDGET: distinct addresses emailed in the last
  // ALERT_BUDGET_WINDOW_MS, by any run. (A baseline pass sends nothing.)
  const budget = deps.dailyBudget ?? alertDailyBudget();
  // A GROUP BY in Postgres, not findMany's `distinct` (which Prisma dedupes
  // client-side after reading every row — tests/prisma-client-side-distinct).
  // Since 2026-09-29 the count spans every alert table (lib/alert-budget.ts):
  // a deck or sealed watch's email counts against the same fifty.
  // With email off nothing is sent, so nothing spends the budget.
  const recentAddresses = baselineOnly || !emailOn ? new Set<string>() : await recentlyEmailedAddresses(db, now, ALERT_BUDGET_WINDOW_MS);
  const remaining = emailOn ? Math.max(0, budget - recentAddresses.size) : Number.POSITIVE_INFINITY;
  const runBudget = scope === "all" ? Math.min(emailOn ? ALL_RUN_SHARE : Number.POSITIVE_INFINITY, remaining) : remaining;

  // When each ADDRESS was last emailed (the weekly cap's input), from the rows
  // already read.
  // OP: a delivery is an email OR an in-app flag (lastFlaggedAt), so the weekly
  // cap holds for both; "ever emailed" (first contact) counts emails only.
  const lastEmailedByAddress = new Map<string, number>();
  const everEmailed = new Set<string>();
  for (const a of alerts) {
    if (a.lastNotifiedAt != null) everEmailed.add(a.email);
    const last = lastDelivery(a.lastNotifiedAt, a.lastFlaggedAt);
    if (last == null) continue;
    const t = last.getTime();
    const seen = lastEmailedByAddress.get(a.email);
    if (seen == null || t > seen) lastEmailedByAddress.set(a.email, t);
  }

  // Per-row writes. `always` lands even when the row is held (a re-arm, an
  // outlier hold, a cleared pending low that was not confirmed); `base` — the
  // baseline — only when the row is not held, so a deferred or failed alert
  // re-detects next run.
  const always = new Map<string, Patch>();
  const base = new Map<string, Patch>();
  const heldIds = new Set<string>();
  const patch = (m: Map<string, Patch>, id: string, p: Patch) => m.set(id, { ...(m.get(id) ?? {}), ...p });

  interface Candidate {
    a: Live;
    item: PriceDropItem;
    paid: boolean; // exempt from the weekly cap
    cap: "paid" | "first" | "drop";
    order: number;
  }
  const candidates: Candidate[] = [];

  const buildItem = (
    a: Live,
    ap: AlertPrice,
    kind: AlertKind,
    ref: { cents: number | null; basis: PriceDropItem["referenceBasis"] },
    extra: Partial<PriceDropItem> = {},
  ): PriceDropItem => {
    const current = ap.priceCents!;
    const preorder = preorderOf(a);
    const loc = `/email-alert-${kind.replace("_", "-")}`;
    // The row's one-tap links (lib/alert-actions.ts): stop, snooze 30 days,
    // and for an entitled account "set target at this price" / "lower target
    // 10%" — a free or anonymous row gets the Plus link instead. The POST
    // re-checks entitlement and the Plus limit. No EMAIL_LINK_SECRET (or a
    // signing failure) drops the links, never the alert.
    let actions: PriceDropItem["actions"] = null;
    try {
      const canTarget = entitled.get(a.id) === true;
      actions = alertActionLinks({ alertId: a.id, currentCents: current, targetCents: canTarget ? a.targetCents : null, canTarget, now });
    } catch {
      actions = null;
    }
    return {
      kind,
      alertId: a.id,
      cardId: a.card.id,
      name: `${a.card.name}${a.card.variant ? ` (${a.card.variant})` : ""}`,
      setCode: a.card.setCode,
      number: a.card.number ?? "",
      url: `${SITE_URL}/card/${a.card.slug}`,
      market: a.market,
      currency: currencyOf(a.market),
      currentCents: current,
      referenceCents: ref.cents,
      referenceBasis: ref.basis,
      startPriceCents: a.startPriceCents ?? null,
      change:
        ref.cents != null && ref.cents > 0
          ? { cents: ref.cents - current, pct: Math.round(((ref.cents - current) / ref.cents) * 100) }
          : null,
      condition: ap.condition,
      stores: ap.stores.map((s) => ({
        retailer: s.source,
        name: s.name,
        url: affiliateUrl(s.url, s.source, loc),
        priceCents: s.priceCents,
        condition: s.condition,
        ...alertPostage(s, a.market),
      })),
      checkedAt: ap.checkedAt ?? now,
      targetCents: null,
      tcgMarket: null,
      soldOutAt: null,
      preorder,
      releasedOn: preorder ? a.card.releasedOn?.toISOString().slice(0, 10) ?? null : null,
      actions,
      ...extra,
    };
  };

  // ── Evaluate every row once ────────────────────────────────────────────────
  rows.forEach((a, order) => {
    const ap = priceOf(a);
    const prev = a.lastPriceCents;
    if (!ap || ap.state === "unknown") {
      // A failing feed claims stock (or claims a cheaper price than every
      // fresh copy): not a sell-out, not a price. Decide nothing and write
      // nothing until a fresh import says which it is.
      summary.unknown++;
      return;
    }

    if (ap.state === "soldout") {
      const cardPriced = lowOf(a) != null;
      if (cardPriced) summary.ebayOnly++;
      if (a.pendingLowCents != null) patch(always, a.id, { pendingLowCents: null });
      if (shouldRearmTarget({ current: null, targetCents: a.targetCents, targetEmailedCents: a.targetEmailedCents })) {
        patch(always, a.id, { targetEmailedCents: null });
      }
      // A LEGACY BASELINE: seeded from Card.lowestPriceCents* (eBay, played
      // and stale copies included) and never yet confirmed by a priced run of
      // the alert price (dropAnchorCents is written on every priced run, and
      // at creation since 2026-09-25). No store has ever had it at that
      // figure, so it is not a sell-out: reset to "no price", and the first
      // store listing fires "now listed" — not "back in stock … $eBay before
      // it sold out". A start price equal to that figure goes too, so the
      // email never says "you started watching at" an eBay price.
      if (prev != null && a.dropAnchorCents == null && a.soldOutAt == null && cardPriced) {
        patch(always, a.id, { lastPriceCents: null, ...(a.startPriceCents === prev ? { startPriceCents: null } : {}) });
        summary.legacyReset++;
        return;
      }
      if (prev != null && a.soldOutAt == null) {
        patch(always, a.id, { soldOutAt: now, soldOutRuns: 1 });
        summary.soldOut++;
      } else if (a.soldOutAt != null && (a.soldOutRuns ?? 1) < RESTOCK_MIN_SOLDOUT_RUNS) {
        // Seen sold out again: now it counts as a real sell-out.
        patch(always, a.id, { soldOutRuns: RESTOCK_MIN_SOLDOUT_RUNS });
      }
      return;
    }

    const current = ap.priceCents!;

    if (baselineOnly) {
      // No email, no hold: every priced watch moves to the new price. A watch
      // with no price yet keeps prev null, so "now listed" still fires.
      if (prev == null) return;
      if (shouldRearmTarget({ current, targetCents: a.targetCents, targetEmailedCents: a.targetEmailedCents })) {
        patch(always, a.id, { targetEmailedCents: null });
      }
      if (prev !== current) patch(always, a.id, { lastPriceCents: current });
      if (a.dropAnchorCents !== current) patch(always, a.id, { dropAnchorCents: current });
      if (a.pendingLowCents != null) patch(always, a.id, { pendingLowCents: null });
      if (a.soldOutAt != null) patch(always, a.id, { soldOutAt: null, soldOutRuns: null });
      return;
    }

    if (shouldRearmTarget({ current, targetCents: a.targetCents, targetEmailedCents: a.targetEmailedCents })) {
      patch(always, a.id, { targetEmailedCents: null });
    }

    // OUTLIER HOLD. A held low is confirmed when the price is still at it
    // (±OUTLIER_CONFIRM_PCT); a confirmed low skips the check once (and its
    // clear rides the baseline, so a deferral keeps it confirmable); an
    // unconfirmed one — higher OR lower — is cleared and the price is judged
    // afresh, which holds a still-implausible figure again.
    let confirmed = false;
    if (a.pendingLowCents != null) {
      if (confirmsPendingLow(a.pendingLowCents, current)) {
        confirmed = true;
        patch(base, a.id, { pendingLowCents: null });
      } else {
        patch(always, a.id, { pendingLowCents: null });
      }
    }
    if (!confirmed && isOutlierLow(prev, current)) {
      patch(always, a.id, { pendingLowCents: current });
      summary.outlierHeld++;
      heldIds.add(a.id);
      return;
    }

    // Back from a sell-out: news after RESTOCK_MIN_SOLDOUT_MS and two sold-out
    // runs, otherwise the marker is just cleared (one missed scrape is not a
    // restock).
    const restock = isRestock({ prev, soldOutAt: a.soldOutAt, soldOutRuns: a.soldOutRuns, now });
    if (a.soldOutAt != null) {
      if (restock) patch(base, a.id, { soldOutAt: null, soldOutRuns: null });
      else patch(always, a.id, { soldOutAt: null, soldOutRuns: null });
    }
    if (prev !== current) patch(base, a.id, { lastPriceCents: current });
    // The drop anchor rides the baseline too: a held item keeps it. A send
    // resets it to the emailed price (the persist step below).
    const anchor = nextDropAnchor({ anchorCents: a.dropAnchorCents, prev, current });
    if (anchor !== a.dropAnchorCents) patch(base, a.id, { dropAnchorCents: anchor });

    const refOpts = { prev, lowestEmailedCents: a.lowestEmailedCents, lastNotifiedAt: a.lastNotifiedAt, now, anchorCents: a.dropAnchorCents };
    const ref = alertReference(refOpts);
    let cand: Candidate | null = null;

    // PAID TRIGGERS first, for entitled rows.
    if (entitled.get(a.id)) {
      const target = honouredTarget.get(a.id) ?? null;
      const below = belowMarketSignal({ ...refOpts, country: a.market, current, tcg: tcgOf(a, ap) });
      let item: PriceDropItem | null = null;
      if (shouldEmailTarget({ current, targetCents: target, targetEmailedCents: a.targetEmailedCents })) {
        summary.targets++;
        item = buildItem(a, ap, "target", ref, { targetCents: target });
      } else if (restock) {
        summary.restocks++;
        item = buildItem(a, ap, preorderOf(a) ? "preorder" : "restock", { cents: prev, basis: "before_soldout" }, { soldOutAt: a.soldOutAt });
      } else if (below) {
        summary.belowMarket++;
        item = buildItem(a, ap, "below_market", ref, { tcgMarket: below });
      }
      if (item) {
        if (inPaidCooldown(lastDelivery(a.lastNotifiedAt, a.lastFlaggedAt), now)) {
          // Emailed about this card inside PAID_COOLDOWN_MS: hold the baseline
          // so the trigger re-detects on the next run instead of being lost.
          summary.cooldown++;
          heldIds.add(a.id);
          return;
        }
        cand = { a, item, paid: true, cap: "paid", order };
      }
    }

    // FREE RULES, for every row no paid trigger took.
    if (!cand) {
      if (isFirstPrice(prev, current)) {
        summary.listed++;
        const pre = preorderOf(a);
        if (pre) summary.preorders++;
        cand = { a, item: buildItem(a, ap, pre ? "preorder" : "listed", { cents: null, basis: null }), paid: false, cap: "first", order };
      } else if (restock) {
        summary.restocks++;
        const kind: AlertKind = preorderOf(a) ? "preorder" : "restock";
        cand = { a, item: buildItem(a, ap, kind, { cents: prev, basis: "before_soldout" }, { soldOutAt: a.soldOutAt }), paid: false, cap: "first", order };
      } else if (prev != null && current < prev) {
        summary.drops++;
        if (shouldEmailDrop({ ...refOpts, current })) {
          cand = { a, item: buildItem(a, ap, "drop", ref), paid: false, cap: "drop", order };
        } else {
          // Real, but not material against its reference: quiet. The last
          // price still advances — a sawtooth must not queue forever — but
          // the drop ANCHOR holds, so a slow slide adds up to an email.
          summary.suppressed++;
        }
      }
    }

    if (!cand) return;
    // SNOOZED ("Snooze 30 days" in the email): not emailed, but the baseline
    // advances so nothing backs up behind the snooze.
    if (a.snoozedUntil != null && a.snoozedUntil.getTime() > now.getTime()) {
      summary.snoozed++;
      return;
    }
    candidates.push(cand);
  });

  // ── Paused addresses ───────────────────────────────────────────────────────
  // "Pause alert emails, keep my watchlist" (AlertMute, lib/alert-mute.ts):
  // one scoped read for the addresses about to be emailed. A paused address's
  // triggers are dropped like a snoozed card's — not emailed, baselines
  // advance — so resuming never releases a backlog of stale news. A failed
  // read throws: emailing someone who asked for no email is worse than a run
  // that retries at the next import.
  // A pause is of EMAIL: with email off, in-app delivery is not paused.
  const pausedSet = emailOn && candidates.length ? await pausedAddresses(db, [...new Set(candidates.map((c) => c.a.email))]) : new Set<string>();
  if (pausedSet.size) {
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (!pausedSet.has(candidates[i]!.a.email)) continue;
      candidates.splice(i, 1);
      summary.paused++;
    }
  }

  // ── Open digests in priority order ─────────────────────────────────────────
  // target > restock > below-market > new low > listed/pre-order, then oldest
  // watch first. An item for an address that already has a digest this run
  // joins it for free; opening a new one must clear the weekly cap (free
  // items), its per-run cap and the daily budget, or it is DEFERRED: no email,
  // no watermark, baseline held, so it re-detects next run.
  candidates.sort((x, y) => ALERT_KIND_PRIORITY[x.item.kind] - ALERT_KIND_PRIORITY[y.item.kind] || x.order - y.order);
  const byEmail = new Map<string, { token: string; items: PriceDropItem[]; anonymous: boolean; userId: string | null }>();
  const notifiedIds = new Set<string>();
  const deferred: Candidate[] = [];
  const opened = { paid: 0, first: 0, drop: 0, firstContact: 0, budget: 0 };
  const queue = (c: Candidate) => {
    const { a, item } = c;
    const bucket = byEmail.get(a.email) ?? { token: a.unsubToken, items: [], anonymous: true, userId: null };
    bucket.items.push(item);
    // ANY linked row means this address has an account.
    if (a.userId != null) bucket.anonymous = false;
    if (bucket.userId == null) bucket.userId = a.userId;
    byEmail.set(a.email, bucket);
    notifiedIds.add(a.id);
  };
  const quiet = (email: string) => {
    const last = lastEmailedByAddress.get(email);
    return addressInCooldown({ lastEmailedAt: last == null ? null : new Date(last), now });
  };
  for (const c of candidates) {
    const email = c.a.email;
    if (byEmail.has(email)) {
      queue(c);
      continue;
    }
    const firstContact = !everEmailed.has(email);
    const opensBudget = !recentAddresses.has(email);
    let reason: "week" | "cap" | "budget" | null = null;
    if (!c.paid && quiet(email)) reason = "week";
    // The per-run caps and the budget protect the email quota: email only.
    else if (emailOn && c.cap === "paid" && opened.paid >= PAID_SEND_CAP) reason = "cap";
    else if (emailOn && c.cap === "first" && opened.first >= FIRST_PRICE_SEND_CAP) reason = "cap";
    else if (emailOn && c.cap === "drop" && firstContact && opened.firstContact >= FIRST_CONTACT_SEND_CAP) reason = "cap";
    else if (emailOn && opensBudget && opened.budget >= runBudget) reason = "budget";
    if (reason) {
      if (reason === "budget") summary.budgetDeferred++;
      deferred.push(c);
      continue;
    }
    if (c.cap === "paid") opened.paid++;
    else if (c.cap === "first") opened.first++;
    else if (firstContact) opened.firstContact++;
    if (opensBudget) opened.budget++;
    queue(c);
  }
  // A deferred item whose address got a digest anyway (a paid alert opened
  // one) joins it: that email is going out, and the item costs nothing more.
  for (const c of deferred) {
    if (byEmail.has(c.a.email)) {
      queue(c);
      continue;
    }
    summary.deferred++;
    heldIds.add(c.a.id);
  }

  // ── What one digest can show ───────────────────────────────────────────────
  // An email renders at most ALERT_EMAIL_FULL_ROWS + ALERT_EMAIL_COMPACT_ROWS
  // items (lib/email.ts renderedAlertItems, the same order it renders them
  // in); the rest become "and N more in your next alert email". Those are NOT
  // told: they are held exactly like deferred items — baseline kept, no
  // lastNotifiedAt or watermark written — so they re-detect next run, instead
  // of a later alert quoting "the price we last emailed you" that never was.
  const overflowIds = new Set<string>();
  for (const bucket of emailOn ? byEmail.values() : []) {
    const shown = new Set(renderedAlertItems(bucket.items));
    for (const item of bucket.items) {
      if (shown.has(item)) continue;
      overflowIds.add(item.alertId);
      summary.overflow++;
    }
  }
  for (const id of overflowIds) {
    notifiedIds.delete(id);
    heldIds.add(id);
  }

  // ── Deliver ────────────────────────────────────────────────────────────────
  // Email off: one in-app Notification per card for an account's watch; an
  // anonymous address has nowhere in-app to go and is held (baseline kept).
  const failedEmails = new Set<string>();
  const flaggedIds = new Set<string>();
  if (!emailOn) {
    for (const [email, { items, userId }] of byEmail) {
      if (!userId) {
        failedEmails.add(email);
        continue;
      }
      for (const item of items) {
        if (deps.notifyUsers === false) {
          flaggedIds.add(item.alertId);
          continue;
        }
        const ok = await notify(userId, notificationType(item), notificationTitle([item]), notificationBody(item), cardPath(item.url))
          .then(() => true)
          .catch(() => false);
        if (ok) flaggedIds.add(item.alertId);
      }
    }
    summary.flagged = flaggedIds.size;
    for (const id of notifiedIds) if (!flaggedIds.has(id)) heldIds.add(id);
  }
  // Email on: one digest per address, sequential to stay gentle on the
  // provider's rate limits.
  for (const [email, { token, items, anonymous, userId }] of emailOn ? byEmail : new Map()) {
    // The address's unsubToken addresses the email's pause / delete / manage
    // links and its List-Unsubscribe header (lib/email.ts alertAddressLinks).
    const sent = await sendPriceDropEmail(email, items, token, anonymous);
    if (sent) {
      summary.emails++;
      // In-app mirror for the account's own bell — only when the watch is
      // linked to one (anonymous watchers have nowhere in-app to see it).
      if (userId && deps.notifyUsers !== false) {
        const title = notificationTitle(items);
        await notify(userId, "price_drop", title, "Check your watchlist for the new price.", "/watching").catch(() => {});
      }
    } else failedEmails.add(email);
  }

  // ── Persist ────────────────────────────────────────────────────────────────
  // A failed digest's alerts are held exactly like deferred ones: the next run
  // must still see the move, or the alert the subscriber asked for is gone.
  const itemById = new Map<string, PriceDropItem>();
  for (const b of byEmail.values()) for (const i of b.items) if (notifiedIds.has(i.alertId)) itemById.set(i.alertId, i);
  for (const a of rows) {
    if (failedEmails.has(a.email) && notifiedIds.has(a.id)) heldIds.add(a.id);
  }
  const writes: { id: string; data: Record<string, unknown> }[] = [];
  for (const a of rows) {
    const held = heldIds.has(a.id);
    const data: Record<string, unknown> = { ...(always.get(a.id) ?? {}) };
    if (!held) Object.assign(data, base.get(a.id) ?? {});
    const item = !held && notifiedIds.has(a.id) ? itemById.get(a.id) : undefined;
    if (item && !emailOn) {
      // Delivered in-app: the baseline moves as after a send, but nothing that
      // means "an email was sent" is written (see the header).
      data.lastFlaggedAt = now;
      if (item.kind === "target") data.targetEmailedCents = item.currentCents;
      data.dropAnchorCents = item.currentCents;
    } else if (item) {
      // What we just told them. It becomes the reference for 30 days
      // (WATERMARK_TTL_MS) — the next alert on this card must be a material
      // move from it. A pre-order price is not a buying price yet and never
      // becomes the reference.
      data.lastNotifiedAt = now;
      if (item.kind !== "preorder") data.lowestEmailedCents = item.currentCents;
      if (item.kind === "target") data.targetEmailedCents = item.currentCents;
      // The slide we just told them about is over: the next one starts here.
      data.dropAnchorCents = item.currentCents;
    }
    if (Object.keys(data).length) writes.push({ id: a.id, data });
  }
  summary.held = heldIds.size;
  summary.updated = writes.length;
  if (writes.length) {
    await db.$transaction(writes.map((w) => db.priceAlert.update({ where: { id: w.id }, data: w.data })));
  }
  return summary;
}

/** The later of the last email and the last in-app flag: when this watch was last DELIVERED. */
export function lastDelivery(lastNotifiedAt: Date | null, lastFlaggedAt: Date | null): Date | null {
  if (!lastNotifiedAt) return lastFlaggedAt ?? null;
  if (!lastFlaggedAt) return lastNotifiedAt;
  return lastFlaggedAt > lastNotifiedAt ? lastFlaggedAt : lastNotifiedAt;
}

/** The Notification.type an in-app alert carries (the dashboard and the watchlist chips read it). */
export function notificationType(item: Pick<PriceDropItem, "kind">): string {
  return item.kind === "target" ? "price_target" : item.kind === "drop" ? "price_drop" : `price_${item.kind}`;
}

/** "Was US$12.00 · Near Mint · checked 17:10 EDT 3 Oct" — the in-app alert's second line. */
export function notificationBody(item: PriceDropItem): string {
  const m = (c: number) => formatMoney(c, item.currency);
  const was = item.referenceCents != null && item.referenceCents !== item.currentCents ? `Was ${m(item.referenceCents)} · ` : "";
  const target = item.kind === "target" && item.targetCents != null ? `Your target ${m(item.targetCents)} · ` : "";
  return `${target}${was}${item.condition ?? "Condition not stated"} · ${item.market}`;
}

/** The card page an in-app alert links to (a site path, never an absolute URL). */
export function cardPath(url: string): string {
  return url.startsWith(SITE_URL) ? url.slice(SITE_URL.length) || "/" : url;
}

// The in-app notification's title for one digest: the lead item (by the same
// priority the email uses), its price and the store behind it.
function notificationTitle(items: PriceDropItem[]): string {
  const lead = sortAlertItems(items)[0]!;
  const price = formatMoney(lead.currentCents, lead.currency);
  const at = lead.stores[0] ? ` at ${lead.stores[0].name}` : "";
  const more = items.length > 1 ? ` (+${items.length - 1} more)` : "";
  const head =
    lead.kind === "target"
      ? `${lead.name} hit your target: ${price}${at}`
      : lead.kind === "restock"
        ? `${lead.name} is back in stock: ${price}${at}`
        : lead.kind === "below_market"
          ? `${lead.name} is ${Math.round(lead.tcgMarket?.belowPct ?? 0)}% under TCGplayer market: ${price}${at}`
          : lead.kind === "preorder"
            ? `${lead.name} is open for pre-order from ${price}${at}`
            : lead.kind === "listed"
              ? `${lead.name} is now listed from ${price}${at}`
              : `${lead.name} dropped to ${price}${at}`;
  return `${head}${more}`;
}
