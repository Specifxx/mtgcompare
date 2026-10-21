// Outbound HTTP for reading stores' public product feeds (Shopify products.json,
// the WooCommerce Store API). Ported from Rift Compare's scrape-http.ts: the
// same robots.txt handling, backoff and headers, so both sites behave the same
// way towards the stores they share.
import { CONTACT_EMAIL } from "./site";

// A realistic browser User-Agent (some stores serve stale cached prices to
// obvious bot UAs); `From` says who we are.
export const SCRAPE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  From: CONTACT_EMAIL,
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pause between sequential requests to the SAME store.
export const REQUEST_DELAY_MS = 350;
const TIMEOUT_MS = 25_000;

export class RateLimitedError extends Error {}

// Shopify throttles by IP across ALL its storefronts, so reading many stores at
// once can earn a 429 from a store we've barely touched. Back off and retry a
// couple of times (honouring Retry-After, capped) before giving up on the store.
const RETRY_WAITS_MS = [8_000, 25_000];

/** GET a URL. Returns null on any failure except a persistent 429, which throws so the caller stops hitting that store. */
export async function get(url: string, accept: "json" | "text" = "json"): Promise<unknown | string | null> {
  let res: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, {
        headers: { ...SCRAPE_HEADERS, "Cache-Control": "no-cache" },
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return null;
    }
    if (res.status !== 429) break;
    if (attempt >= RETRY_WAITS_MS.length) throw new RateLimitedError(`429 from ${new URL(url).host}`);
    const after = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 60_000) : RETRY_WAITS_MS[attempt]);
  }
  if (!res.ok) return null;
  try {
    return accept === "json" ? await res.json() : await res.text();
  } catch {
    return null;
  }
}

// Minimal robots.txt reader: flat Allow/Disallow prefixes under `User-agent: *`.
// Anything it can't read FAILS OPEN — a parsing gap must never silently drop a
// store that was working, only under-enforce.
interface RobotsRules {
  disallow: string[];
  allow: string[];
}
const robotsCache = new Map<string, Promise<RobotsRules | null>>();

async function fetchRobots(base: string): Promise<RobotsRules | null> {
  const text = (await get(`${base}/robots.txt`, "text").catch(() => null)) as string | null;
  if (!text) return null;
  const rules: RobotsRules = { disallow: [], allow: [] };
  let inWildcard = false;
  let sawWildcard = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      inWildcard = value === "*";
      if (inWildcard) sawWildcard = true;
      continue;
    }
    if (!inWildcard) continue;
    if (field === "disallow" && value) rules.disallow.push(value);
    if (field === "allow" && value) rules.allow.push(value);
  }
  return sawWildcard ? rules : null;
}

/** A checker for whether a path may be crawled on this store. One robots.txt fetch per store per run. */
export async function robotsAllows(base: string): Promise<(path: string) => boolean> {
  let pending = robotsCache.get(base);
  if (!pending) {
    pending = fetchRobots(base);
    robotsCache.set(base, pending);
  }
  const rules = await pending;
  if (!rules) return () => true;
  return (path: string) => {
    const longest = (list: string[]) => list.filter((p) => path.startsWith(p)).sort((a, b) => b.length - a.length)[0];
    const dis = longest(rules.disallow);
    if (!dis) return true;
    const allow = longest(rules.allow);
    return !!allow && allow.length >= dis.length;
  };
}
