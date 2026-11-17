// The card helpers a browser component may import (lib/cards.ts reads files and is server-only).

export function usd(cents: number): string {
  return `US$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * TCGplayer's own photo of the product (its CDN, hotlinked, never resized by us). Only the two sizes the sister sites already show
 * live: `_200w` (TCGCSV's imageUrl; tiles and suggestions) and `_in_1000x1000` (the card page).
 */
export function cardImage(id: number, size: 200 | 1000 = 200): string {
  return size === 1000 ? `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_1000x1000.jpg` : `https://tcgplayer-cdn.tcgplayer.com/product/${id}_200w.jpg`;
}
