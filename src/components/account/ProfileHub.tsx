"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ACCOUNT_SITE as S } from "@/lib/account-site";
import { CommunityNameCard } from "@/components/account/CommunityNameCard";
import { loadWatches, readStored, untilLine, writeStored, PREMIUM_PRICE_LINE, trackPremium, type StoredPremium, type Watch } from "@/lib/premium-member";
import { formatMoney, readVault, totalsByMarket, valueItems, type PriceFile, type VaultItem } from "@/lib/vault";
import { giveawayCall } from "@/components/giveaway/GiveawayEnter";
import type { Me } from "@/components/giveaway/GiveawayPanel";
import { BellArt, BoxesArt, ChevronArt, GiftArt, StarArt, UsersArt } from "./art";

// THE PROFILE PAGE (owner, 2026-11-22: "nice profile pages"). /account once signed in: who you are, then everything the account holds
// on this site at a glance, each tile a door to its page: the collection's value today, the price alerts, the giveaway points (with
// today's check-in and the invite link right here), and Premium. Then the first steps a new account hasn't taken yet.
// Everything is read in the browser: the collection from this browser (lib/vault.ts, valued from the static /prices.json), the alerts
// and the points from RiftCompare's shared account API with this site's token. A part that can't be read says so; it never guesses.

type Load<T> = { s: "loading" } | { s: "error" } | { s: "ok"; v: T };

function initialOf(who: string): string {
  const c = (who || "").trim().charAt(0);
  return /[a-z0-9]/i.test(c) ? c.toUpperCase() : "★";
}

function Tile({ href, icon, label, value, sub, tone = "plain" }: { href: string; icon: ReactNode; label: string; value: ReactNode; sub: ReactNode; tone?: "plain" | "gold" }) {
  return (
    <a href={href} className={`card group flex min-h-[8.5rem] flex-col p-4 transition hover:shadow-lift sm:p-5 ${tone === "gold" ? "profile-gold" : ""}`}>
      <span className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-soft text-brand-strong [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
        <ChevronArt className="h-4 w-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-ink" />
      </span>
      <span className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="mt-0.5 font-display text-xl font-bold leading-tight sm:text-2xl">{value}</span>
      <span className="mt-auto pt-1 text-xs text-muted">{sub}</span>
    </a>
  );
}

function Step({ done, href, title, body, onClick }: { done: boolean; href: string; title: string; body: string; onClick?: () => void }) {
  return (
    <li>
      <a href={href} onClick={onClick} className={`flex items-center gap-3 rounded-xl border border-line p-3 transition hover:bg-raised ${done ? "opacity-70" : ""}`}>
        <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${done ? "bg-open text-white" : "border-2 border-line text-transparent"}`}>✓</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold ${done ? "line-through decoration-1" : ""}`}>{title}</span>
          <span className="block text-xs text-muted">{body}</span>
        </span>
        <ChevronArt className="h-4 w-4 shrink-0 text-faint" />
      </a>
    </li>
  );
}

export function ProfileHub({ info }: { info: StoredPremium }) {
  const member = info.premium;
  const [watches, setWatches] = useState<Load<Watch[]>>({ s: "loading" });
  const [gw, setGw] = useState<Load<Me>>({ s: "loading" });
  const [items, setItems] = useState<VaultItem[]>([]);
  const [prices, setPrices] = useState<PriceFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const giveawayOpen = !!S.giveaway?.open();

  useEffect(() => {
    trackPremium("profile_view", { premium: member });
    const cur = readStored();
    if (!cur) return;
    loadWatches(cur.t).then((r) => {
      if (r.kind === "invalid") {
        writeStored(null);
        location.reload();
        return;
      }
      setWatches(r.kind === "ok" ? { s: "ok", v: r.watches } : { s: "error" });
    });
    if (S.giveaway) giveawayCall({}).then((m) => setGw(m.error && !m.signedIn ? { s: "error" } : { s: "ok", v: m }));
    const mine = readVault();
    setItems(mine);
    if (mine.length)
      fetch("/prices.json", { credentials: "omit" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: PriceFile | null) => setPrices(j))
        .catch(() => setPrices(null));
  }, [member]);

  const top = useMemo(() => {
    const t = totalsByMarket(valueItems(items, prices));
    return t.sort((a, b) => b.units - a.units)[0] ?? null;
  }, [items, prices]);
  const units = items.reduce((n, i) => n + i.qty, 0);
  const alerts = watches.s === "ok" ? watches.v : [];
  const me = gw.s === "ok" ? gw.v : null;

  async function checkIn() {
    setBusy(true);
    const m = await giveawayCall({ action: "checkin" });
    setBusy(false);
    setGw({ s: "ok", v: m });
    trackPremium("profile_checkin", {});
  }
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

  const steps = [
    { done: alerts.length > 0, href: "/", title: "Set your first price alert", body: `Open any of the ${S.things} we compare and set the price you want to pay.` },
    { done: items.length > 0, href: "/", title: "Add something you own", body: "Tap “I own this” on a product page to start your collection." },
    ...(giveawayOpen ? [{ done: !!me?.entered, href: "/giveaway", title: "Enter the giveaway", body: `${S.giveaway!.title}: 50 points free.` }] : []),
    ...(S.discord ? [{ done: false, href: S.discord, title: "Join the deals Discord", body: "Restocks and new lows from every store, the moment we see them." }] : []),
  ];
  const left = steps.filter((x) => !x.done).length;

  return (
    <div className="mx-auto max-w-3xl">
      <section className="card overflow-hidden">
        <div className="signin-panel h-16 sm:h-20" />
        <div className="-mt-9 flex flex-col items-start gap-3 px-5 pb-5 sm:-mt-10 sm:flex-row sm:items-end sm:gap-4 sm:px-6">
          <span aria-hidden className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-2xl border-4 border-surface bg-ink font-display text-3xl font-bold text-surface shadow-lift sm:h-20 sm:w-20">
            {initialOf(info.who)}
          </span>
          <div className="w-full min-w-0 flex-1 pb-1">
            <h1 className="page-title">My account</h1>
            <p className="truncate text-sm text-muted">{info.who ? `Signed in as ${info.who}` : "Signed in"}</p>
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            {member ? (
              <span className="profile-premium-pill inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold">★ Premium{untilLine(info.until) ? ` · until ${untilLine(info.until)}` : ""}</span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted">Free account</span>
            )}
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile
          href="/collection"
          icon={<BoxesArt />}
          label="Collection"
          value={!items.length ? "Empty" : top && top.nowCents > 0 ? formatMoney(top.nowCents, top.currency) : `${units} item${units === 1 ? "" : "s"}`}
          sub={!items.length ? "Add what you own" : `${units} item${units === 1 ? "" : "s"} · today's prices`}
        />
        <Tile
          href="/watches"
          icon={<BellArt />}
          label="Price alerts"
          value={watches.s === "loading" ? "…" : watches.s === "error" ? "–" : String(alerts.length)}
          sub={watches.s === "error" ? "Couldn't load. Open the list" : alerts.length ? `${alerts.filter((w) => w.notifiedAt).length} have emailed you` : "Set your first one"}
        />
        {S.giveaway && (
          <Tile
            href="/giveaway"
            icon={<GiftArt />}
            label="Giveaway points"
            value={gw.s === "loading" ? "…" : me?.entered ? (me.points ?? 0).toLocaleString("en-AU") : giveawayOpen ? "Enter free" : "–"}
            sub={me?.entered ? (me.checkedInToday ? "Checked in today ✓" : "Check in for +5 today") : giveawayOpen ? "50 points to start" : "Next one soon"}
          />
        )}
        <Tile
          href="/premium"
          icon={<StarArt />}
          label="Premium"
          tone={member ? "gold" : "plain"}
          value={member ? "Active" : "Free plan"}
          sub={member ? "Billing and perks" : "Try it 14 days free"}
        />
      </div>

      {giveawayOpen && me && (
        <section className="card mt-4 p-5 sm:p-6" aria-labelledby="gw-h">
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={S.giveaway!.image} alt={S.giveaway!.title} width={56} height={56} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white object-contain p-1 ring-1 ring-line" />
            <div className="min-w-0 flex-1 basis-[calc(100%-5rem)] sm:basis-auto">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-strong">Giveaway · {S.giveaway!.closesShort}</p>
              <h2 id="gw-h" className="font-display text-lg font-bold leading-snug">{S.giveaway!.title}</h2>
              {me.entered && (
                <p className="text-sm text-muted">
                  <b className="text-ink">{(me.points ?? 0).toLocaleString("en-AU")} points</b>
                  {me.streak ? ` · ${me.streak}-day streak` : ""}
                </p>
              )}
            </div>
            {!me.entered ? (
              <a href="/giveaway" className="btn-primary min-h-11 w-full px-5 sm:w-auto">Enter free · 50 points</a>
            ) : !me.checkedInToday ? (
              <button type="button" disabled={busy} onClick={checkIn} className="btn-primary min-h-11 w-full px-5 sm:w-auto">
                {busy ? "Checking in…" : "Check in · +5"}
              </button>
            ) : (
              <span className="rounded-full bg-open-soft px-3 py-1.5 text-sm font-semibold text-open">Checked in today ✓</span>
            )}
          </div>
          {me.entered && me.inviteUrl && (
            <div className="mt-4 rounded-xl bg-raised p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <UsersArt className="h-4 w-4 text-brand-strong" /> Invite a friend: 25 points each when they enter
              </p>
              <div className="mt-2 flex gap-2">
                <input readOnly value={me.inviteUrl} aria-label="Your invite link" className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm" onFocus={(e) => e.currentTarget.select()} />
                <button type="button" onClick={copyInvite} className="btn-ghost min-h-10 shrink-0">{copied ? "Copied ✓" : "Copy link"}</button>
              </div>
            </div>
          )}
        </section>
      )}

      <CommunityNameCard token={info.t} />

      {left > 0 && (
        <section className="card mt-4 p-5 sm:p-6" aria-labelledby="steps-h">
          <div className="flex items-center justify-between gap-3">
            <h2 id="steps-h" className="font-display text-lg font-bold">Get the most from your account</h2>
            <span className="text-xs font-semibold text-muted">{steps.length - left} of {steps.length} done</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((steps.length - left) / steps.length) * 100}%` }} />
          </div>
          <ul className="mt-4 grid gap-2">
            {steps.map((x) => (
              <Step key={x.title} {...x} />
            ))}
          </ul>
        </section>
      )}

      {!member && (
        <a href="/premium" onClick={() => trackPremium("profile_premium_click", {})} className="signin-panel mt-4 block rounded-2xl p-5 text-white sm:p-6">
          <span className="block text-xs font-bold uppercase tracking-widest text-amber-200">★ Premium · 14 days free</span>
          <span className="mt-1 block font-display text-lg font-bold">More alerts, a year of collection history, no banner ads</span>
          <span className="mt-1 block text-sm text-white/85">{PREMIUM_PRICE_LINE}. Comparing prices stays free for everyone.</span>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4">Start the free trial <ChevronArt className="h-4 w-4" /></span>
        </a>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted">
        <span>One free account for all our card sites.</span>
        <span className="flex gap-4">
          {member && <a href="/premium" className="underline">Premium and billing</a>}
          <button type="button" className="underline" onClick={() => { writeStored(null); location.reload(); }}>
            Sign out
          </button>
        </span>
      </div>
    </div>
  );
}
