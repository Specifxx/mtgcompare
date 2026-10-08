"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";
import { markBuyClick, registerBuyLink } from "@/lib/buy-intent";
import { sendCardView } from "@/lib/card-views";

// Records a card-page view. The page is rendered per request but cached at the
// edge, so a server-side counter would miss most visits: this fires on mount, at
// most once per card per day in this browser (lib/card-views.ts: the counter
// feeds Rising Cards, Demand Finder and the /movers "Most searched" strip, so a
// reload must not count twice; the server samples and batches the write). Also
// fires the `card_page_view` analytics event from the same effect, and tells the
// launch popup this page has buy links until the visitor has clicked one.
export function CardViewBeacon({ slug, cardId, cardName, rarity }: { slug: string; cardId: number; cardName?: string; rarity?: string | null }) {
  useEffect(() => {
    sendCardView(slug, "view", String(cardId));
    trackEvent("card_page_view", { card_id: cardId, card_name: cardName, rarity: rarity ?? undefined });
  }, [slug, cardId, cardName, rarity]);
  useEffect(() => {
    const unregister = registerBuyLink();
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[data-retailer]");
      if (a) markBuyClick();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      unregister();
    };
  }, []);
  return null;
}
