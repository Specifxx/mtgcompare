// Sort and filter on every listing (owner, 2026-11-23 UX review, P0 3 and 4). Each product card carries its facts as data
// attributes (ProductCard: data-gp price, data-gk per pack, data-gu % under the median, data-gn release date, data-gs set,
// data-ge era, data-gl language); GridControls reorders and hides the cards in the browser. The server HTML keeps one order
// (cheapest first), so crawlers and the first paint see one continuous list. Pure, for the tests.
export type GridSort = "price" | "price-desc" | "pack" | "under" | "new";
export const GRID_SORTS: { key: GridSort; label: string }[] = [
  { key: "price", label: "Price: low to high" },
  { key: "price-desc", label: "Price: high to low" },
  { key: "pack", label: "Price per pack" },
  { key: "under", label: "% under median" },
  { key: "new", label: "Newest set" },
];

export interface GridItem {
  i: number; // the server order
  price: number | null;
  pack: number | null;
  under: number | null; // percent under the median, positive = cheaper
  date: string | null;
  set: string;
  era: string;
  lang: string;
}

export interface GridFilter {
  set?: string;
  era?: string;
  lang?: string;
  /** [min, max) in cents; max null = no top. */
  band?: [number, number | null] | null;
}

export function gridKeep(it: GridItem, f: GridFilter): boolean {
  if (f.set && it.set !== f.set) return false;
  if (f.era && it.era !== f.era) return false;
  if (f.lang && it.lang !== f.lang) return false;
  if (f.band) {
    if (it.price == null) return false;
    if (it.price < f.band[0]) return false;
    if (f.band[1] != null && it.price >= f.band[1]) return false;
  }
  return true;
}

/** Items with no value for the chosen sort go last, in server order. */
export function gridOrder(items: readonly GridItem[], sort: GridSort): GridItem[] {
  const val = (it: GridItem): number | null => {
    switch (sort) {
      case "price":
        return it.price;
      case "price-desc":
        return it.price == null ? null : -it.price;
      case "pack":
        return it.pack;
      case "under":
        return it.under == null || it.under <= 0 ? null : -it.under;
      case "new":
        return it.date ? -Date.parse(it.date) : null;
    }
  };
  return [...items].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va == null && vb == null) return a.i - b.i;
    if (va == null) return 1;
    if (vb == null) return -1;
    return va - vb || a.i - b.i;
  });
}

/** Price bands in the market's own currency (cents): under 50, 50-100, 100-250, 250-500, 500 and up. */
export const PRICE_BANDS: [number, number | null][] = [
  [0, 5000],
  [5000, 10000],
  [10000, 25000],
  [25000, 50000],
  [50000, null],
];
