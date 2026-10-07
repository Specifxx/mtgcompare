import type { Country } from "@/lib/country";
import { getEbayPicks } from "@/lib/data";
import type { PickCard } from "@/lib/listing-panel";
import { EbayPicksLive } from "./EbayPicksLive";

/**
 * "Chase cards on eBay right now": the newest released booster's chase
 * printings (or `setId`'s), each with its rank-0 eBay listing in the visitor's
 * market. Mounted on /browse, /sets/[slug], blog posts and the homepage. Reads
 * one cached loader and costs no eBay call; any error falls back to the plain
 * search CTA.
 */
export async function EbayPicks({
  country,
  setId = null,
  fallbackQuery = "One Piece Card Game",
  heading,
  className,
  page,
}: {
  country: Country;
  setId?: number | null;
  fallbackQuery?: string;
  heading?: string;
  className?: string;
  page?: string;
}) {
  let cards: PickCard[] = [];
  try {
    cards = await getEbayPicks(setId);
  } catch {
    cards = [];
  }
  return <EbayPicksLive cards={cards} country={country} fallbackQuery={fallbackQuery} className={className} page={page} {...(heading ? { heading } : {})} />;
}
