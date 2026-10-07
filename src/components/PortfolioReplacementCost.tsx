"use client";

import { useState } from "react";
import Link from "next/link";
import { money } from "@/lib/format";
import { trackEvent } from "@/lib/analytics";
import type { BasketPlan, BasketPreview } from "@/lib/basket";
import PlanButton from "./PlanButton";
import { effectiveRegion, readPostagePrefs } from "@/lib/postage-prefs";
import { freePrefix, joinList, planPostageNotes, postagePrefix } from "@/lib/postage-display";
import { useCountry } from "./CountryProvider";

// "What would it cost to buy this collection again?" — the delivered answer.
//
// Asked for directly (feedback cmu24pck9, 2026-09-15): the headline value prices
// each card at the cheapest listing anywhere in the market, which is often one
// far-off store, and postage never appears. This runs the Best-Basket optimiser
// over the whole collection instead, so delivery is counted the way it is
// actually charged — once per store, free where the order clears a store's
// threshold — and shows the gap against the headline.
//
// The TOTAL is free; the store-by-store plan behind it is Premium (2026-09-25).
// The route returns `plan` only to Premium, whose panel links on to Best
// Basket's binder source. Everyone else gets the Premium button (default tier:
// the replacement plan is a Premium-only wall) — never a link named after a
// plan the destination won't show them, which for a Plus member led a paying
// member into a wall (QA, 2026-09-25).
//
// BEHIND A BUTTON, not computed on load: the route it calls reads every in-stock
// listing for every card held, which is a much heavier query than the page's own
// (see the route's header, and the egress rules at the top of lib/db.ts).

interface Result extends BasketPreview {
  plan?: BasketPlan; // Premium only
  valuedCents: number;
  pricedHoldings: number;
  skippedHoldings: number;
  shipping?: {
    regionLabel: string | null; // "the Northeast", "elsewhere in the US"
    regionUnmeasured?: boolean; // "Elsewhere": priced at the highest measured rate
    trackedOnly: boolean;
    measuredAt: string | null;
    measuredTo?: string[];
  };
}

export function PortfolioReplacementCost({ geoRegion = null }: { geoRegion?: string | null }) {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The region came from the visitor's location, not their own pick: say so
  // where it is used. US state-level IP location is unreliable on mobile
  // carriers and VPNs, and a wrong guess shows a lower regional figure.
  const [guessed, setGuessed] = useState(false);
  const { country } = useCountry();

  async function run() {
    setLoading(true);
    setError(null);
    try {
      // Delivery is priced the way Best Basket prices it: each store's measured
      // checkout rate, for the region the buyer picked there (remembered in
      // this browser), else the one their location suggests; neither = each
      // store's highest regional rate. The route drops a key not in the market.
      const prefs = readPostagePrefs(country);
      const region = effectiveRegion(prefs, geoRegion, () => true);
      const q = new URLSearchParams();
      const wasGuessed = !prefs.regionChosen && !!region;
      if (region) q.set("region", region);
      if (prefs.trackedOnly) q.set("tracked", "1");
      const res = await fetch(`/api/portfolio/replacement${q.toString() ? `?${q}` : ""}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't price your collection just now. Try again in a moment.");
        return;
      }
      setResult(data as Result);
      setGuessed(wasGuessed);
      trackEvent("portfolio_replacement_priced", { holdings: (data as Result).pricedHoldings });
    } catch {
      setError("Couldn't reach the pricing service. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  const plan = result?.plan;
  // The delivered total against what the same cards contribute to the headline.
  // Signed both ways on purpose: a collection of cheap cards costs far more to
  // replace than it is "worth", and saying so is the honest answer.
  const gapCents = result ? result.totalCents - result.valuedCents : 0;
  const outOfStock = result ? result.requested - result.covered : 0;

  return (
    <section className="card-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-white">📦 Replacement cost, delivered</h2>
        {result && (
          <button type="button" onClick={run} disabled={loading} className="btn-ghost text-xs">
            {loading ? "Pricing…" : "Re-price"}
          </button>
        )}
      </div>

      {!result && (
        <>
          <p className="mt-2 text-sm text-slate-400">
            Your collection value above is the cheapest <strong className="text-slate-200">item</strong> price for each card — postage
            isn&apos;t in it, and the cheapest copy is often one store on the other side of the country. This prices the whole collection
            the way you&apos;d actually buy it — <strong className="text-slate-200">delivery included</strong>, charged once per store and
            free where an order clears a store&apos;s threshold — by running the Best-Basket optimiser over everything you own.
          </p>
          <div className="mt-3">
            <button type="button" onClick={run} disabled={loading} className="btn-primary text-sm">
              {loading ? "Pricing…" : "Price with delivery →"}
            </button>
          </div>
        </>
      )}

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      {result && (
        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Cards" value={money(result.totalCents - result.shippingCents - result.topUpCents, country)} />
            <Stat label="Delivery" value={money(result.shippingCents, country)} />
            <Stat label="Total delivered" value={money(result.totalCents, country)} cls="text-gold" />
            <Stat
              label="vs. listed value"
              value={`${gapCents >= 0 ? "+" : "−"}${money(Math.abs(gapCents), country)}`}
              cls={gapCents >= 0 ? "text-brand-400" : "text-rose-400"}
            />
          </div>

          <p className="text-sm text-slate-400">
            Re-buying the {result.covered} cop{result.covered === 1 ? "y" : "ies"} in stock today would take{" "}
            <strong className="text-slate-200">{result.storeCount} store{result.storeCount === 1 ? "" : "s"}</strong> and{" "}
            <strong className="text-slate-200">{money(result.shippingCents, country)}</strong> of postage
            {result.topUpCents > 0 && <> plus {money(result.topUpCents, country)} to reach a store&apos;s minimum order</>}
            {(() => {
              // The same notes either way: Premium's from its plan, everyone
              // else's from the route (store counts only, no store names).
              const regionPicked = !!result.shipping?.regionLabel && !result.shipping?.regionUnmeasured;
              const notes = plan ? planPostageNotes(plan, regionPicked, !!result.shipping?.regionUnmeasured) : (result.postageNotes ?? []);
              return notes.length ? ` (${notes.join("; ")})` : "";
            })()}
            .
            {result.savedCents > 0 && (
              <>
                {" "}
                Consolidating onto those stores saves {money(result.savedCents, country)} against buying each card from its own
                cheapest shop.
              </>
            )}
          </p>

          {plan && plan.stores.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="pb-1 font-semibold">Store</th>
                    <th className="pb-1 text-right font-semibold">Cards</th>
                    <th className="pb-1 text-right font-semibold">Subtotal</th>
                    <th className="pb-1 text-right font-semibold">Delivery</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {plan.stores.map((s) => (
                    <tr key={s.key} className="border-t border-ink-800">
                      <td className="py-1.5 font-semibold text-white">{s.name}</td>
                      <td className="py-1.5 text-right">{s.lines.reduce((n, l) => n + l.qty, 0)}</td>
                      <td className="py-1.5 text-right">{money(s.subtotalCents, country)}</td>
                      <td className="py-1.5 text-right" title={s.postage?.label}>
                        {s.freeShipping ? (
                          <span className="text-brand-400">{s.postage?.unmeasuredRegion ? `${freePrefix(s.postage)}free` : "Free"}</span>
                        ) : (
                          <>
                            {postagePrefix(s.postage)}
                            {money(s.shippingCents, country)}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.covered > 0 && (
            <p className="text-sm">
              {plan ? (
                <Link href="/tools/best-basket?source=binder" className="font-semibold text-brand-400 hover:underline">
                  Open it in Best Basket, with every card and its store link →
                </Link>
              ) : (
                <>
                  <span className="text-slate-400">Which store to buy each card from is part of Premium. </span>
                  <PlanButton tier="premium" surface="gate:replacement-plan" className="font-semibold text-gold underline-offset-2 hover:underline">
                    See the store-by-store plan with Premium →
                  </PlanButton>
                </>
              )}
            </p>
          )}

          <div className="space-y-1.5 text-[11px] text-slate-600">
            <p>
              Replacement cost is what re-buying costs, not what your cards are worth — two different numbers, and normally this is the
              higher one. It can land lower: a card nothing stocks today isn&apos;t in the basket at all, though it still counts towards
              the value above. Stores also sell what they have, so a replacement is priced at the listed condition rather than yours — a
              played copy is valued above at its condition multiplier and replaced here at the shop&apos;s price.
            </p>
            <p>
              The split across stores is the best one the optimiser finds, not a proof of the cheapest possible — consolidating orders
              against free-shipping thresholds has no fast exact answer, so it lands close rather than provably first. Store listings
              only: eBay is left out because its postage is quoted per listing and isn&apos;t comparable with a store&apos;s per-order rate.
              Delivery is priced from the nearest order sizes each store&apos;s checkout quoted
              {result.shipping?.measuredAt ? `, measured ${result.shipping.measuredAt}` : ""}
              {result.shipping?.regionLabel && !result.shipping.regionUnmeasured
                ? ` for delivery to ${result.shipping.regionLabel}${guessed ? " (guessed from your location — pick yours in Best Basket)" : ""}`
                : ` — the highest rate we measured${result.shipping?.measuredTo?.length ? ` (to ${joinList(result.shipping.measuredTo)})` : ""}${
                    result.shipping?.regionUnmeasured
                      ? `, since we haven't measured delivery ${result.shipping.regionLabel}${guessed ? " (guessed from your location — pick yours in Best Basket)" : ""}`
                      : " (pick your region in Best Basket)"
                  }`}
              ; &ldquo;est.&rdquo; means not measured (the store, or to your region), &ldquo;from&rdquo; means at least that
              — an order bigger than any we measured, or a region further than any address we measured — and a store&apos;s
              checkout is final.
              {plan && plan.excludedStores.length > 0 && (
                <>
                  {" "}
                  Left out: {plan.excludedStores.map((x) => `${x.name} (${x.reason})`).join("; ")}.
                </>
              )}
              {outOfStock > 0 && (
                <>
                  {" "}
                  {outOfStock} cop{outOfStock === 1 ? "y is" : "ies are"} not in stock at any tracked store that posts to you right now and{" "}
                  {outOfStock === 1 ? "is" : "are"} left out of the total.
                </>
              )}
              {result.skippedHoldings > 0 && (
                <>
                  {" "}
                  Priced on your {result.pricedHoldings} most valuable holdings; {result.skippedHoldings} cheaper{" "}
                  {result.skippedHoldings === 1 ? "one is" : "ones are"} not included.
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg bg-ink-900 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-base font-extrabold ${cls ?? "text-white"}`}>{value}</div>
    </div>
  );
}
