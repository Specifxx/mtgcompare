import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Empty, Section } from "@/components/Section";
import { StockRow } from "@/components/StockRow";
import { ProductCard } from "@/components/ProductCard";
import { HotBuyNudge } from "@/components/HotBuyNudge";
import { tcgplayerSearchUrl } from "@/lib/affiliate";
import { thumb } from "@/lib/images";
import { stockHeadline } from "@/lib/stock";
import { cardsFor } from "@/content/guides/more-data";
import { money } from "@/lib/format";
import { hotChart, hotDrops, hotMove, hotName, HOT_MIN_PCT } from "@/lib/hot100";
import { readPriceHistory } from "@/lib/price-history";
import { regionOrNotFound } from "@/lib/regions";
import { formatRelease } from "@/lib/release";
import { itemListJsonLd, jsonLd, pageMeta } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";

// /<region>/hot-100: the rolling weekly Hot 100 (lib/hot100.ts; owner, 2026-11-18), one stable URL a week's Reddit post links.
// Rendered per request and kept by Vercel's CDN for a day (next.config.js), never ISR. Its share card is /og/hot-100/<region>.
export const dynamic = "force-dynamic";

const NOUN = "Magic sealed";

export function generateMetadata({ params }: { params: { region: string } }): Metadata {
  const r = regionOrNotFound(params.region);
  const c = hotChart(readPriceHistory(), r.market);
  const n = c?.rows.length ?? 0;
  const top = c?.rows[0];
  return pageMeta({
    title: c && top ? `${SITE_NAME} ${hotName(n)}: the ${NOUN} prices that rose most this week (${r.short}, to ${formatRelease(c.through)})` : `${SITE_NAME} Hot 100 (${r.short})`,
    description: `This week's ${NOUN} risers and biggest drops at ${r.adjective} stores: every product whose cheapest in-stock price rose in the last seven days, ranked, with its place on last week's chart, and the ones that fell most.`,
    path: `/${r.region}/hot-100`,
    image: c ? `/og/hot-100/${r.region}?w=${c.through}&v=2` : `/og/hot-100/${r.region}`,
    noindex: n < 5,
  });
}

export default async function Hot100Page({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const history = readPriceHistory();
  const c = hotChart(history, r.market);
  const falls = hotDrops(history, r.market);
  const cards = c ? await cardsFor(r.market, [...c.rows, ...falls].map((x) => x.slug)) : [];
  const bySlug = new Map(cards.map((x) => [x.slug, x]));
  const rows = (c?.rows ?? []).map((row) => ({ row, card: bySlug.get(row.slug) })).filter((x) => !!x.card);
  const drops = falls.map((row) => ({ row, card: bySlug.get(row.slug) })).filter((x) => !!x.card);
  const n = c?.rows.length ?? 0;
  const top1 = rows[0] ? { card: rows[0].card!, row: rows[0].row } : null;
  const path = `/${r.region}/hot-100`;
  const ld = itemListJsonLd({ name: `${SITE_NAME} ${hotName(n)}, ${r.name}`, path, items: rows.map(({ card }) => ({ path: `/${r.region}/p/${card!.slug}`, name: card!.name, image: card!.imageUrl })) });
  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: n ? hotName(n) : "Hot 100" }]} />
      <header className="max-w-3xl">
        <div className="eyebrow">This week · {r.name}</div>
        <h1 className="mt-2 page-title">
          {SITE_NAME} {n ? hotName(n) : "Hot 100"}
        </h1>
        <p className="page-lead mt-3 line-clamp-3 sm:line-clamp-none">
          {c ? `${formatRelease(c.from)} to ${formatRelease(c.through)}. ` : ""}The {NOUN} products whose cheapest in-stock price at {r.adjective} stores rose most over the last seven days, biggest
          rise first, with each one&rsquo;s place on last week&rsquo;s chart. A product counts when two or more stores had it in stock on both days and its price rose{" "}
          {HOT_MIN_PCT}% or more. A short week is a shorter chart, never padded.
        </p>
      </header>
      {rows.length > 0 && (
        // "Shop the top risers" (boardroom, 2026-11-20): the week's top three as product cards in the first screen; a click opens
        // the quick view with every store's price, eBay and TCGplayer first.
        <section className="mt-6" aria-labelledby="shop-risers">
          <h2 id="shop-risers" className="text-lg font-bold">Shop the top risers</h2>
          <p className="text-sm text-muted">Cheapest in-stock price at {r.adjective} stores now. Tap one for every store.</p>
          <div className="mt-3 grid grid-cols-3 gap-3 sm:max-w-2xl">
            {rows.slice(0, 3).map(({ card }, i) => (
              <ProductCard key={card!.slug} p={card!} region={r.region} priority={i === 0} />
            ))}
          </div>
        </section>
      )}
      <Section id="hot" title={n ? `The ${hotName(n)}` : "The chart"} kicker={c ? `Week to ${formatRelease(c.through)}` : undefined}>
        {rows.length ? (
          <ol className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]">
            {rows.map(({ card, row }) => (
              <li key={row.slug} className="flex items-stretch gap-2">
                <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-surface text-center">
                  <span className="font-display text-lg font-bold tabular">#{row.rank}</span>
                  <span className="text-[10px] font-semibold text-muted">{hotMove(row, c!.lastWeekSize)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <StockRow
                    p={card!}
                    r={r}
                    buy
                    extra={
                      <span className="tabular text-[11px] font-semibold text-sold">
                        ▲ {row.pct}% · {money(row.before, r.market)} → {money(row.after, r.market)}
                      </span>
                    }
                  />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <Empty actions={[{ href: `/${r.region}/price-moves`, label: "Price moves today" }]}>No product&rsquo;s price rose {HOT_MIN_PCT}% or more this week in {r.inName}.</Empty>
        )}
      </Section>
      {drops.length > 0 && (
        <Section id="drops" title="Biggest drops this week" kicker={c ? `Week to ${formatRelease(c.through)}` : undefined}>
          <p className="mb-3 max-w-3xl text-sm text-muted">
            The same seven days the other way: products whose cheapest in-stock price fell {HOT_MIN_PCT}% or more, with two or more stores in stock on both days, biggest fall first.
          </p>
          <ol className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]">
            {drops.map(({ card, row }) => (
              <li key={row.slug} className="flex items-stretch gap-2">
                <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-surface text-center">
                  <span className="font-display text-lg font-bold tabular">#{row.rank}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <StockRow
                    p={card!}
                    r={r}
                    buy
                    extra={
                      <span className="tabular text-[11px] font-semibold text-open">
                        ▼ {Math.abs(row.pct)}% · {money(row.before, r.market)} → {money(row.after, r.market)}
                      </span>
                    }
                  />
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}
      <nav className="mt-10 flex flex-wrap gap-2 text-sm" aria-label="More price moves">
        <Link href={`/${r.region}/price-moves`} prefetch={false} className="chip py-2">
          Price moves today
        </Link>
        <Link href={`/${r.region}/deals`} prefetch={false} className="chip py-2">
          Deals today
        </Link>
      </nav>
      <p className="mt-6 max-w-3xl text-sm text-muted">Prices exclude shipping. One store listing or selling out can move the cheapest price, so a single week is a short window. This is what the shelves did, not a forecast.</p>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      {top1 && (
        // The buy prompt (lib/hot-nudge.ts): drawn in the browser, Reddit landings only, 50/50; nothing in the server HTML.
        <HotBuyNudge
          top={{
            slug: top1.card.slug,
            region: r.region,
            name: top1.card.name,
            sub: top1.card.productType,
            img: thumb(top1.card.imageUrl, 200) ?? null,
            price: stockHeadline(top1.card, false).open ? money(top1.card.lowestPriceCents, r.market) : null,
            pct: top1.row.pct,
          }}
          tcgHref={tcgplayerSearchUrl(top1.card.name, r.region, "tcgplayer-hot-nudge")}
        />
      )}
    </div>
  );
}
