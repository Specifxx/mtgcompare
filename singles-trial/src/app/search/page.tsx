import type { Metadata } from "next";
import { CardTiles } from "@/components/CardTiles";
import { searchAll } from "@/lib/search";
import { LIVE_GAMES } from "@/site.config";

// Search results: never indexed, never crawled (robots.txt), rendered per request.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search cards", robots: { index: false, follow: true } };

export default function SearchPage({ searchParams }: { searchParams: { q?: string; game?: string } }) {
  const q = (searchParams.q ?? "").slice(0, 80);
  const game = LIVE_GAMES.find((g) => g.slug === searchParams.game)?.slug ?? null;
  const { hits, total } = q.trim().length >= 2 ? searchAll(q, game, 60) : { hits: [], total: 0 };
  const byGame = LIVE_GAMES.map((g) => ({ g, cards: hits.filter((h) => h.game === g.slug) })).filter((x) => x.cards.length);
  return (
    <div className="page">
      <h1>{q ? `Cards matching “${q}”` : "Search cards"}</h1>
      <p className="lede">{q ? (total ? `${total.toLocaleString("en-US")} cards found${total > hits.length ? `, showing the first ${hits.length}` : ""}.` : "No card matches that. Try the card's name alone, or its set code and number.") : "Type a card name, a set code or a collector number in the box above."}</p>
      {byGame.map(({ g, cards }) => (
        <section key={g.slug}>
          <h2>{g.name}</h2>
          <CardTiles game={g.slug} cards={cards.map((h) => ({ ...h, r: null }))} eager={6} />
        </section>
      ))}
    </div>
  );
}
