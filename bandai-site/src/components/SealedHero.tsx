"use client";
// The homepage's sealed hero (lib/sealed-hero.ts, SITE.homeSealedHero): the
// newest booster boxes with photos, today's cheapest store price and the real
// saving in the visitor's market, plus the sets on pre-order. Server-rendered
// for the US (the default market) and switched to the visitor's market on
// hydration, like every price island; buy buttons go through /go
// (from=home_sealed_hero / home_sealed_preorder).
import Link from "@/components/Link";
import { goHref } from "@/lib/affiliate";
import { money } from "@/lib/format";
import { MARKET_LABEL, type Market } from "@/lib/site-types";
import type { HeroItem, HeroPrice, SealedHeroData } from "@/lib/sealed-hero";
import { useMarket } from "./ClientPrefs";

const date = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "date to be announced";

function Saving({ s }: { s: HeroPrice["saving"] }) {
  if (!s) return null;
  return (
    <span className="rounded-md bg-buy/15 px-1.5 py-0.5 text-xs font-bold text-buy-400">
      Save {s.pct}% {s.vs === "stores" ? "vs typical store" : "vs TCGplayer market"}
    </span>
  );
}

function priceIn(i: HeroItem, m: Market) {
  return i.prices[m] ?? null;
}

function Spotlight({ i, market, eager }: { i: HeroItem; market: Market; eager: boolean }) {
  const pr = priceIn(i, market);
  const eb = i.ebay[market] ?? null;
  return (
    <article className="card-surface relative flex items-start gap-3 overflow-hidden p-3 sm:items-center sm:gap-5 md:p-5">
      {/* Photo beside the price on a phone too, so the price and the button sit in the first screen. */}
      <Link href={`/card/${i.slug}`} className="block w-28 shrink-0 sm:w-48">
        {i.image ? (
          <img src={i.image} alt={i.name} width={192} height={192} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" className="aspect-square w-full rounded-lg bg-white object-contain p-2" />
        ) : (
          <span className="block aspect-square w-full rounded-lg bg-ink-850" />
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-400">{i.releasesOn ? `Pre-order · out ${date(i.releasesOn)}` : i.set ?? "Sealed"}</p>
        <Link href={`/card/${i.slug}`} className="mt-1 line-clamp-2 text-base font-black leading-tight hover:underline sm:text-xl md:text-2xl">{i.name}</Link>
        {pr ? (
          <>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:mt-3">
              <span className="text-2xl font-black tabular-nums text-fg md:text-4xl">{money(pr.cents, pr.currency)}</span>
              <span className="text-sm text-muted">at {pr.store}</span>
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
              <Saving s={pr.saving} />
              <span>{pr.stores} store{pr.stores === 1 ? "" : "s"} in {MARKET_LABEL[market]}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
              <a href={goHref({ url: pr.url, source: pr.source, market }, i.id, i.releasesOn ? "home_sealed_preorder" : "home_sealed_hero")} rel="sponsored nofollow noopener" target="_blank" className="btn-buy min-h-11 px-4 text-sm sm:px-5 sm:text-base">
                {pr.preorder ? "Pre-order" : "Buy"} at {pr.store} <span aria-hidden="true">↗</span>
              </a>
              <Link href={`/card/${i.slug}`} className="btn-ghost min-h-11">Compare all {i.totalStores} stores</Link>
            </div>
            {eb && (
              <p className="mt-2 text-xs text-muted">
                <span className="mr-1 rounded bg-ink-800 px-1 py-0.5 text-[10px] font-semibold uppercase">Ad</span>
                Also on <a className="link" href={goHref({ url: eb.url, source: "ebay", market }, i.id, "home_sealed_hero_ebay")} rel="sponsored nofollow noopener" target="_blank">eBay from {money(eb.cents, eb.currency)}</a>
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">
            No store in {MARKET_LABEL[market]} lists it yet. <Link className="link" href={`/card/${i.slug}`}>Compare every market →</Link>
          </p>
        )}
      </div>
    </article>
  );
}

function Tile({ i, market }: { i: HeroItem; market: Market }) {
  const pr = priceIn(i, market);
  return (
    <Link href={`/card/${i.slug}`} className="card-surface group flex w-[150px] shrink-0 snap-start flex-col overflow-hidden hover:border-brand/60 sm:w-auto">
      <span className="relative block aspect-square bg-white">
        {i.image && <img src={i.image} alt={i.name} width={200} height={200} loading="lazy" decoding="async" className="h-full w-full object-contain p-2 transition group-hover:scale-[1.03]" />}
        {pr?.saving && <span className="absolute left-1.5 top-1.5 rounded-md bg-buy px-1.5 py-0.5 text-[11px] font-black text-white shadow">−{pr.saving.pct}%</span>}
        {i.releasesOn && <span className="absolute right-1.5 top-1.5 rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-black text-ink-950 shadow">Pre-order</span>}
      </span>
      <span className="flex flex-1 flex-col gap-0.5 p-2.5">
        <span className="line-clamp-2 text-sm font-semibold leading-tight">{i.name}</span>
        <span className="mt-auto pt-1 text-lg font-black tabular-nums text-brand-400">{pr ? money(pr.cents, pr.currency) : "—"}</span>
        <span className="text-[11px] text-muted">{pr ? `at ${pr.store} · ${pr.stores} store${pr.stores === 1 ? "" : "s"}` : `Not listed in ${market} yet`}</span>
      </span>
    </Link>
  );
}

function Row({ items, market }: { items: HeroItem[]; market: Market }) {
  // A swipeable row on phones (one screen tall, no layout shift), a grid from sm up.
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
      {/* Products this market's stores sell first; the rest keep their order. */}
      {[...items].sort((a, b) => Number(!a.prices[market]) - Number(!b.prices[market])).map((i) => <Tile key={i.id} i={i} market={market} />)}
    </div>
  );
}

export function SealedHero({ data, game, sealedHref }: { data: SealedHeroData; game: string; sealedHref: string }) {
  const { market } = useMarket();
  // The spotlight is the first box this market's stores sell (the newest set's box in the US).
  const lead = data.featured.find((i) => i.prices[market]) ?? data.featured[0];
  if (!lead) return null;
  const rest = data.featured.filter((i) => i !== lead);
  return (
    <section aria-labelledby="sealed-hero" className="sealed-hero -mx-4 flex flex-col gap-5 rounded-none border-y border-brand/30 bg-gradient-to-br from-brand/15 via-ink-900 to-ink-950 px-4 py-6 md:mx-0 md:rounded-2xl md:border md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="sealed-hero" className="font-display text-2xl font-black md:text-3xl">{game} booster boxes: cheapest store today</h2>
          <p className="hidden text-sm text-muted sm:block">Every store&rsquo;s price for each box, in {MARKET_LABEL[market]}, checked daily. Change market at the top.</p>
        </div>
        <Link href={sealedHref} className="link text-sm font-semibold">All sealed prices →</Link>
      </div>
      <Spotlight i={lead} market={market} eager />
      {rest.length > 0 && <Row items={rest} market={market} />}
      {data.preorders.map((s) => (
        <div key={s.href} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-black">
              <span className="mr-2 rounded-md bg-brand px-2 py-0.5 text-xs uppercase tracking-wide text-ink-950">Pre-order</span>
              {s.name} <span className="text-sm font-semibold text-muted">· out {date(s.releasesOn)}</span>
            </h3>
            <Link href={s.href} className="link text-sm font-semibold">Every store&rsquo;s pre-order price →</Link>
          </div>
          <Row items={s.items} market={market} />
        </div>
      ))}
    </section>
  );
}
