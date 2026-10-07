import type { Country } from "@/lib/country";
import { getEbayPanel } from "@/lib/data";
import type { EbayPanelData } from "@/lib/listing-panel";
import { EbayCardPanelLive } from "./EbayCardPanelLive";
import { EbayPanelIntro } from "./EbayPanelIntro";

// "Also available on eBay": the last in-column section of a card page, and the
// Listings tab only on sealed pages. Reads one cached loader (getEbayPanel:
// rows captured by scripts/ebay.ts from the price pass's own search, zero extra
// Browse calls); a database blip renders the plain search CTA, never an error.
export async function EbayCardPanel({
  productId,
  country,
  query,
  name,
  card,
  page = "card",
  rawCents = null,
  sealed = false,
  preRelease = false,
}: {
  productId: number;
  country: Country;
  query: string;
  name: string;
  card: string;
  page?: string;
  rawCents?: number | null;
  sealed?: boolean;
  preRelease?: boolean;
}) {
  let data: EbayPanelData = { listings: [], graded: [] };
  try {
    data = await getEbayPanel(productId);
  } catch {
    data = { listings: [], graded: [] };
  }
  return (
    <section className="card-surface p-5" aria-label="Also available on eBay">
      <h2 className="font-bold text-white">Also available on eBay</h2>
      <EbayPanelIntro graded={!sealed} />
      <EbayCardPanelLive data={data} country={country} query={query} name={name} card={card} page={page} rawCents={rawCents} showGraded={!sealed} preRelease={preRelease} className="mt-4" />
    </section>
  );
}
