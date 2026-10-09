import { ebayJsonLdOffers } from "@/lib/board";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LineChart } from "@/components/LineChart";
import { CardMarketsTable } from "@/components/CardMarketsTable";
import { EbayCardPanel } from "@/components/EbayCardPanel";
import { PriceBoard } from "@/components/PriceBoard";
import { SealedTile } from "@/components/SealedTile";
import { TcgMarketPrice } from "@/components/TcgMarketPrice";
import { ShareButton } from "@/components/ShareButton";
import { SealedWatchButton } from "@/components/SealedWatchButton";
import { Breadcrumbs, Faq, JsonLd, SectionHeader } from "@/components/ui";
import { affiliateUrl } from "@/lib/affiliate";
import { tcgplayerUrl } from "@/lib/constants";
import { tcgplayerImage } from "@/lib/images";
import { sealedEbayQuery } from "@/lib/sealed-quick-view";
import { COUNTRIES, isoCountry } from "@/lib/country";
import {
  getSealedAll,
  getSealedDetail,
  getSets,
  getUnitHistory,
} from "@/lib/data";
import { longDate, money, usd } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { headline } from "@/lib/price";
import { pageOgOwnImage } from "@/lib/og/meta";
import { isPreRelease } from "@/lib/quick-view";
import { ReleaseAlertSlot } from "@/components/ReleaseAlertSlot";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { isStoreSource } from "@/lib/stores";
import { visitorHistory } from "@/lib/price-history-view";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await getSealedDetail(params.slug);
  if (!s) return { title: "Product not found" };
  const t = `${s.name} Price`;
  return {
    title: { absolute: t.length <= 60 ? t : `${s.name.slice(0, 50)} Price` },
    description: `${s.name}: live Magic: The Gathering sealed prices compared across stores in the US, Australia, the UK, Singapore, Canada and the EU${s.marketUsd ? `. TCGplayer market price ${usd(s.marketUsd)}` : ""}.`,
    alternates: { canonical: `/sealed/${s.slug}` },
    // No `images`: the sibling opengraph-image.tsx draws the 1200×630 share card.
    openGraph: pageOgOwnImage(`/sealed/${s.slug}`, {
      title: `${s.name} | ${SITE_NAME}`,
    }),
  };
}

export default async function SealedDetailPage({ params }: Props) {
  const country = getCountry();
  const co = COUNTRIES[country];
  const [s, sets, all] = await Promise.all([
    getSealedDetail(params.slug),
    getSets(),
    getSealedAll(),
  ]);
  if (!s) notFound();
  const setById = new Map(sets.map((x) => [x.id, x] as const));
  const imageUrl = tcgplayerImage(s.id, "400w");
  let history: Awaited<ReturnType<typeof getUnitHistory>> = [];
  try {
    history = await getUnitHistory({ id: s.id, finish: "N" });
  } catch {
    history = [];   // the chart is decoration: a history read that fails leaves it empty, the page and its indexability stand
  }
  const vh = visitorHistory(history, country);
  const lite = all.find((x) => x.id === s.id);
  const h = lite
    ? headline(lite, country)
    : { kind: "none" as const, cents: null, stores: 0 };
  const set = s.setId ? setById.get(s.setId) : undefined;
  const inMarket = s.offers.filter((o) => o.market === country && o.inStock);
  // "N stores" counts real stores only; the TCGplayer and eBay rows are listings, not stores.
  const inStores = inMarket.filter((o) => isStoreSource(o.source));
  const perPack =
    s.packCount && s.packCount > 1 && h.cents != null
      ? Math.round(h.cents / s.packCount)
      : null;
  const sameSet = all
    .filter(
      (x) => x.setId === s.setId && x.id !== s.id && x.kind !== "Secret Lair Drop",
    )
    .slice(0, 6);
  const sameKind = all
    .filter((x) => x.kind === s.kind && x.id !== s.id && x.setId !== s.setId)
    .sort((a, b) =>
      (
        b.releasedOn ??
        setById.get(b.setId ?? 0)?.releasedOn ??
        ""
      ).localeCompare(
        a.releasedOn ?? setById.get(a.setId ?? 0)?.releasedOn ?? "",
      ),
    )
    .slice(0, 6);
  const ebayQ = sealedEbayQuery(
    s.name.replace(/\s+-\s+/, " "),
  ).replace(/\b(booster box|booster display)\b/i, "booster (box,display)");

  const ebayLd = ebayJsonLdOffers(inMarket, co.currency, isoCountry(country));
  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: s.name,
          image: imageUrl,
          brand: { "@type": "Brand", name: "Magic: The Gathering" },
          url: `${SITE_URL}/sealed/${s.slug}`,
          ...(inMarket.length
            ? {
                offers: {
                  "@type": "AggregateOffer",
                  priceCurrency: co.currency,
                  lowPrice: (
                    Math.min(...inMarket.map((o) => o.priceCents)) / 100
                  ).toFixed(2),
                  highPrice: (
                    Math.max(...inMarket.map((o) => o.priceCents)) / 100
                  ).toFixed(2),
                  offerCount: inMarket.length,
                  ...(ebayLd.length ? { offers: ebayLd } : {}),
                },
              }
            : {}),
        }}
      />
      <Breadcrumbs
        trail={[
          { href: "/sealed", name: "Sealed" },
          ...(set ? [{ href: `/sets/${set.slug}`, name: set.name }] : []),
          { name: s.name },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="card-surface h-fit bg-white/95 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`${s.name} — Magic: The Gathering sealed product`}
            className="mx-auto aspect-square w-full object-contain"
          />
        </div>
        <div className="min-w-0 space-y-6">
          <div className="card-surface p-5">
            <div className="flex flex-wrap gap-2">
              <span className="chip border border-ink-700 bg-ink-850 font-semibold text-slate-200">
                {s.kind}
              </span>
              {set ? (
                <span className="chip border border-ink-700 bg-ink-850 text-slate-300">
                  {set.code}
                </span>
              ) : null}
              {s.presale ? (
                <span className="chip bg-gold/20 font-semibold text-gold">
                  Pre-order
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3 sm:mt-3">
              <div className="min-w-0 flex-[1_1_12rem]">
                <h1 className="text-xl font-extrabold leading-tight text-white sm:text-2xl">
                  {s.name}
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  {set ? (
                    <Link
                      href={`/sets/${set.slug}`}
                      className="hover:text-white"
                    >
                      {set.name}
                    </Link>
                  ) : (
                    "Magic: The Gathering"
                  )}
                  {s.releasedOn || set?.releasedOn
                    ? ` · released ${longDate(s.releasedOn ?? set?.releasedOn)}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                <SealedWatchButton sealedId={s.id} slug={s.slug} name={s.name} className="max-w-xs" />
                <ShareButton responsive />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Cheapest · {co.place}
                </p>
                <p className="num mt-1 text-xl font-bold text-accent">
                  {h.kind === "listing"
                    ? money(h.cents, country)
                    : h.kind === "reference"
                      ? `≈ ${money(h.cents, country)}`
                      : "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  In stock at · {co.code}
                </p>
                <p className="num mt-1 text-xl font-bold text-white">
                  {inStores.length} {inStores.length === 1 ? "store" : "stores"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Per pack
                </p>
                <p className="num mt-1 text-xl font-bold text-white">
                  {perPack ? money(perPack, country) : "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  TCGplayer market
                </p>
                <p className="num mt-1 text-xl font-bold text-white">
                  {s.marketUsd ? usd(s.marketUsd) : "—"}
                </p>
              </div>
            </div>
          </div>
          <PriceBoard
            productId={s.id}
            offers={s.offers}
            country={country}
            ebayQuery={ebayQ}
            page="sealed"
            noun="product"
            slug={s.slug}
            name={s.name}
            preRelease={
              s.presale ||
              isPreRelease(
                s.releasedOn ?? set?.releasedOn ?? null,
                new Date().toISOString().slice(0, 10),
              )
            }
          />
          {s.presale && set ? <ReleaseAlertSlot setSlug={set.slug} setName={set.name} releasedOn={set.releasedOn} source="sealed" unreleasedOnly /> : null}
          <CardMarketsTable offers={s.offers} name={s.name} country={country} noun="price by market" />
          {/* TCGplayer's market price: a reference under the comparison, with
              its affiliate button — never a row in it. */}
          <TcgMarketPrice
            marketUsd={s.marketUsd}
            country={country}
            href={affiliateUrl(tcgplayerUrl(s.id, "N"), "tcgplayer", `/sealed/${s.slug}`)}
            page="sealed"
            card={s.slug}
          />
          <section className="card-surface p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg text-white">{vh.title}</h2>
              <p className="text-xs text-slate-400">TCGplayer market shown in {vh.currency} at an indicative rate{vh.lowSince && vh.lowDays < history.length ? `; ${co.place} listing history starts ${longDate(vh.lowSince)}` : ""}</p>
            </div>
            <LineChart
              series={[
                { label: `Cheapest ${co.adjective} listing`, color: "#a259e6", points: vh.low.points },
                { label: "TCGplayer market (converted)", color: "#e9b73a", points: vh.market.points, dashed: true },
              ]}
              format={(v) => money(Math.round(v), country)}
              empty="The chart draws once there are two days of prices."
            />
          </section>
          {/* Listings tab only: no graded slabs for sealed product. */}
          <EbayCardPanel productId={s.id} country={country} query={ebayQ} name={s.name} card={s.slug} page="sealed" sealed preRelease={s.presale || isPreRelease(s.releasedOn ?? set?.releasedOn ?? null, new Date().toISOString().slice(0, 10))} />
        </div>
      </div>
      {sameSet.length ? (
        <section className="mt-10">
          <SectionHeader title={`More ${set?.code ?? ""} sealed`} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {sameSet.map((x) => (
              <SealedTile
                key={x.id}
                s={x}
                country={country}
                setCode={set?.code}
              />
            ))}
          </div>
        </section>
      ) : null}
      {sameKind.length ? (
        <section className="mt-10">
          <SectionHeader
            title={`Other ${s.kind.toLowerCase()}s`}
            sub="The same product type from other sets, newest first."
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {sameKind.map((x) => (
              <SealedTile
                key={x.id}
                s={x}
                country={country}
                setCode={x.setId ? setById.get(x.setId)?.code : null}
              />
            ))}
          </div>
        </section>
      ) : null}
      <section className="mt-10">
        <SectionHeader title="Questions" />
        <Faq
          items={[
            {
              q: `How much is ${s.name}?`,
              a: `${h.kind === "listing" ? `The cheapest in-stock offer we track in ${co.place} is ${money(h.cents, country)}` : `No ${co.adjective} store we track has it in stock right now`}${
                s.marketUsd
                  ? `; TCGplayer's market price is ${usd(s.marketUsd)}`
                  : ""
              }. Postage is added at each store's checkout.`,
            },
            ...(s.packCount && s.packCount > 1
              ? [
                  {
                    q: "How many packs are inside?",
                    a: `${s.packCount} packs.${perPack ? ` At the cheapest ${co.adjective} price that is ${money(perPack, country)} a pack.` : ""}`,
                  },
                ]
              : []),
          ]}
        />
      </section>
    </div>
  );
}
