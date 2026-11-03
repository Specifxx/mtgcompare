// On-disk form of the model-kit data (SITE.kits), written by
// scripts/import-kits.ts and read by lib/kits.ts: one file, data/public/kits.json.
// Offers are tuples, like the card prices (lib/offer-codec.ts):
//   [store key, cents, flags (1 in stock, 2 pre-order), "handle?variant=id"]
// (a Neto store's ref is the product's path)
import fs from "node:fs";
import path from "node:path";
import { SITE } from "@/site.config";
import { CURRENCY, type Kit, type Offer, type StoreStatus } from "./site-types";

export const KITS_FILE = path.join(process.cwd(), "data", "public", "kits.json");

export type KitOfferTuple = [string, number, number, string];
export interface KitOffer {
  source: string;
  cents: number;
  inStock: boolean;
  preorder?: boolean;
  ref: string;
}
export interface KitFile {
  generatedAt: string;
  kits: Kit[];
  offers: Record<string, KitOfferTuple[]>;
  stores: Record<string, StoreStatus>;
}

export const EMPTY_KIT_FILE: KitFile = { generatedAt: "", kits: [], offers: {}, stores: {} };

export function readKitFile(file = KITS_FILE): KitFile {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as KitFile;
  } catch {
    return EMPTY_KIT_FILE;
  }
}

export const encodeKitOffer = (o: KitOffer): KitOfferTuple => [o.source, o.cents, (o.inStock ? 1 : 0) | (o.preorder ? 2 : 0), o.ref];

const STORES = new Map((SITE.kits?.stores ?? []).map((s) => [s.key, s]));

/** null for a store since removed from the config. */
export function decodeKitOffer(t: KitOfferTuple): Offer | null {
  const store = STORES.get(t[0]);
  if (!store) return null;
  return {
    source: store.key,
    market: store.market,
    currency: CURRENCY[store.market],
    cents: t[1],
    inStock: (t[2] & 1) === 1,
    preorder: (t[2] & 2) === 2 || undefined,
    url: store.platform === "neto" ? `${store.base}/${t[3]}` : `${store.base}/products/${t[3]}`,
    title: "",
  };
}
