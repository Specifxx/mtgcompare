"use client";

// The header's cart: an icon with the number of lines, on every screen size, and a
// short "Added" note under the header when a row is added (src/lib/cart-list.ts).
import { useEffect, useState } from "react";
import { CART_ADDED_EVENT, cartCount, onCartChange, readCart } from "@/lib/cart-list";
import { CartIcon } from "./CartIcon";

export function CartHeaderLink({ className = "", href = "/cart" }: { className?: string; href?: string }) {
  const [count, setCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setCount(cartCount(readCart()));
    sync();
    const off = onCartChange(sync);
    let t: ReturnType<typeof setTimeout> | undefined;
    const added = (e: Event) => {
      const d = (e as CustomEvent<{ title?: string; store?: string }>).detail;
      setToast(d?.store ? `Added from ${d.store}` : "Added to your cart");
      clearTimeout(t);
      t = setTimeout(() => setToast(null), 3500);
    };
    window.addEventListener(CART_ADDED_EVENT, added);
    return () => {
      off();
      clearTimeout(t);
      window.removeEventListener(CART_ADDED_EVENT, added);
    };
  }, []);

  return (
    <>
      <a href={href} className={`ce-cart-link ${className}`} aria-label={count ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"} title="Your cart">
        <CartIcon size={20} />
        {count > 0 && <span className="ce-cart-badge">{count > 99 ? "99+" : count}</span>}
      </a>
      {toast && (
        <div className="ce-cart-toast" role="status">
          <span>✓ {toast}</span>
          <a href={href}>View cart →</a>
        </div>
      )}
    </>
  );
}
