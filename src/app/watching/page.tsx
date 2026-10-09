import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentEntitlement, getCurrentUser } from "@/lib/auth";
import { Watchlist, LocalSealedSection } from "@/components/Watchlist";
import { NavIcon } from "@/components/NavIcon";
import { PremiumNudgeCard } from "@/components/PremiumNudgeCard";
import { getPremiumNudge, nudgeCopy as watchedNudgeCopy } from "@/lib/premium-nudge";
import { isPremium, tierOf } from "@/lib/premium";
import { DECK_WATCH_LIMIT, PLUS_TARGET_ALERT_LIMIT, SEALED_CHECK_CADENCE, SEALED_WATCH_LIMIT_PLUS, sealedWatchLimit } from "@/lib/alert-limits";
import { getCountry } from "@/lib/get-country";
import { FREE_WATCHLIST_LIMIT } from "@/lib/free-limits";
import { getEmailStatus, getSealedByIds } from "@/lib/data";
import { sealedWatchCount, watchedSealedIds } from "@/lib/sealed-watch";
import { SealedWatchList, type SealedWatchName } from "@/components/SealedWatchList";
import PlanButton from "@/components/PlanButton";
import { SITE_NAME } from "@/lib/site";

// getCurrentUser() reads cookies(), so this route can never be cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My watchlist — cards you're tracking",
  description: `Every Magic: The Gathering card you're watching on ${SITE_NAME}, with the price you started tracking at.`,
  // Personal page: never indexed, and deliberately NOT disallowed in
  // robots.txt either — a Disallow would stop Google seeing this noindex.
  robots: { index: false, follow: false },
};

// RiftCompare's /watching, ported in wave 2 (2026-10-03). MTG Compare's old
// /watchlist (a browser-only list) now redirects here (next.config.js,
// non-permanent). The signed-out list still lives in the header drawer.
//
// Copy follows getEmailStatus(): until a mailer is configured nothing here
// promises an email — a new low or a met target is flagged on this list
// ("At your target", "New low since you started") and in the dashboard's
// Recent alerts, which is what the alert run actually delivers.
export default async function WatchingPage() {
  const user = await getCurrentUser();
  // A redirect, not a blurred/gated page.
  if (!user) redirect("/login?next=/watching");

  const member = isPremium(user);
  const tier = tierOf(user);
  const onPlus = tier === "plus";
  const onPremium = tier === "premium";
  const country = getCountry();
  const emailOn = (await getEmailStatus()) === "on";
  // What Deal Finder says about THIS account's watched cards — a Plus upsell
  // for a free account, a link into the list for a member. Never fails the page.
  const nudge = await getPremiumNudge(user.id, country, await currentEntitlement()).catch(() => null);
  const nudgeCopy = nudge ? watchedNudgeCopy(nudge, "watched", member ? "member" : "free", emailOn) : null;

  // A LAPSED owner keeps their sealed watches (nothing is checked), and must
  // be able to see and stop them: one indexed count, only when not entitled.
  const lapsedSealed = member ? 0 : await sealedWatchCount(user.id);
  // Names for the sealed watches, from the published sealed lists
  // (called directly, never wrapped), limited to the products watched.
  const sealedNames: Record<number, SealedWatchName> = {};
  if (member || lapsedSealed > 0) {
    const ids = await watchedSealedIds(user.id);
    const catalog = await getSealedByIds(ids).catch(() => new Map<number, { name: string; slug: string; low: SealedWatchName["low"] }>());
    for (const [id, s] of catalog) sealedNames[id] = { name: s.name, slug: s.slug, low: s.low };
  }
  const sealedLimit = sealedWatchLimit(tier);
  const tell = emailOn ? "email you" : "tell you";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">
            Home
          </Link>
          <span>/</span>
          <span className="text-slate-300">My watchlist</span>
        </nav>
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-white sm:text-3xl">
          <NavIcon name="heart" className="h-6 w-6 shrink-0 text-brand-400" />
          My watchlist
        </h1>
        {emailOn ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Every card you&apos;re tracking, with the price it was at when you started. We email <strong className="text-slate-200">{user.email}</strong>{" "}
            when the cheapest copy at a store we track hits a new low (at least 5% under the price we last told you), when a card is first listed, and
            when one is back in stock, naming the stores — at most one email a week.{" "}
            {member ? (
              <>
                Set your own price on {onPlus ? `up to ${PLUS_TARGET_ALERT_LIMIT} cards` : "any card"} below and we email you as soon as it&apos;s met
                — and when a card drops at least 15% below TCGplayer market, or is back in stock, after every price update.
              </>
            ) : (
              <>
                With Plus (ad-free), set your own price on up to {PLUS_TARGET_ALERT_LIMIT} cards and hear as soon as it&apos;s met, and when one drops
                below TCGplayer market.
              </>
            )}{" "}
            Every alert email has one-tap links to stop watching a card or snooze it for 30 days, and you can pause all alert emails without losing this
            list. Tap the heart on any card to stop watching it.{" "}
            {!member && <>A free account watches up to {FREE_WATCHLIST_LIMIT} cards; if you already watch more, you keep them all.</>}
          </p>
        ) : (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Every card you&apos;re tracking, with the price it was at when you started and today&apos;s cheapest price at a store we track (never eBay).
            When one hits a new low we flag it here and in your dashboard&apos;s Recent alerts, after every price update.{" "}
            {member ? (
              <>
                Set your own price on {onPlus ? `up to ${PLUS_TARGET_ALERT_LIMIT} cards` : "any card"} below and we flag it as soon as a store has it
                there.
              </>
            ) : (
              <>With Plus (ad-free), set your own price on up to {PLUS_TARGET_ALERT_LIMIT} cards and we flag it as soon as a store has it there.</>
            )}{" "}
            Tap the heart on any card to stop watching it.{" "}
            {!member && <>A free account watches up to {FREE_WATCHLIST_LIMIT} cards; if you already watch more, you keep them all.</>}
          </p>
        )}
      </div>

      {nudgeCopy && <PremiumNudgeCard {...nudgeCopy} member={member} surface="nudge:watchlist" className="mb-5" />}

      {/* WHAT YOU CAN WATCH: three kinds, each in one plain line. The paid
          kinds carry the ordinary PlanButton, inline. */}
      <section aria-labelledby="what-h" className="card-surface mb-5 p-4" data-watch-explainer>
        <h2 id="what-h" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          What you can watch
        </h2>
        <ul className="mt-2 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
          <li>
            <strong className="text-white">Cards</strong> — free, up to {FREE_WATCHLIST_LIMIT}. We {tell} when a card you watch hits a new low at a
            store. <strong className="text-white">A target</strong> (Plus: {PLUS_TARGET_ALERT_LIMIT} cards, Premium: any) is your own price: we {tell}{" "}
            as soon as a store has it there.
          </li>
          <li>
            <strong className="text-white">Sealed products</strong> — Plus (up to {SEALED_WATCH_LIMIT_PLUS}) and Premium (any). Tap the heart on a box
            on /sealed: we {tell} when it is back in stock after selling out everywhere, or at your price. Checked {SEALED_CHECK_CADENCE}; a Discord
            stock bot may be faster.
            {!member && (
              <div className="mt-1.5">
                <PlanButton tier="plus" surface="tip:watching" className="text-xs font-semibold text-brand-400 hover:underline">
                  See Plus →
                </PlanButton>
              </div>
            )}
          </li>
          <li>
            <strong className="text-white">A whole deck</strong> — Premium, up to {DECK_WATCH_LIMIT} lists. Save a list from Best Basket or the deck
            pricer: we re-price it delivered (cards + postage) after every price update and {tell} when the total reaches your price.
            {!onPremium && (
              <div className="mt-1.5">
                <PlanButton tier="premium" surface="tip:watching" className="text-xs font-semibold text-brand-400 hover:underline">
                  See Premium →
                </PlanButton>
              </div>
            )}
          </li>
        </ul>
      </section>

      <Watchlist />

      {(member || lapsedSealed > 0) && (
        <section id="sealed" aria-labelledby="sealed-h" className="card-surface mt-8 scroll-mt-header p-5">
          <h2 id="sealed-h" className="font-display text-lg font-bold text-white">
            Sealed
          </h2>
          <p className="mt-1 text-xs text-slate-500">Checked {SEALED_CHECK_CADENCE}: back in stock after selling out everywhere, at your target, or a real drop.</p>
          <div className="mt-3">
            <SealedWatchList names={sealedNames} limit={Number.isFinite(sealedLimit) ? sealedLimit : null} lapsed={!member} snooze={emailOn} />
          </div>
        </section>
      )}
      {/* Sealed products a free account saved in this browser stay there. */}
      {!member && <LocalSealedSection />}

      {/* Decks (Premium deck price watch): the tools track's DeckWatchList
          renders here once it lands — wave2-plan §3 Track 2 item 4. */}
    </div>
  );
}
