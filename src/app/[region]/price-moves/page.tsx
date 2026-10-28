import type { Metadata } from "next";
import { cache } from "react";
import { movesThin } from "@/lib/section-thin";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Empty, Section } from "@/components/Section";
import { StockRow } from "@/components/StockRow";
import type { ProductCardData } from "@/lib/data";
import { money } from "@/lib/format";
import { isoOfDay } from "@/lib/price-history";
import { formatRelease } from "@/lib/release";
import { regionOrNotFound, type Market, type RegionInfo } from "@/lib/regions";
import { itemListJsonLd, jsonLd, pageMeta, regionAlternates } from "@/lib/seo";
import { seoCopy, seoTitleText } from "@/lib/seo-titles";
import { SET_BY_CODE } from "@/lib/sets";
import { MIN_DAYS_MOVES, MOVE_DAYS, MOVE_MIN_CENTS, MOVE_MIN_PCT, type PriceMove } from "@/lib/stock";
import { priceMovesData } from "@/lib/stock-data";

// /<region>/price-moves: the week's biggest changes in the cheapest in-stock price, from the daily price history, for popular sets'
// headline products only (lib/stock.ts popularSetCodes, MOVE_TYPES): creators talk about select products of popular sets, not every
// set. At least MOVE_MIN_PCT% and MOVE_MIN_CENTS either way; under MIN_DAYS_MOVES days of snapshots, an honest empty state.
// Rendered per request and kept by Vercel's CDN for a day (next.config.js CDN_PAGES), never ISR; reads no cookie.
export const dynamic = "force-dynamic";

// Shared by generateMetadata (the noindex rule, lib/section-thin.ts) and the page: one read per render.
const getMoves = cache((market: Market) => priceMovesData(market));

export async function generateMetadata({ params }: { params: { region: string } }): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  const title = seoCopy.movesTitle(r);
  const data = await getMoves(r.market);
  return {
    ...pageMeta({
      title: seoTitleText(title),
      description: seoCopy.movesDescription(r),
      path: `/${r.region}/price-moves`,
      alternates: regionAlternates(r.region, "/price-moves"),
      noindex: movesThin(data.up.length + data.down.length),
    }),
    title,
  };
}

export default async function PriceMovesPage({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const data = await getMoves(r.market);
  const path = `/${r.region}/price-moves`;
  const all = [...data.up, ...data.down];
  const ld = all.length ? itemListJsonLd({ name: `Magic sealed price moves in ${r.inName}`, path, items: all.map(({ card }) => ({ path: `/${r.region}/p/${card.slug}`, name: card.name, image: card.imageUrl })) }) : null;
  const setNames = data.sets.map((c) => SET_BY_CODE.get(c)?.name).filter(Boolean) as string[];
  const latest = data.through != null ? formatRelease(isoOfDay(data.through)) : null;
  const empty = (dir: "up" | "down") => (
    <Empty actions={[{ href: `/${r.region}/deals`, label: "Deals today" }]}>
      No popular set&rsquo;s headline product moved {dir} by {MOVE_MIN_PCT}% or more this week in {r.inName}.
    </Empty>
  );
  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: "Price moves" }]} />
      <header className="max-w-3xl">
        <div className="eyebrow">Prices · {r.name}</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Biggest price moves this week in {r.inName}</h1>
        <p className="mt-3 leading-7 text-muted">
          The cheapest in-stock price at {r.adjective} stores{r.market === "US" ? " and TCGplayer" : ""} today against the same product&rsquo;s {MOVE_DAYS} days ago, for the booster boxes, bundles
          and Commander decks of popular sets only. A move counts at {MOVE_MIN_PCT}% or more and at least {money(MOVE_MIN_CENTS, r.market)}. Prices move when the cheapest store sells out
          or another lists it; this is what the shelves did, not where they are going.
        </p>
        <p className="mt-2 text-sm text-muted">
          {data.days > 0 ? `From MTG Compare's daily snapshots: ${data.days} ${data.days === 1 ? "day" : "days"} so far${latest ? `, the latest ${latest}` : ""}.` : "MTG Compare's daily snapshots are not available right now."}
          {setNames.length > 0 && <> Sets watched: {setNames.join(", ")}.</>}
        </p>
      </header>

      {!data.enough ? (
        <div className="mt-8">
          <Empty actions={[{ href: `/${r.region}/deals`, label: "Deals today" }, { href: `/${r.region}/back-in-stock`, label: "Back in stock" }]}>
            Not enough history yet: a week-over-week move needs {MIN_DAYS_MOVES} daily snapshots, and MTG Compare has {data.days}. This page fills in by itself once it has them.
          </Empty>
        </div>
      ) : (
        <>
          <Section id="up" title="Up this week" kicker="Biggest rise first">
            {data.up.length ? <MoveList items={data.up} r={r} /> : empty("up")}
          </Section>
          <Section id="down" title="Down this week" kicker="Biggest fall first">
            {data.down.length ? <MoveList items={data.down} r={r} /> : empty("down")}
          </Section>
        </>
      )}
      <p className="mt-10 max-w-3xl text-sm text-muted">
        Prices exclude shipping. A week of snapshots is a short window: one store listing or selling out moves the cheapest price. See also{" "}
        <Link href={`/${r.region}/guides`} prefetch={false} className="font-semibold text-brand-strong hover:underline">
          the buying guides
        </Link>
        .
      </p>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />}
    </div>
  );
}

function MoveList({ items, r }: { items: { card: ProductCardData; move: PriceMove }[]; r: RegionInfo }) {
  return (
    <ol className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]">
      {items.map(({ card, move }) => (
        <li key={card.slug}>
          <StockRow
            p={card}
            r={r}
            extra={
              <span className={`tabular text-[11px] font-semibold ${move.pct > 0 ? "text-sold" : "text-open"}`}>
                {move.pct > 0 ? "▲" : "▼"} {Math.abs(move.pct)}% · {money(move.before, r.market)} {MOVE_DAYS} days ago
              </span>
            }
          />
        </li>
      ))}
    </ol>
  );
}
