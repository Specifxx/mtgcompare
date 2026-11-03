"use client";
// The card page's phone buy path, ported from RiftCompare (CardMobileBuy.tsx).
// At 390px the price table started below the first screen, under the card
// image. Below md:
//   • CardTopBuy puts the cheapest in-stock listing in the visitor's market
//     and its Buy button directly under the card name;
//   • CardStickyBuyBar pins "$X at {store} · Buy" to the bottom of the screen
//     once that block has scrolled away, and hides again whenever the price
//     table itself is on screen.
// Both read lib/price-rows.ts, the table's own order, so they can never
// disagree with its "Cheapest" row. Links go through /go like every buy
// button, so buy_click events count them (from=card_top / card_bar).
import { useEffect, useState } from "react";
import { ebaySearchUrl, goHref } from "@/lib/affiliate";
import { ago, money } from "@/lib/format";
import { priceRows } from "@/lib/price-rows";
import { MARKET_LABEL, type Offer } from "@/lib/site-types";
import { useMarket } from "./ClientPrefs";
import { PRICE_TABLE_ID, sourceName } from "./PriceTable";

const TOP_BUY_ATTR = "data-top-buy";

function postage(o: Offer) {
  if (o.shippingCents == null) return o.source === "tcgplayer" ? "" : " · + postage";
  return o.shippingCents === 0 ? " · free postage" : ` · + ${money(o.shippingCents, o.currency)} postage`;
}

function buyClass(o: Offer) {
  return o.source === "ebay" ? "btn bg-[#0064d2] px-4 py-2 text-white hover:bg-[#0053ad]" : "btn-buy px-4 py-2";
}

export function CardTopBuy({ offers, productId, ebayQuery }: { offers: Offer[]; productId: number; ebayQuery?: string }) {
  const { market } = useMarket();
  const { cheapest: best, paidAlternative: alt } = priceRows(offers, market);
  if (!best) return null;
  // No eBay or TCGplayer row close enough: a labelled eBay search instead (owner, 2026-10-28: push eBay harder). Never a price.
  const searchMarket = market === "UK" || market === "AU" || market === "CA" ? market : "US";
  const search = !alt && ebayQuery && best.source !== "ebay" && best.source !== "tcgplayer" ? goHref({ url: ebaySearchUrl(ebayQuery, searchMarket), source: "ebay", market: searchMarket }, productId, "card_top_ebay_search") : null;
  return (
    <div {...{ [TOP_BUY_ATTR]: "" }} className="mt-3 rounded-lg border border-brand/30 bg-brand/[0.06] p-3 md:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Cheapest in {MARKET_LABEL[market]}</div>
          <div className="text-lg font-bold tabular-nums text-fg">{money(best.cents, best.currency)}</div>
          <div className="truncate text-xs text-muted">at {sourceName(best)}{postage(best)}</div>
        </div>
        <a href={goHref(best, productId, "card_top")} rel="sponsored nofollow noopener" target="_blank" className={`${buyClass(best)} shrink-0`}>
          Buy →
        </a>
      </div>
      {/* A store that pays nothing is cheapest: name eBay or TCGplayer when
          within 50% (lib/price-rows.ts paidAlternative), else an eBay search. */}
      {alt && (
        <div className="mt-2 flex items-center gap-2 border-t border-ink-700/60 pt-1 text-xs text-muted">
          <a
            href={goHref(alt.offer, productId, "card_top_alt")}
            rel="sponsored nofollow noopener"
            target="_blank"
            className="block min-w-0 flex-1 truncate py-2 font-semibold text-brand-400 hover:underline"
          >
            or <span className="tabular-nums">{money(alt.offer.cents, alt.offer.currency)}</span> on {alt.offer.source === "ebay" ? "eBay" : "TCGplayer"}
            {alt.pctMore > 0 ? ` (+${alt.pctMore}%)` : ""} →
          </a>
          <span className="shrink-0 rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-muted">Paid link</span>
        </div>
      )}
      {search && (
        <div className="mt-2 flex items-center gap-2 border-t border-ink-700/60 pt-1 text-xs text-muted" data-ebay-search="">
          <a href={search} rel="sponsored nofollow noopener" target="_blank" className="block min-w-0 flex-1 truncate py-2 font-semibold text-brand-400 hover:underline">
            or check listings on eBay →
          </a>
          <span className="shrink-0 rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-muted">Paid link</span>
        </div>
      )}
    </div>
  );
}

export function CardStickyBuyBar({ offers, productId }: { offers: Offer[]; productId: number }) {
  const { market } = useMarket();
  const best = priceRows(offers, market).cheapest;
  // Starts hidden: on first paint the top buy block is on screen.
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!best) return;
    const els = [document.getElementById(PRICE_TABLE_ID), document.querySelector(`[${TOP_BUY_ATTR}]`)].filter(Boolean) as Element[];
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target, e.isIntersecting);
      setShow(![...seen.values()].some(Boolean));
    });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [best]);
  // Room under the footer while the bar shows, so it never covers the last lines.
  useEffect(() => {
    if (!show) return;
    document.body.style.paddingBottom = "4rem";
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [show]);
  if (!best) return null;
  const name = sourceName(best);
  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-950/95 px-4 py-2 backdrop-blur transition-transform duration-200 md:hidden ${show ? "translate-y-0" : "pointer-events-none translate-y-[120%]"}`}
    >
      <div className="mx-auto flex max-w-xl items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-sm">
          <span className="font-bold tabular-nums text-fg">{money(best.cents, best.currency)}</span>
          <span className="text-muted"> at {name.length > 22 ? `${name.slice(0, 21)}…` : name}</span>
        </div>
        <a href={goHref(best, productId, "card_bar")} tabIndex={show ? 0 : -1} rel="sponsored nofollow noopener" target="_blank" className={`${buyClass(best)} shrink-0`}>
          Buy →
        </a>
      </div>
    </div>
  );
}

/** "Prices checked 5 hours ago": relative in the browser, because the page
 *  around it is cached for hours; the exact time is in the tooltip. */
export function CheckedAgo({ at }: { at: string | null | undefined }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => setText(ago(at)), [at]);
  if (!at) return null;
  return (
    <span className="text-xs text-muted" title={new Date(at).toUTCString()} suppressHydrationWarning>
      Prices checked {text ?? new Date(at).toISOString().slice(0, 10)}
    </span>
  );
}
