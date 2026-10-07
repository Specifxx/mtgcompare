// Building the One Piece catalogue from TCGplayer's public data, mirrored daily
// by TCGCSV (https://tcgcsv.com, category 68 = One Piece Card Game). Pure: the
// importer (src/lib/import.ts) fetches, this decides. Every rule here is pinned
// in tests/catalog.test.ts against real TCGplayer titles.
//
// The same source RiftCompare's Pokémon section uses (lib/pokemon/catalog.ts):
// one static JSON per group, no pagination, no API key, English-only category.

import type { SealedKind } from "./constants";

// ── TCGCSV payload shapes (only the fields we read) ──────────────────────────
export interface TcgcsvGroup {
  groupId: number;
  name: string;
  abbreviation: string;
  publishedOn: string;
  isSupplemental?: boolean;
}
export interface TcgcsvProduct {
  productId: number;
  name: string;
  imageUrl: string;
  imageCount?: number;
  groupId: number;
  url: string;
  presaleInfo?: { isPresale: boolean; releasedOn: string | null } | null;
  extendedData?: { name: string; value: string }[];
}
export interface TcgcsvPrice {
  productId: number;
  lowPrice: number | null;
  midPrice?: number | null;
  marketPrice: number | null;
  subTypeName: string;
}

export const TCGCSV_CATEGORY = 68;
export const TCGCSV_BASE = `https://tcgcsv.com/tcgplayer/${TCGCSV_CATEGORY}`;

// ── Strings ──────────────────────────────────────────────────────────────────
export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’"”“]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/** Card text without HTML, errata links or the reminder-text <em> markup. */
export function cleanEffect(html: string | undefined | null): string | null {
  if (!html) return null;
  const t = decode(
    html
      .replace(/<a\b[^>]*>[^<]*errata[^<]*<\/a>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return t || null;
}

// ── Sets ─────────────────────────────────────────────────────────────────────
export type SetKind = "booster" | "extra" | "premium" | "starter" | "promo" | "event" | "collection";

/** What a TCGplayer group is. Every One Piece group is in scope; this only sorts them. */
export function setKind(g: Pick<TcgcsvGroup, "name" | "abbreviation">): SetKind {
  const code = (g.abbreviation ?? "").trim().toUpperCase();
  const name = g.name ?? "";
  if (/\b(PRE|RE|ANN)$/.test(code) || /pre-release|release event|anniversary tournament/i.test(name)) return "event";
  if (code === "OP-PR") return "promo";
  if (/^OP\d{2}(?:-EB\d{2})?$/.test(code)) return "booster";
  if (/^EB-?\d/.test(code)) return "extra";
  if (/^PRB-?\d/.test(code)) return "premium";
  if (/^(ST|SD|LT)-?\d/.test(code) || /starter deck|ultra deck|deck set/i.test(name)) return "starter";
  return "collection";
}

/** "ST-01: Starter Deck 1 Straw Hat Crew" → "Starter Deck 1: Straw Hat Crew". */
export function setDisplayName(g: Pick<TcgcsvGroup, "name">): string {
  let n = g.name.replace(/^[A-Z]{2,3}-\d{2}(?:-\d{2})?:\s*/, "").trim();
  n = n.replace(/^(Starter Deck(?: EX)? \d+|Ultra Deck|Starter Deck EX)\s+(?!:)/, "$1: ");
  return n.replace(/”|“/g, '"').replace(/\s+/g, " ");
}

/** A set's code as players write it: "OP01", "ST-01", "EB-01", "PRB-01". */
export function setCode(g: Pick<TcgcsvGroup, "abbreviation" | "groupId">): string {
  const c = (g.abbreviation ?? "").trim();
  return c || `G${g.groupId}`;
}

export function setSlug(g: Pick<TcgcsvGroup, "name" | "abbreviation" | "groupId">): string {
  const code = setCode(g);
  const kind = setKind(g);
  // Booster sets are searched by code and name ("op01 romance dawn"); the
  // others by name alone, which already carries their number.
  const base = kind === "booster" || kind === "extra" || kind === "premium" ? `${code} ${setDisplayName(g)}` : setDisplayName(g);
  return slugify(base) || `set-${g.groupId}`;
}

// ── Cards ────────────────────────────────────────────────────────────────────
export type Printing = "standard" | "alt" | "manga" | "sp" | "treasure" | "foil" | "reprint" | "promo" | "don";

const ext = (p: TcgcsvProduct): Record<string, string> => {
  const o: Record<string, string> = {};
  for (const e of p.extendedData ?? []) o[e.name] = e.value;
  return o;
};

/** A product is sealed when it has neither a card number nor a rarity. */
export function isSealedProduct(p: TcgcsvProduct): boolean {
  const e = ext(p);
  return !e.Number && !e.Rarity;
}

/** The parenthesised suffixes of a TCGplayer card name, minus number disambiguators. */
export function variantTokens(name: string, number: string | null): string[] {
  const out: string[] = [];
  // Parentheses carry the printing; square brackets carry a placing ("[Winner]").
  for (const m of name.matchAll(/\(([^()]+)\)|\[([^[\]]+)\]/g)) {
    const t0 = (m[1] ?? m[2]).trim();
    const t = t0;
    if (/^\d{3}$/.test(t)) continue; // "(003)" — TCGplayer's way to tell two same-named cards apart
    if (number && t.toUpperCase() === number.toUpperCase()) continue;
    if (/^[A-Z]{1,3}\d{0,2}-\d{3}$/i.test(t)) continue; // a card number in parentheses
    out.push(t);
  }
  return out;
}

// A word match, not an exact token: "Red Super Alternate Art" and "Super Leader
// Alternate Art" are alternate arts too.
const ALT = /\b(parallel|alt(?:ernate)? art|full art|wanted poster)\b/i;
const FOIL = /^(jolly roger foil|pirate foil|gold|textured foil|textured|gem|foil)$/i;

export function classifyPrinting(input: { tokens: string[]; rarity: string | null; cardType: string | null }): Printing {
  const t = input.tokens;
  if (input.cardType === "DON!!" || input.rarity === "DON!!") return "don";
  if (input.rarity === "TR" || t.some((x) => /^(TR|treasure rare)$/i.test(x))) return "treasure";
  if (t.some((x) => /^(SP|special card|SP card)$/i.test(x))) return "sp";
  if (t.some((x) => /^manga$/i.test(x))) return "manga";
  if (input.rarity === "PR") return "promo";
  if (t.some((x) => ALT.test(x))) return "alt";
  if (t.some((x) => FOIL.test(x))) return "foil";
  if (t.some((x) => /^reprint$/i.test(x))) return "reprint";
  if (t.length) return "promo"; // an event or product tag ("Judge Pack Vol. 2", "Box Topper")
  return "standard";
}

/** "Monkey.D.Luffy (003) (Parallel)" → "Monkey.D.Luffy". */
export function baseName(name: string): string {
  return name
    .replace(/\s*\([^()]*\)/g, "")
    .replace(/\s*\[[^[\]]*\]/g, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/”|“/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const toInt = (v: string | undefined): number | null => {
  if (v == null) return null;
  const n = parseInt(v.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};
const toList = (v: string | undefined): string[] =>
  v ? v.split(";").map((s) => s.trim()).filter(Boolean) : [];

export interface CatalogCard {
  id: number;
  tcgName: string;
  name: string;
  number: string | null;
  setId: number;
  rarity: string | null;
  variant: string | null;
  printing: Printing;
  colors: string[];
  cardType: string | null;
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  attribute: string | null;
  subtypes: string[];
  effect: string | null;
  tcgplayerUrl: string;
  hasImage: boolean;
  slugBase: string;
}

/**
 * The stamp an event group's cards carry. TCGplayer files the Pre-Release,
 * Release Event and Anniversary Tournament prints under the SAME name and
 * number as the main-set card, so without this tag "Curiel OP16-004" names two
 * products and neither page could say which one it is.
 */
export function eventTag(g: Pick<TcgcsvGroup, "name" | "abbreviation">): string | null {
  const code = (g.abbreviation ?? "").trim().toUpperCase();
  if (/ PRE$/.test(code)) return /super pre-release/i.test(g.name) ? "Super Pre-Release" : "Pre-Release";
  if (/ RE$/.test(code)) return "Release Event";
  if (/ ANN$/.test(code)) {
    const m = /(\d+(?:st|nd|rd|th) Anniversary Tournament)/i.exec(g.name);
    return m ? m[1] : "Anniversary Tournament";
  }
  return null;
}

/**
 * The extra token a printing needs to be told apart from its namesake: the
 * event stamp. Reprints in another set (Premium Booster, Demo Deck) are told
 * apart by their SET, which the matcher reads separately (lib/match.ts).
 */
export function printingTag(g: Pick<TcgcsvGroup, "name" | "abbreviation">): string | null {
  return eventTag(g);
}

/** DON!! cards have no number: the character and finish in their name ARE the variant. */
function donTokens(name: string): string[] {
  return [...name.matchAll(/\(([^()]+)\)/g)].map((m) => m[1].trim()).filter((t) => !/^alternate art$/i.test(t));
}

export function parseCard(p: TcgcsvProduct, setCodeHint?: string, group?: Pick<TcgcsvGroup, "name" | "abbreviation">): CatalogCard {
  const e = ext(p);
  const number = e.Number?.trim() || null;
  const rarity = e.Rarity?.trim() || null;
  const cardType = e.CardType?.trim() || (rarity === "DON!!" ? "DON!!" : null);
  const isDon = cardType === "DON!!" || rarity === "DON!!";
  const tokens = isDon ? donTokens(p.name) : variantTokens(p.name, number).map((t) => (/^TR$/i.test(t) ? "Treasure Rare" : t));
  const tag = !isDon && group ? printingTag(group) : null;
  if (tag && !tokens.some((t) => t.toLowerCase() === tag.toLowerCase())) tokens.push(tag);
  const printing = classifyPrinting({ tokens: isDon ? [] : tokens, rarity, cardType });
  const name = isDon ? "DON!! Card" : baseName(p.name);
  let variant = tokens.length ? tokens.join(" · ") : null;
  if (!variant && printing === "treasure") variant = "Treasure Rare";
  return {
    id: p.productId,
    tcgName: p.name,
    name,
    number,
    setId: p.groupId,
    rarity,
    variant,
    printing,
    colors: toList(e.Color),
    cardType,
    cost: toInt(e.Cost),
    power: toInt(e.Power),
    counter: toInt(e.Counterplus),
    life: toInt(e.Life),
    attribute: e.Attribute ? toList(e.Attribute).join(" / ") : null,
    subtypes: toList(e.Subtypes),
    effect: cleanEffect(e.Description),
    tcgplayerUrl: p.url || `https://www.tcgplayer.com/product/${p.productId}`,
    hasImage: (p.imageCount ?? 1) > 0 && Boolean(p.imageUrl),
    slugBase: slugify([name, number ?? (isDon ? setCodeHint : null), variant].filter(Boolean).join(" ")),
  };
}

/**
 * A character alias TCGplayer writes in parentheses belongs to the NAME:
 * "Mr.3 (Galdino)", "Miss Doublefinger(Zala)", "Gloriosa (Grandma Nyon)". Read as
 * a printing tag it makes the base card a "promo" and leaves the matcher no
 * name word in "Mr.3". An alias is a token that every printing of the number in
 * its own set carries and that is the ONLY token on one of them (its plain
 * print) — so "(Box Topper)", which sits beside an untagged twin, is not one —
 * and that is not printing vocabulary. Folding it also renames the card's
 * reprints elsewhere that carry the alias.
 */
const NOT_AN_ALIAS = /parallel|alt(?:ernate)?\s*art|full art|manga|\bsp\b|special|treasure|\btr\b|foil|reprint|wanted|topper|pack|deck|event|release|tournament|anniversary|vol\b|winner|finalist|participant|promo|edition|collection|box|\d/i;

export function foldNameAliases(cards: CatalogCard[], setCodeOf: (setId: number) => string): void {
  const home = (c: CatalogCard) => {
    const code = setCodeOf(c.setId).toUpperCase().replace(/[^A-Z0-9]/g, "");
    return Boolean(c.number) && code.includes(c.number!.toUpperCase().split("-")[0]);
  };
  const byNumber = new Map<string, CatalogCard[]>();
  for (const c of cards) if (c.number && !c.number.startsWith("P-") && c.printing !== "don") (byNumber.get(c.number) ?? byNumber.set(c.number, []).get(c.number)!).push(c);
  for (const list of byNumber.values()) {
    const own = list.filter(home);
    const tokens = (c: CatalogCard) => (c.variant ? c.variant.split(" · ") : []);
    const alias = own.map(tokens).find((t) => t.length === 1)?.[0];
    if (!alias || NOT_AN_ALIAS.test(alias) || !own.every((c) => tokens(c).includes(alias))) continue;
    for (const c of list) {
      const t = tokens(c);
      if (!t.includes(alias)) continue;
      const rest = t.filter((x) => x !== alias);
      c.name = `${c.name} (${alias})`;
      c.variant = rest.length ? rest.join(" · ") : null;
      c.printing = classifyPrinting({ tokens: rest, rarity: c.rarity, cardType: c.cardType });
      if (!c.variant && c.printing === "treasure") c.variant = "Treasure Rare";
      c.slugBase = slugify([c.name, c.number, c.variant].filter(Boolean).join(" "));
    }
  }
}

// ── Sealed ───────────────────────────────────────────────────────────────────
/** The sealed product type, or null for things we do not price (multi-product "[Set of N]" bundles). */
export function sealedKind(name: string): SealedKind | null {
  const n = name.toLowerCase();
  if (/\[set of \d+\]/.test(n)) return null;
  if (/premium card collection/.test(n)) return "Premium Collection";
  if (/gift collection/.test(n) && !/promotion pack/.test(n)) return /display/.test(n) ? "Display" : "Gift Collection";
  if (/illustration box/.test(n)) return /\bcase\b/.test(n) ? "Display Case" : "Illustration Box";
  if (/tin pack set/.test(n)) return /display case/.test(n) ? "Display Case" : /display/.test(n) ? "Display" : "Tin Pack Set";
  if (/devil fruits collection/.test(n)) return /\bcase\b/.test(n) ? "Display Case" : "Devil Fruits Collection";
  if (/don!! card pack|don!! set/.test(n)) return "DON!! Pack";
  if (/double pack set/.test(n)) return /display case/.test(n) ? "Display Case" : /display/.test(n) ? "Display" : "Double Pack Set";
  if (/(booster|collection|edition) box case|\bbox case\b/.test(n)) return "Booster Case";
  if (/sleeved booster pack/.test(n)) return "Sleeved Booster Pack";
  if (/(starter deck|ultra deck|deck set)/.test(n) && !/participation|winner|battle|bonus pack|party/.test(n)) {
    if (/display case/.test(n)) return "Display Case";
    if (/display/.test(n)) return "Display";
    return "Starter Deck";
  }
  if (
    /tournament pack|winner pack|event pack|judge pack|participation pack|pre-release pack|release event pack|promotion pack|celebration pack|top player pack|dash pack|welcome pack|finalist|treasure campaign|battle pack|revision pack|battle kit|bonus pack|treasure booster set|promo pack/.test(
      n,
    )
  )
    return "Promo Pack";
  if (/booster box|collection box|edition box|\bbox\b \(wave/.test(n) || /extra booster: .* box$/.test(n)) return "Booster Box";
  if (/booster pack|collection pack|edition pack/.test(n) || /extra booster: .* pack$/.test(n)) return "Booster Pack";
  if (/anniversary set|binder|special set|bundle/.test(n)) return "Collection";
  return "Collection";
}

/** Packs inside, only where it is certain. Main booster-set boxes hold 24. */
export function sealedPackCount(kind: SealedKind, setKindOf: SetKind | null): number | null {
  if (kind === "Booster Pack" || kind === "Sleeved Booster Pack") return 1;
  if (kind === "Double Pack Set") return 2;
  if (kind === "Booster Box" && setKindOf === "booster") return 24;
  return null;
}

export interface CatalogSealed {
  id: number;
  name: string;
  setId: number | null;
  kind: SealedKind;
  packCount: number | null;
  imageUrl: string | null;
  tcgplayerUrl: string;
  releasedOn: string | null;
  presale: boolean;
  slugBase: string;
}

export function parseSealed(p: TcgcsvProduct, kindOfSet: SetKind | null, setIsReal: boolean): CatalogSealed | null {
  const kind = sealedKind(p.name);
  if (!kind) return null;
  const name = p.name.replace(/”|“/g, '"').replace(/\s+/g, " ").trim();
  return {
    id: p.productId,
    name,
    setId: setIsReal ? p.groupId : null,
    kind,
    packCount: sealedPackCount(kind, kindOfSet),
    imageUrl: (p.imageCount ?? 1) > 0 && p.imageUrl ? largeImage(p.productId) : null,
    tcgplayerUrl: p.url || `https://www.tcgplayer.com/product/${p.productId}`,
    releasedOn: p.presaleInfo?.releasedOn?.slice(0, 10) ?? null,
    presale: Boolean(p.presaleInfo?.isPresale),
    slugBase: slugify(name),
  };
}

// ── Images ───────────────────────────────────────────────────────────────────
export function largeImage(productId: number): string {
  return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`;
}

// ── Prices ───────────────────────────────────────────────────────────────────
export const toCents = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null;

/**
 * TCGplayer's own price rows for one product. A product usually has one
 * subtype (Normal or Foil); when it has both, the one with a market price wins
 * (the other is a stray listing in the wrong finish).
 */
export function pickPrice(rows: TcgcsvPrice[]): { lowCents: number | null; marketCents: number | null; finish: string | null } {
  if (!rows.length) return { lowCents: null, marketCents: null, finish: null };
  const ranked = [...rows].sort((a, b) => {
    const am = toCents(a.marketPrice) != null ? 1 : 0;
    const bm = toCents(b.marketPrice) != null ? 1 : 0;
    if (am !== bm) return bm - am;
    return (toCents(b.marketPrice) ?? 0) - (toCents(a.marketPrice) ?? 0);
  });
  const r = ranked[0];
  const marketCents = toCents(r.marketPrice);
  return { lowCents: plausibleLow(toCents(r.lowPrice), marketCents), marketCents, finish: r.subTypeName || null };
}

/**
 * A "low" far under the card's own market price is a damaged copy or a
 * mis-listing more often than a deal, and it would become the headline. Under
 * 25% of a market price above $5 is dropped (the market price still shows).
 */
export function plausibleLow(lowCents: number | null, marketCents: number | null): number | null {
  if (lowCents == null) return null;
  if (marketCents != null && marketCents >= 500 && lowCents < marketCents * 0.25) return null;
  return lowCents;
}

/**
 * Stable, unique slugs. A product keeps the slug it was first given forever; a
 * new one takes its base slug, or base + id when that is taken.
 */
export function assignSlugs(items: { id: number; slugBase: string }[], existing: Map<number, string>): Map<number, string> {
  const out = new Map<number, string>();
  const taken = new Set<string>(existing.values());
  for (const [id, slug] of existing) out.set(id, slug);
  for (const p of [...items].sort((a, b) => a.id - b.id)) {
    if (out.has(p.id)) continue;
    const base = p.slugBase || `card-${p.id}`;
    const slug = taken.has(base) ? `${base}-${p.id}` : base;
    taken.add(slug);
    out.set(p.id, slug);
  }
  return out;
}
