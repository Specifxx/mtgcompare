"use client";

// /cart: the visitor's list, one card per store, each with ONE button that opens that
// store's checkout holding every cartable line (src/lib/cart-list.ts). On open it
// re-checks each Shopify line's live price and stock from the store itself, drops a
// sold-out line from the checkout, and shows a changed price. Manual lines (stores
// whose commission rides on their own product link) keep that link.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  cartRef,
  checkoutUrl,
  formatMoney,
  groupByStore,
  onCartChange,
  productJsUrl,
  readCart,
  readVariant,
  setQty,
  writeCart,
  type CartLine,
  type LiveCheck,
} from "@/lib/cart-list";
import { CART_SITE } from "./cart-config";
import { CartIcon } from "./CartIcon";

type Checks = Record<string, LiveCheck>;

async function checkAll(lines: CartLine[]): Promise<Checks> {
  const out: Checks = {};
  const byProduct = new Map<string, CartLine[]>();
  for (const l of lines) {
    const js = l.variantId ? productJsUrl(l.productUrl) : null;
    if (!js) continue;
    byProduct.set(js, [...(byProduct.get(js) ?? []), l]);
  }
  const jobs = [...byProduct.entries()];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const [js, ls] = jobs[next++];
      let body: unknown = null;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(js, { signal: ctrl.signal, credentials: "omit" });
        clearTimeout(t);
        body = r.ok ? await r.json() : r.status === 404 ? { variants: [] } : null;
      } catch {
        body = null;
      }
      for (const l of ls) out[l.id] = readVariant(body, l.variantId!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
  return out;
}

export function CartListView() {
  const [lines, setLines] = useState<CartLine[] | null>(null);
  const [checks, setChecks] = useState<Checks>({});
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [checking, setChecking] = useState(false);
  const ref = useRef<string>("");

  useEffect(() => {
    ref.current = cartRef(CART_SITE.replace(/\..*$/, ""));
    const sync = () => setLines(readCart());
    sync();
    return onCartChange(sync);
  }, []);

  const checkKey = (lines ?? []).map((l) => l.id).join("|");
  useEffect(() => {
    if (!lines || !lines.some((l) => l.variantId && l.productUrl)) return;
    let live = true;
    setChecking(true);
    checkAll(lines).then((c) => {
      if (!live) return;
      setChecks(c);
      // "Last checked" only when a store actually answered.
      setCheckedAt(Object.values(c).some((x) => x.status !== "unknown") ? new Date() : null);
      setChecking(false);
    });
    return () => {
      live = false;
    };
    // Re-check when lines are added or removed, not on a quantity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);

  const groups = useMemo(() => groupByStore(lines ?? []), [lines]);
  const update = (id: string, qty: number) => writeCart(setQty(readCart(), id, qty));

  if (lines === null) return <div className="ce-cart-page" aria-busy="true" />;

  if (!lines.length)
    return (
      <div className="ce-cart-page">
        <div className="ce-cart-empty">
          <CartIcon size={36} />
          <p className="ce-cart-strong">Your cart is empty</p>
          <p>Tap the cart button beside any store&apos;s price to add it. Add from as many stores as you like: each store gets its own checkout button here.</p>
          <a className="ce-cart-btn" href="/">
            Find prices
          </a>
        </div>
      </div>
    );

  // "2 stores · 5 items · A$212.00 before postage": one figure per currency, since
  // prices are never converted, and before postage, since each store charges its own.
  const soldOutId = (l: CartLine) => checks[l.id]?.status === "soldout" || checks[l.id]?.status === "missing";
  const totals = new Map<string, number>();
  for (const l of lines) if (!soldOutId(l)) totals.set(l.currency, (totals.get(l.currency) ?? 0) + (checks[l.id]?.priceCents ?? l.priceCents) * l.qty);
  const items = lines.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="ce-cart-page">
      <p className="ce-cart-summary">
        <b>
          {groups.length} store{groups.length === 1 ? "" : "s"} · {items} item{items === 1 ? "" : "s"} ·{" "}
          {[...totals.entries()].map(([c, v]) => formatMoney(v, c)).join(" + ")}
        </b>{" "}
        before postage
      </p>
      <p className="ce-cart-note">
        {checking
          ? "Checking prices and stock at each store…"
          : checkedAt
            ? `Prices last checked ${checkedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
            : "Prices are as they were when you added them."}{" "}
        Each store is its own checkout, paid on the store&apos;s own site (we never take payment). The store charges its live price and postage, and opening a store&apos;s cart replaces anything already in your cart there.
      </p>

      {groups.map((g) => {
        const live = (l: CartLine) => checks[l.id];
        const soldOut = (l: CartLine) => live(l)?.status === "soldout" || live(l)?.status === "missing";
        const price = (l: CartLine) => live(l)?.priceCents ?? l.priceCents;
        const cartable = g.lines.filter((l) => l.variantId && l.base && !soldOut(l));
        const manual = g.lines.filter((l) => !l.variantId || !l.base);
        const subtotal = g.lines.filter((l) => !soldOut(l)).reduce((s, l) => s + price(l) * l.qty, 0);
        const url = checkoutUrl(cartable, CART_SITE, ref.current);
        const units = cartable.reduce((s, l) => s + l.qty, 0);
        return (
          <section key={g.key} className="ce-cart-store" aria-label={g.storeName}>
            <header className="ce-cart-store-head">
              <h2>{g.storeName}</h2>
              <span className="ce-cart-sub">
                Subtotal <b>{formatMoney(subtotal, g.currency)}</b> + postage
              </span>
            </header>
            <ul>
              {g.lines.map((l) => {
                const c = live(l);
                const out = soldOut(l);
                const changed = c?.priceCents != null && c.priceCents !== l.priceCents;
                return (
                  <li key={l.id} className={out ? "is-out" : undefined}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- store and card photos are hotlinked, never optimised */}
                    {l.image ? <img src={l.image} alt={l.title} loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : <span className="ce-cart-noimg" />}
                    <div className="ce-cart-main">
                      <a href={l.page || l.href} className="ce-cart-title">
                        {l.title}
                      </a>
                      {l.detail && <span className="ce-cart-detail">{l.detail}</span>}
                      <span className="ce-cart-detail">
                        {out ? (
                          <b className="ce-cart-warn">Sold out now: left out of the checkout</b>
                        ) : changed ? (
                          <>
                            Now {formatMoney(c!.priceCents!, g.currency)} <s>{formatMoney(l.priceCents, g.currency)}</s>
                          </>
                        ) : c?.status === "ok" ? (
                          "In stock now"
                        ) : !l.variantId ? (
                          "Buy on the store's page"
                        ) : null}
                      </span>
                    </div>
                    <div className="ce-cart-qty" aria-label="Quantity">
                      <button type="button" onClick={() => update(l.id, l.qty - 1)} aria-label={l.qty > 1 ? "One fewer" : `Remove ${l.title}`}>
                        {l.qty > 1 ? "−" : "×"}
                      </button>
                      <span>{l.qty}</span>
                      <button type="button" onClick={() => update(l.id, l.qty + 1)} aria-label="One more">
                        +
                      </button>
                    </div>
                    <div className="ce-cart-price">{formatMoney(price(l) * l.qty, g.currency)}</div>
                  </li>
                );
              })}
            </ul>
            <footer className="ce-cart-store-foot">
              {url && (
                <a
                  className="ce-cart-btn"
                  href={url}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  onClick={() => {
                    try {
                      (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "cart_checkout", {
                        store: g.store,
                        value: cartable.reduce((s, l) => s + price(l) * l.qty, 0) / 100,
                        currency: g.currency,
                        items: units,
                      });
                    } catch {
                      /* best-effort */
                    }
                  }}
                >
                  Check out at {g.storeName} ({units} item{units === 1 ? "" : "s"}) ↗
                </a>
              )}
              {manual.map((l) => (
                <a key={l.id} className="ce-cart-btn is-ghost" href={l.href} target="_blank" rel="sponsored nofollow noopener noreferrer">
                  Open {l.title.length > 40 ? `${l.title.slice(0, 38)}…` : l.title} at {g.storeName} ↗
                </a>
              ))}
            </footer>
          </section>
        );
      })}

      <button
        type="button"
        className="ce-cart-clear"
        onClick={() => {
          if (confirm("Empty your cart?")) writeCart([]);
        }}
      >
        Empty cart
      </button>
    </div>
  );
}
