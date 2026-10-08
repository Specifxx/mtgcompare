import type { Country } from "@/lib/country";
import { panelFor, type EbayPanelData } from "@/lib/listing-panel";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { EbayAdCarouselLive } from "./EbayAdCarouselLive";
import { EbayGradedLive } from "./EbayGradedLive";
import { EbayTabs, type EbayTab } from "./EbayTabs";

// The tabbed eBay panel: Listings / Graded.
// Tabs appear only for the ones with something in THIS market (a tab that opens
// onto "nothing here" advertises a section the card does not have). WHICH tab
// opens matters too: a card can have slabs in a market while every raw listing
// is graded, so Graded goes first when Listings would only show the generic
// search CTA. The Listings tab alone is used on sealed pages (no slabs).
export function EbayCardPanelLive({
  data,
  now = null,
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
  /** Epoch ms after the rows loaded; null (before they have) shows the plain search CTA. */
  now?: number | null;
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
  // rows older than the 48 h display cap never show (the job sweeps at 72 h); no clock yet means nothing has loaded
  const here = now == null ? { listings: [], graded: [] } : panelFor(data, country, now);
  const gradedHere = showGraded ? here.graded : [];
  const listingsHere = here.listings.length > 0;
  const listingsTab: EbayTab = {
    key: "listings",
    label: "Listings",
    content: <EbayAdCarouselLive listings={here.listings} now={now} country={country} query={query} name={name} page={page} card={card} preRelease={preRelease} bare />,
  };
  const gradedTab: EbayTab | null = gradedHere.length
    ? { key: "graded", label: "Graded", count: gradedHere.length, content: <EbayGradedLive listings={gradedHere} now={now} country={country} rawCents={rawCents} card={card} page={page} /> }
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
