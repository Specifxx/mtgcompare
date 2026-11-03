"use client";
// The price rows: every offer for the visitor's market, cheapest in-stock
// first, each with a tracked buy button. TCGplayer and eBay US stay listed in
// every market as the reference ("≈" converted at the day's ECB rate).
// Out-of-stock rows fold behind a button, as on RiftCompare: they are the
// last thing a buyer needs and used to push the live prices off the screen.
// Row order is lib/price-rows.ts, shared with the phone buy block.
import { Fragment, useState } from "react";
import { SITE } from "@/site.config";
import { CURRENCY, MARKETS, MARKET_LABEL, type Market, type Offer } from "@/lib/site-types";
import { money } from "@/lib/format";
import { Flag } from "./Flag";
import { goHref } from "@/lib/affiliate";
import { priceRows } from "@/lib/price-rows";
import { useMarket } from "./ClientPrefs";
import { ReportPrice } from "./ReportForms";

const NAMES: Record<string, string> = {
  tcgplayer: "TCGplayer",
  ebay: "eBay",
  ...Object.fromEntries(SITE.stores.map((s) => [s.key, s.name])),
  ...Object.fromEntries((SITE.kits?.stores ?? []).map((s) => [s.key, s.name])),
};

export function sourceName(o: Offer) {
  if (o.source === "ebay") return o.market === "US" ? "eBay" : `eBay ${o.market}`;
  return NAMES[o.source] ?? o.source;
}

/** Where the phone's sticky buy bar hides (components/CardBuy.tsx). */
export const PRICE_TABLE_ID = "price-comparison";

export function PriceTable({ offers, fx, productId, page, compact = false, amazon = null, tableId = PRICE_TABLE_ID, product }: { offers: Offer[]; fx: Record<string, number>; productId: number; page: string; compact?: boolean; amazon?: Partial<Record<Market, string>> | null; /** null in the quick view: the page's own table keeps the id the buy bar watches */ tableId?: string | null; /** the product's name: shows "Report a wrong price" under the table */ product?: string }) {
  const { market, setMarket } = useMarket();
  const [showOut, setShowOut] = useState(false);
  // eBay and TCGplayer lead the table (lib/price-rows.ts `display`); "Cheapest"
  // stays on the real cheapest and a dearer pinned row says by how much. No
  // wording about the order (owner, 2026-10-30): the paid rows are simply first.
  // Amazon (a tagged search of the market's own Amazon, only where that store has
  // our tag: lib/affiliate.ts) comes second, right under
  // the first eBay row (eBay first, Amazon second: owner, 2026-10-30), or first
  // when there is no eBay row: no price, never ranked, never the cheapest.
  // Both are drawn exactly like a store row, tagged "Ad" (owner, 2026-11-01:
  // "blend in and look exactly the same as the other price rows").
  const { inStock, refs, outOfStock, cheapest, display, pinned } = priceRows(offers, market);
  const rows = display;
  const cur = CURRENCY[market];
  const conv = (o: Offer) => (o.currency === cur ? null : Math.round((o.cents / (fx[o.currency] ?? 1)) * (fx[cur] ?? 1)));
  // DexCompare's conversion layout (its buy-click rate is the family's highest, ~44%): the market the prices are for is stated and
  // switchable right above the rows, the best price is the one loud button, every other row says "View deal".
  const storesIn = new Set(inStock.filter((o) => o.source !== "tcgplayer" && o.source !== "ebay").map((o) => o.source)).size;
  const picker = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-ink-800 bg-ink-850 px-3 py-2 text-xs text-muted" data-market-bar>
      <span>
        Prices for <Flag code={market} /> <b className="text-fg">{MARKET_LABEL[market]}</b>
        {storesIn > 0 && <> · {storesIn} store{storesIn === 1 ? "" : "s"} in stock</>}
      </span>
      {!compact && <span className="flex flex-wrap gap-1" role="group" aria-label="Show prices for">
        {MARKETS.map((m) => (
          <button key={m} type="button" onClick={() => setMarket(m)} aria-pressed={m === market} className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold ${m === market ? "border-brand bg-brand/15 text-fg" : "border-ink-700 hover:border-brand/60 hover:text-fg"}`}>
            <Flag code={m} />{m}
          </button>
        ))}
      </span>}
    </div>
  );
  if (!rows.length)
    return (
      <div className="overflow-hidden rounded-xl border border-dashed border-ink-700">
        {picker}
        <p className="p-4 text-sm text-muted">No live listings in {MARKET_LABEL[market]} right now. Try another market above, or check eBay below.</p>
        {product && <div className="px-4 pb-3"><ReportPrice product={product} region={market} buttonClassName="btn-ghost px-3 py-1.5" /></div>}
      </div>
    );
  const live = [...inStock, ...refs];
  // Out-of-stock rows show when asked, or when nothing is in stock at all.
  const unfold = showOut || live.length === 0;
  const shown = compact ? rows.slice(0, 6) : unfold ? rows : rows.filter((o) => live.includes(o));
  const folded = compact ? 0 : unfold ? 0 : outOfStock.length;
  const amazonUrl = amazon?.[market];
  const amazonRow = amazonUrl ? (
    <tr data-amazon-row className="border-t border-ink-800">
      <td className="px-3 py-2.5">
        <span className="font-medium text-fg">Amazon</span>
        <span className="ml-2 rounded bg-ink-800 px-1.5 py-0.5 text-[10px] font-semibold text-muted">Ad</span>
      </td>
      <td className="hidden px-3 py-2.5 text-xs text-muted sm:table-cell">Price shows on Amazon</td>
      <td className="px-3 py-2.5 text-right text-xs text-muted">See price</td>
      <td className="px-3 py-2.5 text-right">
        <a href={goHref({ url: amazonUrl, source: "amazon", market }, productId, `${page}_pinned`)} rel="sponsored nofollow noopener" target="_blank" className="btn-ghost min-h-10 whitespace-nowrap px-3 py-1.5">
          Check price <span aria-hidden="true">↗</span>
        </a>
      </td>
    </tr>
  ) : null;
  const amazonAfter = shown.findIndex((o) => o.source === "ebay");
  return (
    <div id={tableId ?? undefined} className="overflow-hidden rounded-xl border border-ink-700/60">
      {picker}
      <table className="w-full text-sm">
        <thead className="bg-ink-850 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2">Store</th>
            <th className="hidden px-3 py-2 sm:table-cell">Details</th>
            <th className="px-3 py-2 text-right">Price</th>
            <th className="px-3 py-2"><span className="sr-only">Buy</span></th>
          </tr>
        </thead>
        <tbody>
          {amazonAfter < 0 && amazonRow}
          {shown.map((o, i) => {
            const c = conv(o);
            const best = o === cheapest;
            return (
              <Fragment key={i}>
                <tr className={`border-t border-ink-800 ${best ? "bg-buy/10" : ""} ${o.inStock ? "" : "opacity-60"}`}>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-fg">{sourceName(o)}</span>
                    {o.source === "ebay" && <span className="ml-2 rounded bg-ink-800 px-1.5 py-0.5 text-[10px] font-semibold text-muted">Ad</span>}
                    {best && <span className="ml-2 rounded bg-buy px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Best price</span>}
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-muted sm:table-cell">
                    {o.printing && o.printing !== "Normal" && <span className="chip mr-1">{o.printing}</span>}
                    {o.preorder && <span className="chip mr-1 border-brand text-brand-400">Pre-order</span>}
                    {!o.inStock && <span className="chip mr-1">Out of stock</span>}
                    {o.source === "tcgplayer" && <span>Lowest listing</span>}
                    {o.shippingCents != null && <span>+{money(o.shippingCents, o.currency)} shipping</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {money(o.cents, o.currency)}
                    {c != null && <span className="block text-xs font-normal text-muted">≈ {money(c, cur)}</span>}
                    {pinned.includes(o) && cheapest && o !== cheapest && o.currency === cheapest.currency && cheapest.cents > 0 && o.cents > cheapest.cents && (
                      <span className="block text-xs font-normal text-muted">+{Math.round(((o.cents - cheapest.cents) / cheapest.cents) * 100)}% vs cheapest</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <a href={goHref(o, productId, pinned.includes(o) ? `${page}_pinned` : page)} rel="sponsored nofollow noopener" target="_blank" className={`min-h-10 whitespace-nowrap ${best ? "btn-buy" : o.inStock ? "btn-ghost px-3 py-1.5" : "btn-ghost px-3 py-1.5 opacity-80"}`}>
                      {best ? "Buy now" : o.inStock ? "View deal" : "View"} <span aria-hidden="true">↗</span>
                    </a>
                  </td>
                </tr>
                {i === amazonAfter && amazonRow}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {folded > 0 && (
        <button type="button" onClick={() => setShowOut(true)} className="w-full border-t border-ink-800 px-3 py-2.5 text-left text-sm text-muted hover:bg-ink-850 hover:text-fg">
          Show {folded} out-of-stock listing{folded === 1 ? "" : "s"} ↓
        </button>
      )}
      {product && !compact && (
        <div className="border-t border-ink-800 px-3 pb-3 text-muted">
          <ReportPrice product={product} region={market} buttonClassName="btn-ghost px-3 py-1.5" stores={rows.filter((o) => o.source !== "ebay" && o.source !== "tcgplayer").map((o) => ({ name: sourceName(o), price: money(o.cents, o.currency) }))} />
        </div>
      )}
    </div>
  );
}

/** The cheapest in-stock price for the visitor's market, for tiles. */
export function LocalPrice({ offers, fallbackUsd }: { offers: Offer[]; fallbackUsd: number | null }) {
  const { market } = useMarket();
  const o = offers.find((x) => x.market === market && x.inStock);
  if (o) return <span>{money(o.cents, o.currency)}</span>;
  return <span>{money(fallbackUsd, "USD")}</span>;
}
