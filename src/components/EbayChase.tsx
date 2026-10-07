import { getChaseStrip } from "@/lib/data";
import type { ChaseTile } from "@/lib/listing-panel";
import { EbayChaseStrip } from "./EbayChaseStrip";

/** Server wrapper: one cached loader, any error renders nothing. */
export async function EbayChase({ page, heading, limit, className }: { page: string; heading?: string; limit?: number; className?: string }) {
  let tiles: ChaseTile[] = [];
  try {
    tiles = await getChaseStrip();
  } catch {
    tiles = [];
  }
  return <EbayChaseStrip tiles={tiles} page={page} {...(heading ? { heading } : {})} {...(limit ? { limit } : {})} {...(className ? { className } : {})} />;
}
