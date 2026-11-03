import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { SITE } from "@/site.config";
import { canon, abs } from "@/lib/site";
import { fitTitle } from "@/lib/seo-title";
import { lineBySlug } from "@/lib/lines";
import { gameView } from "@/lib/game-hubs";
import { productsInSet, refCents } from "@/lib/data";
import { money } from "@/lib/format";
import { TileGrid } from "@/components/ProductTile";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { EbayCardStrip, TcgplayerCardStrip } from "@/components/CardAds";
import { adSearch, cardAds } from "@/lib/card-ads";

export const revalidate = 86400; // data only changes with a release
export const generateStaticParams = () => [];

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const line = lineBySlug(params.slug);
  if (!line) return {};
  const v = gameView(line);
  const title = fitTitle([`${line.name} Prices — Booster Boxes & Cards, Every Store`, `${line.name} Prices — Booster Boxes & Cards`, `${line.name} Prices`]);
  return {
    title,
    description: `${line.name} prices compared across TCGplayer, eBay and ${SITE.stores.length} stores: ${v.sets.length} sets, ${v.cards.toLocaleString()} cards and ${v.sealed} sealed products, cheapest in-stock first, in your currency, updated daily.`,
    ...canon(`/games/${line.slug}`),
    openGraph: { ...canon(`/games/${line.slug}`).openGraph, title: title.absolute },
  };
}

export default function GamePage({ params }: { params: { slug: string } }) {
  const line = lineBySlug(params.slug);
  if (!line) notFound();
  const v = gameView(line);
  const search = adSearch(null, { line: line.id });
  return (
    <div className="flex flex-col gap-8" style={{ ["--game" as string]: line.color }}>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "ItemList", name: `${line.name} sets`, numberOfItems: v.sets.length, itemListElement: v.sets.slice(0, 30).map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.name, url: abs(`/sets/${s.slug}`) })) }} />
      <div>
        <Breadcrumbs items={[{ name: "Games", href: "/games" }, { name: line.name }]} />
        <header className="game-hero">
          <h1 className="font-display text-3xl font-black md:text-4xl">{line.name} prices</h1>
          <p className="mt-2 max-w-2xl text-muted">{line.blurb}</p>
          <p className="mt-2 text-sm text-muted">{v.sets.length} sets · {v.cards.toLocaleString()} cards · {v.sealed} sealed products, compared across TCGplayer, eBay and {SITE.stores.length} stores.</p>
          {v.newest && <p className="mt-3"><Link className="btn-primary" href={`/sets/${v.newest.slug}`}>Newest set: {v.newest.name} →</Link></p>}
        </header>
      </div>

      {v.boxes.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">{line.name} booster boxes</h2>
          <TileGrid items={v.boxes.slice(0, 6)} />
        </section>
      )}

      {v.topCards.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">Most valuable {line.name} cards</h2>
          <TileGrid items={v.topCards} />
        </section>
      )}

      <EbayCardStrip ads={{ ebay: cardAds({ kind: "card", limit: 12, line: line.id }).ebay }} page="game" query={search.ebayQuery} title={`${line.name} on eBay right now`} />

      <section>
        <h2 className="mb-3 text-xl font-bold">Every {line.name} set, newest first</h2>
        <div className="overflow-hidden rounded-xl border border-ink-700/60">
          <table className="w-full text-sm">
            <thead className="bg-ink-850 text-left text-xs uppercase text-muted">
              <tr><th className="px-3 py-2">Set</th><th className="px-3 py-2">Released</th><th className="px-3 py-2 text-right">Cards</th><th className="px-3 py-2 text-right">Set value</th></tr>
            </thead>
            <tbody>
              {v.sets.map((s) => {
                const cards = productsInSet(s.id).filter((p) => p.kind === "card");
                const value = cards.reduce((a, p) => a + (refCents(p.id) ?? 0), 0);
                return (
                  <tr key={s.id} className="border-t border-ink-800">
                    <td className="px-3 py-2"><Link className="link" href={`/sets/${s.slug}`}>{s.name}</Link>{s.upcoming && <span className="chip ml-2">Upcoming</span>}</td>
                    <td className="px-3 py-2 text-muted">{s.releasedOn}</td>
                    <td className="px-3 py-2 text-right">{cards.length}</td>
                    <td className="px-3 py-2 text-right font-semibold">{value ? money(value) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <TcgplayerCardStrip ads={{ tcgplayer: cardAds({ kind: "card", limit: 12, line: line.id }).tcgplayer }} page="game" searchUrl={search.tcgplayerUrl} title={`Shop ${line.name} on TCGplayer`} />
    </div>
  );
}
