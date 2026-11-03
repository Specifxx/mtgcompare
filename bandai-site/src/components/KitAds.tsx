"use client";
// The eBay ads of the model-kit section (SITE.kits): the kits' own box photos,
// each a tagged eBay search for that kit in the visitor's market. Card ads were
// a poor fit beside a kit (2026-10-29), and a search link costs no eBay API
// call. Labelled "Ad", disclosed in the box, never a pop-up.
import { SITE } from "@/site.config";
import type { KitAdTile } from "@/lib/kits";
import { ebaySearchUrl, goHref } from "@/lib/affiliate";
import { useMarket } from "./ClientPrefs";
import { EbayWord } from "./EbayCallout";

const EBAY_SEARCH_MARKETS = ["US", "UK", "AU", "CA"] as const;
const ACCENT = "#0064d2";
const MIN_TILES = 3;

function useSearch() {
  const { market } = useMarket();
  const m = (EBAY_SEARCH_MARKETS as readonly string[]).includes(market) ? (market as (typeof EBAY_SEARCH_MARKETS)[number]) : "US";
  const prefix = SITE.kits?.searchPrefix ?? "";
  return (query: string, jan: string | undefined, from: string) =>
    goHref({ url: ebaySearchUrl(`${prefix} ${query}`.trim(), m), source: "ebay", market: m }, jan ? Number(jan) : undefined, from);
}

function AdLabel() {
  return <span className="rounded bg-ink-950/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Ad</span>;
}

/** The slim row for the top of a kit page, under its price and Buy button. */
export function CompactKitAds({ tiles, page }: { tiles: KitAdTile[]; page: string }) {
  const href = useSearch();
  if (tiles.length < MIN_TILES) return null;
  const tag = `${page}-mini-ebay-kit`;
  return (
    <aside data-ad aria-label="Sponsored: these kits on eBay" className="flex flex-col gap-1.5 rounded-lg border border-ink-700 bg-ink-900/60 p-2">
      <div className="flex items-stretch gap-2">
        <a href={href("", undefined, `${tag}-all`)} rel="sponsored nofollow noopener" target="_blank" className="flex w-12 shrink-0 flex-col items-center justify-center gap-1 text-center">
          <EbayWord className="text-base" />
          <span className="text-[10px] font-bold" style={{ color: ACCENT }}>All →</span>
        </a>
        <div className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto pb-1">
          {tiles.map((t) => (
            <a
              key={t.jan}
              href={href(t.name, t.jan, tag)}
              rel="sponsored nofollow noopener"
              target="_blank"
              title={`${t.name} on eBay`}
              aria-label={`${t.name} on eBay`}
              className="flex w-[64px] shrink-0 snap-start flex-col overflow-hidden rounded-md border border-ink-700 bg-white transition-colors hover:border-[#0064d2]"
            >
              <img src={t.image} alt={t.name} loading="lazy" decoding="async" className="aspect-square w-full object-contain p-0.5" />
              <span className="truncate px-0.5 py-0.5 text-center text-[10px] font-black text-white" style={{ background: ACCENT }}>eBay</span>
            </a>
          ))}
        </div>
      </div>
      <p className="flex items-center gap-2 text-[10px] leading-tight text-muted">
        <AdLabel />
        <span>Sponsored: {SITE.name} may earn a commission from eBay purchases, at no cost to you.</span>
      </p>
    </aside>
  );
}

/** The full-size strip, for the bottom of kit pages and the kit lists. */
export function KitEbayStrip({ tiles, page, title }: { tiles: KitAdTile[]; page: string; title: string }) {
  const href = useSearch();
  if (tiles.length < MIN_TILES) return null;
  const tag = `${page}-ebay-kit-strip`;
  const all = href("", undefined, `${tag}-all`);
  return (
    <section data-ad className="overflow-hidden rounded-xl border bg-ink-900/60" style={{ borderColor: `${ACCENT}55`, backgroundImage: `linear-gradient(135deg, ${ACCENT}14, transparent 55%)` }}>
      <div className="flex items-center gap-3 px-4 pt-3">
        <EbayWord className="text-2xl" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-bold leading-tight text-fg">{title}</p>
          <p className="truncate text-[11px] text-muted">New and used listings, cheapest first</p>
        </div>
        <AdLabel />
        <a href={all} rel="sponsored nofollow noopener" target="_blank" className="hidden shrink-0 rounded-md px-2.5 py-1 text-xs font-bold text-white sm:inline-block" style={{ background: ACCENT }}>
          Shop eBay →
        </a>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto px-4 pb-2 pt-3">
        {tiles.map((t) => (
          <a key={t.jan} href={href(t.name, t.jan, tag)} rel="sponsored nofollow noopener" target="_blank" className="group flex w-[136px] shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-900 transition hover:-translate-y-0.5 hover:border-[#0064d2]">
            <div className="relative aspect-square bg-white">
              <img src={t.image} alt={t.name} loading="lazy" decoding="async" className="h-full w-full object-contain p-1.5 transition group-hover:scale-[1.03]" />
              <span className="absolute bottom-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-xs font-black text-white shadow" style={{ background: ACCENT }}>eBay</span>
            </div>
            <div className="flex flex-1 flex-col gap-0.5 p-2">
              <p className="line-clamp-2 text-xs font-medium leading-tight text-fg">{t.name}</p>
              <p className="mt-auto text-[11px] text-muted">Search eBay</p>
            </div>
          </a>
        ))}
        <a href={all} rel="sponsored nofollow noopener" target="_blank" className="flex w-[136px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600 p-3 text-center text-sm font-bold text-fg hover:border-[#0064d2]">
          <span className="rounded-full px-3 py-1 text-xs text-white" style={{ background: ACCENT }}>Shop eBay →</span>
          <span className="text-[11px] font-normal text-muted">Every listing, sorted by price</span>
        </a>
      </div>
      <p className="px-4 pb-3 text-[11px] text-muted">Sponsored: {SITE.name} may earn a commission from eBay purchases, at no cost to you.</p>
    </section>
  );
}
