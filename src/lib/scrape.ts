// Outbound scraping helpers, ported from RiftCompare's lib/scrape-http.ts:
// an honest User-Agent that names the site and where to read about it, a From
// header when a real contact address is configured, a polite per-store delay,
// 429 backoff and a robots.txt check that fails OPEN (a parsing gap can never
// block a store that was working; it can only under-enforce).
import { CONTACT_EMAIL } from "./site";

export const SCRAPE_USER_AGENT = "MTGCompare/1.0 (+https://github.com/Specifxx/mtgcompare; price comparison)";

export const SCRAPE_HEADERS: Record<string, string> = {
  "User-Agent": SCRAPE_USER_AGENT,
  Accept: "application/json, text/plain, */*",
  // The placeholder contact address ends in .invalid: never send it.
  ...(CONTACT_EMAIL.endsWith(".invalid") ? {} : { From: CONTACT_EMAIL }),
};

export const REQUEST_DELAY_MS = 300;

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isRateLimited(res: Response): boolean {
  return res.status === 429;
}

export async function fetchWithTimeout(url: string, ms = 20000, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, headers: { ...SCRAPE_HEADERS, ...(init.headers as Record<string, string>) }, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(url);
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

interface RobotsRules {
  disallow: string[];
  allow: string[];
}
const robotsCache = new Map<string, Promise<RobotsRules | null>>();

async function fetchRobots(base: string): Promise<RobotsRules | null> {
  const text = await fetchText(`${base}/robots.txt`);
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

/**
 * A GET with one retry after a pause (a transient 5xx or a dropped connection),
 * never retrying a 404 or a 429. Null = no response at all.
 */
export async function getWithRetry(url: string, opts: { timeoutMs?: number; headers?: Record<string, string>; retryDelayMs?: number } = {}): Promise<{ status: number; text: string } | null> {
  let last: { status: number; text: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(opts.retryDelayMs ?? REQUEST_DELAY_MS * 4);
    try {
      const res = await fetchWithTimeout(url, opts.timeoutMs ?? 25000, { headers: { "Cache-Control": "no-cache", ...opts.headers }, cache: "no-store" });
      last = { status: res.status, text: await res.text() };
      if (res.ok || res.status === 404 || isRateLimited(res)) return last;
    } catch {
      // timed out or dropped: try once more
    }
  }
  return last;
}

/**
 * HTML entities in a scraped title ("Kid &amp; Killer", "Ain&#x27;t"), ported
 * from RiftCompare's lib/woocommerce.ts: a small fixed table plus numeric
 * escapes, because the matcher reads titles character by character.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&pound;/g, "£")
    .replace(/&euro;/g, "€")
    .replace(/&amp;/g, "&");
}

/** At most `n` of these tasks run at once (one platform's shared servers, say). */
export function limiter(n: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    // A finishing task hands its slot straight to the next waiter.
    if (active >= n) await new Promise<void>((r) => queue.push(r));
    else active++;
    try {
      return await fn();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  };
}
