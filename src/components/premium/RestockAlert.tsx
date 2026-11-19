"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { track } from "@vercel/analytics";
import { readStored, setRestockWatch, writeStored } from "@/lib/premium-member";
import { ALERT_PRIVACY, ALERT_SERVICE } from "@/components/PriceAlertForm";
import { usePremium } from "./usePremium";

/**
 * "Tell me when it's back in stock", under the price alert on a product with no in-stock price in the region. Free for everyone
 * since 2026-11-18 (owner, retention programme): members tap once; everyone else gives an email, on RiftCompare's alert service
 * with the same double opt-in as a price alert (one confirmation email, nothing else until the click). Inline only, no pop-up.
 * Event `restock_signup` {member, region}.
 */
export function RestockAlert({ site, productId, region }: { site: string; productId: string; region: string }) {
  const v = usePremium();
  // One tap for anyone signed in, a free account too (2026-11-19: alerts stay free); the token names the address.
  const signedIn = v.status === "member" || v.status === "free";
  const [s, setS] = useState<{ t: "idle" | "busy" } | { t: "done"; confirm: boolean } | { t: "error"; m: string }>({ t: "idle" });
  if (v.status === "loading") return null;

  async function member() {
    const cur = readStored();
    if (!cur) return;
    setS({ t: "busy" });
    const r = await setRestockWatch(cur.t, productId, region);
    if (r.ok) {
      track("restock_signup", { member: v.status === "member" ? "yes" : "free", region });
      setS({ t: "done", confirm: false });
    } else {
      if (/sign in again/i.test(r.message)) writeStored(null);
      setS({ t: "error", m: r.message });
    }
  }

  async function visitor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (String(f.get("website") ?? "")) return setS({ t: "done", confirm: true });
    setS({ t: "busy" });
    try {
      const r = await fetch(ALERT_SERVICE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, productId, region, email: String(f.get("email") ?? ""), kind: "restock" }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; status?: string; error?: string };
      if (r.ok && j.ok) {
        track("restock_signup", { member: "no", region });
        setS({ t: "done", confirm: j.status !== "active" });
      } else setS({ t: "error", m: j.error || "Couldn't save that. Please try again." });
    } catch {
      setS({ t: "error", m: "Couldn't save that. Check your connection and try again." });
    }
  }

  if (s.t === "done") {
    return (
      <p className="mt-3 text-sm" aria-live="polite" data-restock>
        {s.confirm ? "Check your inbox: one click in the email we just sent and we'll tell you when it's back." : "Done. We'll email you when it's back in stock."}
        {signedIn && (
          <>
            {" "}
            <Link className="underline" href="/watches">My watches</Link>
          </>
        )}
      </p>
    );
  }

  return (
    <div className="mt-3 text-sm" data-restock>
      {signedIn ? (
        <button type="button" className="btn-ghost" disabled={s.t === "busy"} onClick={member}>Tell me when it&rsquo;s back in stock</button>
      ) : (
        <form onSubmit={visitor}>
          <p className="font-semibold">Sold out here. Get an email when it&rsquo;s back in stock.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <label htmlFor={`restock-${productId}`} className="sr-only">Your email</label>
            <input id={`restock-${productId}`} name="email" type="email" required autoComplete="email" placeholder="Your email address" className="min-w-0 flex-[1_1_200px] rounded-lg border border-line bg-transparent px-3 py-2 text-base" />
            <div aria-hidden="true" style={{ position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" }}>
              <label>
                Website <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <button type="submit" className="btn-ghost" disabled={s.t === "busy"}>{s.t === "busy" ? "Saving…" : "Email me"}</button>
          </div>
          <p className="mt-1 text-xs text-muted">
            Free, no account. We email once to confirm; every email has a stop link. Sent by our sister site RiftCompare&rsquo;s alert service (<a className="underline" href={ALERT_PRIVACY}>privacy</a>).
          </p>
        </form>
      )}
      {s.t === "error" && <p className="mt-1" role="alert">{s.m}</p>}
    </div>
  );
}
