import type { Country } from "@/lib/country";
import type { OfferRow } from "@/lib/data";
import { marketsTableData } from "@/lib/markets-table";
import { CardMarketsTableView } from "./CardMarketsTableView";

// "<card> price by market" for a server page that renders one market (the sealed page): the data is resolved here
// (lib/markets-table.ts) and drawn by CardMarketsTableView, the view the card page's client island draws. A crawler gets every
// market's real price in the HTML.
export function CardMarketsTable({ offers, name, country, noun = "price by market" }: { offers: OfferRow[]; name: string; country: Country; noun?: string }) {
  const data = marketsTableData(offers, name, country);
  return data ? <CardMarketsTableView data={data} name={name} country={country} noun={noun} /> : null;
}
