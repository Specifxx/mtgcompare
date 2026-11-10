/**
 * Awin (publisher "Compare Empire", ID 3144410): every link to a store that has accepted us on Awin becomes a tracked
 * Awin deep link, with no step by hand (owner, 2026-11-06: "check, and if it's not there, just do it").
 *
 * The list of programmes that accepted us is Compare Empire's public `data/awin/programmes.json` (one Awin token for
 * the whole family, written each morning there by its `scripts/awin-sync.ts`). `scripts/fetch-awin.ts` copies it into
 * `src/lib/awin-programmes.json` first in every build; the committed copy is an empty list, so a failed fetch only
 * means untracked links for that build. It holds only what is in every Awin link anyway: advertiser id, name, domains.
 *
 * A link is wrapped only when its host is one of the advertiser's own tracked domains and the advertiser allows deep
 * links; anything else (or a programme we have not joined) is left exactly as it was. Never eBay or Amazon: they have
 * their own programmes. Prices and ranking never change: this decides the href, not the order.
 *
 * Impact brands ride the same list (owner, 2026-11-10: "put affiliates everywhere"): Compare Empire's public
 * `data/impact/programmes.json` lists each Impact brand that accepted us with its tracking link
 * ("https://goto.walmart.com/c/7385758/565706/9383"); a link to that brand's own domain becomes
 * `<tracking link>?u=<page>&sharedid=<ref>`. Only links of our own Impact accounts are ever used, and TCGplayer keeps
 * its own wrapper (never here).
 */
import file from "./awin-programmes.json";
import impactFile from "./impact-programmes.json";

export const AWIN_PUBLISHER_ID = 3144410;

export interface AwinProgramme {
  id: number;
  name: string;
  /** Bare hosts the advertiser tracks ("currys.co.uk"); a subdomain of one matches too. */
  domains: string[];
  region?: string;
  currency?: string;
  /** Impact brands only: our tracking link for the brand ("https://<brand host>/c/<account>/<ad>/<campaign>"). */
  link?: string;
}

const AWIN_JOINED: AwinProgramme[] = Array.isArray((file as { joined?: unknown }).joined) ? (file as { joined: AwinProgramme[] }).joined : [];

/** Our Impact media-partner accounts: 7385758 (the TCGplayer-invited account, in the marketplace since 2026-11) and 8139279 ("Riftcompare", Topps). */
export const IMPACT_ACCOUNTS: readonly number[] = [7385758, 8139279];

/** "https://goto.walmart.com/c/7385758/565706/9383" → that, without a trailing slash; null for anything else. */
export function impactBase(link: string): string | null {
  try {
    const u = new URL(link);
    const m = /^\/c\/(\d+)\/\d+\/\d+\/?$/.exec(u.pathname);
    return u.protocol === "https:" && m && IMPACT_ACCOUNTS.includes(Number(m[1])) ? u.origin + u.pathname.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

/** The Impact brands that accepted us, from the committed list; an entry without a valid tracking link of ours is dropped. */
export function impactJoined(f: unknown): AwinProgramme[] {
  const joined = (f as { joined?: unknown } | null)?.joined;
  if (!Array.isArray(joined)) return [];
  return joined
    .filter((p): p is AwinProgramme => !!p && typeof p.id === "number" && typeof p.name === "string" && Array.isArray(p.domains) && p.domains.every((d: unknown) => typeof d === "string") && typeof p.link === "string" && impactBase(p.link) !== null)
    .map((p) => ({ id: p.id, name: p.name, domains: p.domains, link: impactBase(p.link!)!, ...(p.region ? { region: p.region } : {}), ...(p.currency ? { currency: p.currency } : {}) }));
}

/** Awin first, then Impact: a domain on both keeps its Awin programme. */
const JOINED: AwinProgramme[] = [...AWIN_JOINED, ...impactJoined(impactFile)];

/** Never wrapped, whatever a programme lists: these have their own programmes on every site. */
const NEVER = /(^|\.)(ebay\.[a-z.]+|amazon\.[a-z.]+|amzn\.to|tcgplayer\.com)$/;

/** "https://www.Currys.co.uk/path", "*.currys.co.uk", "currys.co.uk" → "currys.co.uk". */
export function bareHost(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^\*\./, "")
    .replace(/[/?#:].*$/, "")
    .replace(/^www\./, "");
}

function hostOf(url: string): string {
  try {
    return bareHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

/** One of our own Impact tracking links (any brand host, path /c/<our account>/<ad>/<campaign>). */
export function isImpactLink(url: string): boolean {
  try {
    const u = new URL(url);
    return impactBase(u.origin + u.pathname) !== null;
  } catch {
    return false;
  }
}

/** A tracked network link we earn on: Awin's, or one of our Impact brands' (so callers label and rel it as paid). */
export function isAwinLink(url: string): boolean {
  const h = hostOf(url);
  return h === "awin1.com" || h === "tidd.ly" || isImpactLink(url);
}

/** The joined programme whose tracked domains cover this link's host, or null. */
export function awinProgrammeFor(url: string, joined: AwinProgramme[] = JOINED): AwinProgramme | null {
  const h = hostOf(url);
  if (!h || NEVER.test(h)) return null;
  for (const p of joined) for (const d of p.domains) if (d && (h === d || h.endsWith("." + d))) return p;
  return null;
}

/** Awin's clickref allows letters, digits, "-" and "_" (max 50). */
export function clickref(...parts: (string | number | null | undefined)[]): string {
  return parts
    .filter((x) => x != null && x !== "")
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .slice(0, 50);
}

/** An Impact brand's tracked deep link to `destination`, or null when the tracking link is not one of ours. */
export function impactDeepLink(link: string, destination: string, ref: string): string | null {
  const base = impactBase(link);
  return base ? `${base}?u=${encodeURIComponent(destination)}${ref ? `&sharedid=${encodeURIComponent(ref)}` : ""}` : null;
}

export function awinDeepLink(advertiserId: number, destination: string, ref: string): string {
  const q = `awinmid=${advertiserId}&awinaffid=${AWIN_PUBLISHER_ID}${ref ? `&clickref=${encodeURIComponent(ref)}` : ""}`;
  return `https://www.awin1.com/cread.php?${q}&ued=${encodeURIComponent(destination)}`;
}

/**
 * The tracked href for a store link, or null when Awin has nothing to do with it. A link that already is an Awin link
 * (a product feed's aw_deep_link) keeps its tracking and gains our clickref if it has none.
 */
export function awinUrl(url: string, ref: string, joined: AwinProgramme[] = JOINED): string | null {
  if (isAwinLink(url)) {
    try {
      const u = new URL(url);
      const key = isImpactLink(url) ? "sharedid" : "clickref";
      if (ref && !u.searchParams.has(key)) u.searchParams.set(key, ref);
      return u.toString();
    } catch {
      return url;
    }
  }
  const p = awinProgrammeFor(url, joined);
  if (!p) return null;
  return p.link ? impactDeepLink(p.link, url, ref) : awinDeepLink(p.id, url, ref);
}

/** How many programmes have accepted us (for the about/disclosure copy and the ops report). */
export const AWIN_JOINED_COUNT = AWIN_JOINED.length;
/** How many Impact brands (TCGplayer aside) have accepted us. */
export const IMPACT_JOINED_COUNT = JOINED.length - AWIN_JOINED.length;
