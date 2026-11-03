import Link from "@/components/Link";
import { gameViews } from "@/lib/game-hubs";

/** The homepage's "pick your game" row on a multi-game site (SITE.lines). */
export function GameTiles() {
  const views = gameViews();
  if (!views.length) return null;
  return (
    <section aria-labelledby="games-h">
      <h2 id="games-h" className="mb-3 text-xl font-bold">Pick your game</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {views.map((v) => (
          <Link key={v.line.id} href={`/games/${v.line.slug}`} className="game-tile" style={{ ["--game" as string]: v.line.color }}>
            <span className="game-tile-name">{v.line.name}</span>
            <span className="mt-1 block text-sm text-muted">{v.line.blurb}</span>
            <span className="mt-3 block text-xs text-muted">
              {v.cards.toLocaleString()} cards · {v.sealed.toLocaleString()} sealed · {v.sets.length} sets
              {v.newest && <> · newest: {v.newest.name}</>}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
