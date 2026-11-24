"use client";

// The header's cart: an icon with the number of lines, on every screen size. A click (or adding a
// row) opens the cart drawer on the same page (CartDrawer.tsx; src/lib/cart-list.ts).
import { useCallback, useEffect, useState } from "react";
import { CART_ADDED_EVENT, CART_CLOSE_EVENT, CART_OPEN_EVENT, cartCount, onCartChange, readCart } from "@/lib/cart-list";
import { CartDrawer } from "./CartDrawer";
import { CartIcon } from "./CartIcon";

export function CartHeaderLink({ className = "", href = "/cart" }: { className?: string; href?: string }) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  // Some headers render the button twice (desktop and phone): open and close travel as events, and one drawer draws.
  const close = useCallback(() => window.dispatchEvent(new CustomEvent(CART_CLOSE_EVENT)), []);

  useEffect(() => {
    const sync = () => setCount(cartCount(readCart()));
    sync();
    const off = onCartChange(sync);
    // The drawer opens only from a visitor's click: this button, or the add button on a row
    // (which dispatches CART_ADDED_EVENT from its click handler).
    const added = () => setOpen(true);
    window.addEventListener(CART_ADDED_EVENT, added);
    const shut = () => setOpen(false);
    window.addEventListener(CART_OPEN_EVENT, added);
    window.addEventListener(CART_CLOSE_EVENT, shut);
    return () => {
      off();
      window.removeEventListener(CART_ADDED_EVENT, added);
      window.removeEventListener(CART_OPEN_EVENT, added);
      window.removeEventListener(CART_CLOSE_EVENT, shut);
    };
  }, []);

  return (
    <>
      {/* A real link to /cart for no-script and middle-click; a plain click opens the drawer instead. */}
      <a
        href={href}
        className={`ce-cart-link ${className}`}
        aria-label={count ? `Shortlist, ${count} item${count === 1 ? "" : "s"}` : "Shortlist"}
        aria-haspopup="dialog"
        title="Your shortlist: prices you saved"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          window.dispatchEvent(new CustomEvent(CART_OPEN_EVENT));
        }}
      >
        <CartIcon size={20} />
        {count > 0 && <span className="ce-cart-badge">{count > 99 ? "99+" : count}</span>}
      </a>
      <CartDrawer open={open} onClose={close} />
    </>
  );
}
