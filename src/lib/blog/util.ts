import { finishLabel, type Finish } from "../constants";
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

/** A unit's name as the price tables print it: the card's label, and its finish word when it is Foil (Normal is implicit), as /market/records prints it ("Serra Angel · Foil");
 *  a label that already names the finish ("Borderless · Surge Foil") is not repeated. */
export function unitLabel(c: Pick<CardLite, "name" | "variant" | "flags" | "treat">, finish: Finish): string {
  if (finish !== "F") return cardLabel(c);
  const word = finishLabel(c, "F");
  return c.variant?.includes(word) ? cardLabel(c) : `${cardLabel(c)} · ${word}`;
}

/** The card page of a unit: the Foil tab for a Foil unit (the page's own ?finish=foil), the bare page (headline) otherwise. */
export const unitHref = (slug: string, finish: Finish): string => (finish === "F" ? `/card/${slug}?finish=foil` : `/card/${slug}`);
