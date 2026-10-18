import { COUNTRIES, type Country } from "@/lib/country";
import { longDate, money } from "@/lib/format";
import type { LastKnownPrice as Known } from "@/lib/price-history-view";

// The price spot of a unit that has no current price in the visitor's market, filled with the last price the unit's own
// history holds (DECISIONS.md, "Last known price", 2026-10-18): the figure in the secondary text colour (never the price
// accent), its date in fine print, and the words "Last known price" so colour is never the only signal. It is not a live
// price: nothing beside it is a buy button priced with it, a "cheapest" or "from" claim, or savings maths. No hooks, so the
// card page renders it on the server and the QuickView in the browser.
export function LastKnownPrice({ known, country, className = "" }: { known: Known; country: Country; className?: string }) {
  const co = COUNTRIES[country];
  const day = longDate(known.day);
  const what =
    known.kind === "reference"
      ? `TCGplayer's market price on ${day}${country === "US" ? "" : `, converted to ${co.currency} at an approximate rate`}`
      : `A listing price seen in ${co.place} on ${day}`;
  return (
    <div className={className} data-last-known="" title={`${what}. Not a current price.`}>
      <p className="num text-lg font-semibold leading-tight text-slate-400">
        {known.kind === "reference" ? "≈ " : ""}
        {money(known.cents, country)}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">Last known price · {day}</p>
    </div>
  );
}
