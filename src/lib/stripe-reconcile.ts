// The daily backstop for a missed or failed webhook (ported from RiftCompare):
// every active/trialing MTG Compare subscription is stamped again, extend-only,
// so a dropped renewal event can't leave a paying member locked out. It never
// matches by email — only by the userId MTG Compare's checkout put in the
// subscription's metadata, or a customer id already linked to a user.
import { stripe } from "./stripe";
import { stampFromSubscription } from "./premium";
import { ENTITLED_STATUSES } from "./stripe-entitlement";

export async function runStripeReconcile(): Promise<{ seen: number; stamped: number; unmatched: string[] }> {
  let seen = 0;
  let stamped = 0;
  const unmatched: string[] = [];
  for (const status of ENTITLED_STATUSES) {
    for await (const sub of stripe().subscriptions.list({ status: status as "active" | "trialing", limit: 100 })) {
      const r = await stampFromSubscription(sub);
      if (r === "not-ours") continue;
      seen++;
      if (r === "stamped") stamped++;
      if (r === "no-user") unmatched.push(sub.id);
    }
  }
  return { seen, stamped, unmatched };
}
