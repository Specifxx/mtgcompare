// src/lib/images.ts (owner WP01a, FROZEN). Image URLs are DERIVED, never stored. FRONT: the TCGplayer image of the PRICED productId first (the image and the price share one id, so a wrong join cannot put the wrong art
// beside a price, and a showcase/extended/serialized/stamped product shows its own scan); Scryfall is the fallback (367 of 111,839 included singles have no TCGplayer image) and the only source of back faces.
// NEXT_PUBLIC_IMAGE_PRIMARY=scryfall flips the order (owner decision 10.4). Scryfall's image rules bind only Scryfall URLs: hotlink unmodified, never through the Next image optimiser, object-contain in an exact 488:680 box, no filter or overlay on the image.
import { CARD_FLAGS } from "./constants";

export interface ImageRef { id: number; scryId: string | null; flags: number }
export type ImageSize = "thumb" | "tile" | "large" | "og";   // "og": a JPEG for share images (satori decodes JPEG and PNG, never WebP: src/lib/og/art.ts)
const TCG_CDN = "https://tcgplayer-cdn.tcgplayer.com/product";
export const tcgplayerImage = (productId: number, size: "200w" | "400w" | "in_1000x1000"): string => `${TCG_CDN}/${productId}_${size}.jpg`;
/** https://cards.scryfall.io/<variant>/<face>/<id[0]>/<id[1]>/<id>.<ext> (pattern verified on all 118,439 rows that have an image; no ?ts needed). thumb 146x204, grid 488x680, display 672x936 are webp; normal/large are jpg. */
export function scryfallImage(sid: string, variant: "thumb" | "grid" | "display" | "normal" | "large", face: "front" | "back" = "front"): string {
  const ext = variant === "thumb" || variant === "grid" || variant === "display" ? "webp" : "jpg";
  return `https://cards.scryfall.io/${variant}/${face}/${sid[0]}/${sid[1]}/${sid}.${ext}`;
}
/** OP's id-only signatures, kept (27 files): the TCGplayer product image. A caller that has a CardLite uses imageFor() instead, which can fall back. */
export const cardImage = {
  thumb: (id: number) => tcgplayerImage(id, "200w"),
  tile: (id: number) => tcgplayerImage(id, "400w"),
  large: (id: number) => tcgplayerImage(id, "in_1000x1000"),
};
const SCRY_VARIANT: Record<ImageSize, "thumb" | "grid" | "display" | "normal"> = { thumb: "thumb", tile: "grid", large: "display", og: "normal" };   // og -> normal (488x680 JPEG)
const TCG_SIZE: Record<ImageSize, "200w" | "400w" | "in_1000x1000"> = { thumb: "200w", tile: "400w", large: "in_1000x1000", og: "400w" };
export const IMAGE_PRIMARY: "tcgplayer" | "scryfall" = process.env.NEXT_PUBLIC_IMAGE_PRIMARY === "scryfall" ? "scryfall" : "tcgplayer";
/** Front image: primary host first, the other as fallback; null when neither exists (render the neutral card back, never a broken image). */
export function imageFor(c: ImageRef, size: ImageSize, primary: "tcgplayer" | "scryfall" = IMAGE_PRIMARY): string | null {
  const tcg = (c.flags & CARD_FLAGS.TCGIMG) !== 0 ? tcgplayerImage(c.id, TCG_SIZE[size]) : null;
  const scry = (c.flags & CARD_FLAGS.SCRYIMG) !== 0 && c.scryId ? scryfallImage(c.scryId, SCRY_VARIANT[size]) : null;
  return primary === "scryfall" ? scry ?? tcg : tcg ?? scry;
}
/** Back face of a transform / modal_dfc / reversible_card (flags & DFC): Scryfall only. */
export function backImageFor(c: ImageRef, size: ImageSize): string | null {
  return (c.flags & CARD_FLAGS.DFC) !== 0 && (c.flags & CARD_FLAGS.SCRYIMG) !== 0 && c.scryId ? scryfallImage(c.scryId, SCRY_VARIANT[size], "back") : null;
}
/** Does this card have ANY front image (either host)? `CardLite.hasImage` is derived from this and nothing else (critique 15: it used to look at TCGIMG only, so a product with only a Scryfall scan showed a placeholder in every component that gates on hasImage). */
export const hasImageFor = (c: ImageRef): boolean => imageFor(c, "thumb") != null;
