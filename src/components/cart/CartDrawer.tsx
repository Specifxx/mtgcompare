"use client";

// THE CART DRAWER (owner, 2026-11-17): the cart slides in from the right on the page the visitor
// is on, no navigation, on desktop and phone. Opened only by the visitor: the header cart button,
// or the add button on a price row (a pop-up for a new visitor never opens it; nothing can add a
// line but a click). "Check out" opens every store's checkout in its own tab from that click,
// each with the row's own affiliate-tagged link; lines from one Shopify store share ONE checkout
// (src/lib/cart-checkout.ts). A browser that blocks the extra tabs gets the same links as a list.
// The cart lives in this browser only (src/lib/cart-list.ts); /cart stays as the no-script page.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cartRef, formatMoney, groupByStore, onCartChange, readCart, setQty, writeCart, type CartLine } from "@/lib/cart-list";
import { buildCheckout, checkLines, isGone, openAll, type CheckoutItem, type Checks } from "@/lib/cart-checkout";
import { CART_SITE } from "./cart-config";
import { CartIcon } from "./CartIcon";

function track(name: string, params: Record<string, unknown>) {
  try {
    (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", name, params);
  } catch {
    /* analytics is best-effort */
  }
}

let drawerOwner: symbol | null = null;

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [checks, setChecks] = useState<Checks>({});
  const [checking, setChecking] = useState(false);
  const [blocked, setBlocked] = useState<CheckoutItem[] | null>(null);
  const [opened, setOpened] = useState(0);
  // One drawer draws, whichever header button asked (a header can mount the button twice).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (drawerOwner) return;
    const me = Symbol("cart-drawer");
    drawerOwner = me;
    setMounted(true);
    return () => {
      if (drawerOwner === me) drawerOwner = null;
    };
  }, []);
  const ref = useRef("");
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ref.current = cartRef(CART_SITE.replace(/\..*$/, ""));
    const sync = () => setLines(readCart());
    sync();
    return onCartChange(sync);
  }, []);

  // Live price and stock from each Shopify store, each time the drawer opens or a line is added or removed.
  const key = lines.map((l) => l.id).join("|");
  useEffect(() => {
    if (!open || !lines.some((l) => l.variantId && l.productUrl)) return;
    let live = true;
    setChecking(true);
    checkLines(lines).then((c) => {
      if (!live) return;
      setChecks(c);
      setChecking(false);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  // Escape closes; the page behind stops scrolling; focus goes in and comes back.
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      setBlocked(null);
      setOpened(0);
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  const groups = useMemo(() => groupByStore(lines), [lines]);
  const items = useMemo(() => buildCheckout(lines, checks, CART_SITE, ref.current), [lines, checks]);
  const update = (id: string, qty: number) => writeCart(setQty(readCart(), id, qty));

  const price = (l: CartLine) => checks[l.id]?.priceCents ?? l.priceCents;
  const totals = new Map<string, number>();
  for (const l of lines) if (!isGone(checks[l.id])) totals.set(l.currency, (totals.get(l.currency) ?? 0) + price(l) * l.qty);
  const units = lines.filter((l) => !isGone(checks[l.id])).reduce((s, l) => s + l.qty, 0);

  const checkout = () => {
    // Everything is opened from this one click, so a popup blocker has the click to go on.
    const r = openAll(items);
    setOpened(r.opened.length);
    setBlocked(r.blocked.length ? r.blocked : null);
    for (const it of r.opened) track("cart_checkout", { store: it.storeName, value: it.cents / 100, currency: it.currency, items: it.units, via: "drawer" });
  };

  // Portalled to <body>: the header has a backdrop-filter, which would otherwise become the containing block of a fixed drawer.
  if (!mounted) return null;
  return createPortal(
    <div className={`cd-root${open ? " is-open" : ""}`} aria-hidden={!open} {...(open ? {} : { inert: true })}>
      <div className="cd-backdrop" onClick={onClose} />
      <div ref={panel} className="cd-panel" role="dialog" aria-modal="true" aria-label="Your cart">
        <header className="cd-head">
          <h2>
            Your cart{units > 0 && <span className="cd-count"> · {units} item{units === 1 ? "" : "s"}</span>}
          </h2>
          <button ref={closeBtn} type="button" className="cd-x" onClick={onClose} aria-label="Close cart">
            ×
          </button>
        </header>

        {!lines.length ? (
          <div className="cd-empty">
            <CartIcon size={34} />
            <p className="cd-strong">Your cart is empty</p>
            <p>Tap Add to cart beside any store&apos;s price. Add from as many stores as you like and check out all of them in one go.</p>
            <button type="button" className="cd-btn" onClick={onClose}>
              Keep browsing
            </button>
          </div>
        ) : (
          <>
            <div className="cd-body">
              {groups.map((g) => {
                const sub = g.lines.filter((l) => !isGone(checks[l.id])).reduce((s, l) => s + price(l) * l.qty, 0);
                const one = items.find((i) => i.key === `${g.key}#store`);
                return (
                  <section key={g.key} className="cd-store" aria-label={g.storeName}>
                    <header>
                      <h3>{g.storeName}</h3>
                      <span>
                        <b>{formatMoney(sub, g.currency)}</b> + postage
                      </span>
                    </header>
                    {one && one.units > 1 && <p className="cd-note">{one.units} items, one checkout at {g.storeName}</p>}
                    <ul>
                      {g.lines.map((l) => {
                        const c = checks[l.id];
                        const gone = isGone(c);
                        const changed = c?.priceCents != null && c.priceCents !== l.priceCents;
                        return (
                          <li key={l.id} className={gone ? "is-out" : undefined}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- store and card photos are hotlinked, never optimised */}
                            {l.image ? <img src={l.image} alt={l.title} loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : <span className="cd-noimg" />}
                            <div className="cd-main">
                              <a href={l.page || l.href} className="cd-title" onClick={onClose}>
                                {l.title}
                              </a>
                              {l.detail && <span className="cd-detail">{l.detail}</span>}
                              <span className="cd-detail">
                                {gone ? (
                                  <b className="cd-warn">Sold out now, left out of checkout</b>
                                ) : changed ? (
                                  <>
                                    Now {formatMoney(c!.priceCents!, g.currency)} <s>{formatMoney(l.priceCents, g.currency)}</s>
                                  </>
                                ) : !l.priceCents ? (
                                  `See today's price at ${g.storeName}`
                                ) : (
                                  <>{formatMoney(price(l), g.currency)} each</>
                                )}
                              </span>
                              <div className="cd-row2">
                                <span className="cd-qty">
                                  <button type="button" onClick={() => update(l.id, l.qty - 1)} aria-label={l.qty > 1 ? `One fewer ${l.title}` : `Remove ${l.title}`}>
                                    −
                                  </button>
                                  <span aria-live="polite">{l.qty}</span>
                                  <button type="button" onClick={() => update(l.id, l.qty + 1)} aria-label={`One more ${l.title}`}>
                                    +
                                  </button>
                                </span>
                                <button type="button" className="cd-rm" onClick={() => update(l.id, 0)} aria-label={`Remove ${l.title} from cart`}>
                                  Remove
                                </button>
                                <span className="cd-price">{price(l) > 0 ? formatMoney(price(l) * l.qty, g.currency) : "–"}</span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
              <p className="cd-fine">
                {checking ? "Checking prices and stock at each store… " : ""}Each store takes payment on its own site, never us, and adds its own postage. Opening a Shopify store&apos;s checkout replaces anything already in your cart there.
              </p>
              {blocked && (
                <div className="cd-blocked" role="alert">
                  <p className="cd-strong">
                    {opened ? `Opened ${opened} tab${opened === 1 ? "" : "s"}. ` : ""}Your browser blocked {blocked.length} more. Open {blocked.length === 1 ? "it" : "them"} here:
                  </p>
                  <ul>
                    {blocked.map((b) => (
                      <li key={b.key}>
                        <a href={b.url} target="_blank" rel={b.rel} onClick={() => track("cart_checkout", { store: b.storeName, value: b.cents / 100, currency: b.currency, items: b.units, via: "drawer-fallback" })}>
                          {b.label} ↗
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {items.length > 1 && !blocked && (
                <details className="cd-links">
                  <summary>Open stores one at a time</summary>
                  <ul>
                    {items.map((b) => (
                      <li key={b.key}>
                        <a href={b.url} target="_blank" rel={b.rel} onClick={() => track("cart_checkout", { store: b.storeName, value: b.cents / 100, currency: b.currency, items: b.units, via: "drawer-single" })}>
                          {b.label} ↗
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <footer className="cd-foot">
              <div className="cd-total">
                <span>Total before postage</span>
                <b>{[...totals.entries()].map(([c, v]) => formatMoney(v, c)).join(" + ")}</b>
              </div>
              {items.length === 1 ? (
                <a
                  className="cd-btn"
                  href={items[0].url}
                  target="_blank"
                  rel={items[0].rel}
                  onClick={() => track("cart_checkout", { store: items[0].storeName, value: items[0].cents / 100, currency: items[0].currency, items: items[0].units, via: "drawer" })}
                >
                  Check out at {items[0].storeName} ↗
                </a>
              ) : (
                <button type="button" className="cd-btn" onClick={checkout} disabled={!items.length}>
                  Check out {items.length} stores ({items.length} tabs)
                </button>
              )}
              <div className="cd-links2">
                <a href="/cart" onClick={onClose}>
                  Full cart page
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Empty your cart?")) writeCart([]);
                  }}
                >
                  Empty cart
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
