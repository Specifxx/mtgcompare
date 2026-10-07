// The /browse filter URL, as data (RiftCompare's Filters + ActiveFilters):
// which filters are on, how a chip removes one, how a checkbox toggles one,
// and the one canonical query string they all write. The URL stays the only
// source of truth; these are pure so tests/filter-chips.test.ts can pin them.
//
// Multi-value filters are written comma-separated (set=op01-romance-dawn,op02-…)
// but parseBrowse (lib/browse.ts) also reads repeated keys, so an old
// "?color=red&color=blue" link still works and is rewritten on the next change.
import { COLORS, PRINTINGS, RARITIES } from "./constants";

/** The multi-value keys, in the order chips and the URL list them. */
export const MULTI_KEYS = ["set", "color", "rarity", "type", "printing"] as const;
/** Every key the filter panel writes, in canonical URL order. */
export const URL_ORDER = ["q", ...MULTI_KEYS, "priced", "min", "max", "sort", "per"] as const;
export const BROWSE_DEFAULTS: Record<string, string> = { sort: "value", per: "48" };

export type ParamsLike = { getAll(key: string): string[]; get(key: string): string | null };

/** A key's values, CSV and repeated forms merged, de-duplicated, in order. */
export function values(sp: ParamsLike, key: string): string[] {
  const out: string[] = [];
  for (const raw of sp.getAll(key)) for (const v of raw.split(",")) if (v.trim() && !out.includes(v.trim())) out.push(v.trim());
  return out;
}

/**
 * The canonical query: known keys in URL_ORDER, multi-values as one CSV,
 * empty values and defaults dropped, and never `page` (any filter change
 * starts again at page 1). Unknown keys (e.g. utm_*) are kept at the end.
 */
export function canonical(sp: ParamsLike & { keys(): IterableIterator<string> }, defaults: Record<string, string> = BROWSE_DEFAULTS): URLSearchParams {
  const out = new URLSearchParams();
  for (const k of URL_ORDER) {
    const vs = values(sp, k);
    if (!vs.length) continue;
    const v = (MULTI_KEYS as readonly string[]).includes(k) ? vs.join(",") : vs[0];
    if (defaults[k] === v) continue;
    out.set(k, v);
  }
  for (const k of new Set(sp.keys())) {
    if ((URL_ORDER as readonly string[]).includes(k) || k === "page") continue;
    for (const v of sp.getAll(k)) if (v) out.append(k, v);
  }
  return out;
}

/** Flip one value of a multi-value key (case-insensitive match, as parseBrowse reads colours). */
export function toggle(sp: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = new URLSearchParams(sp);
  const cur = values(sp, key);
  const on = cur.some((v) => v.toLowerCase() === value.toLowerCase());
  const list = on ? cur.filter((v) => v.toLowerCase() !== value.toLowerCase()) : [...cur, value];
  next.delete(key);
  if (list.length) next.set(key, list.join(","));
  return next;
}

export interface Chip {
  key: string;
  /** The single value this chip removes; "" removes the whole key (price removes min and max). */
  value: string;
  label: string;
}

export interface ChipLabels {
  /** set slug (or code) → "OP01 Romance Dawn" */
  set?: (slug: string) => string | undefined;
  /** "US$", "A$" … for the price chip */
  symbol: string;
  /** "Australian", "US" … for the "has a listing" chip */
  adjective: string;
}

/** "a US", "a UK", "a European", "an Australian": the article a market adjective takes. */
export function withArticle(adjective: string): string {
  return `${/^(?:[aio]|e(?!u))/i.test(adjective) ? "an" : "a"} ${adjective}`;
}

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Every active filter as a removable chip, in panel order. The search words (q) are not a chip. */
export function activeChips(sp: ParamsLike, labels: ChipLabels): Chip[] {
  const chips: Chip[] = [];
  for (const v of values(sp, "set")) chips.push({ key: "set", value: v, label: labels.set?.(v) ?? v.toUpperCase() });
  for (const v of values(sp, "color")) chips.push({ key: "color", value: v, label: COLORS[title(v) as keyof typeof COLORS]?.label ?? title(v) });
  for (const v of values(sp, "rarity")) chips.push({ key: "rarity", value: v, label: RARITIES[v] ? `${RARITIES[v].label}${RARITIES[v].label === v ? "" : ` (${v})`}` : v });
  for (const v of values(sp, "type")) chips.push({ key: "type", value: v, label: v });
  for (const v of values(sp, "printing")) chips.push({ key: "printing", value: v, label: PRINTINGS[v]?.label ?? v });
  if (sp.get("priced") === "1") chips.push({ key: "priced", value: "", label: `Has ${withArticle(labels.adjective)} listing` });
  const min = values(sp, "min")[0];
  const max = values(sp, "max")[0];
  if (min || max)
    chips.push({
      key: "price",
      value: "",
      label: min && max ? `${labels.symbol}${min}–${labels.symbol}${max}` : min ? `From ${labels.symbol}${min}` : `Up to ${labels.symbol}${max}`,
    });
  return chips;
}

/** The query after removing one chip. */
export function removeChip(sp: URLSearchParams, chip: Pick<Chip, "key" | "value">): URLSearchParams {
  if (chip.key === "price") {
    const next = new URLSearchParams(sp);
    next.delete("min");
    next.delete("max");
    return next;
  }
  if (chip.value && (MULTI_KEYS as readonly string[]).includes(chip.key)) return toggle(sp, chip.key, chip.value);
  const next = new URLSearchParams(sp);
  next.delete(chip.key);
  return next;
}

/** "Clear all": every filter off, but the search words and the chosen sort and page size stay. */
export function clearFilters(sp: ParamsLike): URLSearchParams {
  const next = new URLSearchParams();
  for (const k of ["q", "sort", "per"]) {
    const v = sp.get(k);
    if (v) next.set(k, v);
  }
  return next;
}

/** "5", "5.50", "" — a price box's text, or null when it is not a usable amount. */
export function priceInput(v: string): string | null {
  const t = v.trim().replace(/^(?:[a-z]{1,3})?[$£€]\s*/i, "");
  if (!t) return "";
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? String(Math.round(n * 100) / 100) : null;
}
