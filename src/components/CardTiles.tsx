import Link from "@/components/Link";
import { cardImage, cardPath, cardValue, rarityName, usd, type CardRow } from "@/lib/cards";
import { SET_BY_CODE } from "@/lib/sets";

// A grid of card tiles (card prices, DECISIONS.md 2026-11-17): the card's picture, name, set and number, and its TCGplayer market price.
export function CardTiles({ cards, showSet = false, eager = 0 }: { cards: readonly CardRow[]; showSet?: boolean; eager?: number }) {
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {cards.map((c, i) => {
        const s = SET_BY_CODE.get(c.set);
        if (!s) return null;
        const img = cardImage(c.imageUrl);
        const v = cardValue(c);
        return (
          <li key={c.id}>
            <Link href={cardPath(s.slug, c)} prefetch={false} className="card flex h-full flex-col gap-2 p-3 transition-shadow hover:shadow-lift">
              <div className="aspect-[5/7] w-full overflow-hidden rounded-lg bg-surface">
                {img && <img src={img} alt={`${c.name} (${s.name} #${c.number})`} width={250} height={350} loading={i < eager ? "eager" : "lazy"} decoding="async" className="h-full w-full object-contain" />}
              </div>
              <span className="line-clamp-2 text-sm font-semibold leading-snug">{c.name}</span>
              <span className="text-xs text-muted">
                {showSet ? `${s.name} · ` : ""}#{c.number}
                {rarityName(c.rarity) ? ` · ${rarityName(c.rarity)}` : ""}
              </span>
              {v != null && <span className="tabular mt-auto font-display text-lg font-extrabold">{usd(v)}</span>}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
