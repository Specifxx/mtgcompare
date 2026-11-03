"use client";
import { useMemo, useState } from "react";
import type { DealRow } from "@/lib/tools";
import { money } from "@/lib/format";
import { goHref } from "@/lib/affiliate";
import { sourceName } from "@/components/PriceTable";
import { useMarket } from "@/components/ClientPrefs";
import { MARKETS, type Market } from "@/lib/site-types";

export function DealFinder({ rows }: { rows: DealRow[] }) {
  const { market } = useMarket();
  const [mk, setMk] = useState<Market | "ALL" | "MINE">("MINE");
  const [kind, setKind] = useState<"all" | "card" | "sealed">("all");
  const [min, setMin] = useState(10);
  const [minPrice, setMinPrice] = useState(5);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const want = mk === "MINE" ? market : mk;
    return rows.filter(
      (r) =>
        (want === "ALL" || r.offerMarket === want) &&
        (kind === "all" || r.kind === kind) &&
        r.saving >= min &&
        r.market >= minPrice * 100 &&
        (!q || `${r.name} ${r.set}`.toLowerCase().includes(q.toLowerCase())),
    );
  }, [rows, mk, market, kind, min, minPrice, q]);
  const sel = "rounded-md border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm";
  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        <select className={sel} value={mk} onChange={(e) => setMk(e.target.value as Market)}>
          <option value="MINE">My market ({market})</option>
          <option value="ALL">All markets</option>
          {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className={sel} value={kind} onChange={(e) => setKind(e.target.value as "all")}>
          <option value="all">Cards and sealed</option><option value="card">Cards</option><option value="sealed">Sealed</option>
        </select>
        <select className={sel} value={min} onChange={(e) => setMin(Number(e.target.value))}>
          {[8, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n}%+ under</option>)}
        </select>
        <select className={sel} value={minPrice} onChange={(e) => setMinPrice(Number(e.target.value))}>
          {[1, 5, 20, 50, 100].map((n) => <option key={n} value={n}>Worth ${n}+</option>)}
        </select>
        <input className={`${sel} min-w-48 flex-1`} placeholder="Filter by name or set" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="mt-3 text-sm text-muted">{shown.length} deals</p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-ink-700/60">
        <table className="w-full text-sm">
          <thead className="bg-ink-850 text-left text-xs uppercase text-muted"><tr><th className="px-3 py-2">Card</th><th className="px-3 py-2">Where</th><th className="px-3 py-2 text-right">Market</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Under</th><th /></tr></thead>
          <tbody>
            {shown.slice(0, 300).map((r) => (
              <tr key={`${r.id}-${r.source}-${r.offerMarket}`} className="border-t border-ink-800">
                <td className="px-3 py-2"><a className="hover:underline" href={`/card/${r.slug}`}>{r.name}</a><span className="block text-xs text-muted">{r.set}</span></td>
                <td className="px-3 py-2 text-muted">{sourceName({ source: r.source, market: r.offerMarket } as never)} <span className="text-xs">{r.offerMarket}</span></td>
                <td className="px-3 py-2 text-right text-muted">{money(r.market)}</td>
                <td className="px-3 py-2 text-right font-semibold text-buy-400">{money(r.cents, r.currency)}{r.currency !== "USD" && <span className="block text-xs font-normal text-muted">≈ {money(r.usd)}</span>}</td>
                <td className="px-3 py-2 text-right">−{r.saving}%</td>
                <td className="px-3 py-2 text-right"><a className="btn-buy" rel="sponsored nofollow noopener" target="_blank" href={goHref({ url: r.url, source: r.source, market: r.offerMarket }, r.id, "deal-finder")}>Buy</a></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="p-4 text-muted">No deals match these filters.</p>}
      </div>
    </div>
  );
}
