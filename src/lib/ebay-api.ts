// eBay's Browse API client: OAuth token, search request, errors. IMPORTER ONLY.
//
// SERVER/CI ONLY, and in practice GitHub Actions only: this is the single module that reads
// EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (DEXCOMPARE_EBAY_CLIENT_ID / _SECRET take precedence when set).
// Only scripts/ebay-import.ts, scripts/ebay-check.ts, src/lib/ebay-import.ts and tests/ import it; nothing under
// src/app or src/components may (tests/ebay-api.test.ts fails if one does). The web runtime reads the
// EbayListing table and holds no eBay credential at all.
//
// ─── What eBay's documentation and licence say (read 2026-10-05/07) and how each rule is met ───
//
// Sources
//   [spec]  Browse API OpenAPI v1.20.4, https://developer.ebay.com/develop/api/spec/browse_api.json
//   [lic]   eBay API License Agreement, https://www.edp.ebay.com/join/api-license-agreement
//   [req]   Buy APIs Requirements, https://www.developer.ebay.com/api-docs/buy/buy-requirements.html
//   [filt]  Buy API field filters, https://developer.ebay.com/api-docs/buy/static/ref-buy-browse-filters.html
//   [limits] API call limits, https://developer.ebay.com/develop/get-started/api-call-limits
//
// Request
//   • Token: POST https://api.ebay.com/identity/v1/oauth2/token, Basic auth (id:secret), form body
//     grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope. Reply {access_token,
//     expires_in (7200)}. A run needs one token; it is refreshed once on a 401.
//   • Search: GET https://api.ebay.com/buy/browse/v1/item_summary/search  q (<=100 chars), limit (1..200),
//     filter, header X-EBAY-C-MARKETPLACE-ID, header X-EBAY-C-ENDUSERCTX
//     "affiliateCampaignId=<EPN campaign>,affiliateReferenceId=<ref>" so each item carries
//     itemAffiliateWebUrl. <ref> is set PER FEED (dex-us-chase, dex-au-item: ebay-context.ts feedReference): eBay copies it into
//     the URL's customid, EPN reports by it, and the URL is then used exactly as returned (the spec says to).
//   • Filter: buyingOptions:{FIXED_PRICE}, price:[<min>..] with priceCurrency:<ISO>, deliveryCountry:<ISO-2>.
//     The open-ended range "[N..]" is the documented syntax for a lower bound; it could not be exercised
//     without a keyset, so a 400 on a search that carries a price filter makes the importer retry that
//     search once WITHOUT it (the title/price checks after the search do the same work). See ebay-import.ts.
//
// Daily limit [limits]: 5,000 Browse calls per application per day, shared with the owner's other site. The
// counter resets at midnight Pacific time (apis.io's summary of eBay's limits; developer.ebay.com blocked this
// sandbox, so the official page itself was not read: the Analytics API's getRateLimits returns the exact
// reset). Token requests belong to the identity API, not the Browse API, and nothing says they count; the
// importer budgets 400 calls a day of slack anyway.
import { EBAY_CAMPAIGN_ID } from "./affiliate";
import { MARKETPLACES, type MarketplaceId } from "./ebay-context";

// ─── Constants ─────────────────────────────────────────────────────────────────

/** The only host this module ever talks to. There is deliberately no override. */
export const API_BASE = "https://api.ebay.com";
export const TOKEN_URL = `${API_BASE}/identity/v1/oauth2/token`;
export const SEARCH_URL = `${API_BASE}/buy/browse/v1/item_summary/search`;
export const OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";

export const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_EARLY_MS = 5 * 60_000;
/** Refresh a token this long before it expires: 5 minutes, or a tenth of a short-lived token's life. */
export const tokenMargin = (secs: number) => Math.min(TOKEN_EARLY_MS, (secs * 1000) / 10);

// ─── Configuration ─────────────────────────────────────────────────────────────

export interface EbayEnv {
  EBAY_CLIENT_ID?: string;
  EBAY_CLIENT_SECRET?: string;
  DEXCOMPARE_EBAY_CLIENT_ID?: string;
  DEXCOMPARE_EBAY_CLIENT_SECRET?: string;
}

/** The keys to use: DEXCOMPARE_EBAY_* when set, else the owner's EBAY_CLIENT_ID / EBAY_CLIENT_SECRET. Trimmed; empty strings count as unset. */
export function credentials(env: EbayEnv): { id: string; secret: string } {
  const pick = (a?: string, b?: string) => (a ?? "").trim() || (b ?? "").trim();
  return { id: pick(env.DEXCOMPARE_EBAY_CLIENT_ID, env.EBAY_CLIENT_ID), secret: pick(env.DEXCOMPARE_EBAY_CLIENT_SECRET, env.EBAY_CLIENT_SECRET) };
}

/** True when both keys are set. Presence only: the values are never used here. */
export function keysPresent(env: EbayEnv = process.env as EbayEnv): boolean {
  const c = credentials(env);
  return !!c.id && !!c.secret;
}

export interface Deps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  now: () => number;
  env: EbayEnv;
}

export const realDeps = (): Deps => ({
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  env: process.env as EbayEnv,
});

// ─── Errors ────────────────────────────────────────────────────────────────────

/**
 * Every failure is one of these: a fixed code and an HTTP status, never eBay's body, a
 * header, a URL or anything of the credentials. The message is the code.
 */
export class EbayError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly retryAfterMs: number | null;
  /** eBay's OAuth error category (a fixed list, never eBay's free text), when it sent one. */
  readonly detail: string | null;
  constructor(code: string, status: number | null = null, retryAfterMs: number | null = null, detail: string | null = null) {
    super(code);
    this.name = "EbayError";
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.detail = detail;
  }
  /** "token-http-401:invalid_client": the code and, when there is one, the OAuth category. Nothing else. */
  describe(): string {
    return this.detail ? `${this.code}:${this.detail}` : this.code;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// The OAuth error categories (RFC 6749 §5.2) eBay's token endpoint answers with. Only a member of
// this list is ever reported, so no free text, id or secret can leak.
const OAUTH_ERRORS = new Set(["invalid_client", "invalid_request", "invalid_grant", "invalid_scope", "unauthorized_client", "unsupported_grant_type", "access_denied", "temporarily_unavailable"]);

async function oauthError(res: Response): Promise<string | null> {
  try {
    const b: unknown = await res.json();
    const e = isRecord(b) ? b.error : null;
    return typeof e === "string" && OAUTH_ERRORS.has(e) ? e : null;
  } catch {
    return null;
  }
}

function retryAfter(res: Response): number | null {
  const v = res.headers.get("retry-after");
  const s = v ? Number(v) : NaN;
  return Number.isFinite(s) && s >= 0 ? Math.min(s, 3600) * 1000 : null;
}

// ─── Token manager ─────────────────────────────────────────────────────────────

export interface TokenManager {
  /** A valid token: cached, or fetched once however many callers ask at the same time. */
  get(): Promise<string>;
  /** After a 401 for `bad`: a fresh token (single-flight; a token already replaced since is reused, not fetched again). */
  refresh(bad: string): Promise<string>;
  /** Drop the cache (for tests). */
  reset(): void;
}

export function createTokenManager(deps: Deps): TokenManager {
  let token: { value: string; expiresAt: number } | null = null;
  let inflight: Promise<string> | null = null;

  async function fetchToken(): Promise<string> {
    const { id, secret } = credentials(deps.env);
    if (!id || !secret) throw new EbayError("no-keys");
    let res: Response;
    try {
      res = await deps.fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        },
        body: new URLSearchParams({ grant_type: "client_credentials", scope: OAUTH_SCOPE }).toString(),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new EbayError("token-network");
    }
    if (!res.ok) throw new EbayError(`token-http-${res.status}`, res.status, retryAfter(res), await oauthError(res));
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new EbayError("token-malformed");
    }
    const t = isRecord(body) ? body : {};
    if (typeof t.access_token !== "string" || t.access_token.length < 8 || t.access_token.length > 4096) throw new EbayError("token-malformed");
    const secs = typeof t.expires_in === "number" && Number.isFinite(t.expires_in) ? Math.min(Math.max(t.expires_in, 60), 7200) : 3600;
    token = { value: t.access_token, expiresAt: deps.now() + secs * 1000 - tokenMargin(secs) };
    return token.value;
  }

  function single(): Promise<string> {
    if (!inflight) inflight = fetchToken().finally(() => (inflight = null));
    return inflight;
  }

  return {
    async get() {
      if (token && deps.now() < token.expiresAt) return token.value;
      return single();
    },
    async refresh(bad: string) {
      if (token && token.value !== bad && deps.now() < token.expiresAt) return token.value;
      if (token && token.value === bad) token = null;
      return single();
    },
    reset() {
      token = null;
      inflight = null;
    },
  };
}

// ─── Search ────────────────────────────────────────────────────────────────────

export interface SearchSpec {
  /** The query, already prefixed ("Pokemon …"); at most 100 characters (longer is cut). */
  q: string;
  marketplace: MarketplaceId;
  /** 1..200 */
  limit: number;
  /** Lower price bound in the marketplace's own currency; null = no price filter. */
  minPrice: number | null;
  /** The affiliateReferenceId of this search's feed (feedReference); the default for a check or a test is AFFILIATE_REFERENCE. */
  ref?: string;
  /** The page: results to skip (the catalogue sweep pages through a search 200 at a time). eBay serves offset + limit <= 10,000. */
  offset?: number;
}

/** The deepest a search can be paged: eBay's Browse search answers at most offset + limit = 10,000. */
export const MAX_SEARCH_DEPTH = 10_000;

export function searchFilter(marketplace: MarketplaceId, minPrice: number | null): string {
  const m = MARKETPLACES[marketplace];
  return [
    "buyingOptions:{FIXED_PRICE}",
    ...(minPrice != null ? [`price:[${Math.max(1, Math.floor(minPrice))}..]`, `priceCurrency:${m.currency}`] : []),
    `deliveryCountry:${m.country}`,
  ].join(",");
}

export function buildSearchUrl(spec: SearchSpec): string {
  const u = new URL(SEARCH_URL);
  u.searchParams.set("q", spec.q.slice(0, 100));
  u.searchParams.set("limit", String(Math.min(Math.max(Math.floor(spec.limit), 1), 200)));
  u.searchParams.set("filter", searchFilter(spec.marketplace, spec.minPrice));
  const offset = Math.floor(spec.offset ?? 0);
  if (offset > 0) u.searchParams.set("offset", String(Math.min(offset, MAX_SEARCH_DEPTH - 1)));
  return u.toString();
}

/** The sub-id for a search that belongs to no feed (scripts/ebay-check.ts); the importer sets one per feed (ebay-context.ts feedReference). */
export const AFFILIATE_REFERENCE = "dex-check";

/** Only a sub-id of the shape feedReference makes is sent: lower case letters, digits and "-", at most 60 characters. */
export const isReference = (v: string) => /^[a-z0-9][a-z0-9-]{0,59}$/.test(v);

export function searchHeaders(token: string, marketplace: MarketplaceId, ref: string = AFFILIATE_REFERENCE): Record<string, string> {
  const reference = isReference(ref) ? ref : AFFILIATE_REFERENCE;
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Accept-Language": MARKETPLACES[marketplace].lang,
    "X-EBAY-C-MARKETPLACE-ID": marketplace,
    "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${EBAY_CAMPAIGN_ID},affiliateReferenceId=${reference}`,
  };
}

/**
 * ONE search (one Browse call; the caller has already reserved it): the raw itemSummaries, at most the spec's limit (200). A 401
 * refreshes the token once and repeats the request (that repeat is a second call: the importer reserves it
 * through `onRetry`). Throws EbayError for anything else: `search-http-<status>` (429 carries Retry-After),
 * `search-network`, `search-malformed` (not JSON, or not an object), `search-warning` (200, no listings, eBay warns).
 */
export async function searchOnce(deps: Deps, tokens: TokenManager, spec: SearchSpec, onRetry?: () => Promise<boolean>): Promise<unknown[]> {
  return (await searchPage(deps, tokens, spec, onRetry)).items;
}

/** searchOnce, plus eBay's `total` (how many listings match the search, as eBay estimates it; null when absent): the sweep's paging. */
export async function searchPage(deps: Deps, tokens: TokenManager, spec: SearchSpec, onRetry?: () => Promise<boolean>): Promise<{ items: unknown[]; total: number | null }> {
  let token = await tokens.get();
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await deps.fetch(buildSearchUrl(spec), { headers: searchHeaders(token, spec.marketplace, spec.ref), cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw new EbayError("search-network");
    }
    if (res.status === 401 && attempt === 0) {
      if (onRetry && !(await onRetry())) throw new EbayError("search-http-401", 401);
      token = await tokens.refresh(token); // once; a second 401 is a failure
      continue;
    }
    if (!res.ok) throw new EbayError(`search-http-${res.status}`, res.status, retryAfter(res));
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new EbayError("search-malformed");
    }
    if (!isRecord(body)) throw new EbayError("search-malformed"); // not even a JSON object: not an answer from the Browse API
    const items = Array.isArray(body.itemSummaries) ? body.itemSummaries : [];
    // HTTP 200, no listings AND eBay warns (an unsupported filter or parameter it ignored, a degraded index): that is not "nothing
    // matches", it is a search that did not work. Counted by the circuit breaker like an error; only the fixed code is ever reported.
    if (!items.length && Array.isArray(body.warnings) && body.warnings.length) throw new EbayError("search-warning", res.status);
    const total = typeof body.total === "number" && Number.isFinite(body.total) && body.total >= 0 ? Math.floor(body.total) : null;
    return { items: items.slice(0, Math.min(Math.max(Math.floor(spec.limit), 1), 200)), total };
  }
}

// ─── The application's own call counter (diagnostics only) ─────────────────────

export const RATE_LIMIT_URL = `${API_BASE}/developer/analytics/v1_beta/rate_limit/?api_context=buy&api_name=Browse`;

export interface RateWindow {
  count: number;
  limit: number;
  remaining: number;
  /** ISO time the window resets, when eBay says. */
  reset: string | null;
  /** seconds */
  timeWindow: number | null;
}

/**
 * eBay's own view of the Browse API's daily allowance for this application (Analytics API getRateLimits, same client-credentials
 * token): counts, limit, remaining and the exact RESET time, which includes the calls the owner's other site makes with the same
 * keyset (the importer's EbayCallDay counter cannot see those). Used by scripts/ebay-check.ts and ebay-budget.ts to verify the
 * assumption that the budget day is the Pacific one. Numbers only; null when the call or the shape fails. Not a Browse call.
 */
export async function getRateLimits(deps: Deps, tokens: TokenManager): Promise<RateWindow[] | null> {
  try {
    const token = await tokens.get();
    const res = await deps.fetch(RATE_LIMIT_URL, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const out: RateWindow[] = [];
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    for (const lim of isRecord(body) && Array.isArray(body.rateLimits) ? body.rateLimits : []) {
      for (const res of isRecord(lim) && Array.isArray(lim.resources) ? lim.resources : []) {
        for (const r of isRecord(res) && Array.isArray(res.rates) ? res.rates : []) {
          if (!isRecord(r)) continue;
          const count = num(r.count);
          const limit = num(r.limit);
          const remaining = num(r.remaining);
          if (count == null || limit == null || remaining == null) continue;
          const reset = typeof r.reset === "string" && Number.isFinite(Date.parse(r.reset)) ? new Date(r.reset).toISOString() : null;
          out.push({ count, limit, remaining, reset, timeWindow: num(r.timeWindow) });
        }
      }
    }
    return out;
  } catch {
    return null;
  }
}
