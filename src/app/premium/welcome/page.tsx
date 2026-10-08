import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { isTier, TIER_COMPARISON, TIER_NAMES, type Tier } from "@/lib/plans";
import { sanitizeBackPath, PREMIUM_WELCOME_PATH } from "@/lib/premium-start";
import { PremiumActivationPoller } from "@/components/PremiumActivationPoller";
import { SITE_NAME } from "@/lib/site";

// WHERE STRIPE SENDS A BUYER BACK TO (RiftCompare's /premium/welcome, ported in
// wave 2, 2026-10-03). Entitlement still comes from the webhook (never from
// this redirect — a success_url is attacker-reachable), so this page proves
// two separate things: that the Checkout Session named in the URL belongs to
// the signed-in viewer (metadata.kind "mc_premium" and its userId), and, by
// polling /api/me, that the webhook has landed.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `You're in — ${SITE_NAME} Plus & Premium`,
  robots: { index: false, follow: false },
};

export default async function PremiumWelcomePage({ searchParams }: { searchParams: { session_id?: string; back?: string } }) {
  const sessionId = searchParams.session_id ?? "";
  const back = sanitizeBackPath(searchParams.back);

  const user = await getCurrentUser();
  if (!user) {
    const q = new URLSearchParams();
    if (sessionId) q.set("session_id", sessionId);
    if (back) q.set("back", back);
    redirect(`/login?next=${encodeURIComponent(`${PREMIUM_WELCOME_PATH}?${q.toString()}`)}`);
  }
  if (!sessionId || !stripeEnabled()) redirect("/premium");

  // NEVER trust the param alone: re-read the session from Stripe and match it
  // against the signed-in account.
  let tier: Tier = "premium";
  try {
    const s = await stripe().checkout.sessions.retrieve(sessionId);
    const ownerId = s.metadata?.userId ?? s.client_reference_id;
    if (s.metadata?.kind !== "mc_premium" || ownerId !== user.id) redirect("/premium");
    tier = isTier(s.metadata?.tier) ? s.metadata.tier : "premium";
  } catch (e) {
    // redirect() throws a control-flow signal that must not be swallowed here.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    redirect("/premium");
  }

  const tierName = TIER_NAMES[tier];
  // What this tier unlocks over a free account — the same rows /premium and
  // the dialog render, so this page can't promise what the table doesn't.
  const unlocked = TIER_COMPARISON.filter((r) => r[tier] !== r.account).map((r) => ({
    feature: r.feature,
    detail: typeof r[tier] === "string" ? (r[tier] as string) : null,
  }));
  // Where to go first — only the tools this tier opens in full (Plus: Deal
  // Finder; Premium: Rising Cards and Demand Finder as well, lib/premium-gates.ts).
  const firstStops: { href: string; label: string }[] = [
    { href: "/watching", label: "Set a target price" },
    { href: "/tools/deal-finder?mine=watch", label: "Deal Finder: only my cards" },
    ...(tier === "premium"
      ? [
          { href: "/tools/rising", label: "Rising Cards" },
          { href: "/tools/demand", label: "Demand Finder" },
          { href: "/tools/best-basket?source=watchlist", label: "Buy my watchlist for less" },
        ]
      : []),
  ];

  const done = (
    <div className="card-surface p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-400">Welcome to {tierName}</p>
      <h1 className="mt-1 text-2xl font-extrabold text-white">You&apos;re on {tierName} ✓</h1>
      {unlocked.length > 0 && (
        <>
          <p className="mt-4 text-sm font-semibold text-white">Just unlocked</p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
            {unlocked.map((f) => (
              <li key={f.feature} className="flex items-start gap-2">
                <span aria-hidden className="font-bold text-brand-400">
                  ✓
                </span>
                <span>
                  {f.feature}
                  {f.detail && <span className="text-slate-500"> · {f.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {firstStops.map((s) => (
          <Link key={s.href} href={s.href} className="btn-ghost text-xs">
            {s.label} →
          </Link>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <Link href={back ?? "/dashboard"} className="btn-primary w-full py-3 text-center text-base">
          {back ? "← Back to what you were doing" : `Open your ${tierName} tools →`}
        </Link>
        <Link href="/premium" className="btn-ghost w-full text-center text-sm">
          Manage your subscription
        </Link>
      </div>
    </div>
  );

  return <div className="mx-auto w-full max-w-lg px-4 py-10">{isPremium(user) ? done : <PremiumActivationPoller>{done}</PremiumActivationPoller>}</div>;
}
