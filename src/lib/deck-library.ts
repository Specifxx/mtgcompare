// The deck library's page-side assembly (RiftCompare built these inline in
// its pages from Prisma reads; OP Compare builds them from the cached data.ts
// loaders, outside any cache callback). Server-only: it reads loaders.
import { affiliateUrl } from "./affiliate";
import { retailerSubId } from "./board";
import { MARKETS, type Country } from "./country";
import { getCardDetail, getCatalog, type CardLite, type LibraryDeckRow } from "./data";
import { optionLabel } from "./deck-price";
import { basketStoreKey } from "./shipping";
import { deckTotals } from "./published-decks";
import { sourceLabel } from "./stores";
import { SITE_URL } from "./site";
import type { LibraryDeck } from "@/components/decks/DeckLibrary";
import type { BestStore, CheapestPrinting, DeckViewLine } from "@/components/decks/PublishedDeckView";

/** Library rows priced from the catalogue's per-market lows (no per-deck read). */
export async function libraryRows(decks: LibraryDeckRow[]): Promise<LibraryDeck[]> {
  const cat = await getCatalog();
  return decks.map((d) => ({
    slug: d.slug,
    title: d.title,
    authorName: d.authorName,
    leaderName: d.leaderName,
    leaderSlug: d.leaderSlug,
    colors: d.colors ? d.colors.split(",").filter(Boolean) : [],
    cardCount: d.cardCount,
    createdAt: d.createdAt,
    totals: deckTotals(d.lines.map((l) => ({ qty: l.qty, card: cat.byId.get(l.cardId) }))),
  }));
}

/**
 * One published deck's lines: the cheapest store per card and market (each
 * card's own cached offers, never eBay) and the cheapest printing of the same
 * number per market (the Budget build), Leader first.
 */
export async function deckViewLines(deck: Pick<LibraryDeckRow, "slug" | "lines" | "leaderCardId">): Promise<DeckViewLine[]> {
  const cat = await getCatalog();
  const byNumber = new Map<string, CardLite[]>();
  for (const c of cat.cards) if (c.number && c.printing !== "don") (byNumber.get(c.number) ?? byNumber.set(c.number, []).get(c.number)!).push(c);
  const page = `${SITE_URL}/decks/${deck.slug}`;
  const lines = await Promise.all(
    deck.lines.map(async (l): Promise<DeckViewLine | null> => {
      const c = cat.byId.get(l.cardId);
      if (!c) return null;
      const detail = await getCardDetail(c.slug).catch(() => null);
      const best: Partial<Record<Country, BestStore | null>> = {};
      const cheapest: Partial<Record<Country, CheapestPrinting | null>> = {};
      for (const m of MARKETS) {
        const top = (detail?.offers ?? [])
          .filter((o) => o.market === m && o.inStock && basketStoreKey(o.source) != null)
          .sort((a, b) => a.priceCents - b.priceCents)[0];
        best[m] = top ? { source: top.source, store: sourceLabel(top.source, m), priceCents: top.priceCents, buyHref: affiliateUrl(top.url, retailerSubId(top.source), page) } : null;
        let pick: CheapestPrinting | null = null;
        for (const p of c.number ? (byNumber.get(c.number) ?? [c]) : [c]) {
          const v = p.low[m];
          if (v != null && (!pick || v < pick.priceCents)) pick = { id: p.id, href: `/card/${p.slug}`, label: optionLabel(p, cat.setById.get(p.setId)?.code ?? ""), priceCents: v };
        }
        cheapest[m] = pick;
      }
      return {
        qty: l.qty,
        leader: c.cardType === "Leader",
        card: { id: c.id, href: `/card/${c.slug}`, name: c.name, number: c.number, variant: c.variant, setCode: cat.setById.get(c.setId)?.code ?? "", low: c.low },
        best,
        cheapest,
      };
    }),
  );
  return lines.filter((x): x is DeckViewLine => x != null).sort((a, b) => Number(b.leader) - Number(a.leader));
}
