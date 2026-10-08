"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { outboundRel } from "@/lib/affiliate";
import { COUNTRIES, type Country } from "@/lib/country";
import { ago, money } from "@/lib/format";
import { headlineOffer, offerStock, offerStockLabel, rankOffers } from "@/lib/sealed-offers";
import type { SealedQvPayload } from "@/lib/sealed-quick-view";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { useCountry } from "./CountryProvider";
import { ReportPriceButton } from "./ReportPriceButton";
import { SealedWatchButton } from "./SealedWatchButton";
import { Dialog } from "./ui/Dialog";

// Quick-view popup for sealed products a plain
// left click on a SealedTile opens this instead of leaving /sealed. MTG Compare keeps its
// /sealed/[slug] pages (SEO and the price chart), so the modal ends with "Open
// full page". Data comes from GET /api/sealed/[slug] (one cached, market-
// independent response); the click that opened it is a real <a href>, so
// crawlers, new tabs and middle-clicks behave like any link.
interface Open {
  slug: string;
  thumb: string | null;
  label: string | null;
  n: number;
}
const Ctx = createContext<{ open: (slug: string, hint?: { thumb?: string | null; label?: string | null }) => void; prefetch: (slug: string) => void } | null>(null);
export const useSealedQuickView = () => useContext(Ctx);

const cache = new Map<string, Promise<SealedQvPayload>>();
export function loadSealedQuickView(slug: string): Promise<SealedQvPayload> {
  let p = cache.get(slug);
  if (!p) {
    p = fetch(`/api/sealed/${encodeURIComponent(slug)}`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<SealedQvPayload>;
    });
    p.catch(() => cache.delete(slug));
    cache.set(slug, p);
  }
  return p;
}

export function SealedQuickViewProvider({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState<Open | null>(null);
  const last = useRef<Open | null>(null);
  if (shown) last.current = shown;
  const display = shown ?? last.current;
  const counter = useRef(0);
  const open = useCallback((slug: string, hint?: { thumb?: string | null; label?: string | null }) => {
    counter.current += 1;
    setShown({ slug, thumb: hint?.thumb ?? null, label: hint?.label ?? null, n: counter.current });
    void loadSealedQuickView(slug).catch(() => {});
    (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "quickview_open", { card: slug });
  }, []);
  const prefetch = useCallback((slug: string) => void loadSealedQuickView(slug).catch(() => {}), []);
  const close = useCallback(() => setShown(null), []);
  return (
    <Ctx.Provider value={{ open, prefetch }}>
      {children}
      <Dialog open={!!shown} onClose={close} size="2xl" z="overlay" labelledBy="sealed-quickview-title">
        {display ? <SealedQuickViewModal key={`${display.slug}-${display.n}`} slug={display.slug} thumb={display.thumb} label={display.label} onClose={close} /> : null}
      </Dialog>
    </Ctx.Provider>
  );
}

function SealedQuickViewModal({ slug, thumb, label, onClose }: { slug: string; thumb: string | null; label: string | null; onClose: () => void }) {
  const { country } = useCountry();
  const [data, setData] = useState<SealedQvPayload | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadSealedQuickView(slug).then((d) => live && setData(d)).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [slug]);
  const m = data?.markets[country as Country];
  const listings = m ? rankOffers(m.offers) : [];
  const best = headlineOffer(listings);
  const open = listings.filter((l) => offerStock(l) === "open");
  const storeCount = new Set(open.filter((l) => !l.ebay).map((l) => l.source)).size;
  const name = data?.name ?? label ?? "Sealed product";
  const cur = COUNTRIES[country as Country];
  const reportable = [...new Map(listings.filter((l) => !l.ebay).map((l) => [l.source, { source: l.source, label: l.label }])).values()];

  return (
    <div className="relative max-h-[88vh] overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-2xl">
      <button type="button" onClick={onClose} aria-label="Close" className="tap-icon absolute right-3 top-3 z-20 rounded-full bg-ink-950/80 text-slate-300 hover:text-white">
        ✕
      </button>
      <div className="max-h-[88vh] overflow-y-auto">
        <div className="flex gap-4 border-b border-ink-800 p-5">
          <div className="grid aspect-square w-28 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-800 bg-white p-2 sm:w-32">
            {(data?.imageUrl ?? thumb) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(data?.imageUrl ?? thumb)!.replace("_in_1000x1000", "_400w")} alt={`${name} Magic: The Gathering sealed product`} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="px-1 text-center text-xs font-bold text-slate-600">{data?.kind ?? ""}</span>
            )}
          </div>
          <div className="min-w-0 flex-1 pr-8">
            <div className="flex flex-wrap items-center gap-1.5">
              {data ? <span className="chip bg-brand-500/15 font-semibold text-brand-300">{data.kind}</span> : null}
              {data?.set ? <span className="chip bg-ink-800 text-slate-300">{data.set.code}</span> : null}
              {data?.preRelease ? <span className="chip bg-ink-800 text-slate-300">Pre-order</span> : null}
            </div>
            <h2 id="sealed-quickview-title" className="mt-1.5 text-lg font-extrabold leading-tight text-white">
              {name}
            </h2>
            {failed ? (
              <p className="mt-2 text-sm text-slate-400">Could not load this product. <Link href={`/sealed/${slug}`} className="text-brand-400 hover:underline">Open the full page →</Link></p>
            ) : data ? (
              <>
                <div className="mt-2">
                  {best ? (
                    <>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Cheapest price · {cur.place}</div>
                      <div className="num text-2xl font-extrabold text-accent">{money(best.priceCents, country as Country)}</div>
                    </>
                  ) : (
                    <div className="text-lg font-extrabold text-down">Currently unavailable</div>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {storeCount} {storeCount === 1 ? "store" : "stores"} in stock
                </p>
                <div className="mt-3">
                  <SealedWatchButton sealedId={data.id} slug={data.slug} name={data.name} />
                </div>
              </>
            ) : (
              <div className="mt-3 h-14 animate-pulse rounded bg-ink-800" aria-hidden />
            )}
          </div>
        </div>

        {data && m ? (
          <div className="p-4">
            <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Price comparison</div>
            {listings.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-400">
                <p>No store is listing this in {cur.place} right now.</p>
                <a href={m.ebaySearch} target="_blank" rel={outboundRel()} data-retailer="ebay_sealed_search" data-page="sealed" data-card={data.slug} data-surface="ebay_search" className="btn-ebay mt-3 inline-flex text-xs">
                  Search eBay →
                </a>
              </div>
            ) : (
              <ul className="divide-y divide-ink-800">
                {listings.map((l) => {
                  const state = offerStock(l);
                  const isOpen = state === "open";
                  const isBest = l === best;
                  return (
                    <li key={l.source} data-stock={state} className={`flex items-center gap-3 py-2.5 ${isOpen ? "" : "opacity-55"}`}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">{l.label}</div>
                        <div className="flex flex-wrap items-center gap-x-2 text-[11px]">
                          <span className={isOpen ? "text-brand-400" : "text-slate-500"}>● {offerStockLabel(state, data.preRelease)}</span>
                          <span className="text-slate-500">checked {ago(l.lastSeen)}</span>
                        </div>
                      </div>
                      {isBest ? <span className="chip shrink-0 bg-gold/20 text-gold">Best price</span> : null}
                      <div className={`num text-right text-sm font-bold ${isBest ? "text-accent" : "text-white"} ${!isOpen ? "text-slate-500 line-through" : ""}`}>{money(l.priceCents, country as Country)}</div>
                      <a
                        href={l.href}
                        target="_blank"
                        rel={outboundRel()}
                        data-retailer={l.retailer}
                        data-page="sealed"
                        data-card={data.slug}
                        data-surface="sealed_quickview"
                        className={isOpen ? `px-3 py-1.5 text-xs ${l.ebay ? "btn-ebay" : isBest ? "btn-primary" : "btn-primary"}` : "px-3 py-1.5 text-xs text-slate-500 underline-offset-2 hover:underline"}
                      >
                        {l.source === "tcgplayer" ? "TCGplayer →" : l.ebay ? "eBay →" : "View →"}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            {listings.length > 0 ? (
              <p className="mt-2 border-t border-ink-800 pt-2 text-right text-[11px]">
                <a href={m.ebaySearch} target="_blank" rel={outboundRel()} data-retailer="ebay_sealed_search" data-page="sealed" data-card={data.slug} data-surface="ebay_search" className="font-semibold text-brand-400 hover:underline">
                  Search eBay for more listings →
                </a>
              </p>
            ) : null}
            {reportable.length > 0 ? (
              <div className="mt-2 text-center">
                <ReportPriceButton productId={data.id} market={country as Country} offers={reportable} />
              </div>
            ) : null}
            <div className="mt-3 flex justify-end">
              <Link href={`/sealed/${data.slug}`} className="btn-ghost text-xs" onClick={onClose}>
                Open full page →
              </Link>
            </div>
            <AffiliateDisclosure partner="both" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
