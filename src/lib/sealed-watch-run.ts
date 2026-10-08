import { prisma } from "./db";
import { getSealedByIds, getSets } from "./data";
import type { SealedKind } from "./constants";
import { COUNTRIES, currencyOf, type Country } from "./country";
import { isPremium, tierOf, type EntitlementFields } from "./premium";
import { adminEmails, isAdminEmail } from "./admin-emails";
import { sealedRrpAvailable, sealedWatchCeiling } from "./alert-limits";
import { ALERT_BUDGET_WINDOW_MS, PAID_SEND_CAP, alertDailyBudget, isMaterialDrop, lastDelivery, liveWatermark } from "./price-alerts";
import { recentlyEmailedAddresses, RunBudget, WATCH_EMAILS_PER_ADDRESS } from "./alert-budget";
import { pausedAddresses } from "./alert-mute";
import { watchActionLinks } from "./alert-actions";
import { affiliateUrl } from "./affiliate";
import { isEmailEnabled } from "./email";
import { sendSealedWatchEmail as sendSealedWatchEmailImpl, type SealedWatchItem, type SealedWatchKind } from "./watch-emails";
import { notify as notifyImpl } from "./notifications";
import { moneyCode as formatMoney } from "./format";
import { readSealedListings, type SealedListing } from "./sealed-alert-read";

// ─────────────────────────────────────────────────────────────────────────────
// SEALED WATCHES: THE RUN — RiftCompare's lib/sealed-watch.ts pure rules and
// runSealedWatches, ported in wave 2 (2026-10-03). The member track's
// lib/sealed-watch.ts holds the routes (create, list, update, delete); this is
// what checks them, from scripts/alerts.ts after each import.
// ─────────────────────────────────────────────────────────────────────────────
// One sealed product (Sealed.id) in one market. For each entitled watch the
// run looks at the REAL-STORE listings (lib/sealed-alert-read.ts: `store:`
// rows, never eBay, never the TCGplayer row). Offer states are RiftCompare's
// lib/sealed-offers.ts: open, sold out, unknown (a row not refreshed for 72h).
// Triggers, in precedence order, each at most once per SEALED_WATCH_COOLDOWN_MS
// per watch (a restock: SEALED_RESTOCK_COOLDOWN_MS):
//   • sealed_target   the cheapest open store price is at or under the
//                     member's target and news: never told, or at least
//                     SEALED_TARGET_REFIRE_PCT under the price last told, or
//                     that is older than the 30-day watermark.
//   • sealed_restock  sold out at EVERY tracked store (on fresh reads) for at
//                     least SEALED_RESTOCK_MIN_SOLDOUT_MS, and open now.
//   • sealed_rrp      OFF on OP Compare: there is no MSRP table yet
//                     (lib/alert-limits.ts SEALED_RRP_MARKETS = []).
//   • sealed_drop     no target, and a material drop (≥5% and
//                     ≥ SEALED_DROP_MIN_CENTS) under the reference.
// All-unknown listings decide nothing (a feed outage is not a sell-out).
//
// CADENCE: the store import runs once a day (src/lib/schedule.ts), so the
// watches are checked once a day (SEALED_CHECK_CADENCE) and the restock gap
// is a 5h floor — a sell-out seen at one run and a restock at the next is a
// day apart, well past it.
//
// EMAIL OFF (isEmailEnabled false): a trigger is delivered in-app — one
// Notification (notify(), the member track's contract) and lastFlaggedAt —
// and the baseline advances as after a send. lastNotifiedAt is written ONLY
// when an email was sent. The price watermark (lastEmailedCents) records the
// last DELIVERED price and is read with the later of lastNotifiedAt and
// lastFlaggedAt, so a target does not re-fire every run in-app. The budget
// and AlertMute (a pause of email) apply to email only.

export const SEALED_RESTOCK_MIN_SOLDOUT_MS = 5 * 60 * 60 * 1000;
export const SEALED_RESTOCK_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const SEALED_WATCH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const SEALED_TARGET_REFIRE_PCT = 5;
export const SEALED_DROP_MIN_CENTS = 100;
export const SEALED_WATCH_READ_CAP = 5000;
export const OFFER_STALE_MS = 72 * 3600_000;

export type { SealedWatchKind };

export type OfferStock = "open" | "soldout" | "unknown";

/** RiftCompare lib/sealed-offers.ts: a row not refreshed for 72h is unknown, never sold out. */
export function offerStock(o: Pick<SealedListing, "inStock" | "lastSeen">, now: number): OfferStock {
  const seen = Date.parse(o.lastSeen);
  if (Number.isFinite(seen) && now - seen > OFFER_STALE_MS) return "unknown";
  return o.inStock ? "open" : "soldout";
}

export interface SealedOfferState {
  open: SealedListing | null; // the cheapest open store listing
  openStores: number;
  soldOutEverywhere: boolean; // every store, fresh, sold out
  unknown: boolean; // no store listing decides anything (none, or all stale)
}

export function sealedOfferState(listings: readonly SealedListing[], now: Date): SealedOfferState {
  const t = now.getTime();
  let open: SealedListing | null = null;
  for (const l of listings) if (offerStock(l, t) === "open" && (!open || l.priceCents < open.priceCents)) open = l;
  const openStores = new Set(listings.filter((l) => offerStock(l, t) === "open").map((l) => l.retailer)).size;
  const unknown = listings.length === 0 || listings.every((l) => offerStock(l, t) === "unknown");
  const soldOutEverywhere = listings.length > 0 && listings.every((l) => offerStock(l, t) === "soldout");
  return { open, openStores, soldOutEverywhere, unknown };
}

export function shouldEmailSealedTarget(opts: { priceCents: number; targetCents: number | null; lastEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): boolean {
  if (opts.targetCents == null || opts.priceCents > opts.targetCents) return false;
  const live = liveWatermark({ lowestEmailedCents: opts.lastEmailedCents, lastNotifiedAt: opts.lastNotifiedAt, now: opts.now });
  if (live == null) return true;
  return opts.priceCents <= Math.floor((live * (100 - SEALED_TARGET_REFIRE_PCT)) / 100);
}

export function isSealedRestock(opts: { soldOutAt: Date | null; now: Date }): boolean {
  return opts.soldOutAt != null && opts.now.getTime() - opts.soldOutAt.getTime() >= SEALED_RESTOCK_MIN_SOLDOUT_MS;
}

/**
 * At RRP, and news (first time, or after a run saw it over RRP). Never on OP
 * Compare yet: no market is RRP-enabled (SEALED_RRP_MARKETS = []). Enabling a
 * market needs an MSRP table and RiftCompare's isAtMsrp check beside it.
 */
export function shouldEmailSealedRrp(opts: { market: Country; lastAtRrp: boolean | null; atRrp: boolean }): boolean {
  return sealedRrpAvailable(opts.market) && opts.atRrp && opts.lastAtRrp !== true;
}

export function sealedReference(opts: { lastPriceCents: number | null; lastEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): { cents: number | null; basis: "emailed" | "last" | null } {
  const live = liveWatermark({ lowestEmailedCents: opts.lastEmailedCents, lastNotifiedAt: opts.lastNotifiedAt, now: opts.now });
  if (live != null) return { cents: live, basis: "emailed" };
  if (opts.lastPriceCents != null) return { cents: opts.lastPriceCents, basis: "last" };
  return { cents: null, basis: null };
}

export function shouldEmailSealedDrop(opts: { priceCents: number; targetCents: number | null; lastPriceCents: number | null; lastEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): boolean {
  if (opts.targetCents != null) return false;
  const ref = sealedReference(opts).cents;
  if (ref == null) return false;
  return ref - opts.priceCents >= Math.max(Math.ceil((ref * 5) / 100), SEALED_DROP_MIN_CENTS) && isMaterialDrop(ref, opts.priceCents);
}

export function sealedCooldownMs(kind?: SealedWatchKind): number {
  return kind === "sealed_restock" ? SEALED_RESTOCK_COOLDOWN_MS : SEALED_WATCH_COOLDOWN_MS;
}

/** Was this watch delivered too recently for a `kind` alert? Restock: 6h. Anything else: 24h. */
export function inSealedCooldown(lastDeliveredAt: Date | null, now: Date, kind?: SealedWatchKind): boolean {
  return lastDeliveredAt != null && now.getTime() - lastDeliveredAt.getTime() < sealedCooldownMs(kind);
}

const isSupportedMarket = (m: string): m is Country => Object.prototype.hasOwnProperty.call(COUNTRIES, m);

// ── The run ──────────────────────────────────────────────────────────────────

export type SealedWatchDb = {
  sealedWatch: Pick<typeof prisma.sealedWatch, "findMany" | "update" | "groupBy">;
  priceAlert: Pick<typeof prisma.priceAlert, "groupBy">;
  deckWatch: Pick<typeof prisma.deckWatch, "findMany">;
  alertMute: Pick<typeof prisma.alertMute, "findMany">;
  $transaction: typeof prisma.$transaction;
};

/** What the email names a watched product by, read from the published catalogue (a watch row holds only the plain product id). */
export interface SealedInfo { slug: string; name: string; kind: SealedKind; releasedOn: Date | null; setCode: string | null }
export type SealedInfoLoader = (ids: readonly number[]) => Promise<Map<number, SealedInfo>>;

export const liveSealedInfo: SealedInfoLoader = async (ids) => {
  const [sealed, sets] = await Promise.all([getSealedByIds(ids), getSets()]);
  const setById = new Map(sets.map((x) => [x.id, x] as const));
  const out = new Map<number, SealedInfo>();
  for (const [id, x] of sealed) out.set(id, { slug: x.slug, name: x.name, kind: x.kind, releasedOn: x.releasedOn ? new Date(x.releasedOn) : null, setCode: x.setId != null ? setById.get(x.setId)?.code ?? null : null });
  return out;
};

export interface SealedWatchRunDeps {
  db?: SealedWatchDb;
  sealedInfo?: SealedInfoLoader;
  now?: Date;
  sendSealedWatchEmail?: typeof sendSealedWatchEmailImpl;
  notify?: (userId: string, type: string, title: string, body: string, href?: string | null) => Promise<void>;
  notifyUsers?: boolean;
  emailEnabled?: boolean;
  dailyBudget?: number;
  // New addresses this pass may open: what is left of PAID_SEND_CAP after the
  // card and deck passes (the run shares one cap across its passes).
  sendCap?: number;
}

export interface SealedWatchRunSummary {
  watches: number;
  lapsed: number;
  overLimit: number;
  legacyMarket: number;
  missing: number;
  unknown: number;
  soldOut: number;
  restocks: number;
  rrp: number;
  targets: number;
  drops: number;
  cooldown: number;
  snoozed: number;
  paused: number;
  deferred: number;
  budgetDeferred: number;
  addressDeferred: number;
  newAddresses: number;
  emails: number;
  flagged: number;
  updated: number;
  held: number;
}

type Patch = {
  lastPriceCents?: number | null;
  lastInStock?: boolean;
  soldOutAt?: Date | null;
  lastAtRrp?: boolean;
  lastEmailedCents?: number;
  lastNotifiedAt?: Date;
  lastFlaggedAt?: Date;
};

const KIND_PRIORITY: Record<SealedWatchKind, number> = { sealed_target: 0, sealed_restock: 1, sealed_rrp: 2, sealed_drop: 3 };

/** The in-app (and email-mirror) title for one sealed trigger. */
export function sealedNotificationTitle(item: Pick<SealedWatchItem, "kind" | "name" | "priceCents" | "currency" | "store">): string {
  const money = formatMoney(item.priceCents, item.currency);
  return item.kind === "sealed_restock"
    ? `${item.name} is back in stock: ${money} at ${item.store.name}`
    : item.kind === "sealed_rrp"
      ? `${item.name} is at RRP: ${money} at ${item.store.name}`
      : item.kind === "sealed_target"
        ? `${item.name} hit your target: ${money} at ${item.store.name}`
        : `${item.name} dropped to ${money} at ${item.store.name}`;
}

export async function runSealedWatches(deps: SealedWatchRunDeps = {}): Promise<SealedWatchRunSummary> {
  const db = deps.db ?? (prisma as unknown as SealedWatchDb);
  const send = deps.sendSealedWatchEmail ?? sendSealedWatchEmailImpl;
  const notify = deps.notify ?? notifyImpl;
  const emailOn = deps.emailEnabled ?? isEmailEnabled();
  const now = deps.now ?? new Date();
  const summary: SealedWatchRunSummary = {
    watches: 0, lapsed: 0, overLimit: 0, legacyMarket: 0, missing: 0, unknown: 0, soldOut: 0, restocks: 0, rrp: 0, targets: 0,
    drops: 0, cooldown: 0, snoozed: 0, paused: 0, deferred: 0, budgetDeferred: 0, addressDeferred: 0, newAddresses: 0, emails: 0, flagged: 0, updated: 0, held: 0,
  };
  const admins = adminEmails();

  const rows = await db.sealedWatch.findMany({
    where: {
      user: {
        is: {
          OR: [
            { isAdmin: true },
            { premiumUntil: { gt: now } },
            ...(admins.length ? [{ email: { in: admins, mode: "insensitive" as const } }] : []),
          ],
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: SEALED_WATCH_READ_CAP,
    select: {
      id: true,
      userId: true,
      email: true,
      market: true,
      sealedId: true,
      targetCents: true,
      lastPriceCents: true,
      lastInStock: true,
      soldOutAt: true,
      lastEmailedCents: true,
      lastNotifiedAt: true,
      lastFlaggedAt: true,
      lastAtRrp: true,
      snoozedUntil: true,
      createdAt: true,
      user: { select: { email: true, isAdmin: true, premiumUntil: true, premiumTier: true } },
    },
  });
  summary.watches = rows.length;

  // Entitlement and the Plus cap (oldest first).
  const perUser = new Map<string, number>();
  const live: ((typeof rows)[number] & { market: Country; sealed: SealedInfo })[] = [];
  const info = await (deps.sealedInfo ?? liveSealedInfo)([...new Set(rows.map((w) => w.sealedId))]);
  for (const w of rows) {
    const user: EntitlementFields = { ...w.user, isAdmin: w.user.isAdmin || isAdminEmail(w.user.email) };
    if (!isPremium(user)) {
      summary.lapsed++;
      continue;
    }
    const n = (perUser.get(w.userId) ?? 0) + 1;
    perUser.set(w.userId, n);
    if (n > sealedWatchCeiling(tierOf(user))) {
      summary.overLimit++;
      continue;
    }
    if (!isSupportedMarket(w.market)) {
      summary.legacyMarket++;
      continue;
    }
    const sealed = info.get(w.sealedId);
    if (!sealed) {
      summary.missing++; // a product the catalogue no longer lists cannot be named
      continue;
    }
    live.push({ ...w, market: w.market, sealed });
  }

  // The store listings, one bounded read. A failed read throws out of the
  // whole pass: nothing is decided from a partial read.
  const listings = live.length ? await readSealedListings(db, live.map((w) => ({ sealedId: w.sealedId, market: w.market }))) : new Map();

  const always = new Map<string, Patch>();
  const base = new Map<string, Patch>();
  const heldIds = new Set<string>();
  const patch = (m: Map<string, Patch>, id: string, p: Patch) => m.set(id, { ...(m.get(id) ?? {}), ...p });

  interface Candidate {
    id: string;
    userId: string;
    email: string;
    item: SealedWatchItem;
    order: number;
    atRrp: boolean;
  }
  const candidates: Candidate[] = [];

  live.forEach((w, order) => {
    const ls: SealedListing[] | undefined = listings.get(w.market)?.get(w.sealedId);
    if (!ls) {
      summary.missing++;
      return;
    }
    const state = sealedOfferState(ls, now);
    if (state.unknown) {
      summary.unknown++;
      return;
    }
    if (!state.open) {
      if (w.lastInStock !== false) patch(always, w.id, { lastInStock: false });
      if (state.soldOutEverywhere && w.soldOutAt == null) {
        // A watch never yet seen open was sold out from the moment it was
        // created (watching a sold-out box is the usual way in), so the clock
        // counts from then; a row that has been seen open starts at now.
        const since = w.lastInStock == null && w.createdAt.getTime() < now.getTime() ? w.createdAt : now;
        patch(always, w.id, { soldOutAt: since });
        summary.soldOut++;
      }
      return;
    }
    const price = state.open.priceCents;
    const preorder = w.sealed.releasedOn != null && w.sealed.releasedOn.getTime() > now.getTime();
    const atRrp = false; // no MSRP table (see the header)
    if (w.lastInStock !== true) patch(always, w.id, { lastInStock: true });
    if (!atRrp && w.lastAtRrp === true) patch(always, w.id, { lastAtRrp: false });
    const restock = isSealedRestock({ soldOutAt: w.soldOutAt, now });
    if (w.soldOutAt != null) {
      if (restock) patch(base, w.id, { soldOutAt: null });
      else patch(always, w.id, { soldOutAt: null });
    }
    if (price !== w.lastPriceCents) patch(base, w.id, { lastPriceCents: price });

    const delivered = lastDelivery(w.lastNotifiedAt, w.lastFlaggedAt);
    const refOpts = { lastPriceCents: w.lastPriceCents, lastEmailedCents: w.lastEmailedCents, lastNotifiedAt: delivered, now };
    let kind: SealedWatchKind | null = null;
    if (shouldEmailSealedTarget({ priceCents: price, targetCents: w.targetCents, lastEmailedCents: w.lastEmailedCents, lastNotifiedAt: delivered, now })) {
      kind = "sealed_target";
      summary.targets++;
    } else if (restock) {
      kind = "sealed_restock";
      summary.restocks++;
    } else if (!preorder && shouldEmailSealedRrp({ market: w.market, lastAtRrp: w.lastAtRrp, atRrp })) {
      kind = "sealed_rrp";
      summary.rrp++;
    } else if (shouldEmailSealedDrop({ priceCents: price, targetCents: w.targetCents, ...refOpts })) {
      kind = "sealed_drop";
      summary.drops++;
    }
    if (!kind) return;
    if (inSealedCooldown(delivered, now, kind)) {
      summary.cooldown++;
      heldIds.add(w.id);
      return;
    }
    if (w.snoozedUntil != null && w.snoozedUntil.getTime() > now.getTime()) {
      summary.snoozed++;
      return;
    }
    const ref = sealedReference(refOpts);
    let actions: SealedWatchItem["actions"] = null;
    try {
      actions = watchActionLinks({ kind: "sealed", id: w.id, now });
    } catch {
      actions = null;
    }
    const seen = Date.parse(state.open.lastSeen);
    candidates.push({
      id: w.id,
      userId: w.userId,
      email: w.email,
      order,
      atRrp,
      item: {
        kind,
        watchId: w.id,
        sealedId: w.sealedId,
        slug: w.sealed.slug,
        name: w.sealed.name,
        productType: w.sealed.kind,
        setCode: w.sealed.setCode,
        market: w.market,
        currency: currencyOf(w.market),
        priceCents: price,
        rrpCents: null,
        store: { name: state.open.retailerName, url: affiliateUrl(state.open.url, state.open.retailer, "/email-alert-sealed"), retailer: state.open.retailer },
        storeCount: state.openStores,
        targetCents: w.targetCents,
        referenceCents: kind === "sealed_restock" ? null : ref.cents,
        referenceBasis: kind === "sealed_restock" ? null : ref.basis,
        soldOutAt: kind === "sealed_restock" ? w.soldOutAt : null,
        checkedAt: Number.isFinite(seen) ? new Date(seen) : now,
        actions,
      },
    });
  });

  // A pause is of EMAIL: with email off, in-app delivery is not paused.
  const paused = emailOn && candidates.length ? await pausedAddresses(db, [...new Set(candidates.map((c) => c.email))]) : new Set<string>();
  const toSend = candidates.filter((c) => {
    if (!paused.has(c.email)) return true;
    summary.paused++;
    return false;
  });
  toSend.sort((x, y) => KIND_PRIORITY[x.item.kind] - KIND_PRIORITY[y.item.kind] || x.order - y.order);

  const recent = emailOn && toSend.length ? await recentlyEmailedAddresses(db, now, ALERT_BUDGET_WINDOW_MS) : new Set<string>();
  const budgetTotal = deps.dailyBudget ?? alertDailyBudget();
  const budget = emailOn
    ? new RunBudget(recent, Math.max(0, budgetTotal - recent.size), deps.sendCap ?? PAID_SEND_CAP, WATCH_EMAILS_PER_ADDRESS)
    : new RunBudget(recent, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const delivered = new Map<string, "email" | "flag">();
  for (const c of toSend) {
    const why = budget.reason(c.email);
    if (why) {
      summary.deferred++;
      if (why === "budget") summary.budgetDeferred++;
      if (why === "address") summary.addressDeferred++;
      heldIds.add(c.id);
      continue;
    }
    budget.open(c.email);
    const title = sealedNotificationTitle(c.item);
    if (!emailOn) {
      const ok =
        deps.notifyUsers === false
          ? true
          : await notify(c.userId, "sealed_watch", title, "Compare every store on the product page.", `/sealed/${c.item.slug}`)
              .then(() => true)
              .catch(() => false);
      if (!ok) {
        heldIds.add(c.id);
        continue;
      }
      summary.flagged++;
      delivered.set(c.id, "flag");
      continue;
    }
    const ok = await send(c.email, c.item);
    if (!ok) {
      heldIds.add(c.id);
      continue;
    }
    summary.emails++;
    delivered.set(c.id, "email");
    if (deps.notifyUsers !== false) await notify(c.userId, "sealed_watch", title, "Compare every store on the product page.", `/sealed/${c.item.slug}`).catch(() => {});
  }

  const writes: { id: string; data: Patch }[] = [];
  for (const w of live) {
    const held = heldIds.has(w.id);
    const data: Patch = { ...(always.get(w.id) ?? {}) };
    if (!held) Object.assign(data, base.get(w.id) ?? {});
    const how = delivered.get(w.id);
    if (how) {
      const c = toSend.find((x) => x.id === w.id)!;
      data.lastEmailedCents = c.item.priceCents;
      if (how === "email") data.lastNotifiedAt = now;
      else data.lastFlaggedAt = now;
      data.lastAtRrp = c.atRrp;
    }
    if (Object.keys(data).length) writes.push({ id: w.id, data });
  }
  summary.held = heldIds.size;
  summary.newAddresses = emailOn ? budget.newAddresses : 0;
  summary.updated = writes.length;
  if (writes.length) await db.$transaction(writes.map((x) => db.sealedWatch.update({ where: { id: x.id }, data: x.data })));
  return summary;
}
