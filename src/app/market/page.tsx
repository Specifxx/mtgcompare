import { EbayChase } from "@/components/EbayChase";
import { AdSlot } from "@/components/AdSlot";
import { HubIntro } from "@/components/HubIntro";
import type { Metadata } from "next";
import Link from "next/link";
import { LineChart } from "@/components/LineChart";
import {
  Breadcrumbs,
  Delta,
  InShort,
  SectionHeader,
  StatTile,
} from "@/components/ui";
import { getCardsByIds, getIndexSeries, getMarketOverview, getMovers, getSets } from "@/lib/data";
import { imageFor } from "@/lib/images";
import { int, longDate, money, usd } from "@/lib/format";
import { releasedSets } from "@/lib/selectors";
import CardQuickLink from "@/components/CardQuickLink";
import { IndexConstituents } from "@/components/IndexConstituents";
import { IndexStats } from "@/components/IndexStats";
import { MarketSectionNav } from "@/components/MarketSectionNav";
import { RelatedGuides } from "@/components/RelatedGuides";
import { JsonLd } from "@/components/ui";
import { guidesForCatalogue } from "@/lib/content/catalogue-guides";
import { breadcrumbLd } from "@/lib/jsonld";
import { computeStats, indexConstituents, indexSentence } from "@/lib/market-stats";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { pageOg } from "@/lib/og/meta";
import { DATA_TABLE } from "@/components/prose";

// Reads the published market views (mk/overview.json, the index series, the movers feed): rendered per request, cached at the CDN (contract 7.5).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Magic Card Market Index — Is the Market Up or Down?",
  description:
    "The MTG Compare Index tracks the whole Magic: The Gathering singles market from TCGplayer market prices, plus each set's total value.",
  alternates: { canonical: "/market" },
  openGraph: pageOg("/market"),
};

function change(
  series: { day: string; value: number }[],
  days: number,
): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const target = Date.parse(last.day) - days * 864e5;
  const prev = [...series].reverse().find((p) => Date.parse(p.day) <= target);
  return prev ? ((last.value - prev.value) / prev.value) * 100 : null;
}

export default async function MarketPage() {
  const [overview, series, allSets, gainers, fallers] = await Promise.all([
    getMarketOverview(), getIndexSeries(), getSets(),
    getMovers({ dir: "up", window: 7, minCents: 100, n: 5 }), getMovers({ dir: "down", window: 7, minCents: 100, n: 5 }),
  ]);
  const last = series[series.length - 1];
  // The value of each released set: the published share of the one-of-each basket it holds (cards at US$1 or more), by TCGplayer market price.
  const worth = new Map(overview.sets.map((x) => [x.setId, x] as const));
  const sets = releasedSets(allSets).map((s) => ({ s, total: worth.get(s.id)?.totalCents ?? 0, held: worth.get(s.id)?.n ?? 0 })).filter((r) => r.held > 0);

  // The 200 dearest cards of the basket, with the printing label, number, set and 7-day change of each.
  const cards = await getCardsByIds(overview.constituents.map((r) => r.id), { stores: false });
  const lite = new Map([...cards].map(([id, c]) => [id, { id, variant: c.variant, number: c.number, setCode: c.setCode, change7d: c.change7d, hasImage: c.hasImage, imageUrl: imageFor(c, "thumb") }] as const));
  const basketCents = overview.basket.totalUsd;
  const constituents = indexConstituents(overview.constituents, lite, basketCents);
  const basketCount = overview.basket.n;
  // Breadth over the WHOLE basket (every unit at US$1+), as the importer counted it, not just the table rows.
  const stats = computeStats(series, { n: basketCount, totalCents: basketCents, avgCents: overview.basket.avg, medianCents: overview.basket.median, advancing: overview.advancing, declining: overview.declining });
  const d7 = change(series, 7);
  const sentence = last ? indexSentence({ day: longDate(last.day), value: last.value, d7, advancing: stats.advancing, counted: stats.advancing + stats.declining }) : null;
  const guides = guidesForCatalogue("market");
  const sections = [
    { id: "index", label: "Index" },
    { id: "stats", label: "Statistics" },
    { id: "movers", label: "Gainers & fallers" },
    { id: "constituents", label: "Constituents" },
    { id: "sets", label: "Value by set" },
    { id: "cite", label: "Cite" },
  ];

  return (
    <div>
      <Breadcrumbs trail={[{ name: "Market index" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">The MTG Compare Index</h1>
      <HubIntro path="/market" />
      {sentence ? <p className="mt-4 max-w-3xl text-[15px] font-semibold text-white">{sentence}</p> : null}
      <p className="mt-1 text-xs text-slate-500">US$ · TCGplayer market</p>
      <div className="mt-4">
        <MarketSectionNav sections={sections} />
      </div>
      <div id="index" className="mt-6 grid scroll-mt-40 grid-cols-2 gap-3 xl:scroll-mt-36 lg:grid-cols-4">
        <StatTile
          label="Index"
          value={last ? last.value.toFixed(1) : "—"}
          sub={last ? `as of ${longDate(last.day)}` : undefined}
        />
        <StatTile label="7 days" value={<Delta v={change(series, 7)} />} />
        <StatTile label="30 days" value={<Delta v={change(series, 30)} />} />
        <StatTile
          label="Cards in the index"
          value={last ? int(last.cardCount) : "—"}
          sub={
            last ? `worth ${money(last.totalUsd, "US")} together` : undefined
          }
        />
      </div>
      <section className="card-surface mt-6 p-5">
        <h2 className="mb-3 text-lg text-white">Index history</h2>
        <LineChart
          series={[
            {
              label: "MTG Compare Index",
              color: "#a259e6",
              points: series.map((p) => ({ x: p.day, y: p.value })),
            },
          ]}
          format={(v) => v.toFixed(0)}
          empty="The chart draws from the second day of prices."
        />
      </section>
      <div className="mt-6">
        <InShort>
          The index is a chained, value-weighted measure of TCGplayer market
          prices: expensive cards move it more than cheap ones, as they move a
          collection&apos;s value more. It is a reference for the market&apos;s
          direction, not a price you can buy at.
        </InShort>
      </div>
      <section id="stats" className="mt-8 scroll-mt-40 xl:scroll-mt-36">
        <IndexStats stats={stats} startDay={series[0]?.day ?? "the first day"} />
        <p className="mt-2 text-xs text-slate-500">
          Basket: the {int(basketCount)} printings priced at US$1 or more (the version each tracks: non-foil first), one of each. Breadth counts every one of them, not only the table below.
        </p>
      </section>

      <section id="movers" className="mt-8 scroll-mt-40 xl:scroll-mt-36">
        <SectionHeader title="Top gainers and fallers" sub="The biggest 7-day moves among cards worth US$1 or more. The full list is on this week's movers." action={<Link href="/movers" className="btn-ghost">All movers →</Link>} />
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { title: "Gainers", rows: gainers },
            { title: "Fallers", rows: fallers },
          ].map((col) => (
            <div key={col.title} className="card-surface p-4">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">{col.title}</h3>
              <ol className="divide-y divide-ink-800">
                {col.rows.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <CardQuickLink slug={x.slug} className="min-w-0 truncate text-slate-100 hover:text-brand-400 hover:underline">
                      {x.name}
                      {x.variant ? ` (${x.variant})` : ""} <span className="num text-xs text-slate-500">{x.setCode} {x.number}</span>
                    </CardQuickLink>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="num text-xs text-slate-400">{money(x.marketUsd, "US")}</span>
                      <Delta v={x.change7d} className="text-xs" />
                    </span>
                  </li>
                ))}
                {!col.rows.length ? <li className="py-3 text-sm text-slate-500">No moves yet.</li> : null}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section id="constituents" className="mt-8 scroll-mt-40 xl:scroll-mt-36">
        <SectionHeader title="Index constituents" sub={`The ${int(constituents.length)} most valuable cards in the basket, by TCGplayer market price. Weight is a card's share of the whole one-of-each basket.`} />
        <IndexConstituents constituents={constituents} />
      </section>

      <section id="sets" className="mt-10 scroll-mt-40 xl:scroll-mt-36">
        <SectionHeader
          title="Value by set"
          sub="The printings of each released set that are worth US$1 or more, at TCGplayer's market price."
        />
        <div className="card-surface overflow-x-auto">
          <table className={`${DATA_TABLE} min-w-[560px]`}>
            <thead>
              <tr>
                <th>Set</th>
                <th className="text-right">Printings over US$1</th>
                <th className="text-right">Total value</th>
              </tr>
            </thead>
            <tbody>
              {sets.map(({ s, total, held }) => (
                <tr key={s.id}>
                  <td>
                    <Link
                      href={`/sets/${s.slug}`}
                      className="font-semibold text-brand-400 hover:underline"
                    >
                      {s.name}
                    </Link>{" "}
                    <span className="text-xs text-slate-500">{s.code}</span>
                  </td>
                  <td className="num text-right text-slate-300">{int(held)}</td>
                  <td className="num text-right font-semibold text-accent">
                    {usd(total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <EbayChase page="market" className="mt-8" />
      <AdSlot slot="market" className="mt-10" thin={!series.length} />
      <section id="cite" className="card-surface mt-10 scroll-mt-40 p-5 xl:scroll-mt-36">
        <h2 className="text-lg text-white">Cite the MTG Compare Index</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          You are welcome to quote the index with a link back. The method is stated above: a chained, value-weighted measure over TCGplayer market prices of cards at US$1 or more, 1,000 on its first day.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-ink-800 bg-ink-950/60 p-3 text-xs text-slate-300">
          {`MTG Compare Index${last ? `, ${last.day}: ${last.value.toFixed(1)}` : ""}. ${SITE_NAME}, ${SITE_URL}/market`}
        </pre>
      </section>
      <RelatedGuides guides={guides} className="card-surface mt-6 p-5" />
    </div>
  );
}
