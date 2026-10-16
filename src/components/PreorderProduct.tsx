import Link from "next/link";
import { affiliateUrl, isPaidLink, outboundRel } from "@/lib/affiliate";
import { tcgplayerUrl } from "@/lib/constants";
import { COUNTRIES, type Country } from "@/lib/country";
import type { SealedLite } from "@/lib/data";
import { ago, money, usd } from "@/lib/format";
import { tcgplayerImage } from "@/lib/images";
import { boardSummary, splitRows, type PreorderLine, type PreorderRow } from "@/lib/preorders";
import { PaidLinkTag } from "./AffiliateDisclosure";
import { PreorderEbayRow } from "./PreorderEbayRow";

const VISIBLE = 5;

// One product of a pre-order page (OP Compare's PreorderProduct, on MTG Compare's data), in the visitor's market and its currency, in two
// labelled groups (DECISIONS.md, "The pre-order page: marketplaces on top, stores in price order", 2026-10-16):
//   1. "Marketplaces", pinned at the top: eBay first (PreorderEbayRow: the product's captured listing when the browser loads one, else
//      the eBay search), then TCGplayer (its lowest listing in the US with its price, else a link with the market price as a reference).
//      Never numbered, never "Cheapest", never counted as a store: eBay data is never ranked against a store (CLAUDE.md).
//   2. "Stores, cheapest first": one row per store, open pre-orders by ITEM price ascending and numbered, "Cheapest" on #1, then rows
//      not re-read within 72 hours and sold-out stores, marked and never shown as buyable.
// Every outbound link is affiliate-tagged (lib/quick-view built the store rows' links) and carries data-retailer, data-page, data-card
// and data-surface for the click beacon.
export function PreorderProduct({ s, rows, line, setCode, country, page, loc }: { s: SealedLite; rows: PreorderRow[]; line: PreorderLine | null; setCode: string | null; country: Country; page: string; loc: string }) {
  const c = COUNTRIES[country];
  const { cheapest, openStores } = boardSummary(rows);
  const { tcgplayer, stores } = splitRows(rows);
  const tcgOpen = tcgplayer?.state === "open" ? tcgplayer : null;
  const tcgHref = tcgOpen?.href ?? affiliateUrl(tcgplayerUrl(s.id), "tcgplayer", loc);
  const firstOpen = stores.find((r) => r.state === "open") ?? null;
  const shown = stores.slice(0, VISIBLE), more = stores.slice(VISIBLE);
  const eyebrow = "px-4 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5";

  const storeRow = (r: PreorderRow, i: number) => {
    const open = r.state === "open";
    return (
      <li key={`${r.source}-${i}`} className="flex items-center gap-3 px-4 py-3 sm:px-5" data-store-rank={open ? i + 1 : undefined}>
        <span className="num w-5 shrink-0 text-center text-sm text-slate-500" aria-hidden={!open}>
          {open ? i + 1 : "–"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className={`truncate text-[15px] font-semibold ${open ? "text-white" : "text-slate-400"}`}>{r.label}</span>
            {open && r === firstOpen ? <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">Cheapest</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {open ? "pre-order open" : r.state === "soldout" ? `sold out · last seen ${ago(r.updatedAt)}` : `not re-checked in 72 hours · last seen ${ago(r.updatedAt)}`}
            {open ? ` · ${r.postage}` : ""}
          </p>
        </div>
        <span className={`num shrink-0 text-right text-base font-bold sm:text-lg ${open ? "text-accent" : "text-slate-500 line-through decoration-slate-600"}`}>{money(r.priceCents, country)}</span>
        <a
          href={r.href}
          target="_blank"
          rel={outboundRel()}
          data-retailer={r.retailer}
          data-page={page}
          data-card={s.slug}
          data-surface={open ? "preorder_row" : "preorder_sold_out"}
          className={`${open ? "btn-primary" : "btn-ghost"} shrink-0 whitespace-nowrap px-3 sm:w-44 sm:px-4`}
          aria-label={`${open ? "Pre-order at" : "Check"} ${r.label}`}
        >
          <span className="hidden sm:inline">{open ? "Pre-order →" : "Check →"}</span>
          <span className="sm:hidden">→</span>
        </a>
      </li>
    );
  };

  return (
    <section id={s.slug} className="card-surface scroll-mt-24 overflow-hidden" aria-label={s.name}>
      <div className="flex items-center gap-3 border-b border-ink-800 px-4 py-4 sm:gap-4 sm:px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tcgplayerImage(s.id, "200w")} alt="" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-lg bg-white/90 object-contain p-1 sm:h-16 sm:w-16" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold leading-tight text-white sm:text-lg">
            <Link href={`/sealed/${s.slug}`} className="hover:text-brand-400">
              {s.name}
            </Link>
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {line ? line.name : s.kind}
            {setCode ? ` · ${setCode}` : ""}
            {s.packCount ? ` · ${s.packCount} ${s.packCount === 1 ? "pack" : "packs"}` : ""}
          </p>
        </div>
        {cheapest ? (
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">From · {c.code}</p>
            <p className="num text-lg font-extrabold text-accent sm:text-xl">{money(cheapest.priceCents, country)}</p>
            <p className="text-[11px] text-slate-500">{openStores ? `${openStores} ${openStores === 1 ? "store" : "stores"}` : "TCGplayer only"}</p>
          </div>
        ) : null}
      </div>

      <div className="border-b border-ink-800 bg-white/[0.015]" role="group" aria-label="Marketplaces" data-group="marketplaces">
        <p className={eyebrow}>Marketplaces</p>
        <ul className="divide-y divide-ink-800">
          <PreorderEbayRow productId={s.id} name={s.name} slug={s.slug} country={country} page={page} />
          <li className="flex items-center gap-3 px-4 py-3 sm:px-5" data-marketplace="tcgplayer">
            <span className="w-[4.5rem] shrink-0 text-[13px] font-extrabold tracking-tight text-white sm:w-20 sm:text-sm">TCGplayer</span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white sm:text-[15px]">
                {tcgOpen ? "Lowest listing" : s.marketUsd ? "Market price" : "No listing yet"}
                {isPaidLink(tcgHref) ? <PaidLinkTag /> : null}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {tcgOpen
                  ? tcgOpen.postage
                  : s.marketUsd
                    ? `${country === "US" ? "No listing open today" : "US site, in US dollars"} · a reference, not a pre-order`
                    : "TCGplayer has no price for this yet"}
              </p>
            </div>
            {tcgOpen ? (
              <span className="num shrink-0 text-right text-base font-bold text-white sm:text-lg">{money(tcgOpen.priceCents, country)}</span>
            ) : s.marketUsd ? (
              <span className="num shrink-0 text-right text-sm font-semibold text-slate-400">≈ {usd(s.marketUsd)}</span>
            ) : null}
            <a
              href={tcgHref}
              target="_blank"
              rel={outboundRel()}
              data-retailer="tcgplayer"
              data-page={page}
              data-card={s.slug}
              data-surface="preorder_marketplace_tcgplayer"
              className="btn-ghost shrink-0 whitespace-nowrap px-3 sm:w-44 sm:px-4"
              aria-label={`${tcgOpen ? "Buy" : "Check"} ${s.name} on TCGplayer`}
            >
              <span className="hidden sm:inline">{tcgOpen ? "Buy on TCGplayer →" : "Check TCGplayer →"}</span>
              <span className="sm:hidden">→</span>
            </a>
          </li>
        </ul>
      </div>

      <div role="group" aria-label="Stores, cheapest first" data-group="stores">
        <p className={eyebrow}>
          Stores, cheapest first
          {openStores ? ` · ${openStores} taking pre-orders` : ""}
        </p>
        {stores.length ? (
          <>
            <ol className="divide-y divide-ink-800">{shown.map(storeRow)}</ol>
            {more.length ? (
              <details className="border-t border-ink-800">
                <summary className="cursor-pointer px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200">
                  {more.length} more {more.length === 1 ? "store" : "stores"}
                </summary>
                <ol className="divide-y divide-ink-800 border-t border-ink-800">{more.map((r, i) => storeRow(r, i + VISIBLE))}</ol>
              </details>
            ) : null}
          </>
        ) : (
          <p className="px-4 pb-4 pt-1 text-sm text-slate-300 sm:px-5">
            No {c.adjective} store we track lists a pre-order for this yet. The list fills in on its own as stores open pre-orders.
          </p>
        )}
      </div>
    </section>
  );
}
