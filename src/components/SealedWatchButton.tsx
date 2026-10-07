"use client";

import { useState } from "react";
import { useMe } from "@/lib/use-me";
import { useSealedWatches } from "@/lib/use-sealed-watches";
import { useCountry } from "./CountryProvider";
import PlanButton from "./PlanButton";
import { WatchButton } from "./WatchButton";
import { SEALED_CHECK_CADENCE, SEALED_WATCH_LIMIT_PLUS } from "@/lib/alert-limits";

// "Watch this sealed product" — RiftCompare's SealedWatchButton, ported in
// wave 2 (2026-10-03). A toggle for a Plus/Premium member: the alert run
// (collection-alerts track) checks it after every import and tells them when
// it is back in stock after selling out everywhere, at their target, or on a
// real drop. OP Compare has no MSRP table, so there is no at-RRP trigger and
// the copy names none.
//
// Everyone else keeps OP Compare's no-account heart (saved in this browser,
// components/WatchButton.tsx) — free and signed-out sealed hearts are never
// dropped — and, on the product page, the Plus gate beside it with one honest
// line (surface gate:sealed-watch). `compact` is the /sealed tile's icon.
//
// The alert line promises an email only once a mailer is configured
// (me.emailOn); until then a watch is flagged in-app.
export function SealedWatchButton({
  sealedId,
  slug,
  name,
  compact = false,
  className = "",
  market,
}: {
  sealedId: number;
  slug: string;
  name: string;
  compact?: boolean;
  className?: string;
  /** The market the watch is for; defaults to the viewer's. */
  market?: string;
}) {
  const { me, loaded } = useMe();
  const { country: viewer } = useCountry();
  const country = market ?? viewer;
  const member = !!me.user && me.tier != null;
  const { rowFor, watch, unwatch, loaded: watchesLoaded } = useSealedWatches();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const tell = me.emailOn ? "emails you" : "tells you";

  // A signed-in account without Plus gets RiftCompare's lock, not a local
  // heart: nothing a free account taps would be kept on the account, and a
  // heart that says "Watching" while the alert run never sees it is a promise
  // the page cannot keep. Signed-out visitors keep the browser heart below.
  if (loaded && me.user && !member) {
    if (compact) {
      return (
        <PlanButton tier="plus" surface="gate:sealed-watch" className={`tap-icon rounded-full bg-ink-950/80 text-slate-300 hover:text-white ${className}`}>
          <span aria-hidden="true">♡</span>
          <span className="sr-only">Watch this product with Plus</span>
        </PlanButton>
      );
    }
    return (
      <div className={className}>
        <p className="text-xs text-slate-400">
          Plus {tell} when this is back in stock or at your price, checked {SEALED_CHECK_CADENCE}.
        </p>
        <div className="mt-1.5">
          <PlanButton tier="plus" surface="gate:sealed-watch" />
        </div>
      </div>
    );
  }

  if (!loaded || !member) {
    if (compact) return <WatchButton slug={slug} kind="sealed" name={name} />;
    return (
      <div className={className}>
        <WatchButton slug={slug} kind="sealed" name={name} variant="button" />
        {loaded ? (
          <>
            <p className="mt-1.5 text-xs text-slate-400">
              Saved in this browser. Plus {tell} when this is back in stock or at your price, checked {SEALED_CHECK_CADENCE}.
            </p>
            <div className="mt-1.5">
              <PlanButton tier="plus" surface="gate:sealed-watch" />
            </div>
          </>
        ) : null}
      </div>
    );
  }

  const row = rowFor(country, sealedId);
  const watching = !!row;

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || !watchesLoaded) return;
    setBusy(true);
    setNote(null);
    try {
      if (row) await unwatch(row.id);
      else {
        const out = await watch(sealedId);
        if (!out.ok) {
          setNote(
            out.status === 409
              ? `Plus watches up to ${SEALED_WATCH_LIMIT_PLUS} sealed products. Stop one on your watchlist, or move to Premium for unlimited.`
              : ((out.body?.error as string | undefined) ?? "Couldn't save that — try again."),
          );
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

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={watching}
          aria-label={watching ? `Stop watching ${name}` : `Watch ${name}: tell me on a restock or at my price`}
          title={watching ? "Watching — tap to stop" : "Watch: tell me when it's back in stock or at my price"}
          className={`tap-icon rounded-full border transition-colors ${
            watching ? "border-gold/60 bg-ink-950/80 text-gold" : "border-ink-600 bg-ink-950/80 text-slate-300 hover:border-gold/50 hover:text-gold"
          } ${className}`}
        >
          {heart}
        </button>
        {note ? (
          <span role="alert" className="sr-only">
            {note}
          </span>
        ) : null}
      </>
    );
  }
  return (
    <div className={className}>
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={watching} className={watching ? "btn border border-gold/50 bg-gold/15 text-xs text-gold hover:bg-gold/25" : "btn-primary text-xs"}>
        {heart}
        {watching ? "Watching — stop" : "Watch this product"}
      </button>
      <p className="mt-1 text-[11px] text-slate-500">
        {watching
          ? `We ${me.emailOn ? "email you" : "flag it on your watchlist"} when it's back in stock after selling out everywhere, at your target, or on a real drop. Checked ${SEALED_CHECK_CADENCE}; a Discord stock bot may be faster. Set a target on your watchlist.`
          : `${me.emailOn ? "Email me" : "Tell me"} when it's back in stock or at my price. Checked ${SEALED_CHECK_CADENCE}; a Discord stock bot may be faster.`}
      </p>
      {note && (
        <p role="alert" className="mt-1 text-xs text-amber-300">
          {note}
        </p>
      )}
    </div>
  );
}
