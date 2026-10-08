import { ebayLabel, ebaySearchUrl, outboundRel } from "@/lib/affiliate";
import type { Country } from "@/lib/country";
import { EbayWordmark } from "./AffiliateAds";

export interface EbayLink {
  label: string;
  query: string;
}

// A titled block of eBay searches (RiftCompare's EbaySearchPanel). Each button
// is an EPN-tagged search on the visitor's own eBay — no API call, no quota.
export function EbaySearchPanel({ heading, sub, links, country, page }: { heading: string; sub?: string; links: EbayLink[]; country: Country; page: string }) {
  if (!links.length) return null;
  return (
    <aside aria-label={heading} className="rounded-lg border border-[#0064d2]/40 bg-[#0064d2]/[0.06] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <EbayWordmark className="text-lg" />
        <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Ad · Paid links</span>
        <h2 className="text-[15px] font-extrabold text-white">{heading}</h2>
      </div>
      {sub ? <p className="mt-1 text-xs text-slate-400">{sub}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map((l) => (
          <a
            key={l.query}
            href={ebaySearchUrl(country, l.query, `${page}-panel`)}
            target="_blank"
            rel={outboundRel()}
            data-retailer="ebay_search"
            data-page={page}
            className="btn-ebay min-h-9 px-3 py-1.5 text-xs"
          >
            {l.label}
          </a>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Searches {ebayLabel(country)}. As an eBay Partner Network affiliate, MTG Compare earns from qualifying purchases.</p>
    </aside>
  );
}
