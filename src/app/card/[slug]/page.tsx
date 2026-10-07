import { AdSlot } from "@/components/AdSlot";
import { ebayJsonLdOffers } from "@/lib/board";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardArt, CardTile } from "@/components/CardTile";
import { CardStickyBuyBar } from "@/components/CardStickyBuyBar";
import { CardTopBuy } from "@/components/CardTopBuy";
import { EbayBuyCta } from "@/components/EbayBuyCta";
import { EbayCardBanner } from "@/components/EbayCardBanner";
import { TcgMarketPrice } from "@/components/TcgMarketPrice";
import { TcgplayerBanner } from "@/components/TcgplayerBanner";
import { LineChart } from "@/components/LineChart";
import { PriceBoard } from "@/components/PriceBoard";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { CardViewBeacon } from "@/components/CardViewBeacon";
import { DecksUsingCard } from "@/components/decks/DecksUsingCard";
import { ShareButton } from "@/components/ShareButton";
import { CardConversionCta } from "@/components/CardConversionCta";
import { CardMarketsTable } from "@/components/CardMarketsTable";
import { EbayCardPanel } from "@/components/EbayCardPanel";
import { CardNoListings } from "@/components/CardNoListings";
import { KeywordText } from "@/components/KeywordTooltip";
import { RelatedGuides } from "@/components/RelatedGuides";
import { InlineSignupPrompt } from "@/components/InlineSignupPrompt";
import { PriceWatchButton } from "@/components/PriceWatchButton";
import { PriceDropAlertCta } from "@/components/PriceDropAlertCta";
import { enabledProviders } from "@/lib/oauth";
import {
  Breadcrumbs,
  ColorBadge,
  Faq,
  JsonLd,
  PrintingBadge,
  RarityBadge,
  SectionHeader,
  StatTile,
} from "@/components/ui";
import { affiliateUrl, cardEbayQuery, outboundRel } from "@/lib/affiliate";
import { rarityLabel, SET_KINDS } from "@/lib/constants";
import { COUNTRIES, isoCountry } from "@/lib/country";
import { getCardDetail, getCatalog, getEmailStatus, getProductHistory } from "@/lib/data";
import { longDate, money, usd } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { cardImage } from "@/lib/images";
import { ReleaseAlertSlot } from "@/components/ReleaseAlertSlot";
import { headline } from "@/lib/price";
import { pageOgOwnImage } from "@/lib/og/meta";
import { cheapestBuyRow, isPreRelease } from "@/lib/quick-view";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { isStoreSource } from "@/lib/stores";
import { aliasesFor } from "@/lib/card-aliases";
import { visitorHistory } from "@/lib/price-history-view";
import { PRINTING_SHORT } from "@/lib/content/card-narrative";
import { faqLd } from "@/lib/jsonld";
import { buildNarrative } from "@/lib/content/card-narrative";
import { guidesForCatalogue } from "@/lib/content/catalogue-guides";
import { buildCardFaqs, cardMetaDescription, cardTitle } from "@/lib/card-seo";
import { cheaperAlternatives, priceToolChips, sameCharacter, sameNameCount } from "@/lib/card-related";
import { elsewhereLine, lastSeen, priceState } from "@/lib/card-price-state";
import { marketPriceListSentence, compareMarkets } from "@/lib/market-comparison";
import { KEYWORDS, KEYWORD_BY_SLUG, cardKeywords } from "@/lib/keywords";
import { marketRows } from "@/lib/quick-view";
import { MARKETS } from "@/lib/country";
import { facetBySlug, PRINTING_FACETS, RARITY_FACETS, TYPE_FACETS, leaderSlug } from "@/lib/facets";
import { COLORS } from "@/lib/constants";
import { ago } from "@/lib/format";

type Props = { params: { slug: string } };

function displayTitle(c: {
  name: string;
  variant: string | null;
  number: string | null;
}): string {
  return `${c.name}${c.variant ? ` (${c.variant})` : ""}${c.number ? ` ${c.number}` : ""}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCardDetail(params.slug);
  if (!c) return { title: "Card not found" };
  const t = displayTitle(c);
  const title = cardTitle({ name: c.name, variant: c.variant, number: c.number, setName: c.set.name, setCode: c.set.code, printing: c.printing, hasPrice: c.marketUsd != null || c.offers.some((o) => o.inStock) });
  const cat = await getCatalog();
  const lite = cat.bySlug.get(c.slug);
  const description = cardMetaDescription({
    displayName: t,
    number: c.number,
    setName: c.set.name,
    setCode: c.set.code,
    printing: c.printing,
    rarity: c.rarity,
    cardType: c.cardType,
    colors: c.colors,
    textBit: c.effect ? c.effect.split("\n")[0].slice(0, 110) : null,
    marketUsd: c.marketUsd,
    lowUsCents: lite?.low.US ?? null,
    aliases: aliasesFor(c.slug),
  });
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/card/${c.slug}` },
    // No `images`: the sibling opengraph-image.tsx draws the 1200×630 share card.
    openGraph: pageOgOwnImage(`/card/${c.slug}`, { title: `${t} | ${SITE_NAME}` }),
  };
}

export default async function CardPage({ params }: Props) {
  const country = getCountry();
  const co = COUNTRIES[country];
  const [card, cat] = await Promise.all([
    getCardDetail(params.slug),
    getCatalog(),
  ]);
  if (!card) notFound();
  const history = await getProductHistory(card.id);
  const lite = cat.bySlug.get(card.slug);
  const h = lite
    ? headline(lite, country)
    : { kind: "none" as const, cents: null, stores: 0 };
  const siblings = card.number
    ? cat.cards
        .filter((x) => x.number === card.number && x.id !== card.id)
        .sort((a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0))
    : [];
  const fromSet = cat.cards
    .filter(
      (x) =>
        x.setId === card.set.id && x.id !== card.id && x.number !== card.number,
    )
    .sort((a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0))
    .slice(0, 6);
  const title = displayTitle(card);
  const vh = visitorHistory(history, country);
  const leader = card.cardType === "Leader";
  const stats: { label: string; value: string | number }[] = [];
  if (leader && card.life != null)
    stats.push({ label: "Life", value: card.life });
  else if (card.cost != null) stats.push({ label: "Cost", value: card.cost });
  if (card.power != null)
    stats.push({ label: "Power", value: card.power.toLocaleString("en-US") });
  if (card.counter != null)
    stats.push({
      label: "Counter",
      value: `+${card.counter.toLocaleString("en-US")}`,
    });
  const inMarket = card.offers.filter((o) => o.market === country && o.inStock);
  // "N stores" counts real stores only; the TCGplayer and eBay rows are listings, not stores.
  const inStores = inMarket.filter((o) => isStoreSource(o.source));
  // The buy surfaces (top block, sticky bar, TCGplayer reference) tag their
  // links with the card's own path, like the board's rows ("-card" sub-ids).
  const loc = `/card/${card.slug}`;
  const best = cheapestBuyRow(card.offers, country, loc);
  const tcgHref = affiliateUrl(card.tcgplayerUrl, "tcgplayer", loc);
  const preRelease = isPreRelease(card.set.releasedOn, new Date().toISOString().slice(0, 10));
  // Alert copy promises an email only once a mailer is configured (cached Meta flag).
  const emailOn = (await getEmailStatus()) === "on";
  const noListingAnywhere = !card.offers.some((o) => o.inStock);
  const ebayQuery = cardEbayQuery(card);
  const cardText = card.effect ? (
    <div className="card-surface p-4">
      <p className="rb-eyebrow text-slate-500 mb-2">Card text</p>
      {card.effect.split("\n").map((l, i) => (
        <p
          key={i}
          className="mb-2 text-sm leading-relaxed text-slate-200 last:mb-0"
        >
          <KeywordText text={l} />
        </p>
      ))}
    </div>
  ) : null;

  // ── Price state, narrative, FAQ, cross-links ──
  const state = priceState(card.offers, country, { marketUsd: card.marketUsd, setKind: card.set.kind, printing: card.printing });
  const seen = lastSeen(card.offers, country);
  const elsewhere = elsewhereLine(state);
  const today = new Date().toISOString().slice(0, 10);
  const keys = cardKeywords(card.effect).map((sl) => KEYWORD_BY_SLUG.get(sl)).filter((k): k is NonNullable<typeof k> => !!k);
  const setPriced = cat.cards.filter((x) => x.setId === card.set.id && (x.marketUsd ?? 0) > 0);
  const sortedPrices = setPriced.map((x) => x.marketUsd as number).sort((a, b) => a - b);
  const marketViews = MARKETS.map((m) => {
    const rows = marketRows(card.offers, m);
    return {
      country: m,
      place: COUNTRIES[m].place,
      currency: COUNTRIES[m].currency,
      lowestCents: rows[0]?.priceCents ?? null,
      secondCents: rows[1]?.priceCents ?? null,
      storeCount: new Set(rows.filter((r) => isStoreSource(r.source)).map((r) => r.source)).size,
      listingCount: rows.length,
    };
  });
  const baseSibling = siblings.find((x) => x.printing === "standard");
  const narrative = buildNarrative({
    name: card.name,
    variant: card.variant,
    number: card.number,
    printing: card.printing,
    setName: card.set.name,
    setCode: card.set.code,
    setKind: card.set.kind,
    releasedOn: card.set.releasedOn,
    today,
    rarity: card.rarity,
    cardType: card.cardType,
    colors: card.colors,
    cost: card.cost,
    power: card.power,
    counter: card.counter,
    life: card.life,
    attribute: card.attribute,
    subtypes: card.subtypes,
    keywords: keys.filter((k) => k.kind === "keyword").map((k) => k.name),
    timings: keys.filter((k) => k.kind === "timing").map((k) => k.name),
    hasText: !!card.effect,
    marketUsd: card.marketUsd,
    change7d: card.change7d,
    change30d: card.change30d,
    high90Usd: lite?.high90Usd ?? null,
    baseline: marketViews.find((m) => m.country === country)!,
    markets: marketViews,
    printings: siblings.map((x) => ({ label: PRINTING_SHORT[x.printing] ?? "Other", marketUsd: x.marketUsd })),
    setContext:
      card.marketUsd != null && setPriced.length >= 10
        ? { pricedInSet: setPriced.length, cheaperThan: sortedPrices.filter((v) => v < card.marketUsd!).length, medianUsd: sortedPrices[Math.floor(sortedPrices.length / 2)] ?? null }
        : null,
    sameNameElsewhere: lite ? sameNameCount(lite, cat.cards) : 0,
  });
  const cmpHere = compareMarkets(card.offers, co.currency);
  const faqs = buildCardFaqs({
    name: card.name,
    displayName: title,
    number: card.number,
    setName: card.set.name,
    setCode: card.set.code,
    rarity: card.rarity,
    cardType: card.cardType,
    colors: card.colors,
    printing: card.printing,
    country,
    lowest: h.kind === "listing" ? h.cents : null,
    stores: h.kind === "listing" ? h.stores : 0,
    printingCount: siblings.length,
    marketUsd: card.marketUsd,
    baseMarketUsd: baseSibling?.marketUsd ?? null,
    currencyAnswer: cmpHere.quotes.length >= 2 ? marketPriceListSentence(cmpHere) : null,
    preRelease,
  });
  const cheaper = lite ? cheaperAlternatives(lite, cat.cards) : [];
  const sameChar = lite ? sameCharacter(lite, cat.cards) : [];
  const tools = priceToolChips({ cardType: card.cardType, name: card.name, setSlug: card.set.slug, hasSealed: card.set.sealedCount > 0, priced: state.hasListings || card.marketUsd != null });
  const inStockPrintings = siblings.filter((x) => Object.values(x.low).some((v) => v != null)).length;
  const typeFacet = card.cardType ? facetBySlug(TYPE_FACETS, card.cardType.toLowerCase()) : undefined;
  const rarityFacet = card.rarity ? RARITY_FACETS.find((f) => f.key === card.rarity) : undefined;
  const printingFacet = PRINTING_FACETS.find((f) => f.key === card.printing);
  const guides = guidesForCatalogue("card");

  const ebayLd = ebayJsonLdOffers(inMarket, co.currency, isoCountry(country));
  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: title,
          sku: card.number ?? String(card.id),
          image: card.hasImage ? cardImage.large(card.id) : undefined,
          brand: { "@type": "Brand", name: "One Piece Card Game" },
          category: "Trading card",
          url: `${SITE_URL}/card/${card.slug}`,
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
                  availability: "https://schema.org/InStock",
                  ...(ebayLd.length ? { offers: ebayLd } : {}),
                },
              }
            : {}),
        }}
      />
      {faqs.length ? <JsonLd data={faqLd(faqs)} /> : null}
      <Breadcrumbs
        trail={[
          { href: "/browse", name: "Cards" },
          { href: `/sets/${card.set.slug}`, name: card.set.name },
          { name: card.name },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ── Art + card text ── */}
        <div className="min-w-0 space-y-4">
          <div className="card-surface p-4">
            <CardArt
              id={card.id}
              hasImage={card.hasImage}
              alt={`${title} — One Piece Card Game`}
              size="large"
            />
          </div>
          {cardText ? <div className="hidden lg:block">{cardText}</div> : null}
        </div>

        {/* ── Header, stats, board ── */}
        <div className="min-w-0 space-y-6">
          <div className="card-surface p-5">
            <div className="flex flex-wrap items-center gap-2">
              {card.colors.map((c) => (
                <ColorBadge key={c} color={c} />
              ))}
              <RarityBadge rarity={card.rarity} />
              {card.cardType ? (
                <span className="chip border border-ink-700 bg-ink-850 text-slate-200">
                  {card.cardType}
                </span>
              ) : null}
              <PrintingBadge printing={card.printing} variant={card.variant} />
            </div>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3 sm:mt-3">
              <div className="min-w-0 flex-[1_1_12rem]">
                <h1 className="text-xl font-extrabold leading-tight text-white sm:text-2xl">
                  {card.name}
                  {card.variant ? (
                    <span className="block text-lg font-bold text-slate-300 sm:text-xl">
                      {card.variant}
                    </span>
                  ) : null}
                </h1>
                <p className="num mt-1 text-sm text-slate-400">
                  <Link
                    href={`/sets/${card.set.slug}`}
                    className="hover:text-white"
                  >
                    {card.set.name} ({card.set.code})
                  </Link>
                  {card.number ? (
                    <>
                      {" · "}
                      <span className="whitespace-nowrap">{card.number}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                <PriceWatchButton cardId={card.id} slug={card.slug} name={title} variant="responsive" />
                <ShareButton responsive />
              </div>
            </div>
            {aliasesFor(card.slug).length ? <p className="mt-2 text-sm text-slate-400">Also known as {aliasesFor(card.slug).map((a) => `“${a}”`).join(", ")}</p> : null}
            <CardTopBuy best={best} country={country} page="card" slug={card.slug} />
            <PriceDropAlertCta
              cardId={card.id}
              slug={card.slug}
              name={title}
              cardPath={loc}
              providers={enabledProviders()}
              unpriced={inMarket.length === 0}
              preorder={preRelease}
              emailOn={emailOn}
            />
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
                      : seen
                        ? money(seen.priceCents, country)
                        : "—"}
                </p>
                {h.kind === "none" && seen ? <p className="mt-0.5 text-[11px] text-slate-500">Last seen {ago(seen.at)}</p> : null}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  In stock at · {co.code}
                </p>
                <p className="num mt-1 text-xl font-bold text-white">
                  {inStores.length} {inStores.length === 1 ? "store" : "stores"}
                </p>
                {elsewhere ? <p className="mt-0.5 text-[11px] text-slate-500">{elsewhere}</p> : null}
              </div>
              {stats.slice(0, 2).map((s) => (
                <div key={s.label}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {s.label}
                  </p>
                  <p className="num mt-1 text-xl font-bold text-white">
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* A card from an unreleased set, or one no market stocks: eBay's
              search is the way to buy it (RiftCompare's EbayBuyCta). */}
          {preRelease || noListingAnywhere ? (
            <EbayBuyCta
              query={ebayQuery}
              name={title}
              heading={preRelease ? undefined : `Search eBay for ${title}`}
              preRelease={preRelease}
              source={preRelease ? "card-prerelease" : "card-no-listing"}
              page="card"
              card={card.slug}
            />
          ) : null}

          <ReleaseAlertSlot setSlug={card.set.slug} setName={card.set.name} releasedOn={card.set.releasedOn} source="card" cardId={card.id} cardName={title} unreleasedOnly />

          <p className="text-right text-xs text-slate-400">
            Cheapest first by item price; postage is added at each store&apos;s
            checkout.{" "}
            <Link href="/methodology" className="text-brand-400 hover:underline">
              How we compare prices →
            </Link>
          </p>

          {!state.hasListings || (state.noRetailChannel && !state.inMarket) ? (
            <CardNoListings cardId={card.id} name={title} slug={card.slug} country={country} state={state} setName={card.set.name} setSlug={card.set.slug} preRelease={preRelease} inStockPrintings={inStockPrintings} />
          ) : null}

          <PriceBoard
            productId={card.id}
            offers={card.offers}
            country={country}
            ebayQuery={ebayQuery}
            page="card"
            id="price-comparison"
            slug={card.slug}
            name={title}
            preRelease={preRelease}
          />
          <CardConversionCta cardId={card.id} slug={card.slug} name={title} />
          {/* Under the comparison, never in it: TCGplayer's market price as a
              reference with its affiliate button, then the card's eBay banner
              and TCGplayer's (ads: hidden for Plus and Premium members). */}
          <TcgMarketPrice marketUsd={card.marketUsd} country={country} href={tcgHref} page="card" card={card.slug} />
          <EbayCardBanner country={country} query={ebayQuery} name={title} page="card" card={card.slug} />
          <TcgplayerBanner country={country} page="card" card={card.slug} />
          {cardText ? <div className="lg:hidden">{cardText}</div> : null}

          <section className="card-surface p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg text-white">{vh.title}</h2>
              <p className="text-xs text-slate-400">
                TCGplayer market shown in {vh.currency} at an indicative rate{vh.lowSince && vh.lowDays < history.length ? `; ${co.place} listing history starts ${longDate(vh.lowSince)}` : ""}
              </p>
            </div>
            <LineChart
              series={[
                { label: `Cheapest ${co.adjective} listing`, color: "#ff6b6b", points: vh.low.points },
                { label: "TCGplayer market (converted)", color: "#e9b73a", points: vh.market.points, dashed: true },
              ]}
              format={(v) => money(Math.round(v), country)}
              empty={`Price history starts ${history[0] ? longDate(history[0].day) : "with the first import"} — the chart draws once there are two days of prices.`}
            />
          </section>

          <InlineSignupPrompt surface="card" title="Get the top deals in your market, free" body="A free account shows Deal Finder's three biggest savings in your market right now, and is how you get Plus or Premium when you want them." />

          {/* ── Our own analysis: leads over the FAQ and the affiliate blocks ── */}
          <section className="card-surface p-5" aria-label={`About ${card.name}`}>
            <h2 className="font-bold text-white">About {card.name}</h2>
            <div className="mt-3 max-w-3xl space-y-3 text-sm leading-relaxed text-slate-300">
              {narrative.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {card.effect ? (
                <p className="text-slate-400">
                  <KeywordText text={card.effect.replace(/\n+/g, " ")} />
                </p>
              ) : null}
            </div>
            {card.subtypes.length || keys.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {card.subtypes.map((t) => (
                  <Link key={t} href={`/browse?q=${encodeURIComponent(t)}`} className="chip bg-ink-800 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-200">
                    {t}
                  </Link>
                ))}
                {keys.map((k) => (
                  <Link key={k.slug} href={`/keywords/${k.slug}`} className="chip bg-ink-800 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-200">
                    [{k.name}]
                  </Link>
                ))}
              </div>
            ) : null}
            {/* Facet chips render only where the page they point at exists. */}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-800 pt-4">
              {typeFacet ? (
                <Link href={`/cards/type/${typeFacet.slug}`} className="chip bg-ink-800 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-200">
                  More {typeFacet.label} cards →
                </Link>
              ) : null}
              {rarityFacet ? (
                <Link href={`/cards/rarity/${rarityFacet.slug}`} className="chip bg-ink-800 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-200">
                  More {rarityFacet.label} cards →
                </Link>
              ) : null}
              {printingFacet && card.printing !== "standard" ? (
                <Link href={`/cards/printing/${printingFacet.slug}`} className="chip bg-ink-800 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-200">
                  More {printingFacet.label} cards →
                </Link>
              ) : null}
              {card.colors.map((c) =>
                COLORS[c as keyof typeof COLORS] ? (
                  <Link key={c} href={`/colors/${COLORS[c as keyof typeof COLORS].slug}`} className="chip bg-ink-800 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-200">
                    More {c} cards →
                  </Link>
                ) : null,
              )}
              {card.cardType === "Leader" && card.number ? (
                <Link href={`/leaders/${leaderSlug(card.name, card.number)}`} className="chip bg-ink-800 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-200">
                  {card.name} decks and cards →
                </Link>
              ) : null}
            </div>
          </section>

          <section className="card-surface p-5">
            <h2 className="font-bold text-white">Frequently asked questions</h2>
            <dl className="mt-3 space-y-4">
              {faqs.map((f) => (
                <div key={f.q}>
                  <dt className="font-semibold text-white">{f.q}</dt>
                  <dd className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <CardMarketsTable offers={card.offers} name={card.name} country={country} />
          <AdSlot slot="card" thin={!state.hasListings && card.marketUsd == null} />

          <section className="card-surface p-5" aria-label="Do more with this price">
            <h2 className="font-bold text-white">Do more with this price</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {tools.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="block rounded-lg border border-ink-700 bg-ink-850 p-3 transition-colors hover:border-ink-600 hover:bg-ink-800">
                    <span className="block text-sm font-semibold text-white">{t.label} →</span>
                    <span className="mt-0.5 block text-xs text-slate-400">{t.sub}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="card-surface p-5">
            <h2 className="mb-3 text-lg text-white">Card details</h2>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              {[
                ["Card number", card.number ?? "—"],
                ["Set", `${card.set.name} (${card.set.code})`],
                ["Set type", SET_KINDS[card.set.kind]?.label ?? card.set.kind],
                [
                  "Released",
                  card.set.releasedOn ? longDate(card.set.releasedOn) : "—",
                ],
                [
                  "Rarity",
                  `${rarityLabel(card.rarity)}${card.rarity && card.rarity !== rarityLabel(card.rarity) ? ` (${card.rarity})` : ""}`,
                ],
                ["Printing", card.variant ?? "Standard"],
                ["Card type", card.cardType ?? "—"],
                ["Colour", card.colors.join(" / ") || "—"],
                ...stats.map(
                  (s) => [s.label, String(s.value)] as [string, string],
                ),
                ["Attribute", card.attribute ?? "—"],
                ["Types", card.subtypes.join(", ") || "—"],
                ["Finish", card.finish ?? "—"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between gap-4 border-b border-ink-800 py-1.5"
                >
                  <dt className="text-slate-400">{k}</dt>
                  <dd className="text-right font-medium text-slate-100">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              TCGplayer listing:{" "}
              <a
                href={tcgHref}
                className="underline hover:text-slate-300"
                rel={outboundRel()}
                target="_blank"
                data-retailer="tcgplayer"
                data-page="card"
                data-card={card.slug}
                data-surface="card_details"
              >
                {card.tcgName}
              </a>
            </p>
          </section>

          {/* The last in-column section: captured eBay listings and slabs. */}
          <EbayCardPanel productId={card.id} country={country} query={ebayQuery} name={title} card={card.slug} rawCents={lite?.low[country] ?? null} preRelease={preRelease} />
        </div>
      </div>

      {siblings.length ? (
        <section id="printings" className="mt-10 scroll-mt-20">
          <SectionHeader
            title={`Other printings of ${card.number}`}
            sub={`The same card in other art, finishes and promo releases — priced in ${co.place}.`}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {siblings.slice(0, 12).map((s) => (
              <CardTile
                key={s.id}
                card={s}
                setCode={cat.setById.get(s.setId)?.code ?? ""}
                country={country}
              />
            ))}
          </div>
        </section>
      ) : null}

      {cheaper.length ? (
        <section className="mt-10">
          <SectionHeader title={`Cheaper ${card.colors[0] ?? ""} ${card.cardType ?? "card"}s in ${card.set.name}`.replace(/\s+/g, " ")} sub="Same set, colour and type, strictly cheaper on TCGplayer." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {cheaper.map((s) => (
              <CardTile key={s.id} card={s} setCode={card.set.code} country={country} />
            ))}
          </div>
        </section>
      ) : null}

      {sameChar.length ? (
        <section className="mt-10">
          <SectionHeader title={`More ${card.name} cards`} sub="Every other card with this name, across sets." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {sameChar.map((s) => (
              <CardTile key={s.id} card={s} setCode={cat.setById.get(s.setId)?.code ?? ""} country={country} />
            ))}
          </div>
        </section>
      ) : null}

      {fromSet.length ? (
        <section className="mt-10">
          <SectionHeader
            title={`More from ${card.set.name}`}
            action={
              <Link href={`/sets/${card.set.slug}`} className="btn-ghost">
                Full {card.set.code} list →
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {fromSet.map((s) => (
              <CardTile
                key={s.id}
                card={s}
                setCode={card.set.code}
                country={country}
              />
            ))}
          </div>
        </section>
      ) : null}

      <DecksUsingCard cardId={card.id} />

      <CardViewBeacon slug={card.slug} cardId={card.id} cardName={card.name} rarity={card.rarity} />
      <RecentlyViewed className="mt-10" record={{ slug: card.slug, name: card.name, variant: card.variant, setCode: card.set.code, number: card.number, img: card.hasImage ? cardImage.thumb(card.id) : null }} />

      <RelatedGuides guides={guides} className="card-surface mt-10 p-5" />
      {best ? (
        <CardStickyBuyBar
          boardId="price-comparison"
          price={money(best.priceCents, country)}
          store={best.label}
          href={best.href}
          retailer={best.retailer}
          ebay={best.ebay}
          page="card"
          slug={card.slug}
          name={title}
          cardId={card.id}
        />
      ) : null}
    </div>
  );
}
