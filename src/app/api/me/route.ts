import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { tierOf } from "@/lib/premium";
import { billingStateFor } from "@/lib/billing-state";
import { unreadCount } from "@/lib/notifications";
import { touchActivity } from "@/lib/activity";
import { getEmailStatus } from "@/lib/data";

export const dynamic = "force-dynamic";

// The header's account state, fetched by the browser only when the mc_auth hint
// cookie says someone is signed in (lib/use-me.ts). Never cached.
//
// Wave 2 (member track, RiftCompare's /api/me):
//   trialing / interval — a PLUS viewer's own subscription, one memoised,
//     time-boxed Stripe read per customer (lib/billing-state.ts), so the
//     upgrade buttons quote the subscriber's own interval. Nobody else causes
//     a Stripe read, and adFree never waits on one.
//   unreadCount — one indexed count of unread in-app notifications (the
//     alerts' delivery while email is off): the header heart's dot and the
//     dashboard. No polling anywhere; it rides this request.
//   preferredCountry — the market the welcome checklist saved.
//   userId — opaque, for the referral link on /profile.
//   emailOn — the cached site-wide email flag (getEmailStatus), so client
//     copy promises an email only once a mailer is configured.
// The activity stamp (lib/activity.ts) is throttled and never awaited.
export async function GET() {
  const user = await getCurrentUser();
  // A page load and a tab refocus each ask once; this only stops a loop. Per
  // signed-in account (the DB read and the activity stamp are what it costs).
  if (user) {
    const rl = rateLimit(`me:${user.id}`, 240, 60_000);
    if (!rl.ok) return tooManyRequests(rl.retryAfter);
  }
  const tier = tierOf(user);
  if (user) touchActivity(user);
  const [billing, unread, email] = await Promise.all([
    billingStateFor(user, tier === "plus"),
    user ? unreadCount(user.id).catch(() => 0) : Promise.resolve(0),
    getEmailStatus(),
  ]);
  return NextResponse.json(
    {
      user: user ? { name: user.displayName, email: user.email, avatar: user.avatarUrl } : null,
      tier,
      adFree: tier != null,
      until: user?.premiumUntil?.toISOString() ?? null,
      admin: user?.isAdmin === true,
      // When the account was made: the Plus/Premium slide-in waits until an
      // account is 48 hours old (lib/nudge-gate.ts).
      createdAt: user?.createdAt?.toISOString() ?? null,
      trialing: billing.trialing,
      // Only for a Plus member with a Stripe customer (the upgrade quote).
      interval: billing.interval,
      unreadCount: unread,
      preferredCountry: user?.preferredCountry ?? null,
      userId: user?.id ?? null,
      // Whether the account has a Stripe customer (the dashboard's Manage subscription).
      billing: Boolean(user?.stripeCustomerId),
      // Site-wide, not per-user (the cached Meta "email" flag): whether alert
      // copy may promise an email. Off until the owner configures a mailer.
      emailOn: email === "on",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
