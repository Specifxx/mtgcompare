// The hub pages' words: the set page, the type page, the sets index, the release calendar and the stores directory. Titles,
// descriptions, intros and fact lists, built ONLY from sets.ts (names, series, English release dates), packs.ts (packs per
// product), rrp.ts (US MSRP, always printed with RRP_NOTE), type-about.ts and the current ProductStat / StoreStat rows a page
// has already loaded. Nothing here invents a date, a count or a claim, and nothing talks about the past: "today", "right now".
// Release state is release.ts's isPreorderSet, the one date rule the whole site uses. Pure: no database and no React, so
// tests/hubs.test.ts checks every variant against BANNED_COPY and the title rule.
import type { ProductCardData } from "./data";
import { cardOpen } from "./compact";
import { money, plural, relativeDay } from "./format";
import { packsFor, packsForLabel, perPackCents } from "./packs";
import { cheapestPerPackByType, PACK_TYPES, type PerPackPick } from "./per-pack";
import { formatRelease, isPreorderSet } from "./release";
import type { RegionInfo } from "./regions";
import { usMsrpCents } from "./rrp";
import { PRODUCT_TYPES, type ProductTypeInfo, type TypeKey } from "./sealed-title";
import { withPokemon } from "./seo";
import { SERIES_ORDER, SETS, type PokemonSet } from "./sets";
import { OFFER_STALE_MS } from "./sealed-offers";
import { SITE_NAME } from "./site";

// ─── Titles ────────────────────────────────────────────────────────────────────
// The root layout's template adds " | DexCompare". A title that would run past 65 characters with it goes out as
// title.absolute (no suffix), so the words that rank (the set, the region, the date) are the ones a results page keeps.

export const TITLE_SUFFIX = ` | ${SITE_NAME}`;
export const TITLE_MAX = 65;

/** A page title as Next's Metadata takes it: the plain string (the template adds the suffix) or `{ absolute }`. */
export type HubTitle = string | { absolute: string };

export function hubTitle(text: string): HubTitle {
  return text.length + TITLE_SUFFIX.length > TITLE_MAX ? { absolute: text } : text;
}

/** The words of a title, without the suffix (og:title, twitter:title). */
export function titleText(t: HubTitle): string {
  return typeof t === "string" ? t : t.absolute;
}

/** What the browser tab and a results page show. */
export function renderedTitle(t: HubTitle): string {
  return typeof t === "string" ? `${t}${TITLE_SUFFIX}` : t.absolute;
}

// ─── Dates ─────────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "6 Nov 2026" for a YYYY-MM-DD date. Spelt out by hand, not through Intl: ICU's en-GB short month for September is now
 * "Sept", and a title must not change with the server's ICU version.
 */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** The UTC calendar day release.ts compares against: "2026-10-14". */
export function isoDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** "Pre-order · out in 23 days" / "Out tomorrow" / "Released 16 Sep 2026": the set's release chip. */
export function releaseChip(set: Pick<PokemonSet, "code" | "releaseDate">, now: Date = new Date()): string {
  if (!isPreorderSet(set.code, now)) return `Released ${shortDate(set.releaseDate)}`;
  const rel = relativeDay(set.releaseDate, isoDay(now)); // "in 23 days" | "tomorrow"
  return `Pre-order · out ${rel}`;
}

// ─── Set pages ─────────────────────────────────────────────────────────────────

/**
 * A set page's title, by release state. Upcoming: the pre-order wording and the date, the query people type before a set is
 * out. Sold without a 36-pack booster box (sets.ts noBoosterBox): never "booster box". Otherwise the box first.
 */
export function setTitle(set: PokemonSet, r: Pick<RegionInfo, "inName">, now: Date = new Date()): HubTitle {
  const name = withPokemon(set.name);
  if (isPreorderSet(set.code, now)) {
    const what = set.noBoosterBox ? "ETB & sealed" : "booster box & ETB";
    return hubTitle(`${name} pre-orders: ${what} prices in ${r.inName} (out ${shortDate(set.releaseDate)})`);
  }
  if (set.noBoosterBox) return hubTitle(`${name} ETB, bundle & sealed prices in ${r.inName}`);
  return hubTitle(`${name} booster box, ETB & sealed prices in ${r.inName}`);
}

/** The cheapest pack across the types (the set page's "Cheapest way in"), or null when nothing open has a fixed pack count. */
export function cheapestWayIn(products: ProductCardData[]): PerPackPick | null {
  let best: PerPackPick | null = null;
  for (const pick of cheapestPerPackByType(products)) if (!best || pick.perPack < best.perPack) best = pick;
  return best;
}

/** The lowest open price among the products, or null. */
export function lowestOpen(products: ProductCardData[]): number | null {
  let low: number | null = null;
  for (const p of products) if (cardOpen(p) && p.lowestPriceCents != null && (low == null || p.lowestPriceCents < low)) low = p.lowestPriceCents;
  return low;
}

/** '{n} products, {m} in stock; cheapest per pack: {type} at {money}; released {date}' — from the products the page loaded. */
export function setDescription(set: PokemonSet, r: Pick<RegionInfo, "inName" | "market">, products: ProductCardData[], now: Date = new Date()): string {
  const pre = isPreorderSet(set.code, now);
  const name = withPokemon(set.name);
  const when = `${pre ? "out" : "released"} ${shortDate(set.releaseDate)}`;
  if (!products.length) return `${name} sealed prices in ${r.inName}: no store we track lists it yet; ${when}.`;
  const open = products.filter(cardOpen).length;
  const parts = [`${plural(products.length, "product")}, ${open} ${pre ? "open for pre-order" : "in stock"} today`];
  const way = cheapestWayIn(products);
  if (way) parts.push(`cheapest per pack: ${way.p.productType} at ${money(way.perPack, r.market)} a pack`);
  parts.push(when);
  return `${name} sealed prices in ${r.inName}: ${parts.join("; ")}.`;
}

/** "Elite Trainer Boxes, Booster Bundles and Collections & Boxes": the product types listed, in the site's type order. */
function typeList(products: ProductCardData[], skip: string[] = []): string {
  const labels = new Set(products.map((p) => p.productType));
  const names = PRODUCT_TYPES.filter((t) => labels.has(t.label) && !skip.includes(t.label)).map((t) => t.plural);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The set page's generated intro: two or three plain sentences from sets.ts and the products loaded for the region, never a
 * claim the data cannot back (no pull rates, no value talk, no history).
 */
export function setIntro(set: PokemonSet, r: Pick<RegionInfo, "inName" | "adjective" | "market">, products: ProductCardData[], now: Date = new Date()): string[] {
  const pre = isPreorderSet(set.code, now);
  const name = withPokemon(set.name);
  const date = formatRelease(set.releaseDate);
  const out: string[] = [];
  out.push(
    pre
      ? `${name} is an upcoming ${set.series} series set, out in English on ${date} (${relativeDay(set.releaseDate, isoDay(now))}).`
      : `${name} is a ${set.series} series set, released in English on ${date}.`,
  );
  const open = products.filter(cardOpen).length;
  const low = lowestOpen(products);
  if (!products.length) {
    out.push(`No ${r.adjective} store we track lists its sealed product yet: this page fills in as soon as one does.`);
  } else if (pre) {
    out.push(
      `${r.adjective} stores we track list ${plural(products.length, "sealed product")} from it, and ${open} ${open === 1 ? "is" : "are"} open for pre-order today${low != null && open ? `, from ${money(low, r.market)}` : ""}. Stores may ship pre-orders a few days either side of the release date.`,
    );
  } else {
    out.push(
      `${r.adjective} stores we track list ${plural(products.length, "sealed product")} from it, and ${open} ${open === 1 ? "is" : "are"} in stock today${low != null && open ? `, from ${money(low, r.market)}` : ""}.`,
    );
  }
  if (set.noBoosterBox) {
    const types = typeList(products, ["Booster Box", "Booster Box Case"]);
    out.push(`It was not sold as a 36-pack booster box${types ? `: here its packs come in ${types}` : ""}.`);
  }
  const way = cheapestWayIn(products);
  if (way) {
    out.push(
      `Per pack, the cheapest way in ${pre ? "on pre-order" : "right now"} is the ${way.p.productType}: ${money(way.perPack, r.market)} a pack (${money(way.p.lowestPriceCents, r.market)} for ${way.packs} packs).`,
    );
  }
  return out;
}

export interface SetFact {
  term: string;
  detail: string;
  /** US only: TPCi's list price for this product (rrp.ts); the page prints RRP_NOTE wherever one appears. */
  msrp?: string;
}

/** A set product line's row: its pack count (packs.ts) and, in the US, its MSRP (rrp.ts). */
function lineFact(set: PokemonSet, key: TypeKey, label: string, market?: string): SetFact | null {
  const packs = packsFor(key, set.code);
  if (!packs) return null;
  const msrp = market === "US" ? usMsrpCents(key, set.code) : null;
  return { term: label, detail: plural(packs, "booster pack"), ...(msrp != null ? { msrp: money(msrp, "US") } : {}) };
}

/**
 * The 'Set facts' list: series, English release date, the booster box (or that there is none: sets.ts noBoosterBox), and the
 * packs inside an ETB, a Pokémon Center ETB and a booster bundle (packs.ts). `listed` is the product types the region lists for
 * the set: given, a product line is only described when it is actually listed, so the page never implies a product exists that
 * no store has (Detective Pikachu had no ETB). `market` "US" adds TPCi's MSRP to each line rrp.ts knows.
 */
export function setFacts(set: PokemonSet, listed?: Iterable<string>, market?: string, now: Date = new Date()): SetFact[] {
  const types = listed ? new Set(listed) : null;
  const has = (label: string) => !types || types.has(label);
  const pre = isPreorderSet(set.code, now);
  const facts: SetFact[] = [
    { term: "Series", detail: set.series },
    { term: "English release", detail: `${formatRelease(set.releaseDate)}${pre ? " (pre-order)" : ""}` },
  ];
  if (set.noBoosterBox) facts.push({ term: "Booster box", detail: "Not sold as a 36-pack booster box" });
  else {
    const box = lineFact(set, "booster-box", "Booster box", market);
    if (box) facts.push(box);
  }
  if (has("Elite Trainer Box")) {
    const etb = lineFact(set, "etb", "Elite Trainer Box", market);
    if (etb) facts.push(etb);
  }
  if (has("Pokémon Center Elite Trainer Box")) {
    const pc = lineFact(set, "pc-etb", "Pokémon Center ETB", market);
    if (pc) facts.push(pc);
  }
  if (types?.has("Booster Bundle")) {
    const bundle = lineFact(set, "booster-bundle", "Booster bundle", market);
    if (bundle) facts.push(bundle);
  }
  return facts;
}

/** The sets either side in SETS order (newest first): `prev` released before this one, `next` after it. */
export function prevNextSet(code: string): { prev: PokemonSet | null; next: PokemonSet | null } {
  const i = SETS.findIndex((s) => s.code === code);
  if (i < 0) return { prev: null, next: null };
  return { prev: SETS[i + 1] ?? null, next: SETS[i - 1] ?? null };
}

// ─── Type pages ────────────────────────────────────────────────────────────────

/** "Pokémon Booster Boxes", "Pokémon Center Elite Trainer Boxes" (never "Pokémon Pokémon Center…"). */
export function typeName(t: Pick<ProductTypeInfo, "plural">): string {
  return withPokemon(t.plural);
}

/** `${typeName} in ${inName} — from ${money}, ${n} in stock`; with nothing open, the plain "prices & stock". */
export function typeTitle(t: Pick<ProductTypeInfo, "plural">, r: Pick<RegionInfo, "inName" | "market">, open: number, from: number | null): HubTitle {
  const name = typeName(t);
  if (open > 0 && from != null) return hubTitle(`${name} in ${r.inName} — from ${money(from, r.market)}, ${open} in stock`);
  return hubTitle(`${name} in ${r.inName} — prices & stock`);
}

/** The type page's description: live counts, the type's own capitals kept ("Pokémon Center Elite Trainer Boxes"). */
export function typeDescription(
  t: Pick<ProductTypeInfo, "plural">,
  r: Pick<RegionInfo, "inName" | "market" | "adjective" | "currency">,
  c: { open: number; total: number },
  from: number | null,
): string {
  const where = `${r.adjective} stores${r.market === "US" ? " and TCGplayer" : ""}`;
  const now = c.open > 0 && from != null ? `${c.open} in stock today from ${money(from, r.market)}, cheapest first` : "none in stock today";
  return `${typeName(t)} compared across ${where}: ${now}, with ${plural(c.total, "product")} listed in ${r.inName}. Prices in ${r.currency}.`;
}

/** The deals page section a type's "See deals" link lands on (the deals page has these anchors, and #more for the rest). */
export function dealsAnchor(slug: string): string {
  return ["booster-boxes", "elite-trainer-boxes", "booster-bundles", "collections"].includes(slug) ? slug : "more";
}

export interface PerPackRow {
  p: ProductCardData;
  packs: number;
  perPack: number;
}

/** A pack type's top rows by price per pack, from the open products the page loaded (cheapest first). Empty for other types. */
export function typePerPackRows(label: string, open: ProductCardData[], take = 5): PerPackRow[] {
  if (!PACK_TYPES.includes(label)) return [];
  const rows: PerPackRow[] = [];
  for (const p of open) {
    if (!cardOpen(p) || p.productType !== label) continue;
    const packs = packsForLabel(p.productType, p.setCode, p.name);
    const perPack = perPackCents(p.lowestPriceCents, packs);
    if (packs && perPack != null) rows.push({ p, packs, perPack });
  }
  return rows.sort((a, b) => a.perPack - b.perPack || (a.p.lowestPriceCents ?? 0) - (b.p.lowestPriceCents ?? 0)).slice(0, take);
}

/** "36 booster packs" / "8 to 10 booster packs, depending on the set": packs.ts over every set in SETS, or null when it varies by product. */
export function typePacksFact(key: TypeKey): string | null {
  const counts = new Set<number>();
  for (const s of SETS) {
    const n = packsFor(key, s.code);
    if (n) counts.add(n);
  }
  if (!counts.size) return null;
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return min === max ? plural(min, "booster pack") : `${min} to ${max} booster packs, depending on the set`;
}

/** US only: TPCi's MSRP for the type, by series ("$49.99 for Mega Evolution and Scarlet & Violet sets"), or null. Print RRP_NOTE with it. */
export function typeMsrpFact(key: TypeKey, market: string): string | null {
  if (market !== "US") return null;
  const bySeries = new Map<number, string[]>();
  for (const series of SERIES_ORDER) {
    const code = SETS.find((s) => s.series === series)?.code;
    const cents = code ? usMsrpCents(key, code) : null;
    if (cents != null) (bySeries.get(cents) ?? bySeries.set(cents, []).get(cents)!).push(series);
  }
  if (!bySeries.size) return null;
  return [...bySeries].map(([cents, series]) => `${money(cents, "US")} for ${series.join(" and ")} sets`).join("; ");
}

// ─── Sets index and release calendar ──────────────────────────────────────────

export function setsIndexTitle(r: Pick<RegionInfo, "inName">): HubTitle {
  return hubTitle(`Every Pokémon TCG set in order — release dates & sealed prices (${r.inName})`);
}

/** Every set in SETS, grouped by series in SERIES_ORDER, newest first within each. */
export function setsBySeries(): { series: string; sets: PokemonSet[] }[] {
  return SERIES_ORDER.map((series) => ({ series, sets: SETS.filter((s) => s.series === series) })).filter((g) => g.sets.length > 0);
}

/** The oldest year SETS covers ("English-language sets from XY (2014) on"). */
export function firstSetYear(): number {
  return Math.min(...SETS.map((s) => Number(s.releaseDate.slice(0, 4))));
}

export function releasesTitle(r: Pick<RegionInfo, "inName">, year: number): HubTitle {
  return hubTitle(`Pokémon TCG release dates ${year} — upcoming sets & pre-orders (${r.inName})`);
}

/** The next set to release (the earliest one not out yet), or null when every announced set is out. */
export function nextSet(now: Date = new Date()): PokemonSet | null {
  let next: PokemonSet | null = null;
  for (const s of SETS) if (isPreorderSet(s.code, now) && (!next || s.releaseDate < next.releaseDate)) next = s;
  return next;
}

/** The sets whose English release falls in `year`, newest first (SETS order). */
export function setsOfYear(year: number): PokemonSet[] {
  return SETS.filter((s) => s.releaseDate.startsWith(`${year}-`));
}

// ─── Stores ────────────────────────────────────────────────────────────────────

/** A store page is worth indexing only when the store lists something and is not dormant; otherwise noindex, and no sitemap URL. */
export function storeIndexable(st: { listed: number; dormant: boolean } | null | undefined): boolean {
  return !!st && st.listed > 0 && !st.dormant;
}

export function storesTitle(r: Pick<RegionInfo, "inName">, n: number): HubTitle {
  return hubTitle(`Where to buy Pokémon cards online in ${r.inName} — ${n} stores compared`);
}

export function storesDescription(r: Pick<RegionInfo, "inName" | "adjective" | "currency">, n: number): string {
  return `${n} ${r.adjective} stores that sell Pokémon TCG sealed online, compared: who has the most in stock today, when we last read each one, and their prices in ${r.currency}.`;
}

export interface StoreRank {
  key: string;
  name: string;
  inStock: number;
  listed: number;
  lastOkAt: Date | null;
}

/**
 * The stores with the most Pokémon sealed in stock, from StoreStat as the page loaded it: only stores read within the last
 * 72 hours (sealed-offers.ts OFFER_STALE_H, after which the site says "Not checked recently") with something in stock.
 */
export function topStores<T extends StoreRank>(rows: T[], take = 10, now: number = Date.now()): T[] {
  return rows
    .filter((s) => s.inStock > 0 && s.lastOkAt && now - s.lastOkAt.getTime() <= OFFER_STALE_MS)
    .sort((a, b) => b.inStock - a.inStock || a.name.localeCompare(b.name))
    .slice(0, take);
}
