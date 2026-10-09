"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { setUnreadCount } from "@/lib/use-unread";

// "Recent alerts" on /dashboard — an MTG Compare divergence from RiftCompare
// (wave 2, 2026-10-03). RiftCompare delivers alerts by email and keeps no
// bell; MTG Compare sends no email until a mailer is configured, so the alert
// run's in-app notifications (lib/notifications.ts notify()) are the
// delivery, and this panel is where they are read. The rows arrive with the
// page (server-rendered, one bounded per-user read); mark-read is one POST.
export interface AlertRow {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function RecentAlerts({ initial, unread: initialUnread }: { initial: AlertRow[]; unread: number }) {
  const [rows, setRows] = useState(initial);
  const [unread, setUnread] = useState(initialUnread);

  const mark = async (which: { id: string } | { all: true }) => {
    const res = await fetch("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(which) }).catch(() => null);
    if (!res?.ok) return;
    const now = new Date().toISOString();
    const next = rows.map((r) => ("all" in which || r.id === which.id ? { ...r, readAt: r.readAt ?? now } : r));
    const left = "all" in which ? 0 : Math.max(0, unread - (rows.find((r) => r.id === which.id && !r.readAt) ? 1 : 0));
    setRows(next);
    setUnread(left);
    setUnreadCount(left);
  };

  return (
    <section aria-labelledby="alerts-h" className="mt-8" data-recent-alerts>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="alerts-h" className="text-lg font-extrabold text-white">
          Recent alerts{unread > 0 ? <span className="num ml-2 rounded-full bg-brand-500 px-2 py-0.5 align-middle text-xs font-bold text-white">{unread} new</span> : null}
        </h2>
        {unread > 0 && (
          <button type="button" onClick={() => void mark({ all: true })} className="tap-link text-sm text-slate-400 hover:text-white">
            Mark all read
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon="heart"
          title="No alerts yet"
          body="When a card you watch hits a new low, or reaches your target price, it shows up here after the next price update."
          primary={{ href: "/watching", label: "Your watchlist →" }}
        />
      ) : (
        <ul className="card-surface divide-y divide-ink-800">
          {rows.map((r) => (
            <li key={r.id} className={`flex items-start gap-3 px-4 py-3 ${r.readAt ? "" : "bg-brand-500/[0.04]"}`}>
              <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.readAt ? "bg-transparent" : "bg-brand-500"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">
                  {r.href ? (
                    <Link href={r.href} onClick={() => !r.readAt && void mark({ id: r.id })} className="hover:text-brand-400">
                      {r.title}
                    </Link>
                  ) : (
                    r.title
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{r.body}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="num text-[11px] text-slate-500">{when(r.createdAt)}</span>
                {!r.readAt && (
                  <button type="button" onClick={() => void mark({ id: r.id })} className="text-[11px] text-slate-500 underline hover:text-slate-300">
                    Mark read
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
