// /gallery and /sets/[slug]/gallery: title and description builders and the
// gallery's pure facet, filter and sort rules (RiftCompare's lib/gallery-seo.ts).
// Kept out of the route files because a page.tsx may export only Next's route
// fields, and so tests/gallery-seo.test.ts can pin them.
import type { CardLite } from "./data";

/** The title carries the card count: the one claim a gallery can make that a competitor may not. Inside 60 for any four-digit count. */
export function galleryTitle(totalCards: number): string {
  return totalCards > 0 ? `One Piece Card Gallery: All ${totalCards.toLocaleString("en-US")} Cards by Set` : "One Piece Card Gallery: Every Card, Every Set";
}

/** `setNames` newest first or in release order; the span rolls forward on its own as sets release. */
export function galleryDescription(totalCards: number, setNames: string[]): string {
  const span = setNames.length > 1 ? `${setNames[0]} to ${setNames[setNames.length - 1]}` : setNames[0] ?? "every set";
  return totalCards > 0
    ? `Every One Piece Card Game card as full-size art: ${totalCards.toLocaleString("en-US")} printings across ${setNames.length} sets, ${span}, each with live prices. Pick a set to open its full gallery.`
    : "Every One Piece Card Game card as full-size art, set by set, each with live prices from every store we track. Pick a set to open its full gallery.";
}

export function setGalleryTitle(setName: string, setCode: string, count: number): string {
  const t = `${setName} (${setCode}) Card Gallery: ${count} Cards`;
  return t.length <= 60 ? t : `${setCode} Card Gallery: ${count} Cards`;
}

export function setGalleryDescription(setName: string, setCode: string, count: number, upcoming: boolean): string {
  return upcoming
    ? `Every revealed card from One Piece ${setName} (${setCode}) so far: ${count} printings as full-size art, with prices as soon as stores list them.`
    : `Every card in One Piece ${setName} (${setCode}) as full-size art: ${count} printings including Parallel, Manga and SP versions, each with live prices.`;
}

export interface GalleryFilters {
  color: string | null;
  rarity: string | null;
  printing: string | null;
}

type Counted = [string, number][];
function count(values: (string | null | undefined)[]): Counted {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Facet lists over the cards actually present (a card can carry two colours), by frequency. */
export function galleryFacets(cards: readonly CardLite[]): { colors: Counted; rarities: Counted; printings: Counted } {
  return {
    colors: count(cards.flatMap((c) => c.colors)),
    rarities: count(cards.map((c) => c.rarity)),
    printings: count(cards.map((c) => c.printing)),
  };
}

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function galleryFilter(cards: readonly CardLite[], q: string, f: GalleryFilters): CardLite[] {
  const needle = norm(q);
  const raw = q.trim().toLowerCase();
  return cards.filter((c) => {
    if (f.color && !c.colors.includes(f.color)) return false;
    if (f.rarity && c.rarity !== f.rarity) return false;
    if (f.printing && c.printing !== f.printing) return false;
    if (needle) {
      const inName = norm(`${c.name} ${c.variant ?? ""}`).includes(needle);
      const inNum = (c.number ?? "").toLowerCase().includes(raw);
      if (!inName && !inNum) return false;
    }
    return true;
  });
}

export function gallerySort(cards: readonly CardLite[], sort: "number" | "value"): CardLite[] {
  const byNumber = (a: CardLite, b: CardLite) => (a.number ?? "~").localeCompare(b.number ?? "~", "en", { numeric: true }) || a.id - b.id;
  return [...cards].sort(sort === "value" ? (a, b) => (b.marketUsd ?? -1) - (a.marketUsd ?? -1) || byNumber(a, b) : byNumber);
}
