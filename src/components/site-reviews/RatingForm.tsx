"use client";

import { useEffect, useRef, useState } from "react";
import { SITE_REVIEWS } from "@/lib/site-reviews-config";
import { REVIEWS_SERVICE, markRated } from "@/lib/site-reviews";

// The one rating-and-review form (RiftCompare's RatingReviewForm, without
// accounts or email): five stars, then an optional review, "Show my review"
// ticked by default (opt-out), an optional name. Sent to RiftCompare's shared
// review service (lib/site-reviews.ts); nothing is kept on this site.
//
// ONE TAP COUNTS: stars tapped and never sent (card closed, tab hidden, page
// left) are saved by sendBeacon, stars only; a review sent after that is a
// "rating-review", which repeats the stars and is not counted twice.
// Requests go as text/plain so the browser sends them without a preflight.

type Phase = "form" | "sending" | "done";

function post(body: object): Promise<Response> {
  return fetch(REVIEWS_SERVICE, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) });
}

export function RatingForm({ compact = false, onDone }: { compact?: boolean; onDone?: () => void }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPublicly, setShowPublicly] = useState(true);
  const [honeypot, setHoneypot] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const saved = useRef(false);
  const latest = useRef({ rating, honeypot, phase });
  latest.current = { rating, honeypot, phase };

  useEffect(() => {
    if (!rating) return;
    const flush = () => {
      const cur = latest.current;
      if (saved.current || !cur.rating || cur.phase !== "form" || cur.honeypot) return;
      saved.current = true;
      const body = JSON.stringify({ rating: cur.rating, message: "", source: "rating", page: window.location.pathname, consentPublic: false });
      let sent = false;
      try {
        sent = navigator.sendBeacon?.(REVIEWS_SERVICE, new Blob([body], { type: "text/plain" })) ?? false;
      } catch {
        sent = false;
      }
      if (!sent) fetch(REVIEWS_SERVICE, { method: "POST", headers: { "Content-Type": "text/plain" }, body, keepalive: true }).catch(() => {});
      markRated();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
    // Armed once, by the first tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rating > 0]);

  const low = rating > 0 && rating <= 3;
  const expanded = !compact || rating > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "sending") return;
    if (!rating && message.trim().length < 10) {
      setError("Pick a star rating, or write a little more (at least 10 characters).");
      return;
    }
    const reviewOnly = saved.current;
    if (reviewOnly && !message.trim()) {
      setPhase("done");
      onDone?.();
      return;
    }
    setPhase("sending");
    setError(null);
    saved.current = true;
    try {
      const res = await post({
        rating: rating || undefined,
        message: message.trim(),
        displayName: showPublicly ? displayName.trim() || undefined : undefined,
        consentPublic: showPublicly,
        source: reviewOnly && rating ? "rating-review" : "rating",
        page: window.location.pathname,
        website: honeypot,
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        saved.current = reviewOnly;
        setError(d?.error ?? "Couldn't send that. Please try again.");
        setPhase("form");
        return;
      }
      if (rating) markRated();
      setPhase("done");
      onDone?.();
    } catch {
      saved.current = reviewOnly;
      setError("Couldn't reach the server. Please try again.");
      setPhase("form");
    }
  }

  if (phase === "done") {
    return (
      <div className="srv-done" data-rating-done>
        {rating > 0 && (
          <div className="srv-done-stars" aria-hidden>
            {"★".repeat(rating)}
          </div>
        )}
        <p className="srv-done-title">Thank you!</p>
        <p className="srv-muted">
          {low ? "We read every one, and this tells us what to fix." : message.trim() && showPublicly ? "We read every review before it appears on the site." : "That really helps other people find us."}
        </p>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <form onSubmit={submit} className="srv-form" data-rating-form>
      <div className="srv-stars" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onClick={() => setRating(n)}
            className={`srv-star${n <= shown ? " is-on" : ""}`}
          >
            ★
          </button>
        ))}
      </div>

      {expanded && (
        <>
          <label className="srv-label">
            <span>{low ? "What should we fix?" : rating >= 4 ? "Write a review (optional)" : "Your review"}</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={compact ? 3 : 4}
              maxLength={2000}
              placeholder={low ? "What was missing, wrong or confusing?" : `What do you use ${SITE_REVIEWS.name} for? What would make it better?`}
              className="srv-field"
            />
          </label>

          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} className="srv-hp" />

          <div className="srv-consent">
            <label>
              <input type="checkbox" checked={showPublicly} onChange={(e) => setShowPublicly(e.target.checked)} />
              <span>
                Show my review on {SITE_REVIEWS.name}
                <small>Untick to keep it private. We read every review before it appears.</small>
              </span>
            </label>
            {showPublicly && (
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Name to show (optional)"
                maxLength={60}
                aria-label="Name to show with your review, optional"
                className="srv-field"
              />
            )}
          </div>

          {error && (
            <p role="alert" className="srv-error">
              {error}
            </p>
          )}

          <button type="submit" disabled={phase === "sending"} className="srv-btn">
            {phase === "sending" ? "Sending…" : "Send"}
          </button>
          <p className="srv-fine">No account or email needed.</p>
        </>
      )}
    </form>
  );
}
