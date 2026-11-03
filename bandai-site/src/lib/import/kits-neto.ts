// A Neto (Maropost) shop's public category pages, for the model-kit import:
// each product card names the kit's maker item number (itemprop "mpn", e.g.
// "G5066295"), its title, price and currency, and an "In Stock" or "Out of
// Stock" sign. Pure, so tests/kits.test.ts can feed it a saved card.

export interface NetoCard {
  sku: string;
  title: string;
  cents: number;
  currency: string | null;
  inStock: boolean;
  path: string;
  image: string | null;
}

const attr = (html: string, re: RegExp) => html.match(re)?.[1] ?? null;
const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export function parseNetoCategory(html: string): { cards: NetoCard[]; lastPage: number } {
  const cards: NetoCard[] = [];
  for (const chunk of html.split(/<article\b/).slice(1)) {
    const card = chunk.split(/<\/article>/)[0];
    const sku = attr(card, /itemprop="mpn"\s+content="([^"]+)"/);
    const href = attr(card, /itemprop="name"[^>]*>\s*<a\s+href="([^"]+)"/);
    const title = attr(card, /itemprop="name"[^>]*>\s*<a[^>]*>([^<]+)</);
    const price = attr(card, /itemprop="price"\s+content="([\d.]+)"/);
    if (!sku || !href || !title || !price) continue;
    // The sign after the buying options: "In Stock - <branch>" or "Out of Stock".
    const sign = attr(card, /In stock \/ Out of Stock Sign\s*-->\s*<span[^>]*>([^<]+)</i) ?? "";
    let path: string;
    try {
      path = new URL(href).pathname.replace(/^\//, "");
    } catch {
      continue;
    }
    const img = attr(card, /<img[^>]+src="([^"]+)"[^>]*itemprop="image"/) ?? attr(card, /itemprop="image"[^>]*src="([^"]+)"/);
    cards.push({
      sku,
      title: unescape(title.trim()),
      cents: Math.round(Number(price) * 100),
      currency: attr(card, /itemprop="priceCurrency"\s+content="([A-Z]{3})"/),
      inStock: /^\s*in stock/i.test(sign),
      path,
      image: img ? img.replace(/\?.*$/, "") : null,
    });
  }
  const pages = [...html.matchAll(/[?&]pgnum=(\d+)/g)].map((m) => Number(m[1]));
  return { cards, lastPage: Math.max(1, ...pages) };
}
