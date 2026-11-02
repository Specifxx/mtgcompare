import { ogCard } from "@/lib/og-card";
import { productPage } from "@/lib/data";
import { money } from "@/lib/format";
import { isRegion, REGIONS } from "@/lib/regions";
import { offerStock } from "@/lib/sealed-offers";
import { priceGap } from "@/lib/share-link";

// /og/p/<region>/<slug>: a product's share card (2026-11-02, word of mouth), its og:image when the region shows a real
// price gap: the cheapest and dearest in-stock store price and how much less (lib/share-link.ts). Drawn per request from
// the public data files and kept by Vercel's CDN for a day, like the product page; never ISR, nothing prerendered. Only
// links someone shares are ever fetched. An unknown product or no gap draws the site's plain card, never invented prices.
export const dynamic = "force-dynamic";

const CDN = "public, s-maxage=86400, stale-while-revalidate=86400";

export async function GET(_req: Request, { params }: { params: { region: string; slug: string } }) {
  const r = isRegion(params.region) ? REGIONS[params.region] : null;
  const p = r ? await productPage(params.slug, r.market).catch(() => null) : null;
  const open = p ? p.offers.filter((o) => !o.marketplace && offerStock(o) === "open") : [];
  const gap = priceGap(open.map((o) => ({ priceCents: o.priceCents, storeName: o.storeName })));
  const name = p && p.name.length > 60 ? `${p.name.slice(0, 58)}…` : p?.name;
  const res =
    r && p && gap
      ? ogCard({
          tag: r.name,
          lines: [
            [name!, false],
            [`${money(gap.low.priceCents, r.market)} at ${gap.low.storeName}`, true],
            [`up to ${money(gap.high.priceCents, r.market)} elsewhere`, false],
          ],
          size: name!.length > 34 ? 44 : 52,
          sub: `${gap.pct}% less · ${gap.sellers} ${r.adjective} stores compared`,
          chips: [`Prices in ${r.currency}`, "In stock, checked daily"],
        })
      : ogCard({ lines: [["Compare Magic", false], ["sealed prices", true]], sub: "Booster boxes, Collector boxes, bundles and more", chips: [] });
  res.headers.set("Cache-Control", "public, max-age=3600");
  res.headers.set("CDN-Cache-Control", CDN);
  res.headers.set("Vercel-CDN-Cache-Control", CDN);
  return res;
}
