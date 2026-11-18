import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardTiles } from "@/components/CardTiles";
import { shortDate } from "@/lib/format";
import { breadcrumbLd, jsonLd, pageMeta } from "@/lib/seo";
import { readMeta, readSets, readTop } from "@/lib/store";
import { SITE, gameBySlug } from "@/site.config";

// A game's hub: the week's movers, the most valuable cards, every set. Indexable once the game has a released card.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { game: string } }): Metadata {
  const g = gameBySlug(params.game);
  if (!g) return {};
  const m = readMeta().games[g.slug];
  return pageMeta({
    title: `${g.name} Card Prices: Every Set and Single`,
    description: `${g.name} single-card prices${m ? ` for ${m.cards.toLocaleString("en-US")} cards in ${m.sets} sets` : ""}: TCGplayer market price per printing, price history and the week's biggest movers. Updated daily.`,
    path: `/${g.slug}`,
    noindex: !m?.indexed,
  });
}

export default function GamePage({ params }: { params: { game: string } }) {
  const g = gameBySlug(params.game);
  if (!g) notFound();
  const { sets, generatedAt } = readSets(g.slug);
  const top = readTop(g.slug);
  const crumbs = [{ label: SITE.name, href: "/" }, { label: g.name }];
  return (
    <div className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd(crumbs)) }} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="/">{SITE.name}</a> <span>›</span> <span>{g.name}</span>
      </nav>
      <h1>{g.name} card prices</h1>
      <p className="lede">
        Every {g.name} card with its TCGplayer market price, what copies recently sold for in US dollars.{generatedAt ? ` Updated ${shortDate(generatedAt)}.` : ""}
      </p>
      {top.up.length > 0 && (
        <section>
          <h2>Biggest rises this week</h2>
          <CardTiles game={g.slug} cards={top.up.slice(0, 12)} />
        </section>
      )}
      {top.down.length > 0 && (
        <section>
          <h2>Biggest falls this week</h2>
          <CardTiles game={g.slug} cards={top.down.slice(0, 12)} />
        </section>
      )}
      {top.top.length > 0 && (
        <section>
          <h2>Most valuable {g.name} cards</h2>
          <CardTiles game={g.slug} cards={top.top.slice(0, 24)} eager={6} />
        </section>
      )}
      <section>
        <h2>All {sets.length} sets</h2>
        <ul className="setgrid">
          {sets.map((s) => (
            <li key={s.slug}>
              <a className="card" href={`/${g.slug}/${s.slug}`}>
                <b>{s.name}</b>
                <span className="small" style={{ display: "block" }}>
                  {s.cards} cards{s.released ? ` · ${s.released.slice(0, 4)}` : ""}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
