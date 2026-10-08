import type { Country } from "@/lib/country";
import type { EbayDealRow } from "@/lib/deal-pages";
import { outboundRel } from "@/lib/affiliate";
import { money } from "@/lib/format";
import { cardImage } from "@/lib/images";

// "Cheapest on eBay" (RiftCompare's CheapestOnEbay): cards whose cheapest eBay
// listing costs less than every store we track — free for everyone. Each row is
// one affiliate link to that eBay listing. Honest by rule: "delivered" only when
// the seller stated postage; the gap is against the cheapest tracked store (and
// in the US TCGplayer's own lowest listing); no % badge, no urgency. eBay blue,
// never gold (gold marks Plus). `positionOffset` keeps numbering across pages.
export function CheapestOnEbay({ rows, country, positionOffset = 0 }: { rows: EbayDealRow[]; country: Country; positionOffset?: number }) {
  if (rows.length === 0) return null;
  return (
    <section aria-label="Cheapest on eBay" className="rounded-xl border border-[#0064d2]/40 bg-[#0064d2]/[0.06] p-2 sm:p-3">
      <div className="mb-1 flex justify-end px-1">
        <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Paid links</span>
      </div>
      <ol className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        {rows.map((d, i) => (
          <li key={d.card.id} className="min-w-0">
            <a
              href={d.ebayUrl}
              target="_blank"
              rel={outboundRel()}
              data-retailer={d.ebayRetailer}
              data-page="deal-finder"
              data-card={d.card.slug}
              data-surface="deal_cheapest_ebay"
              data-position={positionOffset + i + 1}
              className="flex min-h-11 items-center gap-2.5 rounded-md px-2 py-2.5 transition-colors hover:bg-[#0064d2]/10"
            >
              <span className="h-11 w-8 shrink-0 overflow-hidden rounded bg-ink-900">
                {d.card.hasImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cardImage.thumb(d.card.id)} alt="" width={32} height={44} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">
                  {d.card.name}
                  {d.card.variant ? <span className="font-normal text-slate-400"> · {d.card.variant}</span> : null}
                  {d.card.finish === "F" ? <span className="font-normal text-slate-400"> · Foil</span> : null}
                </span>
                <span className="block truncate text-[11px] text-slate-500">
                  {d.card.setCode}{d.card.number ? ` · ${d.card.number}` : ""} · <span className="num font-semibold text-up">{money(d.gapCents, country)}</span> below the
                  cheapest {country === "US" ? "store or TCGplayer listing" : "store"}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="num text-sm font-bold text-sky-300">{money(d.ebayCents, country)}</span>
                <span className="text-[10px] text-slate-500">{d.postageKnown ? "delivered" : "+ postage"}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
      <p className="mt-1 px-1 text-[11px] text-slate-500">
        As an eBay Partner Network affiliate, MTG Compare earns from qualifying purchases, at no extra cost to you.
      </p>
    </section>
  );
}
