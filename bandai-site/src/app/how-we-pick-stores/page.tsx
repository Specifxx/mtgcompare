import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { StaticPage } from "@/components/StaticPage";
import { HowWePickStores } from "@/components/HowWePickStores";

export const revalidate = 86400;
export const metadata: Metadata = {
  title: "How we pick stores",
  description: `How ${SITE.name} checks every ${SITE.gameShort} store before listing it, keeps checking it, and how to report one.`,
  ...canon("/how-we-pick-stores"),
};

export default function HowWePick() {
  const stores = [...SITE.stores.map((s) => s.name), ...(SITE.kits?.stores.map((s) => s.name) ?? [])];
  return (
    <StaticPage title="How we pick stores">
      <HowWePickStores
        showTitle={false}
        site={SITE.name}
        what={`${SITE.gameShort} products`}
        stores={stores}
        priceRule="A store price under a quarter of TCGplayer's market price is dropped automatically."
        marketplaces="TCGplayer and eBay rows are marketplaces, not stores: we show them separately and never count them as a store. We don't vet the individual sellers there, so check a seller's feedback before you buy."
        buttonClassName="btn-buy"
        suggestHref="/stores#suggest"
      />
    </StaticPage>
  );
}
