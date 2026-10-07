// The SEO landing pages' URL vocabulary: /cards/printing/[printing],
// /cards/rarity/[rarity] and /cards/type/[type]. Each slug maps to the
// catalogue field it filters on (Card.printing, .rarity, .cardType), so a page
// lists exactly what /browse would with the same filter. Pure.
import { PRINTINGS, RARITIES } from "./constants";

export interface Facet {
  slug: string;
  key: string; // the catalogue value
  label: string;
  title: string; // the page's H1 noun: "Parallel & alternate art cards"
  intro: string;
}

export const PRINTING_FACETS: Facet[] = [
  { slug: "standard", key: "standard", label: "Standard", title: "Standard prints", intro: "The regular print of every One Piece card — what most decks are built from." },
  { slug: "parallel", key: "alt", label: "Parallel & alternate art", title: "Parallel & alternate-art cards", intro: "Parallel and alternate-art prints: the same card with new art, usually foil and pulled far less often than the standard print." },
  { slug: "manga", key: "manga", label: "Manga", title: "Manga rare cards", intro: "Manga rares: art drawn from the manga's own panels, usually the scarcest pull in a set." },
  { slug: "sp", key: "sp", label: "SP", title: "SP (special) cards", intro: "SP cards: earlier sets' cards reprinted with new art and a special frame in later boxes." },
  { slug: "treasure-rare", key: "treasure", label: "Treasure Rare", title: "Treasure Rare cards", intro: "Treasure Rares (TR): a special rarity in recent sets, among the scarcest pulls in a box." },
  { slug: "special-foil", key: "foil", label: "Special foil", title: "Special foil cards", intro: "Special foils: Jolly Roger, pirate, gold and textured finishes of existing cards." },
  { slug: "reprint", key: "reprint", label: "Reprint", title: "Reprinted cards", intro: "Reprints, mostly from the Premium Booster “The Best” sets and starter decks." },
  { slug: "promo", key: "promo", label: "Promo", title: "Promo cards", intro: "Promos and event prints: tournament, release-event, pre-release and product promos." },
  { slug: "don", key: "don", label: "DON!!", title: "DON!! cards", intro: "DON!! cards — the game's resource cards, collected for their alternate art." },
];

const RARITY_SLUGS: Record<string, string> = {
  L: "leader",
  C: "common",
  UC: "uncommon",
  R: "rare",
  SR: "super-rare",
  SEC: "secret-rare",
  TR: "treasure-rare",
  PR: "promo",
  "DON!!": "don",
};

const RARITY_INTRO: Record<string, string> = {
  L: "Leader rarity: the card every deck is built around, one per deck.",
  C: "Commons: the most-printed cards in a set, and the backbone of most decks.",
  UC: "Uncommons: a step up from commons, still easy to find as singles.",
  R: "Rares: one or more in every pack, many of them deck staples.",
  SR: "Super Rares: the set's headline Characters and Events, about one in a few packs.",
  SEC: "Secret Rares: the rarest regular rarity in a booster set, usually one or two per box.",
  TR: "Treasure Rares: a special rarity introduced in recent sets, among the hardest pulls.",
  PR: "Promos: cards given out at events, in tournament kits and with products.",
  "DON!!": "DON!! cards: the resource cards, printed with collectable alternate art.",
};

export const RARITY_FACETS: Facet[] = Object.keys(RARITIES)
  .sort((a, b) => RARITIES[a].order - RARITIES[b].order)
  .map((k) => ({ slug: RARITY_SLUGS[k] ?? k.toLowerCase(), key: k, label: RARITIES[k].label, title: `${RARITIES[k].label} cards`, intro: RARITY_INTRO[k] ?? "" }));

export const TYPE_FACETS: Facet[] = [
  { slug: "leader", key: "Leader", label: "Leader", title: "Leader cards", intro: "Leaders: the one card a deck is built around. It sets the deck's colours and Life, and starts the game in play." },
  { slug: "character", key: "Character", label: "Character", title: "Character cards", intro: "Characters: the cards that attack, block and carry most of a deck's effects." },
  { slug: "event", key: "Event", label: "Event", title: "Event cards", intro: "Events: one-shot effects played in your Main Phase or, with [Counter], during your opponent's attack." },
  { slug: "stage", key: "Stage", label: "Stage", title: "Stage cards", intro: "Stages: locations that stay in play and give an ongoing effect; one at a time." },
  { slug: "don", key: "DON!!", label: "DON!!", title: "DON!! cards", intro: "DON!! cards: the resource you attach to Leaders and Characters, collected for their art." },
];

export function facetBySlug(list: Facet[], slug: string): Facet | undefined {
  const s = slug.toLowerCase();
  return list.find((f) => f.slug === s);
}

export function printingFacetHref(printingKey: string): string {
  const f = PRINTING_FACETS.find((x) => x.key === printingKey);
  return f ? `/cards/printing/${f.slug}` : "/cards";
}
export function rarityFacetHref(rarity: string): string {
  const f = RARITY_FACETS.find((x) => x.key === rarity);
  return f ? `/cards/rarity/${f.slug}` : "/cards/rarity";
}
export function typeFacetHref(cardType: string): string {
  const f = TYPE_FACETS.find((x) => x.key === cardType);
  return f ? `/cards/type/${f.slug}` : "/cards";
}

// PRINTINGS is imported so a printing added to constants without a facet is a
// type-level reminder in tests (tests/facets.test.ts).
export const UNFACETED_PRINTINGS = Object.keys(PRINTINGS).filter((k) => !PRINTING_FACETS.some((f) => f.key === k));

/** A /leaders/[slug] slug: the Leader's name and number ("roronoa-zoro-op01-001"). */
export function leaderSlug(name: string, number: string | null): string {
  return `${name} ${number ?? ""}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Page through a list: the clamped page number and its slice. */
export function paginate<T>(items: T[], pageParam: string | undefined, per: number): { page: number; pages: number; slice: T[] } {
  const pages = Math.max(1, Math.ceil(items.length / per));
  const page = Math.min(Math.max(1, parseInt(pageParam ?? "1", 10) || 1), pages);
  return { page, pages, slice: items.slice((page - 1) * per, page * per) };
}

/** "?page=N" for a page past the first (its canonical and pager links), else "". */
export function pageSuffix(pageParam: string | undefined): string {
  const n = parseInt(pageParam ?? "1", 10);
  return Number.isFinite(n) && n > 1 ? `?page=${n}` : "";
}
