"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { OAuthProvider } from "@/lib/oauth";
import { parseSignupSource } from "@/lib/signup-source-shared";

// RiftCompare's AuthForm: "Create your free account" with the perks, an error
// line for a failed OAuth round trip (?error=), and Google / Discord buttons.
// One form signs in and signs up. Exported for every sign-in surface: the
// /login page, the Plus/Premium dialog's signed-out state (`compact bare`) and
// the price-alert modal.
//
// OP Compare has only ever been OAuth, so RiftCompare's "signed up with a
// password before?" note is not ported.
const OAUTH_ERRORS: Record<string, string> = {
  provider_unavailable: "That sign-in option isn't available right now — try the other one.",
  oauth_state: "Sign-in expired or was interrupted. Please try again.",
  oauth_token: "Couldn't complete sign-in with that provider. Please try again.",
  oauth_profile: "Couldn't read your profile from that provider. Please try again.",
  oauth_noemail: "That provider didn't share an email address, which we need to create your account.",
  oauth_unverified: "That provider hasn't confirmed your email address yet. Verify it with them first, then sign in here again.",
  oauth_session: "Something went wrong finishing sign-in. Please try again.",
};

// What a free account really gets on OP Compare (no perk promises an email).
const PERKS = ["Watchlist", "Binder", "Top 3 deals"] as const;

export function AuthForm({
  providers,
  bare = false,
  compact = false,
  cancelHref,
  source,
  next,
  contextLine,
  onProviderClick: onProviderClickProp,
}: {
  providers: OAuthProvider[];
  /** No page wrapper and no "← Back" (inside a dialog). */
  bare?: boolean;
  /** Buttons only: no heading, perks or footnote. */
  compact?: boolean;
  cancelHref?: string;
  /** Where the sign-up started, for the auth_start event ("plan-dialog", "header"…). */
  source?: string;
  next?: string;
  contextLine?: string;
  onProviderClick?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const onProviderClick = (provider: OAuthProvider) => {
    trackEvent("auth_start", { provider, placement: source ?? "login" });
    onProviderClickProp?.();
  };
  // `src` stamps the new account's sign-up surface (lib/signup-source-shared.ts
  // whitelist; an unknown placement is simply left off).
  const oauthHref = (provider: OAuthProvider) => {
    const params = new URLSearchParams();
    if (next) params.set("next", next);
    const src = parseSignupSource(source);
    if (src) params.set("src", src);
    const q = params.toString();
    return `/api/auth/oauth/${provider}${q ? `?${q}` : ""}`;
  };

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e) setError(OAUTH_ERRORS[e] ?? "Sign-in failed — please try again.");
  }, []);

  const wrapperClass = bare ? "" : "mx-auto w-full max-w-sm py-10";
  return (
    <div className={wrapperClass}>
      <div className={compact ? "" : "card-surface p-6"}>
        {!bare && cancelHref && (
          <Link href={cancelHref} className="mb-3 inline-block text-xs text-slate-500 hover:text-white">
            ← Back
          </Link>
        )}
        {!compact && (
          <>
            <h1 className="text-xl font-extrabold text-white">Create your free account</h1>
            <p className="mt-0.5 text-xs text-slate-500">Already have one? The same buttons sign you in.</p>
            {contextLine && <p className="mt-3 text-sm font-medium text-slate-200">{contextLine}</p>}
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-300">
              {PERKS.map((perk) => (
                <li key={perk} className="flex items-center gap-1.5">
                  <span aria-hidden className="font-bold text-brand-400">
                    ✓
                  </span>
                  <span className="font-semibold">{perk}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <div className={`${compact ? "mt-0" : "mt-5"} flex flex-col gap-2.5`}>
          {providers.includes("google") && (
            <a
              href={oauthHref("google")}
              rel="nofollow"
              data-autofocus={compact ? true : undefined}
              onClick={() => onProviderClick("google")}
              className="flex min-h-11 items-center justify-center gap-2.5 rounded-xl border border-ink-600 bg-[#ffffff] py-2.5 text-sm font-semibold text-[#0a0c10] hover:brightness-95"
            >
              <GoogleIcon /> Continue with Google
            </a>
          )}
          {providers.includes("discord") && (
            <a
              href={oauthHref("discord")}
              rel="nofollow"
              onClick={() => onProviderClick("discord")}
              className="flex min-h-11 items-center justify-center gap-2.5 rounded-xl bg-[#5865F2] py-2.5 text-sm font-semibold text-[#ffffff] hover:brightness-110"
            >
              <DiscordIcon /> Continue with Discord
            </a>
          )}
        </div>
        {providers.length === 0 && (
          <p className="mt-5 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">Sign-in is temporarily unavailable. Please try again shortly.</p>
        )}
        <p className={`${compact ? "mt-3" : "mt-5"} text-center text-xs text-slate-500`}>New here? Either button creates your account on the spot.</p>
        {!compact && (
          <p className="mt-2 text-center text-xs text-slate-500">
            We only read your name, email and picture. See our{" "}
            <a href="/privacy" className="text-brand-400 hover:underline">
              privacy policy
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.4 5.4 2.6 13.3l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7C43.9 38 46.5 31.8 46.5 24.5z" />
      <path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.4-5.7c-2 1.4-4.7 2.3-7.9 2.3-6.4 0-11.8-3.7-13.6-8.9l-7.8 6.1C6.4 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a18 18 0 0 1 4.3 1.4 16.7 16.7 0 0 0-14.8 0A18 18 0 0 1 9 3.4L8.7 3a19.8 19.8 0 0 0-5 1.4A20.6 20.6 0 0 0 .2 18.4 19.9 19.9 0 0 0 6.3 21l.4-.6a13 13 0 0 1-2-1l.5-.4a14 14 0 0 0 12 0l.5.4c-.6.4-1.3.7-2 1l.4.6a19.9 19.9 0 0 0 6-2.6 20.6 20.6 0 0 0-3.5-14zM8.4 15.3c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.8 2-1.7 2zm7.2 0c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2z" />
    </svg>
  );
}
