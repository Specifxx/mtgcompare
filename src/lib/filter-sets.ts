// What the filter panel and the filter chips need of the sets, and nothing more (2026-10-16, DECISIONS.md "The CDN finally caches the public pages").
// BrowseFilters and FilterChips are client components, so every prop is serialized into the page's RSC payload, twice over (the flight data rides in
// the HTML too). They used to get all ~454 SetLite rows (12 fields, ~109 KB) and a label map of every set under two keys (~43 KB) on every /browse,
// /price-guide and /sets/[slug] render, where the chips only ever label the sets the URL names. Server-only helpers: pure, no data reads.
import type { SetLite } from "@/lib/data";
import { values } from "./filter-chips";
import type { SearchParams } from "./browse";

/** The six fields the set checklist reads (grouping by kind, newest first, the checkbox value and its label). */
export type FilterSet = Pick<SetLite, "id" | "slug" | "code" | "name" | "kind" | "releasedOn">;
export const filterSets = (sets: readonly SetLite[]): FilterSet[] => sets.map(({ id, slug, code, name, kind, releasedOn }) => ({ id, slug, code, name, kind, releasedOn }));

/** Chip labels for the sets this URL's `set` filter names (by slug or code, as FilterChips looks them up); a chip for any other value falls back to the value itself. */
export function chipSetLabels(sets: readonly SetLite[], sp: SearchParams): Record<string, string> {
  const raw = sp.set, all = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const wanted = new Set(values({ getAll: (k) => (k === "set" ? all : []), get: () => null }, "set").map((v) => v.toLowerCase()));
  if (!wanted.size) return {};
  const out: Record<string, string> = {};
  for (const x of sets) {
    const label = `${x.name} (${x.code})`;
    if (wanted.has(x.slug.toLowerCase())) out[x.slug] = label;
    if (wanted.has(x.code.toLowerCase())) out[x.code.toLowerCase()] = label;
  }
  return out;
}
