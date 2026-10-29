// Amazon (Amazon Associates) links: a MARKETPLACE link, never a store. It is never counted as a store, never ranked with the store
// rows, never "best price", and we show no Amazon price, rating or stock: we do not read Amazon, so the link only says "Check price on
// Amazon AU / US" (owner, 2026-10-25).
//
// Server-side only: each tag is read from its variable at request time (all the pages that render these links are server
// components). A client component that needs a link gets the built URL as a prop, so no NEXT_PUBLIC variable is required.
//
// Where (owner, 2026-10-29: "we are now earning money through our Amazon affiliates … we got to implement it" on every site):
// - Amazon Australia (AMAZON_AU_TAG, default compareempire-22) in AU, and in NZ and SG (it may ship there; the copy says to check).
// - Amazon US (amazon.com, AMAZON_US_TAG, default riftcompare-20: the owner's US Associates account) in the US.
// - Amazon UK / CA / DE in the UK, Canada and the eurozone only once AMAZON_UK_TAG / AMAZON_CA_TAG / AMAZON_DE_TAG is set: there is
//   no account there yet, and an untagged link earns nothing, so without a tag those regions show no Amazon at all.
// A link that knows where it sits carries ascsubtag=mtg-<region>-<placement> (Associates' tracking report splits by it).

import ASINS from "@/data/amazon-asins.json";
import { searchTerms, type Placement } from "./affiliate";
import type { Region } from "./regions";

export const AMAZON_DEFAULT_TAG = "compareempire-22";
export const AMAZON_US_DEFAULT_TAG = "riftcompare-20";
/** The Amazon links' rel, exactly as the owner specified (no noreferrer). */
export const REL_AMAZON = "sponsored nofollow noopener";
/** The retailer label of Amazon Australia's buy_click (components/OutboundLink.tsx); amazonRetailer() for a region. */
export const AMAZON_RETAILER = "Amazon AU";
/** The FTC / Amazon Associates disclosure, word for word: the footer of every page and beside the Amazon links. */
export const AMAZON_DISCLOSURE = "As an Amazon Associate I earn from qualifying purchases.";
export const AMAZON_CTA = "Check price on Amazon AU";

type Env = Record<string, string | undefined>;
interface Store {
  host: string;
  retailer: string;
  tagEnv: string;
  defaultTag: string | null;
}
const AU: Store = { host: "www.amazon.com.au", retailer: AMAZON_RETAILER, tagEnv: "AMAZON_AU_TAG", defaultTag: AMAZON_DEFAULT_TAG };
const STORES: Record<Region, Store | null> = {
  au: AU,
  nz: AU,
  sg: AU,
  us: { host: "www.amazon.com", retailer: "Amazon US", tagEnv: "AMAZON_US_TAG", defaultTag: AMAZON_US_DEFAULT_TAG },
  uk: { host: "www.amazon.co.uk", retailer: "Amazon UK", tagEnv: "AMAZON_UK_TAG", defaultTag: null },
  ca: { host: "www.amazon.ca", retailer: "Amazon CA", tagEnv: "AMAZON_CA_TAG", defaultTag: null },
  eu: { host: "www.amazon.de", retailer: "Amazon DE", tagEnv: "AMAZON_DE_TAG", defaultTag: null },
};

const TAG_RE = /^[A-Za-z0-9-]{1,64}$/;

/** The region's Amazon (host, buy_click retailer, tag), or null where it shows none (no store, or no tag set). */
export function amazonFor(region: Region, env: Env = process.env): { host: string; retailer: string; tag: string } | null {
  const s = STORES[region];
  if (!s) return null;
  const v = (env[s.tagEnv] ?? "").trim();
  const tag = TAG_RE.test(v) ? v : s.defaultTag;
  return tag ? { host: s.host, retailer: s.retailer, tag } : null;
}

/** The regions Amazon links appear in today. */
export const amazonRegions = (env: Env = process.env): Region[] => (Object.keys(STORES) as Region[]).filter((r) => amazonFor(r, env));
export function amazonRegion(region: Region, env: Env = process.env): boolean {
  return amazonFor(region, env) != null;
}
export const amazonRetailer = (region: Region): string => STORES[region]?.retailer ?? "Amazon";
export const amazonCta = (region: Region): string => `Check price on ${amazonRetailer(region)}`;

/** The honest label of the Amazon row per region: the region's own Amazon at home, "may ship to …; check delivery" elsewhere. */
export function amazonLabel(region: Region): { name: string; note: string } {
  if (region === "nz") return { name: "Amazon Australia (ships to NZ)", note: "Amazon Australia may ship to New Zealand; check delivery before you buy." };
  if (region === "sg") return { name: "Amazon Australia (ships to SG)", note: "Amazon Australia may ship to Singapore; check delivery before you buy." };
  return { name: amazonRetailer(region), note: "Price and stock are Amazon's own; we do not check them." };
}

/** Amazon Australia's tag: AMAZON_AU_TAG, or the default. A tag is letters, digits and dashes; anything else falls back. */
export function amazonTag(env: string | undefined = process.env.AMAZON_AU_TAG): string {
  const v = (env ?? "").trim();
  return TAG_RE.test(v) ? v : AMAZON_DEFAULT_TAG;
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
export function amazonUrl(name: string, opts: { slug?: string | null; tag?: string; asins?: Record<string, string>; region?: Region; placement?: string } = {}): string {
  const region = opts.region ?? "au";
  const a = amazonFor(region) ?? amazonFor("au")!;
  const tag = opts.tag ?? (opts.region ? a.tag : amazonTag());
  const asin = a.host === "www.amazon.com.au" ? asinFor(opts.slug, opts.asins) : null;
  const sub = opts.placement ? `&ascsubtag=${encodeURIComponent(`mtg-${region}-${opts.placement}`)}` : "";
  if (asin) return `https://${a.host}/dp/${asin}?tag=${encodeURIComponent(tag)}${sub}`;
  const terms = searchTerms(name);
  const q = (MTG_WORD.test(terms) ? terms : `MTG ${terms}`).replace(/\s+/g, " ").trim();
  return `https://${a.host}/s?k=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}${sub}`;
}

export type AmazonPlacement = Extract<Placement, `amazon-${string}`>;
