"use client";

import { useEffect, useRef, useState } from "react";
import { outboundRel } from "@/lib/affiliate";
import { PriceWatchButton } from "./PriceWatchButton";
import { TOP_BUY_ATTR } from "./CardTopBuy";

// The card page's phone buy path, bottom half (RiftCompare's CardStickyBuyBar):
// below lg, once the top buy block has scrolled away, "<price> at <store> ·
// ♥ · Buy →" pins to the bottom of the screen; it hides again while the price
// comparison itself is on screen. Props are pre-resolved on the server
// (cheapestBuyRow), so this island ships a few strings, not the offers.
export function CardStickyBuyBar({
  boardId,
  price,
  store,
  href,
  retailer,
  ebay,
  page,
  slug,
  name,
  cardId,
}: {
  /** The card's id, for the watch heart (wave 2). */
  cardId?: number;
  /** The price board's element id. */
  boardId: string;
  /** Formatted item price. */
  price: string;
  store: string;
  href: string;
  retailer: string;
  ebay: boolean;
  page: string;
  slug: string;
  name: string;
}) {
  const [show, setShow] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  // Hidden = inert: nothing in it can be tabbed to or read out.
  useEffect(() => {
    bar.current?.toggleAttribute("inert", !show);
  }, [show]);
  // While shown, the page gets bottom room (globals.css, below lg) so the bar
  // never covers the footer's last lines (RiftCompare's data-rc-buybar).
  useEffect(() => {
    if (!show) return;
    document.body.setAttribute("data-mc-buybar", "");
    return () => document.body.removeAttribute("data-mc-buybar");
  }, [show]);

  useEffect(() => {
    const board = document.getElementById(boardId);
    const top = document.querySelector(`[${TOP_BUY_ATTR}]`);
    if (!board && !top) return;
    const update = () => {
      // Shown once the top block has scrolled ABOVE the viewport (not merely
      // below the fold on first paint) and while the board is not on screen.
      const vh = window.innerHeight;
      const onScreen = (el: Element | null) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < vh;
      };
      const passed = top ? top.getBoundingClientRect().bottom < 0 : (board?.getBoundingClientRect().top ?? 1) < 0;
      setShow(passed && !onScreen(board) && !onScreen(top));
    };
    const io = new IntersectionObserver(update);
    for (const el of [board, top]) if (el) io.observe(el);
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", update);
    };
  }, [boardId]);

  return (
    <div
      ref={bar}
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-0 z-header border-t border-ink-700 bg-ink-950/95 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur transition-transform duration-base lg:hidden ${
        show ? "translate-y-0" : "pointer-events-none translate-y-[120%]"
      }`}
    >
      <div className="mx-auto flex max-w-xl items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="num font-bold text-white">{price}</span>
          <span className="text-slate-400"> at {store}</span>
        </p>
        {cardId != null ? <PriceWatchButton cardId={cardId} slug={slug} name={name} /> : null}
        <a
          href={href}
          target="_blank"
          rel={outboundRel()}
          data-retailer={retailer}
          data-page={page}
          data-card={slug}
          data-surface="sticky_buy_bar"
          className={`${ebay ? "btn-ebay" : "btn-primary"} shrink-0`}
        >
          Buy →
        </a>
      </div>
    </div>
  );
}
