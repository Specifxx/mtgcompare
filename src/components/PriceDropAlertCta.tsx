"use client";

import { useState } from "react";
import { useMe } from "@/lib/use-me";
import { useWatchlist } from "@/lib/use-watchlist";
import { useCountry } from "./CountryProvider";
import { markSignupSource } from "@/lib/signup-source";
import { PENDING_WATCH_KEY } from "@/lib/signup-source-shared";
import { trackAuthStart, trackSignupCta } from "@/lib/growth-events";
import type { FreeLimitBody } from "@/lib/free-limits";
import { FreeLimitPanel } from "./FreeLimitPanel";

// "Get a price-drop alert" — the card page's PRIMARY call to action, directly
// under the cheapest price, and a compact row in QuickView (RiftCompare's
// PriceDropAlertCta, ported in wave 2, 2026-10-03).
//
// Signed in: one click watches the card (the watchlist is the alert list).
// Signed out: "Continue with Google/Discord" creates the account AND the watch
// — the pending watch is stashed before the OAuth redirect and SignupWelcome
// completes it on return, with ?next= bringing the visitor back here.
//
// THE COPY FOLLOWS getEmailStatus() (`emailOn`). Until a mailer is configured
// OP Compare sends no email, so nothing here promises one: a drop is flagged
// on the watchlist and the dashboard, and there is no email-only door
// (RiftCompare's "or email me" opens its PriceAlertModal). With email on, the
// wording is RiftCompare's and the email door appears.
//
// `compact` (QuickView): one row, every button ghost or brand-coloured, never
// btn-primary — the retailer buy buttons are that panel's only filled CTA.
// `unpriced`: no store has it in stock, so the alert is for stock, or for
// pre-orders while the set is unreleased (`preorder`).
export function PriceDropAlertCta({
  cardId,
  slug,
  name,
  cardPath,
  providers,
  placement = "card_alert",
  compact = false,
  unpriced = false,
  preorder = false,
  pending = false,
  emailOn,
}: {
  cardId: number;
  slug: string;
  name: string;
  cardPath: string;
  providers: ("google" | "discord")[];
  placement?: "card_alert" | "quickview_alert";
  compact?: boolean;
  unpriced?: boolean;
  /** The card's set is unreleased (Set.releasedOn in the future). */
  preorder?: boolean;
  /** The caller is still loading the prices `unpriced` depends on. */
  pending?: boolean;
  /** Site-wide email status (getEmailStatus() === "on"); defaults to /api/me's. */
  emailOn?: boolean;
}) {
  const { me, loaded } = useMe();
  const user = me.user;
  const mail = emailOn ?? me.emailOn;
  const { isWatched, watch } = useWatchlist();
  const { country } = useCountry();
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState<FreeLimitBody | null>(null);
  const watching = isWatched({ id: cardId, slug });

  const copy = mail
    ? !unpriced
      ? { label: "Price-drop alert", get: "Get a price-drop alert", on: "✓ Price-drop alert on", email: "Email me when it drops" }
      : preorder
        ? { label: "Pre-order alert", get: "Get a pre-order alert", on: "✓ Pre-order alert on", email: "Email me when I can pre-order it" }
        : { label: "In-stock alert", get: "Get an in-stock alert", on: "✓ In-stock alert on", email: "Email me when it's in stock" }
    : !unpriced
      ? { label: "Price-drop alert", get: "Watch this price", on: "✓ Watching this price", email: "Watch this price" }
      : preorder
        ? { label: "Pre-order alert", get: "Watch for pre-orders", on: "✓ Watching for pre-orders", email: "Watch for pre-orders" }
        : { label: "In-stock alert", get: "Watch for stock", on: "✓ Watching for stock", email: "Watch for stock" };

  const stashAndStart = (provider: "google" | "discord") => {
    try {
      localStorage.setItem(PENDING_WATCH_KEY, JSON.stringify({ cardId, slug, name, market: country }));
    } catch {
      /* private mode — the account is still created; the watch is one more click */
    }
    markSignupSource(placement);
    trackSignupCta(placement);
    trackAuthStart(provider, placement);
  };
  const oauthHref = (provider: "google" | "discord") => `/api/auth/oauth/${provider}?next=${encodeURIComponent(cardPath)}&src=${placement}`;
  // Email on: RiftCompare's email-only door (the collection-alerts track's PriceAlertModal listens).
  const emailInstead = () =>
    window.dispatchEvent(new CustomEvent("price-alert-open", { detail: { cardId, notice: !unpriced ? "drop" : preorder ? "preorder" : "stock" } }));
  const enable = async () => {
    setBusy(true);
    try {
      await watch({ id: cardId, slug, name }, country, { onLimit: setLimit });
    } finally {
      setBusy(false);
    }
  };

  // Reserve the height until the session is known, so the price block does not jump.
  if (!loaded || pending) return <div aria-hidden className={compact ? "mt-3 h-12" : "mt-3 h-[4.5rem]"} />;

  const limitPanel = limit ? <FreeLimitPanel kind="watchlist" count={limit.count} onClose={() => setLimit(null)} className="mt-2 w-full" /> : null;

  if (compact) {
    return (
      <>
        <div className="mt-3 flex flex-wrap items-center gap-2" data-alert-cta="compact">
          <span className="text-sm font-semibold text-white">{copy.label}:</span>
          {user || providers.length === 0 ? (
            <button type="button" disabled={busy || watching} onClick={enable} className={watching ? "btn border border-gold/50 bg-gold/15 text-sm text-gold" : "btn-ghost text-sm"}>
              {watching ? copy.on : copy.email}
            </button>
          ) : (
            <>
              {providers.includes("google") && (
                <a href={oauthHref("google")} rel="nofollow" onClick={() => stashAndStart("google")} className="btn-ghost text-sm">
                  Continue with Google
                </a>
              )}
              {providers.includes("discord") && (
                <a href={oauthHref("discord")} rel="nofollow" onClick={() => stashAndStart("discord")} className="btn border-0 bg-[#5865F2] px-3 text-xs text-[#ffffff] hover:brightness-110">
                  Discord
                </a>
              )}
              {mail ? (
                <button type="button" onClick={emailInstead} className="tap-link text-xs text-slate-400 underline-offset-2 hover:text-white hover:underline">
                  or email me
                </button>
              ) : null}
            </>
          )}
        </div>
        {limitPanel}
      </>
    );
  }

  if (user || providers.length === 0) {
    // Signed in (or no sign-in configured: the watch is then saved in this browser).
    return (
      <>
        <div className="mt-3 flex flex-wrap items-center gap-2" data-alert-cta="full">
          <button type="button" disabled={busy || watching} onClick={enable} className={watching ? "btn border border-gold/50 bg-gold/15 text-gold" : "btn-primary"}>
            {watching ? copy.on : copy.get}
          </button>
          <span className="text-xs text-slate-400">
            {mail
              ? unpriced
                ? preorder
                  ? "We'll email you when a store we compare has it up for pre-order."
                  : "We'll email you when it's in stock."
                : watching
                  ? "We'll email you when it gets cheaper."
                  : "One click — we email you when it gets cheaper."
              : unpriced
                ? preorder
                  ? "We'll flag it on your watchlist when a store we compare has it up for pre-order."
                  : "We'll flag it on your watchlist when it's in stock."
                : watching
                  ? "We'll flag it on your watchlist when it drops (Plus: at your own price)."
                  : "Watch this price — we'll flag it on your watchlist when it drops (Plus: at your own price)."}
          </span>
        </div>
        {limitPanel}
      </>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-brand-500/30 bg-brand-500/5 p-3" data-alert-cta="signed-out">
      <p className="text-sm font-bold text-white">{copy.get}</p>
      <p className="mt-0.5 text-xs text-slate-400">
        {mail
          ? unpriced
            ? preorder
              ? "Get an email when a store we compare has it up for pre-order."
              : "Get an email when it's in stock. No store has it in stock yet."
            : "One click creates your free account and the alert — we email you when this card gets cheaper."
          : unpriced
            ? preorder
              ? "One click creates your free account and watches this card — we flag it on your watchlist when a store has it up for pre-order."
              : "One click creates your free account and watches this card — we flag it on your watchlist when it's in stock."
            : "One click creates your free account and watches this card — we flag it on your watchlist when it drops (Plus: at your own price)."}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {providers.includes("google") && (
          <a href={oauthHref("google")} rel="nofollow" onClick={() => stashAndStart("google")} className="btn-primary text-sm">
            Continue with Google
          </a>
        )}
        {providers.includes("discord") && (
          <a href={oauthHref("discord")} rel="nofollow" onClick={() => stashAndStart("discord")} className="btn border-0 bg-[#5865F2] text-sm text-[#ffffff] hover:brightness-110">
            Continue with Discord
          </a>
        )}
        {mail ? (
          <button type="button" onClick={emailInstead} className="tap-link text-xs text-slate-400 underline-offset-2 hover:text-white hover:underline">
            or just email me
          </button>
        ) : null}
      </div>
    </div>
  );
}
