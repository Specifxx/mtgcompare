// THE EMAIL MODULE — RiftCompare's lib/email.ts, ported for OP Compare in wave 2
// (2026-10-03; DECISIONS.md, "Email: OP's own Resend account, script-side, off
// until configured"). What differs from RiftCompare:
//
//   • SCRIPT-SIDE ONLY. Every send runs in GitHub Actions (scripts/alerts.ts,
//     scripts/email-hourly.ts, scripts/newsletter.ts). No page or route imports
//     a send* function (tests/no-email-api.test.ts), and the provider keys are
//     GitHub Actions secrets, never Vercel env vars.
//   • OFF UNTIL CONFIGURED, like the eBay keyset: isEmailEnabled() needs BOTH
//     RESEND_API_KEY and EMAIL_FROM. Unset, every send returns false and warns
//     once, the runs are green no-ops that still advance their state, and the
//     site promises no email (getEmailStatus in lib/data.ts). A key that is set
//     but REFUSED (401/403) is recorded in getLastEmailError() and providerRefused(),
//     and the runner fails the run red.
//   • OP Compare's own Resend account — never RiftCompare's (its 100/day quota
//     would be split, and OP alerts could starve RiftCompare's mail).
//   • The provider hosts (Resend, Brevo) and the key names appear ONLY in this
//     file and the email workflows.
//   • The shell is OP Compare's: the "OP Compare" wordmark, OP's ink and red, a
//     red button with white text.
//
// The templates kept are the ones OP Compare sends: the price-alert digest, the
// watch confirmation, the newsletter (digest and welcome), the welcome email,
// and the shell lib/watch-emails.ts and lib/release-alerts.ts build on.
// RiftCompare's verification/reset (OP is OAuth-only), trial, checkout-recovery,
// premium-offer, win-back, release-day, user-digest and consulting mail are not
// ported (wave2-plan §7).
import { SITE_NAME, SITE_URL } from "./site";
import { TIER_NAMES, planPrice } from "./plans";
import { SEALED_CHECK_CADENCE } from "./alert-limits";
import { FREE_PORTFOLIO_LIMIT, FREE_WATCHLIST_LIMIT } from "./free-limits";
import { moneyCode as formatMoney } from "./format";
import { currencyOf, type Country } from "./country";
import type { AlertActionLinks } from "./alert-actions";
import { DROP_MIN_CENTS, DROP_MIN_PCT } from "./alert-thresholds";

/** OP Compare's sender when EMAIL_FROM is unset (it never is when email is on: both are required). */
export const DEFAULT_EMAIL_FROM = `${SITE_NAME} <alerts@opcompare.app>`;

// OP Compare's email palette (globals.css dark tokens and the brand red).
export const EMAIL_COLORS = {
  page: "#0a0c10",
  card: "#13171f",
  inset: "#0e1116",
  border: "#252b38",
  rule: "#1b2029",
  text: "#b8c0cc",
  muted: "#8b95a5",
  link: "#ff8a8a",
  white: "#ffffff",
  accent: "#ff6b6b", // --c-brand-400 (dark): prices and inline links
  button: "#d92b33", // the brand red fill, with white ink (DECISIONS: white on red)
  buttonInk: "#ffffff",
};
const C = EMAIL_COLORS;
const WORDMARK = `<div style="font-size:22px;font-weight:800;color:${C.white}">OP <span style="color:${C.accent}">Compare</span></div>`;
export const SITE_LINE = "OP Compare · One Piece Card Game price comparison.";

export function isEmailEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.RESEND_API_KEY && !!env.EMAIL_FROM;
}

// A key that is SET but the provider REFUSES (401/403): the runner fails the
// run red, as the eBay pass does for a refused keyset. A 4xx/5xx for one
// message (a bad address, a rate limit) is a failed send, not a refusal.
let refused = false;
export function providerRefused(): boolean {
  return refused;
}
let warnedOff = false;

// The most recent reason a send failed (provider + HTTP status + response
// body, or the thrown error), for batch callers that count failures and want
// to say WHY in their summary. Every failure path below writes it; a
// successful send clears it. Deliberately a plain module variable, not part of
// sendEmail's return type, so the dozens of existing boolean callers are
// untouched.
let lastEmailError: string | null = null;
export function getLastEmailError(): string | null {
  return lastEmailError;
}
async function noteProviderFailure(provider: string, res: Response): Promise<void> {
  const body = await res.text().catch(() => "");
  // Brevo's "Authorised IPs" account setting rejects every request from a
  // platform with rotating outbound IPs (every Vercel serverless invocation)
  // with this exact message — first diagnosed 2026-09-14 after a live
  // premium-offer batch came back sent 0/90 with no other symptom (see
  // DECISIONS.md, "why Brevo failed"). It is an account setting, not
  // anything this code can retry or route around, so callers batching
  // hundreds of sends deserve the real cause on the first failure rather
  // than 90 identical opaque "401" lines before anyone reads one closely.
  const ipBlocked = provider === "Brevo" && res.status === 401 && /unrecognised ip address/i.test(body);
  if (res.status === 401 || res.status === 403) refused = true;
  lastEmailError = ipBlocked
    ? `Brevo: rejecting this runner's IP (account "Authorised IPs" restriction is on — Brevo dashboard → Security → Authorised IPs → turn it off; GitHub Actions' outbound IPs are not static, so allow-listing one address will not hold)`
    : `${provider} ${res.status}: ${body.slice(0, 300)}`;
}

// Send a transactional email via Resend's REST API. Requires RESEND_API_KEY (and
// ideally a verified sender in EMAIL_FROM) to actually deliver; otherwise it
// no-ops and logs, so the rest of the app keeps working without email configured.
// `extras`: an explicit plain-text part and extra headers (List-Unsubscribe on
// the alert emails). Resend's POST /emails takes both as top-level `text` and
// `headers` fields; callers that pass neither send exactly what they always did.
export interface SendEmailExtras {
  text?: string;
  headers?: Record<string, string>;
}

export async function sendEmail(to: string, subject: string, html: string, extras: SendEmailExtras = {}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !process.env.EMAIL_FROM) {
    // Off until configured: say so once per process, not once per message.
    if (!warnedOff) console.warn(`[email] email is off (RESEND_API_KEY and EMAIL_FROM are both needed) — nothing is sent.`);
    warnedOff = true;
    lastEmailError = "Resend: email is not configured";
    return false;
  }
  const from = process.env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM;
  const replyTo = process.env.EMAIL_REPLY_TO;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...resendPayload({ from, to, subject, html }, extras), ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) {
      console.warn(`[email] Resend returned ${res.status} for "${subject}".`);
      await noteProviderFailure("Resend", res);
    } else lastEmailError = null;
    return res.ok;
  } catch (e) {
    console.warn("[email] send failed:", e);
    lastEmailError = `Resend: ${e instanceof Error ? e.message : String(e)}`;
    return false;
  }
}

// The Resend request body: the four fields every send has, plus `text` and
// `headers` only when given (exported for tests/alert-email-render.test.ts).
export function resendPayload(
  base: { from: string; to: string; subject: string; html: string },
  extras: SendEmailExtras = {},
): Record<string, unknown> {
  return {
    ...base,
    ...(extras.text ? { text: extras.text } : {}),
    ...(extras.headers && Object.keys(extras.headers).length ? { headers: extras.headers } : {}),
  };
}

// The Brevo request body: the base fields, plus `textContent` and `headers`
// only when given (exported for tests/premium-offer.test.ts).
export function brevoPayload(
  base: { sender: { name: string; email: string }; to: { email: string }[]; subject: string; htmlContent: string },
  extras: SendEmailExtras = {},
): Record<string, unknown> {
  return {
    ...base,
    ...(extras.text ? { textContent: extras.text } : {}),
    ...(extras.headers && Object.keys(extras.headers).length ? { headers: extras.headers } : {}),
  };
}

export function isBrevoEnabled(): boolean {
  return !!process.env.BREVO_API_KEY;
}

// Splits the same "Name <email@x.com>" string EMAIL_FROM already uses for
// Resend into Brevo's separate sender.name/sender.email fields.
export function parseFrom(raw: string): { name: string; email: string } {
  const m = raw.match(/^(.*)<(.+)>$/);
  if (m) return { name: m[1]!.trim().replace(/^"|"$/g, ""), email: m[2]!.trim() };
  return { name: SITE_NAME, email: raw.trim() };
}

// Sends via Brevo (app.brevo.com) instead of Resend. Kept for parity: RiftCompare
// uses it for bulk sends to registered accounts (its user digest and
// announcements), which OP Compare has not ported, so nothing calls it yet. Free tier: 300 emails/day, no card required
// — app.brevo.com → SMTP & API → API Keys. The sender address must be
// verified inside Brevo separately from Resend's domain verification.
// `extras` mirrors sendEmail's: Brevo's /v3/smtp/email takes the plain-text
// part as `textContent` and extra headers (List-Unsubscribe) as `headers`.
// Callers that pass neither send exactly what they always did.
export async function sendEmailBrevo(to: string, subject: string, html: string, extras: SendEmailExtras = {}): Promise<boolean> {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    console.warn(`[email] BREVO_API_KEY not set — "${subject}" to ${to} was NOT sent.`);
    lastEmailError = "Brevo: BREVO_API_KEY not set";
    return false;
  }
  const sender = parseFrom(process.env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM);
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(brevoPayload({ sender, to: [{ email: to }], subject, htmlContent: html }, extras)),
    });
    if (!res.ok) {
      console.warn(`[email] Brevo returned ${res.status} for "${subject}".`);
      await noteProviderFailure("Brevo", res);
    } else lastEmailError = null;
    return res.ok;
  } catch (e) {
    console.warn("[email] Brevo send failed:", e);
    lastEmailError = `Brevo: ${e instanceof Error ? e.message : String(e)}`;
    return false;
  }
}

// Every email's <head>: a viewport so a phone lays the fluid table out at its
// own width instead of zooming a desktop-wide page out.
const EMAIL_HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`;

// On-brand HTML wrapper for a one-message transactional email.
export function layout(heading: string, body: string, cta: { label: string; url: string }): string {
  return `<!doctype html><html><head>${EMAIL_HEAD}</head><body style="margin:0;background:${C.page};font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:32px 8px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background:${C.card};border:1px solid ${C.border};border-radius:16px">
      <tr><td style="padding:28px 32px 6px">${WORDMARK}</td></tr>
      <tr><td style="padding:6px 32px 4px"><h1 style="margin:0;font-size:20px;color:#fff">${heading}</h1></td></tr>
      <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:${C.text}">${body}</td></tr>
      <tr><td style="padding:4px 32px 26px"><a href="${cta.url}" style="display:inline-block;background:${C.button};color:${C.buttonInk};font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">${cta.label}</a></td></tr>
      <tr><td style="padding:16px 32px 26px;border-top:1px solid ${C.border};font-size:12px;color:${C.muted}">${SITE_LINE}<br/>If you didn't request this, you can safely ignore this email.</td></tr>
    </table></td></tr></table></body></html>`;
}
// ─── Wishlist price-drop alerts ──────────────────────────────────────────────

export interface AlertCard {
  name: string;
  setCode: string;
  number: string;
  url: string; // absolute card-page link
}

// ── The alert item (lib/price-alerts.ts builds it, 2026-09-25 rework) ──────
// Every figure comes from the ALERT PRICE (lib/alert-price.ts): the cheapest
// in-stock Near-Mint-or-unstated copy at a real store, CardTrader or TCGplayer
// US listing, seen within 36h, never eBay. So the headline price and the
// stores named under it are the same rows, and the condition is always NM or
// unstated.

export type AlertKind = "drop" | "target" | "below_market" | "restock" | "listed" | "preorder";

// One store behind an alert, cheapest first (up to 3 per item). `url` is the
// exact listing, affiliate-wrapped with loc /email-alert-<kind>.
export interface AlertStore {
  retailer: string; // retailer key
  name: string;
  url: string;
  priceCents: number; // this listing's own item price
  condition: string | null;
  // Postage for ONE card from this store to the watcher's market:
  //   "listing"  — stated on the listing itself (TCGplayer, CardTrader…)
  //   "measured" — shippingFor(): measured at the store's own checkout
  //   "estimate" — shippingFor(): unmeasured store, its market's floor ("est.")
  //   null       — nothing known: the copy says "postage extra", never "delivered"
  postageCents: number | null;
  postageBasis: "listing" | "measured" | "estimate" | null;
  postageUpTo: boolean; // measured, region unknown: the dearest regional rate
  deliveredCents: number | null; // priceCents + postageCents when postage is known
}

// Below-market context: TCGplayer US market, converted, and the gap.
export interface AlertTcgMarket {
  marketCents: number; // in the watch's currency
  marketUsdCents: number; // before conversion
  belowCents: number;
  belowPct: number; // one decimal, % of market (lib/arbitrage.ts belowTcgPct)
}

export interface PriceDropItem extends AlertCard {
  //   drop         — a material new low against the reference
  //   target       — a Plus/Premium watch at or under its own target
  //   below_market — a Plus/Premium watch ≥15% under TCGplayer market
  //   restock      — back in stock after being sold out ≥20h
  //   listed       — its first price in this market (no reference)
  //   preorder     — listed or restocked while the set is unreleased
  kind: AlertKind;
  alertId: string; // PriceAlert.id — what the per-card action links sign
  cardId: number;
  market: Country;
  currency: string; // ISO 4217, currencyOf(market)
  currentCents: number; // the alert price now
  // What changed is measured from: the price we last emailed while that is
  // under 30 days old ("emailed"), else the price before the current slide
  // when that is above the last price ("anchor"), else the last price seen
  // ("last"); for a restock the price before it sold out ("before_soldout");
  // null for listed/preorder.
  referenceCents: number | null;
  referenceBasis: "emailed" | "anchor" | "last" | "before_soldout" | null;
  startPriceCents: number | null; // "you started watching at"
  change: { cents: number; pct: number } | null; // referenceCents − currentCents (positive = cheaper), whole %
  condition: string | null; // the alert price's own condition (NM or unstated)
  stores: AlertStore[];
  checkedAt: Date; // when the import last saw the lead listing
  targetCents: number | null; // on a target item
  tcgMarket: AlertTcgMarket | null; // on a below_market item
  soldOutAt: Date | null; // on a restock item: when it sold out
  preorder: boolean; // the card's set has not released yet
  releasedOn: string | null; // ISO date the set ships, when preorder
  // The per-card one-tap links (lib/alert-actions.ts alertActionLinks), built
  // by the run, which knows the row's entitlement and target. Absent → the row
  // renders no action line (a hand-built item in a test, say).
  actions?: AlertActionLinks | null;
}

// ── Alert email mechanics (2026-09-25 rebuild) ───────────────────────────────
// One builder (buildPriceDropEmail) makes the subject, a hidden preheader, the
// HTML, an explicit plain-text part and the List-Unsubscribe headers; the send
// is a thin shell over it. Pure given the items, so every variant is rendered
// in tests (tests/alert-email-render.test.ts).

// Digests order and subjects lead by kind: target > restock > below-market >
// drop > listed/pre-order (lib/price-alerts.ts opens digests in this order too).
export const ALERT_KIND_PRIORITY: Record<AlertKind, number> = {
  target: 0,
  restock: 1,
  below_market: 2,
  drop: 3,
  listed: 4,
  preorder: 4,
};

/** Rows rendered in full; the rest of a big digest is listed one line each. */
export const ALERT_EMAIL_FULL_ROWS = 10;
/** One-line rows after the full ones; anything past this is "and N more". */
export const ALERT_EMAIL_COMPACT_ROWS = 30;

// The money a row saves against what it is measured from, for ordering.
function savingCents(i: PriceDropItem): number {
  if (i.kind === "below_market" && i.tcgMarket) return i.tcgMarket.belowCents;
  if (i.kind === "target" && i.targetCents != null) return Math.max(0, i.targetCents - i.currentCents);
  return i.change && i.change.cents > 0 ? i.change.cents : 0;
}

/**
 * The items one digest actually renders (full rows, then one-line rows), in
 * render order. lib/price-alerts.ts holds everything past this for the next
 * email, so nothing is recorded as told that the member never saw.
 */
export function renderedAlertItems(items: PriceDropItem[]): PriceDropItem[] {
  return sortAlertItems(items).slice(0, ALERT_EMAIL_FULL_ROWS + ALERT_EMAIL_COMPACT_ROWS);
}

/** Importance order: kind priority, then the biggest saving, then as given. */
export function sortAlertItems(items: PriceDropItem[]): PriceDropItem[] {
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => ALERT_KIND_PRIORITY[a.item.kind] - ALERT_KIND_PRIORITY[b.item.kind] || savingCents(b.item) - savingCents(a.item) || a.idx - b.idx)
    .map((x) => x.item);
}

// Every site link in an alert email is attributable: utm_campaign names the
// email's lead kind (price-alert-drop, price-alert-target, …).
export function alertCampaign(kind: AlertKind | "confirm"): string {
  return `price-alert-${kind.replace("_", "-")}`;
}
function utm(campaign: string): string {
  return `utm_source=email&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}`;
}
function withQuery(url: string, q: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${q}`;
}

// A card link that lands on the WATCH'S market. Card pages are ISR and take no
// searchParams (adding one would make them dynamic), so the link goes through
// /api/market, which sets the country cookie and redirects to the same-origin
// path — the page then shows the stores and prices the email quoted.
export function marketCardLink(item: Pick<PriceDropItem, "url" | "market">, campaign: string): string {
  const path = item.url.startsWith(SITE_URL) ? item.url.slice(SITE_URL.length) || "/" : item.url;
  if (!path.startsWith("/")) return withQuery(item.url, utm(campaign));
  return `${SITE_URL}/api/market?m=${item.market}&to=${encodeURIComponent(withQuery(path, utm(campaign)))}`;
}

// The address-level links, all addressed by PriceAlert.unsubToken.
export interface AlertAddressLinks {
  manage: string; // /watching for an account, the token page for anonymous watchers
  pause: string; // the page, which pauses by default
  deleteAll: string; // the page's explicit delete
  oneClick: string; // RFC 8058 List-Unsubscribe target: POST pauses, never deletes
}
export function alertAddressLinks(unsubToken: string, anonymous: boolean, campaign: string): AlertAddressLinks {
  const t = encodeURIComponent(unsubToken);
  return {
    manage: anonymous ? `${SITE_URL}/alerts/manage?token=${t}&${utm(campaign)}` : `${SITE_URL}/watching?${utm(campaign)}`,
    pause: `${SITE_URL}/unsubscribe?token=${t}`,
    deleteAll: `${SITE_URL}/unsubscribe?token=${t}&mode=delete`,
    oneClick: `${SITE_URL}/api/alerts/unsubscribe?token=${t}&mode=pause`,
  };
}

// List-Unsubscribe (RFC 2369) + one-click (RFC 8058): Gmail and Apple Mail
// show an "Unsubscribe" button that POSTs "List-Unsubscribe=One-Click" to the
// URL. It PAUSES alert email (reversible); it never deletes a watch.
export function alertListHeaders(links: Pick<AlertAddressLinks, "oneClick">): Record<string, string> {
  return {
    "List-Unsubscribe": `<${links.oneClick}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// "17:10 AEST 25 Sep" in the watch's market — when the lead listing was seen.
const MARKET_CLOCK: Record<Country, { tz: string; locale: string }> = {
  AU: { tz: "Australia/Sydney", locale: "en-AU" },
  US: { tz: "America/New_York", locale: "en-US" },
  UK: { tz: "Europe/London", locale: "en-GB" },
  SG: { tz: "Asia/Singapore", locale: "en-SG" },
  CA: { tz: "America/Toronto", locale: "en-CA" },
  EU: { tz: "Europe/Paris", locale: "en-GB" },
};
export function checkedLabel(d: Date, market: Country): string {
  const { tz, locale } = MARKET_CLOCK[market] ?? MARKET_CLOCK.US;
  try {
    const time = new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" }).format(d);
    return `${time} ${shortDate(d, tz)}`;
  } catch {
    return `${d.toISOString().slice(11, 16)} UTC ${shortDate(d, "UTC")}`;
  }
}
// "25 Sep" (en-US month names: en-GB now prints "Sept").
function shortDate(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric", month: "short" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")}`;
}
// An ISO release date ("2026-10-23") → "23 Oct".
function isoDayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : shortDate(d, "UTC");
}

// What the store line says about postage for one card. Only a figure the
// listing states or shippingFor() measured is quoted plainly; an unmeasured
// store's floor is marked "est."; nothing known says so, never "delivered".
export function postageNote(store: Pick<AlertStore, "postageCents" | "postageBasis" | "postageUpTo">, currency: string): string {
  if (store.postageCents == null || store.postageBasis == null) return "item price, postage extra";
  if (store.postageCents === 0) return "free postage";
  const money = formatMoney(store.postageCents, currency);
  if (store.postageBasis === "estimate") return `+ ${money} postage (est.)`;
  return `+ ${store.postageUpTo ? "up to " : ""}${money} postage`;
}

// "A$27.50 + A$8.95 postage ≈ A$36.45 delivered" — the delivered total only
// when postage is known, "up to" when the postage is.
export function storePriceText(store: AlertStore, currency: string): string {
  const price = formatMoney(store.priceCents, currency);
  const note = postageNote(store, currency);
  if (store.deliveredCents == null || store.postageCents == null || store.postageBasis == null) return `${price} ${note}`;
  const delivered = formatMoney(store.deliveredCents, currency);
  if (store.postageCents === 0) return `${price}, free postage = ${delivered} delivered`;
  return `${price} ${note} ≈ ${store.postageUpTo ? "up to " : ""}${delivered} delivered`;
}

// The headline under a card's name: what changed, in money and %, by kind.
// `html` and `text` say the same thing.
export function alertHeadline(item: PriceDropItem): { html: string; text: string } {
  const cur = item.currency;
  const m = (c: number) => formatMoney(c, cur);
  const now = m(item.currentCents);
  const nowHtml = `<strong style="color:${C.accent}">${now}</strong>`;
  const pct = item.change && item.change.pct > 0 ? item.change.pct : null;
  const save = item.change && item.change.cents > 0 ? item.change.cents : null;
  switch (item.kind) {
    case "target": {
      const t = item.targetCents;
      const under = t != null && t > item.currentCents ? ` · ${m(t - item.currentCents)} under it` : "";
      return {
        html: t != null ? `Your target ${m(t)} · now ${nowHtml}${under}` : `At your target · now ${nowHtml}`,
        text: t != null ? `Your target ${m(t)} · now ${now}${under}` : `At your target · now ${now}`,
      };
    }
    case "restock": {
      const since = item.soldOutAt ? ` · sold out since ${shortDate(item.soldOutAt, MARKET_CLOCK[item.market]?.tz ?? "UTC")}` : "";
      const was = item.referenceCents != null ? ` · ${m(item.referenceCents)} before it sold out` : "";
      return { html: `Back in stock at ${nowHtml}${since}${was}`, text: `Back in stock at ${now}${since}${was}` };
    }
    case "below_market": {
      const tm = item.tcgMarket;
      if (!tm) return { html: `${nowHtml} · below TCGplayer market`, text: `${now} · below TCGplayer market` };
      const converted = cur === "USD" ? "" : ` (${formatMoney(tm.marketUsdCents, "USD")} converted)`;
      const tail = ` vs TCGplayer market ≈ ${m(tm.marketCents)}${converted} · ${Math.round(tm.belowPct)}% under, save ${m(tm.belowCents)}`;
      return { html: `${nowHtml}${tail}`, text: `${now}${tail}` };
    }
    case "preorder": {
      const ships = item.releasedOn ? ` · ships ~${isoDayLabel(item.releasedOn)}` : "";
      return { html: `Open for pre-order at ${nowHtml}${ships}`, text: `Open for pre-order at ${now}${ships}` };
    }
    case "listed":
      return { html: `Now in stock · from ${nowHtml}`, text: `Now in stock · from ${now}` };
    case "drop": {
      if (item.referenceCents == null) return { html: `Now ${nowHtml}`, text: `Now ${now}` };
      const from = m(item.referenceCents);
      const gain = save != null ? ` · save ${m(save)}${pct != null ? ` (−${pct}%)` : ""}` : "";
      const basis =
        item.referenceBasis === "emailed"
          ? "the price we last emailed you"
          : item.referenceBasis === "anchor"
            ? "where it stood before this slide"
            : "the last price we saw";
      return {
        html: `<span style="color:${C.muted};text-decoration:line-through">${from}</span> → ${nowHtml}${gain}<div style="font-size:12px;color:${C.muted};margin-top:2px">Down from ${basis}</div>`,
        text: `${from} → ${now}${gain} (down from ${basis})`,
      };
    }
  }
}

// "You started watching at A$35.00 · Near Mint". The alert price is Near Mint
// (or a store that doesn't state condition) by construction, so it is always
// said which.
export function watchingSinceText(item: PriceDropItem): string {
  const start = item.startPriceCents != null ? `You started watching at ${formatMoney(item.startPriceCents, item.currency)}` : "No price when you started watching";
  const condition = item.condition ?? "Condition not stated by the store";
  return `${start} · ${condition}`;
}

function actionItems(item: PriceDropItem): { label: string; url: string }[] {
  const a = item.actions;
  if (!a) return [];
  const cur = item.currency;
  const out = [
    { label: "Stop watching", url: a.stop },
    { label: "Snooze 30 days", url: a.snooze },
  ];
  if (a.targetDown) {
    const x = formatMoney(a.targetDown.cents, cur);
    out.push({ label: a.hasTarget ? `Lower target to ${x}` : `Target 10% under this price (${x})`, url: a.targetDown.url });
  }
  if (a.upsell) out.push({ label: "Set a target price with Plus", url: a.upsell });
  return out;
}

// One store, with its Buy button. Inline-blocks, so the button drops under the
// line on a narrow screen instead of pushing the email wider.
function storeBlock(store: AlertStore, currency: string): string {
  return `
      <div style="margin-top:6px;padding:8px 10px;background:${C.inset};border:1px solid ${C.border};border-radius:10px">
        <div style="display:inline-block;vertical-align:middle;max-width:100%;margin:2px 8px 2px 0;font-size:13px;line-height:1.5;color:${C.text}"><strong style="color:#fff">${escapeHtml(store.name)}</strong> · ${escapeHtml(storePriceText(store, currency))}</div>
        <a href="${escapeHtml(store.url)}" style="display:inline-block;vertical-align:middle;margin:2px 0;background:${C.button};color:${C.buttonInk};font-size:13px;font-weight:700;text-decoration:none;padding:6px 14px;border-radius:8px">Buy</a>
      </div>`;
}

/** One card row of the alert table (HTML). */
export function dropRow(item: PriceDropItem, campaign: string = alertCampaign(item.kind)): string {
  const cur = item.currency;
  const head = alertHeadline(item);
  const stores = item.stores.slice(0, 3).map((s) => storeBlock(s, cur)).join("");
  const actions = actionItems(item)
    .map((x) => `<a href="${escapeHtml(x.url)}" style="color:${C.link};text-decoration:underline">${escapeHtml(x.label)}</a>`)
    .join(" &nbsp;·&nbsp; ");
  return `<tr><td style="padding:14px 0;border-bottom:1px solid ${C.border}">
    <a href="${escapeHtml(marketCardLink(item, campaign))}" style="color:#fff;font-weight:700;text-decoration:none;font-size:15px">${escapeHtml(item.name)}</a>
    <div style="font-size:12px;color:${C.muted};margin-top:2px">${escapeHtml(item.setCode)} · ${escapeHtml(item.number)} · <span style="border:1px solid ${C.border};border-radius:6px;padding:0 5px">${item.market}</span></div>
    <div style="margin-top:6px;font-size:14px;line-height:1.5;color:${C.text}">${head.html}</div>
    <div style="margin-top:4px;font-size:12px;color:${C.muted}">${escapeHtml(watchingSinceText(item))}</div>${stores}
    <div style="margin-top:6px;font-size:12px;color:${C.muted}">Checked ${checkedLabel(item.checkedAt, item.market)}. Prices move, so confirm at the store.</div>
    ${actions ? `<div style="margin-top:6px;font-size:12px;line-height:1.8;color:${C.muted}">${actions}</div>` : ""}
  </td></tr>`;
}

// A one-line row for the tail of a big digest.
function compactRow(item: PriceDropItem, campaign: string): string {
  return `<tr><td style="padding:6px 0;border-bottom:1px solid ${C.rule};font-size:13px;line-height:1.5;color:${C.text}">
    <a href="${escapeHtml(marketCardLink(item, campaign))}" style="color:#fff;font-weight:700;text-decoration:none">${escapeHtml(item.name)}</a> · ${escapeHtml(alertHeadline(item).text)}
  </td></tr>`;
}

/** One card, as plain text. */
export function alertRowText(item: PriceDropItem, campaign: string = alertCampaign(item.kind)): string {
  const lines = [
    `${item.name} (${item.setCode} · ${item.number} · ${item.market})`,
    `  ${alertHeadline(item).text}`,
    `  ${watchingSinceText(item)}`,
  ];
  for (const s of item.stores.slice(0, 3)) lines.push(`  - ${s.name}: ${storePriceText(s, item.currency)}`, `    Buy: ${s.url}`);
  lines.push(`  Checked ${checkedLabel(item.checkedAt, item.market)}. Prices move, so confirm at the store.`);
  lines.push(`  Compare every store: ${marketCardLink(item, campaign)}`);
  for (const a of actionItems(item)) lines.push(`  ${a.label}: ${a.url}`);
  return lines.join("\n");
}

// The price an alert quotes: the lead listing's own price (the alert price is
// that listing's price by construction).
function alertPrice(item: PriceDropItem): string {
  return formatMoney(item.stores[0]?.priceCents ?? item.currentCents, item.currency);
}

// Subject, heading, intro and hidden preheader for a digest, led by the most
// important item (sortAlertItems). The subject names the card and the saving:
// "Jinx, Loose Cannon: A$18.40 at Cherry, 12% off". Pure; unit-tested.
export function priceDropCopy(items: PriceDropItem[]): { heading: string; intro: string; subject: string; preheader: string } {
  const sorted = sortAlertItems(items);
  const count = sorted.length;
  const lead = sorted[0]!;
  const more = count > 1 ? ` (+${count - 1} more)` : "";
  const at = lead.stores[0] ? ` at ${lead.stores[0].name}` : "";
  const price = alertPrice(lead);
  const m = (c: number) => formatMoney(c, lead.currency);
  let subject: string;
  let single: string;
  switch (lead.kind) {
    case "target":
      subject = `${lead.name} hit your ${lead.targetCents != null ? `${m(lead.targetCents)} ` : ""}target: ${price}${at}`;
      single = "Your target price is met";
      break;
    case "restock":
      subject = `${lead.name} is back in stock: ${price}${at}`;
      single = "Back in stock";
      break;
    case "below_market":
      subject = `${lead.name}: ${price}${at}, ${lead.tcgMarket ? `${Math.round(lead.tcgMarket.belowPct)}% under` : "below"} TCGplayer market`;
      single = "Below TCGplayer market";
      break;
    case "drop":
      subject = `${lead.name}: ${price}${at}${lead.change && lead.change.pct > 0 ? `, ${lead.change.pct}% off` : ""}`;
      single = "A card you're watching got cheaper";
      break;
    case "preorder":
      subject = `${lead.name} is open for pre-order from ${price}${at}`;
      single = "Open for pre-order";
      break;
    case "listed":
      subject = `${lead.name} is now in stock from ${price}${at}`;
      single = "Now in stock";
      break;
  }
  const saving = savingCents(lead);
  const preheader = `${saving > 0 ? `Save ${m(saving)} · ` : ""}checked ${checkedLabel(lead.checkedAt, lead.market)}`;
  return {
    heading: count === 1 ? single : `Price news on ${count} cards you're watching`,
    intro: count === 1 ? "" : "Biggest news first.",
    subject: `${subject}${more}`,
    preheader,
  };
}

// Footer for every alert email: why it came, how often, and the two separate
// choices — pause (keeps the watchlist) and delete.
function alertFooter(links: Pick<AlertAddressLinks, "pause" | "deleteAll">): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid ${C.border};font-size:12px;line-height:1.6;color:${C.muted}">
    You're getting this because you asked OP Compare to watch these cards for price changes. Free alerts come at most once a week;
    Plus and Premium target, below-market and restock alerts can arrive after each price update.<br/>
    <a href="${escapeHtml(links.pause)}" style="color:${C.link};text-decoration:underline">Pause alert emails (your watchlist is kept)</a>
    &nbsp;·&nbsp; <a href="${escapeHtml(links.deleteAll)}" style="color:${C.link};text-decoration:underline">Delete all my watches</a><br/>
    ${SITE_LINE}
  </td></tr>`;
}
function alertFooterText(links: Pick<AlertAddressLinks, "pause" | "deleteAll">): string {
  return [
    "You're getting this because you asked OP Compare to watch these cards for price changes. Free alerts come at most once a week; Plus and Premium target, below-market and restock alerts can arrive after each price update.",
    `Pause alert emails (your watchlist is kept): ${links.pause}`,
    `Delete all my watches: ${links.deleteAll}`,
  ].join("\n");
}

const button = (href: string, label: string) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;background:${C.button};color:${C.buttonInk};font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">${label}</a>`;
/** The green button, for the watch emails in lib/watch-emails.ts. */
export const emailButton = button;

export interface BuiltEmail {
  subject: string;
  heading: string;
  preheader: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

// The digest itself. `anonymous` = this address has no linked account
// (PriceAlert.userId null on every row): the manage link is the token page,
// and only these recipients get the account CTA.
export function buildPriceDropEmail(items: PriceDropItem[], unsubToken: string, anonymous = false): BuiltEmail {
  const sorted = sortAlertItems(items);
  const { heading, intro, subject, preheader } = priceDropCopy(sorted);
  const campaign = alertCampaign(sorted[0]!.kind);
  const links = alertAddressLinks(unsubToken, anonymous, campaign);
  const full = sorted.slice(0, ALERT_EMAIL_FULL_ROWS);
  const compact = sorted.slice(ALERT_EMAIL_FULL_ROWS, ALERT_EMAIL_FULL_ROWS + ALERT_EMAIL_COMPACT_ROWS);
  const hidden = sorted.length - full.length - compact.length;
  // A paid digest also links Deal Finder filtered to the member's own watchlist.
  const paid = sorted.some((i) => i.kind === "target" || i.kind === "below_market");
  const dealFinder = `${SITE_URL}/tools/deal-finder?mine=watch&${utm(campaign)}`;
  // Items past the rows above are NOT recorded as emailed (lib/price-alerts.ts
  // holds them), so they arrive in the next alert email.
  const moreLine = hidden > 0 ? `${hidden} more card${hidden === 1 ? "" : "s"} with news will come in your next alert email` : "";
  const inner = `
    ${intro ? `<tr><td style="padding:8px 32px 0;font-size:14px;line-height:1.6;color:${C.text}">${intro}</td></tr>` : ""}
    <tr><td style="padding:4px 32px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">${full.map((i) => dropRow(i, campaign)).join("")}${compact.map((i) => compactRow(i, campaign)).join("")}</table>
    ${moreLine ? `<div style="margin-top:8px;font-size:13px"><a href="${escapeHtml(links.manage)}" style="color:${C.accent};font-weight:700;text-decoration:none">${moreLine} →</a></div>` : ""}</td></tr>
    <tr><td style="padding:4px 32px 20px">${button(links.manage, "Manage your watchlist")}
    ${paid ? `<div style="margin-top:10px;font-size:13px"><a href="${escapeHtml(dealFinder)}" style="color:${C.accent};font-weight:700;text-decoration:none">Your watched cards in Deal Finder →</a></div>` : ""}</td></tr>
    ${anonymous ? accountCtaBlock("price-drop", "Manage your price watches with a free account — your existing alerts come with you automatically.") : ""}`;
  const text = [
    heading,
    intro,
    "",
    ...full.map((i) => alertRowText(i, campaign)).flatMap((t) => [t, ""]),
    ...compact.map((i) => `${i.name}: ${alertHeadline(i).text}`),
    ...(moreLine ? [`${moreLine}: ${links.manage}`] : []),
    `Manage your watchlist: ${links.manage}`,
    ...(paid ? [`Your watched cards in Deal Finder: ${dealFinder}`] : []),
    "",
    alertFooterText(links),
  ]
    .filter((l, idx, arr) => !(l === "" && arr[idx - 1] === ""))
    .join("\n");
  return {
    subject,
    heading,
    preheader,
    html: emailShell(heading, inner, alertFooter(links), preheader),
    text,
    headers: alertListHeaders(links),
  };
}

// One digest per address (lib/price-alerts.ts). The row's unsubToken addresses
// every address-level link; the per-card links ride on each item.
export async function sendPriceDropEmail(to: string, items: PriceDropItem[], unsubToken: string, anonymous = false): Promise<boolean> {
  const email = buildPriceDropEmail(items, unsubToken, anonymous);
  return sendEmail(to, email.subject, email.html, { text: email.text, headers: email.headers });
}

// ── The watch confirmation ───────────────────────────────────────────────────
// Sent once, to a NEW address, when it subscribes via the wishlist pop-up
// (/api/alerts/subscribe). Says what is being watched — each card, its market
// and today's alert price (the same cheapest-Near-Mint-at-a-store figure the
// alerts use) — how often we will email, and where to manage or pause it.
export interface AlertConfirmationCard {
  name: string;
  setCode: string;
  number: string;
  url: string; // absolute card-page link
  market: Country;
  priceCents: number | null; // today's alert price; null = not in stock at a store
  storeName: string | null;
  // That copy's condition as the store states it: Near Mint, or null when
  // the store states none (the alert price admits both; review, 2026-09-25).
  condition?: string | null;
}

/** Cards listed by name in the confirmation; the rest are counted. */
export const CONFIRMATION_CARD_ROWS = 10;

export function buildAlertConfirmationEmail(cards: AlertConfirmationCard[], total: number, unsubToken: string, anonymous = false): BuiltEmail {
  const campaign = alertCampaign("confirm");
  const links = alertAddressLinks(unsubToken, anonymous, campaign);
  const shown = cards.slice(0, CONFIRMATION_CARD_ROWS);
  const rest = Math.max(0, total - shown.length);
  // The alert price admits Near Mint AND unstated-condition copies, so the
  // condition is printed as the store states it, never assumed.
  const priceText = (c: AlertConfirmationCard) =>
    c.priceCents != null
      ? `cheapest now ${formatMoney(c.priceCents, currencyOf(c.market))}${c.storeName ? ` at ${c.storeName}` : ""} · ${c.condition ?? "Condition not stated by the store"}`
      : "not in stock at a store yet: we'll email you when it is";
  // The minimum drop in the watched market's own minor unit (50 cents, 50
  // pence…); a mix of markets gets the neutral wording.
  const markets = [...new Set(shown.map((c) => c.market))];
  const minDrop =
    markets.length === 1 ? formatMoney(DROP_MIN_CENTS, currencyOf(markets[0]!)) : `${DROP_MIN_CENTS} cents or pence, in your market's currency`;
  const rows = shown
    .map(
      (c) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.border};font-size:13px;line-height:1.5;color:${C.text}">
      <a href="${escapeHtml(marketCardLink(c, campaign))}" style="color:#fff;font-weight:700;text-decoration:none">${escapeHtml(c.name)}</a>
      <span style="color:${C.muted}">· ${escapeHtml(c.setCode)} · ${escapeHtml(c.number)} · ${c.market}</span><br/>${escapeHtml(priceText(c))}
    </td></tr>`,
    )
    .join("");
  const cadence =
    `At most one email a week for free alerts: when a card falls at least ${DROP_MIN_PCT}% (and at least ${minDrop}) to a new low, when it's first listed or opens for pre-order, and when it's back in stock. Each email names the stores and their postage. Plus and Premium target, below-market and restock alerts can arrive after each price update.`;
  const count = total === 1 ? "this card" : `these ${total} cards`;
  const inner = `
    <tr><td style="padding:8px 32px 8px;font-size:14px;line-height:1.6;color:${C.text}">You're all set. We're watching ${count}:</td></tr>
    <tr><td style="padding:0 32px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">${rows}</table>
    ${rest > 0 ? `<div style="margin-top:6px;font-size:13px;color:${C.text}">and ${rest} more.</div>` : ""}</td></tr>
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:${C.text}">${cadence}</td></tr>
    <tr><td style="padding:4px 32px 24px">${button(links.manage, "Manage these alerts")}</td></tr>
    ${anonymous ? accountCtaBlock("alert-confirm", "Manage your price watches with a free account — your existing alerts come with you automatically.") : ""}`;
  const heading = "Price alerts are on";
  const text = [
    heading,
    "",
    `You're all set. We're watching ${count}:`,
    ...shown.map((c) => `- ${c.name} (${c.setCode} · ${c.number} · ${c.market}): ${priceText(c)}`),
    ...(rest > 0 ? [`and ${rest} more.`] : []),
    "",
    cadence,
    "",
    `Manage these alerts: ${links.manage}`,
    "",
    alertFooterText(links),
  ].join("\n");
  const subject = total === 1 ? `You're watching ${cards[0]?.name ?? "a card"} on OP Compare` : `You're watching ${total} cards on OP Compare`;
  return { subject, heading, preheader: "At most one email a week, and only when there's news.", html: emailShell(heading, inner, alertFooter(links), "At most one email a week, and only when there's news."), text, headers: alertListHeaders(links) };
}

export async function sendAlertConfirmationEmail(to: string, cards: AlertConfirmationCard[], total: number, unsubToken: string, anonymous = false): Promise<boolean> {
  const email = buildAlertConfirmationEmail(cards, total, unsubToken, anonymous);
  return sendEmail(to, email.subject, email.html, { text: email.text, headers: email.headers });
}

// One-row "create a free account" block for MARKETING-ADJACENT emails going to
// people we know DON'T have an account (anonymous price-alert watchers, the
// newsletter list). These lists get value from us indefinitely and, until this
// existed, were never once asked to register — the softest possible audience,
// asked nowhere. Deliberately NOT added to user-digest or transactional sends:
// those recipients are registered already, and an account CTA there is noise.
//
// The link lands on /login?src=email…, which AuthForm converts into
// markSignupSource("email") — so email-attributed signups show up in
// User.signupSource and the admin breakdown, closing the loop.
export function accountCtaBlock(campaign: string, line?: string): string {
  const copy =
    line ??
    "Price alerts, a live portfolio and a watchlist you can manage in one place — free.";
  const url = `${SITE_URL}/login?src=email&utm_source=email&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}`;
  return `<tr><td style="padding:4px 32px 20px">
    <div style="border:1px solid ${C.border};border-radius:12px;padding:14px 16px">
      <div style="font-size:13px;line-height:1.5;color:${C.text}">${copy}</div>
      <a href="${url}" style="display:inline-block;margin-top:10px;border:1px solid ${C.accent};color:${C.accent};font-size:13px;font-weight:700;text-decoration:none;padding:8px 16px;border-radius:8px">Create your free account</a>
    </div>
  </td></tr>`;
}

// FLUID, NOT 520px (2026-09-25). The card table was a fixed width="520", so at
// a 390px phone every email scrolled sideways or was zoomed out to unreadable
// text. It is now width 100% capped at max-width 520px, with a viewport meta;
// the outer cell keeps an 8px gutter. `preheader` is the hidden inbox-preview
// line (alert emails: "Save A$3.75 · checked 17:10 AEST 25 Sep").
export function emailShell(heading: string, inner: string, footer: string, preheader?: string): string {
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${escapeHtml(preheader)}</div>`
    : "";
  return `<!doctype html><html><head>${EMAIL_HEAD}</head><body style="margin:0;background:${C.page};font-family:Arial,Helvetica,sans-serif">${pre}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:32px 8px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:${C.card};border:1px solid ${C.border};border-radius:16px">
      <tr><td style="padding:28px 32px 6px">${WORDMARK}</td></tr>
      <tr><td style="padding:6px 32px 4px"><h1 style="margin:0;font-size:20px;color:#fff">${heading}</h1></td></tr>
      ${inner}
      ${footer}
    </table></td></tr></table></body></html>`;
}
// ─── Weekly newsletter digest ────────────────────────────────────────────────

// Newsletter footer: the audience opted in via the footer signup, so the copy
// reflects that consent (distinct from the wishlist-alert footer above).
function newsletterFooter(unsubUrl: string): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid ${C.border};font-size:12px;color:${C.muted}">
    You're getting this because you signed up for the weekly ${SITE_NAME} Index summary.<br/>
    <a href="${unsubUrl}" style="color:${C.link};text-decoration:underline">Unsubscribe</a> · ${SITE_LINE}
  </td></tr>`;
}

// The weekly digest itself; `inner` is built by lib/newsletter.ts so the content
// (movers tables, Index summary) lives next to the data that produces it.
export async function sendNewsletterDigestEmail(to: string, subject: string, heading: string, inner: string, unsubUrl: string): Promise<boolean> {
  // The newsletter list (NewsletterSubscriber) is captured without an account,
  // so the weekly digest carries the generic account CTA. Some subscribers may
  // also hold accounts — acceptable noise for one soft block, unlike the alert
  // emails where the caller knows userId and gates it precisely.
  return sendEmail(to, subject, emailShell(heading, inner + accountCtaBlock("newsletter"), newsletterFooter(unsubUrl)));
}


export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Newsletter welcome (the hourly outbox, scripts/email-hourly.ts) ─────────
// Sent once to a NEW subscriber, by the hourly outbox run rather than the signup
// route (OP Compare sends nothing at request time: NewsletterSubscriber
// .welcomeSentAt is the outbox stamp). The weekly edition goes out on Friday
// evening (UTC), so it says "this weekend".
export function buildNewsletterWelcomeEmail(unsubUrl: string): { subject: string; heading: string; html: string } {
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:${C.text}">
      You're on the list — every week you'll get the ${SITE_NAME} Index summary: the One Piece cards that spiked,
      the cards that dropped, and the new cards of the week, priced across US, AU, UK, SG, CA and EU stores.
      The next edition lands this weekend.
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/movers?utm_source=newsletter&utm_medium=email&utm_campaign=welcome" style="display:inline-block;background:${C.button};color:${C.buttonInk};font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">See this week's movers</a></td></tr>`;
  const heading = "Welcome aboard";
  return { subject: `You're on the ${SITE_NAME} weekly Index summary`, heading, html: emailShell(heading, inner, newsletterFooter(unsubUrl)) };
}

export async function sendNewsletterWelcomeEmail(to: string, unsubUrl: string): Promise<boolean> {
  const { subject, html } = buildNewsletterWelcomeEmail(unsubUrl);
  return sendEmail(to, subject, html, { headers: { "List-Unsubscribe": `<${unsubUrl}>` } });
}

// ─── Welcome email to a new account (one-time) ────────────────────────────────
// Sent ONCE, within about an hour of an account being created (runWelcomeEmails
// in lib/welcome-email.ts, from the hourly outbox run). RiftCompare's welcome,
// rebranded, with only what OP Compare's account actually does (lib/plans.ts,
// the enforced limits) and no trial: OP Compare offers none (DECISIONS).
export interface WelcomeEmailOpts {
  displayName: string;
}

const WELCOME_UTM = "utm_source=email&utm_medium=email&utm_campaign=welcome";

export function buildWelcomeEmail(opts: WelcomeEmailOpts): { subject: string; heading: string; html: string; text: string } {
  const name = escapeHtml(opts.displayName.trim().split(/\s+/)[0] || "there");
  const link = (path: string, label: string) =>
    `<a href="${SITE_URL}${path}${path.includes("?") ? "&" : "?"}${WELCOME_UTM}" style="color:${C.accent};font-weight:700;text-decoration:none">${label}</a>`;
  const step = (n: number, title: string, body: string) =>
    `<tr><td style="padding:6px 32px;font-size:14px;line-height:1.6;color:${C.text}">
      <strong style="color:#e6ebf2">${n}. ${title}</strong><br/>${body}
    </td></tr>`;
  const plus = `${TIER_NAMES.plus} is ${planPrice("plus", "month")}/month and ${TIER_NAMES.premium} ${planPrice("premium", "month")}/month.`;
  const inner = `
    <tr><td style="padding:8px 32px 8px;font-size:14px;line-height:1.6;color:${C.text}">
      Hi ${name}, your free account is ready. Four things it does that a visitor can't:
    </td></tr>
    ${step(1, "Watch a card", `Press <em>Watch price</em> on any One Piece card and we'll email you when its price drops — up to ${FREE_WATCHLIST_LIMIT} cards on a free account. ${link("/browse", "Find a card&nbsp;→")}`)}
    ${step(2, "See today's top 3 deals", `Your account shows the three biggest deals in Deal Finder, updated twice a day. ${link("/tools/deal-finder", "Deal&nbsp;Finder&nbsp;→")}`)}
    ${step(3, "Track your collection", `Add up to ${FREE_PORTFOLIO_LIMIT} cards you own and see what they're worth today. ${link("/portfolio", "My&nbsp;binder&nbsp;→")}`)}
    ${step(4, "See what a set is missing", `Tick what's in your binder and the set checklist shows what's missing and the cheapest listing for each card, before postage. Free for your first ${FREE_PORTFOLIO_LIMIT} cards. ${link("/portfolio/sets", "Set&nbsp;checklist&nbsp;→")}`)}
    <tr><td style="padding:14px 32px 22px">
      <div style="border:1px solid #6b5a1f;border-radius:12px;padding:14px 16px;background:#1a1810">
        <div style="font-size:13px;line-height:1.55;color:#d8cfa8">
          <strong style="color:#f3c969">Want every deal, not just the top three?</strong> Plus and Premium both come with:
          <ul style="margin:6px 0;padding-left:18px">
            <li>No ads on any page</li>
            <li>No limit on your watchlist or portfolio, so a whole set fits in the set checklist</li>
            <li>Every deal: the full Deal Finder list</li>
            <li>An email naming the store when a card you watch hits your target price</li>
            <li>Sealed watches: an email when a box is back in stock or at your price, checked ${SEALED_CHECK_CADENCE}</li>
          </ul>
          Premium plans the order: the store-by-store plan for your deck, watchlist or the rest of a set. ${plus}
        </div>
        <a href="${SITE_URL}/premium?src=welcome" style="display:inline-block;margin-top:10px;background:#f3c969;color:#1a1405;font-size:13px;font-weight:700;text-decoration:none;padding:8px 16px;border-radius:8px">See Premium</a>
      </div>
    </td></tr>`;
  const heading = `Welcome to ${SITE_NAME}`;
  const text = [
    heading,
    "",
    `Hi ${opts.displayName.trim().split(/\s+/)[0] || "there"}, your free account is ready. Four things it does that a visitor can't:`,
    `1. Watch a card: we'll email you when its price drops, up to ${FREE_WATCHLIST_LIMIT} cards. ${SITE_URL}/browse`,
    `2. See today's top 3 deals in Deal Finder. ${SITE_URL}/tools/deal-finder`,
    `3. Track up to ${FREE_PORTFOLIO_LIMIT} cards you own. ${SITE_URL}/portfolio`,
    `4. See what a set is missing. ${SITE_URL}/portfolio/sets`,
    "",
    `Plus and Premium: no ads, no watchlist or portfolio limit, every deal, target-price and sealed alerts; Premium adds the store-by-store plan. ${plus} ${SITE_URL}/premium`,
    "",
    `You're getting this once because you created an ${SITE_NAME} account.`,
  ].join("\n");
  return { subject: `Welcome to ${SITE_NAME} — here's what your account does`, heading, html: emailShell(heading, inner, welcomeFooter()), text };
}

function welcomeFooter(): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid ${C.border};font-size:12px;color:${C.muted}">
    You're getting this once because you created an ${SITE_NAME} account. We won't send it again.<br/>
    ${SITE_LINE}
  </td></tr>`;
}

export async function sendWelcomeEmail(to: string, opts: WelcomeEmailOpts): Promise<boolean> {
  const { subject, html, text } = buildWelcomeEmail(opts);
  return sendEmail(to, subject, html, { text });
}
