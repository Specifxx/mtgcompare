"use client";

// /[region]/best-basket (lib/basket-server.ts, 2026-11-25): the shortlist's products, split across stores for the lowest delivered
// total. Everyone sees the total and what it saves; a Premium member sees which store to buy each product from, each store's
// shipping and the one-store order. One prompt at most: the Premium panel under the total, never a pop-up.
import { useEffect, useMemo, useState } from "react";
import { onCartChange, readCart, type CartLine } from "@/lib/cart-list";
import { readStored, trackPremium } from "@/lib/premium-member";
import { money } from "@/lib/format";
import type { BasketAlternatives, BasketPlan, BasketStoreGroup } from "@/lib/basket-optimize";
import type { Region } from "@/lib/regions";

interface Summary {
  totalCents: number;
  itemsCents: number;
  shippingCents: number;
  storeCount: number;
  naiveTotalCents: number;
  savedCents: number;
  matchedCards: number;
  coveredCopies: number;
  unbuyable: { name: string; qty: number }[];
  estimated: boolean;
}

interface Answer {
  premium: boolean;
  summary: Summary;
  products: { slug: string; name: string; imageUrl: string | null; qty: number }[];
  missing: string[];
  plan?: BasketPlan;
  alternatives?: BasketAlternatives;
  checkouts?: Record<string, string>;
}

const PAGE = /^\/(au|nz|us|uk|ca|eu|sg)\/p\/([a-z0-9][a-z0-9-]*)\/?$/;

/** The shortlist's products in this region, one line each (the most copies saved from any one store). */
export function basketLinesFrom(cart: CartLine[], region: Region): { slug: string; qty: number }[] {
  const out = new Map<string, number>();
  for (const l of cart) {
    const m = PAGE.exec(l.page ?? "");
    if (!m || m[1] !== region) continue;
    out.set(m[2], Math.max(out.get(m[2]) ?? 0, l.qty));
  }
  return [...out].map(([slug, qty]) => ({ slug, qty }));
}

function shipText(g: BasketStoreGroup, market: string): string {
  if (g.freeShipping) return "Free shipping";
  const p = g.postage;
  const pre = p.beyondMeasured || p.upTo ? "up to " : "";
  return `${pre}${money(g.shippingCents, market)} shipping`;
}

export function BestBasketView({ region, market }: { region: Region; market: string }) {
  const [cart, setCart] = useState<CartLine[] | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    const sync = () => setCart(readCart());
    sync();
    return onCartChange(sync);
  }, []);

  const lines = useMemo(() => basketLinesFrom(cart ?? [], region).map((l) => ({ ...l, qty: qty[l.slug] ?? l.qty })), [cart, region, qty]);
  const key = lines.map((l) => `${l.slug}:${l.qty}`).join("|");

  useEffect(() => {
    if (!lines.length) return;
    let live = true;
    setState("loading");
    fetch(`/api/basket/${region}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, token: readStored()?.t }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<Answer>) : Promise.reject(r.status)))
      .then((a) => {
        if (!live) return;
        setAnswer(a);
        setState("idle");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, region]);

  if (cart === null) return <div className="mt-6" aria-busy="true" />;

  if (!lines.length)
    return (
      <div className="card mt-6 p-5 sm:p-6">
        <p className="font-semibold">Nothing to plan yet</p>
        <p className="mt-2 text-[15px] leading-6 text-muted">
          Tap + Shortlist beside any store&apos;s price on a product page in {region.toUpperCase()}. Best Basket then finds the cheapest way to buy everything on your
          shortlist, shipping included.
        </p>
        <a className="btn btn-primary mt-4" href={`/${region}/sealed`}>
          Browse sealed products
        </a>
      </div>
    );

  const s = answer?.summary;
  const fmt = (c: number) => money(c, market);

  return (
    <div className="mt-6 space-y-5">
      <section className="card p-4 sm:p-5" aria-label="Your list">
        <h2 className="text-base font-bold">Your list</h2>
        <ul className="mt-3 divide-y divide-[var(--line,#e5e7eb)]">
          {lines.map((l) => {
            const p = answer?.products.find((x) => x.slug === l.slug);
            return (
              <li key={l.slug} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[15px]">{p?.name ?? l.slug}</span>
                <label className="flex items-center gap-1 text-sm text-muted">
                  Qty
                  <select
                    className="rounded border px-1 py-0.5"
                    value={l.qty}
                    onChange={(e) => setQty((q) => ({ ...q, [l.slug]: Number(e.target.value) }))}
                    aria-label={`Quantity of ${p?.name ?? l.slug}`}
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-sm text-muted">
          From <a href="/cart" className="font-semibold text-brand hover:underline">your shortlist</a>. Add or remove products there.
        </p>
      </section>

      {state === "error" && <p className="text-sm text-red-600">Couldn&apos;t price your list just now. Try again in a minute.</p>}

      {s && (
        <section className="card p-4 sm:p-5" aria-live="polite" aria-busy={state === "loading"}>
          <div className="eyebrow">Cheapest delivered total</div>
          {s.matchedCards ? (
            <>
              <p className="mt-1 font-display text-3xl font-bold tracking-tight">{fmt(s.totalCents)}</p>
              <p className="mt-1 text-[15px] text-muted">
                {fmt(s.itemsCents)} of products + {s.shippingCents ? fmt(s.shippingCents) : "free"} shipping, from {s.storeCount} store{s.storeCount === 1 ? "" : "s"}
                {s.estimated ? " (shipping is the dearest we measured: the store's checkout is final)" : ""}.
              </p>
              {s.savedCents > 0 && (
                <p className="mt-2 text-[15px] font-semibold text-green-700">
                  Saves {fmt(s.savedCents)} on buying each product at its cheapest store ({fmt(s.naiveTotalCents)} with shipping).
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-[15px]">No store we can price shipping for has these in stock right now.</p>
          )}
          {s.unbuyable.length > 0 && (
            <p className="mt-2 text-sm text-muted">Not in stock at a store we can plan with: {s.unbuyable.map((u) => u.name).join(", ")}.</p>
          )}
        </section>
      )}

      {answer && !answer.premium && s && s.matchedCards > 0 && (
        <section className="card p-4 sm:p-5">
          <h2 className="text-base font-bold">See which store to buy each one from</h2>
          <p className="mt-1 text-[15px] leading-6 text-muted">
            MTG Compare Premium shows the store-by-store plan behind this total, with each store&apos;s shipping, the best one-store order and a buy button per
            product. The cheapest price of every product stays free on its own page.
          </p>
          <a className="btn btn-primary mt-3" href="/premium?from=best-basket" onClick={() => trackPremium("premium_cta", { surface: "best-basket" })}>
            Try Premium free for 14 days
          </a>
        </section>
      )}

      {answer?.premium && answer.plan && answer.plan.stores.length > 0 && (
        <section aria-label="Your plan" className="space-y-3">
          <h2 className="text-lg font-bold">Your plan</h2>
          {answer.plan.stores.map((g) => (
            <div key={g.key} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-bold">{g.name}</h3>
                <span className="text-sm text-muted">
                  {fmt(g.subtotalCents)} + {shipText(g, market)}
                </span>
              </div>
              <ul className="mt-2 space-y-2">
                {g.lines.map((l) => (
                  <li key={l.cardId} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 text-[15px]">
                      {l.qty > 1 ? `${l.qty} × ` : ""}
                      {l.name}
                    </span>
                    <span className="text-[15px] font-semibold tabular-nums">{fmt(l.unitCents * l.qty)}</span>
                    <a className="btn btn-primary px-3 py-1 text-sm" href={l.url} target="_blank" rel="sponsored noopener">
                      Buy
                    </a>
                  </li>
                ))}
              </ul>
              {answer.checkouts?.[g.key] && (
                <a className="btn btn-soft mt-3 w-full justify-center text-sm sm:w-auto" href={answer.checkouts[g.key]} target="_blank" rel="noopener">
                  Open {g.name}&apos;s checkout with all {g.lines.length}
                </a>
              )}
              {g.postage.freeFromCents != null && !g.freeShipping && (
                <p className="mt-2 text-sm text-muted">Free shipping from {fmt(g.postage.freeFromCents)} at this store.</p>
              )}
            </div>
          ))}
          {answer.alternatives?.singleStore && answer.plan.storeCount > 1 && (
            <p className="text-sm text-muted">
              Everything from one store: {fmt(answer.alternatives.singleStore.totalCents)} at {answer.alternatives.singleStore.stores[0]?.name}.
            </p>
          )}
          {answer.plan.excludedStores.length > 0 && (
            <p className="text-sm text-muted">
              {answer.plan.excludedStores.length} other store{answer.plan.excludedStores.length === 1 ? "" : "s"} with these in stock {answer.plan.excludedStores.length === 1 ? "is" : "are"} left out because we haven&apos;t measured {answer.plan.excludedStores.length === 1 ? "its" : "their"} shipping yet.
            </p>
          )}
        </section>
      )}

      <p className="text-sm leading-6 text-muted">
        Best Basket uses only in-stock store prices our import read in the last 48 hours, never pre-orders, eBay or TCGplayer. Each store is its own checkout,
        and its checkout shows the final price and shipping.
      </p>
    </div>
  );
}
