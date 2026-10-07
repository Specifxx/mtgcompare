import { COUNTRIES, type Country } from "@/lib/country";
import type { OfferRow } from "@/lib/data";
import { compareMarkets, formatCompare, marketSpreadSentence, type MarketQuote } from "@/lib/market-comparison";
import { money } from "@/lib/format";

// "<card> price by market": every market's cheapest open listing on one scale
// (RiftCompare's CardMarketsTable). A SERVER component that takes the visitor's
// market, because OP's card and sealed pages render per request (getCountry()
// over cached loaders): the comparison currency follows the visitor with no
// client JS, and a crawler gets every market's real price in the HTML.
//
// WHAT THIS BLOCK MUST NOT BECOME: a recommendation to import. Stores ship within
// their own market and nothing here models international postage, duty or import
// tax (lib/market-comparison.ts, honesty rules). It reports where listings are
// cheaper; the footnote says the rest.
function Shipping({ q }: { q: MarketQuote }) {
  return (
    <span className="mt-0.5 block text-xs font-normal text-slate-500">
      {q.shipsFromUs
        ? "ships from the US · postage at checkout"
        : q.shippingCents == null
          ? "postage at checkout"
          : q.shippingCents === 0
            ? "free postage"
            : `+ ${money(q.shippingCents, q.country)} postage`}
    </span>
  );
}

export function CardMarketsTable({ offers, name, country, noun = "price by market" }: { offers: OfferRow[]; name: string; country: Country; noun?: string }) {
  const currency = COUNTRIES[country].currency;
  const cmp = compareMarkets(offers, currency);
  // One market with a listing is not a comparison.
  if (cmp.quotes.length < 2) return null;
  const summary = marketSpreadSentence(cmp, name);
  const cheapestCode = cmp.cheapest?.country;
  return (
    <section className="card-surface mt-6 p-5" aria-label={`${name} ${noun}`}>
      <h2 className="font-bold text-white">
        {name} {noun}
      </h2>
      {summary ? <p className="mt-2 text-sm leading-relaxed text-slate-400">{summary}</p> : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th scope="col" className="py-2 pr-3">Market</th>
              <th scope="col" className="py-2 pr-3">Cheapest</th>
              <th scope="col" className="hidden py-2 pr-3 sm:table-cell">≈ {cmp.compareCurrency}</th>
              <th scope="col" className="py-2 text-right">Stores</th>
            </tr>
          </thead>
          <tbody>
            {cmp.quotes.map((q) => {
              const isCheapest = q.country === cheapestCode;
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
                    {money(q.nativeCents, q.country)}
                    <Shipping q={q} />
                    {q.currency !== cmp.compareCurrency ? (
                      <div className="text-[11px] font-normal text-slate-400 sm:hidden">≈ {formatCompare(q.comparableCents, cmp.compareCurrency)}</div>
                    ) : null}
                  </td>
                  <td className="num hidden py-2.5 pr-3 text-slate-400 sm:table-cell">
                    {q.currency === cmp.compareCurrency ? <span className="text-slate-600">—</span> : formatCompare(q.comparableCents, cmp.compareCurrency)}
                  </td>
                  <td className="num py-2.5 text-right text-slate-400">{q.storeCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Prices are live listings in each market, in the currency that seller charges. The “≈ {cmp.compareCurrency}” column is an indicative conversion for comparison only: not a quote, and not what you&apos;ll be billed. Stores generally ship within their own market, and international postage, duty and import tax aren&apos;t included, so a cheaper market elsewhere isn&apos;t necessarily cheaper to get delivered to you.
      </p>
    </section>
  );
}
