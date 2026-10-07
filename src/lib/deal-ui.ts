// Deal Finder and Today's Top Deals bits the BROWSER needs, with no imports:
// the store picker's label and the homepage's budget tabs. Kept out of
// lib/deals.ts so a client bundle never pulls the store registry in with them.
import type { Country } from "./country";
import type { DealSource } from "./deals";

// ── Homepage budget tabs (RiftCompare's TIER_THRESHOLDS) ─────────────────────
export type BudgetTier = "all" | "small" | "mid" | "big";
export const TIER_THRESHOLDS: Record<Country, { small: number; mid: number }> = {
  AU: { small: 800, mid: 4000 },
  US: { small: 500, mid: 2500 },
  UK: { small: 400, mid: 2000 },
  SG: { small: 700, mid: 3500 },
  CA: { small: 700, mid: 3500 },
  EU: { small: 500, mid: 2500 },
};

export function inTier(cents: number, tier: BudgetTier, t: { small: number; mid: number }): boolean {
  if (tier === "all") return true;
  if (tier === "small") return cents <= t.small;
  if (tier === "mid") return cents <= t.mid;
  return cents > t.mid;
}

/** "All": cheap and pricey interleaved, cheap first, each bucket in its own order. */
export function mixByTier<T extends { priceCents: number }>(items: readonly T[], mid: number): T[] {
  const cheap = items.filter((d) => d.priceCents <= mid);
  const pricey = items.filter((d) => d.priceCents > mid);
  const out: T[] = [];
  for (let i = 0; i < cheap.length || i < pricey.length; i++) {
    if (i < cheap.length) out.push(cheap[i]);
    if (i < pricey.length) out.push(pricey[i]);
  }
  return out;
}

/** The store picker's button label for a selection (RiftCompare's buyLabel). */
export function buyLabel(selected: readonly string[], sources: readonly DealSource[], defaults: readonly string[]): string {
  if (selected.length === 0) return "None selected";
  const same = (a: readonly string[]) => a.length === selected.length && a.every((k) => selected.includes(k));
  if (same(defaults)) return "Every store" + (defaults.some((k) => sources.find((s) => s.key === k)?.isEbay) ? " + eBay" : "");
  const stores = sources.filter((s) => !s.isEbay).map((s) => s.key);
  if (stores.length > 0 && same(stores)) return "Stores only";
  if (selected.length === 1) return sources.find((s) => s.key === selected[0])?.name ?? "1 source";
  if (selected.length === sources.length) return "All sources";
  return `${selected.length} sources`;
}
