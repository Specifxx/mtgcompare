// Pure (no database import): used by the browse page on the server and by
// BrowseGrid in the browser.
import type { ProductCardData } from "./data";
import { SET_BY_CODE } from "./sets";

/**
 * Can you buy it now? At a store (inStockStores, which counts independent
 * stores only) or on TCGplayer (marketplaceOpen, US only). One definition for
 * every card, grid and sort.
 */
export function cardOpen(p: Pick<ProductCardData, "inStockStores" | "marketplaceOpen">): boolean {
  return p.inStockStores > 0 || p.marketplaceOpen;
}

// The browse page ships every product in a region to the browser (filtering
// is client-side, so the page stays one cached render). Tuples instead of
// objects, and Shopify's CDN prefix abbreviated, keep that payload about half
// the size. Expanded again by expandCard() in the client.
//
// `type` is the product type LABEL ("Booster Box"), as ProductCardData holds
// it; the client maps it to a TypeKey (TYPE_BY_LABEL) for the per-pack sort.
// `median` is ProductStat.medianOpenCents (null under two open stores), for
// the "saving vs median" sort and badge.
export type CompactCard = [
  slug: string,
  name: string,
  type: string,
  setCode: string | null,
  img: string | null,
  price: number | null,
  inStock: number,
  listed: number,
  marketplace: 0 | 1,
  median: number | null,
];
const CDN = "https://cdn.shopify.com/s/files/";

export function compactCard(p: ProductCardData): CompactCard {
  const img = p.imageUrl?.startsWith(CDN) ? `~${p.imageUrl.slice(CDN.length)}` : p.imageUrl;
  return [p.slug, p.name, p.productType, p.setCode, img, p.lowestPriceCents, p.inStockStores, p.listedStores, p.marketplaceOpen ? 1 : 0, p.medianOpenCents];
}

export function expandCard(c: CompactCard): ProductCardData {
  const [slug, name, productType, setCode, img, lowestPriceCents, inStockStores, listedStores, marketplace, medianOpenCents] = c;
  return {
    slug,
    name,
    productType,
    setCode,
    imageUrl: img?.startsWith("~") ? `${CDN}${img.slice(1)}` : img,
    lowestPriceCents,
    inStockStores,
    listedStores,
    marketplaceOpen: marketplace === 1,
    medianOpenCents: medianOpenCents ?? null,
    releaseDate: setCode ? SET_BY_CODE.get(setCode)?.releaseDate ?? null : null,
  };
}
