// How this visitor FIRST arrived in this tab session: "reddit", "search",
// "email"… — a coarse bucket, never the referring URL itself (RiftCompare's
// lib/entry-source.ts, ported in wave 2, 2026-10-03). Reddit is MTG Compare's
// growth channel (the owner posts there). The bucket used to ride each outbound
// click; outbound clicks are no longer recorded (DECISIONS 2026-10-05), so it
// is only kept in the tab's sessionStorage for the sign-up surface.
//
// FIRST TOUCH, captured once per tab (ReferralCapture, mounted in the layout):
// a hard navigation inside the site replaces document.referrer with our own
// origin, so sessionStorage keeps the landing value for the tab.
//
// utm_source WINS over the referrer when it names a known bucket: the Reddit
// and Discord apps often open links with NO referrer at all.

export type EntrySource = "reddit" | "discord" | "search" | "social" | "email" | "internal" | "direct" | "other";
export const ENTRY_SOURCES: readonly EntrySource[] = ["reddit", "discord", "search", "social", "email", "internal", "direct", "other"];

const KEY = "mc_entry";

const BUCKETS: [EntrySource, RegExp][] = [
  ["reddit", /(^|\.)reddit\.com$|(^|\.)redd\.it$|com\.reddit/],
  ["discord", /(^|\.)discord(app)?\.(com|gg|net)$|com\.discord/],
  ["search", /(^|\.)(google|bing|duckduckgo|ecosia|yandex|baidu|startpage|qwant|naver)\.[a-z.]+$|^search\.(yahoo|brave)\.[a-z.]+$/],
  ["social", /(^|\.)(t\.co|x\.com|twitter\.com|facebook\.com|fb\.me|instagram\.com|threads\.net|bsky\.app|youtube\.com|youtu\.be|tiktok\.com|pinterest\.[a-z.]+)$/],
];

const UTM: [EntrySource, RegExp][] = [
  ["reddit", /^reddit/],
  ["discord", /^discord/],
  ["email", /^(email|newsletter)$/],
  ["social", /^(twitter|x|facebook|instagram|threads|bluesky|youtube|tiktok)$/],
];

/** Pure: classify a landing from its referrer, the site's own host and the landing URL's query string. */
export function classifyEntry(referrer: string, host: string, search: string): EntrySource {
  const utm = (new URLSearchParams(search).get("utm_source") ?? "").trim().toLowerCase();
  if (utm) {
    for (const [bucket, re] of UTM) if (re.test(utm)) return bucket;
  }
  if (!referrer) return "direct";
  let refHost = "";
  try {
    refHost = new URL(referrer).host.toLowerCase();
  } catch {
    refHost = referrer.toLowerCase();
  }
  if (refHost === host.toLowerCase()) return "internal";
  for (const [bucket, re] of BUCKETS) if (re.test(refHost) || re.test(referrer.toLowerCase())) return bucket;
  return "other";
}

/** Is this a bucket name (server-side validation of a beacon's `entry`)? */
export function isEntrySource(v: unknown): v is EntrySource {
  return typeof v === "string" && (ENTRY_SOURCES as readonly string[]).includes(v);
}

/** Client: record the landing's bucket once per tab session. */
export function captureEntrySource(): void {
  try {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, classifyEntry(document.referrer, window.location.host, window.location.search));
  } catch {
    // Storage blocked: attribution is a nicety.
  }
}

/** Client: the recorded bucket, capturing it first if the layout's capture has not run yet. */
export function readEntrySource(): EntrySource | undefined {
  captureEntrySource();
  try {
    const v = sessionStorage.getItem(KEY);
    return isEntrySource(v) ? v : undefined;
  } catch {
    return undefined;
  }
}
