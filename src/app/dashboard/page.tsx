import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { tierOf } from "@/lib/premium";
import { billingStateFor } from "@/lib/billing-state";
import { planSwitchPriceLabel } from "@/lib/plan-switch-price";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { money } from "@/lib/format";
import { TIER_NAMES } from "@/lib/plans";
import { SITE_NAME } from "@/lib/site";
import { stripeEnabled } from "@/lib/stripe";
import { touchActivity } from "@/lib/activity";
import { notificationFeed } from "@/lib/notifications";
import { DASHBOARD_TOOLS, dashboardToolOpens } from "@/lib/dashboard-tools";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { NavIcon } from "@/components/NavIcon";
import { PricingLink } from "@/components/PlanButton";
import { WatchlistSnapshot } from "@/components/WatchlistSnapshot";
import { WelcomeChecklist } from "@/components/WelcomeChecklist";
import { RecentAlerts, type AlertRow } from "@/components/RecentAlerts";

export const dynamic = "force-dynamic";

// Members' hub — noindex (behind sign-in, no SEO value). RiftCompare's
// /dashboard, ported in wave 2 (2026-10-03): the landing after a sign-in with
// nowhere to return to (lib/next-param.ts POST_SIGN_IN_FALLBACK).
export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

// How young an account is still greeted as new rather than "back".
const NEW_ACCOUNT_MS = 60 * 60 * 1000;

// The collection snapshot reads the collection-alerts track's
// getPortfolioSummary(userId, market) (lib/collection-server.ts) once it lands;
// until then the card shows "—" and "Start tracking →".
type PortfolioSummary = { totalCents: number; d7: number | null } | null;
async function portfolioSummary(userId: string, market: string): Promise<PortfolioSummary> {
  void userId;
  void market;
  return null; // integrator: getPortfolioSummary(userId, market) from @/lib/collection-server
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  touchActivity(user);

  const country = getCountry();
  const info = COUNTRIES[country];
  const portfolio = await portfolioSummary(user.id, country).catch(() => null);
  const hasValue = !!portfolio && portfolio.totalCents > 0;

  // Free tier included: a signed-in non-paying visitor gets their watchlist,
  // the free taste of every tool as an open link, and an upgrade path.
  const tier = tierOf(user);
  const tierName = tier ? TIER_NAMES[tier] : "Free";
  const isNewAccount = Date.now() - user.createdAt.getTime() < NEW_ACCOUNT_MS;
  const isPlus = tier === "plus";
  const isFree = tier == null;
  // A Plus member's upgrade quote, at their own interval. One memoised Stripe read, Plus only.
  const billing = isPlus ? await billingStateFor(user, true) : { trialing: false, interval: null };
  const tools = DASHBOARD_TOOLS.map((t) => ({ ...t, opens: dashboardToolOpens(t.tier, tier) }));
  const lockedTools = tools.filter((t) => !t.opens && !t.freeTaste);
  const canUpgrade = isFree ? stripeEnabled() : isPlus && stripeEnabled() && !billing.trialing;

  // OP Compare: the alerts are delivered in-app while email is off — the ten
  // newest, one bounded per-user read (lib/notifications.ts).
  const feed = await notificationFeed(user.id, 10).catch(() => ({ notifications: [], unreadCount: 0 }));
  const alerts: AlertRow[] = feed.notifications.map((n) => ({ ...n, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">
              {isNewAccount ? "Welcome" : "Welcome back"}, {user.displayName}
            </h1>
            {/* Gold marks Premium, so the Free chip never wears it; Plus names its headline benefit. */}
            <span
              className={`chip text-[10px] font-bold uppercase tracking-wider ${isFree ? "bg-ink-700 text-slate-300" : isPlus ? "bg-slate-500/15 text-slate-200" : "bg-gold/15 text-gold"}`}
            >
              {isPlus ? "Plus · ad-free" : tierName}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">Your {tierName} hub — tools, portfolio and the market at a glance.</p>
        </div>
        {/* Only for an account with billing behind it. */}
        {stripeEnabled() && tier != null && user.stripeCustomerId && <ManageSubscriptionButton />}
      </div>

      <WelcomeChecklist />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="card-surface flex flex-wrap items-center justify-between gap-4 border-l-2 border-brand-500 p-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Collection value ({info.currency})</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="num text-3xl font-extrabold text-white">{hasValue ? money(portfolio!.totalCents, country) : "—"}</span>
              {hasValue && portfolio!.d7 != null && (
                <span className={`num text-sm font-bold ${portfolio!.d7 > 0 ? "text-up" : portfolio!.d7 < 0 ? "text-down" : "text-slate-400"}`}>
                  {portfolio!.d7 > 0 ? "+" : ""}
                  {portfolio!.d7}% · 7d
                </span>
              )}
            </div>
          </div>
          <Link href="/portfolio" className="btn-ghost text-sm">
            {hasValue ? "Open portfolio →" : "Start tracking →"}
          </Link>
        </div>
        <WatchlistSnapshot />
      </div>

      <RecentAlerts initial={alerts} unread={feed.unreadCount} />

      <div className="mb-3 mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold text-white">{isFree ? "Your tools" : <>Your {tierName} tools</>}</h2>
        {canUpgrade && (
          <PricingLink surface="nav:dashboard" className="text-sm font-semibold text-gold hover:underline">
            {isFree ? "See plans" : `Upgrade to Premium — ${planSwitchPriceLabel("premium", billing.interval)}`} →
          </PricingLink>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {tools
          .filter((t) => t.opens || t.freeTaste)
          .map((t) =>
            t.opens ? (
              <Link
                key={t.title}
                href={t.href}
                className="card-surface group flex flex-col gap-2 border-l-2 border-brand-500/40 p-4 transition-colors hover:border-brand-400 hover:bg-ink-800"
              >
                <h3 className="font-bold text-white group-hover:text-brand-400">{t.title}</h3>
                <p className="flex-1 text-sm leading-relaxed text-slate-400">{t.desc}</p>
                <span className="text-sm font-semibold text-brand-400">Open →</span>
              </Link>
            ) : (
              <Link
                key={t.title}
                href={t.href}
                className="card-surface group flex flex-col gap-2 border-l-2 border-ink-700 p-4 transition-colors hover:border-brand-400 hover:bg-ink-800"
              >
                <h3 className="font-bold text-white group-hover:text-brand-400">{t.title}</h3>
                <p className="flex-1 text-sm leading-relaxed text-slate-400">{t.desc}</p>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-brand-400">{t.freeTaste} →</span>
                  {t.tier !== "free" && (
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Full {t.tier === "plus" ? "list" : "plan"}: {TIER_NAMES[t.tier]}
                    </span>
                  )}
                </span>
              </Link>
            ),
          )}
        {lockedTools.map((t) => (
          <div key={t.title} className="card-surface flex flex-col gap-2 border-l-2 border-ink-700 p-4 opacity-70" data-locked-tool>
            <h3 className="font-bold text-slate-300">{t.title}</h3>
            <p className="flex-1 text-sm leading-relaxed text-slate-500">{t.desc}</p>
            <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <NavIcon name="lock" className="h-3.5 w-3.5" />
              {t.tier === "free" ? "Free" : TIER_NAMES[t.tier]}
            </span>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-extrabold text-white">Market &amp; account</h2>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/movers" className="btn-ghost">
          Price movers
        </Link>
        <Link href="/market" className="btn-ghost">
          {SITE_NAME} Index
        </Link>
        <Link href="/browse" className="btn-ghost">
          Card database
        </Link>
        <Link href="/premium" className="btn-ghost">
          Membership
        </Link>
      </div>

      <p className="mt-6 text-center text-xs text-slate-600">
        {isFree ? "Free, always — watchlist, portfolio and price alerts, no card required." : <>Thanks for supporting {SITE_NAME} — your {tierName} plan is what keeps price comparison free for everyone.</>}
      </p>
    </div>
  );
}
