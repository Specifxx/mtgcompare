"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GIVEAWAY as G, BONUS_POINTS, CHECKIN_POINTS, ENTRY_POINTS, REFERRAL_POINTS, giveawayState } from "@/lib/giveaway";
import { readStored } from "@/lib/premium-member";
import { giveawayCall } from "./GiveawayEnter";
import type { Me } from "./GiveawayPanel";

// THE GIVEAWAY STRIP (owner, 2026-11-26: "surface the Star Trek giveaway and daily check-in on the homepage and product pages, with
// a clear referral invite link, without adding display ads"). An inline block in the page's flow, never a pop-up, an overlay or a
// second prompt: it is the home page's one promo banner while the giveaway is open (the sign-in slides return after it closes) and
// sits under the product page's price table, never beside a buy button or above a price. No ad, no eBay, no Amazon.
//
// It never changes the rules (lib/giveaway.ts and RiftCompare's engine own them): it only shows them and offers the three actions
// the /giveaway panel already has (enter, check in, copy the invite link), through the same RiftCompare call (giveawayCall).
//   • Signed out (the server HTML): the prize, "sign in free for 50 points, +5 a daily check-in, +25 a friend", sign in, and the
//     way to the invite link (sign in, then /giveaway#invite).
//   • Signed in: the account's points, the check-in button and the invite link with Copy, read once per browser tab every 10
//     minutes (sessionStorage), so browsing product pages never costs RiftCompare a call per page.
// The card's height is reserved by its layout, so the signed-in swap does not shift the page.

const CACHE_KEY = "mtg_gw_strip_v1";
const CACHE_MS = 10 * 60 * 1000;

function cached(): Me | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null") as { at: number; me: Me } | null;
    return v && Date.now() - v.at < CACHE_MS ? v.me : null;
  } catch {
    return null;
  }
}
function remember(me: Me) {
  try {
    if (me.error) sessionStorage.removeItem(CACHE_KEY);
    else sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), me }));
  } catch {
    /* fine: the next page asks again */
  }
}

function gtag(name: string, params: Record<string, unknown>) {
  try {
    (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", name, params);
  } catch {
    /* analytics never blocks */
  }
}

const SIGN_IN_POINTS = ENTRY_POINTS + BONUS_POINTS; // 50: entering plus the free bonus, the "sign in for 50 points" of the rules page

export function GiveawayStrip({ surface, fallback = null, className = "" }: { surface: "home" | "product"; fallback?: ReactNode; className?: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(() => giveawayState() === "open");

  useEffect(() => {
    setOpen(giveawayState() === "open");
    if (giveawayState() !== "open" || !readStored()) return;
    const c = cached();
    if (c) return setMe(c);
    let live = true;
    giveawayCall({}).then((m) => {
      if (!live) return;
      remember(m);
      setMe(m);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!open) return <>{fallback}</>;

  const utm = `utm_source=${surface}&utm_medium=strip&utm_campaign=giveaway`;
  const signIn = (next: string) => `/account?src=giveaway-${surface}&next=${encodeURIComponent(next)}`;

  async function act(action: "enter" | "checkin" | "claim-bonus") {
    setBusy(true);
    setNote(null);
    const before = me?.points ?? 0;
    let ref: string | undefined;
    try {
      ref = action === "enter" ? localStorage.getItem("gw_ref_v1") || undefined : undefined; // a friend's invite (GiveawayEnter's REF_KEY)
    } catch {
      /* private window */
    }
    const m = await giveawayCall({ action, ref });
    setBusy(false);
    if (m.error) return setNote(m.error);
    remember(m);
    setMe(m);
    const gained = (m.points ?? 0) - before;
    if (gained > 0) setNote(action === "enter" ? "You're in!" : `+${gained} points`);
    if (action === "enter" && m.entered) {
      try {
        localStorage.removeItem("gw_ref_v1");
      } catch {
        /* fine */
      }
    }
    gtag(action === "enter" ? "giveaway_enter" : action === "checkin" ? "giveaway_checkin" : "giveaway_bonus", { surface: `strip-${surface}` });
  }

  async function copy() {
    if (!me?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(me.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      gtag("giveaway_invite_copy", { surface: `strip-${surface}` });
    } catch {
      /* the link is on screen to copy by hand */
    }
  }

  const entered = !!me?.signedIn && !!me.entered;
  const art = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={G.imageUrl} alt={G.prize} width={56} height={56} className="h-14 w-14 shrink-0 rounded-lg bg-white object-contain p-1" />
  );
  const rules = (
    <ul className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
      <li className="rounded-full bg-brand-soft px-2.5 py-1 text-brand-strong">Sign in · {SIGN_IN_POINTS} points</li>
      <li className="rounded-full bg-sky-400/20 px-2.5 py-1">Daily check-in · +{CHECKIN_POINTS}</li>
      <li className="rounded-full bg-fuchsia-400/20 px-2.5 py-1">Each friend you invite · +{REFERRAL_POINTS}</li>
    </ul>
  );

  return (
    <section aria-label="Free giveaway" className={`gw-strip card mt-4 p-4 sm:p-5 ${className}`} data-surface={surface}>
      <div className="flex items-start gap-3 sm:gap-4">
        {art}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-strong">Free giveaway · worldwide · closes 14 Dec</p>
          <p className="font-display text-lg font-bold leading-snug">{G.title}</p>
          {entered ? (
            <p className="mt-0.5 text-sm text-muted">
              You have <b className="text-ink tabular-nums">{(me?.points ?? 0).toLocaleString("en-AU")}</b> points, one ticket each.{" "}
              {me?.checkedInToday ? "Checked in today: come back tomorrow for 5 more." : `Check in today for +${CHECKIN_POINTS}.`}
            </p>
          ) : (
            rules
          )}
        </div>
        {note && (
          <span className="shrink-0 rounded-full bg-spark px-3 py-1 text-sm font-bold text-black" aria-live="polite">
            {note}
          </span>
        )}
      </div>

      {entered ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => act("checkin")}
            disabled={busy || me?.checkedInToday}
            className={`min-h-11 flex-1 rounded-lg px-4 text-sm font-semibold sm:flex-none ${me?.checkedInToday ? "cursor-default bg-raised opacity-60" : "bg-sky-400 text-black hover:brightness-110"}`}
          >
            {me?.checkedInToday ? "✓ Checked in today" : busy ? "Checking in…" : `Daily check-in · +${CHECKIN_POINTS}`}
          </button>
          {(me?.breakdown?.bonus ?? 0) === 0 && (
            <button type="button" onClick={() => act("claim-bonus")} disabled={busy} className="min-h-11 flex-1 rounded-lg bg-spark px-4 text-sm font-semibold text-black hover:brightness-110 sm:flex-none">
              Claim your free bonus · +{BONUS_POINTS}
            </button>
          )}
          {me?.inviteUrl && (
            <div className="flex w-full min-w-0 items-center gap-2">
              <span className="shrink-0 text-sm font-semibold">Invite · +{REFERRAL_POINTS}</span>
              <code className="min-w-0 flex-1 truncate rounded-lg bg-raised px-2 py-2.5 text-xs">{me.inviteUrl}</code>
              <button type="button" onClick={copy} className="min-h-11 shrink-0 rounded-lg bg-fuchsia-400 px-3 text-sm font-semibold text-black hover:brightness-110">
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {me?.signedIn && me.emailVerified ? (
            <button type="button" onClick={() => act("enter")} disabled={busy} className="btn-primary min-h-11 px-6">
              {busy ? "Entering…" : "Enter free"}
            </button>
          ) : me?.signedIn ? (
            <a href={`/giveaway?${utm}`} className="btn-primary min-h-11 px-6">
              Confirm your email to enter
            </a>
          ) : (
            <a href={signIn("/giveaway")} rel="nofollow" className="btn-primary min-h-11 px-6">
              Sign in free and enter
            </a>
          )}
          <a href={me?.signedIn ? `/giveaway?${utm}#invite` : signIn("/giveaway#invite")} rel="nofollow" className="text-sm font-semibold underline decoration-line underline-offset-2 hover:decoration-ink">
            Get your invite link · +{REFERRAL_POINTS} a friend
          </a>
          <a href={`/giveaway?${utm}`} className="text-sm text-muted underline decoration-line underline-offset-2 hover:text-ink">
            Rules and leaderboard
          </a>
        </div>
      )}
    </section>
  );
}
