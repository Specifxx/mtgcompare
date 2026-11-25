"use client";

import { useEffect, useState, type ReactNode } from "react";

// The giveaway entry panel (owner, 2026-11-22: "a point system ... as nice and aesthetic and usable and user friendly as possible").
// Portable on purpose: it knows nothing about sessions or tokens. A copy of RiftCompare's (Specifxx/TCGEmpire) in this site's tokens;
// this site's GiveawayEnter passes calls to riftcompare.com/api/sister-giveaway. Points rules: src/lib/giveaway.ts.

export type Me = {
  state: "upcoming" | "open" | "closed";
  signedIn: boolean;
  emailVerified?: boolean;
  entered?: boolean;
  points?: number;
  breakdown?: { entry: number; bonus: number; bonusVia: string | null; checkin: number; referral: number; referralsCounted: number; starCounted?: number };
  checkins?: number;
  checkedInToday?: boolean;
  streak?: number;
  premium?: boolean;
  showName?: boolean;
  tickets?: { from: number; to: number; total: number } | null;
  inviteUrl?: string;
  referralPoints?: number;
  starReferralPoints?: number;
  starFriendCheckins?: number;
  error?: string;
};

export interface PanelApi {
  load: () => Promise<Me>;
  act: (action: "enter" | "checkin" | "claim-bonus" | "show-name", extra?: Record<string, unknown>) => Promise<Me>;
  /** Called once the account has entered (the corner card stands down). */
  onEntered?: () => void;
}

const fmt = (n: number) => n.toLocaleString("en-AU");

export function GiveawayPanel({
  api,
  signIn,
  premiumHref,
  watchHint,
  closesText,
  after,
}: {
  api: PanelApi;
  /** Shown under an entrant's points: the site's next steps (its Discord and Telegram deal hub). */
  after?: ReactNode;
  /** What a signed-out visitor sees: the site's own sign-in button. */
  signIn: ReactNode;
  premiumHref?: string;
  /** "watch any card's price" in this site's words. */
  watchHint?: ReactNode;
  closesText: string;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .load()
      .then((m) => {
        if (!live) return;
        setMe(m);
        if (m.entered) api.onEntered?.();
      })
      .catch(() => live && setMe({ state: "open", signedIn: false }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(action: "enter" | "checkin" | "claim-bonus" | "show-name", extra: Record<string, unknown> = {}, note?: string) {
    setBusy(action);
    setError(null);
    try {
      const before = me?.points ?? 0;
      const m = await api.act(action, extra);
      if (m.error) setError(m.error);
      else {
        setMe(m);
        if (m.entered) api.onEntered?.();
        const gained = (m.points ?? 0) - before;
        if (gained > 0) setFlash(note ?? `+${gained} points`);
        if (action === "enter") {
          try {
            (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "giveaway_enter", {});
          } catch {
            /* analytics never blocks */
          }
        }
      }
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(t);
  }, [flash]);

  async function copyInvite() {
    if (!me?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(me.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is on screen to copy by hand */
    }
  }

  const shell = "gw-panel relative mt-5 rounded-2xl border border-line bg-surface p-4 sm:p-5";
  if (!me) return <div className={shell} style={{ minHeight: 148 }} aria-busy="true" />;
  if (me.state === "upcoming") return <div className={shell}>Entries open soon.</div>;
  const err = error && (
    <p className="mt-3 text-sm text-red-600" role="alert">
      {error}
    </p>
  );

  if (!me.signedIn) {
    if (me.state === "closed") return <div className={shell}>Entries have closed. The winner is drawn live from a public random number and shown on this page.</div>;
    return (
      <div className={shell}>
        <p className="text-lg font-semibold">Enter free in about 20 seconds</p>
        <p className="mt-1 text-sm opacity-80">Sign in with Google or an email link, then press Enter. Your account is all you need, now and for every giveaway after.</p>
        <div className="mt-4">{signIn}</div>
      </div>
    );
  }
  if (!me.emailVerified)
    return <div className={shell}>Please confirm your email address first (check your inbox for our message), then come back and press Enter. We need it to reach the winner.</div>;

  if (!me.entered) {
    if (me.state === "closed") return <div className={shell}>Entries have closed. Thanks for looking: the next giveaway opens soon.</div>;
    return (
      <div className={shell}>
        <p className="text-lg font-semibold">You&apos;re one tap away</p>
        <p className="mt-1 text-sm opacity-80">
          Entering gives you <b>10 points</b>{me.premium ? <>, and as a Premium member you get <b>50</b> straight away</> : null}. Every point is a ticket in the draw.
        </p>
        <button type="button" onClick={() => run("enter", {}, "You're in!")} disabled={!!busy} className="btn-primary mt-4 w-full sm:w-auto">
          {busy ? "Entering…" : "Enter the giveaway"}
        </button>
        {err}
      </div>
    );
  }

  const b = me.breakdown ?? { entry: 10, bonus: 0, bonusVia: null, checkin: 0, referral: 0, referralsCounted: 0 };
  const points = me.points ?? 0;
  const parts = [
    { label: "Entry", v: b.entry, cls: "bg-brand" },
    { label: b.bonusVia === "premium" ? "Premium" : "Bonus", v: b.bonus, cls: "bg-spark" },
    { label: "Check-ins", v: b.checkin, cls: "bg-sky-400" },
    { label: "Friends", v: b.referral, cls: "bg-fuchsia-400" },
  ].filter((p) => p.v > 0);
  const open = me.state === "open";

  return (
    <div className={shell} role="status">
      {flash && (
        <span className="gw-flash pointer-events-none absolute right-4 top-3 rounded-full bg-spark px-3 py-1 text-sm font-bold text-black" aria-live="polite">
          {flash}
        </span>
      )}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{open ? "Your points" : "Your final points"}</p>
          <p className="mt-0.5 text-4xl font-extrabold tabular-nums">{fmt(points)}</p>
        </div>
        <p className="text-right text-sm opacity-80">
          {fmt(points)} {points === 1 ? "ticket" : "tickets"} in the draw
          {me.tickets && (
            <>
              <br />
              <span className="font-semibold">
                #{fmt(me.tickets.from)} to #{fmt(me.tickets.to)} of {fmt(me.tickets.total)}
              </span>
            </>
          )}
        </p>
      </div>
      {/* Where the points came from: one bar, one colour a source. */}
      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
        {parts.map((p) => (
          <span key={p.label} className={`${p.cls} h-full`} style={{ width: `${(100 * p.v) / Math.max(points, 1)}%` }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-80">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${p.cls}`} aria-hidden="true" />
            {p.label} {fmt(p.v)}
          </li>
        ))}
      </ul>

      {open && (
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
          {/* Daily check-in */}
          <div className="rounded-xl border border-line p-3">
            <p className="font-semibold">Daily check-in · +5</p>
            <p className="mt-0.5 text-sm opacity-80">
              {me.checkedInToday ? "Done for today. Come back tomorrow for 5 more." : "Tap once a day while the giveaway is open."}
              {(me.streak ?? 0) > 1 && <> {me.streak}-day streak.</>}
            </p>
            <button
              type="button"
              onClick={() => run("checkin")}
              disabled={!!busy || me.checkedInToday}
              className={`mt-2 w-full rounded-lg px-3 py-2 text-sm font-semibold ${me.checkedInToday ? "cursor-default bg-raised opacity-60" : "bg-sky-400 text-black hover:brightness-110"}`}
            >
              {me.checkedInToday ? "✓ Checked in today" : busy === "checkin" ? "Checking in…" : "Check in · +5"}
            </button>
          </div>

          {/* The bonus: Premium automatically, free by a watch or a claim */}
          <div className="rounded-xl border border-line p-3">
            <p className="font-semibold">Bonus · +40</p>
            {b.bonus > 0 ? (
              <p className="mt-0.5 text-sm opacity-80">
                ✓ Yours{b.bonusVia === "premium" ? " as a Premium member" : b.bonusVia === "watch" ? " for watching a price" : ""}.
              </p>
            ) : (
              <>
                <p className="mt-0.5 text-sm opacity-80">
                  {watchHint ? <>Free: {watchHint}, or claim it here.</> : <>Free for every account: claim it here.</>} {premiumHref ? <a href={premiumHref} className="underline">Premium</a> : "Premium"} members get it automatically.
                </p>
                <button type="button" onClick={() => run("claim-bonus")} disabled={!!busy} className="mt-2 w-full rounded-lg bg-spark px-3 py-2 text-sm font-semibold text-black hover:brightness-110">
                  {busy === "claim-bonus" ? "Claiming…" : "Claim the free bonus · +40"}
                </button>
              </>
            )}
          </div>

          {/* Invite friends */}
          <div className="rounded-xl border border-line p-3 sm:col-span-2">
            <p className="font-semibold">
              Invite friends · +{me.referralPoints ?? 25} each, <span className="text-brand-strong">+{me.starReferralPoints ?? 100}</span> for a star friend
            </p>
            <p className="mt-0.5 text-sm opacity-80">
              +{me.referralPoints ?? 25} for each friend who makes a free account with your link and confirms their email (up to 10). They become a
              star friend, worth {me.starReferralPoints ?? 100}, when they take Premium or check in on {me.starFriendCheckins ?? 3} days. So far:{" "}
              {b.referralsCounted} {b.referralsCounted === 1 ? "friend" : "friends"}
              {(b.starCounted ?? 0) > 0 && <>, {b.starCounted} ⭐</>}.
            </p>
            {me.inviteUrl && (
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-raised px-2 py-2 text-xs">{me.inviteUrl}</code>
                <button type="button" onClick={copyInvite} className="shrink-0 rounded-lg bg-fuchsia-400 px-3 py-2 text-sm font-semibold text-black hover:brightness-110">
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={me.showName !== false} disabled={!!busy || !open} onChange={(e) => run("show-name", { showName: e.target.checked })} />
          Show my first name on the leaderboard
        </label>
        <span className="opacity-70">{open ? `Closes ${closesText}` : "Entries closed"}</span>
      </div>
      {after && <div className="mt-4 border-t border-line pt-3 text-sm">{after}</div>}
      {err}
    </div>
  );
}
