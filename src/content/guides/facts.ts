// The facts the guides print, derived only from the site's sourced tables: pack counts from packs.ts (packsFor), US MSRP from
// rrp.ts (usMsrpCents) and sets from sets.ts. Nothing is typed in by hand here, so a correction to one of those files corrects
// every guide. Pure: no database, no React.
import { packsFor, perPackCents } from "../../lib/packs";
import { usMsrpCents, RRP_AS_OF } from "../../lib/rrp";
import { TYPE_BY_KEY, type TypeKey } from "../../lib/sealed-title";
import { SERIES_ORDER, SETS, type PokemonSet } from "../../lib/sets";

// ─── Sets ──────────────────────────────────────────────────────────────────────

/** Has the set been released by `today` (YYYY-MM-DD)? A set releasing today is out. */
export const isReleased = (s: PokemonSet, today: string): boolean => s.releaseDate <= today;

/** The newest released sets, newest first (SETS is newest first), optionally only those passing `keep`. */
export function newestReleased(today: string, n: number, keep: (s: PokemonSet) => boolean = () => true): PokemonSet[] {
  return SETS.filter((s) => isReleased(s, today) && keep(s)).slice(0, n);
}

/** Sets still to be released, the soonest first. */
export function upcomingSets(today: string): PokemonSet[] {
  return SETS.filter((s) => !isReleased(s, today)).sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
}

/**
 * The Build & Battle guide's candidate sets: the soonest upcoming set (its box is sold at the Prerelease, before release) and the seven
 * newest out. Not every set has a Build & Battle Box (the special sets mostly don't), so the guide shows the ones open in the region.
 */
export function buildBattleSets(today: string): PokemonSet[] {
  return [...upcomingSets(today).slice(0, 1), ...newestReleased(today, 7)];
}

/** Sets sold without a booster box (sets.ts noBoosterBox), newest first. */
export function setsWithoutBox(): PokemonSet[] {
  return SETS.filter((s) => s.noBoosterBox);
}

/** The series that have sets in SETS, newest series first. */
export function seriesList(): string[] {
  return SERIES_ORDER.filter((series) => SETS.some((s) => s.series === series));
}

// ─── Pack counts (packs.ts) ────────────────────────────────────────────────────

/**
 * A type's usual pack count in a series: the count most of the series' sets get from packsFor(). The special sets whose ETB
 * holds a different number (packs.ts ETB_BY_SET) are the exceptions, listed by specialEtbSets(). Null when packsFor() has no
 * count for the series (a Pokémon Center ETB before Sword & Shield, say).
 */
export function seriesPacks(type: TypeKey, series: string): number | null {
  const counts = new Map<number, number>();
  for (const s of SETS) {
    if (s.series !== series) continue;
    const n = packsFor(type, s.code);
    if (n != null) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  let best: number | null = null;
  let most = 0;
  for (const [n, c] of counts) if (c > most) [best, most] = [n, c];
  return best;
}

/** One line of a type's pack counts: the count, and the series it holds for (newest series first). */
export interface SeriesCount {
  packs: number;
  series: string[];
}

/** A type's pack counts grouped by series, the newest series' count first: ETB → 9 (Mega Evolution, Scarlet & Violet), 8 (…). */
export function packsBySeries(type: TypeKey): SeriesCount[] {
  const out: SeriesCount[] = [];
  for (const series of seriesList()) {
    const n = seriesPacks(type, series);
    if (n == null) continue;
    const row = out.find((x) => x.packs === n);
    if (row) row.series.push(series);
    else out.push({ packs: n, series: [series] });
  }
  return out;
}

/** The sets whose Elite Trainer Box differs from their series' usual count, with that count (null: no single count, Celebrations). */
export function specialEtbSets(): { set: PokemonSet; packs: number | null }[] {
  return SETS.map((set) => ({ set, packs: packsFor("etb", set.code) })).filter(({ set, packs }) => packs !== seriesPacks("etb", set.series));
}

/** The pack count every set of the type shares (a booster box: 36), or null when it depends on the series or the product. */
export function fixedPacks(type: TypeKey): number | null {
  const counts = new Set(SETS.map((s) => packsFor(type, s.code)));
  if (counts.size !== 1) return null;
  const [n] = counts;
  return n ?? null;
}

/** How many of one product a case holds: a booster box case's boxes, an ETB case's ETBs (packsFor of the case over packsFor of one). */
export function perCase(caseType: "booster-box-case" | "etb-case", unit: "booster-box" | "etb"): number | null {
  const s = regularSet(seriesList()[0]);
  if (!s) return null;
  const whole = packsFor(caseType, s.code);
  const one = packsFor(unit, s.code);
  return whole && one ? whole / one : null;
}

/** The newest set of a series that has a booster box: a series' ordinary set, for the series' usual counts and list prices. */
export function regularSet(series: string): PokemonSet | null {
  return SETS.find((s) => s.series === series && !s.noBoosterBox) ?? null;
}

/** "Mega Evolution and Scarlet & Violet", "XY, Sun & Moon and Sword & Shield": a list in prose ("or" for one of them). */
export function andList(items: readonly string[], word: "and" | "or" = "and"): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`;
}

/** The counts packs.ts reads from a blister's name (single, 2-pack, 3-pack): the lowest and the highest. */
export function blisterRange(): [number, number] {
  const n = ["Single Pack Blister", "2-Pack Blister", "3-Pack Blister"].map((name) => packsFor("blister", null, name)).filter((x): x is number => x != null);
  return [Math.min(...n), Math.max(...n)];
}

/** The types whose pack count varies from product to product (packs.ts returns null for every set): tins, collections, decks… */
export const VARIES: readonly TypeKey[] = ["upc", "collection", "tin", "deck", "booster-bundle-case"];

// ─── US MSRP (rrp.ts) ──────────────────────────────────────────────────────────

/** The series rrp.ts has US list prices for, newest first. */
export function msrpSeries(): string[] {
  return seriesList().filter((series) => {
    const s = regularSet(series);
    return !!s && usMsrpCents("booster-pack", s.code) != null;
  });
}

export interface MsrpRow {
  type: TypeKey;
  label: string;
  cents: number;
  packs: number | null;
  perPack: number | null;
}

/** A series' US MSRP table: every type rrp.ts prices, in PRODUCT_TYPES order, with its packs (packs.ts) and the price per pack. */
export function msrpRows(series: string): MsrpRow[] {
  const s = regularSet(series);
  if (!s) return [];
  const order: TypeKey[] = ["booster-pack", "sleeved-booster", "booster-box", "booster-bundle", "etb", "pc-etb", "build-battle"];
  const out: MsrpRow[] = [];
  for (const type of order) {
    const cents = usMsrpCents(type, s.code);
    if (cents == null) continue;
    const packs = packsFor(type, s.code);
    out.push({ type, label: TYPE_BY_KEY.get(type)?.label ?? type, cents, packs, perPack: perPackCents(cents, packs) });
  }
  return out;
}

/**
 * The MSRP tables, merged where the series share their list prices: [{ series: ["Mega Evolution", "Scarlet & Violet"], rows }]
 * today (rrp.ts: the same list prices). Two tables when a series' prices differ.
 */
export function msrpTables(): { series: string[]; rows: MsrpRow[] }[] {
  const out: { series: string[]; rows: MsrpRow[] }[] = [];
  for (const series of msrpSeries()) {
    const rows = msrpRows(series);
    const same = out.find((t) => JSON.stringify(t.rows) === JSON.stringify(rows));
    if (same) same.series.push(series);
    else out.push({ series: [series], rows });
  }
  return out;
}

/** RRP_AS_OF ("2026-09") as words: "September 2026". */
export function msrpAsOf(): string {
  return new Date(`${RRP_AS_OF}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The series in reading order ("Scarlet & Violet and Mega Evolution"): oldest first reads more naturally in a sentence. */
export function seriesPhrase(series: readonly string[], word: "and" | "or" = "and"): string {
  return andList([...series].sort((a, b) => SERIES_ORDER.indexOf(b) - SERIES_ORDER.indexOf(a)), word);
}
