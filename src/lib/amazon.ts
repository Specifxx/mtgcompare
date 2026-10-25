// Amazon Australia (Amazon Associates) links: a MARKETPLACE link, never a store. It is never counted as a store, never ranked
// with the store rows, never "best price", and we show no Amazon price, rating or stock: we do not read Amazon, so the link only
// says "Check price on Amazon AU" (owner, 2026-10-25).
//
// Server-side only: the tag is read from AMAZON_AU_TAG at request time (all the pages that render these links are server
// components). A client component that needs a link gets the built URL as a prop, so no NEXT_PUBLIC variable is required.
//
// Shown in AU, and in NZ and SG (Amazon Australia may ship there; the copy says to check delivery). Never in US, UK, CA or EU.
import ASINS from "@/data/amazon-asins.json";
import { searchTerms, type Placement } from "./affiliate";
import type { Region } from "./regions";

export const AMAZON_DEFAULT_TAG = "compareempire-22";
/** The Amazon links' rel, exactly as the owner specified (no noreferrer). */
export const REL_AMAZON = "sponsored nofollow noopener";
/** The retailer label of Amazon's buy_click (components/OutboundLink.tsx). */
export const AMAZON_RETAILER = "Amazon AU";
/** The FTC / Amazon Associates disclosure, word for word: the footer of every page and beside the Amazon links. */
export const AMAZON_DISCLOSURE = "As an Amazon Associate I earn from qualifying purchases.";
export const AMAZON_CTA = "Check price on Amazon AU";

/** The regions Amazon Australia links appear in. */
export const AMAZON_REGIONS: readonly Region[] = ["au", "nz", "sg"];
export function amazonRegion(region: Region): boolean {
  return AMAZON_REGIONS.includes(region);
}

/** The honest label of the Amazon row per region: Amazon AU at home, "may ship to …; check delivery" elsewhere. */
export function amazonLabel(region: Region): { name: string; note: string } {
  if (region === "nz") return { name: "Amazon Australia (ships to NZ)", note: "Amazon Australia may ship to New Zealand; check delivery before you buy." };
  if (region === "sg") return { name: "Amazon Australia (ships to SG)", note: "Amazon Australia may ship to Singapore; check delivery before you buy." };
  return { name: "Amazon AU", note: "Price and stock are Amazon's own; we do not check them." };
}

/** The Associates tag: AMAZON_AU_TAG, or the default. A tag is letters, digits and dashes; anything else falls back. */
export function amazonTag(env: string | undefined = process.env.AMAZON_AU_TAG): string {
  const v = (env ?? "").trim();
  return /^[A-Za-z0-9-]{1,64}$/.test(v) ? v : AMAZON_DEFAULT_TAG;
}

const ASIN_MAP = ASINS as Record<string, string>;
/** A known ASIN for a product slug (src/data/amazon-asins.json, filled by hand; never guessed). */
export function asinFor(slug: string | null | undefined, map: Record<string, string> = ASIN_MAP): string | null {
  const a = slug ? map[slug] : undefined;
  return a && /^[A-Z0-9]{10}$/.test(a) ? a : null;
}

const MTG_WORD = /\bmtg\b|\bmagic\b/i;

/** The Amazon AU link: the product page (/dp/<ASIN>) when the ASIN is known, else a search for the cleaned name. Direct, no redirect. */
export function amazonUrl(name: string, opts: { slug?: string | null; tag?: string; asins?: Record<string, string> } = {}): string {
  const tag = opts.tag ?? amazonTag();
  const asin = asinFor(opts.slug, opts.asins);
  if (asin) return `https://www.amazon.com.au/dp/${asin}?tag=${encodeURIComponent(tag)}`;
  const terms = searchTerms(name);
  const q = (MTG_WORD.test(terms) ? terms : `MTG ${terms}`).replace(/\s+/g, " ").trim();
  return `https://www.amazon.com.au/s?k=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}`;
}

export type AmazonPlacement = Extract<Placement, `amazon-${string}`>;
