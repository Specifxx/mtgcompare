// The eBay Browse API client — OP Compare's OWN eBay application, script-side
// only. The ONLY file that names an eBay API host (tests/no-ebay-api.test.ts).
// Imported by lib/ebay-import.ts, which only scripts/ebay.ts runs (from
// .github/workflows/ebay-prices.yml). No page, route or Vercel cron imports it.
//
// OFF until both EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are set. They are GitHub
// Actions secrets on Specifxx/OpCompare holding OP Compare's own App ID / Cert
// ID — never RiftCompare's (that would spend RiftCompare's 5,000 calls a day and
// nothing would fail), and never on Vercel.
//
// Metering: `spendable` starts at 0, so nothing can call Browse until
// primeEbayBudget() has read the live remaining count and set the run's budget.
// spend() runs BEFORE every Browse fetch (a call that then fails still counts);
// a 429 latches the run. Never log the token, the secret or the Basic header.
import { EBAY_CAMPAIGN_ID } from "./affiliate";
import { DEFAULT_DAILY_LIMIT, DEFAULT_MAX_CALLS, DEFAULT_QUOTA_RESERVE, PACING_MS, budgetFor, clampLimits, envInt } from "./ebay-plan";

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const RATE_URL = "https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_context=buy&api_name=Browse";
const SCOPE = "https://api.ebay.com/oauth/api_scope";
const TIMEOUT_MS = 15_000;

export const EBAY_MARKETPLACE = { US: "EBAY_US", AU: "EBAY_AU", UK: "EBAY_GB", SG: "EBAY_SG", CA: "EBAY_CA", EU: "EBAY_ES" } as const;
export type EbayMarketplace = (typeof EBAY_MARKETPLACE)[keyof typeof EBAY_MARKETPLACE];

export { DEFAULT_MAX_CALLS, DEFAULT_QUOTA_RESERVE };

/** True only when BOTH of OP Compare's eBay credentials are set. */
export function isEbayEnabled(): boolean {
  return !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

// ── OAuth (client credentials) ───────────────────────────────────────────────
let cachedToken: { value: string; expiresAt: number } | null = null;

/** An application token, cached until 30 s before it expires. Null when off or refused. */
export async function getToken(): Promise<string | null> {
  if (!isEbayEnabled()) return null;
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) return cachedToken.value;
  try {
    const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&scope=${encodeURIComponent(SCOPE)}`,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000 };
    return cachedToken.value;
  } catch {
    return null;
  }
}

// ── Live quota (Developer Analytics; costs no Browse calls) ──────────────────
export interface EbayQuota {
  remaining: number;
  limit: number | null;
  reset: string | null;
}

export async function fetchRemaining(): Promise<EbayQuota | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await fetch(RATE_URL, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return parseRateLimits(await res.json());
  } catch {
    return null;
  }
}

/** rateLimits[].resources[name === "buy.browse"].rates[0] → remaining / limit / reset. */
export function parseRateLimits(data: unknown): EbayQuota | null {
  const groups = (data as { rateLimits?: { resources?: { name?: string; rates?: { remaining?: number; limit?: number; reset?: string }[] }[] }[] })?.rateLimits ?? [];
  for (const g of groups) {
    for (const r of g.resources ?? []) {
      if (r.name !== "buy.browse") continue;
      const rate = r.rates?.[0];
      if (typeof rate?.remaining !== "number") return null;
      return { remaining: rate.remaining, limit: typeof rate.limit === "number" ? rate.limit : null, reset: rate.reset ?? null };
    }
  }
  return null;
}

// ── Metering ─────────────────────────────────────────────────────────────────
let spendable = 0; // NOT Infinity — un-primed callers get nothing
let spent = 0;
let rateLimited = false;
let lastCallAt = 0;
let pacingMs = PACING_MS;

export function isEbayRateLimited(): boolean {
  return rateLimited;
}
export function ebaySpentThisRun(): number {
  return spent;
}
export function ebaySpendableLeft(): number {
  return spendable;
}

/** Lower (never raise) what this run may still spend — the foreign-spend guard. */
export function capEbayBudget(n: number): number {
  spendable = Math.max(0, Math.min(spendable, n));
  if (spendable <= 0) rateLimited = true;
  return spendable;
}

/** One Browse call's worth of budget, or false (and the latch) when there is none. */
export function spend(): boolean {
  if (spendable <= 0) {
    rateLimited = true;
    return false;
  }
  spendable--;
  spent++;
  return true;
}

export interface PrimeResult {
  remaining: number | null;
  dailyLimit: number;
  reset: string | null;
  budget: number;
  cap: number;
  reserve: number;
  tokenRefused?: true;
}

/**
 * Called ONCE per process, at the top of the eBay pass. Token first: if the
 * keys are set but eBay refuses them, the budget is 0 and the caller fails the
 * run red (scripts/ebay.ts exits 1) instead of "failing" every pair in silence.
 */
export async function primeEbayBudget(log: (msg: string) => void = () => {}, opts: { ourSpend24h?: number } = {}): Promise<PrimeResult> {
  rateLimited = false;
  spent = 0;
  spendable = 0;
  const rawCap = envInt(process.env.EBAY_MAX_CALLS) ?? DEFAULT_MAX_CALLS;
  const rawReserve = envInt(process.env.EBAY_QUOTA_RESERVE) ?? DEFAULT_QUOTA_RESERVE;
  if (!(await getToken())) {
    rateLimited = true;
    log("eBay token refused — 0 calls");
    return { remaining: null, dailyLimit: DEFAULT_DAILY_LIMIT, reset: null, budget: 0, cap: rawCap, reserve: rawReserve, tokenRefused: true };
  }
  const q = await fetchRemaining();
  const remaining = q?.remaining ?? null;
  const dailyLimit = q?.limit ?? DEFAULT_DAILY_LIMIT;
  const { cap, reserve } = clampLimits(rawCap, rawReserve, dailyLimit, log);
  spendable = budgetFor(remaining, cap, reserve, process.env.EBAY_DISPATCH_CAP, log, { dailyLimit, ourSpend24h: opts.ourSpend24h ?? 0 });
  if (spendable <= 0) rateLimited = true;
  log(
    `eBay quota: ${remaining == null ? `unknown (assumed ${dailyLimit} a day, ${opts.ourSpend24h ?? 0} spent by us in 24h)` : `${remaining}/${dailyLimit}`} remaining → budget ${spendable} (cap ${cap}, reserve ${reserve})` +
      (q?.reset ? `; eBay resets at ${q.reset}` : ""),
  );
  return { remaining, dailyLimit, reset: q?.reset ?? null, budget: spendable, cap, reserve };
}

// ── Search ───────────────────────────────────────────────────────────────────
export interface BrowseItem {
  itemId?: string;
  title?: string;
  price?: { value?: string; currency?: string };
  buyingOptions?: string[];
  itemLocation?: { country?: string };
  shippingOptions?: { shippingCost?: { value?: string; currency?: string } }[];
  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;
  condition?: string;
  conditionId?: string;
  image?: { imageUrl?: string };
}

export type BrowseResult =
  | { status: "ok"; items: BrowseItem[]; total: number }
  | { status: "failed"; http?: number }
  | { status: "rate-limited" }
  | { status: "budget" };

export interface BrowseQuery {
  marketplace: EbayMarketplace;
  q: string;
  filter: string;
  limit: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One metered Browse search, sorted by price. Sequential, paced, 15 s timeout, no retries. */
export async function searchBrowse(query: BrowseQuery): Promise<BrowseResult> {
  if (rateLimited) return { status: "rate-limited" };
  const token = await getToken();
  if (!token) return { status: "failed" };
  if (!spend()) return { status: "budget" };
  const wait = lastCallAt + pacingMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
  const params = new URLSearchParams({ q: query.q, filter: query.filter, sort: "price", limit: String(query.limit) });
  try {
    const res = await fetch(`${SEARCH_URL}?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": query.marketplace,
        "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${EBAY_CAMPAIGN_ID}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 429) {
      rateLimited = true;
      return { status: "rate-limited" };
    }
    if (!res.ok) return { status: "failed", http: res.status };
    const data = (await res.json()) as { itemSummaries?: BrowseItem[]; total?: number };
    const items = Array.isArray(data.itemSummaries) ? data.itemSummaries : [];
    return { status: "ok", items, total: typeof data.total === "number" ? data.total : items.length };
  } catch {
    // A timeout or network error: the call is already charged, the pair is not completed.
    return { status: "failed" };
  }
}

/** Tests only: reset the module's token cache and meter (and, optionally, skip the pacing sleep). */
export function resetEbayClientForTests(opts: { pacingMs?: number } = {}): void {
  pacingMs = opts.pacingMs ?? PACING_MS;
  cachedToken = null;
  spendable = 0;
  spent = 0;
  rateLimited = false;
  lastCallAt = 0;
}
