import type { CardLite, Catalog } from "../data";

export const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** Cards you can pull from retail product: not promos, DON!! or event prints. */
export function packPullable(cat: Catalog): CardLite[] {
  return cat.cards.filter((c) => {
    const k = cat.setById.get(c.setId)?.kind;
    return (k === "booster" || k === "extra" || k === "premium") && c.printing !== "promo" && c.printing !== "don";
  });
}

export function byMarketDesc(a: CardLite, b: CardLite): number {
  return (b.marketUsd ?? -1) - (a.marketUsd ?? -1);
}

export function medianOf(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}
