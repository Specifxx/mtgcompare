import { ebayAffiliateUrl, outboundRel } from "@/lib/affiliate";
import type { Country } from "@/lib/country";
import type { PanelGraded } from "@/lib/listing-panel";
import { panelTitle } from "@/lib/listing-panel";

// Graded (slabbed) eBay listings for a card (RiftCompare's EbayGradedLive). The
// category our own comparison structurally cannot cover: no tracked store lists
// PSA/BGS/CGC/SGC copies, so for a slab eBay is the only market. A slab price is
// NOT compared as if it were a raw price: the multiple against raw is shown
// ("3.2x raw") because that is the number a collector weighs, never framed as
// cheaper or dearer. Slabs never enter Offer, the board or any comparison.
const GRADER_STYLE: Record<string, string> = {
  PSA: "bg-[#d4342c]/15 data-ink [--data-ink:#ff8a84]",
  BGS: "bg-[#1f6feb]/15 data-ink [--data-ink:#79b8ff]",
  CGC: "bg-[#2da44e]/15 data-ink [--data-ink:#7ee787]",
  SGC: "bg-[#8957e5]/15 data-ink [--data-ink:#c9a6ff]",
};
const symbolFor = (cur: string) => ({ USD: "US$", AUD: "A$", GBP: "£", SGD: "S$", CAD: "C$", EUR: "€" } as Record<string, string>)[cur] ?? `${cur} `;
const fmt = (cents: number, cur: string) => `${symbolFor(cur)}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function EbayGradedLive({ listings, country, rawCents, card, page = "card" }: { listings: PanelGraded[]; country: Country; rawCents: number | null; card?: string; page?: string }) {
  const rows = listings.filter((l) => l.market === country);
  if (!rows.length) return null;
  return (
    <div>
      <ul className="divide-y divide-ink-800">
        {rows.map((l) => {
          const multiple = rawCents != null && rawCents > 0 ? l.priceCents / rawCents : null;
          return (
            <li key={l.itemId}>
              <a href={ebayAffiliateUrl(l.url, "graded")} target="_blank" rel={outboundRel()} data-retailer="ebay_graded" data-page={page} data-card={card} data-surface="ebay_graded" className="group flex items-center gap-3 py-3 transition-colors hover:bg-ink-800/60">
                {l.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.imageUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-14 w-11 shrink-0 rounded object-cover" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`chip text-[10px] font-bold uppercase tracking-wide ${GRADER_STYLE[l.grader] ?? "bg-ink-800 text-slate-300"}`}>
                      {l.grader}
                      {l.grade !== "Graded" ? <span className="num ml-1">{l.grade}</span> : null}
                    </span>
                    {l.grade === "Graded" ? <span className="text-[10px] text-slate-500">grade not stated in listing</span> : null}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-500" title={l.title}>
                    {panelTitle(l.title, 80)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="num text-sm font-extrabold text-white">{fmt(l.priceCents, l.currency)}</div>
                  {multiple != null ? <div className="num text-[11px] text-slate-500">{multiple.toFixed(1)}× raw</div> : null}
                  {l.shippingCents === 0 ? <div className="text-[10px] text-brand-400">Free postage</div> : null}
                </div>
              </a>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        Slabbed copies on eBay. No tracked store lists graded cards, so these have no local comparison; the multiple is against the cheapest raw copy we track.
      </p>
    </div>
  );
}
