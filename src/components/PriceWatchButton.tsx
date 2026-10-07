"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMe } from "@/lib/use-me";
import { useWatchlist } from "@/lib/use-watchlist";
import type { FreeLimitBody } from "@/lib/free-limits";
import { useCountry } from "./CountryProvider";
import { FreeLimitPanel, FreeLimitPopover } from "./FreeLimitPanel";
import { Toast } from "./ui/Toast";

// "Watch this card's price" — and "stop watching it". RiftCompare's
// PriceWatchButton, ported in wave 2 (2026-10-03).
//
// TWO AUDIENCES, ONE BUTTON:
//   • Signed IN — a real toggle against the account's watchlist
//     (lib/use-watchlist.ts), optimistic, with the free limit's 402 answered by
//     the upgrade panel beside THIS heart.
//   • Signed OUT — RiftCompare opens an email-only alert modal. OP Compare sends
//     no email until a mailer is configured, so the heart saves the card in
//     this browser (the local branch of the same store) and says so in a
//     toast: "Saved in this browser. Sign in to sync and get alerts". Signing
//     in merges the list into the account.
//
// Variants: "icon" (the round heart on tiles), "full" (btn-ghost "Watch price"
// / gold "Watching"), "responsive" (a 48px square below sm, labelled from sm).
// `limitInline`: at the free limit, render the upgrade panel as the button's
// next sibling instead of the body-portalled popover — for hosts inside a
// Dialog (QuickView), where the panel must stay inside the focus trap.
export function PriceWatchButton({
  cardId,
  slug,
  name,
  variant = "icon",
  limitInline = false,
}: {
  cardId: number;
  slug: string;
  name: string;
  variant?: "icon" | "full" | "responsive";
  limitInline?: boolean;
}) {
  const { me, loaded: meLoaded } = useMe();
  const { isWatched, watch, unwatch } = useWatchlist();
  const { country } = useCountry();
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState<FreeLimitBody | null>(null);
  const [toast, setToast] = useState(false);
  // Portalled only once a toast has fired: nothing extra renders at hydration.
  const [toasted, setToasted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const watching = isWatched({ id: cardId, slug });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  async function click(e: React.MouseEvent) {
    // LOAD-BEARING: the heart sits on a tile that is itself a link; these two
    // calls are why toggling a watch never navigates to the card.
    e.preventDefault();
    e.stopPropagation();
    if (busy || !meLoaded) return;
    setBusy(true);
    try {
      if (watching) await unwatch({ id: cardId, slug });
      else {
        const ok = await watch({ id: cardId, slug, name }, country, { onLimit: setLimit });
        if (ok && !me.user) {
          setToasted(true);
          setToast(true);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const heart = (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill={watching ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
      <path d="M12 20.5 4.2 12.9a4.8 4.8 0 0 1 0-6.8 4.8 4.8 0 0 1 6.8 0l1 1 1-1a4.8 4.8 0 0 1 6.8 0 4.8 4.8 0 0 1 0 6.8Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const limitPrompt = !limit ? null : limitInline ? (
    <FreeLimitPanel kind="watchlist" count={limit.count} onClose={() => setLimit(null)} className="w-full basis-full" />
  ) : (
    <FreeLimitPopover anchor={btnRef.current} kind="watchlist" count={limit.count} onClose={() => setLimit(null)} />
  );

  const savedToast =
    toasted && typeof document !== "undefined"
      ? createPortal(
          <Toast
            open={toast}
            message="Saved in this browser. Sign in to sync and get alerts."
            action={
              <Link href="/login?next=/watching&src=watch_toast" className="shrink-0 text-sm font-semibold text-brand-400 hover:underline">
                Sign in
              </Link>
            }
          />,
          document.body,
        )
      : null;

  const label = watching ? `Stop watching ${name}` : `Watch ${name}'s price`;
  // The tooltip teaches: what a free watch does, and what Plus and Premium add.
  const hint = watching
    ? me.user
      ? `Watching — ${me.emailOn ? "you'll get an email when the price drops" : "a new low is flagged on your watchlist"}. Click to stop`
      : "Saved in this browser — click to stop"
    : me.user
      ? `Watch this card: ${me.emailOn ? "a free email when its price hits a new low" : "a new low is flagged on your watchlist"} (free accounts: up to 10 cards). Plus adds your own target price and sealed-product watches; Premium watches a whole deck's delivered price.`
      : "Save this card to your watchlist (in this browser). Sign in to sync it and get alerts.";

  if (variant === "full" || variant === "responsive") {
    const responsive = variant === "responsive";
    return (
      <>
        <button
          ref={btnRef}
          type="button"
          onClick={click}
          disabled={busy}
          aria-pressed={watching}
          aria-label={label}
          title={hint}
          // Quiet secondary/outline, never the primary fill — the page's buy
          // buttons are the only primary CTA. "Watching" keeps a gold
          // border/tint as its active-state signal.
          className={`${watching ? "btn border border-gold/50 bg-gold/15 text-gold hover:bg-gold/25" : "btn-ghost"} whitespace-nowrap${
            responsive ? " w-12 px-0 sm:w-auto sm:px-4" : ""
          }`}
        >
          {heart}
          <span className={responsive ? "hidden sm:inline" : undefined}>{watching ? "Watching" : "Watch price"}</span>
        </button>
        {limitPrompt}
        {savedToast}
      </>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={click}
        disabled={busy}
        aria-pressed={watching}
        aria-label={label}
        title={hint}
        className={`tap-icon rounded-full border transition-colors ${
          watching ? "border-gold/60 bg-ink-950/80 text-gold" : "border-ink-600 bg-ink-950/80 text-slate-300 hover:border-gold/50 hover:text-gold"
        }`}
      >
        {heart}
      </button>
      {limitPrompt}
      {savedToast}
    </>
  );
}
