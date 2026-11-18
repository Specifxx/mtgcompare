// Helpers a browser component may import (no fs).
export function usd(cents: number): string {
  return `US$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** TCGplayer's own photo of the product, hotlinked in the two sizes the sister sites already show live. */
export function cardImage(id: number, size: 200 | 1000 = 200): string {
  return size === 1000 ? `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_1000x1000.jpg` : `https://tcgplayer-cdn.tcgplayer.com/product/${id}_200w.jpg`;
}

export function shortDate(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export const cardPath = (game: string, set: string, card: string) => `/${game}/${set}/${card}`;
