// Affiliate / partner identifiers and outbound-link tagging, ported from
// RiftCompare's lib/affiliate.ts. The ids are PUBLIC by design (they appear in
// every outbound URL) and are the owner's existing accounts, env-overridable.
//
// ── eBay: search links everywhere, API prices from the script side only ─────
// Every eBay link built HERE is a SEARCH link, which costs no quota. eBay
// listing prices come from OP Compare's own eBay application (not RiftCompare's)
// through the twice-daily eBay pass (scripts/ebay.ts, lib/ebay*.ts), which runs
// only in GitHub Actions. This file never calls eBay. tests/no-ebay-api.test.ts
// fails if an eBay API host or credential appears outside src/lib/ebay*.ts.
//
// ── ATTRIBUTION ──────────────────────────────────────────────────────────────
// EPN's `customid` and Impact's `sharedid` carry `oc-<market>-<source>`, so OP
// Compare's revenue is separable from RiftCompare's (`rc-…`) in both networks'
// own reports, on the same accounts.
import { SITE_URL } from "./site";
import type { Country } from "./country";

export const EBAY_CAMPAIGN_ID = process.env.EBAY_AFFILIATE_CAMPAIGN || "5339155912";
export const TCGPLAYER_IMPACT_LINK =
  process.env.TCGPLAYER_IMPACT_LINK || "https://partner.tcgplayer.com/c/7385758/1780961/21018";

interface EbayMarketIds { mkrid: string; siteid: string; customid: string; code: string }
const EBAY_MARKETS: Record<string, EbayMarketIds> = {
  "ebay.com.au": { mkrid: "705-53470-19255-0", siteid: "15", customid: "oc-au", code: "AU" },
  "ebay.com": { mkrid: "711-53200-19255-0", siteid: "0", customid: "oc-us", code: "US" },
  "ebay.co.uk": { mkrid: "710-53481-19255-0", siteid: "3", customid: "oc-uk", code: "UK" },
  "ebay.ca": { mkrid: "706-53473-19255-0", siteid: "2", customid: "oc-ca", code: "CA" },
  "ebay.es": { mkrid: "1185-53479-19255-0", siteid: "186", customid: "oc-eu", code: "ES" },
};

// Singapore has no EPN program: ebay.com.sg links reroute to ebay.com (the same
// inventory) and still report as oc-sg.
const SG_HOST = "ebay.com.sg";

function ebayMarket(hostname: string): (EbayMarketIds & { realHost: string }) | null {
  const h = hostname.replace(/^www\./i, "").toLowerCase();
  if (h === SG_HOST) return { ...EBAY_MARKETS["ebay.com"], customid: "oc-sg", realHost: "ebay.com" };
  if (EBAY_MARKETS[h]) return { ...EBAY_MARKETS[h], realHost: h };
  if (/(?:^|\.)ebay\./i.test(h)) return { ...EBAY_MARKETS["ebay.com"], realHost: "ebay.com" };
  return null;
}

const SUBID_MAX = 60;
export function affiliateSubId(...parts: (string | null | undefined)[]): string {
  const s = parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, SUBID_MAX) || "oc";
}

/** Tag an eBay item/search URL with our EPN campaign (an ePN smart link). */
export function ebayAffiliateUrl(url: string, source?: string): string {
  try {
    const u = new URL(url);
    const m = ebayMarket(u.hostname);
    if (!m) return url;
    const rerouted = u.hostname.replace(/^www\./i, "").toLowerCase() !== m.realHost;
    if (rerouted) u.hostname = `www.${m.realHost}`;
    // A URL eBay built itself (the Browse API's itemAffiliateWebUrl) already
    // carries the right rotation for its marketplace: keep its mkrid/siteid and
    // add only what eBay can't know (campaign, sub-id). Not when rerouted — an
    // ebay.com.sg rotation means nothing on ebay.com (RiftCompare's rule).
    const preTagged = !rerouted && u.searchParams.get("mkevt") === "1" && !!u.searchParams.get("mkrid");
    u.searchParams.set("mkevt", "1");
    u.searchParams.set("mkcid", "1");
    if (!preTagged) {
      u.searchParams.set("mkrid", process.env[`EBAY_MKRID_${m.code}`] || m.mkrid);
      u.searchParams.set("siteid", process.env[`EBAY_SITEID_${m.code}`] || m.siteid);
    }
    u.searchParams.set("campid", EBAY_CAMPAIGN_ID);
    u.searchParams.set("toolid", "10001");
    const shape = /\/itm\//.test(u.pathname) ? "product" : /\/sch\//.test(u.pathname) ? "search" : null;
    u.searchParams.set("customid", affiliateSubId(m.customid, source, shape));
    return u.toString();
  } catch {
    return url;
  }
}

const EBAY_DOMAIN: Record<Country, string> = {
  US: "ebay.com",
  AU: "ebay.com.au",
  UK: "ebay.co.uk",
  SG: "ebay.com.sg",
  CA: "ebay.ca",
  EU: "ebay.es",
};

const EBAY_LABEL: Record<Country, string> = {
  US: "eBay",
  AU: "eBay Australia",
  UK: "eBay UK",
  SG: "eBay",
  CA: "eBay Canada",
  EU: "eBay Spain",
};

export function ebayDomain(country: Country): string {
  return EBAY_DOMAIN[country] ?? EBAY_DOMAIN.US;
}
export function ebayLabel(country: Country): string {
  return EBAY_LABEL[country] ?? EBAY_LABEL.US;
}

/**
 * The keywords for an eBay search, with "One Piece" in it exactly once. Without
 * it, "Luffy" or "Romance Dawn" alone floods results with manga and figures.
 * Commas are dropped (eBay reads them as OR inside parentheses).
 */
export function onePieceEbayQuery(query: string): string {
  const clean = query.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "One Piece Card Game";
  return /\bone\s*piece\b/i.test(clean) ? clean : `One Piece ${clean}`;
}

/** A card's eBay query: name, number and the printing words sellers use. */
export function cardEbayQuery(c: { name: string; number: string | null; variant: string | null }): string {
  const v = c.variant ? ` ${c.variant.replace(/·/g, " ").replace(/\s+/g, " ")}` : "";
  return onePieceEbayQuery(`${c.name}${c.number ? ` ${c.number}` : ""}${v}`);
}

/** An affiliate-tagged eBay SEARCH on the visitor's own marketplace. Zero API cost. */
export function ebaySearchUrl(country: Country, query: string, source?: string): string {
  const url = `https://www.${ebayDomain(country)}/sch/i.html?_nkw=${encodeURIComponent(query)}`;
  return ebayAffiliateUrl(url, source);
}

/**
 * Tag an outbound product link. eBay EPN → TCGplayer (Impact) → plain link.
 * `subId` is the retailer key, `loc` the page it was rendered on (path only).
 */
export function affiliateUrl(url: string | null | undefined, subId = "opcompare", loc: string = SITE_URL): string {
  if (!url) return "#";
  const page = (() => {
    try {
      return new URL(loc, SITE_URL).pathname.split("/").filter(Boolean)[0] ?? "home";
    } catch {
      return undefined;
    }
  })();
  try {
    const u = new URL(url);
    if (/(?:^|\.)ebay\./i.test(u.hostname)) return ebayAffiliateUrl(url, affiliateSubId(subId, page));
    if (TCGPLAYER_IMPACT_LINK && /(?:^|\.)tcgplayer\.com$/i.test(u.hostname)) {
      return (
        `${TCGPLAYER_IMPACT_LINK}?u=${encodeURIComponent(url)}` +
        `&sharedid=${encodeURIComponent(affiliateSubId("oc", subId, page))}`
      );
    }
  } catch {
    /* not an absolute URL — leave it untouched */
  }
  return url;
}

export function outboundRel(): string {
  return "nofollow sponsored noopener noreferrer";
}

/** Is this outbound link actually monetised? Gates the per-row "Paid link" label. */
export function isPaidLink(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    const u = new URL(href);
    if (/(?:^|\.)ebay\./i.test(u.hostname)) return true;
    if (/(?:^|\.)tcgplayer\.com$/i.test(u.hostname)) return Boolean(TCGPLAYER_IMPACT_LINK);
    return false;
  } catch {
    return false;
  }
}
