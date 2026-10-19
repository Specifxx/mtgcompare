import type { Country } from "@/lib/country";
import type { MarketsTableData } from "@/lib/markets-table";

// "<card> price by market": every market's cheapest open listing on one scale (RiftCompare's CardMarketsTable), drawn from
// lib/markets-table.ts data. No hooks and no store or comparison import: the card page's client island and the server wrapper
// (CardMarketsTable) both draw it.
//
// WHAT THIS BLOCK MUST NOT BECOME: a recommendation to import. Stores ship within their own market and nothing here models
// international postage, duty or import tax (lib/market-comparison.ts, honesty rules). It reports where listings are cheaper;
// the footnote says the rest.
export function CardMarketsTableView({ data, name, country, noun = "price by market" }: { data: MarketsTableData; name: string; country: Country; noun?: string }) {
  return (
    <section className="card-surface mt-6 p-5" aria-label={`${name} ${noun}`}>
      <h2 className="font-bold text-white">
        {name} {noun}
      </h2>
      {data.summary ? <p className="mt-2 text-sm leading-relaxed text-slate-400">{data.summary}</p> : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th scope="col" className="py-2 pr-3">Market</th>
              <th scope="col" className="py-2 pr-3">Cheapest</th>
              <th scope="col" className="hidden py-2 pr-3 sm:table-cell">≈ {data.compareCurrency}</th>
              <th scope="col" className="py-2 text-right">Stores</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((q) => {
              const isCheapest = q.country === data.cheapest;
              const isYours = q.country === country;
              return (
                <tr key={q.country} className="border-t border-ink-800 align-top">
                  <th scope="row" className="py-2.5 pr-3 text-left font-semibold text-slate-200">
                    <span className="mr-1.5" aria-hidden>{q.flag}</span>
                    {q.label}
                    {isCheapest ? <span className="ml-2 chip bg-accent/15 text-[10px] font-bold uppercase tracking-wider text-accent">Cheapest</span> : null}
                    {isYours ? <span className="ml-2 chip bg-ink-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">Your market</span> : null}
                  </th>
                  <td className={`num py-2.5 pr-3 font-semibold ${isCheapest ? "text-accent" : "text-white"}`}>
                    {q.native}
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">{q.shipping}</span>
                    {q.comparable ? <div className="text-[11px] font-normal text-slate-400 sm:hidden">≈ {q.comparable}</div> : null}
                  </td>
                  <td className="num hidden py-2.5 pr-3 text-slate-400 sm:table-cell">
                    {q.comparable ?? <span className="text-slate-600">—</span>}
                  </td>
                  <td className="num py-2.5 text-right text-slate-400">{q.stores}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Prices are live listings in each market, in the currency that seller charges. The “≈ {data.compareCurrency}” column is an indicative conversion for comparison only: not a quote, and not what you&apos;ll be billed. Stores generally ship within their own market, and international postage, duty and import tax aren&apos;t included, so a cheaper market elsewhere isn&apos;t necessarily cheaper to get delivered to you.
      </p>
    </section>
  );
}
