import type { CardLite } from "../data";

export const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

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

/** A card's name with its label, as the posts print it ("Sol Ring (Borderless)"). */
export const cardLabel = (c: Pick<CardLite, "name" | "variant">): string => (c.variant ? `${c.name} (${c.variant})` : c.name);
