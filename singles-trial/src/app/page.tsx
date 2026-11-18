import { CardTiles } from "@/components/CardTiles";
import { shortDate } from "@/lib/format";
import { pageMeta } from "@/lib/seo";
import { readMeta, readTop } from "@/lib/store";
import { LIVE_GAMES, SITE } from "@/site.config";

export const dynamic = "force-dynamic";
export const metadata = pageMeta({ title: `${SITE.name}: ${SITE.tagline}`, description: "What is a single card worth? TCGplayer market prices per printing, price history and the week's biggest movers, updated daily.", path: "/" });

export default function Home() {
  const meta = readMeta();
  return (
    <div className="page">
      <div className="hero">
        <h1>What is that card worth?</h1>
        <p className="lede">
          Search any card by name, set or collector number. Every card shows its TCGplayer market price per printing and how that price has moved.
          {meta.generatedAt ? ` Updated ${shortDate(meta.generatedAt)}.` : ""}
        </p>
      </div>
      {LIVE_GAMES.map((g) => {
        const top = readTop(g.slug);
        const m = meta.games[g.slug];
        return (
          <section key={g.slug}>
            <h2>
              <a href={`/${g.slug}`}>{g.name} card prices</a>
            </h2>
            {m ? (
              <p className="small">
                {m.cards.toLocaleString("en-US")} cards in {m.sets.toLocaleString("en-US")} sets
              </p>
            ) : null}
            {top.up.length > 0 && (
              <>
                <h3 className="small">Rising this week</h3>
                <CardTiles game={g.slug} cards={top.up.slice(0, 6)} />
              </>
            )}
            <h3 className="small">Most valuable</h3>
            <CardTiles game={g.slug} cards={top.top.slice(0, 12)} eager={6} />
            <p>
              <a className="btn" href={`/${g.slug}`}>
                Every {g.name} set
              </a>
            </p>
          </section>
        );
      })}
    </div>
  );
}
