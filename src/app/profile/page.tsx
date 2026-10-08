import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "@/components/PricingCards";
import { TierBadge } from "@/components/TierBadge";
import { WelcomeChecklist } from "@/components/WelcomeChecklist";
import { touchActivity } from "@/lib/activity";
import { tierOf } from "@/lib/premium";

// RiftCompare's /profile, ported in wave 2 (2026-10-03): who you are, sign
// out, the setup checklist, your collection and Account & security (the referral link card was removed with the reward, 2026-10-04). Membership and billing live on
// /premium's member view; the old /account redirects here.
export const metadata: Metadata = { title: "Your profile", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile");
  touchActivity(user);

  // OAuth only (Google, Discord): both ids are already on the session row.
  const methods = [
    { label: "Google", on: !!user.googleId },
    { label: "Discord", on: !!user.discordId },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="card-surface flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" aria-hidden="true" className="h-14 w-14 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-2xl font-black text-white">{user.displayName.slice(0, 1).toUpperCase()}</div>
          )}
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-extrabold text-white">
              {user.displayName}
              <TierBadge tier={tierOf(user)} />
            </h1>
            <p className="text-sm text-slate-400">{user.email}</p>
          </div>
        </div>
        <SignOutButton className="btn-ghost" />
      </div>

      <WelcomeChecklist />

      {/* #collection — the collection-alerts track's MyCollection renders here
          once it lands (wave2-plan, Track 2 item 17). */}
      <div id="collection" />

      <div className="card-surface mt-5 p-5">
        <h2 className="font-bold text-white">Account &amp; security</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 pb-3 text-sm">
          <span className="text-slate-400">Email</span>
          {/* OAuth accounts are verified at sign-in: upsertOAuthUser refuses an unverified address. */}
          <span className="chip bg-brand-500/15 text-brand-400">✓ Verified</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-slate-400">Sign-in methods</span>
          <span className="flex gap-1.5">
            {methods.map((m) => (
              <span key={m.label} className={`chip ${m.on ? "bg-ink-800 text-slate-200" : "bg-ink-900 text-slate-600"}`}>
                {m.on ? "✓ " : ""}
                {m.label}
              </span>
            ))}
          </span>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Link more sign-in options any time from the{" "}
          <Link href="/login" className="text-brand-400 hover:underline">
            sign-in page
          </Link>
          .
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Membership and billing are on{" "}
          <Link href="/premium" className="text-brand-400 hover:underline">
            your membership page
          </Link>
          . Billing problem?{" "}
          <Link href="/contact?category=PAYMENT" className="text-brand-400 hover:underline">
            Contact us
          </Link>
          .
        </p>
        <p className="mt-2 text-xs text-slate-500">
          To delete your account, email us from the address above via the{" "}
          <Link href="/contact" className="text-brand-400 hover:underline">
            contact page
          </Link>
          ; cancel any subscription first.
        </p>
      </div>
    </div>
  );
}
