// Product photos are the stores' own, hotlinked (never proxied through Vercel's
// metered image optimiser). Shopify's CDN resizes on request, so grids ask for
// a small rendition instead of the multi-megabyte original. TCGplayer's CDN
// serves fixed square renditions (200, 400, 1000 px): the smallest that covers
// the width is used.
export function thumb(url: string | null | undefined, width = 400): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("//") ? `https:${url}` : url);
    if (/(^|\.)cdn\.shopify\.com$/.test(u.hostname) || u.pathname.includes("/cdn/shop/")) {
      u.searchParams.set("width", String(width));
    }
    const tcg = u.hostname === "tcgplayer-cdn.tcgplayer.com" && u.pathname.match(/^(\/product\/\d+)_in_\d+x\d+\.jpg$/);
    if (tcg) {
      const side = width <= 200 ? 200 : width <= 400 ? 400 : 1000;
      u.pathname = `${tcg[1]}_in_${side}x${side}.jpg`;
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * A srcset of CDN renditions for a responsive <img> (with `sizes`), or null
 * when the host can't resize — then a srcset would just repeat one URL.
 */
export function thumbSet(url: string | null | undefined, widths: number[]): string | null {
  if (!url) return null;
  const first = thumb(url, widths[0]);
  if (!first || first === thumb(url, widths[widths.length - 1])) return null;
  return widths.map((w) => `${thumb(url, w)} ${w}w`).join(", ");
}

/** Grid cards: a phone shows two across, a desktop four of ~280px. */
export const CARD_SIZES = "(min-width: 1024px) 280px, (min-width: 768px) 33vw, 50vw";
