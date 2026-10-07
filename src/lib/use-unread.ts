"use client";

import { useEffect, useState } from "react";
import { useMe } from "./use-me";

// How many unread in-app notifications the viewer has — RiftCompare's
// lib/use-unread.ts, minus its 60-second poll (wave 2, 2026-10-03). OP
// Compare's alerts are delivered in-app while email is off, so the count
// matters more here, but a poll on every open tab is the egress pattern the
// rest of the site avoids. The number rides /api/me instead (one indexed
// count, signed-in only, refreshed on window focus — lib/use-me.ts), and a
// mark-read on the dashboard updates every reader at once through the
// optimistic setters below.
let override: number | null = null;
let lastServer: number | null = null;
const subscribers = new Set<(n: number | null) => void>();

function publish() {
  for (const fn of subscribers) fn(override);
}

/** After a mark-read: every reader shows `n` until /api/me answers again. */
export function setUnreadCount(n: number) {
  override = Math.max(0, n);
  publish();
}
export function bumpUnreadCount(delta: number, from: number) {
  override = Math.max(0, (override ?? from) + delta);
  publish();
}

export function useUnreadCount(): number {
  const { me } = useMe();
  const [local, setLocal] = useState<number | null>(override);
  useEffect(() => {
    subscribers.add(setLocal);
    return () => {
      subscribers.delete(setLocal);
    };
  }, []);
  // A fresh /api/me answer (focus, sign-in) supersedes the optimistic value.
  useEffect(() => {
    if (lastServer === me.unreadCount) return;
    lastServer = me.unreadCount;
    override = null;
    publish();
  }, [me.unreadCount]);
  return local ?? me.unreadCount ?? 0;
}
