import { AdSlot } from "@/components/AdSlot";
import { ebayJsonLdOffers } from "@/lib/board";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardArt, CardTile } from "@/components/CardTile";
import { UntrackedPriceNotice } from "@/components/CardTopBuy";
import { EbayBuyCta } from "@/components/EbayBuyCta";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { CardViewBeacon } from "@/components/CardViewBeacon";
import { DecksUsingCard } from "@/components/decks/DecksUsingCard";
import { ShareButton } from "@/components/ShareButton";
import { CardConversionCta } from "@/components/CardConversionCta";
import {
  MarketAlertCta,
  MarketBanners,
  MarketBoard,
  MarketBuyPair,
  MarketEbayPanel,
  MarketFaq,
  MarketHistory,
  MarketLastKnown,
  MarketNoListings,
  MarketParagraphs,
  MarketPlace,
  MarketStickyBuyBar,
  MarketTable,
  MarketTcgReference,
  MarketTiles,
  MarketTopBuy,
  type HistoryTuple,
  type MarketTile,
} from "@/components/card/CardMarket";
import { KeywordText } from "@/components/KeywordTooltip";
import { RelatedGuides } from "@/components/RelatedGuides";
import { InlineSignupPrompt } from "@/components/InlineSignupPrompt";
import { PriceWatchButton } from "@/components/PriceWatchButton";
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
import {
  availableFinishes,
  colorMask,
  colorsOfMask,
  COLORS,
  finishLabel,
  FORMAT_LABEL,
  FORMAT_UI,
  legalityOf,
  ORACLE_FLAGS,
  parseFinishParam,
  PRIMARY_TYPES,
  PRIMARY_TYPE_LABEL,
  rarityLabel,
  SET_KINDS,
  tcgplayerUrl,
  trackedBits,
  type Finish,
} from "@/lib/constants";
import { COUNTRIES, DEFAULT_COUNTRY, MARKETS, isoCountry, type Country } from "@/lib/country";
import { getCardDetail, getCardPage, getEmailStatus, getUnitHistory, type CardLite, type HistoryPoint } from "@/lib/data";
import { longDate, usd } from "@/lib/format";
import { cardImage } from "@/lib/images";
import { tileCard } from "@/lib/tile";
import { thinHistory } from "@/lib/chart";
import { cardImageAlt } from "@/lib/image-alt";
import { ReleaseAlertSlot } from "@/components/ReleaseAlertSlot";
import { finishPrice, headline } from "@/lib/price";
import { pageOgOwnImage } from "@/lib/og/meta";
import { LAST_KNOWN_DAYS, cheapestBuyRow, isPreRelease } from "@/lib/quick-view";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { isStoreSource } from "@/lib/stores";
import { aliasesFor } from "@/lib/card-aliases";
import { lastKnownEligible, lastKnownPrice, visitorHistory } from "@/lib/price-history-view";
import { PRINTING_SHORT } from "@/lib/content/card-narrative";
import { faqLd } from "@/lib/jsonld";
import { buildNarrative } from "@/lib/content/card-narrative";
import { guidesForCatalogue } from "@/lib/content/catalogue-guides";
import { buildCardFaqs, cardMetaDescription, cardTitle } from "@/lib/card-seo";
import { cheaperAlternatives, priceToolChips, sameCharacter, sameNameCount } from "@/lib/card-related";
import { elsewhereLine, lastSeen, priceState } from "@/lib/card-price-state";
import { marketPriceListSentence, compareMarkets } from "@/lib/market-comparison";
import { boardModel } from "@/lib/board-model";
import { marketsTableData } from "@/lib/markets-table";
import { perMarket, perMarketList, pickMarketList } from "@/lib/per-market";
import { KEYWORDS, KEYWORD_BY_SLUG, cardKeywords } from "@/lib/keywords";
import { marketRows } from "@/lib/quick-view";
import { facetBySlug, PRINTING_FACETS, RARITY_FACETS, TREATMENT_FACETS, TYPE_FACETS } from "@/lib/facets";

type Props = { params: { slug: string }; searchParams?: { finish?: string } };

// The published data is read per request (force-dynamic): a build prerenders no card page.
export const dynamic = "force-dynamic";

function displayTitle(c: { name: string; variant: string | null; number: string | null }): string {
  return `${c.name}${c.variant ? ` (${c.variant})` : ""}${c.number ? ` ${c.number}` : ""}`;
}

const NO_LOW = { US: null, AU: null, UK: null, CA: null, EU: null, SG: null } as const;
const NO_STORES = { US: 0, AU: 0, UK: 0, CA: 0, EU: 0, SG: 0 } as const;

/** A list loader that fails closed: an empty list, never a broken page. */
async function safe<T>(p: Promise<T>, empty: T): Promise<T> {
  try {
    return await p;
  } catch {
    return empty;
  }
}

/** The market the cached HTML is rendered on: its metadata, JSON-LD and first paint (the islands re-draw the visitor's after hydration). */
const BASELINE: Country = DEFAULT_COUNTRY;
const pickKnown = <T,>(pm: { values: T[]; at: Record<Country, number> }, m: Country): T => pm.values[pm.at[m]]!;
/** A history day's per-market lows without the trailing nulls (most cards are listed in one or two markets). */
function trimNulls(a: (number | null)[]): (number | null)[] {
  let n = a.length;
  while (n > 0 && a[n - 1] == null) n--;
  return a.slice(0, n);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCardDetail(params.slug);
  if (!c) return { title: "Card not found" };
  const t = displayTitle(c);
  // A THIN printing is outside the relevant quarter: no price anywhere on the page, so none in its title or description either.
  const priced = !c.thin;
  const title = cardTitle({ name: c.name, variant: c.variant, number: c.number, setName: c.set.name, setCode: c.set.code, printing: c.printing, hasPrice: priced && (c.marketUsd != null || c.offers.some((o) => o.inStock)) });
  const description = cardMetaDescription({
    displayName: t,
    number: c.number,
    setName: c.set.name,
    setCode: c.set.code,
    printing: c.printing,
    rarity: c.rarity,
    cardType: c.cardType,
    colors: c.colors,
    textBit: c.oracle?.oracleText ? c.oracle.oracleText.split("\n")[0]!.slice(0, 110) : null,
    marketUsd: priced ? c.marketUsd : null,
    lowUsCents: priced ? (c.low.US ?? null) : null,
    aliases: aliasesFor(c.slug),
  });
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/card/${c.slug}` },
    // A THIN page (outside the relevant quarter, RELEVANT_SHARE) stays reachable and out of search results.
    ...(c.thin ? { robots: { index: false, follow: true } } : {}),
    // No `images`: the sibling opengraph-image.tsx draws the 1200×630 share card.
    openGraph: pageOgOwnImage(`/card/${c.slug}`, { title: `${t} | ${SITE_NAME}` }),
  };
}

export default async function CardPage({ params, searchParams }: Props) {
  // ONE PAGE FOR EVERY MARKET (DECISIONS.md, "One card page for every market", 2026-10-19): nothing here reads the visitor
  // (no getCountry, cookie or header), so Vercel's CDN keeps one copy per URL. The HTML is rendered on the baseline market and
  // its metadata and JSON-LD state that market; every market-dependent part is computed below for ALL markets (lib/per-market.ts)
  // and drawn by the islands of components/card/CardMarket.tsx in the market CountryProvider resolves.
  const card = await getCardDetail(params.slug);
  if (!card) notFound();
  const co = COUNTRIES[BASELINE];
  // The render's clock: "updated 3h ago" reads the same on the server and in the hydrating browser.
  const now = Date.now();
  // Outside the relevant quarter (the THIN bit, track.ts relevantRows): no price board, store rows, history or price FAQ; the TCGplayer and eBay buttons stay.
  const untracked = card.thin;

  // The unit on show: a price belongs to a (product, finish). ?finish= picks the tab; the default is the headline unit.
  const finishes: Finish[] = availableFinishes(card.mask).length ? availableFinishes(card.mask) : [card.headFinish];
  const asked = parseFinishParam(searchParams?.finish)?.finish;
  const finish: Finish = asked && finishes.includes(asked) ? asked : card.headFinish;
  const quote = finishPrice(card, finish);
  const unit = card.units.find((u) => u.finish === finish);
  const unitLow = unit?.low ?? (finish === card.headFinish ? card.low : NO_LOW);
  const unitStores = unit?.stores ?? (finish === card.headFinish ? card.stores : NO_STORES);
  const marketUsd = quote?.market ?? null;
  const unitChange7d = finish === card.headFinish ? card.change7d : (unit?.change7d ?? null);
  const unitChange30d = finish === card.headFinish ? card.change30d : (unit?.change30d ?? null);
  const unitHigh90 = finish === card.headFinish ? card.high90Usd : unit?.high90 != null ? unit.high90 : null;
  const headOf = (m: Country) => headline({ low: unitLow as CardLite["low"], stores: unitStores as CardLite["stores"], marketUsd }, m);
  const offers = card.offers.filter((o) => o.finish === finish);
  const anyInStock = offers.some((o) => o.inStock);
  // No current price in a market: a sold-out listing seen there fills the price spot first ("Last seen"), then the unit's
  // OWN history (its last known price, muted and dated: lastKnownEligible, DECISIONS "Last known price"), else "—".
  // Display only: nothing below (JSON-LD, metadata, FAQ, narrative, buy bars, alerts, eBay) reads `lastKnown`.
  const wantKnown = (m: Country): boolean => (card.thin || !lastSeen(offers, m)) && lastKnownEligible(card, finish, headOf(m), anyInStock);

  const oracle = card.oracle;
  const trackedFinish = (trackedBits(card.mask) & (finish === "N" ? 1 : 2)) !== 0;
  const mask = colorMask(card.colors);
  const typeKey = PRIMARY_TYPES[card.ptype];
  const cheaperMax = marketUsd != null && !untracked ? marketUsd - 1 : null;
  const [history, pastHistory, printingsPage, setTopPage, cheaperPage] = await Promise.all([
    trackedFinish ? safe(getUnitHistory({ id: card.id, finish }, 365), [] as HistoryPoint[]) : Promise.resolve([] as HistoryPoint[]),
    // A unit that left tracking keeps its series (history-codec.ts): read it only for the last known price of a unit with none now; the chart stays tracked-only.
    !trackedFinish && MARKETS.some(wantKnown) ? safe(getUnitHistory({ id: card.id, finish }, LAST_KNOWN_DAYS), [] as HistoryPoint[]) : Promise.resolve([] as HistoryPoint[]),
    card.oracleNo != null ? safe(getCardPage({ oracleNo: card.oracleNo, sort: "value", per: 48 }), null) : Promise.resolve(null),
    safe(getCardPage({ setIds: [card.set.id], sort: "value", per: 24 }), null),
    cheaperMax != null && cheaperMax > 0 && typeKey && typeKey !== "other"
      ? safe(getCardPage({ setIds: [card.set.id], types: [typeKey], colors: { mask, mode: mask === 0 ? "colorless" : "exact" }, maxCents: cheaperMax, sort: "value", per: 24 }), null)
      : Promise.resolve(null),
  ]);
  const printings: CardLite[] = printingsPage?.items ?? [];
  const siblings = printings.filter((x) => x.id !== card.id && x.setId === card.set.id);
  const trackedPrinting = untracked ? ([...printings].filter((x) => !x.thin && x.id !== card.id).sort((a, b) => (a.marketUsd ?? Infinity) - (b.marketUsd ?? Infinity))[0] ?? null) : null;
  const fromSet = (setTopPage?.items ?? []).filter((x) => x.id !== card.id && x.slug !== card.slug).slice(0, 6);
  const title = displayTitle(card);
  const knownSeries = trackedFinish ? history : pastHistory;
  const known = perMarket((m) => (wantKnown(m) ? lastKnownPrice(headOf(m), visitorHistory(knownSeries, m)) : null));

  const stats: { label: string; value: string }[] = [];
  if (oracle?.manaCost) stats.push({ label: "Mana cost", value: oracle.manaCost });
  else if (card.cost != null && card.cost > 0) stats.push({ label: "Mana value", value: String(card.cost) });
  if (oracle?.pt) stats.push({ label: "Power / toughness", value: oracle.pt });
  if (oracle?.loyalty) stats.push({ label: "Loyalty", value: oracle.loyalty });
  const identity = oracle ? colorsOfMask(oracle.identity) : [];
  const isCommander = oracle ? (oracle.flags & ORACLE_FLAGS.COMMANDER) !== 0 : false;
  // A legality of "?" (no oracle join) renders as nothing, never as "not legal".
  const legalities = oracle ? FORMAT_UI.map((f) => ({ f, s: legalityOf(oracle.legal, f) })).filter((x) => x.s !== "unknown") : [];
  const legalIn = legalities.filter((x) => x.s === "legal" || x.s === "restricted").map((x) => FORMAT_LABEL[x.f]);

  const inMarketOf = (m: Country) => offers.filter((o) => o.market === m && o.inStock);
  const inBaseline = inMarketOf(BASELINE);
  // The buy surfaces (top block, sticky bar, TCGplayer reference) tag their
  // links with the card's own path, like the board's rows ("-card" sub-ids).
  const loc = `/card/${card.slug}`;
  const best = perMarket((m) => cheapestBuyRow(offers, m, loc));
  const tcgHref = affiliateUrl(tcgplayerUrl(card.id, finish), "tcgplayer", loc);
  const preRelease = isPreRelease(card.set.releasedOn, new Date().toISOString().slice(0, 10));
  // Alert copy promises an email only once a mailer is configured (cached Meta flag).
  const emailOn = (await getEmailStatus()) === "on";
  const noListingAnywhere = !anyInStock;
  const ebayQuery = cardEbayQuery({ name: card.name, setName: card.set.name, variant: card.label, number: card.label ? card.number : null, foil: finish === "F" });
  const imageAlt = cardImageAlt({ name: card.name, variant: card.label, setName: card.set.name, setCode: card.set.code, number: card.number, finish, finishWord: finishLabel(card, finish) === "Non-foil" ? null : finishLabel(card, finish) });
  const cardText = oracle?.oracleText ? (
    <div className="card-surface p-4">
      <p className="rb-eyebrow text-slate-500 mb-2">Card text</p>
      {oracle.oracleText.split("\n").map((l, i) => (
        <p key={i} className="mb-2 text-sm leading-relaxed text-slate-200 last:mb-0">
          <KeywordText text={l} />
        </p>
      ))}
    </div>
  ) : null;

  // ── Price state, narrative, FAQ, cross-links: every market's, the baseline's for the JSON-LD ──
  const stateOpts = { marketUsd, setKind: card.set.kind, printing: card.printing };
  const state = priceState(offers, BASELINE, stateOpts);   // hasListings and isEmpty do not depend on the market
  const tiles = perMarket((m): MarketTile => {
    const h = headOf(m), seen = lastSeen(offers, m);
    return {
      kind: h.kind,
      cents: h.kind === "none" ? null : h.cents,
      seen: seen ? { cents: seen.priceCents, at: seen.at } : null,
      lastKnown: wantKnown(m) ? pickKnown(known, m) : null,
      // "N stores" counts real stores only; the TCGplayer row is a listing, not a store.
      stores: inMarketOf(m).filter((o) => isStoreSource(o.source)).length,
      elsewhere: elsewhereLine(priceState(offers, m, stateOpts)),
    };
  });
  const noListings = perMarket((m) => {
    const st = priceState(offers, m, stateOpts);
    return !st.hasListings || (st.noRetailChannel && !st.inMarket) ? st : null;
  });
  const boards = perMarket((m) => boardModel(offers, m, { page: "card", ebayQuery }));
  const tables = perMarket((m) => marketsTableData(offers, card.name, m));
  const unpriced = perMarket((m) => inMarketOf(m).length === 0);
  const raw = Object.fromEntries(MARKETS.map((m) => [m, unitLow[m] ?? null])) as Record<Country, number | null>;
  const historyRows: HistoryTuple[] = thinHistory(history).map((p) => [p.day, p.marketUsd, trimNulls(p.lows ?? [p.lowUsd])]);
  const historyEmpty = trackedFinish ? `Price history starts ${history[0] ? longDate(history[0].day) : "with the first import"} — the chart draws once there are two days of prices.` : "This card is not price-tracked yet, so there is no history chart. TCGplayer and eBay buy links above are live.";
  const today = new Date().toISOString().slice(0, 10);
  const keys = cardKeywords(oracle?.keywords ?? []).map((sl) => KEYWORD_BY_SLUG.get(sl)).filter((k): k is NonNullable<typeof k> => !!k);
  const marketViews = MARKETS.map((m) => {
    const rows = marketRows(offers, m);
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
  const paras = perMarketList((m) => {
    const baseline = marketViews.find((v) => v.country === m)!;
    return buildNarrative({
      name: card.name,
      variant: card.label,
      number: card.number,
      printing: card.printing,
      setName: card.set.name,
      setCode: card.set.code,
      setKind: card.set.kind,
      releasedOn: card.set.releasedOn,
      today,
      rarity: card.rarity,
      cardType: card.cardType,
      typeLine: oracle?.typeLine ?? null,
      colors: card.colors,
      manaCost: oracle?.manaCost || null,
      manaValue: oracle ? oracle.manaValue : null,
      pt: oracle?.pt ?? null,
      loyalty: oracle?.loyalty ?? null,
      keywords: keys.map((k) => k.name),
      legalIn,
      commander: isCommander,
      marketUsd: untracked ? null : marketUsd,
      change7d: untracked ? null : unitChange7d,
      change30d: untracked ? null : unitChange30d,
      high90Usd: untracked ? null : unitHigh90,
      baseline: untracked ? { ...baseline, lowestCents: null, secondCents: null, storeCount: 0, listingCount: 0 } : baseline,
      markets: untracked ? [] : marketViews,
      printings: untracked ? [] : siblings.map((x) => ({ label: PRINTING_SHORT[x.printing] ?? "Other", marketUsd: x.marketUsd })),
      setContext: null,
      sameNameElsewhere: sameNameCount(card, printings),
    }).paragraphs;
  });
  const faqs = perMarketList((m) => {
    if (untracked) return [];
    const h = headOf(m), cmp = compareMarkets(offers, COUNTRIES[m].currency);
    return buildCardFaqs({
      name: card.name,
      displayName: title,
      number: card.number,
      setName: card.set.name,
      setCode: card.set.code,
      rarity: card.rarity,
      cardType: card.cardType,
      colors: card.colors,
      printing: card.printing,
      country: m,
      lowest: h.kind === "listing" ? h.cents : null,
      stores: h.kind === "listing" ? h.stores : 0,
      printingCount: siblings.length,
      marketUsd,
      baseMarketUsd: baseSibling?.marketUsd ?? null,
      currencyAnswer: cmp.quotes.length >= 2 ? marketPriceListSentence(cmp) : null,
      preRelease,
    });
  });
  const baselineFaqs = pickMarketList(faqs, BASELINE);
  const cheaper = cheaperPage ? cheaperAlternatives(card, cheaperPage.items) : [];
  const sameChar = sameCharacter(card, printings);
  const tools = priceToolChips({ cardType: card.cardType, name: card.name, setSlug: card.set.slug, hasSealed: card.set.sealedCount > 0, priced: state.hasListings || marketUsd != null });
  const inStockPrintings = siblings.filter((x) => Object.values(x.low).some((v) => v != null)).length;
  const typeFacet = typeKey && typeKey !== "other" ? facetBySlug(TYPE_FACETS, typeKey) : undefined;
  const rarityFacet = card.rarity ? RARITY_FACETS.find((f) => f.key === card.rarity) : undefined;
  const printingFacet = PRINTING_FACETS.find((f) => f.key === card.printing);
  // /cards/printing/<x> is a legacy 308 to /cards/treatment/<x>: link the treatment page itself (a link through a redirect is a wasted crawl)
  const treatmentFacet = printingFacet ? facetBySlug(TREATMENT_FACETS, printingFacet.slug) : undefined;
  const guides = guidesForCatalogue("card");
  const anyKnown = known.values.some((k) => k != null);

  const ebayLd = ebayJsonLdOffers(inBaseline, co.currency, isoCountry(BASELINE));
  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: title,
          sku: String(card.id),
          image: card.hasImage ? cardImage.large(card.id) : undefined,
          brand: { "@type": "Brand", name: "Magic: The Gathering" },
          category: "Trading card",
          url: `${SITE_URL}/card/${card.slug}`,
          ...(inBaseline.length && !untracked
            ? {
                offers: {
                  "@type": "AggregateOffer",
                  priceCurrency: co.currency,
                  lowPrice: (
                    Math.min(...inBaseline.map((o) => o.priceCents)) / 100
                  ).toFixed(2),
                  highPrice: (
                    Math.max(...inBaseline.map((o) => o.priceCents)) / 100
                  ).toFixed(2),
                  offerCount: inBaseline.length,
                  availability: "https://schema.org/InStock",
                  ...(ebayLd.length ? { offers: ebayLd } : {}),
                },
              }
            : {}),
        }}
      />
      {baselineFaqs.length ? <JsonLd data={faqLd(baselineFaqs)} /> : null}
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
              alt={imageAlt}
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
              {isCommander ? <span className="chip border border-amber-400/40 bg-amber-400/10 text-amber-200">Commander</span> : null}
              <RarityBadge rarity={card.rarity} />
              {card.cardType ? (
                <span className="chip border border-ink-700 bg-ink-850 text-slate-200">
                  {PRIMARY_TYPE_LABEL[typeKey ?? "other"] ?? card.cardType}
                </span>
              ) : null}
              <PrintingBadge printing={card.printing} variant={card.label} />
            </div>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3 sm:mt-3">
              <div className="min-w-0 flex-[1_1_12rem]">
                <h1 className="text-xl font-extrabold leading-tight text-white sm:text-2xl">
                  {card.name}
                  {card.label ? (
                    <span className="block text-lg font-bold text-slate-300 sm:text-xl">
                      {card.label}
                    </span>
                  ) : null}
                </h1>
                {oracle?.typeLine ? <p className="mt-1 text-sm text-slate-300">{oracle.typeLine}</p> : null}
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
                {untracked ? null : <PriceWatchButton cardId={card.id} slug={card.slug} name={title} variant="responsive" />}
                <ShareButton responsive />
              </div>
            </div>
            {aliasesFor(card.slug).length ? <p className="mt-2 text-sm text-slate-400">Also known as {aliasesFor(card.slug).map((a) => `“${a}”`).join(", ")}</p> : null}
            {finishes.length > 1 ? (
              <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Finish">
                {finishes.map((f) => (
                  <Link
                    key={f}
                    href={f === card.headFinish ? `/card/${card.slug}` : `/card/${card.slug}?finish=${f === "F" ? "foil" : "nonfoil"}`}
                    role="tab"
                    aria-selected={f === finish}
                    scroll={false}
                    className={`chip min-h-9 border px-3 ${f === finish ? "border-brand-400 bg-brand-400/15 text-white" : "border-ink-700 bg-ink-850 text-slate-300 hover:text-white"}`}
                  >
                    {f === "N" ? "Non-foil" : finishLabel(card, "F")}
                    <span className="num ml-2 text-slate-400">
                      {untracked ? "" : (() => {
                        const q = finishPrice(card, f);
                        const v = q?.market ?? q?.low ?? null;
                        return v != null ? usd(v) : "";
                      })()}
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
            {untracked ? (
              <UntrackedPriceNotice name={card.name} tracked={trackedPrinting ? { slug: trackedPrinting.slug, label: `${trackedPrinting.name} (${trackedPrinting.setCode}${trackedPrinting.label ? `, ${trackedPrinting.label}` : ""})` } : null}>
                <MarketBuyPair tcgHref={tcgHref} ebayQuery={ebayQuery} preRelease={preRelease} page="card" slug={card.slug} />
              </UntrackedPriceNotice>
            ) : (
              <>
            <MarketBuyPair tcgHref={tcgHref} ebayQuery={ebayQuery} preRelease={preRelease} page="card" slug={card.slug} />
            <MarketTopBuy best={best} page="card" slug={card.slug} />
            <MarketAlertCta
              cardId={card.id}
              slug={card.slug}
              name={title}
              cardPath={loc}
              providers={enabledProviders()}
              unpriced={unpriced}
              preorder={preRelease}
              emailOn={emailOn}
            />
              </>
            )}
            {oracle ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="font-semibold uppercase tracking-wider">Colour identity</span>
                {identity.length ? identity.map((c) => <ColorBadge key={c} color={c} />) : <span className="text-slate-300">Colourless</span>}
              </div>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {untracked ? <MarketLastKnown known={known} /> : <MarketTiles tiles={tiles} now={now} />}
              {stats.slice(0, untracked ? (anyKnown ? 3 : 4) : 2).map((s) => (
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
          {!untracked && (preRelease || noListingAnywhere) ? (
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

          {untracked ? null : (
          <>
          <p className="text-right text-xs text-slate-400">
            Cheapest first by item price; postage is added at each store&apos;s
            checkout.{" "}
            <Link href="/methodology" className="text-brand-400 hover:underline">
              How we compare prices →
            </Link>
          </p>

          <MarketNoListings states={noListings} cardId={card.id} name={title} slug={card.slug} setName={card.set.name} setSlug={card.set.slug} preRelease={preRelease} inStockPrintings={inStockPrintings} />

          <MarketBoard
            boards={boards}
            productId={card.id}
            finish={finish}
            now={now}
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
          <MarketTcgReference marketUsd={marketUsd} href={tcgHref} page="card" card={card.slug} />
          </>
          )}
          <MarketBanners query={ebayQuery} name={title} page="card" card={card.slug} />
          {cardText ? <div className="lg:hidden">{cardText}</div> : null}

          {legalities.length ? (
            <section className="card-surface p-5" aria-label="Format legality">
              <h2 className="text-lg text-white">Format legality</h2>
              <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
                {legalities.map(({ f, s }) => (
                  <li key={f} className="flex items-center justify-between gap-2 border-b border-ink-800 py-1">
                    <span className="text-slate-300">{FORMAT_LABEL[f]}</span>
                    <span className={s === "legal" ? "font-semibold text-emerald-400" : s === "restricted" ? "font-semibold text-amber-300" : s === "banned" ? "font-semibold text-red-400" : "text-slate-500"}>
                      {s === "not_legal" ? "Not legal" : s === "legal" ? "Legal" : s === "banned" ? "Banned" : "Restricted"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {untracked ? null : <MarketHistory history={historyRows} empty={historyEmpty} />}

          <InlineSignupPrompt surface="card" title="Get the top deals in your market, free" body="A free account shows Deal Finder's three biggest savings in your market right now, and is how you get Plus or Premium when you want them." />

          {/* ── Our own analysis: leads over the FAQ and the affiliate blocks ── */}
          <section className="card-surface p-5" aria-label={`About ${card.name}`}>
            <h2 className="font-bold text-white">About {card.name}</h2>
            <div className="mt-3 max-w-3xl space-y-3 text-sm leading-relaxed text-slate-300">
              <MarketParagraphs paras={paras} />
              {oracle?.oracleText ? (
                <p className="text-slate-400">
                  <KeywordText text={oracle.oracleText.replace(/\n+/g, " ")} />
                </p>
              ) : null}
            </div>
            {keys.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
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
              {printingFacet && treatmentFacet && card.printing !== "standard" ? (
                <Link href={`/cards/treatment/${treatmentFacet.slug}`} className="chip bg-ink-800 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-200">
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
              {isCommander && oracle ? (
                <Link href={`/commanders/${oracle.slug}`} className="chip bg-ink-800 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-200">
                  {card.name} decks and cards →
                </Link>
              ) : null}
            </div>
          </section>

          <MarketFaq faqs={faqs} />

          {untracked ? null : <MarketTable tables={tables} name={card.name} />}
          <AdSlot slot="card" thin={!state.hasListings && card.marketUsd == null} />

          {untracked ? null : (
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
          )}

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
                ["Printing", card.label ?? "Standard"],
                ["Type line", oracle?.typeLine ?? card.cardType ?? "—"],
                ["Colour", card.colors.join(" / ") || (oracle ? "Colourless" : "—")],
                ["Colour identity", oracle ? identity.join(" / ") || "Colourless" : "—"],
                ...stats.map(
                  (s) => [s.label, String(s.value)] as [string, string],
                ),
                ["Finish", finishLabel(card, finish)],
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
          {untracked ? null : <MarketEbayPanel productId={card.id} query={ebayQuery} name={title} card={card.slug} raw={raw} preRelease={preRelease} />}
        </div>
      </div>

      {siblings.length ? (
        <section id="printings" className="mt-10 scroll-mt-20">
          <SectionHeader
            title={`Other printings of ${card.name} in ${card.set.name}`}
            sub={<>The same card in other art and frames from this set — priced in <MarketPlace />.</>}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {siblings.slice(0, 12).map((s) => (
              <CardTile
                key={s.id}
                card={tileCard(s)}
                setCode={s.setCode}
              />
            ))}
          </div>
        </section>
      ) : null}

      {cheaper.length ? (
        <section className="mt-10">
          <SectionHeader title={`Cheaper ${card.colors[0] ?? ""} ${(card.cardType ?? "card").toLowerCase()}s in ${card.set.name}`.replace(/\s+/g, " ")} sub="Same set, colour and type, strictly cheaper on TCGplayer." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {cheaper.map((s) => (
              <CardTile key={s.id} card={tileCard(s)} setCode={card.set.code} />
            ))}
          </div>
        </section>
      ) : null}

      {sameChar.length ? (
        <section className="mt-10">
          <SectionHeader title={`${card.name} in other sets`} sub="Every other printing with this name, one per set." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {sameChar.map((s) => (
              <CardTile key={s.id} card={tileCard(s)} setCode={s.setCode} />
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
                card={tileCard(s)}
                setCode={card.set.code}
              />
            ))}
          </div>
        </section>
      ) : null}

      <DecksUsingCard cardId={card.id} />

      <CardViewBeacon slug={card.slug} cardId={card.id} cardName={card.name} rarity={card.rarity} />
      <RecentlyViewed className="mt-10" record={{ slug: card.slug, name: card.name, variant: card.label, setCode: card.set.code, number: card.number, img: card.hasImage ? cardImage.thumb(card.id) : null }} />

      <RelatedGuides guides={guides} className="card-surface mt-10 p-5" />
      {untracked ? null : <MarketStickyBuyBar best={best} boardId="price-comparison" tcgHref={tcgHref} ebayQuery={ebayQuery} page="card" slug={card.slug} name={title} cardId={card.id} />}
    </div>
  );
}
