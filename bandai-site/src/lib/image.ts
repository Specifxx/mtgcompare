// TCGplayer's CDN serves every product photo at fixed widths; the catalogue
// stores the 200w URL. 400w (~40 KB) is plenty for a card page.
export function imageAt(url: string | null | undefined, size: "200w" | "400w" | "in_1000x1000" = "400w"): string | null {
  if (!url) return null;
  return url.replace(/_200w\.jpg$/, `_${size}.jpg`);
}
