"use client";
import { useState } from "react";
import { money } from "@/lib/format";
import { goHref } from "@/lib/affiliate";
import { sourceName } from "@/components/PriceTable";
import { useMarket } from "@/components/ClientPrefs";
import { CURRENCY, type Market, type Offer } from "@/lib/site-types";
import { ShareButton } from "@/components/ShareButton";
import { encodeList } from "@/lib/share";
import { SITE } from "@/site.config";

const SITE_GAME = SITE.gameShort;

export interface Result {
  lines: { qty: number; query: string; product: { id: number; slug: string; name: string; set: string; marketUsd: number | null } | null; cheapest: Offer | null }[];
  plans: { source: string; covers: number; total: number; currency: string }[];
  found: number;
  cheapestUsd: number;
  marketUsd: number;
}

export function Basket() {
  const { market } = useMarket();
  const [text, setText] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await fetch("/api/basket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, market }) });
          setRes((await r.json()) as Result);
          setBusy(false);
        }}
      >
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16} placeholder={"4 Card Name\n2 Another Card\nThird Card x3"} className="rounded-lg border border-ink-700 bg-ink-900 p-3 font-mono text-sm" />
        <button className="btn-primary" disabled={busy || !text.trim()}>{busy ? "Pricing…" : `Price my list (${market})`}</button>
      </form>
      <div className="min-w-0">
        {!res && <p className="text-muted">Results appear here.</p>}
        {res && <BasketResult res={res} market={market} share />}
      </div>
    </div>
  );
}

/** The priced list: totals, the cheapest seller for each card, one-store orders. Shared by Best Basket and /list. */
export function BasketResult({ res, market, share = false }: { res: Result; market: Market; share?: boolean }) {
  const items = res.lines.filter((l) => l.product).map((l) => ({ id: l.product!.id, qty: l.qty }));
  return (
    <>
      {share && items.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted">
          <ShareButton path={`/list?i=${encodeList(items)}`} name={`My ${SITE_GAME} list`} medium="list" label="Share this list" text={`My ${SITE_GAME} list: ${money(res.cheapestUsd)} buying each card where it's cheapest. Compare every store:`} />
          <span>Anyone with the link sees this list priced, no account needed.</span>
        </div>
      )}

      <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="card-surface p-4"><p className="text-xs uppercase text-muted">Cheapest total</p><p className="text-2xl font-black text-buy-400">{money(res.cheapestUsd)}</p><p className="text-xs text-muted">buying each card where it&apos;s cheapest (≈ US$)</p></div>
          <div className="card-surface p-4"><p className="text-xs uppercase text-muted">TCGplayer market</p><p className="text-2xl font-black">{money(res.marketUsd)}</p></div>
          <div className="card-surface p-4"><p className="text-xs uppercase text-muted">Cards found</p><p className="text-2xl font-black">{res.found}/{res.lines.length}</p></div>
        </div>
        <h2 className="mb-2 mt-6 font-bold">Cheapest for each card</h2>
        <div className="overflow-x-auto rounded-xl border border-ink-700/60">
          <table className="w-full text-sm">
            <tbody>
              {res.lines.map((l, i) => (
                <tr key={i} className="border-t border-ink-800">
                  <td className="px-3 py-2 text-muted">{l.qty}×</td>
                  <td className="px-3 py-2">{l.product ? <a className="hover:underline" href={`/card/${l.product.slug}`}>{l.product.name}</a> : <span className="text-down">Not found: {l.query}</span>}{l.product && <span className="block text-xs text-muted">{l.product.set}</span>}</td>
                  <td className="px-3 py-2 text-muted">{l.cheapest ? sourceName(l.cheapest) : "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold">{l.cheapest ? money(l.cheapest.cents * l.qty, l.cheapest.currency) : "—"}</td>
                  <td className="px-3 py-2 text-right">{l.cheapest && <a className="btn-buy" rel="sponsored nofollow noopener" target="_blank" href={goHref(l.cheapest, l.product?.id, "best-basket")}>Buy</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {res.plans.length > 0 && (
          <>
            <h2 className="mb-2 mt-6 font-bold">One-store orders in {market}</h2>
            <p className="mb-2 text-sm text-muted">The stores that have the most of your list in stock, and their total for those cards ({CURRENCY[market]}, before postage).</p>
            <ul className="grid gap-2 md:grid-cols-2">
              {res.plans.map((s) => (
                <li key={s.source} className="card-surface flex items-center justify-between p-3 text-sm">
                  <span><b>{sourceName({ source: s.source, market } as Offer)}</b><span className="block text-xs text-muted">{s.covers} of {res.found} cards in stock</span></span>
                  <span className="font-semibold">{money(s.total, s.currency)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    </>
  );
}
