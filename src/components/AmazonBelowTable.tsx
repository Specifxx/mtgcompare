import { amazonCarries, amazonRegion, amazonRetailer, amazonUrl, REL_AMAZON } from "@/lib/amazon";
import { amazonLiveFor } from "@/lib/amazon-live";
import type { Region } from "@/lib/regions";
import { OutboundLink } from "./OutboundLink";

/**
 * A small unpriced "Also on Amazon" link under the product page's price table (owner, 2026-11-16, after Amazon clicks fell to zero when the
 * priced-only row rule of 2026-11-12 took the search rows away). Not a pinned paid row, never a price, best price or deal, never in the quick
 * view (the A/B test), only where Amazon sells the item (a known ASIN, else a type Amazon carries), hidden when the table already shows
 * Amazon's own priced row. The region's shared tag, placement amazon-below-table.
 */
export function AmazonBelowTable({ region, slug, name, typeKey }: { region: Region; slug: string; name: string; typeKey?: string | null }) {
  if (!amazonRegion(region)) return null;
  const live = amazonLiveFor(slug, region);
  if (live?.cents) return null; // the priced Amazon row is in the table already
  if (!amazonCarries(typeKey, !!live)) return null;
  const retailer = amazonRetailer(region);
  const href = amazonUrl(name, { slug, region, placement: "amazon-below-table", asin: live?.asin });
  return (
    <p className="mt-3 text-sm text-muted">
      Also on {retailer}:{" "}
      <OutboundLink href={href} rel={REL_AMAZON} retailer={retailer} placement="amazon-below-table" className="font-semibold text-ink underline decoration-line underline-offset-2 hover:decoration-ink" amazon={{ product: slug, region, page: `/${region}/p/${slug}` }}>
        see {name} on {retailer} <span aria-hidden="true">↗</span>
      </OutboundLink>{" "}
      <span className="text-xs">Paid link, price not shown.</span>
    </p>
  );
}
