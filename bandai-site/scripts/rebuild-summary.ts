// Rewrites data/public/summary.json from the committed price shards, with no
// import and no network: run it when the summary gains a field (2026-10-28,
// the eBay listings the card ad strips read), so pages get the field before
// the next daily import writes it anyway.
import { rebuildSummary } from "@/lib/price-store";

console.log(`summary.json: ${rebuildSummary()} products`);
