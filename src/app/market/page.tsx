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
import { getCatalog, getIndexSeries } from "@/lib/data";
import { int, longDate, money } from "@/lib/format";
import { movers, releasedSets } from "@/lib/selectors";
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

export const metadata: Metadata = {
  title: "One Piece Card Market Index — Is the Market Up or Down?",
  description:
    "The OP Compare Index tracks the whole One Piece Card Game singles market from TCGplayer market prices, plus each set's total value.",
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
  const [cat, series] = await Promise.all([getCatalog(), getIndexSeries()]);
  const last = series[series.length - 1];
  const sets = releasedSets(cat.sets, ["booster", "extra", "premium"]).map(
    (s) => {
      const cs = cat.cards.filter((x) => x.setId === s.id);
      const total = cs.reduce((a, x) => a + (x.marketUsd ?? 0), 0);
      const w = cs.filter((x) => x.change7d != null && x.marketUsd);
      const move = w.length
        ? (w.reduce((a, x) => a + x.marketUsd!, 0) /
            w.reduce((a, x) => a + x.marketUsd! / (1 + x.change7d! / 100), 0) -
            1) *
          100
        : null;
      return { s, total, move, n: cs.length };
    },
  );

  const { rows: constituents, basketCount } = indexConstituents(cat.cards, (id) => cat.setById.get(id)?.code ?? "");
  // Breadth over the WHOLE basket (every card at US$1+), not just the table rows.
  const basketAll = cat.cards.filter((c) => (c.marketUsd ?? 0) >= 100).map((c) => ({ priceCents: c.marketUsd!, d7pct: c.change7d }));
  const stats = computeStats(series, basketAll);
  const gainers = movers(cat.cards, "up", 5);
  const fallers = movers(cat.cards, "down", 5);
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
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">The OP Compare Index</h1>
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
              label: "OP Compare Index",
              color: "#ff6b6b",
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
          Basket: the {int(basketCount)} printings priced at US$1 or more, one of each. Breadth counts every one of them, not only the table below.
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
                      {x.variant ? ` (${x.variant})` : ""} <span className="num text-xs text-slate-500">{x.number}</span>
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
          sub="Every printing in each released booster set at TCGplayer's market price, and its value-weighted 7-day move."
        />
        <div className="card-surface overflow-x-auto">
          <table className={`${DATA_TABLE} min-w-[560px]`}>
            <thead>
              <tr>
                <th>Set</th>
                <th className="text-right">Printings</th>
                <th className="text-right">Total value</th>
                <th className="text-right">7 days</th>
              </tr>
            </thead>
            <tbody>
              {sets.map(({ s, total, move, n }) => (
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
                  <td className="num text-right text-slate-300">{int(n)}</td>
                  <td className="num text-right font-semibold text-accent">
                    {money(total, "US")}
                  </td>
                  <td className="text-right">
                    <Delta v={move} className="text-xs" />
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
        <h2 className="text-lg text-white">Cite the OP Compare Index</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          You are welcome to quote the index with a link back. The method is stated above: a chained, value-weighted measure over TCGplayer market prices of cards at US$1 or more, 1,000 on its first day.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-ink-800 bg-ink-950/60 p-3 text-xs text-slate-300">
          {`OP Compare Index${last ? `, ${last.day}: ${last.value.toFixed(1)}` : ""}. ${SITE_NAME}, ${SITE_URL}/market`}
        </pre>
      </section>
      <RelatedGuides guides={guides} className="card-surface mt-6 p-5" />
    </div>
  );
}
