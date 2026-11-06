"use client";

// "Add to cart list" beside a store row's buy button (src/lib/cart-list.ts). It takes
// the row's OWN buy link: a cart permalink there makes the line cartable, anything
// else (an affiliate or partner link) stays a manual line with that link.
import { useEffect, useState } from "react";
import { CART_ADDED_EVENT, addLine, makeLine, onCartChange, readCart, setQty, writeCart, type CartAddInput } from "@/lib/cart-list";
import { CartIcon } from "./CartIcon";

export function CartAddButton({
  className = "",
  label = false,
  inline = false,
  ...input
}: CartAddInput & { className?: string; label?: boolean; inline?: boolean }) {
  const line = makeLine(input);
  const id = line?.id ?? null;
  const [inList, setInList] = useState(false);

  useEffect(() => {
    if (!id) return;
    const sync = () => setInList(readCart().some((l) => l.id === id));
    sync();
    return onCartChange(sync);
  }, [id]);

  if (!line) return null;

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const lines = readCart();
    if (lines.some((l) => l.id === line.id)) {
      writeCart(setQty(lines, line.id, 0));
      return;
    }
    const withPage = { ...line, page: line.page ?? (typeof location !== "undefined" ? location.pathname : null) };
    writeCart(addLine(lines, withPage));
    try {
      window.dispatchEvent(new CustomEvent(CART_ADDED_EVENT, { detail: { title: line.title, store: line.storeName } }));
      (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "cart_add", {
        store: line.store,
        value: line.priceCents / 100,
        currency: line.currency,
        cartable: Boolean(line.variantId),
      });
    } catch {
      /* analytics is best-effort */
    }
  };

  const text0 = inList ? `Remove ${line.title} at ${line.storeName} from your cart` : `Add ${line.title} at ${line.storeName} to your cart`;
  const text = text0;
  // `inline`: a small text button for a row's detail line, where a phone has no width
  // to spare beside the price and the buy button.
  if (inline)
    return (
      <button type="button" onClick={toggle} aria-pressed={inList} aria-label={text} className={`ce-cart-inline${inList ? " is-in" : ""} ${className}`}>
        {inList ? "✓ In cart" : "+ Add to cart"}
      </button>
    );
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={inList}
      aria-label={text}
      title={inList ? "In your cart (tap to remove)" : "Add to cart"}
      className={`ce-cart-add${inList ? " is-in" : ""}${label ? " has-label" : ""} ${className}`}
    >
      {inList ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : (
        <CartIcon plus />
      )}
      {label && <span>{inList ? "In cart" : "Add to cart"}</span>}
    </button>
  );
}
