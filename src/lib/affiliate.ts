// Affiliate / partner identifiers and outbound-link tagging. The ids are PUBLIC
// by design (they appear in every outbound URL). MTG Compare has its own: they
// come from NEXT_PUBLIC_EBAY_CAMPAIGN_ID and NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK
// (NEXT_PUBLIC_ so client components build the same link the server does) and
// have NO default: unset, every link renders plain, never on another site's
// account.
//
// ── eBay: search links everywhere, API prices from the script side only ─────
// Every eBay link built HERE is a SEARCH link, which costs no quota. eBay
// listing prices come from MTG Compare's own eBay application
// through the twice-daily eBay pass (scripts/ebay.ts, lib/ebay*.ts), which runs
// only in GitHub Actions. This file never calls eBay. tests/no-ebay-api.test.ts
// fails if an eBay API host or credential appears outside src/lib/ebay*.ts.
//
// ── ATTRIBUTION ──────────────────────────────────────────────────────────────
// EPN's `customid` and Impact's `sharedid` carry `mc-<market>-<source>`, so this
// site's revenue is separable in both networks' own reports.
import { SITE_URL } from "./site";
import type { Country } from "./country";

/** Read at call time, from the inlined NEXT_PUBLIC_ names (a dynamic process.env[...] lookup is not inlined in the browser). */
export function ebayCampaignId(): string {
  return (process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID || "").trim();
}
export function tcgplayerImpactLink(): string {
  return (process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK || "").trim();
}

interface EbayMarketIds { mkrid: string; siteid: string; customid: string; code: string }
const EBAY_MARKETS: Record<string, EbayMarketIds> = {
  "ebay.com.au": { mkrid: "705-53470-19255-0", siteid: "15", customid: "mc-au", code: "AU" },
  "ebay.com": { mkrid: "711-53200-19255-0", siteid: "0", customid: "mc-us", code: "US" },
  "ebay.co.uk": { mkrid: "710-53481-19255-0", siteid: "3", customid: "mc-uk", code: "UK" },
  "ebay.ca": { mkrid: "706-53473-19255-0", siteid: "2", customid: "mc-ca", code: "CA" },
  "ebay.es": { mkrid: "1185-53479-19255-0", siteid: "186", customid: "mc-eu", code: "ES" },
};

// Singapore has no EPN program: ebay.com.sg links reroute to ebay.com (the same
// inventory) and still report as mc-sg.
const SG_HOST = "ebay.com.sg";

function ebayMarket(hostname: string): (EbayMarketIds & { realHost: string }) | null {
  const h = hostname.replace(/^www\./i, "").toLowerCase();
  if (h === SG_HOST) return { ...EBAY_MARKETS["ebay.com"], customid: "mc-sg", realHost: "ebay.com" };
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
  return s.slice(0, SUBID_MAX) || "mc";
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
    const campid = ebayCampaignId();
    if (!campid) return u.toString();   // no campaign of our own: a plain link, never someone else's account
    u.searchParams.set("mkevt", "1");
    u.searchParams.set("mkcid", "1");
    if (!preTagged) {
      u.searchParams.set("mkrid", process.env[`EBAY_MKRID_${m.code}`] || m.mkrid);
      u.searchParams.set("siteid", process.env[`EBAY_SITEID_${m.code}`] || m.siteid);
    }
    u.searchParams.set("campid", campid);
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
 * The keywords for an eBay search, with the game named exactly once. Without it,
 * "Sol Ring" or "Lightning Bolt" alone floods results with unrelated goods.
 * Commas are dropped (eBay reads them as OR inside parentheses).
 */
export function magicEbayQuery(query: string): string {
  const clean = query.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "Magic The Gathering cards";
  return /\b(?:mtg|magic:?\s+the\s+gathering)\b/i.test(clean) ? clean : `MTG ${clean}`;
}

/** A card's eBay query: name, collector number and the printing words sellers use (foil, borderless...). */
export function cardEbayQuery(c: { name: string; number?: string | null; variant?: string | null; setName?: string | null; foil?: boolean }): string {
  const v = c.variant ? ` ${c.variant.replace(/·/g, " ").replace(/\s+/g, " ")}` : "";
  const set = c.setName ? ` ${c.setName}` : "";
  return magicEbayQuery(`${c.name}${set}${c.number ? ` ${c.number}` : ""}${v}${c.foil ? " foil" : ""}`);
}

/** An affiliate-tagged eBay SEARCH on the visitor's own marketplace. Zero API cost. */
export function ebaySearchUrl(country: Country, query: string, source?: string): string {
  const url = `https://www.${ebayDomain(country)}/sch/i.html?_nkw=${encodeURIComponent(query)}`;
  return ebayAffiliateUrl(url, source);
}

/** The first path segment of the page a link is rendered on ("/card/x" -> "card", "/" -> "home"); undefined when `loc` is not a URL or a path. */
function pageOf(loc: string): string | undefined {
  try {
    return new URL(loc, SITE_URL).pathname.split("/").filter(Boolean)[0] ?? "home";
  } catch {
    return undefined;
  }
}

/**
 * Tag an outbound product link. eBay EPN → TCGplayer (Impact) → plain link.
 * `subId` is the retailer key, `loc` the page it was rendered on (path only).
 */
export function affiliateUrl(url: string | null | undefined, subId = "mc", loc: string = SITE_URL): string {
  if (!url) return "#";
  const page = pageOf(loc);
  try {
    const u = new URL(url);
    if (/(?:^|\.)ebay\./i.test(u.hostname)) return ebayAffiliateUrl(url, affiliateSubId(subId, page));
    const impact = tcgplayerImpactLink();
    if (impact && /(?:^|\.)tcgplayer\.com$/i.test(u.hostname)) {
      return (
        `${impact}?u=${encodeURIComponent(url)}` +
        `&sharedid=${encodeURIComponent(affiliateSubId("mc", subId, page))}`
      );
    }
  } catch {
    /* not an absolute URL — leave it untouched */
  }
  return url;
}

// ── TCGplayer: where the store-wide banners and ads land ────────────────────
/**
 * TCGplayer's Magic: The Gathering search (product line `magic`, TCGCSV category 1). Every store-wide TCGplayer banner and ad
 * ("Shop Magic singles & sealed": the card page's house banner, the footer box, the partners strip, the Impact creative) lands
 * here, through affiliateUrl like a card's own TCGplayer link; a single product links its own page (constants.ts tcgplayerUrl).
 * One constant, so no banner carries a sister site's product line again: the house banner and the footer box linked the
 * One Piece Card Game's search until 2026-10-09 (tests/affiliate.test.ts now fails on any other product line in src/).
 */
export const TCGPLAYER_MAGIC_SEARCH = "https://www.tcgplayer.com/search/magic/product?productLineName=magic&view=grid";

/**
 * An Impact CREATIVE link for an owner-supplied ad id (NEXT_PUBLIC_TCGPLAYER_CREATIVES): our own Impact link
 * (`…/c/<account>/<ad>/<program>`) with that ad id in place of the text link's, deep-linked (`u=`) to `url`, so the click
 * lands where our own copy says whatever landing page the creative was set up with. Null without an Impact link of our
 * own, with one not in that shape, or with an ad id that is not digits: the ad then renders nothing, never a guessed link.
 */
export function tcgplayerCreativeUrl(adId: string, url: string, subId: string, loc: string = SITE_URL): string | null {
  const m = /^(https:\/\/[^?#]+\/c\/\d+)\/\d+\/(\d+)\/?$/.exec(tcgplayerImpactLink());
  if (!m || !/^\d+$/.test(adId)) return null;
  return `${m[1]}/${adId}/${m[2]}?u=${encodeURIComponent(url)}&sharedid=${encodeURIComponent(affiliateSubId("mc", subId, pageOf(loc)))}`;
}

export function outboundRel(): string {
  return "nofollow sponsored noopener noreferrer";
}

/** Is this outbound link actually monetised? Gates the per-row "Paid link" label. */
export function isPaidLink(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    const u = new URL(href);
    if (/(?:^|\.)ebay\./i.test(u.hostname)) return Boolean(ebayCampaignId());
    if (/(?:^|\.)tcgplayer\.com$/i.test(u.hostname)) return Boolean(tcgplayerImpactLink());
    return false;
  } catch {
    return false;
  }
}
