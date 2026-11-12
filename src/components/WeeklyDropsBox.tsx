"use client";

// "Weekly price drops": one email field on the hub pages (home, deals, sets, price moves, this week). It subscribes the
// address to this site's weekly biggest-drops email on RiftCompare's shared alert service (kind "weekly": no product, no
// price, no alert), with the same double opt-in as a price alert: one confirmation email, nothing else until the click.
// This site keeps no address. Inline only, never a pop-up, no heading (the page's outline is unchanged), a fixed height
// in the server HTML so nothing moves. DECISIONS.md, "A sign-up people can see" (2026-11-12). The same file is copied
// into every site that shows it.
import { useState, type FormEvent } from "react";
import { track } from "@vercel/analytics";
import { ALERT_PRIVACY, ALERT_SERVICE } from "./PriceAlertForm";

type State = { status: "idle" | "sending" } | { status: "done"; confirm: boolean } | { status: "error"; message: string };

export function WeeklyDropsBox({
  site,
  region,
  siteName,
  placement,
  className,
  buttonClassName,
}: {
  /** this site's key in the alert service ("dex", "mtg", …) */
  site: string;
  /** the visitor's region, as the page shows it ("US", "UK", …) */
  region: string;
  siteName: string;
  /** where the box sits, for the sign-up event ("home", "deals", …) */
  placement: string;
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

  return (
    <div className={className} data-weekly-box={placement}>
      <div style={{ border: "1px solid rgba(127,127,127,.35)", borderRadius: 14, padding: "16px 18px" }}>
        {state.status === "done" ? (
          <p role="status" style={{ margin: 0, minHeight: 76 }}>
            <strong>{state.confirm ? "Check your inbox to confirm." : "Done. You're on the weekly email."}</strong>
            <span style={{ display: "block", fontSize: 13, opacity: 0.8, marginTop: 4 }}>
              {state.confirm ? "One click in the email we just sent and the weekly price drops come to you." : "The next edition comes within about a week."}
            </span>
          </p>
        ) : (
          <form onSubmit={submit} style={{ minHeight: 76 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>This week&rsquo;s biggest price drops, by email</p>
            <p style={{ margin: "2px 0 10px", fontSize: 13, opacity: 0.8 }}>
              One email a week from {siteName}: the products that fell most at {region} stores. Free, no account.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <label htmlFor={`wd-email-${placement}`} style={{ position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" }}>
                Your email
              </label>
              <input
                id={`wd-email-${placement}`}
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="Your email address"
                style={{ flex: "1 1 220px", minWidth: 0, boxSizing: "border-box", padding: "10px 12px", border: "1px solid rgba(127,127,127,.45)", borderRadius: 10, background: "transparent", color: "inherit", font: "inherit", fontSize: 16 }}
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
                style={buttonClassName ? undefined : { padding: "10px 18px", borderRadius: 10, border: "1px solid currentColor", background: "transparent", color: "inherit", font: "inherit", fontWeight: 700, cursor: "pointer" }}
              >
                {state.status === "sending" ? "Saving…" : "Email me the drops"}
              </button>
            </div>
            {state.status === "error" && (
              <p role="alert" style={{ fontSize: 13, margin: "8px 0 0", color: "#c0392b" }}>
                {state.message}
              </p>
            )}
            <p style={{ fontSize: 12, opacity: 0.7, margin: "8px 0 0" }}>
              We email once to confirm; every email has a stop link. Sent by our sister site RiftCompare&rsquo;s alert service (
              <a href={ALERT_PRIVACY} style={{ color: "inherit" }}>
                privacy
              </a>
              ).
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
