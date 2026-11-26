"use client";

import { useEffect, useRef, useState } from "react";
import { PriceAlert } from "@/components/premium/PriceAlert";
import { claimPromptSlot } from "@/lib/prompt-slot";
import { track } from "@/lib/track";

// AFTER A BUY CLICK, A PRICE ALERT OFFER (COO, 2026-11-26, compounding plan move 3: owned audience). Someone who clicked through to a
// store and comes back to this tab has not necessarily bought; this asks once whether they want an email if the price drops. The page
// budget (ops/product-ux/page-budget.md), each rule enforced here:
//   • never on load: it shows only after this visitor's own buy click (the `buyclick` event OutboundLink dispatches), and only once
//     they are back on this tab;
//   • the visit's ONE prompt (lib/prompt-slot.ts): it claims the slot when it shows and stands down if anything else had it;
//   • ✕ silences it for 7 days, a created alert for 30; at most once a visit;
//   • never a modal: a card in the corner from 1024px, and on phones an inline card in the page under the price table (it never
//     covers the phone buy bar or the product).
// Counted as `after_buy_alert` {k: shown|created|close}; read as alerts created per 100 buy clickers on product pages.

export const BUY_CLICK_EVENT = "buyclick";
const SLOT = "after-buy-alert";
const SILENT_KEY = "after_buy_alert_until";
const DAY = 86_400_000;

function silentUntil(): number {
  try {
    return Number(localStorage.getItem(SILENT_KEY) || "0");
  } catch {
    return Number.POSITIVE_INFINITY; // no storage: it could not remember a ✕, so it never shows
  }
}
function silence(days: number) {
  try {
    localStorage.setItem(SILENT_KEY, String(Date.now() + days * DAY));
  } catch {
    /* nothing to remember with */
  }
}

export function AfterBuyAlert(props: {
  site: string;
  productId: string;
  region: string;
  priceCents: number | null;
  productName: string;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const clicked = useRef(false);
  const spot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (props.priceCents == null) return; // nothing to drop from
    function tryShow() {
      if (!clicked.current || document.visibilityState !== "visible") return;
      clicked.current = false;
      if (silentUntil() > Date.now()) return;
      if (document.querySelector("dialog[open]")) return;
      // Phones and tablets draw it inline: never above where the visitor is reading, or it would push the page down on their
      // return (Noor, 2026-11-26). From 1024px it is a corner card and moves nothing.
      const corner = window.matchMedia("(min-width: 1024px)").matches;
      if (!corner && (spot.current?.getBoundingClientRect().top ?? -1) < 0) return;
      if (!claimPromptSlot(SLOT)) return;
      setOpen(true);
      track("after_buy_alert", { k: "shown" });
    }
    function onBuy() {
      clicked.current = true;
      // A click that stayed on this tab (a store opened behind it) shows on the next focus; one that left shows on return.
      window.setTimeout(tryShow, 1500);
    }
    window.addEventListener(BUY_CLICK_EVENT, onBuy);
    document.addEventListener("visibilitychange", tryShow);
    return () => {
      window.removeEventListener(BUY_CLICK_EVENT, onBuy);
      document.removeEventListener("visibilitychange", tryShow);
    };
  }, [props.priceCents]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function close() {
    setOpen(false);
    if (!done) {
      silence(7);
      track("after_buy_alert", { k: "close" });
    }
  }

  if (!open) return <div ref={spot} aria-hidden="true" />;
  return (
    <aside
      aria-label="Price alert"
      className="card relative mt-4 p-4 lg:fixed lg:bottom-4 lg:right-4 lg:z-40 lg:mt-0 lg:w-[22rem] lg:shadow-xl"
    >
      <button type="button" onClick={close} aria-label="Close" className="absolute right-2 top-2 h-8 w-8 rounded-full text-muted hover:text-ink">
        ✕
      </button>
      <p className="pr-8 text-sm font-bold text-ink">Not buying today?</p>
      <p className="mt-1 text-sm text-muted">We can email you if {props.productName} gets cheaper at a store. Free, and every email has a stop link.</p>
      <PriceAlert
        site={props.site}
        productId={props.productId}
        region={props.region}
        priceCents={props.priceCents}
        className="mt-2"
        buttonClassName="btn-primary min-h-10"
        prominent
        summary="Email me if it drops"
        onCreated={() => {
          setDone(true);
          silence(30);
          track("after_buy_alert", { k: "created" });
        }}
      />
    </aside>
  );
}
