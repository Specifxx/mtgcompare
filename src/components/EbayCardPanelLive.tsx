import type { Country } from "@/lib/country";
import type { EbayPanelData } from "@/lib/listing-panel";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { EbayAdCarouselLive } from "./EbayAdCarouselLive";
import { EbayGradedLive } from "./EbayGradedLive";
import { EbayTabs, type EbayTab } from "./EbayTabs";

// The tabbed eBay panel (RiftCompare's EbayCardPanelLive): Listings / Graded.
// Tabs appear only for the ones with something in THIS market (a tab that opens
// onto "nothing here" advertises a section the card does not have). WHICH tab
// opens matters too: a card can have slabs in a market while every raw listing
// is graded, so Graded goes first when Listings would only show the generic
// search CTA. The Listings tab alone is used on sealed pages (no slabs).
export function EbayCardPanelLive({
  data,
  country,
  query,
  name,
  card,
  page = "card",
  rawCents = null,
  showGraded = true,
  preRelease = false,
  className,
}: {
  data: EbayPanelData;
  country: Country;
  query: string;
  name?: string;
  card?: string;
  page?: string;
  /** The card's cheapest raw price in this market (for the "N× raw" multiple). */
  rawCents?: number | null;
  showGraded?: boolean;
  preRelease?: boolean;
  className?: string;
}) {
  const gradedHere = showGraded ? data.graded.filter((g) => g.market === country) : [];
  const listingsHere = data.listings.some((l) => l.market === country);
  const listingsTab: EbayTab = {
    key: "listings",
    label: "Listings",
    content: <EbayAdCarouselLive listings={data.listings} country={country} query={query} name={name} page={page} card={card} preRelease={preRelease} bare />,
  };
  const gradedTab: EbayTab | null = gradedHere.length
    ? { key: "graded", label: "Graded", count: gradedHere.length, content: <EbayGradedLive listings={gradedHere} country={country} rawCents={rawCents} card={card} page={page} /> }
    : null;
  const tabs = gradedTab ? (!listingsHere ? [gradedTab, listingsTab] : [listingsTab, gradedTab]) : [listingsTab];
  return (
    <div className={className} data-card={card}>
      <EbayTabs tabs={tabs} label="eBay listings and graded copies" />
      {/* One disclosure for the whole panel: every tab is affiliate-tagged. */}
      <AffiliateDisclosure partner="ebay" tight />
    </div>
  );
}
