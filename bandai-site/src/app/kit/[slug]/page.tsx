import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { gradeSlug, GRADE_LABEL, kitAdTiles, kitBySlug, kitImage, kitOffers, kits, kitsUpdatedAt, popular } from "@/lib/kits";
import { money } from "@/lib/format";
import { PriceTable } from "@/components/PriceTable";
import { CardStickyBuyBar, CardTopBuy, CheckedAgo } from "@/components/CardBuy";
import { KitGrid } from "@/components/KitTile";
import { JsonLd } from "@/components/JsonLd";
import { CompactKitAds, KitEbayStrip } from "@/components/KitAds";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { amazonSearchUrl, ebaySearchUrl, goHref } from "@/lib/affiliate";
import { meta } from "@/lib/data";
import { abs, KITS_SHARE_IMAGE } from "@/lib/site";
import { MARKET_LABEL } from "@/lib/site-types";
import { sourceNameServer } from "@/lib/sources";

export const revalidate = 86400; // data only changes with a release (DECISIONS.md, "Vercel cost")
// Empty list = nothing prerendered at build; each page is cached after its first visit.
export const generateStaticParams = () => [];

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const k = SITE.kits ? kitBySlug(params.slug) : null;
  if (!k || !SITE.kits) return {};
  const offers = kitOffers(k.jan);
  const stores = new Set(offers.map((o) => o.source)).size;
  const us = offers.find((o) => o.market === "US" && o.inStock);
  const title = `${k.name} price: compare ${stores} shops`;
  const description = `${k.name} ${SITE.kits.label} kit${us ? ` from ${money(us.cents, us.currency)} in the US` : ""}. Compare ${stores} hobby shops in the US, UK, Canada and Australia, matched by barcode (JAN ${k.jan}), cheapest in stock first.`;
  const images = k.image ? [kitImage(k.image, 1000)] : [KITS_SHARE_IMAGE];
  return {
    title,
    description,
    alternates: { canonical: `/kit/${k.slug}` },
    openGraph: { type: "website", siteName: SITE.name, url: `/kit/${k.slug}`, title, description, images },
    twitter: { card: "summary_large_image", images },
  };
}

export default function KitPage({ params }: { params: { slug: string } }) {
  const k = SITE.kits ? kitBySlug(params.slug) : null;
  if (!k || !SITE.kits) notFound();
  const cfg = SITE.kits;
  const offers = kitOffers(k.jan);
  const inStock = offers.filter((o) => o.inStock);
  const usOffers = inStock.filter((o) => o.currency === "USD");
  const m = meta();
  const pid = Number(k.jan);
  const search = `${cfg.searchPrefix} ${k.name}`;
  const amazon = amazonSearchUrl(search);
  const sameGrade = popular(kits().filter((x) => x.grade === k.grade && x.jan !== k.jan));
  const related = sameGrade.slice(0, 6);
  // eBay ads of the kit itself first, then its grade's popular kits.
  const adTiles = kitAdTiles([k, ...sameGrade], 10);
  const markets = [...new Set(inStock.map((o) => o.market))];
  // Offers are sorted in stock first, then by price: the first per market is its cheapest.
  const cheapestByMarket = markets.map((mk) => inStock.find((o) => o.market === mk)!);
  return (
    <article className="flex flex-col gap-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: k.name,
          image: k.image ? kitImage(k.image, 1000) : undefined,
          gtin13: k.jan,
          sku: k.jan,
          brand: { "@type": "Brand", name: cfg.maker },
          category: "Plastic model kit",
          url: abs(`/kit/${k.slug}`),
          offers: usOffers.length
            ? {
                "@type": "AggregateOffer",
                priceCurrency: "USD",
                lowPrice: (Math.min(...usOffers.map((o) => o.cents)) / 100).toFixed(2),
                highPrice: (Math.max(...usOffers.map((o) => o.cents)) / 100).toFixed(2),
                offerCount: usOffers.length,
                availability: "https://schema.org/InStock",
              }
            : undefined,
        }}
      />
      <Breadcrumbs items={[{ name: cfg.label, href: "/kits" }, ...(k.grade ? [{ name: GRADE_LABEL[k.grade] ?? k.grade, href: `/kits/grade/${gradeSlug(k.grade)}` }] : []), { name: k.name }]} />
      <div className="grid gap-8 md:grid-cols-[minmax(0,320px)_1fr]">
        <div className="order-2 flex flex-col gap-4 md:order-1">
          {k.image && <img src={kitImage(k.image, 640)} alt={`${k.name} box`} className="hidden w-full rounded-xl bg-white object-contain md:block" width={320} height={320} />}
          <dl className="card-surface grid grid-cols-2 gap-x-3 gap-y-1.5 p-4 text-sm">
            {k.grade && (<><dt className="text-muted">Grade</dt><dd><Link className="link" href={`/kits/grade/${gradeSlug(k.grade)}`}>{GRADE_LABEL[k.grade] ?? k.grade}</Link></dd></>)}
            {k.scale && (<><dt className="text-muted">Scale</dt><dd>{k.scale}</dd></>)}
            <dt className="text-muted">Maker</dt><dd>{cfg.maker}</dd>
            <dt className="text-muted">JAN barcode</dt><dd className="tabular-nums">{k.jan}</dd>
          </dl>
        </div>
        <div className="order-1 flex min-w-0 flex-col gap-6 md:order-2">
          <header>
            <div className="flex items-start gap-3">
              {k.image && <img src={kitImage(k.image, 160)} alt={k.name} className="w-20 shrink-0 rounded-md bg-white object-contain md:hidden" width={80} height={80} />}
              <h1 className="font-display text-2xl font-black md:text-3xl">{k.name} price</h1>
            </div>
            <p className="mt-2 text-sm text-muted">
              {inStock.length} in-stock listing{inStock.length === 1 ? "" : "s"}{markets.length ? ` in ${markets.map((x) => MARKET_LABEL[x]).join(", ")}` : ""}.
            </p>
            <CardTopBuy offers={offers} productId={pid} ebayQuery={search} />
          </header>
          {/* The small eBay row of this kit and its grade (2026-10-29: kit
              ads, not card ads, beside a kit). */}
          <CompactKitAds tiles={adTiles} page="kit" />
          <section>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 className="text-lg font-bold">Compare prices</h2>
              <CheckedAgo at={kitsUpdatedAt() ?? m?.updatedAt} />
            </div>
            <PriceTable offers={offers} fx={m?.fx ?? { USD: 1 }} productId={pid} page="kit" product={`${k.name} (JAN ${k.jan})`} />
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <a className="link font-semibold" rel="sponsored nofollow noopener" target="_blank" href={goHref({ url: ebaySearchUrl(search, "US"), source: "ebay", market: "US" }, pid, "kit_ebay_search")}>Check eBay listings →</a>
              {amazon && <a className="link font-semibold" rel="sponsored nofollow noopener" target="_blank" href={goHref({ url: amazon, source: "amazon", market: "US" }, pid, "kit_amazon_search")}>Check Amazon →</a>}
              <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-muted">Paid links</span>
            </p>
          </section>
          <section className="prose-site max-w-none text-sm">
            <h2>Where is {k.name} cheapest?</h2>
            <p>
              {cheapestByMarket.length
                ? `Cheapest in stock today: ${cheapestByMarket.map((o) => `${money(o.cents, o.currency)} at ${sourceNameServer(o)} (${MARKET_LABEL[o.market]})`).join(", ")}. `
                : `No shop we track has it in stock today. `}
              We compare {cfg.stores.length} hobby shops every day and match each listing by the kit&apos;s JAN barcode ({k.jan}), so every price above is for this exact kit. Prices are before postage; the shop&apos;s checkout price is final.
            </p>
          </section>
        </div>
      </div>
      {related.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">More {GRADE_LABEL[k.grade!] ?? k.grade} kits</h2>
          <KitGrid items={related} />
        </section>
      )}
      <KitEbayStrip tiles={adTiles} page="kit" title={`${k.name} and more ${GRADE_LABEL[k.grade ?? ""] ?? cfg.label} kits on eBay`} />
      <CardStickyBuyBar offers={offers} productId={pid} />
    </article>
  );
}
