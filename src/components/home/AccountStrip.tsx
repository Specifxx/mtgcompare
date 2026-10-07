"use client";

import Link from "next/link";
import { useMe } from "@/lib/use-me";
import { trackEvent } from "@/lib/analytics";

// RiftCompare's AccountStrip: the signed-out "create a free account" band.
// Perks name only what a free account really gets on OP Compare today, and no
// perk promises an email (alerts arrive in the account until email is on).
const PERKS: [string, string][] = [
  ["Watchlist", "save cards and jump back anytime"],
  ["Binder", "keep your collection in one place, priced live"],
  ["Deal Finder", "the three biggest savings in your market"],
];

export function AccountStrip() {
  const { me, loaded } = useMe();
  if (loaded && me.user) return null;
  return (
    <section className="card-surface p-5 sm:p-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-white">Track the cards you care about</h2>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-300">
            {PERKS.map(([perk, why]) => (
              <li key={perk} className="flex items-center gap-1.5">
                <span aria-hidden className="font-bold text-brand-400">
                  ✓
                </span>
                <span>
                  <span className="font-semibold text-slate-200">{perk}</span>
                  <span className="hidden text-slate-400 md:inline"> — {why}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <Link href="/login" rel="nofollow" onClick={() => trackEvent("signup_cta_click", { placement: "home" })} className="btn-primary shrink-0 whitespace-nowrap">
          Create your free account
        </Link>
      </div>
    </section>
  );
}
