// A sealed product's barcode, from TCGplayer's own catalogue (scripts/tcg-barcodes.ts, data/barcodes/tcgplayer.json), joined by
// the product id in its TCGplayer offer's URL. Shown in Quick facts and the Product markup; never guessed from a store title.
import BARCODES from "../../data/barcodes/tcgplayer.json";

const MAP = BARCODES as Record<string, string>;

/** TCGplayer's product id from a tcgplayer.com/product/<id>/… URL. */
export function tcgplayerIdOf(url: string | null | undefined): number | null {
  const m = url?.match(/tcgplayer\.com\/product\/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function barcodeOf(tcgplayerId: number | null): string | null {
  return tcgplayerId == null ? null : (MAP[String(tcgplayerId)] ?? null);
}
