import type { Metadata } from "next";
import { ebayQueryOf } from "@/lib/lines";
import Link from "@/components/Link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { SITE } from "@/site.config";
import { byValue, historyOf, meta, priceOf, productBySlug, productsInSet, refCents, setById } from "@/lib/data";
import { imageAt } from "@/lib/image";
import { money, pct } from "@/lib/format";
import { shortName } from "@/lib/names";
import { PriceTable } from "@/components/PriceTable";
import { PriceAlert } from "@/components/PriceAlert";
import { lowestByMarket } from "@/lib/alert-feed";
import { CardStickyBuyBar, CardTopBuy, CheckedAgo } from "@/components/CardBuy";
import { EbayCallout } from "@/components/EbayCallout";
import { PriceChart } from "@/components/PriceChart";
import { TileGrid } from "@/components/ProductTile";
import { JsonLd } from "@/components/JsonLd";
import { AdSlot } from "@/components/AdSlot";
import { CompactCardAds, EbayCardStrip, TcgplayerCardStrip } from "@/components/CardAds";
import { adSearch, cardAds } from "@/lib/card-ads";
import { amazonSearchUrls } from "@/lib/affiliate";
import { abs } from "@/lib/site";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ShareButton } from "@/components/ShareButton";
import { attrHref, rarityHref, sealedHref } from "@/lib/hubs";

import { cardTitleCandidates, fitTitle } from "@/lib/seo-title";

export const revalidate = 86400; // data only changes with a release (DECISIONS.md, "Vercel cost")
// Empty list = nothing prerendered at build, but each page is cached (ISR)
// after its first visit instead of rendering on every request.
export const generateStaticParams = () => [];

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const p = productBySlug(params.slug);
  if (!p) return {};
  const set = setById(p.setId);
  const ref = refCents(p.id);
  const name = shortName(p.name);
  // "<card> <number> Price — <game> <set>", stepped down to fit 60 characters (lib/seo-title.ts).
  const title = fitTitle(cardTitleCandidates(name, p.number, set?.name ?? null, p.kind === "sealed")).absolute;
  const stores = new Set(priceOf(p.id).offers.map((o) => o.source)).size;
  const description = `${name} (${set?.name ?? SITE.gameShort}${p.rarity ? `, ${p.rarity}` : ""}) is worth about ${money(ref)} today. Compare ${stores} live prices from TCGplayer, eBay and ${SITE.gameShort} stores, with price history.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/card/${p.slug}` },
    // Pack inserts (puzzle pieces, ink drops) are worth cents and nobody shops
    // for them: out of the index, like the sitemap (DECISIONS.md, 2026-10-28).
    ...(p.sealedType === "Insert" ? { robots: { index: false, follow: true } } : {}),
    // The image is ./opengraph-image.tsx: the card and its real price gap (lib/share.ts).
    openGraph: { type: "website", siteName: SITE.name, url: `/card/${p.slug}`, title, description },
    twitter: { card: "summary_large_image" },
  };
}

export default function CardPage({ params }: { params: { slug: string } }) {
  const p = productBySlug(params.slug);
  if (!p) notFound();
  const set = setById(p.setId);
  const e = priceOf(p.id);
  const ref = refCents(p.id);
  const m = meta();
  const series = historyOf(p);
  const name = shortName(p.name);
  const related = byValue(productsInSet(p.setId).filter((x) => x.id !== p.id && x.kind === p.kind)).slice(0, 6);
  const inStock = e.offers.filter((o) => o.inStock);
  const usOffers = inStock.filter((o) => o.currency === "USD");
  const amazon = p.kind === "sealed" ? amazonSearchUrls(`${SITE.game} ${name}`) : null;
  return (
    <article className="flex flex-col gap-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: p.name,
          image: p.image ? imageAt(p.image, "in_1000x1000") : undefined,
          sku: String(p.id),
          brand: { "@type": "Brand", name: SITE.game },
          category: p.kind === "card" ? "Trading card" : "Sealed trading card product",
          url: abs(`/card/${p.slug}`),
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
      <Breadcrumbs items={[{ name: p.kind === "sealed" ? "Sealed" : "Cards", href: p.kind === "sealed" ? "/sealed" : "/cards" }, ...(set ? [{ name: set.name, href: `/sets/${set.slug}` }] : []), { name }]} />
      <div className="grid gap-8 md:grid-cols-[minmax(0,320px)_1fr]">
        {/* Phones: the name, price and Buy come first; the big image and the
            details follow the prices (RiftCompare's card page, 2026-09-26). */}
        <div className="order-2 flex flex-col gap-4 md:order-1">
          {p.image && <img src={imageAt(p.image, "400w")!} alt={`${name} ${SITE.gameShort} card`} className="hidden w-full rounded-xl md:block" width={400} height={560} />}
          <dl className="card-surface grid grid-cols-2 gap-x-3 gap-y-1.5 p-4 text-sm">
            {set && (<><dt className="text-muted">Set</dt><dd><Link className="link" href={`/sets/${set.slug}`}>{set.name}</Link></dd></>)}
            {p.number && (<><dt className="text-muted">Number</dt><dd>{p.number}</dd></>)}
            {p.rarity && (<><dt className="text-muted">Rarity</dt><dd>{rarityHref(p.rarity) ? <Link className="link" href={rarityHref(p.rarity)!}>{p.rarity}</Link> : p.rarity}</dd></>)}
            {p.sealedType && (<><dt className="text-muted">Type</dt><dd>{sealedHref(p.sealedType) ? <Link className="link" href={sealedHref(p.sealedType)!}>{p.sealedType}</Link> : p.sealedType}</dd></>)}
            {Object.entries(p.attrs).slice(0, 8).map(([k, v]) => { const hubs = attrHref(k, v); return (<Fragment key={k}><dt className="text-muted">{k.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt><dd>{hubs ? hubs.map((l, i) => <Fragment key={l.label}>{i > 0 ? ", " : ""}{l.href ? <Link className="link" href={l.href}>{l.label}</Link> : l.label}</Fragment>) : v}</dd></Fragment>); })}
          </dl>
        </div>
        <div className="order-1 flex min-w-0 flex-col gap-6 md:order-2">
          <header>
            <div className="flex items-start gap-3">
              {p.image && <img src={imageAt(p.image, "200w")!} alt={name} className="w-20 shrink-0 rounded-md md:hidden" width={80} height={112} />}
              <h1 className="min-w-0 flex-1 font-display text-2xl font-black md:text-3xl">{name} {p.number && <span className="text-muted">{p.number}</span>} price</h1>
              <ShareButton path={`/card/${p.slug}`} name={`${name}${p.number ? ` ${p.number}` : ""}`} medium={p.kind === "sealed" ? "sealed" : "card"} offers={e.offers} compact className="mt-1" />
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <p><span className="text-3xl font-black text-brand-400">{money(ref)}</span> <span className="text-sm text-muted">TCGplayer market</span></p>
              <p className="text-sm">7d <span className={(e.change7d ?? 0) >= 0 ? "text-up" : "text-down"}>{pct(e.change7d)}</span> · 30d <span className={(e.change30d ?? 0) >= 0 ? "text-up" : "text-down"}>{pct(e.change30d)}</span></p>
              <p className="text-sm text-muted">{inStock.length} in-stock listing{inStock.length === 1 ? "" : "s"} worldwide</p>
            </div>
            <CardTopBuy offers={e.offers} productId={p.id} ebayQuery={`${ebayQueryOf(set)} ${name} ${p.number ?? ""}`.trim()} />
            {Object.keys(e.tcg).length > 1 && (
              <p className="mt-2 flex flex-wrap gap-2 text-xs">
                {Object.entries(e.tcg).map(([k, v]) => (
                  <span key={k} className="chip">{k}: {money(v.market ?? v.mid ?? v.low)}</span>
                ))}
              </p>
            )}
          </header>
          {/* The small eBay + TCGplayer pair near the top, under the price and
              Buy (owner, 2026-10-29); the full strips stay further down. */}
          <CompactCardAds ads={cardAds({ setId: p.setId, kind: p.kind, exclude: p.id, fill: true })} page="card" {...adSearch(set?.name, set)} />
          <section>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 className="text-lg font-bold">Compare prices</h2>
              <CheckedAgo at={m?.updatedAt} />
            </div>
            <div className="mb-3"><EbayCallout offers={e.offers} productId={p.id} query={`${ebayQueryOf(set)} ${name} ${p.number ?? ""}`.trim()} /></div>
            <PriceTable offers={e.offers} fx={m?.fx ?? { USD: 1 }} productId={p.id} page="card" amazon={amazon} product={`${name}${p.number ? ` ${p.number}` : ""}`} />
            {SITE.priceAlerts && <PriceAlert site={SITE.key} productId={p.id} prices={lowestByMarket(e.offers)} />}
          </section>
          <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_CARD} />
          <section className="card-surface p-4">
            <h2 className="mb-2 text-lg font-bold">Price history</h2>
            <PriceChart series={series} days={365} />
          </section>
          {/* Below the comparison and the chart, never between a buyer and the
              price rows: more of this set on eBay (lib/card-ads.ts). */}
          <EbayCardStrip ads={{ ebay: cardAds({ setId: p.setId, kind: p.kind, exclude: p.id, fill: true }).ebay }} page="card" query={adSearch(set?.name, set).ebayQuery} title={`More ${set?.name ?? SITE.gameShort} & chase cards on eBay`} />
          <section className="prose-site max-w-none text-sm">
            <h2>Is {name} worth it?</h2>
            <p>
              {name} {ref ? `sells for about ${money(ref)} on TCGplayer` : "has no TCGplayer market price yet"}
              {e.change30d != null ? `, ${e.change30d >= 0 ? "up" : "down"} ${Math.abs(e.change30d)}% over 30 days` : ""}. {inStock.length ? `The cheapest in-stock listing we track is ${money(inStock[0].cents, inStock[0].currency)}.` : ""} Prices from {SITE.stores.length} stores, TCGplayer and eBay are checked every day.
            </p>
          </section>
        </div>
      </div>
      {related.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">More from {set?.name}</h2>
          <TileGrid items={related} />
        </section>
      )}
      <TcgplayerCardStrip ads={{ tcgplayer: cardAds({ setId: p.setId, kind: p.kind, exclude: p.id, fill: true }).tcgplayer }} page="card" searchUrl={adSearch(set?.name, set).tcgplayerUrl} title={`Shop ${set?.name ?? SITE.gameShort} & more on TCGplayer`} />
      <CardStickyBuyBar offers={e.offers} productId={p.id} />
    </article>
  );
}
