// The outbound click log (contract 10.32, REQUIREMENTS 9 and 11), restored: OP deleted it on 2026-10-05 because every click was a database write. What
// answers that reason here is the shape, not the absence of the feature:
//   * a click is a small POST to /api/click that the route answers 204 at once; it appends a ClickRow to a bounded buffer in the instance (ClickBatcher,
//     plane/view-beacon.ts) and writes nothing;
//   * the buffer is flushed in ONE multi-row insert inside the first minute of each wall-clock half hour, the same window the card-view counter uses, so views
//     and clicks TOGETHER wake the database at most 48 times a day however many instances run (12.12); rows in an instance that is frozen before the window
//     are lost, which a sampled analytics log accepts;
//   * CLICK_LOG=0 switches the log off, CLICK_SAMPLE_RATE (0..1) samples it, crawlers and an empty user agent never count;
//   * a row is retailer, page, slug, country and the entry bucket: no user id (the column stays null), no IP, no URL, no referrer; a 90-day sweep rides the
//     same flush, once a day, so the table stays small (~12 MB at 100,000 rows).
// GA's and Vercel's `buy_click` (GoogleAnalytics, ConsentGatedAnalytics) are separate and unaffected.
//
// SERVER ONLY: this is the one module that writes the log (the route is under src/app, which may not import @/lib/db, so it calls flushClicks here). The browser
// side, components/OutboundBeacon.tsx, imports nothing from this file and builds its body from the pure lib/buy-click.ts and lib/entry-source.ts.
import { prisma } from "./db";
import { COUNTRY_COOKIE, DEFAULT_COUNTRY, normalizeCountry, type Country } from "./country";
import { isEntrySource } from "./entry-source";
import { isLikelyBot } from "./data/plane/crawler";
import { CLICK_DEFAULTS, ClickBatcher, type ClickConfig, type ClickRow } from "./data/plane/view-beacon";

export const CLICK_ENDPOINT = "/api/click";
/** The most a beacon body may weigh; anything bigger is not ours. */
export const CLICK_BODY_MAX_BYTES = 2048;
/** Retention of ClickEvent rows (contract 2.8). */
export const CLICK_RETENTION_DAYS = 90;
/** Per IP and hour: far above a person who opens a few shops, low enough that a loop cannot fill the buffer on its own. */
export const CLICK_IP_LIMIT = 120;

// ── configuration ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The three settings, as the strings the route reads from its environment (tests/fixtures/env-names.json: CLICK_LOG and CLICK_SAMPLE_RATE are read in src/app/api/click/route.ts only, VIEW_FLUSH_MINUTES is shared with the view counter). */
export interface ClickSettings { log?: string; sampleRate?: string; flushMinutes?: string }
/** CLICK_LOG (default on; "0" is off), CLICK_SAMPLE_RATE (0..1, default 1) and VIEW_FLUSH_MINUTES (default 30) become the batcher's config. A bad value falls back to the default. */
export function clickConfig(s: ClickSettings = {}): ClickConfig {
  const rate = s.sampleRate === undefined || s.sampleRate.trim() === "" ? NaN : Number(s.sampleRate);
  const sample = Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : CLICK_DEFAULTS.sampleRate;
  const minutes = Number(s.flushMinutes);
  return { ...CLICK_DEFAULTS, sampleRate: s.log === "0" ? 0 : sample, flushMinutes: Number.isInteger(minutes) && minutes >= 1 && minutes <= 60 ? minutes : CLICK_DEFAULTS.flushMinutes };
}
export const clickLogOn = (s: ClickSettings = {}): boolean => clickConfig(s).sampleRate > 0;

// ── what a click is ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const RETAILER = /^[a-z0-9][a-z0-9:_.-]{0,59}$/;     // "store:cardkingdom", "tcgplayer", "ebay", "ebay_search", "ebay_chase", "buy_list" ...
const PAGE = /^[a-z0-9][a-z0-9_-]{0,39}$/;           // the page type: "card", "sealed", "price-guide", "home" ...
const SLUG = /^[a-z0-9-]{1,160}$/;                   // a card or sealed slug

const clip = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().toLowerCase().slice(0, max) : "");
/** Country of the request: the visitor's `country` cookie (their market), else Vercel's geo header, else the default. */
export function countryOfRequest(cookieHeader: string | null | undefined, geoHeader: string | null | undefined): Country {
  const m = new RegExp(`(?:^|;\\s*)${COUNTRY_COOKIE}=([^;]*)`).exec(cookieHeader ?? "");
  if (m) { try { return normalizeCountry(decodeURIComponent(m[1]!)); } catch { /* fall through */ } }
  return geoHeader ? normalizeCountry(geoHeader) : DEFAULT_COUNTRY;
}
/**
 * A beacon body to a ClickRow, or null when it is not a click of ours. Never trusts the client: every field is clipped and matched, the country is the
 * server's own reading of the request, and the user id is always null (the log is anonymous). `page` falls back to the referring page type the caller gives.
 */
export function parseClickBody(raw: unknown, country: Country, fallbackPage = "home"): ClickRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  const retailer = typeof b.retailer === "string" ? b.retailer.trim().toLowerCase() : "";
  if (!RETAILER.test(retailer)) return null;                                 // too long is not a retailer key: refused, never cut to fit
  const page = clip(b.page, 40), card = clip(b.card, 160);
  return {
    retailer,
    page: PAGE.test(page) ? page : PAGE.test(fallbackPage) ? fallbackPage : "home",
    slug: SLUG.test(card) ? card : null,
    country,
    userId: null,
    entry: isEntrySource(b.entry) ? b.entry : null,
  };
}
/** The page type of a same-origin Referer ("https://x/card/sol-ring-c21" -> "card", the home page -> "home"); "home" for anything else. */
export function pageOfReferer(referer: string | null | undefined, host: string | null | undefined): string {
  try {
    const u = new URL(referer ?? "");
    if (host && u.host !== host) return "home";
    return u.pathname.split("/")[1] || "home";
  } catch {
    return "home";
  }
}
/** Is this POST from a page of this site? A browser sends Origin on a beacon; no Origin (an old client, curl) passes only when the Referer is ours too. */
export function sameOrigin(origin: string | null | undefined, referer: string | null | undefined, host: string | null | undefined): boolean {
  if (!host) return false;
  for (const v of [origin, referer]) {
    if (!v) continue;
    try { return new URL(v).host === host; } catch { return false; }
  }
  return false;
}

// ── the buffer and its flush ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A row with the moment of the click, so the half-hour delay of the flush does not move it in the admin's table. The extra field rides inside the batcher's rows. */
export type TimedClick = ClickRow & { at: number };
/** The two statements the flush uses (the Prisma client satisfies it; tests pass a fake). */
export interface ClickDb {
  clickEvent: {
    createMany(args: { data: { retailer: string; page: string; slug: string | null; country: string; userId: string | null; entry: string | null; createdAt: Date }[] }): Promise<unknown>;
    deleteMany(args: { where: { createdAt: { lt: Date } } }): Promise<unknown>;
  };
}

let shared: ClickBatcher | null = null;
/** The instance's one buffer. Built on the first call with the settings it is given (the route's); the clock and the random source are the real ones. */
export function getClickBatcher(settings: ClickSettings = {}): ClickBatcher {
  return (shared ??= new ClickBatcher(() => Date.now(), Math.random, clickConfig(settings)));
}
/** Test hook. */
export function resetClickBatcherForTests(): void { shared = null; lastSweepDay = ""; }

/** Append a click. false = not logged (off, a bot, not sampled, buffer full). Never throws, never touches the database. */
export function recordClick(batcher: ClickBatcher, row: ClickRow, userAgent: string | null | undefined, now: number = Date.now()): boolean {
  const timed: TimedClick = { ...row, at: now };
  return batcher.record(timed, isLikelyBot(userAgent));
}

let lastSweepDay = "";
/**
 * Write the buffer if this is the window (ClickBatcher.due: the first minute of a wall-clock half hour, once per period): ONE createMany for every pending
 * row, then, once per UTC day per instance, the 90-day sweep. Returns the number of rows written. Every failure is swallowed: a log that cannot be written
 * costs rows, never a request. The caller awaits it in a route handler (not in a render), so the insert finishes before the function can be frozen.
 */
export async function flushClicks(batcher: ClickBatcher, db: ClickDb = prisma, now: number = Date.now()): Promise<number> {
  if (!batcher.due()) return 0;
  const rows = batcher.drain() as TimedClick[];
  if (!rows.length) return 0;
  let written = 0;
  try {
    await db.clickEvent.createMany({ data: rows.map((r) => ({ retailer: r.retailer, page: r.page, slug: r.slug, country: r.country, userId: null, entry: r.entry, createdAt: new Date(typeof r.at === "number" ? r.at : now) })) });
    written = rows.length;
  } catch {
    /* the rows are gone: an analytics log accepts that */
  }
  const day = new Date(now).toISOString().slice(0, 10);
  if (day !== lastSweepDay) {
    lastSweepDay = day;
    try { await db.clickEvent.deleteMany({ where: { createdAt: { lt: new Date(now - CLICK_RETENTION_DAYS * 86_400_000) } } }); } catch { /* next day */ }
  }
  return written;
}
