// The model-kit section's data (SITE.kits): data/public/kits.json, read once
// per server instance, like lib/data.ts. Empty when the site has no kits.
import { SITE } from "@/site.config";
import { MARKETS, type Kit, type Market, type Offer } from "./site-types";
import { decodeKitOffer, readKitFile, type KitFile } from "./kit-store";
import { slugify } from "./slug";

let cache: { file: KitFile; bySlug: Map<string, Kit>; byJan: Map<string, Kit> } | null = null;
function load() {
  if (cache) return cache;
  const file = SITE.kits ? readKitFile() : readKitFile("/nonexistent");
  cache = { file, bySlug: new Map(file.kits.map((k) => [k.slug, k])), byJan: new Map(file.kits.map((k) => [k.jan, k])) };
  return cache;
}

export const kitsOn = () => !!SITE.kits && load().file.kits.length > 0;
export const kits = () => load().file.kits;
export const kitBySlug = (slug: string) => load().bySlug.get(slug) ?? null;
export const kitsUpdatedAt = () => load().file.generatedAt || null;
export const kitStoreStatus = () => load().file.stores;

const decoded = new Map<string, Offer[]>();
/** Every store's offer for a kit, cheapest in-stock first. */
export function kitOffers(jan: string): Offer[] {
  let hit = decoded.get(jan);
  if (!hit) {
    hit = (load().file.offers[jan] ?? []).map(decodeKitOffer).filter((o): o is Offer => !!o);
    decoded.set(jan, hit);
  }
  return hit;
}

/** The cheapest in-stock offer in one market. */
export function kitBest(jan: string, market: Market): Offer | null {
  return kitOffers(jan).find((o) => o.market === market && o.inStock) ?? null;
}

/** Distinct stores with the kit in stock. */
export const kitInStockStores = (jan: string) => new Set(kitOffers(jan).filter((o) => o.inStock).map((o) => o.source)).size;

/** Cheapest in-stock price per market, for tiles (the page picks the
 *  visitor's market client-side). */
export function kitBestByMarket(jan: string): Offer[] {
  const out = new Map<Market, Offer>();
  for (const o of kitOffers(jan)) if (o.inStock && !out.has(o.market)) out.set(o.market, o);
  return MARKETS.map((m) => out.get(m)).filter((o): o is Offer => !!o);
}

// Grades, in the order a builder thinks of them, each a hub page.
export const GRADE_ORDER = ["EG", "HG", "RG", "MG", "MGEX", "PG", "SD", "MGSD", "RE/100", "FM", "HiRM", "Mega Size", "FG", "30 Minutes"];
export const GRADE_LABEL: Record<string, string> = {
  EG: "Entry Grade (EG)",
  HG: "High Grade (HG)",
  RG: "Real Grade (RG)",
  MG: "Master Grade (MG)",
  MGEX: "Master Grade EX (MGEX)",
  PG: "Perfect Grade (PG)",
  SD: "SD Gundam",
  MGSD: "MGSD",
  "RE/100": "RE/100",
  FM: "Full Mechanics",
  HiRM: "Hi-Resolution Model",
  "Mega Size": "Mega Size",
  FG: "First Grade (FG)",
  "30 Minutes": "30 Minutes Missions, Sisters and Fantasy",
};
export const gradeSlug = (g: string) => slugify(g.replace("/", " "));

export interface GradeHub {
  grade: string;
  slug: string;
  label: string;
  items: Kit[];
}
export function gradeHubs(): GradeHub[] {
  const all = kits();
  return GRADE_ORDER.map((g) => ({ grade: g, slug: gradeSlug(g), label: GRADE_LABEL[g] ?? g, items: popular(all.filter((k) => k.grade === g)) })).filter((h) => h.items.length);
}
export const gradeHubBySlug = (slug: string) => gradeHubs().find((h) => h.slug === slug) ?? null;

/** Most stores in stock first, then newest. */
export function popular(list: Kit[]): Kit[] {
  return list
    .map((k) => ({ k, n: kitInStockStores(k.jan) }))
    .sort((a, b) => b.n - a.n || b.k.firstSeen.localeCompare(a.k.firstSeen) || a.k.name.localeCompare(b.k.name))
    .map((x) => x.k);
}

/** Kits first listed in the last `days` days, newest first. */
export function newKits(days = 30, now = Date.now()): Kit[] {
  const since = new Date(now - days * 86_400_000).toISOString().slice(0, 10);
  return kits()
    .filter((k) => k.firstSeen >= since)
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || kitInStockStores(b.jan) - kitInStockStores(a.jan));
}

/** Store keys and names, for the price table. */
export const kitStoreNames = (): Record<string, string> => Object.fromEntries((SITE.kits?.stores ?? []).map((s) => [s.key, s.name]));

/** Shopify's CDN resizes on request (`width=`); a store photo is often 2,000px. */
export function kitImage(url: string, width: number): string {
  try {
    const u = new URL(url.startsWith("//") ? `https:${url}` : url);
    if (/(^|\.)(cdn\.shopify\.com)$/.test(u.hostname) || u.pathname.includes("/cdn/shop/")) u.searchParams.set("width", String(width));
    return u.toString();
  } catch {
    return url;
  }
}

/** A model kit as an eBay ad tile (components/KitAds.tsx): the kit's own box
 *  photo and name; the link is an eBay search for it, so no eBay API call. */
export interface KitAdTile {
  jan: string;
  name: string;
  image: string;
}

export function kitAdTiles(list: Kit[], limit: number): KitAdTile[] {
  return list.filter((k) => k.image).slice(0, limit).map((k) => ({ jan: k.jan, name: k.name, image: kitImage(k.image!, 240) }));
}
