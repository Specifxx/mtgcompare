import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";
import { CheckoutLauncher } from "@/components/CheckoutLauncher";
import { enabledProviders } from "@/lib/oauth";
import { isPremium } from "@/lib/premium";
import { TIER_NAMES, planPrice } from "@/lib/plans";
import { parseCheckoutSelection, parseStartSrc, planInterval, sanitizeBackPath, PREMIUM_START_PATH } from "@/lib/premium-start";
import { checkoutOpen } from "@/lib/stripe";
import { SITE_NAME } from "@/lib/site";

// SIGN-IN AS A STEP INSIDE CHECKOUT, NOT A GATE IN FRONT OF IT (RiftCompare's
// /premium/start, ported in wave 2, 2026-10-03).
//
// Every "Get Plus/Premium" lands here with the selection already made. Signed
// out, this page IS the sign-in step — the provider buttons render here with
// ?next= pointing back at this same URL, so the OAuth round trip returns with
// the tier, plan and `back` intact and the launcher takes over. Signed in, the
// launcher opens Stripe. This page never charges anything and never creates
// an account by itself.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Continue to checkout — ${SITE_NAME} Plus & Premium`,
  description: `Sign in to continue to secure checkout for ${SITE_NAME} Plus or Premium.`,
  // A transient funnel step: nothing to rank, and its query combinations would
  // be a small crawl trap. follow:true so the links out still carry.
  robots: { index: false, follow: true },
  alternates: { canonical: PREMIUM_START_PATH },
};

export default async function PremiumStartPage({ searchParams }: { searchParams: { tier?: string; plan?: string; back?: string; src?: string } }) {
  // Checkout not open (no key, or a TEST key: lib/stripe.ts checkoutOpen) → /premium, which says "Checkout opens soon" honestly.
  if (!checkoutOpen()) redirect("/premium");

  const { tier, plan } = parseCheckoutSelection(searchParams.tier, searchParams.plan);
  const back = sanitizeBackPath(searchParams.back);
  const src = parseStartSrc(searchParams.src);
  const user = await getCurrentUser();

  // Already entitled → /premium, where a Plus member upgrades IN PLACE
  // (prorated, /api/premium/upgrade). The checkout route refuses this too.
  if (isPremium(user)) redirect("/premium");

  const tierName = TIER_NAMES[tier];
  const iv = planInterval(plan);
  const priceLine = iv === "year" ? `${planPrice(tier, "year")}/year` : `${planPrice(tier, "month")}/month`;

  if (user) {
    return (
      <div className="mx-auto w-full max-w-lg px-4">
        <p className="pt-10 text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          {SITE_NAME} {tierName}
        </p>
        <p className="mt-2 text-center text-sm text-slate-300">{priceLine} · cancel anytime.</p>
        <CheckoutLauncher tier={tier} plan={plan} back={back} src={src} />
      </div>
    );
  }

  // Signed out: the sign-in step, in place. ?next= is this very URL, so the
  // callback returns here (plus ?welcome= for a brand-new account).
  const selfQuery = new URLSearchParams({ tier, plan, src });
  if (back) selfQuery.set("back", back);
  const selfHref = `${PREMIUM_START_PATH}?${selfQuery.toString()}`;

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-10">
      <div className="card-surface p-6">
        <Link href={back ?? "/premium"} className="mb-3 inline-block text-xs text-slate-500 hover:text-white">
          ← Back
        </Link>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          {SITE_NAME} {tierName}
        </p>
        <h1 className="mt-1 text-xl font-extrabold text-white">One step: sign in to continue</h1>
        <p className="mt-2 text-sm text-slate-300">Your account is free and takes one tap. Checkout opens straight after — {priceLine}, cancel anytime.</p>
        {/* The provider buttons themselves, so the visitor never has to find the buy button twice. */}
        <div className="mt-4">
          <AuthForm providers={enabledProviders()} bare compact source={src === "dialog" ? "premium_dialog" : "premium_cta"} next={selfHref} />
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Not ready?{" "}
          <Link href="/premium" className="text-brand-400 hover:underline">
            Compare the plans first →
          </Link>
        </p>
      </div>
    </div>
  );
}
