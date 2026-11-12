// Amazon (Amazon Associates) links: a MARKETPLACE link, never a store. It is never counted as a store, never ranked with the store
// rows, never "best price". The only Amazon price shown is the product page's pinned row, from the Creators API, under 24 hours old
// (lib/amazon-live.ts, owner 2026-11-05); everywhere else the link only says "Check price on Amazon AU / US" (owner, 2026-10-25).
//
// Tags are hard-coded (owner, 2026-11-02: no Vercel variable decides a tag), one per Amazon store, because a tag earns only on the
// store whose Associates account issued it:
// - Amazon Australia (mtgcompare-22) in AU, and in NZ and SG (it may ship there; the copy says to check).
// - Amazon US (riftcompare-20) in the US; Amazon UK (compareempi03-21), Canada (compareempire-20) and Germany (compareempire-21, for
//   the eurozone) in theirs.
// A link that knows where it sits carries ascsubtag=mtg-<region>-<placement> (Associates' tracking report splits by it).

import ASINS from "@/data/amazon-asins.json";
import { searchTerms, type Placement } from "./affiliate";
import type { Region } from "./regions";

export const AMAZON_DEFAULT_TAG = "mtgcompare-22";
export const AMAZON_US_DEFAULT_TAG = "riftcompare-20";
/** The Amazon links' rel, exactly as the owner specified (no noreferrer). */
export const REL_AMAZON = "sponsored nofollow noopener";
/** The retailer label of Amazon Australia's buy_click (components/OutboundLink.tsx); amazonRetailer() for a region. */
export const AMAZON_RETAILER = "Amazon AU";
/** The FTC / Amazon Associates disclosure, word for word: the footer of every page and beside the Amazon links. */
export const AMAZON_DISCLOSURE = "As an Amazon Associate I earn from qualifying purchases.";
/** Amazon's trademark notice (Operating Agreement Dos and Don'ts, 2026-11-02), in the footer of every page. */
export const AMAZON_TRADEMARK = "Amazon and the Amazon logo are trademarks of Amazon.com, Inc. or its affiliates.";
export const AMAZON_CTA = "Check price on Amazon AU";

interface Store {
  host: string;
  retailer: string;
  tag: string;
}
const AU: Store = { host: "www.amazon.com.au", retailer: AMAZON_RETAILER, tag: AMAZON_DEFAULT_TAG };
const STORES: Record<Region, Store | null> = {
  au: AU,
  nz: AU,
  sg: AU,
  us: { host: "www.amazon.com", retailer: "Amazon US", tag: AMAZON_US_DEFAULT_TAG },
  uk: { host: "www.amazon.co.uk", retailer: "Amazon UK", tag: "compareempi03-21" },
  ca: { host: "www.amazon.ca", retailer: "Amazon CA", tag: "compareempire-20" },
  eu: { host: "www.amazon.de", retailer: "Amazon DE", tag: "compareempire-21" },
};

/** The region's Amazon (host, buy_click retailer, tag), or null where it shows none. */
export function amazonFor(region: Region): { host: string; retailer: string; tag: string } | null {
  const s = STORES[region];
  return s ? { host: s.host, retailer: s.retailer, tag: s.tag } : null;
}

/** The regions Amazon links appear in today. */
export const amazonRegions = (): Region[] => (Object.keys(STORES) as Region[]).filter((r) => amazonFor(r));
export function amazonRegion(region: Region): boolean {
  return amazonFor(region) != null;
}
export const amazonRetailer = (region: Region): string => STORES[region]?.retailer ?? "Amazon";
export const amazonCta = (region: Region): string => `Check price on ${amazonRetailer(region)}`;

/** The honest label of the Amazon row per region: the region's own Amazon at home, "may ship to …; check delivery" elsewhere. */
export function amazonLabel(region: Region): { name: string; note: string } {
  if (region === "nz") return { name: "Amazon Australia (ships to NZ)", note: "Amazon Australia may ship to New Zealand; check delivery before you buy." };
  if (region === "sg") return { name: "Amazon Australia (ships to SG)", note: "Amazon Australia may ship to Singapore; check delivery before you buy." };
  return { name: amazonRetailer(region), note: "Price and stock are Amazon's own." };
}

/** Amazon Australia's tag. */
export function amazonTag(): string {
  return AMAZON_DEFAULT_TAG;
}

const ASIN_MAP = ASINS as Record<string, string>;
/** A known ASIN for a product slug (src/data/amazon-asins.json, filled by hand; never guessed). */
export function asinFor(slug: string | null | undefined, map: Record<string, string> = ASIN_MAP): string | null {
  const a = slug ? map[slug] : undefined;
  return a && /^[A-Z0-9]{10}$/.test(a) ? a : null;
}

const MTG_WORD = /\bmtg\b|\bmagic\b/i;

/**
 * The region's Amazon link (Amazon AU unless `region` says otherwise): the product page (/dp/<ASIN>) when the ASIN is known, else a
 * search for the cleaned name, with ascsubtag=mtg-<region>-<placement> when a placement is given. Direct, no redirect. Only call it
 * for a region amazonRegion() accepts; elsewhere it falls back to Amazon Australia.
 */
export function amazonUrl(name: string, opts: { slug?: string | null; tag?: string; asins?: Record<string, string>; region?: Region; placement?: string; asin?: string | null } = {}): string {
  const region = opts.region ?? "au";
  const a = amazonFor(region) ?? amazonFor("au")!;
  const tag = opts.tag ?? (opts.region ? a.tag : amazonTag());
  // `asin`: the region's own listing the Creators API matched (lib/amazon-live.ts); the hand-filled map is Amazon AU's alone.
  const asin = (opts.asin && /^[A-Z0-9]{10}$/.test(opts.asin) ? opts.asin : null) ?? (a.host === "www.amazon.com.au" ? asinFor(opts.slug, opts.asins) : null);
  const sub = opts.placement ? `&ascsubtag=${encodeURIComponent(`mtg-${region}-${opts.placement}`)}` : "";
  if (asin) return `https://${a.host}/dp/${asin}?tag=${encodeURIComponent(tag)}${sub}`;
  const terms = searchTerms(name);
  const q = (MTG_WORD.test(terms) ? terms : `MTG ${terms}`).replace(/\s+/g, " ").trim();
  return `https://${a.host}/s?k=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}${sub}`;
}

export type AmazonPlacement = Extract<Placement, `amazon-${string}`>;

/**
 * Sealed types Amazon carries (owner, 2026-11-12: no Amazon link where Amazon doesn't sell the item). A real ASIN says yes; otherwise
 * not a prerelease pack, draft-night or scene box, Secret Lair or any case.
 */
export const AMAZON_EXCLUDED_TYPES: ReadonlySet<string> = new Set(["prerelease-pack", "draft-night", "scene-box", "secret-lair", "play-booster-box-case", "collector-booster-box-case", "bundle-case"]);
export const amazonCarries = (typeKey: string | null | undefined, hasAsin = false): boolean => hasAsin || (!!typeKey && !AMAZON_EXCLUDED_TYPES.has(typeKey));
