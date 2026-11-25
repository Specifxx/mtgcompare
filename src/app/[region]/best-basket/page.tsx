import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BestBasketView } from "@/components/basket/BestBasketView";
import { regionOrNotFound } from "@/lib/regions";
import { pageMeta } from "@/lib/seo";

// BEST BASKET (owner, 2026-11-25; lib/basket-server.ts). A static shell like /cart: the list lives in the visitor's browser and the
// plan comes from /api/basket/<region>, so the page reads no cookie or header and is the same for everyone (CDN-cached with the rest
// of /[region]). Personal: noindex, never in the sitemap.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { region: string } }): Metadata {
  const r = regionOrNotFound(params.region);
  return pageMeta({
    title: "Best Basket: the cheapest way to buy your list",
    description: `Your shortlist split across stores in ${r.inName} for the lowest total with shipping.`,
    path: `/${r.region}/best-basket`,
    noindex: true,
  });
}

export default function BestBasketPage({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  return (
    <div className="page mx-auto w-full max-w-3xl py-6 sm:py-10">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: "Best Basket" }]} />
      <h1 className="mt-2 page-title">Best Basket</h1>
      <p className="page-lead">
        The cheapest way to buy everything on your shortlist in {r.inName}, shipping included: some products from one store, some from another, whichever
        adds up to less.
      </p>
      <BestBasketView region={r.region} market={r.market} />
    </div>
  );
}
