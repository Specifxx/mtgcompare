"use client";

import Link from "next/link";
import { useMe } from "@/lib/use-me";
import { useWatchlist } from "@/lib/use-watchlist";

// RiftCompare's WelcomeBack: the signed-in mirror of AccountStrip — a greeting,
// a few live chips and the dashboard button. (The member track adds
// WelcomeChecklist under it.)
const CHIP = "chip border border-ink-700 bg-ink-900 text-slate-300 transition-colors hover:border-brand-500/60 hover:text-white";

export function WelcomeBack({ checklist = null }: { checklist?: React.ReactNode }) {
  const { me, loaded } = useMe();
  const { count, loaded: wlLoaded } = useWatchlist();
  if (!loaded || !me.user) return null;
  const firstName = me.user.name.split(" ")[0] || me.user.name;
  return (
    <>
      <section className="card-surface p-5 sm:p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-white">Welcome back, {firstName}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href="/watching" className={CHIP}>
                {wlLoaded ? `${count} watched` : "Your watchlist"}
              </Link>
              <Link href="/portfolio" className={CHIP}>
                Your binder
              </Link>
              <Link href="/dashboard" className={CHIP}>
                Your dashboard
              </Link>
            </div>
          </div>
          <Link href="/dashboard" className="btn-primary shrink-0 whitespace-nowrap">
            Go to your dashboard
          </Link>
        </div>
      </section>
      {checklist}
    </>
  );
}
