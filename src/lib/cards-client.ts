// The card helpers a browser component may import (lib/cards.ts reads files and is server-only).

export function usd(cents: number): string {
  return `US$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** TCGplayer's own photo of the product (its CDN, hotlinked, never resized by us). */
export function cardImage(id: number, size: 400 | 1000 = 400): string {
  return `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_${size}x${size}.jpg`;
}
