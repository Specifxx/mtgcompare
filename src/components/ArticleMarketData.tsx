import Link from "next/link";
import { COUNTRIES, MARKETS } from "@/lib/country";
import type { SiteStats } from "@/lib/data";
import { int } from "@/lib/format";
import { STORES } from "@/lib/stores";

// Live per-market store counts for the where-to-buy and cheaper-abroad posts
// (RiftCompare's ArticleMarketData): how many stores MTG Compare reads in each
// market and how many of their listings are in stock right now, from the same
// cached site stats as every other page, so the post can never quote a count
// that disagrees with /stores. Never names a store as "best": that is the price
// board's job, per card.
export function ArticleMarketData({ stats }: { stats: SiteStats }) {
  const rows = MARKETS.map((m) => {
    const tracked = STORES.filter((s) => s.country === m).length;
    const inStock = stats.storeOffers.filter((o) => o.market === m && o.source.startsWith("store:")).reduce((a, o) => a + o.inStock, 0);
    return { m, tracked, inStock };
  });
  return (
    <section className="not-prose my-8 rounded-xl border border-ink-700 bg-ink-850 p-4" aria-label="Stores we track in each market">
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">Stores we track, by market (live)</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-3">Market</th>
              <th className="py-1.5 pr-3 text-right">Stores</th>
              <th className="py-1.5 text-right">Listings in stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.m} className="border-t border-ink-800">
                <th scope="row" className="py-2 pr-3 text-left font-semibold text-slate-200">
                  <span aria-hidden className="mr-1.5">{COUNTRIES[r.m].flag}</span>
                  {COUNTRIES[r.m].label}
                </th>
                <td className="num py-2 pr-3 text-right text-white">{int(r.tracked)}</td>
                <td className="num py-2 text-right text-slate-300">{int(r.inStock)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Each store is read once a day. The full list, with where each ships, is on the{" "}
        <Link href="/stores" className="text-brand-400 hover:underline">
          stores page
        </Link>
        .
      </p>
    </section>
  );
}
