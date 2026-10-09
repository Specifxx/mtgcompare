// /browse and /price-guide: the URL, as data. parseBrowse reads a page's search params into a BrowseQuery; toCardQuery turns that into the CardQuery the browse engine answers
// (data/lists.ts getCardPage). Both are PURE: the engine is in memory behind getCardPage, and nothing here scans a catalogue. Free text (`q`) is not interpreted here either: getCardPage
// hands it to the search planner (src/lib/data/search.ts), which resolves names, a set code and number, finish and treatment words.
//
// The filters, as the URL writes them (src/lib/filter-chips.ts lists them in canonical order):
//   set=mh3,one      sets by slug or code                    color=white,blue / colorless / multicolor, cmode=any|exact|within (default any)
//   identity=wub     commander colour identity               rarity=M,R,U,C (also mythic, rare ...)     type=creature,instant
//   treat=borderless,etched   treatments (ANY of)            finish=nonfoil|foil  (the unit view: every price on the page is that finish's)
//   format=modern    legal or restricted in the format       keyword=flying     min=1&max=20   (US$, TCGplayer MARKET: a low-only unit matches no range)
//   priced=1         has a listing in the visitor's market   sort=value|price-asc|price-desc|newest|number|name|rising|falling|popular   per=24|48|100
//   sort=relevance   "Best match": the DEFAULT when q is set (the card the words name best first, its ordinary printing first, then cheapest first: data/search.ts relevancePage); without q it means value
import { COLORS, COLOR_PAGES, FORMATS, PRIMARY_TYPES, PRIMARY_TYPE_LABEL, RARITY_KEYS, RARITY_SLUGS, TREATMENT_BY_KEY, isRarity, type ColorKey, type Format, type Rarity } from "./constants";
import type { Country } from "./country";
import type { CardQuery, SetLite } from "./data";
import { TRACK_DEFAULTS } from "./track";

export type SearchParams = Record<string, string | string[] | undefined>;

export const SORTS = {
  value: "Most valuable",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  newest: "Newest set first",
  number: "Set & card number",
  name: "Name A–Z",
  rising: "Rising this week",
  falling: "Falling this week",
  popular: "Most played (EDHREC)",
} as const;
export type SortKey = keyof typeof SORTS;
/** The sort of a search the visitor did not sort: relevance ("Best match"). Offered, and the default, only when the URL carries `q`; the engine has no such key (searchCards orders a name search itself when no sort is given). */
export const RELEVANCE = "relevance" as const;
export const RELEVANCE_LABEL = "Best match";
/** The sort options of a list: "Best match" first when there is search text. */
export const sortOptions = (q: string): { value: string; label: string }[] => [...(q ? [{ value: RELEVANCE, label: RELEVANCE_LABEL }] : []), ...Object.entries(SORTS).map(([value, label]) => ({ value, label }))];
/** The sort a list falls back to when the URL names none: relevance for a search, market value otherwise. */
export const defaultSort = (q: string): SortKey | typeof RELEVANCE => (q ? RELEVANCE : "value");
export type ColorMode = "any" | "exact" | "within";

export interface BrowseQuery {
  q: string;
  sets: string[];
  colors: string[];              // COLOR_PAGES words: white blue black red green colorless multicolor
  colorMode: ColorMode;
  identity: string;              // commander identity as letters in WUBRG order ("" = no filter, "c" = colourless)
  rarities: string[];            // RARITY_KEYS letters
  types: string[];               // PRIMARY_TYPES keys
  treats: string[];              // treatment keys
  finish: "N" | "F" | null;      // the unit view
  format: Format | null;
  keyword: string;
  min: number | null;            // USD cents of the TCGplayer MARKET price
  max: number | null;
  priced: boolean;               // a listing in the visitor's own market
  sort: SortKey | typeof RELEVANCE;   // relevance only with q (defaultSort)
  page: number;
  per: number;
}

const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";
const dollars = (v: string): number | null => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];

/** A colour word, a letter or a Title-case name -> its COLOR_PAGES word. */
function colorWord(v: string): string | null {
  const w = v.toLowerCase();
  if ((COLOR_PAGES as readonly string[]).includes(w)) return w;
  const byLetter = (Object.entries(COLORS) as [ColorKey, (typeof COLORS)[ColorKey]][]).find(([, c]) => c.letter.toLowerCase() === w);
  if (byLetter) return byLetter[1].slug;
  return w === "c" ? "colorless" : w === "m" || w === "multi" ? "multicolor" : null;
}
/** A rarity as written: the letter (M R U C S P L T, any case) or the word (mythic, rare ...). */
function rarityKey(v: string): Rarity | null {
  const up = v.toUpperCase();
  if (isRarity(up)) return up;
  const slug = (Object.entries(RARITY_SLUGS) as [Rarity, string][]).find(([, s]) => s === v.toLowerCase());
  return slug ? slug[0] : null;
}
function typeKey(v: string): string | null {
  const w = v.toLowerCase();
  if ((PRIMARY_TYPES as readonly string[]).includes(w)) return w;
  const byLabel = (PRIMARY_TYPES as readonly (keyof typeof PRIMARY_TYPE_LABEL)[]).find((t) => PRIMARY_TYPE_LABEL[t].toLowerCase() === w);
  return byLabel ?? null;
}
/** Letters of a colour identity, in WUBRG order, from "wub", "W,U,B" or "c". */
function identityLetters(v: string): string {
  const s = v.toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return "";
  if (s === "c" || s === "colorless" || s === "colourless") return "c";
  return [...("wubrg")].filter((l) => s.includes(l)).join("");
}

export function parseBrowse(sp: SearchParams): BrowseQuery {
  const sort = one(sp.sort) as SortKey;
  const per = parseInt(one(sp.per), 10);
  const page = parseInt(one(sp.page), 10);
  const finish = one(sp.finish).toLowerCase(), format = one(sp.format).toLowerCase();
  const cmode = one(sp.cmode).toLowerCase(), text = one(sp.q).slice(0, 80);
  return {
    q: text,
    sets: list(sp.set),
    colors: uniq(list(sp.color).map(colorWord).filter((c): c is string => !!c)),
    colorMode: cmode === "exact" || cmode === "within" ? cmode : "any",
    identity: identityLetters(one(sp.identity)),
    rarities: uniq(list(sp.rarity).map(rarityKey).filter((r): r is Rarity => !!r)),
    types: uniq(list(sp.type).map(typeKey).filter((t): t is string => !!t)),
    treats: uniq(list(sp.treat).map((t) => t.toLowerCase()).filter((t) => t in TREATMENT_BY_KEY)),
    finish: finish === "foil" ? "F" : finish === "nonfoil" ? "N" : null,
    format: (FORMATS as readonly string[]).includes(format) ? (format as Format) : null,
    keyword: one(sp.keyword).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40),
    min: dollars(one(sp.min)),
    max: dollars(one(sp.max)),
    priced: one(sp.priced) === "1",
    sort: sort in SORTS ? sort : defaultSort(text.trim()),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 100) : 1,
    per: per === 100 || per === 24 ? per : 48,
  };
}

/** True when the visitor narrowed the list in any way (the "Clear filters" link, the noindex rule, the default floor). */
export function isFiltered(q: BrowseQuery): boolean {
  return !!(q.q || q.sets.length || q.colors.length || q.identity || q.rarities.length || q.types.length || q.treats.length || q.finish || q.format || q.keyword || q.priced || q.min != null || q.max != null);
}

/** A set id no set has: the filter for a set slug that does not exist. */
export const NO_SET = 2_147_483_647;

/** The cheapest a card is for a DEFAULT list to show it: below the index floor a row is THIN (listed, noindex, in no sitemap), and a default view that opens on value would otherwise page through them. A search, a set, a named price or any filter lifts it. */
export const DEFAULT_FLOOR_CENTS = TRACK_DEFAULTS.indexFloorCents;

/**
 * The CardQuery for a BrowseQuery. `sets` is the set list (getSets()) that set slugs and codes are looked up in; an unknown slug filters to nothing rather than to everything. `country` is the visitor's market (the "has a listing here" filter).
 * Free text stays in `q`: getCardPage resolves it.
 */
export function toCardQuery(b: BrowseQuery, sets: readonly SetLite[], country: Country, o: { per?: CardQuery["per"]; floor?: boolean } = {}): Partial<CardQuery> {
  const byKey = new Map<string, SetLite>();
  for (const s of sets) { byKey.set(s.slug, s); byKey.set(s.code.toLowerCase(), s); byKey.set(s.tok.toLowerCase(), s); }
  const setIds = uniq(b.sets.flatMap((k) => { const s = byKey.get(k.toLowerCase()); return s ? [s.id] : []; }));
  const q: Partial<CardQuery> = { page: b.page, per: (o.per ?? b.per) as CardQuery["per"] };
  if (b.sort !== RELEVANCE) q.sort = b.sort;                                          // relevance is no engine key: a search with no sort is ordered by the planner (searchCards)
  if (b.q) q.q = b.q;
  if (b.sets.length) q.setIds = setIds.length ? setIds : [NO_SET];                   // an unknown set matches nothing (canonicalQuery drops an id that is not positive, which would mean every set)
  const letters = b.colors.filter((c) => c !== "colorless" && c !== "multicolor");
  const mask = letters.reduce((m, w) => m | (Object.values(COLORS).find((c) => c.slug === w)?.bit ?? 0), 0);
  if (letters.length) q.colors = { mask, mode: b.colors.includes("colorless") ? "within" : b.colorMode };
  else if (b.colors.includes("colorless")) q.colors = { mask: 0, mode: "colorless" };
  else if (b.colors.includes("multicolor")) q.colors = { mask: 0, mode: "multi" };
  if (b.identity) q.identity = { mask: b.identity === "c" ? 0 : [...b.identity].reduce((m, l) => m | (Object.values(COLORS).find((c) => c.letter.toLowerCase() === l)?.bit ?? 0), 0) };
  if (b.rarities.length) q.rarities = b.rarities as Rarity[];
  if (b.types.length) q.types = b.types;
  if (b.treats.length) q.treats = b.treats;
  if (b.finish) q.finish = b.finish;
  if (b.format) q.format = { key: b.format, playable: true };
  if (b.keyword) q.keyword = b.keyword;
  if (b.min != null) q.minCents = b.min;
  if (b.max != null) q.maxCents = b.max;
  if (b.priced) q.pricedIn = country;
  if (o.floor !== false && q.minCents == null && !b.q && !b.sets.length) q.minCents = DEFAULT_FLOOR_CENTS;
  return q;
}

/** A /browse href with some params changed (null removes). */
export function browseHref(base: SearchParams, change: Record<string, string | null>, path = "/browse"): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (k in change) continue;
    for (const x of Array.isArray(v) ? v : v ? [v] : []) p.append(k, x);
  }
  for (const [k, v] of Object.entries(change)) if (v != null) p.set(k, v);
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

export const RARITY_FILTER: readonly string[] = RARITY_KEYS;
