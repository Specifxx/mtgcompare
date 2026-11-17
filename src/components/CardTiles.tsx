import Link from "@/components/Link";
import { cardImage, cardPath, rarityName, usd } from "@/lib/cards";

// A grid of card tiles (card prices, DECISIONS.md "Card prices: every card"): TCGplayer's photo, the name, set and number, and the
// TCGplayer market price (the highest finish).
export interface CardTile {
  set: string;
  setName?: string;
  s: string;
  n: string;
  no: string;
  r: string | null;
  id: number;
  v: number;
}

export function CardTiles({ cards, eager = 0 }: { cards: readonly CardTile[]; eager?: number }) {
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {cards.map((c, i) => (
        <li key={c.id}>
          <Link href={cardPath(c.set, c.s)} prefetch={false} className="card flex h-full flex-col gap-2 p-3 transition-shadow hover:shadow-lift">
            <div className="aspect-[5/7] w-full overflow-hidden rounded-lg bg-raised">
              <img src={cardImage(c.id)} alt={`${c.n}${c.setName ? `, ${c.setName}` : ""}${c.no ? ` #${c.no}` : ""}`} width={250} height={350} loading={i < eager ? "eager" : "lazy"} decoding="async" className="h-full w-full object-contain" />
            </div>
            <span className="line-clamp-2 text-sm font-semibold leading-snug">{c.n}</span>
            <span className="text-xs text-muted">
              {c.setName ? `${c.setName} · ` : ""}
              {c.no ? `#${c.no}` : ""}
              {rarityName(c.r) ? `${c.no || c.setName ? " · " : ""}${rarityName(c.r)}` : ""}
            </span>
            {c.v > 0 && <span className="tabular mt-auto font-display text-lg font-extrabold">{usd(c.v)}</span>}
          </Link>
        </li>
      ))}
    </ol>
  );
}
