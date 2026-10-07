// TCGplayer's product CDN, the image source for every card and sealed product
// (hotlinked, as TCGCSV's own imageUrl is). Most One Piece scans top out at
// 300×419, so "large" and "tile" are often the same file.
const CDN = "https://tcgplayer-cdn.tcgplayer.com/product";

export const cardImage = {
  thumb: (id: number) => `${CDN}/${id}_200w.jpg`,
  tile: (id: number) => `${CDN}/${id}_400w.jpg`,
  large: (id: number) => `${CDN}/${id}_in_1000x1000.jpg`,
};
