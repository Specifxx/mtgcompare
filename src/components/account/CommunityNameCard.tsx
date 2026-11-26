"use client";

import { useEffect, useState } from "react";
import { PREMIUM_SERVICE } from "@/lib/premium-member";

// The member's community name and this month's contributions (community plan move 3, owner 2026-11-26). One name across
// every card site, kept by the shared account (RiftCompare lib/handles.ts, lib/contributions.ts). It asks once on the
// profile page and saves only when the member presses Save: nothing opens by itself, nothing on any other page.

type Me = { handle: string | null; month: number; monthPoints: number; total: number; dailyCap: number };

async function post(path: string, body: Record<string, unknown>) {
  const r = await fetch(`${PREMIUM_SERVICE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: r.ok, j: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

export function CommunityNameCard({ token }: { token: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    post("/api/community/me", { token })
      .then(({ ok, j }) => {
        if (ok && j.ok) {
          setMe(j as unknown as Me);
          setDraft(typeof j.handle === "string" ? j.handle : "");
        }
      })
      .catch(() => {});
  }, [token]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { ok, j } = await post("/api/community/handle", { token, handle: draft });
      if (ok && j.ok) {
        const handle = typeof j.handle === "string" ? j.handle : null;
        setMe((m) => (m ? { ...m, handle } : m));
        setMsg({ ok: true, text: handle ? `Saved. You're @${handle} on every one of our card sites.` : "Removed. Your help still counts, unnamed." });
      } else setMsg({ ok: false, text: typeof j.error === "string" ? j.error : "Couldn't save. Try again." });
    } catch {
      setMsg({ ok: false, text: "Couldn't save. Try again." });
    } finally {
      setBusy(false);
    }
  }

  if (!me) return null;
  return (
    <section className="card mt-4 p-5 sm:p-6" aria-labelledby="cn-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cn-h" className="font-display text-lg font-bold">Your community name</h2>
        <span className="text-xs font-semibold text-muted tabular-nums">
          This month: {me.monthPoints} {me.monthPoints === 1 ? "point" : "points"}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Shown as “First vouched by” on the deals you vote up first, and on the monthly Top deal hunters list. Deal votes, “Gone?” flags,
        pulse answers and pull logs earn points that also count in the giveaway, up to {me.dailyCap} a day.
      </p>
      <form onSubmit={save} className="mt-3 flex flex-wrap gap-2">
        <label className="flex min-w-0 flex-1 basis-48 items-center rounded-lg border border-line bg-surface px-3 focus-within:ring-2 focus-within:ring-brand">
          <span className="text-muted" aria-hidden="true">@</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={21}
            placeholder="pick_a_name"
            aria-label="Community name"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-2 pl-1 text-ink outline-none"
          />
        </label>
        <button type="submit" disabled={busy} className="btn-primary min-h-10 px-5">{busy ? "Saving…" : me.handle ? "Change" : "Save"}</button>
      </form>
      <p role="status" aria-live="polite" className={`mt-2 text-sm ${msg?.ok ? "text-open" : "text-red-600"}`}>{msg?.text ?? ""}</p>
    </section>
  );
}
