"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";
import { sendCardView } from "@/lib/card-views";

// Records a card-page view (RiftCompare's CardViewBeacon). The page is
// ISR-cached, so a server-side counter would miss most visits: this fires on
// mount, at most once per card per day in this browser (lib/card-views.ts —
// the counter feeds Rising Cards, Demand Finder and the /movers "Most
// searched" strip, so a reload must not count twice). Also fires the
// `card_page_view` analytics event from the same effect.
export function CardViewBeacon({ slug, cardId, cardName, rarity }: { slug: string; cardId: number; cardName?: string; rarity?: string | null }) {
  useEffect(() => {
    sendCardView(slug, "view", String(cardId));
    trackEvent("card_page_view", { card_id: cardId, card_name: cardName, rarity: rarity ?? undefined });
  }, [slug, cardId, cardName, rarity]);
  return null;
}
