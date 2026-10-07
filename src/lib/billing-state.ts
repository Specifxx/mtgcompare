import { ourSubscription, summarizeSubscription } from "./plan-subscription";

// The two billing facts the client chrome needs about a PLUS viewer's own
// subscription, published on /api/me — RiftCompare's lib/billing-state.ts,
// ported in wave 2 (2026-10-03):
//
//   trialing — inside a trial (OP Compare sells none, so this stays false
//     unless the owner ever turns one on; the plan-change routes select only
//     active subscriptions, so a trialist must not be offered a switch).
//   interval — "month" | "year". The upgrade route keeps the subscriber's
//     interval, so an annual Plus member upgrading is billed Premium's ANNUAL
//     price; every button that offers the switch quotes it (plan-switch-price).
//
// One Stripe read per PLUS customer — the only viewers these facts change
// anything for — memoised per instance for 10 minutes. Premium, free and
// signed-out viewers never cause a read, and no database query is added: the
// customer id is already on the session user.
//
// Never allowed to hold up /api/me (which carries the adFree flag the ad
// placements wait for): a read slower than READ_TIMEOUT_MS answers NONE for
// this request and is memoised when it lands. An empty answer (no live
// subscription, a failed call) is memoised for a minute only.
export type BillingState = { trialing: boolean; interval: "month" | "year" | null };

const NONE: BillingState = { trialing: false, interval: null };
const TTL_MS = 10 * 60_000;
const EMPTY_TTL_MS = 60_000;
export const READ_TIMEOUT_MS = 1500;
const memo = new Map<string, { state: BillingState; at: number; ttl: number }>();
const inflight = new Map<string, Promise<BillingState>>();

type Read = (customerId: string) => Promise<{ status: string; interval: "month" | "year" | null } | null>;

const stripeRead: Read = async (customerId) => summarizeSubscription(await ourSubscription(customerId));

export async function billingStateFor(
  user: { stripeCustomerId?: string | null } | null,
  paid: boolean,
  now: number = Date.now(),
  read: Read = stripeRead,
  timeoutMs: number = READ_TIMEOUT_MS,
): Promise<BillingState> {
  const id = user?.stripeCustomerId;
  if (!paid || !id) return NONE;
  const hit = memo.get(id);
  if (hit && now - hit.at < hit.ttl) return hit.state;
  // One read in flight per customer.
  let landed = inflight.get(id);
  if (!landed) {
    const pending: Promise<BillingState> = read(id)
      .catch(() => null)
      .then((d) => {
        const state: BillingState = d ? { trialing: d.status === "trialing", interval: d.interval } : NONE;
        if (memo.size > 5000) memo.clear();
        memo.set(id, { state, at: now, ttl: d ? TTL_MS : EMPTY_TTL_MS });
        return state;
      })
      .finally(() => {
        if (inflight.get(id) === pending) inflight.delete(id);
      });
    inflight.set(id, pending);
    landed = pending;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<BillingState>((resolve) => {
    timer = setTimeout(() => resolve(NONE), timeoutMs);
  });
  try {
    return await Promise.race([landed, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/** Tests only: the memo is per module instance. */
export function forgetBillingState(): void {
  memo.clear();
  inflight.clear();
}
