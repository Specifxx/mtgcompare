import { cardImage, cardPath, usd } from "@/lib/format";
import type { CardLite, Mover } from "@/lib/cards";

const pct = (m: Mover) => Math.round(((m.v - m.was) / m.was) * 100);

/** Card tiles. Plain <a>: no prefetch, so a list of tiles never warms a page nobody opens. */
export function CardTiles({ game, cards, eager = 0 }: { game: string; cards: (CardLite | Mover)[]; eager?: number }) {
  return (
    <ul className="tiles">
      {cards.map((c, i) => (
        <li key={c.id}>
          <a className="card tile" href={cardPath(game, c.set, c.s)}>
            <span className="img">
              <img src={cardImage(c.id)} alt={c.n} width={200} height={280} loading={i < eager ? "eager" : "lazy"} decoding="async" />
            </span>
            <span className="n">{c.n}</span>
            <span className="m">{c.no ? `#${c.no}` : c.r ?? ""}</span>
            <span className="p">
              {c.v ? usd(c.v) : "No recent sales"}
              {"was" in c ? <span className={c.v > c.was ? "up" : "down"}> {c.v > c.was ? "+" : ""}{pct(c)}%</span> : null}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
