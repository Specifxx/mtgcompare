// Every store here is found and verified by scripts/probe-stores.ts
// (.github/workflows/probe-stores.yml) over research/candidate-hosts.txt: its
// Shopify collection products.json returned English Union Arena, Fusion World
// or Digimon product, and /meta.json gave the market's currency. Add a store
// only after the same check: a wrong collection handle fails silently. The
// import also re-checks each store's currency every run. Never add a store on
// the family ban list (TCG Synergy).
import type { StoreConfig } from "@/lib/site-types";

export const STORES: StoreConfig[] = [
];
