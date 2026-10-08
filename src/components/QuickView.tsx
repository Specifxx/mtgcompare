"use client";

import { useEffect, useState } from "react";
import { sendCardView } from "@/lib/card-views";
import { COUNTRIES, MARKETS } from "@/lib/country";
import { ebayAffiliateUrl, ebayLabel, isPaidLink, outboundRel } from "@/lib/affiliate";
import { ago, money, usd } from "@/lib/format";
import { usdCentsToCountry } from "@/lib/fx";
import { cardImage } from "@/lib/images";
import type { QuickViewPayload } from "@/lib/quick-view";
import { pushRecentCard } from "@/lib/recently-viewed";
import { ColorDots, Delta, PrintingBadge, RarityBadge } from "./ui";
import { useCountry } from "./CountryProvider";
import { Icon } from "./Icon";
import { LineChart } from "./LineChart";
import { ReportPriceButton } from "./ReportPriceButton";
import { TcgMarketPrice } from "./TcgMarketPrice";
import { PriceWatchButton } from "./PriceWatchButton";
import { PriceDropAlertCta } from "./PriceDropAlertCta";
import { AddToCollectionButton } from "./AddToCollectionButton";

// The QuickView panel: art and the
// "Open full page" link on the left; on the right the printing, the visitor's
// cheapest price and store, the 7-day move, the top rows of the comparison with
// affiliate Buy buttons, the eBay search, every market's cheapest, and the
// TCGplayer market price as a reference block (never a row). Everything comes
// from one cached GET /api/card/[slug]; the visitor's market only picks which
// slice of it to show, so switching market needs no second request.
const PAGE = "quickview";

// One request per card while it is fresh: a hover prefetches, the click reuses
// it, reopening is instant. Entries expire after 10 minutes (the API's own CDN
// window) and a failed load is forgotten at once, so the next open retries.
const cache = new Map<string, { at: number; p: Promise<QuickViewPayload> }>();
const CACHE_MAX = 60;
const CACHE_MS = 10 * 60 * 1000;

export function loadQuickView(slug: string, finish?: "N" | "F"): Promise<QuickViewPayload> {
  const key = finish ? `${slug}|${finish}` : slug;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.p;
  const p = fetch(`/api/card/${encodeURIComponent(slug)}${finish ? `?finish=${finish === "F" ? "foil" : "nonfoil"}` : ""}`)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<QuickViewPayload>;
    })
    .catch((e: unknown) => {
      cache.delete(key);
      throw e;
    });
  cache.delete(key);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), p });
  return p;
}

function display(p: { name: string; variant: string | null }): string {
  return `${p.name}${p.variant ? ` (${p.variant})` : ""}`;
}

export function QuickView({
  slug,
  thumb,
  label,
  onClose,
  providers = [],
}: {
  slug: string;
  thumb: string | null;
  label: string | null;
  onClose: () => void;
  /** The enabled OAuth providers (env-only, from the root layout), for the alert row. */
  providers?: ("google" | "discord")[];
}) {
  const { country } = useCountry();
  const co = COUNTRIES[country];
  const [data, setData] = useState<QuickViewPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [finish, setFinish] = useState<"N" | "F" | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setFailed(false);
    loadQuickView(slug, finish)
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [slug, attempt, finish]);

  // Opening a card's QuickView counts as viewing it (RiftCompare): it joins the
  // recently viewed rail and the empty search box's list, like the card page.
  useEffect(() => {
    if (!data || data.slug !== slug) return;
    pushRecentCard({ slug: data.slug, name: data.name, variant: data.variant, setCode: data.set.code, number: data.number, img: data.hasImage ? cardImage.thumb(data.id) : null });
    sendCardView(data.slug, "view", String(data.id));
  }, [data, slug]);

  const href = `/card/${slug}`;
  const m = data?.markets[country];
  const best = m?.rows[0] ?? null;
  const name = data ? display(data) : label;
  const ebay = ebayLabel(country);

  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="tap-icon absolute right-2 top-2 z-10 rounded-full bg-ink-950/80 text-slate-300 ring-1 ring-ink-700 hover:text-white"
      >
        <Icon name="x" className="h-4 w-4" />
      </button>

      <div className="grid sm:grid-cols-[240px_minmax(0,1fr)]">
        {/* Art + the real page. Capped on phones so the prices sit higher. */}
        <div className="bg-ink-950/40 p-4">
          <div className="mx-auto w-full max-w-[170px] sm:max-w-none">
            {data?.hasImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cardImage.large(data.id)}
                alt={`${name ?? "Card"} — Magic: The Gathering card`}
                width={300}
                height={419}
                className="aspect-[300/419] w-full rounded-md bg-ink-800 object-cover"
                style={thumb ? { backgroundImage: `url(${thumb})`, backgroundSize: "cover" } : undefined}
              />
            ) : thumb && !data ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" width={300} height={419} className="aspect-[300/419] w-full rounded-md bg-ink-800 object-cover" />
            ) : (
              <div className="grid aspect-[300/419] w-full place-items-center rounded-md bg-ink-800 text-xs text-slate-500">
                {data ? "No image" : ""}
              </div>
            )}
          </div>
          {/* A plain anchor: the URL is already /card/<slug>, so this loads the
              full server-rendered page. */}
          <a href={href} className="btn-ghost mt-3 w-full text-sm">
            Open full page →
          </a>
        </div>

        <div className="min-w-0 p-4 sm:p-5">
          {data ? (
            <div className="flex flex-wrap items-center gap-1.5 pr-10">
              {data.colors.length ? (
                <span className="chip border border-ink-700 bg-ink-850 text-slate-200">
                  <ColorDots colors={data.colors} size="h-2 w-2" />
                  {data.colors.join(" / ")}
                </span>
              ) : null}
              <RarityBadge rarity={data.rarity} />
              {data.cardType ? <span className="chip border border-ink-700 bg-ink-850 text-slate-200">{data.cardType}</span> : null}
              <PrintingBadge printing={data.printing} variant={data.variant} />
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1 basis-56">
              <h2 id="quickview-title" className="break-words text-xl leading-tight text-white sm:text-2xl">
                {data ? data.name : (label ?? "Loading card…")}
                {data?.variant ? <span className="block text-base font-bold text-slate-300">{data.variant}</span> : null}
              </h2>
              {data ? (
                <p className="num mt-1 text-xs text-slate-400">
                  {data.set.name} ({data.set.code}){data.number ? ` · ${data.number}` : ""}
                </p>
              ) : null}
            </div>
            {data ? <PriceWatchButton cardId={data.id} slug={data.slug} name={display(data)} variant="full" limitInline /> : null}
          </div>

          {failed ? (
            <div className="mt-4 rounded-lg border border-ink-700 bg-ink-950/50 p-4 text-sm text-slate-300">
              <p>We couldn&apos;t load this card&apos;s prices just now.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setAttempt((a) => a + 1)} className="btn-ghost min-h-10 text-xs">
                  Try again
                </button>
                <a href={href} className="btn-primary min-h-10 text-xs">
                  Open the card page →
                </a>
              </div>
            </div>
          ) : !data || !m ? (
            <div className="mt-4 space-y-3" aria-busy="true" aria-live="polite">
              <div className="h-[76px] animate-pulse rounded-lg bg-ink-800/70" />
              <p className="flex items-center gap-2 text-sm text-slate-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
                Loading live prices…
              </p>
            </div>
          ) : (
            <>
              {/* The visitor's market: the cheapest open listing and its store,
                  or TCGplayer's market price marked ≈ when no store has it. */}
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-lg bg-ink-950/50 p-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cheapest · {co.place}</p>
                  <p className="num text-2xl font-extrabold text-accent">
                    {best ? money(best.priceCents, country) : data.marketUsd != null ? `≈ ${money(usdCentsToCountry(data.marketUsd, country), country)}` : "—"}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {best
                      ? `at ${best.label} · ${m.count} ${m.count === 1 ? "listing" : "listings"} in stock`
                      : data.marketUsd != null
                        ? country === "US"
                          ? "TCGplayer market price — no store we track has it in stock"
                          : "TCGplayer market price, converted — no store we track has it"
                        : "No price yet"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">7 days</p>
                  <Delta v={data.change7d} className="text-sm" />
                </div>
              </div>

              {/* Finish tabs: Normal and Foil are separate units with separate prices. */}
              {data.finishes.length > 1 ? (
                <div className="mt-3 flex gap-1.5" role="tablist" aria-label="Finish">
                  {data.finishes.map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="tab"
                      aria-selected={data.finish === f}
                      onClick={() => setFinish(f)}
                      className={`chip min-h-8 border text-xs ${data.finish === f ? "border-brand-400 bg-brand-400/15 text-white" : "border-ink-700 bg-ink-850 text-slate-300 hover:text-white"}`}
                    >
                      {f === "N" ? "Non-foil" : "Foil"}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Both buy paths, side by side, on every card: TCGplayer, and the highlighted eBay button. */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a
                  href={data.tcgHref}
                  target="_blank"
                  rel={outboundRel()}
                  data-retailer="tcgplayer"
                  data-page={PAGE}
                  data-card={data.slug}
                  data-surface="quickview_top"
                  className="btn-primary min-h-10 px-3 py-1.5 text-xs"
                >
                  Buy on TCGplayer →
                </a>
                <a
                  href={m.ebaySearch}
                  target="_blank"
                  rel={outboundRel()}
                  data-retailer="ebay_search"
                  data-page={PAGE}
                  data-card={data.slug}
                  data-surface="quickview_top_ebay"
                  className="btn-ebay min-h-10 px-3 py-1.5 text-xs"
                >
                  {data.preRelease ? `Search ${ebay} →` : `Buy on ${ebay} →`}
                </a>
              </div>

              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Price comparison</p>
                {m.rows.length ? (
                  <ol className="divide-y divide-ink-800">
                    {m.rows.map((r, i) => (
                      <li key={`${r.source}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 sm:flex-nowrap">
                        <div className="min-w-0 flex-1">
                          <p className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-white">{r.label}</span>
                            {i === 0 && m.count > 1 ? (
                              <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-400">Cheapest</span>
                            ) : null}
                          </p>
                          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500">
                            {r.condition ? <span className="font-semibold text-slate-300">{r.condition}</span> : null}
                            {r.source === "tcgplayer" ? <span>lowest listing</span> : null}
                            <span>{r.postage}</span>
                            <span>updated {ago(r.updatedAt)}</span>
                            {isPaidLink(r.href) ? <span className="rounded bg-ink-800 px-1 text-[10px] text-slate-400">Paid link</span> : null}
                          </p>
                        </div>
                        <span className={`num shrink-0 text-sm font-bold ${i === 0 ? "text-accent" : "text-white"}`}>{money(r.priceCents, country)}</span>
                        <a
                          href={r.href}
                          target="_blank"
                          rel={outboundRel()}
                          data-retailer={r.retailer}
                          data-page={PAGE}
                          data-card={data.slug}
                          data-surface="quickview_row"
                          className={`${r.ebay ? "btn-ebay" : "btn-primary"} order-last min-h-10 w-full basis-full px-3 py-1.5 text-xs sm:order-none sm:w-auto sm:basis-auto`}
                        >
                          {r.source === "tcgplayer" ? "Buy on TCGplayer →" : r.ebay ? "Buy on eBay →" : "View deal →"}
                        </a>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="py-3 text-sm text-slate-400">No {co.adjective} store we track has this in stock right now.</p>
                )}
                {m.count > m.rows.length ? (
                  <a href={href} className="mt-1 block text-center text-xs font-semibold text-brand-400 hover:underline">
                    See all {m.count} listings →
                  </a>
                ) : null}
                {m.rows.length ? (
                  <div className="mt-1 text-center">
                    <ReportPriceButton productId={data.id} market={country} offers={m.rows.map((r) => ({ source: r.source, label: r.label }))} />
                  </div>
                ) : null}
              </div>

              {/* eBay: the fallback search when this market has no eBay row
                  (RiftCompare's copy), a "more listings" strip when it has one. */}
              {m.ebayRow ? (
                <a
                  href={m.ebaySearch}
                  target="_blank"
                  rel={outboundRel()}
                  data-retailer="ebay_search"
                  data-page={PAGE}
                  data-card={data.slug}
                  data-surface="ebay_more"
                  className="btn-ebay-ghost mt-3 min-h-10 w-full text-xs"
                >
                  More listings on {ebay} →
                </a>
              ) : (
                <a
                  href={m.ebaySearch}
                  target="_blank"
                  rel={outboundRel()}
                  data-retailer="ebay_no_listing"
                  data-page={PAGE}
                  data-card={data.slug}
                  data-surface="ebay_fallback"
                  className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-[#0064d2]/40 bg-[#0064d2]/[0.06] p-3 transition-colors hover:border-[#0064d2]/70"
                >
                  <span className="min-w-0 flex-1 basis-44 text-xs text-slate-300">
                    <span className="block font-semibold text-white">
                      Search {ebay} for {display(data)}
                    </span>
                    <span className="block">
                      {data.preRelease
                        ? "This set hasn't released yet — eBay sellers set their own dispatch dates, so check each listing."
                        : `We have no ${ebay} price on file for this card right now — eBay sellers may still list it.`}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-sky-300">Search {ebay} →</span>
                </a>
              )}

              {/* The one-click price-drop alert, compact (RiftCompare's QuickView
                  row; wave 2): after the buy path, ghost buttons only. */}
              <PriceDropAlertCta
                compact
                placement="quickview_alert"
                cardId={data.id}
                slug={data.slug}
                name={display(data)}
                cardPath={href}
                providers={providers}
                unpriced={!m.rows.length}
                preorder={data.preRelease}
              />
              {/* Add to collection — track & value your whole binder (collection-alerts, wave 2). */}
              <AddToCollectionButton cardId={data.id} cardPath={`/card/${data.slug}`} />
              {m.graded.length ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Graded on {ebay}</p>
                  <ul className="space-y-1">
                    {m.graded.map((g) => (
                      <li key={g.url}>
                        <a href={ebayAffiliateUrl(g.url, "quickview-graded")} target="_blank" rel={outboundRel()} data-retailer="ebay_graded" data-page={PAGE} data-card={data.slug} data-surface="ebay_graded" className="flex items-center justify-between gap-3 rounded-md border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs hover:border-ink-600">
                          <span className="font-semibold text-slate-200">
                            {g.grader}
                            {g.grade !== "Graded" ? <span className="num ml-1">{g.grade}</span> : null}
                          </span>
                          <span className="num font-bold text-white">{money(g.priceCents, country)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-slate-500">Slabs are a different product from the raw copies above and never part of the comparison.</p>
                </div>
              ) : null}

              {/* Every market's cheapest open listing, the visitor's own marked. */}
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Cheapest in every market</p>
                <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {MARKETS.map((mk) => {
                    const r = data.markets[mk].rows[0];
                    return (
                      <li
                        key={mk}
                        className={`rounded-md border px-2.5 py-1.5 ${mk === country ? "border-brand-500/60 bg-brand-500/10" : "border-ink-800 bg-ink-950/40"}`}
                      >
                        <p className="text-[11px] font-semibold text-slate-400">
                          {COUNTRIES[mk].flag} {COUNTRIES[mk].code}
                        </p>
                        <p className={`num text-sm font-bold ${r ? "text-white" : "text-slate-500"}`}>{r ? money(r.priceCents, mk) : "—"}</p>
                        <p className="truncate text-[10px] text-slate-500">{r ? r.label : "not in stock"}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="mt-4">
                <TcgMarketPrice marketUsd={data.marketUsd} country={country} href={data.tcgHref} page={PAGE} card={data.slug} compact disclosure={false} />
              </div>

              {/* Price history, right in the preview (RiftCompare): the card
                  page's own series, last 90 days, US dollars. */}
              <div className="mt-4">
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Price history · 90 days</p>
                  <p className="text-[11px] text-slate-500">US$ · TCGplayer market and cheapest US listing</p>
                </div>
                <LineChart
                  height={220}
                  width={520}
                  series={[
                    { label: "TCGplayer market", color: "#e9b73a", points: (data.history ?? []).map((p) => ({ x: p.day, y: p.marketUsd })) },
                    { label: "Cheapest US listing", color: "#a259e6", points: (data.history ?? []).map((p) => ({ x: p.day, y: p.lowUsd })), dashed: true },
                  ]}
                  format={(v) => usd(Math.round(v))}
                  empty="Not enough price history yet — the chart draws once there are two days of prices."
                />
              </div>

              <p className="mt-3 text-[11px] leading-snug text-slate-500">
                Item prices, cheapest first; postage is added at each seller&apos;s checkout. Affiliate links: as an eBay Partner Network affiliate and a
                TCGplayer affiliate, MTG Compare earns from qualifying purchases — at no extra cost to you.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
