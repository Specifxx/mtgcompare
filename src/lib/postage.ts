// The postage types Best Basket's solver (lib/basket-optimize.ts) reads, copied from RiftCompare's lib/shipping.ts so the solver file
// stays a straight port. DexCompare fills them from its own measured shipping snapshot (lib/basket-stores.ts); fields only Rift's
// card-letter model sets are kept optional so a port of a solver fix needs no edit here.
export interface PostageCart {
  subtotalCents: number;
  items: number; // physical items in the order at this store
}

export interface PostageOption {
  cents: number;
  label: string;
  tracked: boolean | null;
}

export interface PostageQuote {
  cents: number; // what the order is charged (0 = free)
  label: string;
  tracked: boolean | null;
  basis: "measured" | "estimate";
  free: boolean;
  upTo: boolean; // the figure differs by address: this is the highest
  otherOption?: PostageOption;
  freeFromCents?: number; // the store's measured free-shipping cart, when this order is below it
  beyondMeasured?: boolean; // bigger than any cart measured (more items): "from"
  riskCents?: number; // the optimiser's allowance past the measured size; never shown as postage
  minOrderCents?: number;
  unavailable?: string;
  notServed?: string[];
  unmeasuredRegion?: boolean;
  atLeast?: boolean;
  crossBorder?: string;
  measuredAt?: string; // YYYY-MM-DD
  note?: string;
}
