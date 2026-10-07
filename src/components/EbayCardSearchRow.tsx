"use client";

import { ebayLabel, ebaySearchUrl, onePieceEbayQuery, outboundRel } from "@/lib/affiliate";
import { useCountry } from "./CountryProvider";

// "Search eBay: A → · B →" under a movers panel (RiftCompare's EbayCardSearchRow):
// one row per panel naming its top cards, an EPN-tagged SEARCH on the visitor's
// own eBay, never a price or a stock claim. A row, not a button per card: a
// button beside every list item squeezed the names to a stub on a phone. The
// list rows themselves still open the card's QuickView.
export function EbayCardSearchRow({ names, source, page }: { names: string[]; source: string; page: string }) {
  const { country } = useCountry();
  const uniq = [...new Set(names)].slice(0, 3);
  if (uniq.length < 2) return null;
  return (
    <p className="mt-3 border-t border-ink-800 pt-3 text-xs text-slate-400">
      <span className="mr-1 font-semibold text-slate-300">Search {ebayLabel(country)}:</span>
      {uniq.map((n, i) => (
        <span key={n}>
          {i ? <span className="mx-1 text-slate-600">·</span> : null}
          <a href={ebaySearchUrl(country, onePieceEbayQuery(n), source)} target="_blank" rel={outboundRel()} data-retailer="ebay_search" data-page={page} data-surface="ebay_row" className="text-sky-300 hover:underline">
            {n.length > 24 ? `${n.slice(0, 23)}…` : n} →
          </a>
        </span>
      ))}
    </p>
  );
}
