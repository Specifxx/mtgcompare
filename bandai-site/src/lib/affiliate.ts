// Affiliate links, everywhere a price is shown (owner: "we want the affiliate
// links to be everywhere on the site"). Every outbound buy button goes through
// /go, which logs a ClickEvent and 302s to the tagged URL; the tagging itself
// is here so a link rendered without /go is still tagged.
//
// Same partner accounts as Rift Compare (src/lib/affiliate.ts there): one eBay
// Partner Network campaign and one TCGplayer Impact link, with a per-site tag so
// the earnings split by site: `<site key>-<market>-<placement>-<product id>`,
// e.g. `lorcana-us-card_pinned-1234`. It goes in EPN's `customid`, in Impact's
// `sharedid` AND `subId1` (Rift Compare's earnings digest reads SharedId first,
// and Impact's Performance by Sub ID report shows subId1), and in Amazon's
// `ascsubtag`. The site key comes first so the digest groups by it.
import { SITE } from "@/site.config";
import { MARKETS, type Market } from "./site-types";

// One EPN campaign for every Compare site, hard-coded (owner, 2026-10-30: "make
// all of them use this exact campaign"); the customid's site key tells the
// sites apart. No variable overrides it.
export const EBAY_CAMPAIGN_ID = "5339155912";
export const TCGPLAYER_IMPACT_LINK =
  process.env.TCGPLAYER_IMPACT_LINK || "https://partner.tcgplayer.com/c/7385758/1780961/21018";
// Amazon US: the site's own tracking ID (site.config `amazonUsTag`), else Rift
// Compare's. Hard-coded: no Vercel variable decides a tag (owner, 2026-11-02).
export const AMAZON_TAG = SITE.amazonUsTag ?? "riftcompare-20";
// Amazon AU: the site's own tracking ID in the owner's AU account (site.config `amazonAuTag`), so the AU
// reports split by site; compareempire-22 when unset (owner, 2026-11-03).
export const AMAZON_AU_TAG = SITE.amazonAuTag ?? "compareempire-22";

const EBAY_ROTATION: Record<string, string> = {
  "ebay.com": "711-53200-19255-0",
  "ebay.co.uk": "710-53481-19255-0",
  "ebay.com.au": "705-53470-19255-0",
  "ebay.ca": "706-53473-19255-0",
};

export function subId(...parts: (string | number | null | undefined)[]): string {
  return (
    [SITE.key, ...parts]
      .filter((x) => x != null && x !== "")
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .slice(0, 60) || SITE.key
  );
}

export function ebayAffiliateUrl(url: string, sub?: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const rot = EBAY_ROTATION[host];
    if (!rot) return url;
    u.searchParams.set("mkevt", "1");
    u.searchParams.set("mkcid", "1");
    if (!u.searchParams.get("mkrid")) u.searchParams.set("mkrid", rot);
    u.searchParams.set("campid", EBAY_CAMPAIGN_ID);
    u.searchParams.set("toolid", "10001");
    u.searchParams.set("customid", sub ?? subId());
    return u.toString();
  } catch {
    return url;
  }
}

export function tcgplayerAffiliateUrl(url: string, sub?: string): string {
  const tag = encodeURIComponent(sub ?? subId());
  return `${TCGPLAYER_IMPACT_LINK}?subId1=${tag}&sharedid=${tag}&u=${encodeURIComponent(url)}`;
}

// Each Amazon store is its own Associates programme, and a tag earns only on the
// store whose account issued it (a US tag on amazon.com.au earns nothing). The US
// uses AMAZON_TAG above; Australia AMAZON_AU_TAG, the UK compareempi03-21, Canada compareempire-20
// and the eurozone (amazon.de) compareempire-21: the owner's accounts, hard-coded
// (2026-11-02). Singapore never (no Associates programme).
const AMAZON_STORES: Partial<Record<Market, { host: string; tag: string }>> = {
  US: { host: "www.amazon.com", tag: AMAZON_TAG },
  AU: { host: "www.amazon.com.au", tag: AMAZON_AU_TAG },
  UK: { host: "www.amazon.co.uk", tag: "compareempi03-21" },
  CA: { host: "www.amazon.ca", tag: "compareempire-20" },
  EU: { host: "www.amazon.de", tag: "compareempire-21" },
};

/** The tag for an amazon.* host: that store's own, else the US tag. */
function amazonTagFor(host: string): string | null {
  const h = host.toLowerCase().replace(/^(www\.)?/, "www.");
  return Object.values(AMAZON_STORES).find((s) => s?.host === h)?.tag ?? AMAZON_TAG;
}

function amazonAffiliateUrl(url: string, sub?: string): string {
  try {
    const u = new URL(url);
    const tag = amazonTagFor(u.hostname);
    if (tag) u.searchParams.set("tag", tag);
    u.searchParams.set("ascsubtag", sub ?? subId());
    return u.toString();
  } catch {
    return url;
  }
}

// Stores pay nothing, but a referral they can see in their own analytics is
// what a partner-code conversation starts from ("we sent you N visitors").
function storeReferralUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("utm_source")) {
      u.searchParams.set("utm_source", SITE.domain);
      u.searchParams.set("utm_medium", "referral");
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** A tagged search of the market's Amazon, or null where the market has no tag. */
export function amazonSearchUrl(q: string, market: Market = "US"): string | null {
  const s = AMAZON_STORES[market];
  if (!s) return null;
  return `https://${s.host}/s?k=${encodeURIComponent(q)}&tag=${encodeURIComponent(s.tag)}`;
}

/** The tagged Amazon search for every market that has a tag (the price table picks the visitor's). */
export function amazonSearchUrls(q: string): Partial<Record<Market, string>> | null {
  const out: Partial<Record<Market, string>> = {};
  for (const m of MARKETS) {
    const url = amazonSearchUrl(q, m);
    if (url) out[m] = url;
  }
  return Object.keys(out).length ? out : null;
}

/** The tagged destination for any outbound offer URL. */
export function tagged(url: string, sub?: string): string {
  if (/(^|\.)ebay\./i.test(safeHost(url))) return ebayAffiliateUrl(url, sub);
  if (/tcgplayer\.com$/i.test(safeHost(url))) return tcgplayerAffiliateUrl(url, sub);
  if (/(^|\.)amazon\./i.test(safeHost(url))) return amazonAffiliateUrl(url, sub);
  return storeReferralUrl(url);
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** The /go link a buy button renders: logs the click, then redirects. */
export function goHref(o: { url: string; source: string; market: string }, productId?: number, page?: string): string {
  const q = new URLSearchParams({ u: o.url, s: o.source, m: o.market });
  if (productId) q.set("p", String(productId));
  if (page) q.set("from", page);
  return `/go?${q}`;
}

export function ebaySearchUrl(query: string, market: "US" | "UK" | "AU" | "CA" = "US"): string {
  const host = { US: "www.ebay.com", UK: "www.ebay.co.uk", AU: "www.ebay.com.au", CA: "www.ebay.ca" }[market];
  return `https://${host}/sch/i.html?_nkw=${encodeURIComponent(query)}&_sop=15`;
}
