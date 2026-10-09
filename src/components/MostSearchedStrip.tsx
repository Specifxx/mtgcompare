"use client";

import Link from "next/link";
import { useCountry } from "./CountryProvider";
import { money } from "@/lib/format";
import { imageFor } from "@/lib/images";
import { cardEbayQuery, ebayLabel, ebaySearchUrl, outboundRel } from "@/lib/affiliate";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import type { Country } from "@/lib/country";

/** What the strip needs of a card: the catalogue's facts and every market's cheapest listing. A CardLite is one. */
export interface MostSearchedCard {
  id: number;
  slug: string;
  name: string;
  number: string | null;
  variant: string | null;
  setCode: string;
  scryId: string | null;
  flags: number;
  low: Record<Country, number | null>;
}
export type MostSearchedRow = { card: MostSearchedCard; searches: number };

// "Most searched this week" on /movers (RiftCompare's MostSearchedStrip) — the
// free top 10 of Demand Finder (/tools/demand, Premium), which it links to for
// the full most-searched and most-viewed lists. A viewer below Premium sees
// exactly these rows on /tools/demand too, never more (FREE_DEMAND_ROWS): both
// read the clear preview slice (pv/demand.json, getDemandStrip), searches only.
// A client island only so each row shows the visitor's own market price: the
// rows carry every market's cheapest listing (CardLite.low).
export function MostSearchedStrip({ rows, coveredDays }: { rows: MostSearchedRow[]; coveredDays: number | null }) {
  const { country } = useCountry();
  // Old links point at #most-searched, so the anchor is always on the page —
  // with a plain note when there is no ranking to show.
  if (!rows.length) {
    return (
      <section id="most-searched" className="scroll-mt-header">
        <h2 className="text-xl font-extrabold text-white">Most searched this week</h2>
        <p className="mt-0.5 text-xs text-slate-500">Search counts aren&apos;t available right now. Check back after the next update.</p>
      </section>
    );
  }
  const days = coveredDays && coveredDays > 0 ? coveredDays : 7;
  return (
    <section id="most-searched" className="scroll-mt-header">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-xl font-extrabold text-white">Most searched this week</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            The cards MTG Compare visitors picked from search most often in the last {days} {days === 1 ? "day" : "days"}.
            Searches are counted worldwide, not per market, and each browser counts a card once a day.
          </p>
        </div>
        <Link href="/tools/demand" prefetch={false} className="shrink-0 text-xs font-semibold text-brand-400 hover:underline">
          Full leaderboard — Premium →
        </Link>
      </div>
      {/* Above the first eBay button, for every visitor. */}
      <AffiliateDisclosure partner="ebay" tight />
      <ol className="card-surface mt-2 grid grid-cols-1 gap-x-6 px-4 py-1 sm:grid-cols-2">
        {rows.map((r, i) => {
          const c = r.card;
          const cents = c.low[country];
          const name = c.variant ? `${c.name} (${c.variant})` : c.name;
          return (
            // Two SIBLING links (a link cannot nest another): the row to the
            // card page, and a search of the visitor's own eBay for the card —
            // a search (never a price or a listing we do not have) is the honest link.
            <li key={c.id} className="flex items-center gap-2 border-b border-ink-800 last:border-0 sm:[&:nth-last-child(2)]:border-0">
              <Link href={`/card/${c.slug}`} prefetch={false} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 py-2 hover:bg-ink-800/50">
                <span className="num w-5 shrink-0 text-right text-xs text-slate-500">{i + 1}</span>
                <span className="h-12 w-9 shrink-0 overflow-hidden rounded bg-ink-900">
                  {imageFor(c, "thumb") && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageFor(c, "thumb") ?? ""} alt={`${c.name}${c.number ? ` ${c.number}` : ""} card`} width={36} height={48} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{name}</span>
                  <span className="block text-[11px] text-slate-500">
                    {c.setCode} · {c.number} · {r.searches.toLocaleString("en-US")} {r.searches === 1 ? "search" : "searches"}
                  </span>
                </span>
                <span className="num shrink-0 whitespace-nowrap text-right text-sm font-bold text-white">
                  {cents != null ? money(cents, country) : <span className="text-xs font-normal text-slate-500">No price here</span>}
                </span>
              </Link>
              <a
                href={ebaySearchUrl(country, cardEbayQuery({ name: c.name, number: c.number }), "movers-searched")}
                target="_blank"
                rel={outboundRel()}
                data-retailer="ebay_search"
                data-page="movers"
                data-card={c.slug}
                className="btn-ebay-ghost min-h-11 shrink-0 px-2.5 text-xs"
              >
                eBay<span className="sr-only"> search for {c.name} on {ebayLabel(country)}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
