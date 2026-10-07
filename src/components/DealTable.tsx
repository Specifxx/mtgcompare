import Link from "next/link";
import type { Country } from "@/lib/country";
import type { DealCard, TcgDealRow, VsEbayDealRow } from "@/lib/deal-pages";
import { outboundRel } from "@/lib/affiliate";
import { money } from "@/lib/format";
import { cardImage } from "@/lib/images";
import CardQuickLink from "./CardQuickLink";

// Deal Finder's tables (RiftCompare's BuyerTable / VsEbayTable). Presentational
// only — no hooks, no server imports — so the server page and the "only my
// cards" island render the very same markup. Every price links to the listing
// it names through an affiliate-tagged URL built on the server, with the
// data-retailer / data-page attributes PriceBoard's links carry.
//
// Below sm each table is three columns — Card · price · Below — with the % and
// the reference folded under, instead of a wide table scrolled sideways.
const PAGE = "deal-finder";

function CardCell({ card }: { card: DealCard }) {
  return (
    <td className="px-2 py-2 sm:px-4">
      <CardQuickLink slug={card.slug} className="flex items-center gap-2 sm:gap-2.5" title={card.name}>
        {card.hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cardImage.thumb(card.id)} alt="" width={28} height={39} loading="lazy" decoding="async" className="h-9 w-[26px] shrink-0 rounded-sm bg-ink-800 object-cover sm:h-10 sm:w-7" />
        ) : (
          <span className="h-9 w-[26px] shrink-0 rounded-sm bg-ink-800 sm:h-10 sm:w-7" />
        )}
        <span className="min-w-0 max-w-[6rem] min-[390px]:max-w-[6.5rem] sm:max-w-none">
          <span className="block truncate font-semibold text-white">{card.name}</span>
          {card.variant ? <span className="block truncate text-[11px] text-slate-400">{card.variant}</span> : null}
          <span className="block truncate text-[11px] text-slate-500">
            {card.setCode} · {card.number ?? "DON!!"}
          </span>
        </span>
      </CardQuickLink>
    </td>
  );
}

function Condition({ c }: { c: string | null }) {
  if (!c) return null;
  return <span className="ml-1 rounded border border-ink-700 bg-ink-850 px-1 py-px text-[10px] font-semibold text-slate-200">{c}</span>;
}

// data-card and data-surface, like every other buy surface, so GA's buy_click
// can tell which card and which column a click came from.
function Out({ href, retailer, card, dataSurface, className, children, label }: { href: string; retailer: string; card: string; dataSurface: string; className: string; children: React.ReactNode; label?: string }) {
  return (
    <a href={href} target="_blank" rel={outboundRel()} data-retailer={retailer} data-page={PAGE} data-card={card} data-surface={dataSurface} className={className} aria-label={label}>
      {children}
    </a>
  );
}

export function TcgDealTable({ rows, country }: { rows: TcgDealRow[]; country: Country }) {
  return (
    <table className="w-full text-sm sm:min-w-[640px]">
      <thead>
        <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
          <th className="px-2 py-2.5 font-semibold sm:px-4">Card</th>
          <th className="px-2 py-2.5 text-right font-semibold">Best price</th>
          <th className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell">TCGplayer market</th>
          <th className="px-2 py-2.5 text-right font-semibold">Below market</th>
          <th className="hidden px-4 py-2.5 text-right font-semibold sm:table-cell">% below</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ink-800">
        {rows.map((it) => (
          <tr key={it.card.id} className="hover:bg-ink-800/60">
            <CardCell card={it.card} />
            <td className="px-2 py-2 text-right align-middle">
              <Out
                href={it.buyUrl}
                retailer={it.buyRetailer}
                card={it.card.slug}
                dataSurface="deal_tcg"
                label={`${money(it.buyCents, country)} at ${it.buyLabel}`}
                className={`num font-semibold hover:underline ${it.isEbay ? "text-sky-300" : "text-accent"}`}
              >
                {money(it.buyCents, country)}
              </Out>
              <div className="ml-auto flex max-w-[5rem] items-center min-[390px]:max-w-[5.5rem] justify-end text-[10px] text-slate-500 sm:max-w-none">
                <span className="truncate" title={it.buyLabel}>{it.buyLabel}</span>
                <Condition c={it.condition} />
              </div>
            </td>
            <td className="hidden px-2 py-2 text-right sm:table-cell">
              <Out href={it.marketUrl} retailer="tcgplayer" card={it.card.slug} dataSurface="deal_tcg_market" className="num text-slate-300 hover:text-brand-400 hover:underline">
                {country === "US" ? "" : "≈ "}
                {money(it.marketCents, country)}
              </Out>
              <div className="text-[10px] text-slate-500">
                {it.tcgLowCents != null ? `TCGplayer low ${money(it.tcgLowCents, "US")}` : country === "US" ? "US market" : "US market, converted"}
              </div>
            </td>
            <td className="num px-2 py-2 text-right text-[13px] font-bold text-up sm:text-sm">
              {money(it.belowCents, country)}
              <div className="text-[10px] font-semibold sm:hidden">{it.belowPct}% below</div>
            </td>
            <td className="num hidden px-4 py-2 text-right font-semibold text-up sm:table-cell">{it.belowPct}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function VsEbayTable({ rows, country }: { rows: VsEbayDealRow[]; country: Country }) {
  const postage = (known: boolean) => (known ? "delivered" : "+ postage");
  return (
    <table className="w-full text-sm sm:min-w-[640px]">
      <thead>
        <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
          <th className="px-2 py-2.5 font-semibold sm:px-4">Card</th>
          <th className="px-2 py-2.5 text-right font-semibold">Best store price</th>
          <th className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell">Cheapest on eBay</th>
          <th className="px-2 py-2.5 text-right font-semibold">Below eBay</th>
          <th className="hidden px-4 py-2.5 text-right font-semibold sm:table-cell">% below</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ink-800">
        {rows.map((it) => (
          <tr key={it.card.id} className="hover:bg-ink-800/60">
            <CardCell card={it.card} />
            <td className="px-2 py-2 text-right">
              <Out href={it.storeUrl} retailer={it.storeRetailer} card={it.card.slug} dataSurface="deal_vs_ebay_store" label={`${money(it.storeCents, country)} at ${it.storeName}`} className="num font-semibold text-accent hover:underline">
                {money(it.storeCents, country)}
              </Out>
              <div className="ml-auto flex max-w-[5rem] items-center min-[390px]:max-w-[5.5rem] justify-end text-[10px] text-slate-500 sm:max-w-none">
                <span className="truncate" title={it.storeName}>{it.storeName}</span>
                <Condition c={it.condition} />
              </div>
            </td>
            <td className="hidden px-2 py-2 text-right sm:table-cell">
              <Out href={it.ebayUrl} retailer={it.ebayRetailer} card={it.card.slug} dataSurface="deal_vs_ebay" className="num text-sky-300 hover:underline">
                {money(it.ebayCents, country)}
              </Out>
              <div className="text-[10px] text-slate-500">eBay {postage(it.postageKnown)}</div>
            </td>
            <td className="num px-2 py-2 text-right text-[13px] font-bold text-up sm:text-sm">
              {money(it.belowCents, country)}
              <div className="text-[10px] font-semibold sm:hidden">{it.belowPct}% below</div>
              <div className="text-[10px] font-normal text-slate-500 sm:hidden">
                vs{" "}
                <Out href={it.ebayUrl} retailer={it.ebayRetailer} card={it.card.slug} dataSurface="deal_vs_ebay" className="text-sky-300 underline">
                  eBay {money(it.ebayCents, country)}
                </Out>{" "}
                {postage(it.postageKnown)}
              </div>
            </td>
            <td className="num hidden px-4 py-2 text-right font-semibold text-up sm:table-cell">{it.belowPct}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DealPager({ total, page, pageCount, linkFor, unit = "cards" }: { total: number; page: number; pageCount: number; linkFor: (p: number) => string; unit?: string }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm">
      <span className="text-xs text-slate-500">
        {total.toLocaleString("en-US")} {total === 1 ? unit.replace(/s$/, "") : unit} · page {page} of {pageCount}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={linkFor(page - 1)} className="btn-ghost text-sm">
            ← Prev
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link href={linkFor(page + 1)} className="btn-ghost text-sm">
            Next →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
