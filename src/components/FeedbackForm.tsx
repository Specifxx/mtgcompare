"use client";

import { useState } from "react";
import { LIMITS } from "@/lib/inbox-rules";
import { useMe } from "@/lib/use-me";

const field = "mt-1 block w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-slate-100";

// /feedback. A rating, a message, or both. Shown publicly only when the box is
// ticked, and only after the owner approves it.
export function FeedbackForm() {
  const { me } = useMe();
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [consentPublic, setConsent] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<{ status: "idle" | "busy" | "done" | "error"; error?: string }>({ status: "idle" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ status: "busy" });
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, message, consentPublic, displayName: consentPublic ? displayName : undefined, page: "/feedback", source: "page", website }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setState({ status: "error", error: data.error ?? "Something went wrong. Try again later." });
      const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
      gtag?.("event", "feedback_submit", { rating: rating ?? 0 });
      setState({ status: "done" });
    } catch {
      setState({ status: "error", error: "Network error. Try again." });
    }
  };

  if (state.status === "done") return <p className="card-surface p-5 text-emerald-300">Thank you! The owner reads every piece of feedback.</p>;
  return (
    <form onSubmit={submit} className="card-surface space-y-4 p-5">
      {me.user ? <p className="text-xs text-slate-400">Signed in as {me.user.email}</p> : null}
      <fieldset>
        <legend className="text-sm text-slate-300">How useful is MTG Compare?</legend>
        <div className="mt-1 flex gap-1" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              onClick={() => setRating(rating === n ? null : n)}
              className={`text-3xl leading-none ${rating != null && n <= rating ? "text-gold" : "text-slate-600 hover:text-slate-400"}`}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm text-slate-300">
        What should we keep, fix or add? {rating != null ? "(optional)" : null}
        <textarea maxLength={LIMITS.feedbackMessageMax} rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className={field} />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={consentPublic} onChange={(e) => setConsent(e.target.checked)} />
        You can show this publicly
      </label>
      {consentPublic ? (
        <label className="block text-sm text-slate-300">
          Name to show (optional)
          <input maxLength={LIMITS.feedbackDisplayName} value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={`${field} max-w-xs`} />
        </label>
      ) : null}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} />
      {state.status === "error" ? <p className="text-sm text-red-300">{state.error}</p> : null}
      <button type="submit" disabled={state.status === "busy" || (rating == null && !message.trim())} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">
        {state.status === "busy" ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
