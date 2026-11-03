import type { PreorderCopy } from "@/lib/site-types";

// Copy for /preorders and /preorders/<set slug>. A set without copy here still
// gets a page from its data; add set copy only with facts checked at the
// publisher's own announcement (release date, pack count, MSRP).
export const PREORDER_COPY: PreorderCopy = {
  intro:
    "Every upcoming Union Arena, Dragon Ball Super Fusion World and Digimon Card Game release, each with its own page comparing every store's booster box, starter deck and sealed pre-order price, cheapest first in your currency. Sets stay listed for six weeks after release, when the most people shop for a box.",
  faq: [
    { q: "When do pre-orders open for a new Union Arena, Fusion World or Digimon set?", a: "Stores list a release as soon as their distributor confirms an allocation, often two or three months ahead. Each release page adds a store as soon as its listing appears, and refreshes every store daily." },
    { q: "Why do pre-order prices differ so much between stores?", a: "Allocations are limited, so some stores price at MSRP and others above it. Comparing every store side by side is the quickest way to find a box near MSRP before they sell out." },
    { q: "Do the prices include shipping?", a: "No. Every price is the store's item price before shipping, in the store's own currency, so compare the stores in your market." },
  ],
  sets: {},
};
