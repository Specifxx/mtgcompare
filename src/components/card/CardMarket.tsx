"use client";

// The market-dependent half of the card page, localised in the browser (OP Compare's CardMarket.tsx, for Magic).
//
// /card/[slug] is ONE CDN copy for every visitor and crawler (DECISIONS.md, "One card page for every market", 2026-10-19):
// nothing in its tree reads a cookie, a header or getCountry(), so the HTML is rendered on the baseline market
// (DEFAULT_COUNTRY, the US) and Vercel's CDN keeps one copy per URL instead of one per market. Everything that depends on the
// visitor's market is computed on the server for ALL six markets (lib/per-market.ts: identical values shared) and handed to
// these islands, which draw the market CountryProvider resolves (the cookie, then /api/geo) after hydration. The server render
// and the first client render both use DEFAULT_COUNTRY, so hydration matches and a crawler sees complete US prices; switching
// market needs no server render.
//
// Nothing here reads the store registry, a loader or the board helpers (tests/card-cdn.test.ts walks the imports): board rows,
// buy rows and the markets table arrive resolved and tagged from the server.
import { useMemo } from "react";
import { COUNTRIES, type Country } from "@/lib/country";
import { ebayLabel, ebaySearchUrl } from "@/lib/affiliate";
import { ago, longDate, money } from "@/lib/format";
import { pickMarket, pickMarketList, type PerMarket, type PerMarketList } from "@/lib/per-market";
import { visitorHistory, type LastKnownPrice as Known } from "@/lib/price-history-view";
import type { BoardModel } from "@/lib/board-model";
import type { CardPriceState } from "@/lib/card-price-state";
import type { HistoryPoint } from "@/lib/data/types";
import type { MarketsTableData } from "@/lib/markets-table";
import type { BuyRow } from "@/lib/quick-view";
import { CardMarketsTableView } from "../CardMarketsTableView";
import { CardNoListings } from "../CardNoListings";
import { CardStickyBuyBar } from "../CardStickyBuyBar";
import { CardBuyPair, CardTopBuy } from "../CardTopBuy";
import { useCountry } from "../CountryProvider";
import { EbayCardBanner } from "../EbayCardBanner";
import { EbayCardPanel } from "../EbayCardPanel";
import { LastKnownPrice } from "../LastKnownPrice";
import { LineChart } from "../LineChart";
import { PriceBoardView } from "../PriceBoardView";
import { PriceDropAlertCta } from "../PriceDropAlertCta";
import { TcgMarketPrice } from "../TcgMarketPrice";
import { TcgplayerBanner } from "../TcgplayerBanner";

const useMarket = (): Country => useCountry().country;

/** The header's market tiles: "Cheapest · <place>" and "In stock at · <code>". */
export interface MarketTile {
  kind: "listing" | "reference" | "none";
  cents: number | null;
  /** The newest sold-out price seen here ("Last seen"), shown when there is no price at all. */
  seen: { cents: number; at: string } | null;
  /** No current price and no sold-out row here: the unit's own last known price (DECISIONS.md, "Last known price"). Display only. */
  lastKnown: Known | null;
  /** Distinct stores with a copy in stock here. */
  stores: number;
  /** "3 stores in other markets". */
  elsewhere: string | null;
}

const TILE_LABEL = "text-[11px] font-semibold uppercase tracking-wider text-slate-400";

/** Two grid cells (the header's stat grid holds them beside the card's own stats). */
export function MarketTiles({ tiles, now }: { tiles: PerMarket<MarketTile>; now: number }) {
  const country = useMarket();
  const co = COUNTRIES[country];
  const t = pickMarket(tiles, country);
  return (
    <>
      <div>
        <p className={TILE_LABEL}>
          {t.lastKnown ? "No current price" : "Cheapest"} · {co.place}
        </p>
        {t.lastKnown ? (
          <LastKnownPrice known={t.lastKnown} country={country} className="mt-1" />
        ) : (
          <p className="num mt-1 text-xl font-bold text-accent">
            {t.kind === "listing" ? money(t.cents, country) : t.kind === "reference" ? `≈ ${money(t.cents, country)}` : t.seen ? money(t.seen.cents, country) : "—"}
          </p>
        )}
        {t.kind === "none" && t.seen ? <p className="mt-0.5 text-[11px] text-slate-500">Last seen {ago(t.seen.at, now)}</p> : null}
      </div>
      <div>
        <p className={TILE_LABEL}>In stock at · {co.code}</p>
        <p className="num mt-1 text-xl font-bold text-white">
          {t.stores} {t.stores === 1 ? "store" : "stores"}
        </p>
        {t.elsewhere ? <p className="mt-0.5 text-[11px] text-slate-500">{t.elsewhere}</p> : null}
      </div>
    </>
  );
}

/** An untracked printing's one price cell: its own last known price in the visitor's market, or nothing. */
export function MarketLastKnown({ known }: { known: PerMarket<Known | null> }) {
  const country = useMarket();
  const k = pickMarket(known, country);
  if (!k) return null;
  return (
    <div>
      <p className={TILE_LABEL}>No current price · {COUNTRIES[country].place}</p>
      <LastKnownPrice known={k} country={country} className="mt-1" />
    </div>
  );
}

/** The TCGplayer + eBay pair on every card: the eBay search is the visitor's own eBay. */
export function MarketBuyPair({ tcgHref, ebayQuery, preRelease, page, slug }: { tcgHref: string; ebayQuery: string; preRelease: boolean; page: string; slug: string }) {
  const country = useMarket();
  return <CardBuyPair tcgHref={tcgHref} ebayHref={ebaySearchUrl(country, ebayQuery, `${page}-buy-pair`)} ebayName={ebayLabel(country)} preRelease={preRelease} page={page} slug={slug} />;
}

/** The phone buy block under the card's name: the market's cheapest open row. */
export function MarketTopBuy({ best, page, slug }: { best: PerMarket<BuyRow | null>; page: string; slug: string }) {
  const country = useMarket();
  return <CardTopBuy best={pickMarket(best, country)} country={country} page={page} slug={slug} />;
}

/** The pinned phone buy bar: the same row as MarketTopBuy. Keyed by market so it re-measures. */
export function MarketStickyBuyBar({ best, tcgHref, ebayQuery, page, ...rest }: { best: PerMarket<BuyRow | null>; tcgHref: string; ebayQuery: string; boardId: string; page: string; slug: string; name: string; cardId: number }) {
  const country = useMarket();
  const b = pickMarket(best, country);
  return (
    <CardStickyBuyBar
      key={country}
      {...rest}
      page={page}
      price={b ? money(b.priceCents, country) : undefined}
      store={b?.label}
      href={b?.href}
      retailer={b?.retailer}
      ebay={b?.ebay}
      tcgHref={tcgHref}
      ebayHref={ebaySearchUrl(country, ebayQuery, `${page}-buy-pair`)}
      ebayName={ebayLabel(country)}
    />
  );
}

/** The alert call to action: "in stock" wording where nothing is listed in the visitor's market. */
export function MarketAlertCta({ unpriced, ...rest }: Omit<React.ComponentProps<typeof PriceDropAlertCta>, "unpriced"> & { unpriced: PerMarket<boolean> }) {
  const country = useMarket();
  return <PriceDropAlertCta {...rest} unpriced={pickMarket(unpriced, country)} />;
}

/** "No live listings for X yet" where the visitor's market (or every market) has none; a null state is not shown. */
export function MarketNoListings({ states, ...rest }: Omit<React.ComponentProps<typeof CardNoListings>, "state" | "country"> & { states: PerMarket<CardPriceState | null> }) {
  const country = useMarket();
  const state = pickMarket(states, country);
  return state ? <CardNoListings {...rest} country={country} state={state} /> : null;
}

/** The price comparison for the visitor's market (every market's board is resolved on the server). */
export function MarketBoard({ boards, ...rest }: Omit<React.ComponentProps<typeof PriceBoardView>, "model" | "country"> & { boards: PerMarket<BoardModel> }) {
  const country = useMarket();
  return <PriceBoardView {...rest} model={pickMarket(boards, country)} country={country} />;
}

/** Under the board: TCGplayer's market price as a reference, in the visitor's currency. */
export function MarketTcgReference({ marketUsd, href, page, card }: { marketUsd: number | null; href: string; page: string; card: string }) {
  return <TcgMarketPrice marketUsd={marketUsd} country={useMarket()} href={href} page={page} card={card} />;
}

/** The card's eBay banner (the visitor's eBay) and TCGplayer's (its tagline names the visitor's market). */
export function MarketBanners({ query, name, page, card }: { query: string; name: string; page: string; card: string }) {
  const country = useMarket();
  return (
    <>
      <EbayCardBanner country={country} query={query} name={name} page={page} card={card} />
      <TcgplayerBanner country={country} page={page} card={card} />
    </>
  );
}

/** A day of the unit's history: [day, TCGplayer market (USD cents), each market's low in MARKETS order, trailing nulls cut]. */
export type HistoryTuple = [day: string, marketUsd: number | null, lows: (number | null)[]];

/** The price-history section in the visitor's market and currency (lib/price-history-view.ts), drawn from the raw days: no per-point label crosses the wire. */
export function MarketHistory({ history, empty }: { history: HistoryTuple[]; empty: string }) {
  const country = useMarket();
  const co = COUNTRIES[country];
  const points = useMemo((): HistoryPoint[] => history.map(([day, marketUsd, lows]) => ({ day, marketUsd, lowUsd: lows[0] ?? null, lows })), [history]);
  const vh = visitorHistory(points, country);
  return (
    <section className="card-surface p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg text-white">{vh.title}</h2>
        <p className="text-xs text-slate-400">
          TCGplayer market shown in {vh.currency} at an indicative rate{vh.lowSince && vh.lowDays < points.length ? `; ${co.place} listing history starts ${longDate(vh.lowSince)}` : ""}
        </p>
      </div>
      <LineChart
        key={country}
        series={[
          { label: `Cheapest ${co.adjective} listing`, color: "#a259e6", points: vh.low.points },
          { label: "TCGplayer market (converted)", color: "#e9b73a", points: vh.market.points, dashed: true },
        ]}
        format={(v) => money(Math.round(v), country)}
        empty={empty}
      />
    </section>
  );
}

/** The "About" paragraphs, which quote the visitor's market's prices. */
export function MarketParagraphs({ paras }: { paras: PerMarketList<string> }) {
  const country = useMarket();
  return (
    <>
      {pickMarketList(paras, country).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </>
  );
}

/** The visible FAQ (its FAQPage JSON-LD is the baseline market's, the page's own). */
export function MarketFaq({ faqs }: { faqs: PerMarketList<{ q: string; a: string }> }) {
  const country = useMarket();
  const list = pickMarketList(faqs, country);
  if (!list.length) return null;
  return (
    <section className="card-surface p-5">
      <h2 className="font-bold text-white">Frequently asked questions</h2>
      <dl className="mt-3 space-y-4">
        {list.map((f) => (
          <div key={f.q}>
            <dt className="font-semibold text-white">{f.q}</dt>
            <dd className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">{f.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** "<card> price by market" in the visitor's currency; nothing when fewer than two markets list it. */
export function MarketTable({ tables, name }: { tables: PerMarket<MarketsTableData | null>; name: string }) {
  const country = useMarket();
  const data = pickMarket(tables, country);
  return data ? <CardMarketsTableView data={data} name={name} country={country} /> : null;
}

/** "Also available on eBay": the captured listings and slabs on the visitor's eBay (fetched by the panel itself, never by a crawler). */
export function MarketEbayPanel({ raw, ...rest }: Omit<React.ComponentProps<typeof EbayCardPanel>, "country" | "rawCents"> & { raw: Partial<Record<Country, number | null>> }) {
  const country = useMarket();
  return <EbayCardPanel {...rest} country={country} rawCents={raw[country] ?? null} />;
}

/** The visitor's market as prose ("the United States"). */
export function MarketPlace() {
  return <>{COUNTRIES[useMarket()].place}</>;
}
