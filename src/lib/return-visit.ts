// The return-visit beacon (retention programme, owner 2026-11-18: "we want new visitors and we want to retain those visitors").
// Vercel Web Analytics cannot tell a returning visitor from a new one, so each site keeps one small record in localStorage
// (`rv`: first visit day, last visit day, visit days) and sends ONE `return_visit` event the first time a RETURNING visitor
// opens the site on a new day. New visitors send nothing (Vercel's own visitor count is the denominator), so this costs at
// most one event per returning visitor per day. Nothing leaves the browser but buckets: no id, no date, no URL.
// Read it as: returning share = return_visit / visitors; `k` = "<days since last visit>:<page type they came back to>",
// `age` = days since first visit (the 7- and 30-day return windows), `via` = how they came back, and each live test's arm
// (`rn`, `ln`, `share`, `cart`, `watch`) so every retention lever reads its return rate on against off.
// Pure helpers; the component is components/ReturnBeacon.tsx. Identical file in every Compare repo.
export const RV_KEY = "rv";
const REGIONS = new Set(["au", "us", "uk", "gb", "ca", "nz", "eu", "sg", "jp", "de", "fr"]);

export interface VisitRecord {
  f: string; // first visit day, YYYY-MM-DD in the visitor's own time zone
  l: string; // last visit day
  n: number; // visit days so far
}

export function dayOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

export function parseRecord(raw: string | null): VisitRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as VisitRecord;
    const ok = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!ok(r.f) || !ok(r.l) || typeof r.n !== "number" || r.n < 1) return null;
    return { f: r.f, l: r.l, n: Math.floor(r.n) };
  } catch {
    return null;
  }
}

/** Days since the last visit, bucketed. */
export function gapBucket(days: number): string {
  if (days <= 1) return "1d";
  if (days <= 7) return "2-7d";
  if (days <= 30) return "8-30d";
  return "31d+";
}

/** Days since the first visit, bucketed (the 7- and 30-day return windows). */
export function ageBucket(days: number): string {
  if (days <= 7) return "1-7d";
  if (days <= 30) return "8-30d";
  return "31d+";
}

export function visitsBucket(n: number): string {
  return n >= 10 ? "10+" : n >= 5 ? "5-9" : String(n);
}

/** The kind of page: the path's first segment (after a region prefix), short and safe. */
export function pageType(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean).map((p) => p.toLowerCase());
  if (parts.length && REGIONS.has(parts[0])) parts.shift();
  const first = parts[0] ?? "home";
  return /^[a-z0-9-]{1,24}$/.test(first) ? first : "other";
}

/** How the visitor came back: a bookmark or typed URL, search, email, social, another of our sites, or elsewhere. */
export function viaOf(referrer: string, search: string, ownHost: string): string {
  const q = new URLSearchParams(search);
  const medium = (q.get("utm_medium") ?? "").toLowerCase();
  const source = (q.get("utm_source") ?? "").toLowerCase();
  if (medium === "email" || source === "email" || source.includes("alert") || source.includes("digest")) return "email";
  if (source === "share") return "share";
  if (source === "pwa" || source === "homescreen") return "homescreen";
  if (source === "rss" || source === "discord" || source === "telegram") return source;
  let host = "";
  try {
    host = referrer ? new URL(referrer).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  if (!host || host === ownHost.replace(/^www\./, "")) return "direct";
  if (/(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|yandex|baidu)\./.test(host)) return "search";
  if (/(chatgpt|openai|perplexity|claude|gemini|copilot)/.test(host)) return "ai";
  if (/(reddit|facebook|instagram|t\.co|twitter|x\.com|youtube|tiktok|discord)/.test(host)) return "social";
  if (/(mail\.|outlook|gmail)/.test(host)) return "email";
  return "other";
}

export interface Step {
  next: VisitRecord;
  /** The event to send, or null (a new visitor, or a second visit the same day). */
  event: Record<string, string> | null;
}

/** Advance the record for a page view today; a returning visitor's first view of the day yields one event. */
export function step(prev: VisitRecord | null, today: string, page: string, via: string): Step {
  if (!prev) return { next: { f: today, l: today, n: 1 }, event: null };
  if (prev.l === today) return { next: prev, event: null };
  const gap = daysBetween(prev.l, today);
  if (gap < 0) return { next: { ...prev, l: today }, event: null }; // clock moved back: record, don't count
  const next = { f: prev.f, l: today, n: prev.n + 1 };
  return {
    next,
    event: {
      k: `${gapBucket(gap)}:${page}`,
      age: ageBucket(daysBetween(prev.f, today)),
      n: visitsBucket(next.n),
      via,
    },
  };
}

/** The arms of the live 50/50 tests, so each lever's return rate reads on against off. */
export const ARM_KEYS: Record<string, string> = {
  rn: "rn-arm",
  ln: "ln-arm",
  share: "share_arm",
  cart: "cart-arm",
  watch: "watch-arm",
};
