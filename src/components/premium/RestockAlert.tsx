"use client";

import Link from "next/link";
import { useState } from "react";
import { readStored, setRestockWatch, writeStored } from "@/lib/premium-member";
import { usePremium } from "./usePremium";

/**
 * "Tell me when it's back in stock", under the price alert on a product with no in-stock price in the region (Premium).
 * Members tap once; everyone else gets a quiet line to /premium. Inline only, no pop-up.
 */
export function RestockAlert({ productId, region }: { productId: string; region: string }) {
  const v = usePremium();
  const [s, setS] = useState<{ t: "idle" | "busy" } | { t: "done" } | { t: "error"; m: string }>({ t: "idle" });
  if (v.status === "loading") return null;

  async function go() {
    const cur = readStored();
    if (!cur) return;
    setS({ t: "busy" });
    const r = await setRestockWatch(cur.t, productId, region);
    if (r.ok) setS({ t: "done" });
    else {
      if (/sign in again/i.test(r.message)) writeStored(null);
      setS({ t: "error", m: r.message });
    }
  }

  return (
    <div className="mt-3 text-sm" data-restock>
      {v.status === "member" ? (
        s.t === "done" ? (
          <p aria-live="polite">Done. We&rsquo;ll email you when it&rsquo;s back in stock. <Link className="underline" href="/watches">My watches</Link></p>
        ) : (
          <>
            <button type="button" className="btn-ghost" disabled={s.t === "busy"} onClick={go}>Tell me when it&rsquo;s back in stock</button>
            {s.t === "error" && <p className="mt-1" role="alert">{s.m}</p>}
          </>
        )
      ) : (
        <p className="text-muted">
          Sold out here. <Link className="underline" href="/premium">Premium members</Link> get an email when it&rsquo;s back in stock.
        </p>
      )}
    </div>
  );
}
