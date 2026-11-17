"use client";

// THE CART DRAWER (owner, 2026-11-17): the cart slides in from the right on the page the visitor
// is on, no navigation, on desktop and phone. Opened only by the visitor: the header cart button,
// or the add button on a price row (a pop-up for a new visitor never opens it; nothing can add a
// line but a click). "Check out" opens every store's checkout in its own tab from that click,
// each with the row's own affiliate-tagged link; lines from one Shopify store share ONE checkout
// (src/lib/cart-checkout.ts). One click tries every store. Chrome, Safari and Firefox give one click
// one tab until the visitor allows pop-ups for the site (tested in Chrome 157: no timing or anchor
// trick opens more), so when the browser refuses the rest the drawer shows the exact steps for that
// browser, once, and the same button opens the remaining stores. Every link is the row's own tagged link, never a plain one. (2026-11-17, owner: all the tabs or nothing, never a one-at-a-time walk.)
// The cart lives in this browser only (src/lib/cart-list.ts); /cart stays as the no-script page.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cartRef, formatMoney, groupByStore, onCartChange, readCart, setQty, writeCart, type CartLine } from "@/lib/cart-list";
import { browserKind, buildCheckout, checkLines, isGone, openAll, popupSteps, readPopupMemory, writePopupMemory, type CheckoutItem, type Checks } from "@/lib/cart-checkout";
import { CART_SITE } from "./cart-config";
import { CartThumb } from "./CartThumb";
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
  // Keys of the stores already opened this checkout; the drawer keeps its place while the visitor is in the store tabs.
  const [done, setDone] = useState<string[]>([]);
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
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  const groups = useMemo(() => groupByStore(lines), [lines]);
  const items = useMemo(() => buildCheckout(lines, checks, CART_SITE, ref.current), [lines, checks]);
  const update = (id: string, qty: number) => writeCart(setQty(readCart(), id, qty));

  const price = (l: CartLine) => checks[l.id]?.priceCents ?? l.priceCents;
  const totals = new Map<string, number>();
  for (const l of lines) if (!isGone(checks[l.id])) totals.set(l.currency, (totals.get(l.currency) ?? 0) + price(l) * l.qty);
  const unpriced = lines.some((l) => !isGone(checks[l.id]) && !price(l));
  const units = lines.filter((l) => !isGone(checks[l.id])).reduce((s, l) => s + l.qty, 0);

  // Only stores still in the cart count; a cart that changes keeps the stores already opened ticked.
  const doneKeys = done.filter((k) => items.some((i) => i.key === k));
  const todo = items.filter((i) => !doneKeys.includes(i.key));
  const started = doneKeys.length > 0;
  // After the first tab opens, bring the steps into view so the visitor sees where they are on return.
  const steps = useRef<HTMLElement>(null);
  useEffect(() => {
    if (started) steps.current?.scrollIntoView({ block: "nearest" });
  }, [started]);
  const markDone = (it: CheckoutItem, via: string) => {
    setDone((d) => (d.includes(it.key) ? d : [...d, it.key]));
    track("cart_checkout", { store: it.storeName, value: it.cents / 100, currency: it.currency, items: it.units, via });
  };
  // One click tries every store. A browser that allows one tab per click opens the first and refuses the rest;
  // then the drawer says how to allow pop-ups for this site once, and the same button opens the rest.
  const [blockedTry, setBlockedTry] = useState(false);
  const [again, setAgain] = useState(false); // pop-ups worked here before, so this is "blocked again"
  const [help, setHelp] = useState<{ kind: ReturnType<typeof browserKind>; host: string }>({ kind: "chrome", host: "this site" });
  useEffect(() => {
    setAgain(readPopupMemory());
    setHelp({ kind: browserKind(navigator.userAgent), host: location.host });
  }, []);
  const checkout = () => {
    const r = openAll(todo);
    for (const it of r.opened) markDone(it, blockedTry ? "drawer-retry" : "drawer");
    if (r.opened.length > 1) {
      writePopupMemory();
      setAgain(true);
    }
    setBlockedTry(r.pending.length > 0);
    track("cart_popups", { opened: r.opened.length, blocked: r.pending.length, kind: help.kind });
  };
  const showHelp = blockedTry && todo.length > 0;

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
            <p>Tap Add to cart beside any store&apos;s price (you pay each store on its own site, never us). Add from as many stores as you like and check out all of them in one go.</p>
            <button type="button" className="cd-btn" onClick={onClose}>
              Keep browsing
            </button>
          </div>
        ) : (
          <>
            <div className="cd-body">
              <div className="cd-handoff" role="note">
                <p className="cd-handoff-lead">You pay each store on its own site. We never take payment.</p>
                <p>{checking ? "Checking prices and stock at each store… " : ""}Each store adds its own postage. Opening a Shopify store&apos;s checkout replaces anything already in your cart there.</p>
              </div>
              {groups.map((g) => {
                const sub = g.lines.filter((l) => !isGone(checks[l.id])).reduce((s, l) => s + price(l) * l.qty, 0);
                const one = items.find((i) => i.key === `${g.key}#store`);
                return (
                  <section key={g.key} className="cd-store" aria-label={g.storeName}>
                    <header>
                      <h3>{g.storeName}</h3>
                      <span>
                        {sub > 0 ? <><b>{formatMoney(sub, g.currency)}</b> + postage</> : <b>Price at the store</b>}
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
                            <CartThumb image={l.image} alt={l.title} noimgClass="cd-noimg" />
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
              {items.length > 1 && !showHelp && !started && <p className="cd-steps-note">Each store opens in its own tab. If your browser asks, allow pop-ups for this site.</p>}
              {items.length > 1 && showHelp && (
                <section ref={steps} aria-label="Allow pop-ups">
                  <div className="cd-popup" role="status">
                    <p className="cd-strong">
                      {doneKeys.length ? `Opened ${doneKeys.length} of ${items.length} stores. ` : ""}
                      {again ? "Pop-ups look blocked again for this site." : "One quick step so every store opens at once: allow pop-ups for this site."}
                    </p>
                    <ol>
                      {popupSteps(help.kind, help.host).map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                      <li>Come back here and press “Open the other {todo.length === 1 ? "store" : `${todo.length} stores`}”.</li>
                    </ol>
                    <p className="cd-steps-note">You only do this once.</p>
                  </div>
                </section>
              )}
            </div>
            <footer className="cd-foot">
              <div className="cd-total">
                <span>Estimated total (before postage)</span>
                <b>{[...totals.entries()].filter(([, v]) => v > 0).map(([c, v]) => formatMoney(v, c)).join(" + ") || "See each store"}{unpriced && [...totals.values()].some((v) => v > 0) ? " + unpriced" : ""}</b>
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
              ) : started && !todo.length ? (
                <p className="cd-alldone">All {items.length} stores are open. Finish paying in each tab.</p>
              ) : (
                <button type="button" className="cd-btn" onClick={checkout} disabled={!items.length}>
                  {started || showHelp ? `Open the other ${todo.length === 1 ? "store" : `${todo.length} stores`}` : `Check out ${items.length} stores`}
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
