import type { Metadata } from "next";
import {
  BONUS_POINTS,
  CHECKIN_POINTS,
  ENTRY_POINTS,
  GIVEAWAY as G,
  GIVEAWAY_CONTACT,
  GIVEAWAY_DISCORD,
  GIVEAWAY_EVERY_MONTHS,
  GIVEAWAY_GAME,
  GIVEAWAY_IP_OWNER,
  GIVEAWAY_SITE_NAME,
  LEADERBOARD_URL,
  MAX_REFERRALS,
  PREMIUM_START_POINTS,
  REFERRAL_POINTS,
  STAR_FRIEND_CHECKINS,
  STAR_REFERRAL_POINTS,
} from "@/lib/giveaway";
import { GiveawayEnter } from "@/components/giveaway/GiveawayEnter";
import { GiveawayCountdown } from "@/components/giveaway/GiveawayCountdown";
import { GiveawayBoard } from "@/components/giveaway/GiveawayBoard";

// /giveaway (owner, 2026-11-22): the prize, the points, the leaderboard and the official rules. A static page: the entry panel and
// the board ask RiftCompare after mount (lib/giveaway.ts), so nothing here reads a cookie or a header.
export const metadata: Metadata = {
  title: `${GIVEAWAY_GAME} Giveaway: ${G.title}`,
  description: `Free to enter, worldwide: ${G.title.replace(/^Win /, "win ")}. Earn points by checking in and inviting friends, watch the live leaderboard, and see the winner drawn from a public random number. Closes 14 December 2026.`,
  alternates: { canonical: "/giveaway" },
};

const WAYS = [
  { pts: `+${ENTRY_POINTS}`, title: "Enter", text: "Sign in free and press Enter. That's your first 10 tickets." },
  { pts: `+${BONUS_POINTS}`, title: "Free bonus", text: "One tap for every account. Premium members get it automatically." },
  { pts: `+${CHECKIN_POINTS}`, title: "Check in daily", text: "One tap a day while the giveaway is open. It adds up fast." },
  { pts: `+${REFERRAL_POINTS}`, title: "Invite friends", text: `Each friend who joins with your link and confirms their email, up to ${MAX_REFERRALS}. ${STAR_REFERRAL_POINTS} for a friend who takes Premium or checks in on ${STAR_FRIEND_CHECKINS} days.` },
];

export default function GiveawayPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <section className="gw-hero relative overflow-hidden rounded-3xl border border-line p-5 sm:p-8">
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 sm:grid-cols-[200px_minmax(0,1fr)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={G.imageUrl} alt={G.prize} width={200} height={200} className="gw-prize mx-auto rounded-xl bg-white object-contain p-2 shadow-lift" loading="eager" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-strong">Giveaway · free to enter · worldwide</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight sm:text-4xl">{G.title}</h1>
            <p className="mt-2 text-muted">{G.prize}. Posted anywhere, on us. Every point you earn is one ticket in the draw.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted">Closes in</span>
              <GiveawayCountdown closesAt={G.closesAt} fallback="14 December 2026" />
            </div>
            <GiveawayEnter discordUrl={GIVEAWAY_DISCORD} />
            <p className="mt-3 text-xs text-muted">
              Your {GIVEAWAY_SITE_NAME} account is a RiftCompare account (our sister site, which runs the draw), so one sign-in enters every one of
              our giveaways.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">How to earn points</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {WAYS.map((w) => (
            <div key={w.title} className="card rounded-2xl border border-line bg-surface p-4">
              <p className="text-2xl font-extrabold text-brand-strong">{w.pts}</p>
              <p className="mt-1 font-semibold">{w.title}</p>
              <p className="mt-1 text-sm text-muted">{w.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          Premium members start on {PREMIUM_START_POINTS} points, and every free account can reach exactly the same {PREMIUM_START_POINTS}: paying never
          buys more chances than free.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Leaderboard</h2>
        <p className="mt-1 text-sm text-muted">The top 100 by points. Once entries close, the winner appears here with the winning ticket.</p>
        <GiveawayBoard url={LEADERBOARD_URL} prize={G.prize} />
      </section>

      <section className="mt-10 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-lg font-semibold">A fair draw you can check</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Each point is a numbered ticket. After entries close we take the next public random number from drand, the League of Entropy&apos;s beacon,
            which nobody (us included) can know in advance, and turn it into the winning ticket. The working is shown with the winner.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-lg font-semibold">A new giveaway every {GIVEAWAY_EVERY_MONTHS} months</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">The next one opens after this draw, announced on this page. Your account is all you need to enter each one.</p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Official rules</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Promoter.</strong> Compare Empire, which runs {GIVEAWAY_SITE_NAME} and RiftCompare (riftcompare.com), Sydney, Australia. Contact:{" "}
            <a className="underline" href={`mailto:${GIVEAWAY_CONTACT}`}>
              {GIVEAWAY_CONTACT}
            </a>
            .
          </li>
          <li>
            <strong>No purchase necessary.</strong> Entry is free. Premium members receive a {BONUS_POINTS}-point bonus automatically; every free account
            can receive the same {BONUS_POINTS} points, free, by pressing &quot;Claim the free bonus&quot; (or by watching a price on RiftCompare).
            Buying anything, by you or a friend you invite, never gives more points than free activity can.
          </li>
          <li>
            <strong>Who can enter.</strong> Anyone aged 18 or over (or the age of majority where they live, if that is higher), anywhere in the world,
            except where this draw is prohibited or restricted by law, where it is void. Not open to anyone involved in running our sites, or their
            household.
          </li>
          <li>
            <strong>How to enter.</strong> Between now and {G.closesText}, sign in to a free account (Google or an emailed link) with a confirmed email
            address and press &quot;Enter the giveaway&quot; on this page. One account per person. Each account earns {ENTRY_POINTS} points for
            entering, a {BONUS_POINTS}-point bonus (rule 2), {CHECKIN_POINTS} points for each day it checks in on this page while the giveaway is open
            (one a day, by Sydney date), and {REFERRAL_POINTS} points for each friend who creates a new account with its invite link during the
            giveaway and confirms their email, up to {MAX_REFERRALS} friends. A friend counts {STAR_REFERRAL_POINTS} points instead of {REFERRAL_POINTS} once they also have Premium or have checked in on {STAR_FRIEND_CHECKINS} days of this giveaway, so a friend&apos;s free activity counts exactly as much as a friend&apos;s purchase. Points made with more than one account by the same person, invites to your
            own or fake accounts, and points made by automated means are void, and we may remove them.
          </li>
          <li>
            <strong>Prize.</strong> {G.prize}. {G.prizeDetail} Approximate value: {G.approxValue}. No cash alternative. The prize is not transferable.
            Postage is paid by the promoter. Any import duty or tax in the winner&apos;s country is the winner&apos;s.
          </li>
          <li>
            <strong>Draw.</strong> On {G.drawOn}, every valid entrant&apos;s points become that many consecutive numbered tickets, in the order they
            entered. The winning ticket is the randomness of the first drand round published after entries close, read as a number, modulo the number of
            tickets, plus 1. So each point has the same chance, and an entrant&apos;s chance is their points divided by all points. The round, its
            randomness and the winning ticket are published on this page.
          </li>
          <li>
            <strong>Winner.</strong> We email the winner at their account&apos;s address with a link to a private claim form for their postal address.
            They have {G.claimDays} days to claim. If they don&apos;t, or can&apos;t accept the prize, we draw again from the remaining tickets (up to two
            redraws) the same published way. We show the winner&apos;s first name and last initial and country only.
          </li>
          <li>
            <strong>Privacy.</strong> We use your account and entry only to run this draw and contact the winner, and the winner&apos;s address only to
            post the prize. The public leaderboard shows the top 100 entrants by first name and last initial and their points, never an email; untick
            &quot;Show my first name&quot; to appear as &quot;Anonymous entrant&quot;. Entering does not sign you up to any marketing email. See our{" "}
            <a className="underline" href="/privacy">
              privacy policy
            </a>
            .
          </li>
          <li>
            <strong>Not sponsored.</strong> This draw is not sponsored, endorsed or run by {GIVEAWAY_IP_OWNER}, drand or any store. {GIVEAWAY_GAME} and
            its products are their trademarks.
          </li>
          <li>
            <strong>Changes.</strong> If something outside our control stops the draw running fairly, we may change or cancel it and say so on this page.
          </li>
        </ol>
      </section>
    </main>
  );
}
