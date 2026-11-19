"use client";

import { useState } from "react";
import { formatMoney, type ValuedItem } from "@/lib/vault";

// Free collection check-up (owner's go, 19 Nov 2026; DECISIONS.md "Collection check-up test"). Shown to a visitor with
// CHECKUP_MIN_ITEMS+ items. One tap sends the list (names, quantities, today's values) and an email to RiftCompare's
// shared /api/checkup, which keeps the request and tells the team; nothing is stored here and no AI is called.
// The team writes the check-up by hand. Read on 3 Dec 2026.
export const CHECKUP_SERVICE = "https://riftcompare.com/api/checkup";
export const CHECKUP_MIN_ITEMS = 10;

const field: React.CSSProperties = {
  width: "100%", minHeight: "2.5rem", padding: "0 0.75rem", borderRadius: "0.6rem", font: "inherit", fontSize: "16px",
  color: "inherit", background: "transparent", border: "1px solid color-mix(in srgb, currentColor 28%, transparent)",
};

export function checkupLines(items: ValuedItem[]): string[] {
  return items.map(
    (i) => `${i.qty}x ${i.name} (${i.market}${i.set ? ", single" : ", sealed"})` + (i.nowCents != null ? ` ${formatMoney(i.nowCents, i.currency)} each` : "") + (i.addedCents ? `, ${formatMoney(i.addedCents, i.currency)} when added` : ""),
  );
}

export function CheckupOffer({ items, email: knownEmail }: { items: ValuedItem[]; email?: string | null }) {
  const [email, setEmail] = useState(knownEmail && knownEmail.includes("@") ? knownEmail : "");
  const [goal, setGoal] = useState("");
  const [founder, setFounder] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (items.length < CHECKUP_MIN_ITEMS) return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    try {
      const res = await fetch(CHECKUP_SERVICE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ items: checkupLines(items), email, goal, founder, market: items[0]?.market }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Something went wrong.");
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  if (state === "done")
    return (
      <section className="ce-vault-total" aria-label="Free collection check-up">
        <strong>Thanks, your check-up is on its way.</strong>
        <p className="ce-vault-muted">We&apos;ll email it to {email} within two days.</p>
      </section>
    );

  return (
    <form className="ce-vault-total" aria-label="Free collection check-up" onSubmit={send}>
      <strong style={{ fontSize: "1.05rem" }}>Free collection check-up</strong>
      <p style={{ margin: 0, fontSize: "0.9rem" }}>
        We&apos;ll look through your {items.length} items and email you a short note: which cards are worth grading, what has moved
        lately, and what on your list is at a good price right now. Written by our team, every price from this site.
      </p>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" maxLength={200} style={field} aria-label="Your email" />
      <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Anything to look at? e.g. should I grade my foil Sheoldred? (optional)" maxLength={600} style={field} aria-label="Anything to look at (optional)" />
      <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontSize: "0.875rem" }}>
        <input type="checkbox" checked={founder} onChange={(e) => setFounder(e.target.checked)} style={{ marginTop: "0.25rem" }} />
        <span>
          I&apos;d like this every week. Save me the founder price, <strong>US$5.99/month</strong> instead of US$7.99, if it launches. No charge now.
        </span>
      </label>
      {error && <p style={{ color: "#dc2626", margin: 0, fontSize: "0.875rem" }}>{error}</p>}
      <button type="submit" className="ce-vault-btn" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Get my free check-up"}
      </button>
    </form>
  );
}
