// Pricing a pasted list on the server: lib/deck.ts's pure parser and resolver
// over the cached catalogue, then each resolved printing's offers from the
// cached per-card loader. Shared by /api/deck/price and the /deck page's share
// metadata. Reads ONLY data.ts loaders, and
// none of them inside a cache callback (egress rules: lib/db.ts).
import { affiliateUrl, cardEbayQuery, ebaySearchUrl } from "./affiliate";
import { retailerSubId } from "./board";
import { basketStoreKey } from "./shipping";
import { MARKETS, type Country } from "./country";
import { getCardDetail, getCatalog, type CardLite, type Catalog, type OfferRow } from "./data";
import {
  basePrinting,
  checkDeck,
  QTY_CAP,
  DECK_LINE_CAP,
  formatDeckLine,
  indexCards,
  marketTotals,
  mergeLines,
  parseDeckList,
  resolveDeck,
  splitByCheapestStore,
  storeLows,
  type CardIndex,
  type DeckCheck,
  type MarketTotal,
  type MatchKind,
} from "./deck";
import { sourceLabel } from "./stores";

/** Distinct printings whose offers are loaded for one request. */
export const DECK_DETAIL_CAP = 80;

const indexes = new WeakMap<Catalog, CardIndex<CardLite>>();
export async function deckIndex(): Promise<{ cat: Catalog; idx: CardIndex<CardLite> }> {
  const cat = await getCatalog();
  let idx = indexes.get(cat);
  if (!idx) {
    idx = indexCards(cat.cards);
    indexes.set(cat, idx);
  }
  return { cat, idx };
}

export interface DeckCardOut {
  id: number;
  slug: string;
  name: string;
  number: string | null;
  variant: string | null;
  printing: string;
  rarity: string | null;
  cardType: string | null;
  colors: string[];
  setCode: string;
  hasImage: boolean;
  low: Record<Country, number | null>;
  marketUsd: number | null;
}

export interface DeckOptionOut {
  id: number;
  label: string;
  low: number | null;
}

export interface DeckLineOut {
  raw: string;
  qty: number;
  how: MatchKind;
  ambiguous: boolean;
  /** Matched only by the name-contains fallback: the words it was guessed from. */
  fuzzyFrom: string | null;
  leader: boolean;
  card: DeckCardOut;
  /** The line's canonical text (what the share link and "send to" carry). */
  text: string;
  options: DeckOptionOut[];
  cheapest: { source: string; store: string; priceCents: number; url: string; condition: string | null } | null;
  tcgplayerUrl: string | null;
  ebayUrl: string;
}

export interface DeckPriceResult {
  market: Country;
  lines: DeckLineOut[];
  unmatched: string[];
  totals: Record<Country, MarketTotal>;
  marketUsdTotal: number;
  split: {
    groups: { source: string; store: string; totalCents: number; copies: number; picks: { id: number; name: string; qty: number; unitCents: number; url: string; condition: string | null }[] }[];
    totalCents: number;
    missing: string[];
  };
  check: DeckCheck;
  text: string;
  /** Card lines read from the paste (headers and comments not counted). */
  lineCount: number;
  truncated: boolean;
}

function cardOut(c: CardLite, cat: Catalog, low: Record<Country, number | null>): DeckCardOut {
  return {
    id: c.id, slug: c.slug, name: c.name, number: c.number, variant: c.variant, printing: c.printing, rarity: c.rarity,
    cardType: c.cardType, colors: c.colors, setCode: cat.setById.get(c.setId)?.code ?? "", hasImage: c.hasImage, low, marketUsd: c.marketUsd,
  };
}


export function optionLabel(c: Pick<CardLite, "number" | "variant" | "printing">, setCode: string): string {
  const v = c.variant ?? (c.printing === "standard" ? "Standard" : c.printing);
  return `${c.number ?? ""} ${v}${setCode && !(c.number ?? "").startsWith(setCode) ? ` · ${setCode}` : ""}`.trim();
}

/**
 * The list line for a card picked in the deck page's search: its number for
 * the base printing, its number pinned to the exact printing otherwise (what
 * the printing switch writes). Null for an unknown slug or a DON!! card.
 */
export async function lineForSlug(slug: string, qty: number): Promise<string | null> {
  const { cat, idx } = await deckIndex();
  const c = cat.bySlug.get(slug);
  if (!c || c.printing === "don") return null;
  const base = c.number ? basePrinting(idx.byNumber.get(c.number) ?? [c]) : c;
  return formatDeckLine(Math.max(1, Math.min(QTY_CAP, Math.floor(qty) || 1)), c, c.id !== base?.id);
}

/** Offers that can fill a deck line in a market: live, this market, never eBay. */
export function basketOffers(offers: OfferRow[], market: Country): OfferRow[] {
  return offers.filter((o) => o.market === market && o.inStock && basketStoreKey(o.source) != null);
}

export async function priceDeck(text: string, market: Country, opts: { withOffers?: boolean; page?: string } = {}): Promise<DeckPriceResult> {
  const page = opts.page ?? "/deck";
  const { cat, idx } = await deckIndex();
  const parsed = parseDeckList(text);
  const resolved = mergeLines(resolveDeck(parsed, idx));
  const matched = resolved.filter((r): r is typeof r & { card: CardLite } => r.card != null);
  const unmatched = resolved.filter((r) => !r.card).map((r) => r.line.raw);

  const details = new Map<number, Awaited<ReturnType<typeof getCardDetail>>>();
  if (opts.withOffers !== false) {
    const ids = [...new Set(matched.map((m) => m.card.id))].slice(0, DECK_DETAIL_CAP);
    await Promise.all(
      ids.map(async (id) => {
        const c = cat.byId.get(id);
        if (c) details.set(id, await getCardDetail(c.slug).catch(() => null));
      }),
    );
  }

  const split = splitByCheapestStore(
    matched
      .filter((m) => details.has(m.card.id))
      .map((m) => ({
        key: String(m.card.id),
        qty: m.line.qty,
        offers: basketOffers(details.get(m.card.id)?.offers ?? [], market).map((o) => ({ source: o.source, priceCents: o.priceCents, url: o.url, condition: o.condition })),
      })),
  );
  const pickFor = new Map<number, { source: string; priceCents: number; url: string; condition: string | null }>();
  for (const g of split.groups) for (const p of g.picks) pickFor.set(Number(p.key), { source: g.source, priceCents: p.unitCents, url: p.url, condition: p.condition });

  const lines: DeckLineOut[] = matched.map((m) => {
    const c = m.card;
    const pick = pickFor.get(c.id);
    const base = c.number ? basePrinting(idx.byNumber.get(c.number) ?? [c]) : c;
    const pinned = c.id !== base?.id;
    const d = details.get(c.id);
    // Store listings when the card's offers were loaded; the catalogue's low
    // otherwise (share metadata past the detail cap — the same figure the card
    // tiles show).
    const low = d ? storeLows(d.offers, MARKETS) : c.low;
    return {
      raw: m.line.raw,
      qty: m.line.qty,
      how: m.how,
      ambiguous: m.ambiguous,
      fuzzyFrom: m.fuzzy ? m.line.name || m.line.raw : null,
      leader: c.cardType === "Leader",
      card: cardOut(c, cat, low),
      text: formatDeckLine(m.line.qty, c, pinned),
      options: m.options.map((o) => ({ id: o.id, label: optionLabel(o, cat.setById.get(o.setId)?.code ?? ""), low: o.low[market] })),
      cheapest: pick ? { ...pick, store: sourceLabel(pick.source, market), url: affiliateUrl(pick.url, retailerSubId(pick.source), page) } : null,
      tcgplayerUrl: d?.tcgplayerUrl ? affiliateUrl(d.tcgplayerUrl, "tcgplayer", page) : null,
      ebayUrl: ebaySearchUrl(market, cardEbayQuery(c), page.replace(/^\//, "").replace(/\//g, "-") || "deck"),
    };
  });
  // The Leader first, as every deck export writes it; the rest keep their order.
  lines.sort((a, b) => Number(b.leader) - Number(a.leader));

  const nameOf = new Map(matched.map((m) => [m.card.id, `${m.card.name}${m.card.number ? ` ${m.card.number}` : ""}${m.card.variant ? ` (${m.card.variant})` : ""}`]));
  return {
    market,
    lines,
    unmatched,
    totals: marketTotals(lines.map((l) => ({ qty: l.qty, low: l.card.low })), MARKETS),
    marketUsdTotal: lines.reduce((s, l) => s + (l.card.marketUsd ?? 0) * l.qty, 0),
    split: {
      groups: split.groups.map((g) => ({
        source: g.source,
        store: sourceLabel(g.source, market),
        totalCents: g.totalCents,
        copies: g.copies,
        picks: g.picks.map((p) => ({ id: Number(p.key), name: nameOf.get(Number(p.key)) ?? p.key, qty: p.qty, unitCents: p.unitCents, url: affiliateUrl(p.url, retailerSubId(g.source), page), condition: p.condition })),
      })),
      totalCents: split.totalCents,
      missing: split.missing.map((k) => nameOf.get(Number(k)) ?? k),
    },
    check: checkDeck(lines.map((l) => ({ qty: l.qty, number: l.card.number, isLeader: l.leader }))),
    text: [...lines.map((l) => l.text), ...unmatched].join("\n"),
    lineCount: parsed.length,
    truncated: parsed.length >= DECK_LINE_CAP,
  };
}
