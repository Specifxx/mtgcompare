// Version-tolerant reading of Stripe subscription entitlement, ported from
// RiftCompare (src/lib/stripe-entitlement.ts there). Webhook payloads follow the
// endpoint's API version, which can differ from the SDK's, and Stripe has moved
// fields between versions (invoice.subscription → invoice.parent.
// subscription_details.subscription; subscription.current_period_end → each
// item's current_period_end). Everything here reads BOTH generations.
//
// Pure on purpose — no Prisma, no Stripe client — so tests/premium.test.ts can
// drive every shape.
import { STRIPE_SITE, isTier, type Tier } from "./plans";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null => (v && typeof v === "object" ? (v as Rec) : null);

function idOf(v: unknown): string | null {
  if (typeof v === "string" && v) return v;
  const r = rec(v);
  return r && typeof r.id === "string" && r.id ? r.id : null;
}

/** The subscription an invoice belongs to, in either payload generation. */
export function subscriptionIdFromInvoice(invoice: unknown): string | null {
  const inv = rec(invoice);
  if (!inv) return null;
  const direct = idOf(inv.subscription);
  if (direct) return direct;
  const viaParent = idOf(rec(rec(inv.parent)?.subscription_details)?.subscription);
  if (viaParent) return viaParent;
  const lines = rec(inv.lines);
  for (const line of Array.isArray(lines?.data) ? (lines!.data as unknown[]) : []) {
    const l = rec(line);
    if (!l) continue;
    const id =
      idOf(l.subscription) ??
      idOf(rec(rec(l.parent)?.subscription_item_details)?.subscription) ??
      idOf(rec(rec(l.parent)?.subscription_details)?.subscription);
    if (id) return id;
  }
  return null;
}

function fromEpoch(v: unknown): Date | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
}

/** Paid-through date: the subscription's own field, else the latest item's. */
export function periodEndFromSubscription(sub: unknown): Date | null {
  const s = rec(sub);
  if (!s) return null;
  const top = fromEpoch(s.current_period_end);
  if (top) return top;
  let latest: Date | null = null;
  const items = rec(s.items);
  for (const item of Array.isArray(items?.data) ? (items!.data as unknown[]) : []) {
    const end = fromEpoch(rec(item)?.current_period_end);
    if (end && (!latest || end > latest)) latest = end;
  }
  return latest;
}

/**
 * Statuses that earn access through the period end. `past_due` is deliberately
 * NOT one: its period end is the period Stripe is still TRYING to bill, so
 * counting it grants a month nobody paid for (RiftCompare's churchless
 * incident). Already-paid time is never taken away — stamping is extend-only.
 */
export const ENTITLED_STATUSES = new Set(["active", "trialing"]);

export function entitledUntilFromSubscription(sub: unknown): Date | null {
  const s = rec(sub);
  if (!s || typeof s.status !== "string" || !ENTITLED_STATUSES.has(s.status)) return null;
  return periodEndFromSubscription(s);
}

export function userIdFromSubscription(sub: unknown): string | null {
  const v = rec(rec(sub)?.metadata)?.userId;
  return typeof v === "string" && v ? v : null;
}

export function customerIdOf(obj: unknown): string | null {
  return idOf(rec(obj)?.customer);
}

/** The first item's Price, as an object when Stripe sent one. */
function firstPrice(sub: unknown): Rec | null {
  const items = rec(rec(sub)?.items);
  const data = Array.isArray(items?.data) ? (items!.data as unknown[]) : [];
  return rec(rec(data[0])?.price);
}

/**
 * Is this an OP Compare subscription? Its Price (created by scripts/stripe-
 * setup.ts) or its own metadata (set at checkout) says site=opcompare. Anything
 * else in the Stripe account is ignored, so a subscription to another product
 * can never grant OP Compare access.
 */
export function isOurSubscription(sub: unknown): boolean {
  const price = firstPrice(sub);
  return rec(price?.metadata)?.site === STRIPE_SITE || rec(rec(sub)?.metadata)?.site === STRIPE_SITE;
}

/** The tier a subscription pays for: the live Price first (it follows plan switches), then checkout metadata. */
export function tierOfSubscription(sub: unknown): Tier {
  const fromPrice = rec(firstPrice(sub)?.metadata)?.tier;
  if (isTier(fromPrice)) return fromPrice;
  const fromSub = rec(rec(sub)?.metadata)?.tier;
  return isTier(fromSub) ? fromSub : "premium";
}

/**
 * EXTEND-ONLY: the new premiumUntil to write, or null to leave it. Stripe may
 * only ever grow a user's paid-through date; a lapsed subscription simply stops
 * extending it, which is the cancellation model.
 */
export function extendedPremiumUntil(current: Date | null | undefined, entitled: Date | null): Date | null {
  if (!entitled) return null;
  if (current && current >= entitled) return null;
  return entitled;
}
