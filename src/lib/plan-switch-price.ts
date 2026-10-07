import { planPrice, type Tier } from "./plans";

/**
 * What a plan SWITCH to `target` will bill, in the subscriber's own interval
 * (RiftCompare's lib/plan-switch-price.ts). The upgrade and downgrade routes
 * keep the subscription's interval, so an ANNUAL Plus member moving to
 * Premium is billed Premium's yearly price, and every button that offers the
 * switch (SubscriptionActions, PlanDialog, the dashboard) quotes that.
 *
 * `targetAnnualLive` mirrors the route's fallback: with no yearly Price for
 * the target tier the route bills the monthly one, so the label says monthly.
 */
export function planSwitchPriceLabel(target: Tier, interval: "month" | "year" | null | undefined, targetAnnualLive = true): string {
  return interval === "year" && targetAnnualLive ? `${planPrice(target, "year")}/yr` : `${planPrice(target, "month")}/mo`;
}
