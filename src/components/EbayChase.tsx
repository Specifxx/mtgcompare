import { getHomeFeed } from "@/lib/data";
import { imageFor } from "@/lib/images";
import { chaseArtOf, type ChaseArt } from "@/lib/listing-panel";
import { EbayBuyCta } from "./EbayBuyCta";
import { EbayChaseStrip } from "./EbayChaseStrip";

/**
 * Server wrapper of the chase strip: the pool is the public chase list of the published home feed (cards with art), so it needs no database; the live eBay listings are fetched by the strip in
 * the browser. The props are the page's contract (REQ-WP15-3): the home page and the region homes render exactly `<EbayChase page="home" heading="Chase cards on eBay right now" />`
 * immediately after the hero. Any error renders the plain eBay search CTA, never nothing and never an error.
 */
export async function EbayChase({ page, heading, limit, className }: { page: string; heading?: string; limit?: number; className?: string }) {
  let art: ChaseArt[] = [];
  try {
    const feed = await getHomeFeed();
    art = feed.chase.slice(0, 24).map((t) => chaseArtOf({ id: t.id, slug: t.slug, name: t.name, setCode: t.setCode, headFinish: t.headFinish, marketUsd: t.marketUsd, imageUrl: imageFor({ id: t.id, scryId: null, flags: t.flags }, "tile") }));
  } catch {
    art = [];
  }
  if (!art.length) return <EbayBuyCta className={className} source={`chase-${page}`} page={page} />;
  return <EbayChaseStrip art={art} page={page} {...(heading ? { heading } : {})} {...(limit ? { limit } : {})} {...(className ? { className } : {})} />;
}
