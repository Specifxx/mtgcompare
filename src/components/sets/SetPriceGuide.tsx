import Link from "next/link";
import CardQuickLink from "@/components/CardQuickLink";
import { RARITIES } from "@/lib/constants";
import type { Country } from "@/lib/country";
import { money } from "@/lib/format";
import type { SetPriceGuideRow } from "@/lib/set-price-guide";

// Server-rendered price list for every card in a set, dearest first, under the
// H2 "{Set} price guide" (#price-guide): a sticky header over a scroll box, one
// row per printing, nothing client-side.
export function SetPriceGuide({ setName, rows, country, adjective, currency }: { setName: string; rows: SetPriceGuideRow[]; country: Country; adjective: string; currency: string }) {
  if (!rows.length) return null;
  const priced = rows.filter((r) => r.priceCents != null).length;
  return (
    <section id="price-guide" aria-labelledby="price-guide-h" className="card-surface scroll-mt-20 overflow-hidden">
      <div className="p-4 sm:p-5">
        <h2 id="price-guide-h" className="text-xl font-extrabold text-white">
          {setName} price guide
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          All {rows.length} {setName} printings, most expensive first: the cheapest in-stock price we track in {currency}, from {adjective} stores ({priced} with a live price today). Prices are those of each printing&apos;s headline version (Normal first).
        </p>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <thead className="sticky top-0 border-y border-ink-800 bg-ink-900 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">Card</th>
              <th scope="col" className="px-3 py-2 font-semibold">Rarity</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Cheapest</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">Stores</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800" data-tick-rows="">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-1.5">
                  <CardQuickLink slug={r.slug} className="text-slate-100 hover:text-brand-300 hover:underline">
                    {r.name}
                  </CardQuickLink>{" "}
                  <span className="num text-xs text-slate-500">{r.number}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-300">{r.rarity ? RARITIES[r.rarity]?.label ?? r.rarity : "—"}</td>
                <td className="num whitespace-nowrap px-3 py-1.5 text-right font-semibold text-white">
                  {r.priceCents != null ? money(r.priceCents, country) : <span className="font-normal text-slate-600">—</span>}
                </td>
                <td className="num px-4 py-1.5 text-right text-slate-300">{r.stores || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-ink-800 px-4 py-3 text-sm sm:px-5">
        <Link href="/price-guide" className="tap-link font-semibold text-brand-400 hover:underline">
          Every set in one price guide →
        </Link>
      </p>
    </section>
  );
}
