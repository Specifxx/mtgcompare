import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { STORES, isMarketplace } from "@/lib/stores";
import { HowWePickStores } from "@/components/HowWePickStores";

export const metadata: Metadata = {
  title: "How we pick stores",
  description: `How ${SITE_NAME} checks every store before listing it, keeps checking it, and how to report one.`,
  alternates: { canonical: `${SITE_URL}/how-we-pick-stores` },
};

export default function HowWePick() {
  const stores = STORES.filter((s) => !isMarketplace(s)).map((s) => s.name);
  return (
    <div className="page max-w-3xl py-12">
      <Breadcrumbs items={[{ href: "/", label: SITE_NAME }, { label: "How we pick stores" }]} />
      <div className="prose-dex mt-6">
        <HowWePickStores
          site={SITE_NAME}
          what="sealed product"
          stores={stores}
          priceRule="An in-stock price under a quarter of what the other stores charge for the same product is dropped automatically, and a store with many prices under half the market is shown as sold out until we have checked it."
          marketplaces="eBay, TCGplayer and Amazon rows are marketplaces, not stores: they are labelled, kept apart and never counted as a store. We don't vet the individual sellers there, so check a seller's feedback before you buy."
          buttonClassName="btn-primary"
          suggestHref="/contact#suggest"
        />
      </div>
    </div>
  );
}
