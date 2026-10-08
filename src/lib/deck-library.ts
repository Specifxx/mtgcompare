// The deck library's page-side assembly: library rows and a deck page's lines are priced NOW from the loaders (deckUnitCards over getCardsByIds), outside
// any cache callback, so a price import moves every total without a deck read. Server-only.
import { affiliateUrl } from "./affiliate";
import { retailerSubId } from "./board";
import { colorsOfMask, type Finish } from "./constants";
import { MARKETS, type Country } from "./country";
import { getCardDetail, getCardPage, type CardLite, type LibraryDeckRow } from "./data";
import { deckUnitCards, optionLabel, pricedCard } from "./deck-price";
import { basketStoreKey } from "./shipping";
import { deckTotals } from "./published-decks";
import { sourceLabel } from "./stores";
import { SITE_URL } from "./site";
import type { LibraryDeck } from "@/components/decks/DeckLibrary";
import type { BestStore, CheapestPrinting, DeckViewLine } from "@/components/decks/PublishedDeckView";

const unitKey = (l: { cardId: number; finish?: Finish }): string => `${l.cardId}.${l.finish === "F" ? 1 : 0}`;

/** Library rows priced from the units' per-market lows (one getCardsByIds read per finish for the whole library). */
export async function libraryRows(decks: LibraryDeckRow[]): Promise<LibraryDeck[]> {
  const units = await deckUnitCards(decks.flatMap((d) => d.lines));
  return decks.map((d) => ({
    slug: d.slug,
    title: d.title,
    authorName: d.authorName,
    commanderName: d.commanderName,
    commanderSlug: d.commanderSlug,
    colors: colorsOfMask(d.identity),
    cardCount: d.cardCount,
    createdAt: d.createdAt,
    totals: deckTotals(d.lines.map((l) => {
      const u = units.get(unitKey(l));
      return { qty: l.qty, card: u ? pricedCard(u) : null };
    })),
  }));
}

/**
 * One published deck's lines: the cheapest store per card and market (each card's own offers of the finish it plays, never eBay) and the cheapest printing
 * of the same card in that finish per market (the Budget build), commander first.
 */
export async function deckViewLines(deck: Pick<LibraryDeckRow, "slug" | "lines" | "commanderCardId" | "partnerCardId">): Promise<DeckViewLine[]> {
  const units = await deckUnitCards(deck.lines);
  const page = `${SITE_URL}/decks/${deck.slug}`;
  const printings = new Map<string, Promise<CardLite[]>>();
  const printingsOf = (c: CardLite, finish: Finish): Promise<CardLite[]> => {
    if (c.oracleNo == null) return Promise.resolve([c]);
    const key = `${c.oracleNo}.${finish}`;
    return printings.get(key) ?? printings.set(key, getCardPage({ oracleNo: c.oracleNo, finish, sort: "price-asc", page: 1, per: 100 }).then((p) => p.items).catch(() => [c])).get(key)!;
  };
  const lines = await Promise.all(
    deck.lines.map(async (l): Promise<DeckViewLine | null> => {
      const c = units.get(unitKey(l));
      if (!c) return null;
      const finish: Finish = l.finish === "F" ? "F" : "N";
      const [detail, prints] = await Promise.all([getCardDetail(c.slug).catch(() => null), printingsOf(c, finish)]);
      const best: Partial<Record<Country, BestStore | null>> = {};
      const cheapest: Partial<Record<Country, CheapestPrinting | null>> = {};
      for (const m of MARKETS) {
        const top = (detail?.offers ?? [])
          .filter((o) => o.market === m && o.finish === finish && o.inStock && basketStoreKey(o.source) != null)
          .sort((a, b) => a.priceCents - b.priceCents)[0];
        best[m] = top ? { source: top.source, store: sourceLabel(top.source, m), priceCents: top.priceCents, buyHref: affiliateUrl(top.url, retailerSubId(top.source), page) } : null;
        let pick: CheapestPrinting | null = null;
        for (const p of prints) {
          const v = p.low[m];
          if (v != null && (!pick || v < pick.priceCents)) pick = { id: p.id, href: `/card/${p.slug}`, label: optionLabel(p), priceCents: v };
        }
        cheapest[m] = pick;
      }
      return {
        qty: l.qty,
        commander: l.cardId === deck.commanderCardId || l.cardId === deck.partnerCardId,
        finish,
        card: { ...pricedCard(c), id: c.id, href: `/card/${c.slug}`, name: c.name, number: c.number, variant: c.label, setCode: c.setCode },
        best,
        cheapest,
      };
    }),
  );
  return lines.filter((x): x is DeckViewLine => x != null).sort((a, b) => Number(b.commander) - Number(a.commander));
}
