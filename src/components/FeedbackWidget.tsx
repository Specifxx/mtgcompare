"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { ShareRow } from "./ShareRow";
import { Dialog } from "./ui/Dialog";

// Site-wide feedback / review widget.
//
// WHY A PERSISTENT LAUNCHER AND NOT A SECOND POPUP. When this was written the
// site already auto-opened one sign-up dialog (SignupPromoPopup, removed
// altogether on 2026-09-30), whose own header recorded the real user feedback
// behind it: "ads + subscription pitch + a still-growing marketplace all at once
// read as overwhelming / untrustworthy to a new visitor". Adding a second uninvited interruption to
// collect satisfaction data would be measuring a problem while making it worse —
// and the people most likely to have something useful to say are exactly the
// ones a wall of modals drives off. So this NEVER auto-opens. It is a small,
// always-present, always-reachable control that costs nothing until it is
// wanted, which is what "accessible to any visitor" actually requires.
//
// IT WORKS SIGNED OUT. That is the entire point of the change it belongs to:
// /api/feedback used to 401 anyone without an account and FeedbackForm rendered
// a "Sign in →" wall, so the only reachable feedback came from people who had
// already converted. A visitor who bounces because something confused them has
// no account and never will.
//
// THE ROUTING IS DELIBERATE. A high rating leads to a share offer; a low one
// leads to "what went wrong" and an optional reply address. That is not
// review-gating: EVERY submission is stored and shown to admins identically, no
// rating is discarded or hidden, and nothing is ever published without the
// submitter ticking the consent box. It only decides which follow-up question is
// worth a person's time — asking someone who just rated the site 2 stars to go
// promote it is tone-deaf, and asking a delighted user "what went wrong" wastes
// the moment.

const LAUNCHER_HIDDEN_PATHS = ["/login", "/admin"];

type Phase = "rating" | "detail" | "sending" | "done";

export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("rating");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [consentPublic, setConsentPublic] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [overAdZone, setOverAdZone] = useState(false);
  const [overHero, setOverHero] = useState(false);


  const positive = rating != null && rating >= 4;

  // ── Never float over an ad ────────────────────────────────────────────────
  // FooterAds renders a real AdSense-adjacent affiliate unit directly above the
  // footer (layout.tsx), and Google's program policies prohibit ads being
  // obscured by floating page furniture. This repo has an active AdSense
  // remediation history (docs/adsense-remediation.md), so the launcher yields:
  // while the ad zone is anywhere in the viewport, it hides entirely. Costs one
  // observer and removes the whole class of violation.
  // A route with no zone (FooterAds renders none on the policy and trust pages)
  // must clear the flag: arriving from a footer link while the banners were on
  // screen would otherwise leave the launcher hidden for the whole page.
  useEffect(() => {
    const zone = document.getElementById("mc-ad-zone");
    if (!zone || typeof IntersectionObserver === "undefined") {
      setOverAdZone(false);
      return;
    }
    const io = new IntersectionObserver((entries) => setOverAdZone(entries[0]?.isIntersecting ?? false));
    io.observe(zone);
    return () => io.disconnect();
  }, [pathname]);

  // ── Never compete with the hero's search + autocomplete ──────────────────
  // The homepage-redesign brief flags this exact launcher (fixed bottom-4
  // right-4) as a real risk of sitting near — and on a short mobile viewport,
  // occasionally under — the hero search's autocomplete dropdown, right at
  // the one moment the whole redesigned page is built around. Rather than
  // hand-roll a scrollY threshold, this reuses the SAME pattern the ad-zone
  // check right above it already established: look for a marker element by
  // id and hide for as long as it's in view. CinematicHero's outermost
  // section carries id="mc-hero" for exactly this. On every OTHER route
  // (149 of them), that id doesn't exist, `zone` is null, and this becomes a
  // pure no-op — so the launcher's behavior everywhere except the homepage
  // is completely unchanged by this effect.
  useEffect(() => {
    const zone = document.getElementById("mc-hero");
    if (!zone || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => setOverHero(entries[0]?.isIntersecting ?? false));
    io.observe(zone);
    return () => io.disconnect();
  }, [pathname]);

  // Escape, the focus trap, scroll lock and the shared rcDialog flag (read by
  // the corner nudges before they slide in, so nothing can stack on this
  // panel) now all belong to Dialog — refcounted there, so this widget shares
  // the exact same flag every other Dialog-based overlay sets, rather than
  // its own private copy. Dialog also restores focus to whatever triggered
  // it (the launcher button) once the panel unmounts, so close() no longer
  // needs to do that by hand.
  const close = useCallback(() => setOpen(false), []);

  function openWidget() {
    setOpen(true);
    setPhase("rating");
    setError(null);
    trackEvent("feedback_open", { path: pathname ?? "/" });
  }

  function pickRating(n: number) {
    setRating(n);
    setPhase("detail");
    trackEvent("feedback_rating", { rating: n });
  }

  async function submit() {
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          message: message.trim(),
          email: email.trim() || undefined,
          displayName: displayName.trim() || undefined,
          consentPublic,
          source: "widget",
          page: pathname ?? "/",
          website: honeypot, // honeypot — real users never fill this
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't send that — please try again.");
        setPhase("detail");
        return;
      }
      setPhase("done");
      trackEvent("feedback_submit", { rating: rating ?? 0, hasMessage: message.trim().length > 0 });
    } catch {
      setError("Couldn't reach the server — please try again.");
      setPhase("detail");
    }
  }

  if (LAUNCHER_HIDDEN_PATHS.some((p) => pathname?.startsWith(p))) return null;

  return (
    <>
      {/* Launcher. z-40 keeps it under every dialog and corner nudge
          (PremiumSlideIn is z-70, QuickView z-60) and under the sticky nav, so it can never trap or
          cover a more important surface.

          Sized down to a 44x44 icon-only circle below `sm` (was a wider
          "💬 Feedback" pill at every breakpoint, measuring ~38px tall on a
          real mobile viewport — under this site's own 44px tap-target floor,
          and a bigger footprint than it needed on the viewport most likely
          to have it fighting for space against other page furniture). The
          text label returns from `sm:` up, where there's room to spare and
          no touch-target minimum to hit; `aria-label` keeps the accessible
          name identical in both states so this is a visual-only change.
          `!overHero` (see the effect above) additionally hides the whole
          launcher on the homepage for as long as the hero is in view.

          `sm:min-h-11` (2026-09-23), NOT a bare `min-h-11`: the ≥sm pill
          measured 38px tall. Under pointer:coarse globals.css lifts `.min-h-11`
          to 48px, which beats h-11 and turned the 44x44 phone circle into a
          44x48 egg (measured). The `sm:` variant never applies below 640px, so
          the phone circle is left alone; from sm up the pill is 44px with a
          mouse and 48px on touch, because Tailwind generates that
          utilities-layer coarse rule for the variant too (measured 117x44 at
          1440, 117x48 on an 844x390 phone). */}
      {!open && !overAdZone && !overHero && (
        <button
          type="button"
          onClick={openWidget}
          aria-label="Send feedback"
          className="above-bottombar fixed right-4 z-40 flex h-11 w-11 items-center justify-center gap-2 rounded-full border border-ink-700 bg-ink-900/95 text-xs font-semibold text-slate-200 shadow-lg backdrop-blur transition-colors hover:border-brand-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 sm:h-auto sm:w-auto sm:px-4 sm:py-2.5 sm:min-h-11"
        >
          <span aria-hidden>💬</span>
          <span className="hidden sm:inline">Feedback</span>
        </button>
      )}

      <Dialog open={open} onClose={close} placement="sheet" size="md" z="sheet" labelledBy="mc-feedback-title" className="p-5">
            {/* .tap-icon (2026-09-23): 48px on touch, up from 29x32. Every
                step's title below carries pr-12 so none runs under it. */}
            <button
              type="button"
              onClick={close}
              aria-label="Close feedback"
              className="tap-icon absolute right-2 top-2 shrink-0 rounded-lg text-slate-400 transition-colors hover:bg-ink-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              ✕
            </button>

            {/* ── Step 1: the rating ─────────────────────────────────────── */}
            {phase === "rating" && (
              <>
                <h2 id="mc-feedback-title" className="pr-12 text-lg font-extrabold text-white">
                  How&apos;s MTG Compare working for you?
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  One tap. No account needed — we read every one.
                </p>
                {/* Stars (2026-09-23): min-h-11/min-w-11 lifts each to the
                    tap floor (43x38 before), and the idle glyph is slate-600
                    rather than ink-600, which read ~1.7:1 against the sheet. */}
                <div className="mt-4 flex justify-center gap-1.5" role="group" aria-label="Rate MTG Compare out of 5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      {...(n === 1 ? { "data-autofocus": true } : {})}
                      type="button"
                      onClick={() => pickRating(n)}
                      aria-label={`${n} out of 5`}
                      className="min-h-11 min-w-11 rounded-lg px-2 py-1 text-3xl leading-none text-slate-600 transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                    >
                      ★
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRating(null);
                    setPhase("detail");
                  }}
                  className="tap-link mx-auto mt-4 block px-3 text-xs text-slate-500 underline-offset-4 hover:text-slate-300 hover:underline"
                >
                  Skip — I just want to report something
                </button>
              </>
            )}

            {/* ── Step 2: the follow-up, routed by sentiment ──────────────── */}
            {(phase === "detail" || phase === "sending") && (
              <>
                <h2 id="mc-feedback-title" className="pr-12 text-lg font-extrabold text-white">
                  {rating == null
                    ? "What would you like to tell us?"
                    : positive
                    ? "Glad it's useful — what should we add?"
                    : "Sorry about that — what went wrong?"}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {positive
                    ? "Optional, but the specifics are what actually shape what we build next."
                    : "Tell us what happened and we'll look at it."}
                </p>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  placeholder={
                    positive
                      ? "e.g. cover more UK stores, or add a sealed price chart…"
                      : "e.g. the price on X looked wrong, or search didn't find…"
                  }
                  className="input mt-3 w-full resize-y"
                  aria-label="Your feedback"
                />

                {/* Honeypot — visually hidden, never announced, never tabbable.
                    Bots fill every field they find; people never see this one. */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  className="hidden"
                />

                {!positive && (
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email (optional — only if you want a reply)"
                    className="input mt-2 w-full"
                    aria-label="Email address, optional"
                  />
                )}

                {positive && (
                  <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900/60 p-3">
                    <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={consentPublic}
                        onChange={(e) => setConsentPublic(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        You can show this on the site as a review.
                        <span className="mt-0.5 block text-slate-500">
                          Nothing is ever published without this ticked — and we still read it either way.
                        </span>
                      </span>
                    </label>
                    {consentPublic && (
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Name to show (optional)"
                        maxLength={60}
                        className="input mt-2 w-full text-xs"
                        aria-label="Display name for the public review, optional"
                      />
                    )}
                  </div>
                )}

                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={phase === "sending" || (rating == null && message.trim().length < 10)}
                    className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {phase === "sending" ? "Sending…" : "Send feedback"}
                  </button>
                  <button type="button" onClick={close} className="btn-ghost text-xs">
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* ── Step 3: thanks, and (only if positive) the share offer ──── */}
            {phase === "done" && (
              <>
                <h2 id="mc-feedback-title" className="pr-12 text-lg font-extrabold text-white">
                  Thanks — that&apos;s genuinely useful.
                </h2>
                {positive ? (
                  <>
                    <p className="mt-1 text-sm text-slate-400">
                      If MTG Compare saved you money, the single most useful thing you can do is tell one
                      other person who plays Magic.
                    </p>
                    <ShareRow source="feedback_widget" size="sm" className="mt-4" />
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">
                    We read every one of these{email.trim() ? " — and we'll come back to you at that address" : ""}.
                  </p>
                )}
                <button type="button" onClick={close} className="btn-ghost mt-5 text-xs">
                  Close
                </button>
              </>
            )}
      </Dialog>
    </>
  );
}
