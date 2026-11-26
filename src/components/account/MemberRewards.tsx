"use client";

import { useEffect, useState } from "react";
import { PREMIUM_SERVICE } from "@/lib/premium-member";

// Member rewards (owner, 2026-11-26: "we really, really need a loyalty system ... on all of our Empire websites"). One points
// balance on the shared account, kept by the account service (RiftCompare lib/loyalty.ts, /api/loyalty), shown here in this
// site's own name. A daily check-in is worth 1 on the first day of a streak, one more each day in a row, up to 10 a day.
// On the account page only: it loads after render, and the check-in and a reward happen only when the member presses them.
// Nothing opens by itself, and nothing shows on any other page.

type Reward = { key: string; title: string; points: number; available: boolean; reason: string | null };
type Level = { key: string; name: string; min: number };
type Me = {
  balance: number;
  lifetime: number;
  streak: number;
  checkedInToday: boolean;
  today: number;
  tomorrow: number;
  level: Level;
  next: Level | null;
  toNext: number;
  streakCap: number;
  rewards: Reward[];
  note?: string | null;
};

async function call(body: Record<string, unknown>): Promise<{ ok: boolean; j: Record<string, unknown> }> {
  const r = await fetch(`${PREMIUM_SERVICE}/api/loyalty`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: r.ok, j: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

export function MemberRewards({ token, helps = false }: { token: string; helps?: boolean }) {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    call({ token })
      .then(({ ok, j }) => {
        if (ok && j.ok) setMe(j as unknown as Me);
      })
      .catch(() => {});
  }, [token]);

  async function act(action: "checkin" | "redeem", reward?: string) {
    setBusy(reward ?? action);
    setMsg(null);
    try {
      const { ok, j } = await call({ token, action, reward });
      if (ok && j.ok) {
        setMe(j as unknown as Me);
        if (typeof j.note === "string") setMsg({ ok: true, text: j.note });
      } else setMsg({ ok: false, text: typeof j.error === "string" ? j.error : "Couldn't do that. Try again." });
    } catch {
      setMsg({ ok: false, text: "Couldn't do that. Try again." });
    } finally {
      setBusy(null);
    }
  }

  if (!me) return null;
  const pct = me.next ? Math.min(100, Math.round(((me.lifetime - me.level.min) / Math.max(1, me.next.min - me.level.min)) * 100)) : 100;
  return (
    <section className="card mt-4 p-5 sm:p-6" aria-labelledby="mr-h" id="rewards">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="mr-h" className="font-display text-lg font-bold">Member rewards</h2>
        <span className="text-xs font-semibold text-muted">{me.level.name}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { v: String(me.balance), l: "points" },
          { v: String(me.streak), l: "day streak" },
          { v: `+${me.checkedInToday ? me.tomorrow : me.today}`, l: me.checkedInToday ? "tomorrow" : "today" },
        ].map((x) => (
          <div key={x.l} className="rounded-lg border border-line p-2">
            <div className="text-xl font-bold tabular-nums">{x.v}</div>
            <div className="text-[11px] text-muted">{x.l}</div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => act("checkin")} disabled={me.checkedInToday || busy !== null} className="btn-primary mt-3 min-h-10 w-full justify-center">
        {me.checkedInToday ? `✓ Checked in · +${me.tomorrow} tomorrow` : busy === "checkin" ? "Checking in…" : `Check in · +${me.today}`}
      </button>
      <p className="mt-2 text-xs text-muted">
        Day 1 of a streak is 1 point, day 2 is 2, and so on up to {me.streakCap} a day. Miss a day and it starts again at 1.
        {helps ? " Deal votes, “Gone?” flags, pulse answers and pull logs earn points too." : ""} Your points work wherever you sign in with this account.
      </p>
      {me.next && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">{me.toNext} more lifetime points to {me.next.name}.</p>
        </div>
      )}
      <ul className="mt-4 grid gap-2">
        {me.rewards.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{r.title}</div>
              <div className="text-xs text-muted">{r.points} points{!r.available && r.reason ? ` · ${r.reason}` : ""}</div>
            </div>
            <button type="button" onClick={() => act("redeem", r.key)} disabled={!r.available || busy !== null} className="btn-ghost shrink-0 text-sm">
              {busy === r.key ? "…" : "Redeem"}
            </button>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className={`mt-2 text-sm ${msg?.ok ? "text-open" : "text-red-600"}`}>{msg?.text ?? ""}</p>
      <p className="mt-2 text-[11px] text-muted">Points have no cash value and can&apos;t be bought. Spending them never changes giveaway entries.</p>
    </section>
  );
}
