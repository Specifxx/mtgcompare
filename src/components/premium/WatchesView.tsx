"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadWatches, PREMIUM_SIGN_IN, readStored, writeStored, type Watch } from "@/lib/premium-member";

const SYMBOL: Record<string, string> = { US: "US$", CA: "CA$", AU: "A$", NZ: "NZ$", SG: "S$", UK: "£", EU: "€" };
const money = (c: number, region: string) => `${SYMBOL[region] ?? ""}${(c / 100).toFixed(2)}`;

/** /watches: the member's price and back-in-stock watches, with stop buttons. Browser-only. */
export function WatchesView() {
  const [state, setState] = useState<{ s: "loading" } | { s: "out" } | { s: "error" } | { s: "ok"; premium: boolean; watches: Watch[] }>({ s: "loading" });

  async function load(remove?: string) {
    const cur = readStored();
    if (!cur) return setState({ s: "out" });
    const r = await loadWatches(cur.t, remove);
    if (r.kind === "invalid") {
      writeStored(null);
      return setState({ s: "out" });
    }
    setState(r.kind === "ok" ? { s: "ok", premium: r.premium, watches: r.watches } : { s: "error" });
  }
  useEffect(() => {
    void load();
  }, []);

  if (state.s === "loading") return <p className="text-muted" aria-live="polite">Loading your watches…</p>;
  if (state.s === "out") {
    return (
      <p>
        Sign in to see your watches. <a className="underline" href={PREMIUM_SIGN_IN}>Sign in</a> or <Link className="underline" href="/premium">see Premium</Link>.
      </p>
    );
  }
  if (state.s === "error") return <p>Couldn&rsquo;t load your watches. Try again in a minute.</p>;
  const { watches, premium } = state;
  return (
    <div>
      {!premium && (
        <p className="card mb-4 p-4 text-sm">
          Every price alert you set with this email is listed here, on any device. <Link className="underline" href="/premium">Premium</Link> raises the limit to 200 alerts and hides the banner ads.
        </p>
      )}
      {watches.length === 0 ? (
        <p className="text-muted">No watches yet. On any product page, tap &ldquo;Email me when the price drops&rdquo; and it shows up here.</p>
      ) : (
        <ul className="grid gap-3">
          {watches.map((w) => (
            <li key={w.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">
                  {w.path ? <a className="hover:underline" href={w.path.startsWith("/") ? w.path.replace("{r}", w.region.toLowerCase()) : "#"}>{w.name || "Product"}</a> : w.name || "New watch (first check runs on the next daily update)"}
                </p>
                <p className="text-sm text-muted">
                  {w.kind === "restock" ? "Back-in-stock watch" : `Price alert at ${w.targetCents ? money(w.targetCents, w.region) : ""} or less`} · {w.region}
                  {w.priceCents ? ` · lowest in-stock price now ${money(w.priceCents, w.region)}` : w.name ? " · sold out right now" : ""}
                  {w.notifiedAt ? ` · last emailed ${new Date(w.notifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                </p>
              </div>
              <button type="button" className="btn-ghost" onClick={() => void load(w.id)}>Stop watching</button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-sm text-muted">Emails come from RiftCompare&rsquo;s alert service, checked once a day after the price update. Prices are the lowest in-stock store price, before postage.</p>
    </div>
  );
}
