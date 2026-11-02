"use client";

// "Email me when it drops below": the price alert form every Compare Empire
// sister site shares (DECISIONS.md, "Price alerts through RiftCompare's shared
// service", 2026-11-02). This site keeps no address: the form posts to
// RiftCompare's alert service, which emails a confirmation first and then
// checks this site's own /alert-feed.json once a day. Only the site key,
// product id, region, price and address are sent. Inline only, under a quiet
// link (no pop-up, owner 2026-10-27). Styling is inherited (currentColor and
// translucent borders) so the same file sits on light and dark sites; a site
// passes its own button class. The same file is copied into every site.
import { useState, type CSSProperties, type FormEvent } from "react";

export const ALERT_SERVICE = "https://riftcompare.com/api/sister-alerts";
export const ALERT_PRIVACY = "https://riftcompare.com/privacy#sister-alerts";

const box: CSSProperties = { border: "1px solid rgba(127,127,127,.35)", borderRadius: 10, padding: "12px 14px", marginTop: 8 };
const field: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid rgba(127,127,127,.45)", borderRadius: 8, background: "transparent", color: "inherit", font: "inherit", fontSize: 14 };
const label: CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "10px 0 4px" };
const hint: CSSProperties = { fontSize: 12, opacity: 0.75, margin: "8px 0 0" };
const defaultButton: CSSProperties = { marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid currentColor", background: "transparent", color: "inherit", font: "inherit", fontWeight: 600, cursor: "pointer" };
const hidden: CSSProperties = { position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" };

const SYMBOL: Record<string, string> = { US: "US$", CA: "CA$", AU: "A$", NZ: "NZ$", SG: "S$", UK: "£", EU: "€" };

/** 10% under today's price, rounded down to a whole unit (the service's suggestedTarget). */
export function suggestTarget(cents: number): number {
  return Math.max(100, Math.floor((cents * 0.9) / 100) * 100);
}

/** "12.5" / "12,50" / "£12" → 1250; null when it isn't a positive amount. */
export function parseAmount(s: string): number | null {
  const t = s.replace(/[^\d.,]/g, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const c = Math.round(Number(t) * 100);
  return c > 0 && c < 100_000_000 ? c : null;
}

type State = { status: "idle" | "sending" } | { status: "done"; confirm: boolean } | { status: "error"; message: string };

export function PriceAlertForm({
  site,
  productId,
  region,
  priceCents,
  className,
  buttonClassName,
  summary = "Email me when the price drops",
}: {
  /** this site's key in the alert service ("mtg", "gundam", …) */
  site: string;
  productId: string;
  /** the visitor's region, as the page shows it */
  region: string;
  /** the lowest in-stock store price in that region today, if any */
  priceCents: number | null;
  className?: string;
  buttonClassName?: string;
  summary?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "idle" });
  const sym = SYMBOL[region] ?? "";
  const start = priceCents ? (suggestTarget(priceCents) / 100).toFixed(0) : "";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (String(f.get("website") ?? "")) return setState({ status: "done", confirm: true });
    const targetCents = parseAmount(String(f.get("target") ?? ""));
    if (!targetCents) return setState({ status: "error", message: "Enter the price you want, like 45 or 45.50." });
    setState({ status: "sending" });
    try {
      const r = await fetch(ALERT_SERVICE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, productId, region, email: String(f.get("email") ?? ""), targetCents }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; status?: string; error?: string };
      setState(r.ok && j.ok ? { status: "done", confirm: j.status !== "active" } : { status: "error", message: j.error || "Couldn't save your alert. Please try again." });
    } catch {
      setState({ status: "error", message: "Couldn't save your alert. Check your connection and try again." });
    }
  }

  if (!open) {
    return (
      <div className={className}>
        <button type="button" onClick={() => setOpen(true)} style={{ background: "none", border: 0, padding: 0, color: "inherit", font: "inherit", fontSize: 14, fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>
          {summary}
        </button>
      </div>
    );
  }
  if (state.status === "done") {
    return (
      <div className={className} style={box} role="status">
        <strong>{state.confirm ? "Check your inbox to confirm." : "Done. Your alert is on."}</strong>
        <p style={{ ...hint, opacity: 0.85 }}>
          {state.confirm ? "One click in the email we just sent, and we'll email you when a store reaches your price." : "We check prices once a day and email you when a store reaches your price."}
        </p>
      </div>
    );
  }
  return (
    <form className={className} style={box} onSubmit={submit}>
      <strong style={{ fontSize: 15 }}>Email me when the price drops</strong>
      <label style={label} htmlFor={`pa-target-${productId}`}>
        When a {region} store has it for {sym || "this price"} or less
      </label>
      <input id={`pa-target-${productId}`} name="target" inputMode="decimal" required defaultValue={start} placeholder={start || "45"} style={field} autoComplete="off" />
      <label style={label} htmlFor={`pa-email-${productId}`}>
        Your email
      </label>
      <input id={`pa-email-${productId}`} name="email" type="email" required autoComplete="email" placeholder="Your email address" style={field} />
      <div style={hidden} aria-hidden="true">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <button type="submit" disabled={state.status === "sending"} className={buttonClassName} style={buttonClassName ? { marginTop: 12 } : defaultButton}>
        {state.status === "sending" ? "Saving…" : "Set price alert"}
      </button>
      {state.status === "error" && (
        <p role="alert" style={{ ...hint, opacity: 1, color: "#c0392b" }}>
          {state.message}
        </p>
      )}
      <p style={hint}>
        Free, no account. We email you once to confirm, then only when a store reaches your price; every email has a stop link, and alerts end after six months. Sent by our sister site RiftCompare&rsquo;s alert service (<a href={ALERT_PRIVACY} style={{ color: "inherit" }}>privacy</a>).
      </p>
    </form>
  );
}
