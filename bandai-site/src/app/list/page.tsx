import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { SharedList } from "./SharedList";

// A shared list (owner, 2026-11-02, word of mouth): the cards travel in the
// link (/list?i=…, lib/share.ts), nothing is stored and no account is needed.
// One static shell, out of the index (every list is someone's own); the list
// is priced in the visitor's market by /api/basket after the page loads.
export const revalidate = 86400;
export const metadata: Metadata = {
  title: `A shared ${SITE.gameShort} list, priced at every store`,
  description: `Someone shared a ${SITE.game} list with you: the cheapest in-stock price for every card across ${SITE.stores.length} stores, TCGplayer and eBay.`,
  alternates: { canonical: "/list" },
  robots: { index: false, follow: true },
};

export default function Page() {
  return (
    <div>
      <h1 className="font-display text-3xl font-black">A shared {SITE.gameShort} list</h1>
      <p className="mt-2 max-w-3xl text-muted">Every card on this list with the cheapest in-stock price we track in your market, and the stores that can fill most of it in one order. Postage isn&apos;t included.</p>
      <SharedList />
    </div>
  );
}
