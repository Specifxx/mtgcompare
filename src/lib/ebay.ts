// The eBay Browse API client, script-side only. The ONLY file that names an eBay API host (tests/no-ebay-api.test.ts). Imported by lib/ebay-import.ts, which only scripts/ebay.ts runs (from
// .github/workflows/ebay-prices.yml). No page, route or Vercel cron imports it.
//
// OFF until both EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are set. They are GitHub Actions secrets, never on Vercel. In EBAY_KEYSET_MODE=shared the keyset also serves RiftCompare (5,000 Browse
// calls a day for both sites): the run's allowance is decided by lib/ebay-plan.ts allowanceFor (ledger x live remaining - Rift's reserve), never here.
//
// Metering: `spendable` starts at 0, so nothing can call Browse until the run has been given an allowance. spend() runs BEFORE every Browse fetch (a call that then fails still counts);
// the ledger gate (lib/ebay-ledger.ts Claimer) is asked first, so a refused claim sends nothing; a 429 latches the run. Never log the token, the secret or the Basic header.
import { ebayCampaignId } from "./affiliate";
import { PACING_MS } from "./ebay-plan";
import type { QuotaReading } from "./ebay-plan";

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const RATE_URL = "https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_context=buy&api_name=Browse";
const SCOPE = "https://api.ebay.com/oauth/api_scope";
const TIMEOUT_MS = 15_000;
/** Magic: The Gathering Individual Cards (eBay category 183454). */
export const MTG_SINGLES_CATEGORY = "183454";

export const EBAY_MARKETPLACE = { US: "EBAY_US", AU: "EBAY_AU", UK: "EBAY_GB", SG: "EBAY_SG", CA: "EBAY_CA", EU: "EBAY_ES" } as const;
export type EbayMarketplace = (typeof EBAY_MARKETPLACE)[keyof typeof EBAY_MARKETPLACE];
const MARKETPLACE_COUNTRY: Record<EbayMarketplace, string> = { EBAY_US: "US", EBAY_AU: "AU", EBAY_GB: "GB", EBAY_SG: "SG", EBAY_CA: "CA", EBAY_ES: "ES" };

/** True only when BOTH eBay credentials are set. */
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
  timeWindowSec: number | null;
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

/** rateLimits[].resources[name === "buy.browse"].rates[0] -> remaining / limit / reset / timeWindow (seconds). */
export function parseRateLimits(data: unknown): EbayQuota | null {
  const groups = (data as { rateLimits?: { resources?: { name?: string; rates?: { remaining?: number; limit?: number; reset?: string; timeWindow?: number }[] }[] }[] })?.rateLimits ?? [];
  for (const g of groups) {
    for (const r of g.resources ?? []) {
      if (r.name !== "buy.browse") continue;
      const rate = r.rates?.[0];
      if (typeof rate?.remaining !== "number") return null;
      return {
        remaining: rate.remaining,
        limit: typeof rate.limit === "number" ? rate.limit : null,
        reset: rate.reset ?? null,
        timeWindowSec: typeof rate.timeWindow === "number" ? rate.timeWindow : null,
      };
    }
  }
  return null;
}

/** A reading the budget may trust: every field present and numeric, the reset a real date. Anything else is null (shared mode then spends nothing). */
export function trustedQuota(q: EbayQuota | null): QuotaReading | null {
  if (!q || q.limit == null || q.reset == null) return null;
  const reset = new Date(q.reset);
  if (!Number.isFinite(reset.getTime()) || !Number.isFinite(q.remaining) || !Number.isFinite(q.limit)) return null;
  return { remaining: q.remaining, limit: q.limit, reset, timeWindowSec: q.timeWindowSec ?? 86_400 };
}

// ── Metering ─────────────────────────────────────────────────────────────────
let spendable = 0; // NOT Infinity: un-primed callers get nothing
let spent = 0;
let rateLimited = false;
let lastCallAt = 0;
let pacingMs = PACING_MS;
let gate: (() => Promise<boolean>) | null = null;

export function isEbayRateLimited(): boolean {
  return rateLimited;
}
export function ebaySpentThisRun(): number {
  return spent;
}
export function ebaySpendableLeft(): number {
  return spendable;
}

/** Give the run its allowance (once, after the budget is computed). Zero latches the run. */
export function setEbayBudget(n: number): number {
  spent = 0;
  rateLimited = false;
  spendable = Math.max(0, Math.floor(n));
  if (spendable <= 0) rateLimited = true;
  return spendable;
}
/** Lower (never raise) what this run may still spend: the reserve guard. */
export function capEbayBudget(n: number): number {
  spendable = Math.max(0, Math.min(spendable, n));
  if (spendable <= 0) rateLimited = true;
  return spendable;
}
/** The ledger gate: asked before every Browse call; false sends nothing. */
export function setCallGate(g: (() => Promise<boolean>) | null): void {
  gate = g;
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

/** Stop the run for the rest of the window (a 429 elsewhere, or the quota check found Rift spending): nothing more is sent. */
export function latchEbay(): void {
  rateLimited = true;
}

/** Called ONCE per process, at the top of the pass: the token first. If the keys are set but eBay refuses them the run fails red (scripts/ebay.ts) instead of failing every pair in silence. */
export async function openEbayClient(log: (msg: string) => void = () => {}): Promise<{ tokenRefused: boolean }> {
  rateLimited = false;
  spent = 0;
  spendable = 0;
  if (!(await getToken())) {
    rateLimited = true;
    log("eBay token refused: 0 calls");
    return { tokenRefused: true };
  }
  return { tokenRefused: false };
}

// ── Search ───────────────────────────────────────────────────────────────────
export interface BrowseItem {
  itemId?: string;
  legacyItemId?: string;
  title?: string;
  price?: { value?: string; currency?: string };
  buyingOptions?: string[];
  itemLocation?: { country?: string };
  shippingOptions?: { shippingCost?: { value?: string; currency?: string }; shippingCostType?: string }[];
  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;
  condition?: string;
  conditionId?: string;
  image?: { imageUrl?: string };
  itemEndDate?: string;
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
  /** restrict to Magic's single-card category */
  category?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One metered Browse search, sorted by price. Sequential, paced, 15 s timeout, no retries. */
export async function searchBrowse(query: BrowseQuery): Promise<BrowseResult> {
  if (rateLimited) return { status: "rate-limited" };
  const token = await getToken();
  if (!token) return { status: "failed" };
  if (gate && !(await gate())) return { status: "budget" };
  if (!spend()) return { status: "budget" };
  const wait = lastCallAt + pacingMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
  const params = new URLSearchParams({ q: query.q, filter: query.filter, sort: "price", limit: String(query.limit) });
  if (query.category) params.set("category_ids", query.category);
  const campaign = ebayCampaignId();
  const ctx = [campaign ? `affiliateCampaignId=${campaign}` : "", `contextualLocation=country%3D${MARKETPLACE_COUNTRY[query.marketplace]}`].filter(Boolean).join(",");
  try {
    const res = await fetch(`${SEARCH_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": query.marketplace, "X-EBAY-C-ENDUSERCTX": ctx },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 429) {
      rateLimited = true;
      return { status: "rate-limited" };
    }
    if (!res.ok) {
      // eBay's "call limit reached" error id 2001 also arrives as a 4xx with a JSON body: treat it as a 429 (never retry, whatever `remaining` says).
      if (res.status === 403 || res.status === 400) {
        const text = await res.text().catch(() => "");
        if (/"errorId"\s*:\s*2001\b/.test(text)) {
          rateLimited = true;
          return { status: "rate-limited" };
        }
      }
      return { status: "failed", http: res.status };
    }
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
  gate = null;
}
