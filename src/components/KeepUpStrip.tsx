"use client";

// "Keep up" strip (owned audience, 2026-11-20): on the pages Reddit posts land on (the Hot 100), right under the first
// buy cards, two ways to come back without Reddit: next week's chart by email (the weekly biggest-moves email on
// RiftCompare's shared alert service, kind "weekly", double opt-in, this site keeps no address) and the family's Discord
// hub through this site's own invite code (the server's Invites list counts who joined from here). Inline, never a pop-up,
// no heading (the page outline is unchanged), a fixed height in the server HTML so nothing moves. Sign-ups count as
// `weekly_signup` with placement "hot-100"; Discord joins are read from the invite's uses. The same file is copied into every
// site that shows it.
import { useState, type FormEvent } from "react";
import { track } from "@vercel/analytics";
import { ALERT_PRIVACY, ALERT_SERVICE } from "./PriceAlertForm";

type State = { status: "idle" | "sending" } | { status: "done"; confirm: boolean } | { status: "error"; message: string };

export function KeepUpStrip({
  site,
  region,
  siteName,
  discordHref,
  placement = "hot-100",
  what = "the week's biggest price drops",
  className,
  buttonClassName,
}: {
  /** this site's key in the alert service ("dex", "mtg", …) */
  site: string;
  /** the visitor's region as the page shows it ("US", "UK", …) */
  region: string;
  siteName: string;
  /** this site's own Discord invite, or nothing (the strip is then email only) */
  discordHref?: string | null;
  placement?: string;
  /** what the email brings, in the sentence "Get … free by email" */
  what?: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (String(f.get("website") ?? "")) return setState({ status: "done", confirm: true });
    setState({ status: "sending" });
    try {
      const r = await fetch(ALERT_SERVICE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, region, email: String(f.get("email") ?? ""), kind: "weekly" }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; status?: string; error?: string };
      if (r.ok && j.ok) {
        track("weekly_signup", { placement, region });
        setState({ status: "done", confirm: j.status !== "active" });
      } else setState({ status: "error", message: j.error || "Couldn't save that. Please try again." });
    } catch {
      setState({ status: "error", message: "Couldn't save that. Check your connection and try again." });
    }
  }

  const id = `ku-email-${placement}`;
  return (
    <div className={className} data-keepup={placement}>
      <div style={{ border: "1px solid rgba(127,127,127,.35)", borderRadius: 14, padding: "12px 14px", minHeight: 96 }}>
        {state.status === "done" ? (
          <p role="status" style={{ margin: 0 }}>
            <strong>{state.confirm ? "Check your inbox to confirm." : "Done. You're on the weekly email."}</strong>
            <span style={{ display: "block", fontSize: 13, opacity: 0.8, marginTop: 4 }}>
              {state.confirm ? `One click in the email we just sent and ${what} comes to you.` : "The next edition comes within about a week."}
            </span>
          </p>
        ) : (
          <form onSubmit={submit}>
            <p style={{ margin: "0 0 8px", fontSize: 14 }}>
              <strong>Get {what} free by email</strong>
              <span style={{ opacity: 0.8 }}> · one email a week from {siteName}, {region} store prices, no account.</span>
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <label htmlFor={id} style={{ position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" }}>
                Your email
              </label>
              <input
                id={id}
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="Your email address"
                style={{ flex: "1 1 200px", minWidth: 0, boxSizing: "border-box", padding: "9px 12px", border: "1px solid rgba(127,127,127,.45)", borderRadius: 10, background: "transparent", color: "inherit", font: "inherit", fontSize: 16 }}
              />
              <div style={{ position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
                <label>
                  Website <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>
              <button
                type="submit"
                disabled={state.status === "sending"}
                className={buttonClassName}
                style={buttonClassName ? undefined : { padding: "9px 16px", borderRadius: 10, border: "1px solid currentColor", background: "transparent", color: "inherit", font: "inherit", fontWeight: 700, cursor: "pointer" }}
              >
                {state.status === "sending" ? "Saving…" : "Email me"}
              </button>
              {discordHref && (
                <a
                  href={discordHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", minHeight: 40, padding: "8px 14px", borderRadius: 10, background: "#5865F2", color: "#fff", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
                >
                  Or join the Discord
                </a>
              )}
            </div>
            {state.status === "error" && (
              <p role="alert" style={{ fontSize: 13, margin: "6px 0 0", color: "#c0392b" }}>
                {state.message}
              </p>
            )}
            <p style={{ fontSize: 11, opacity: 0.7, margin: "6px 0 0" }}>
              We email once to confirm; every email has a stop link. Sent by our shared alert service (
              <a href={ALERT_PRIVACY} style={{ color: "inherit" }}>
                privacy
              </a>
              ).{discordHref ? " The Discord posts sealed restocks and deals twice a day." : ""}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
