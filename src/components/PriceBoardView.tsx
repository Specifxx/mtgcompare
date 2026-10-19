import type { Finish } from "@/lib/constants";
import Link from "next/link";
import { COUNTRIES, type Country } from "@/lib/country";
import { ebayLabel, outboundRel } from "@/lib/affiliate";
import { ago, money } from "@/lib/format";
import type { BoardModel } from "@/lib/board-model";
import { ReportPriceButton } from "./ReportPriceButton";

// The price comparison (RiftCompare's card-page board) drawn from one market's BoardModel (lib/board-model.ts): every open offer,
// cheapest first by ITEM price; sold-out stores folded below; eBay listings beside the stores, ranked by item price like every row
// and never moved because they are eBay. eBay search: a "more listings" strip inside the board when an eBay row is there, else
// RiftCompare's fallback block directly under the board ("Search eBay for <card>"), so a thin market is never a dead end.
// TCGplayer's market price is the page's TcgMarketPrice block under it: a reference, never a row. No hooks and no store, board or
// data import, so the card page's client island (components/card/CardMarket.tsx) and the server wrapper (PriceBoard) both draw it.
// `now` is the render's clock: "updated 3h ago" is the same text on the server and in the hydrating browser.
export function PriceBoardView({
  model,
  productId,
  country,
  now,
  page,
  title = "Price comparison",
  noun = "card",
  id,
  slug,
  name,
  preRelease = false,
  finish = "N",
}: {
  model: BoardModel;
  productId: number;
  /** The unit the offers belong to (a price is per product and finish); report-a-price sends it. */
  finish?: Finish;
  country: Country;
  now: number;
  page: string;
  title?: string;
  noun?: string;
  /** Anchor id (the card page's sticky buy bar hides while this is on screen). */
  id?: string;
  /** data-card on every outbound link: the product's slug. */
  slug?: string;
  /** Display name for the eBay fallback block ("Search eBay for <name>"). */
  name?: string;
  /** The set has not released: the eBay copy says nothing ships yet. */
  preRelease?: boolean;
}) {
  const c = COUNTRIES[country];
  const { rows, hasEbayRow } = model;
  const ebay = model.ebaySearch;
  return (
    <>
    <section id={id} className="card-surface scroll-mt-20 overflow-hidden" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-800 px-4 py-3 sm:px-5">
        <h2 className="text-lg text-white">
          {title} <span className="font-sans text-sm font-normal text-slate-400">({rows.length}) · {c.place}</span>
        </h2>
        {model.oldest ? <span className="text-xs text-slate-500">oldest listing {ago(model.oldest, now)}</span> : null}
      </div>
      {rows.length ? (
        <ol className="divide-y divide-ink-800">
          {rows.map((o, i) => {
            const { href, tcg, label, retailer, postage } = o;
            const isEbay = Boolean(o.ebay);
            return (
              <li key={o.source} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="num w-5 shrink-0 text-center text-sm text-slate-500">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-white">{label}</span>
                    {i === 0 ? <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">Cheapest</span> : null}
                  </p>
                  {isEbay ? <p className="mt-0.5 text-xs text-slate-400">Cheapest matching listing we found</p> : null}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                    {o.condition ? <span className="rounded border border-ink-700 bg-ink-850 px-1.5 py-0.5 font-semibold text-slate-200">{o.condition}</span> : null}
                    {tcg ? <span>lowest listing</span> : null}
                    {isEbay ? null : (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        In stock
                      </span>
                    )}
                    <span>{postage}</span>
                    {o.policyUrl ? (
                      <a href={o.policyUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-slate-400 underline hover:text-slate-200">
                        shipping policy ↗
                      </a>
                    ) : null}
                    {o.played ? <span className="text-slate-300">{o.played}</span> : null}
                    <span>updated {ago(o.updatedAt, now)}</span>
                    {o.paid ? <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-slate-400">Paid link</span> : null}
                  </p>
                </div>
                <span className="num shrink-0 text-right text-base font-bold text-accent sm:text-lg">{money(o.priceCents, country)}</span>
                <a href={href} target="_blank" rel={outboundRel()} data-retailer={retailer} data-page={page} data-card={slug} data-surface="board_row" className={`${isEbay ? "btn-ebay" : "btn-primary"} hidden shrink-0 whitespace-nowrap sm:inline-flex sm:w-48`}>
                  {tcg ? "Buy on TCGplayer →" : isEbay ? "Buy on eBay →" : "View deal →"}
                </a>
                <a href={href} target="_blank" rel={outboundRel()} data-retailer={retailer} data-page={page} data-card={slug} data-surface="board_row" className={`${isEbay ? "btn-ebay" : "btn-primary"} shrink-0 px-3 sm:hidden`} aria-label={isEbay ? `Buy on ${label}` : `Buy at ${label}`}>
                  →
                </a>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="px-5 py-6 text-[15px] text-slate-300">
          <p>No {c.adjective} store we track has this in stock right now.</p>
          {model.elsewhere.length ? (
            <p className="mt-2 text-sm text-slate-400">
              Cheapest elsewhere:{" "}
              {model.elsewhere.map((e, i) => (
                <span key={e.m}>
                  {i ? " · " : ""}
                  {COUNTRIES[e.m].flag} <span className="num text-slate-200">{money(e.cents, e.m)}</span>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      )}
      {rows.length ? (
        <div className="border-t border-ink-800">
          <ReportPriceButton productId={productId} finish={finish} market={country} offers={rows.map((o) => ({ source: o.source, label: o.label }))} />
        </div>
      ) : null}

      {hasEbayRow ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-ink-800 bg-ink-850/50 px-4 py-3 sm:px-5">
          <span className="flex-1 text-sm text-slate-300">
            <span className="font-semibold text-white">{ebayLabel(country)}</span> — more live listings for this {noun}
          </span>
          <a href={ebay} target="_blank" rel={outboundRel()} data-retailer="ebay_search" data-page={page} data-card={slug} data-surface="ebay_more" className="btn-ebay-ghost min-h-10">
            {`More listings on ${ebayLabel(country)} →`}
          </a>
        </div>
      ) : null}

      {model.sold.length ? (
        <details className="border-t border-ink-800">
          <summary className="cursor-pointer px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200">
            {model.sold.length} out-of-stock {model.sold.length === 1 ? "store" : "stores"}
          </summary>
          <p className="px-5 pb-2 text-[11px] text-slate-500">Stores we have seen stock this card. A sold-out store is checked again at every import.</p>
          <ul className="divide-y divide-ink-800 border-t border-ink-800">
            {model.sold.map((o) => (
              <li key={`${o.source}-sold`} className="flex items-center gap-3 px-5 py-2.5 text-sm text-slate-400">
                <span className="flex-1 truncate">{o.label}</span>
                <span className="text-xs">last seen {ago(o.updatedAt, now)} · {money(o.priceCents, country)}</span>
                <a href={o.href} target="_blank" rel={outboundRel()} data-retailer={o.retailer} data-page={page} data-card={slug} data-surface="board_sold_out" className="text-xs font-semibold text-brand-400 hover:underline">
                  Check →
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="space-y-1 border-t border-ink-800 px-5 py-4 text-center text-xs text-slate-500">
        <p>
          {hasEbayRow
            ? <>Prices are collected from public store listings and eBay&apos;s Buy It Now listings, and may change. eBay prices are sellers&apos; asking prices. </>
            : <>Prices are collected from public store listings and may change. </>}
          <Link href="/methodology" className="underline hover:text-slate-300">How we compare prices</Link>
        </p>
        <p>Affiliate links: as an eBay Partner Network affiliate and a TCGplayer affiliate, MTG Compare earns from qualifying purchases — at no extra cost to you.</p>
      </div>
    </section>

    {/* eBay fallback, DIRECTLY UNDER the board whenever this market has no eBay
        row (RiftCompare, "Pushing eBay clicks"): a search, never a row, so it
        cannot outrank a store, and it claims no price or stock. eBay blue. */}
    {hasEbayRow ? null : (
      <div>
        <div className="card-surface flex flex-wrap items-center justify-between gap-3 border-[#0064d2]/40 bg-[#0064d2]/[0.06] p-4">
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-sm font-semibold text-white">
              Search {ebayLabel(country)} for {name ?? `this ${noun}`}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {preRelease
                ? "This set hasn't released yet — eBay sellers set their own dispatch dates, so check each listing."
                : `We have no ${ebayLabel(country)} price on file for this ${noun} right now — eBay sellers may still list it.`}
            </p>
          </div>
          <a href={ebay} target="_blank" rel={outboundRel()} data-retailer="ebay_no_listing" data-page={page} data-card={slug} data-surface="ebay_fallback" className="btn-ebay shrink-0">
            {`Search ${ebayLabel(country)} →`}
          </a>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">As an eBay Partner Network affiliate, MTG Compare earns from qualifying purchases.</p>
      </div>
    )}
    </>
  );
}
