import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { COUNTRIES, currencyOf, type Country } from "./country";
import { unitOfUid } from "./constants";
import { DECK_LINE_CAP, QTY_CAP, parseDeckList, type DeckLine } from "./deck";
import { deckCardName, listingTuples, liveOfferReader, loaderData, resolveDeckLines, type DeckData, type DeckRow, type OfferReader } from "./deck-price";
import type { BasketCard, BasketPlan } from "./basket";
import { isPremium, tierOf, type EntitlementFields } from "./premium";
import { isAdminEmail, adminEmails } from "./admin-emails";
import { deckWatchLimit, DECK_WATCH_LIMIT } from "./tier-limits";
import { formatMoney } from "./format-currency";
import { clampDeckTargetCents } from "./deck-watch-pure";
import { DEFAULT_MIN_CONDITION, isMinCondition, storedMinCondition, toStoredMinCondition, type MinCondition } from "./basket-condition";
import type { BasketListingTuple } from "./data";

// The client-safe pieces live in ./deck-watch-pure so a "use client" component
// can import them without pulling Prisma into the browser bundle
// (tests/client-imports.test.ts). Re-exported here for the server side.
export { friendlyTargetCents, clampDeckTargetCents, canWatchPricedResult, DECK_TARGET_MIN_CENTS, DECK_TARGET_MAX_CENTS } from "./deck-watch-pure";

// ─────────────────────────────────────────────────────────────────────────────
// DECK PRICE WATCH — Premium.
// ─────────────────────────────────────────────────────────────────────────────
// A member saves a list (the text /deck and Best Basket take) with, optionally,
// a delivered-price target. After every price import the alert run
// (scripts/alerts.ts, the collection-alerts track) calls runDeckWatches, which
// prices each list EXACTLY as Best Basket would — the same resolver
// (lib/deck-price.ts over the published data: a set and number, a finish, the
// cheapest printing when the line names none), the same in-stock store
// listings and condition floor (lib/basket-server.ts), the same optimiser
// (lib/basket.ts) and the same measured postage for the delivery the member
// saved (lib/shipping.ts) — and stores the delivered total. A basket item is a
// UNIT, (productId, finish): a Foil copy and a Normal copy of one card are two
// lines with two prices. Then:
//   • deck_target  the total is at or under the target, and that is news: we
//                  have never alerted on this watch, or the total is at least
//                  DECK_TARGET_REFIRE_PCT under the total we last alerted on,
//                  or that alert is older than WATERMARK_TTL_MS (30 days).
//   • deck_drop    no target, and the total is a MATERIAL drop (≥ 5% and ≥ one
//                  whole unit) under the reference: the total we last alerted
//                  on while that is under 30 days old, else the last run's.
// Only a plan that covers EVERY copy on the list can fire: a total that
// silently leaves a card out is not "the deck for $X".
//
// EMAIL IS OFF UNTIL CONFIGURED (CLAUDE.md "Email"). With `emailEnabled` the
// run hands each alert to the injected `send` and stamps lastNotifiedAt (the
// email timestamp, and only that); without it the alert is an in-app
// Notification through the injected `notify` (lib/notifications.ts, the member
// track) and lastFlaggedAt is stamped instead. In both cases lastEmailedCents
// holds the total last ALERTED on — the watermark the next run measures from —
// and the watermark's age is the newer of the two stamps. A send or notify that
// fails holds the row's baseline so the next run re-detects it.
//
// Only an owner who is entitled (isPremium(user, "premium")) is priced or
// alerted. A lapsed owner's rows are skipped untouched — kept, never deleted.
// Snoozed watches advance their baseline without an alert.
//
// EGRESS: the run is script-side (GitHub Actions). It reads at most
// DECK_WATCH_READ_CAP rows, only for entitled owners, and the published files of
// the cards on each list (the offer buckets, read through lib/offer-read.ts: the
// same files the site serves, from the checkout of the pointed commit when
// PLANE_DIR names it). Neon is opened for the watch rows only. Pages never call it.

/** After a target fires, it fires again only this % further down. */
export const DECK_TARGET_REFIRE_PCT = 5;
/** A material drop of a delivered total: at least this % of the reference… */
export const DECK_DROP_MIN_PCT = 5;
/** …and at least this many minor units (one whole dollar/pound/euro). */
export const DECK_DROP_MIN_CENTS = 100;
/** Watches read per run — far past DECK_WATCH_LIMIT × any real member count. */
export const DECK_WATCH_READ_CAP = 2000;
/** Longest saved list, in characters (the Best Basket request cap). */
export const DECK_WATCH_TEXT_MAX = 20_000;
export const DECK_WATCH_NAME_MAX = 80;
/** An alert watermark older than this is forgotten (30 days). */
export const WATERMARK_TTL_MS = 30 * 86_400_000;

// ── The pure rules ───────────────────────────────────────────────────────────

export function isDeckMaterialDrop(refCents: number, currentCents: number): boolean {
  return refCents - currentCents >= Math.max(Math.ceil((refCents * DECK_DROP_MIN_PCT) / 100), DECK_DROP_MIN_CENTS);
}

/** The total last alerted on, while that alert is under WATERMARK_TTL_MS old; else null. */
export function liveWatermark(opts: { lowestEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): number | null {
  if (opts.lowestEmailedCents == null || !opts.lastNotifiedAt) return null;
  return opts.now.getTime() - opts.lastNotifiedAt.getTime() < WATERMARK_TTL_MS ? opts.lowestEmailedCents : null;
}

/** What a move is measured from: the alerted total while live, else the last total. */
export function deckReference(opts: { lastTotalCents: number | null; lastEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): {
  cents: number | null;
  basis: "emailed" | "last" | null;
} {
  const live = liveWatermark({ lowestEmailedCents: opts.lastEmailedCents, lastNotifiedAt: opts.lastNotifiedAt, now: opts.now });
  if (live != null) return { cents: live, basis: "emailed" };
  if (opts.lastTotalCents != null) return { cents: opts.lastTotalCents, basis: "last" };
  return { cents: null, basis: null };
}

/** The target trigger: at or under the target, and news against the alerted watermark. */
export function shouldEmailDeckTarget(opts: { totalCents: number; targetCents: number | null; lastEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): boolean {
  const { totalCents, targetCents } = opts;
  if (targetCents == null || totalCents > targetCents) return false;
  const live = liveWatermark({ lowestEmailedCents: opts.lastEmailedCents, lastNotifiedAt: opts.lastNotifiedAt, now: opts.now });
  if (live == null) return true; // never alerted, or the last alert has lapsed (30 days)
  return totalCents <= Math.floor((live * (100 - DECK_TARGET_REFIRE_PCT)) / 100);
}

/** The drop trigger (no target): a material drop under the reference. */
export function shouldEmailDeckDrop(opts: { totalCents: number; targetCents: number | null; lastTotalCents: number | null; lastEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): boolean {
  if (opts.targetCents != null) return false;
  const ref = deckReference(opts).cents;
  return ref != null && isDeckMaterialDrop(ref, opts.totalCents);
}

/** When the watermark was last set: the newer of the email stamp and the in-app stamp. */
export function lastAlertedAt(w: { lastNotifiedAt: Date | null; lastFlaggedAt: Date | null }): Date | null {
  const a = w.lastNotifiedAt?.getTime() ?? 0;
  const b = w.lastFlaggedAt?.getTime() ?? 0;
  const t = Math.max(a, b);
  return t ? new Date(t) : null;
}

const isSupportedMarket = (m: string): m is Country => Object.prototype.hasOwnProperty.call(COUNTRIES, m);

// ── Pricing one list, the Best Basket way ────────────────────────────────────

/**
 * Where a run reads its cards and listings from. The default (loaderDeckSource) is the published data through the loaders; an Actions job points PLANE_DIR at its
 * checkout and the SAME code reads it. Tests pass fixtures.
 */
export interface DeckSource {
  /** The resolver /deck and Best Basket use: parsed lines to resolved rows, repeated lines merged. */
  resolve: (lines: DeckLine[]) => Promise<DeckRow[]>;
  /** In-stock listings of units: [uid, source, priceCents, condition index, url] (Best Basket's BasketListingTuple), `uid` = productId * 2 + finish. */
  listings: (country: Country, uids: number[]) => Promise<BasketListingTuple[]>;
}

export function loaderDeckSource(o: { data?: DeckData; offers?: OfferReader } = {}): DeckSource {
  const data = o.data ?? loaderData, offers = o.offers ?? liveOfferReader();
  return {
    resolve: async (lines) => (await resolveDeckLines(lines, data, { options: false })).rows,
    listings: async (country, uids) => listingTuples(await offers(uids.map(unitOfUid), country)),
  };
}

export interface DeckPricing {
  plan: BasketPlan;
  requestedCopies: number;
  unmatchedLines: number;
  complete: boolean; // every requested copy is bought by the plan
}

/**
 * Resolve and price a saved list for a market and the saved delivery, with
 * Best Basket's own pieces. null when nothing on the list resolved to a card.
 * Throws on a failed read — a failed listing read must never price as
 * "nothing in stock".
 */
export async function priceDeckList(
  source: DeckSource,
  opts: { listText: string; market: Country; region: string | null; trackedOnly: boolean | null; minCondition?: MinCondition },
): Promise<DeckPricing | null> {
  const lines = parseDeckList(opts.listText).slice(0, DECK_LINE_CAP);
  if (!lines.length) return null;
  const rows = await source.resolve(lines);
  const wanted = new Map<string, number>();
  const info = new Map<string, DeckRow & { card: NonNullable<DeckRow["card"]> }>();
  let unmatchedLines = 0;
  for (const r of rows) {
    if (!r.card) {
      unmatchedLines++;
      continue;
    }
    const uid = String(r.card.id * 2 + (r.finish === "F" ? 1 : 0));
    wanted.set(uid, Math.min(QTY_CAP, (wanted.get(uid) ?? 0) + r.line.qty));
    info.set(uid, r as DeckRow & { card: NonNullable<DeckRow["card"]> });
  }
  if (!wanted.size) return null;
  // The postage snapshot, the store registry and the optimiser are heavy and the routes and the pure rules above never need them: loaded when a run prices a list.
  const [{ basketStoresFor, postageOptionsFrom }, { optimizeBasket }, { loadStoreListings }] = await Promise.all([import("./shipping"), import("./basket"), import("./basket-server")]);
  const stores = basketStoresFor(opts.market, postageOptionsFrom(opts.market, opts.region, opts.trackedOnly ? "1" : null));
  const listings = await loadStoreListings([...wanted.keys()], opts.market, Object.keys(stores), opts.minCondition ?? "any", source.listings);
  const cards: BasketCard[] = [...wanted].map(([uid, qty]) => {
    const r = info.get(uid)!;
    return { cardId: uid, name: deckCardName(r.card, r.finish), slug: r.card.slug, setCode: r.card.setCode, collectorNumber: r.card.number ?? "", qty, listings: listings.get(uid) ?? [] };
  });
  const plan = optimizeBasket(cards, stores);
  const requestedCopies = [...wanted.values()].reduce((n, q) => n + q, 0);
  return { plan, requestedCopies, unmatchedLines, complete: plan.coveredCopies === requestedCopies && plan.coveredCopies > 0 };
}

// ── The run ──────────────────────────────────────────────────────────────────

export type DeckWatchKind = "deck_target" | "deck_drop";

/** What one alert says: the watch, its total and how it is made up. */
export interface DeckWatchItem {
  kind: DeckWatchKind;
  watchId: string;
  name: string;
  market: Country;
  currency: string;
  totalCents: number;
  itemsCents: number;
  shippingCents: number;
  storeCount: number;
  coveredCopies: number;
  requestedCopies: number;
  targetCents: number | null;
  referenceCents: number | null;
  referenceBasis: "emailed" | "last" | null;
  minCondition: MinCondition;
  stores: { name: string; subtotalCents: number; shippingCents: number; items: number }[];
  checkedAt: Date;
}

export type DeckWatchDb = Pick<typeof prisma, "$transaction"> & {
  deckWatch: Pick<typeof prisma.deckWatch, "findMany" | "update">;
};

export interface DeckWatchRunDeps {
  db?: DeckWatchDb;
  source?: DeckSource;
  now?: Date;
  /** Email is configured (isEmailEnabled(), script-side). Without it nothing is sent. */
  emailEnabled: boolean;
  /** The in-app channel: lib/notifications.ts notify(userId, type, title, body, href). */
  notify: (userId: string, type: string, title: string, body: string, href: string | null) => Promise<unknown>;
  /** The email channel (only called with emailEnabled). true = sent. */
  send?: (email: string, item: DeckWatchItem) => Promise<boolean>;
}

export interface DeckWatchRunSummary {
  watches: number; // rows read (entitled owners, by the query)
  lapsed: number; // rows whose owner is not entitled now — skipped untouched
  legacyMarket: number; // rows on an unsupported market — skipped
  priced: number; // lists that got a delivered total this run
  unpriced: number; // lists where nothing resolved, or nothing was in stock
  incomplete: number; // priced, but not every copy is buyable — no trigger
  targets: number;
  drops: number;
  snoozed: number;
  emails: number;
  notified: number; // in-app notifications written
  held: number; // alerts whose channel failed: the baseline is held to re-detect
  updated: number;
}

type Patch = { lastTotalCents?: number | null; lastCheckedAt?: Date; lastEmailedCents?: number; lastNotifiedAt?: Date; lastFlaggedAt?: Date };

/** The title of a deck alert, in the list's own currency. */
export function deckAlertTitle(item: Pick<DeckWatchItem, "kind" | "name" | "totalCents" | "currency">): string {
  const m = formatMoney(item.totalCents, item.currency);
  return item.kind === "deck_target" ? `${item.name} is under your target: ${m} delivered` : `${item.name} is now ${m} delivered`;
}

export async function runDeckWatches(deps: DeckWatchRunDeps): Promise<DeckWatchRunSummary> {
  const db = deps.db ?? (prisma as unknown as DeckWatchDb);
  const source = deps.source ?? loaderDeckSource();
  const now = deps.now ?? new Date();
  const summary: DeckWatchRunSummary = {
    watches: 0, lapsed: 0, legacyMarket: 0, priced: 0, unpriced: 0, incomplete: 0, targets: 0, drops: 0,
    snoozed: 0, emails: 0, notified: 0, held: 0, updated: 0,
  };

  // Only rows whose owner is inside a paid period or is an admin; isPremium
  // below is the real check.
  const rows = await db.deckWatch.findMany({
    where: {
      user: {
        is: {
          OR: [
            { isAdmin: true },
            { premiumUntil: { gt: now } },
            ...(adminEmails().length ? [{ email: { in: adminEmails(), mode: "insensitive" as const } }] : []),
          ],
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: DECK_WATCH_READ_CAP,
    select: {
      id: true, userId: true, market: true, name: true, listText: true, region: true, trackedOnly: true, minCondition: true,
      targetCents: true, lastTotalCents: true, lastEmailedCents: true, lastNotifiedAt: true, lastFlaggedAt: true, snoozedUntil: true, createdAt: true,
      user: { select: { email: true, isAdmin: true, premiumUntil: true, premiumTier: true } },
    },
  });
  summary.watches = rows.length;

  const writes = new Map<string, Patch>();
  const patch = (id: string, p: Patch) => writes.set(id, { ...(writes.get(id) ?? {}), ...p });
  const perUser = new Map<string, number>();

  for (const w of rows) {
    const user: EntitlementFields = { ...w.user, isAdmin: w.user.isAdmin || isAdminEmail(w.user.email) };
    if (!isPremium(user, "premium")) {
      summary.lapsed++;
      continue;
    }
    const n = (perUser.get(w.userId) ?? 0) + 1;
    perUser.set(w.userId, n);
    if (n > deckWatchLimit(tierOf(user))) continue;
    if (!isSupportedMarket(w.market)) {
      summary.legacyMarket++;
      continue;
    }
    const market: Country = w.market;
    const floor = storedMinCondition(w.minCondition);
    // A failed read throws out of the whole pass: nothing below is written.
    const priced = await priceDeckList(source, { listText: w.listText, market, region: w.region, trackedOnly: w.trackedOnly, minCondition: floor });
    patch(w.id, { lastCheckedAt: now });
    if (!priced || priced.plan.coveredCopies === 0) {
      summary.unpriced++;
      continue;
    }
    summary.priced++;
    const total = priced.plan.totalCents;
    const base: Patch = total !== w.lastTotalCents ? { lastTotalCents: total } : {};
    if (!priced.complete) {
      summary.incomplete++;
      patch(w.id, base);
      continue;
    }
    const alertedAt = lastAlertedAt(w);
    const refOpts = { lastTotalCents: w.lastTotalCents, lastEmailedCents: w.lastEmailedCents, lastNotifiedAt: alertedAt, now };
    let kind: DeckWatchKind | null = null;
    if (shouldEmailDeckTarget({ totalCents: total, targetCents: w.targetCents, lastEmailedCents: w.lastEmailedCents, lastNotifiedAt: alertedAt, now })) {
      kind = "deck_target";
      summary.targets++;
    } else if (shouldEmailDeckDrop({ totalCents: total, targetCents: w.targetCents, ...refOpts })) {
      kind = "deck_drop";
      summary.drops++;
    }
    if (!kind || (w.snoozedUntil != null && w.snoozedUntil.getTime() > now.getTime())) {
      if (kind) summary.snoozed++;
      patch(w.id, base);
      continue;
    }
    const ref = deckReference(refOpts);
    const item: DeckWatchItem = {
      kind,
      watchId: w.id,
      name: w.name,
      market,
      currency: currencyOf(market),
      totalCents: total,
      itemsCents: priced.plan.itemsCents,
      shippingCents: priced.plan.shippingCents + priced.plan.topUpCents,
      storeCount: priced.plan.storeCount,
      coveredCopies: priced.plan.coveredCopies,
      requestedCopies: priced.requestedCopies,
      targetCents: w.targetCents,
      referenceCents: ref.cents,
      referenceBasis: ref.basis,
      minCondition: floor,
      stores: priced.plan.stores.slice(0, 3).map((s) => ({ name: s.name, subtotalCents: s.subtotalCents, shippingCents: s.shippingCents, items: s.items })),
      checkedAt: now,
    };
    let ok = false;
    if (deps.emailEnabled && deps.send) {
      ok = await deps.send(w.user.email, item).catch(() => false);
      if (ok) {
        summary.emails++;
        patch(w.id, { ...base, lastEmailedCents: total, lastNotifiedAt: now });
      }
    } else {
      ok = await deps
        .notify(w.userId, "deck_watch", deckAlertTitle(item), "Open Best Basket for the store-by-store plan.", `/tools/best-basket?watch=${encodeURIComponent(w.id)}`)
        .then(() => true)
        .catch(() => false);
      if (ok) {
        summary.notified++;
        patch(w.id, { ...base, lastEmailedCents: total, lastFlaggedAt: now });
      }
    }
    // A failed channel holds the baseline (lastTotalCents unchanged) so it re-detects.
    if (!ok) summary.held++;
  }

  const list = [...writes].filter(([, d]) => Object.keys(d).length);
  summary.updated = list.length;
  if (list.length) await db.$transaction(list.map(([id, data]) => db.deckWatch.update({ where: { id }, data })));
  return summary;
}

// ── The routes' logic (app/api/watches/deck) ─────────────────────────────────

export type DeckWatchRouteDb = {
  deckWatch: Pick<typeof prisma.deckWatch, "count" | "create" | "findFirst" | "findMany" | "update" | "deleteMany">;
};

/** The routes' database: Prisma, handed over here so nothing under src/app imports @/lib/db. */
export const deckWatchRouteDb: DeckWatchRouteDb = prisma;

export interface WatchRouteResult {
  status: number;
  body: Record<string, unknown>;
}

export type RouteUser = EntitlementFields & { id: string; email: string };

export const DECK_WATCH_SELECT = {
  id: true,
  market: true,
  name: true,
  listText: true,
  region: true,
  trackedOnly: true,
  minCondition: true,
  targetCents: true,
  lastTotalCents: true,
  lastCheckedAt: true,
  lastEmailedCents: true,
  lastNotifiedAt: true,
  lastFlaggedAt: true,
  snoozedUntil: true,
  createdAt: true,
} as const;

function notPremium(): WatchRouteResult {
  return { status: 402, body: { error: "Deck price watches are part of Premium.", code: "tier_required", tier: "premium" } };
}

const asInt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

/** POST: save a list to watch. 402 without Premium; 409 at DECK_WATCH_LIMIT. */
export async function createDeckWatch(db: DeckWatchRouteDb, user: RouteUser, raw: unknown, market: Country): Promise<WatchRouteResult> {
  if (!isPremium(user, "premium")) return notPremium();
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const listText = typeof body.listText === "string" ? body.listText.slice(0, DECK_WATCH_TEXT_MAX).trim() : "";
  const lines = parseDeckList(listText);
  if (!lines.length) return { status: 400, body: { error: "Paste a list with at least one card first." } };
  const rawName = typeof body.name === "string" ? body.name.trim().slice(0, DECK_WATCH_NAME_MAX) : "";
  const first = lines[0]!.name || lines[0]!.number || "Deck";
  const name = rawName || `${first}${lines.length > 1 ? ` +${lines.length - 1}` : ""}`.slice(0, DECK_WATCH_NAME_MAX);
  const targetRaw = body.targetCents == null ? null : asInt(body.targetCents);
  if (body.targetCents != null && targetRaw == null) return { status: 400, body: { error: "The target must be a whole number of cents." } };
  const targetCents = targetRaw == null ? null : clampDeckTargetCents(targetRaw);
  const region = typeof body.region === "string" && /^[a-z0-9-]{1,32}$/i.test(body.region) ? body.region : null;
  const trackedOnly = body.trackedOnly === true;
  // A NEW watch defaults to "LP or better"; "any" (or null) is stored as null.
  if (body.minCondition != null && !isMinCondition(body.minCondition)) {
    return { status: 400, body: { error: "The minimum condition must be nm, lp or any." } };
  }
  const floor: MinCondition = !("minCondition" in body) ? DEFAULT_MIN_CONDITION : isMinCondition(body.minCondition) ? body.minCondition : "any";
  const minCondition = toStoredMinCondition(floor);
  const count = await db.deckWatch.count({ where: { userId: user.id } });
  if (count >= DECK_WATCH_LIMIT) {
    return { status: 409, body: { error: `Premium watches up to ${DECK_WATCH_LIMIT} lists. Stop one on your watchlist to add this.`, code: "limit", limit: DECK_WATCH_LIMIT, count } };
  }
  const watch = await db.deckWatch.create({
    data: { userId: user.id, market, name, listText, region, trackedOnly, targetCents, minCondition },
    select: DECK_WATCH_SELECT,
  });
  return { status: 201, body: { ok: true, watch } };
}

/** GET: this account's deck watches, oldest first. Nothing to hide from a lapsed owner. */
export async function listDeckWatches(db: DeckWatchRouteDb, user: RouteUser): Promise<WatchRouteResult> {
  const watches = await db.deckWatch.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, take: DECK_WATCH_LIMIT * 2, select: DECK_WATCH_SELECT });
  return { status: 200, body: { watches, limit: DECK_WATCH_LIMIT, entitled: isPremium(user, "premium") } };
}

/** One of the member's own watches, for Best Basket's ?watch= (owner only; null otherwise). */
export async function findOwnDeckWatch(userId: string, id: string, db: Pick<DeckWatchRouteDb, "deckWatch"> = prisma) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  return db.deckWatch
    .findFirst({ where: { id, userId }, select: { id: true, name: true, listText: true, region: true, trackedOnly: true, minCondition: true } })
    .catch(() => null);
}

/**
 * PATCH: change the target (re-arms it), rename, change the floor, or snooze /
 * unsnooze. The owner only. Editing is Premium's; SNOOZING needs no
 * entitlement, so a lapsed owner can quiet a watch that would resume.
 */
export async function updateDeckWatch(db: DeckWatchRouteDb, user: RouteUser, id: string, raw: unknown, now: Date = new Date()): Promise<WatchRouteResult> {
  const edits = raw && typeof raw === "object" && ("targetCents" in raw || "minCondition" in raw || (typeof (raw as { name?: unknown }).name === "string" && !!(raw as { name: string }).name.trim()));
  if (edits && !isPremium(user, "premium")) return notPremium();
  const row = await db.deckWatch.findFirst({ where: { id, userId: user.id }, select: { id: true, minCondition: true } });
  if (!row) return { status: 404, body: { error: "That watch isn't on your list." } };
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const data: Prisma.DeckWatchUpdateInput = {};
  if ("targetCents" in body) {
    if (body.targetCents == null) data.targetCents = null;
    else {
      const t = asInt(body.targetCents);
      if (t == null) return { status: 400, body: { error: "The target must be a whole number of cents." } };
      data.targetCents = clampDeckTargetCents(t);
    }
    // A changed target is armed again: the next run judges it afresh.
    data.lastEmailedCents = null;
  }
  if ("minCondition" in body) {
    if (body.minCondition != null && !isMinCondition(body.minCondition)) return { status: 400, body: { error: "The minimum condition must be nm, lp or any." } };
    const next = toStoredMinCondition(isMinCondition(body.minCondition) ? body.minCondition : "any");
    data.minCondition = next;
    if (next !== (row.minCondition ?? null)) {
      // A changed floor is a different list of prices: re-baseline.
      data.lastTotalCents = null;
      data.lastEmailedCents = null;
    }
  }
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, DECK_WATCH_NAME_MAX);
  if ("snoozeDays" in body) {
    const d = asInt(body.snoozeDays);
    if (d == null || d < 0 || d > 365) return { status: 400, body: { error: "Snooze for up to a year." } };
    data.snoozedUntil = d === 0 ? null : new Date(now.getTime() + d * 86_400_000);
  }
  if (!Object.keys(data).length) return { status: 400, body: { error: "Nothing to change." } };
  const watch = await db.deckWatch.update({ where: { id: row.id }, data, select: DECK_WATCH_SELECT });
  return { status: 200, body: { ok: true, watch } };
}

/** DELETE: stop watching. The owner only, whatever the tier; idempotent. */
export async function deleteDeckWatch(db: DeckWatchRouteDb, user: RouteUser, id: string): Promise<WatchRouteResult> {
  const res = await db.deckWatch.deleteMany({ where: { id, userId: user.id } });
  return { status: res.count ? 200 : 404, body: { ok: res.count > 0, removed: res.count } };
}
