import type { Country } from "@/lib/country";
import { getHomeFeed, getSetHighlights } from "@/lib/data";
import { imageFor } from "@/lib/images";
import { chaseArtOf, type ChaseArt } from "@/lib/listing-panel";
import { EbayBuyCta } from "./EbayBuyCta";
import { EbayChaseStrip } from "./EbayChaseStrip";

/**
 * "Chase cards on eBay right now" for a page with a context: a set's page (its dearest printings), /browse and blog posts (the global chase pool). The same strip as the homepage's, the same
 * one-row payload, so a page adds no eBay data of its own and costs no eBay call. The art comes from the published files (a set's board, the home feed); the listings are fetched by the strip
 * in the browser. Any error falls back to the plain search CTA. `country` is accepted for the pages that already pass it: the strip takes the visitor's market from the country context.
 */
export async function EbayPicks({
  setId = null,
  fallbackQuery,
  heading,
  className,
  page = "browse",
}: {
  country?: Country;
  setId?: number | null;
  fallbackQuery?: string;
  heading?: string;
  className?: string;
  page?: string;
}) {
  let art: ChaseArt[] = [];
  try {
    if (setId != null) {
      const top = await getSetHighlights(setId, 12);
      art = top
        .filter((c) => c.marketUsd != null)
        .map((c) => chaseArtOf({ id: c.id, slug: c.slug, name: c.name, setCode: c.setCode, label: c.label, headFinish: c.headFinish, marketUsd: c.marketUsd, imageUrl: imageFor({ id: c.id, scryId: c.scryId, flags: c.flags }, "tile") }));
    } else {
      const feed = await getHomeFeed();
      art = feed.chase.slice(0, 24).map((t) => chaseArtOf({ id: t.id, slug: t.slug, name: t.name, setCode: t.setCode, headFinish: t.headFinish, marketUsd: t.marketUsd, imageUrl: imageFor({ id: t.id, scryId: null, flags: t.flags }, "tile") }));
    }
  } catch {
    art = [];
  }
  if (!art.length) return <EbayBuyCta query={fallbackQuery} className={className} source="picks-fallback" page={page} />;
  return <EbayChaseStrip art={art} page={page} className={className} {...(setId != null && art[0] ? { onlySet: art[0].setCode } : {})} {...(heading ? { heading } : {})} />;
}
