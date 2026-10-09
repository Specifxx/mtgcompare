import { randomUUID } from "crypto";
import { prisma } from "./db";
import { getCatalogStats, getHomeStats, getMovers, getNewestCards, getDemandStrip, getUpcomingSets } from "./data";
import type { CardLite } from "./data/types";
import { sendNewsletterDigestEmail, isEmailEnabled, escapeHtml, EMAIL_COLORS } from "./email";
import { money, usd } from "./format";
import { COUNTRIES, MARKETS, normalizeCountry, type Country } from "./country";
import { SITE_URL } from "./site";
import { cardEbayQuery, ebaySearchUrl } from "./affiliate";
import { sponsorFor, type NewsletterSponsor } from "./newsletter-sponsor";

// THE WEEKLY NEWSLETTER — RiftCompare's lib/newsletter.ts, ported to MTG Compare.
// Sent by scripts/newsletter.ts
// (.github/workflows/email-weekly.yml, Fridays 21:00 UTC) — GitHub Actions, never
// Vercel, and a green no-op while email is off (lib/email.ts isEmailEnabled).
//
// What changed from RiftCompare, and why:
//   • Movers are MTG Compare's own: TCGplayer's market price against ~7 days ago
//     (CardLite.change7d, the numbers /movers shows), cards worth US$1+, and
//     "best value" = furthest under the card's 90-day high (US$3+, 5%+ off).
//     They are read ONCE per run from the published mover lists (getMovers, the
//     headline unit of each card) and are the same for every market; each
//     market's edition adds its own cheapest listing.
//   • "Newest Magic cards" replaces RiftCompare's Radiance reveals: the newest
//     cards of the catalogue (getNewestCards, newest set first).
//   • No Index, peaks or articles sections; every figure that IS here comes from
//     the published files the site shows, so the email never says something the
//     site doesn't.
//   • The eBay link on each row is an affiliate-tagged SEARCH (lib/affiliate.ts
//     ebaySearchUrl), never an API call.

/** A card as the digest reads it (the headline unit of a CardLite, see loadDigestCards). */
export interface DigestCard {
  id: number;
  slug: string;
  name: string;
  number: string | null;
  variant: string | null;
  setCode: string;
  marketUsd: number | null;
  change7d: number | null;
  high90Usd: number | null;
  low: Partial<Record<Country, number | null>>;
}

export interface Mover {
  card: DigestCard;
  pct: number; // signed, whole percent
}

export interface PriceMovers {
  spiking: Mover[];
  plummeting: Mover[];
  value: Mover[]; // pct = how far under the 90-day high (negative)
}

export interface NewsletterRunSummary {
  edition: string; // e.g. "2026-W40"
  subscribers: number; // total rows in the list
  due: number; // not yet sent this edition
  emails: number; // successfully delivered this run
  quietMarkets: string[]; // markets skipped for lack of movers
  skipped: "email-off" | null;
}

// ISO-8601 week key — one digest edition per calendar week, so reruns of the
// workflow (or a manual dispatch after a partial failure) never double-send.
export function editionKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // nearest Thursday decides the ISO year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Thresholds, the same as /movers (lib/selectors.ts movers/offHighs). */
export const MOVER_MIN_USD_CENTS = 100;
export const VALUE_MIN_USD_CENTS = 300;
export const VALUE_MIN_OFF_PCT = 5;

/** Pure: the three mover lists from the digest's card rows. */
export function digestMovers(cards: readonly DigestCard[], take = 8): PriceMovers {
  const moving = cards.filter((c) => c.change7d != null && (c.marketUsd ?? 0) >= MOVER_MIN_USD_CENTS);
  const spiking = moving
    .filter((c) => c.change7d! > 0)
    .sort((a, b) => b.change7d! - a.change7d!)
    .slice(0, take)
    .map((card) => ({ card, pct: Math.round(card.change7d!) }));
  const plummeting = moving
    .filter((c) => c.change7d! < 0)
    .sort((a, b) => a.change7d! - b.change7d!)
    .slice(0, take)
    .map((card) => ({ card, pct: Math.round(card.change7d!) }));
  const value = cards
    .filter((c) => c.high90Usd && c.marketUsd && c.marketUsd >= VALUE_MIN_USD_CENTS && c.high90Usd > c.marketUsd)
    .map((card) => ({ card, off: ((card.high90Usd! - card.marketUsd!) / card.high90Usd!) * 100 }))
    .filter((x) => x.off >= VALUE_MIN_OFF_PCT)
    .sort((a, b) => b.off - a.off)
    .slice(0, take)
    .map((x) => ({ card: x.card, pct: -Math.round(x.off) }));
  // A rounded 0% is not a move.
  return { spiking: spiking.filter((m) => m.pct !== 0), plummeting: plummeting.filter((m) => m.pct !== 0), value: value.filter((m) => m.pct !== 0) };
}

function toDigestCard(c: CardLite): DigestCard {
  return { id: c.id, slug: c.slug, name: c.name, number: c.number, variant: c.variant, setCode: c.setCode, marketUsd: c.marketUsd, change7d: c.change7d, high90Usd: c.high90Usd, low: c.low };
}

/**
 * The cards that can move: worth US$1+ with a 7-day change or a 90-day high.
 * The published mover lists (up and down over 7 days, down over 30) cover the
 * three digest sections; a card is kept once. The headline unit of each card.
 */
export async function loadDigestCards(): Promise<DigestCard[]> {
  const lists = await Promise.all([
    getMovers({ dir: "up", window: 7, minCents: MOVER_MIN_USD_CENTS, n: 100 }),
    getMovers({ dir: "down", window: 7, minCents: MOVER_MIN_USD_CENTS, n: 100 }),
    getMovers({ dir: "down", window: 30, minCents: VALUE_MIN_USD_CENTS, n: 100 }),
  ]);
  const seen = new Map<number, CardLite>();
  for (const c of lists.flat()) if (!seen.has(c.id)) seen.set(c.id, c);
  return [...seen.values()].map(toDigestCard);
}

/** The newest cards in the catalogue (the newest set first): what the digest calls new this week. */
export async function recentNewCards(): Promise<DigestCard[]> {
  return (await getNewestCards(12).catch(() => [] as CardLite[])).map(toDigestCard);
}

const C = EMAIL_COLORS;
const UTM = "utm_source=newsletter&utm_medium=email&utm_campaign=weekly-digest";
const utm = (path: string) => `${SITE_URL}${path}${path.includes("?") ? "&" : "?"}${UTM}`;
const cardHref = (c: Pick<DigestCard, "slug">) => `/card/${c.slug}`;
const signedPct = (pct: number) => `${pct > 0 ? "+" : ""}${pct}%`;
const label = (c: DigestCard) => `${c.setCode}${c.number ? ` · ${c.number}` : ""}${c.variant ? ` · ${c.variant}` : ""}`;
const UP = "#ff8f5a";
const DOWN = "#34d399";

function heading(title: string): string {
  return `<tr><td style="padding:18px 32px 0;font-size:13px;font-weight:700;color:${C.accent}">${title}</td></tr>`;
}

function para(html: string): string {
  return `<tr><td style="padding:6px 32px 0;font-size:14px;line-height:1.6;color:${C.text}">${html}</td></tr>`;
}

/** Each market's own cheapest listing, else TCGplayer's market price in US dollars. */
function priceLine(c: DigestCard, market: Country): string {
  const own = c.low[market];
  const tcg = c.marketUsd != null ? `TCGplayer market ${usd(c.marketUsd)}` : "";
  if (own != null) return `from ${money(own, market)}${tcg ? ` · ${tcg}` : ""}`;
  return tcg || "not priced yet";
}

// One card row. Every row carries TWO links: the card page (every store's price,
// affiliate-wrapped there) and a direct eBay affiliate search, so a reader who
// buys straight from the email still credits the affiliate link.
function moverRow(m: Mover, market: Country, kind: "move" | "value"): string {
  const color = m.pct > 0 ? UP : DOWN;
  const ebayHref = ebaySearchUrl(market, cardEbayQuery(m.card), "newsletter");
  const ebayTagged = `${ebayHref}${ebayHref.includes("?") ? "&" : "?"}${UTM}`;
  const change = kind === "value" ? `${Math.abs(m.pct)}% under its 90-day high` : `${signedPct(m.pct)} this week`;
  return `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.border}">
    <a href="${utm(cardHref(m.card))}" style="color:${C.white};font-weight:700;text-decoration:none;font-size:15px">${escapeHtml(m.card.name)}</a>
    <div style="font-size:12px;color:${C.muted};margin-top:2px">${escapeHtml(label(m.card))}</div>
    <div style="margin-top:4px;font-size:14px;color:${C.text}">${priceLine(m.card, market)}
      &nbsp;<span style="color:${color};font-weight:700">${change}</span>
      &nbsp;&nbsp;<a href="${escapeHtml(ebayTagged)}" style="color:${C.link};font-weight:700;font-size:12px;text-decoration:none">Search eBay →</a></div>
  </td></tr>`;
}

function section(title: string, items: Mover[], take: number, market: Country, kind: "move" | "value" = "move"): string {
  if (!items.length) return "";
  return `${heading(title)}
    <tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items
      .slice(0, take)
      .map((m) => moverRow(m, market, kind))
      .join("")}</table></td></tr>`;
}

function newCardsSection(cards: DigestCard[], market: Country): string {
  if (!cards.length) return "";
  return `${heading("Newest Magic cards")}
    <tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards
      .map(
        (c) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.border}">
      <a href="${utm(cardHref(c))}" style="color:${C.white};font-weight:700;text-decoration:none;font-size:15px">${escapeHtml(c.name)}</a>
      <div style="font-size:12px;color:${C.muted};margin-top:2px">${escapeHtml(label(c))} · ${priceLine(c, market)}</div></td></tr>`,
      )
      .join("")}</table></td></tr>
    <tr><td style="padding:8px 32px 0;font-size:13px"><a href="${utm("/release-dates")}" style="color:${C.accent};font-weight:700;text-decoration:none">Every upcoming set →</a></td></tr>`;
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDay = (iso: string) => DATE.format(new Date(`${iso}T00:00:00Z`));

// ── Extra sections ─────────────────────────────────────────────────────────

export interface DigestExtras {
  /** Cards with a live price and stores with stock in this market. */
  stats?: { priced: number; liveStores: number | null } | null;
  /** Most-searched cards on the site right now. */
  popular?: DigestCard[];
  /** Upcoming dated releases (Set.releasedOn in the future). */
  releases?: { name: string; date: string; daysAway: number; href: string | null }[];
  /** Sponsored slot: a booking, "house" for the sponsor-us line, or omitted for none. */
  sponsor?: NewsletterSponsor | "house" | null;
}

function glanceSection(x: DigestExtras, market: Country): string {
  if (!x.stats) return "";
  return `${heading("The market at a glance")}${para(
    `${x.stats.priced.toLocaleString("en-US")} cards with a live price${x.stats.liveStores ? ` across ${x.stats.liveStores} ${COUNTRIES[market].adjective} stores with stock` : ""}`,
  )}`;
}

function sponsorSection(sp: DigestExtras["sponsor"]): string {
  if (!sp) return "";
  if (sp === "house") {
    return `<tr><td style="padding:18px 32px 0"><div style="border:1px dashed ${C.border};border-radius:10px;padding:12px 14px;font-size:13px;color:${C.muted}">
      <span style="font-size:10px;font-weight:700;letter-spacing:.06em;color:${C.muted}">SPONSORED</span><br/>
      Want to reach Magic: The Gathering collectors every week? <a href="${utm("/contact")}" style="color:${C.accent};font-weight:700;text-decoration:none">Sponsor this newsletter →</a>
    </div></td></tr>`;
  }
  const sep = sp.url.includes("?") ? "&" : "?";
  const href = `${sp.url}${sep}utm_source=mtgcompare&utm_medium=email&utm_campaign=newsletter-sponsor`;
  return `<tr><td style="padding:18px 32px 0"><div style="border:1px solid ${C.border};background:${C.inset};border-radius:10px;padding:14px 16px">
    <div style="font-size:10px;font-weight:700;letter-spacing:.06em;color:${C.muted}">SPONSORED · ${escapeHtml(sp.name)}</div>
    ${sp.imageUrl ? `<a href="${escapeHtml(href)}" rel="sponsored"><img src="${escapeHtml(sp.imageUrl)}" alt="${escapeHtml(sp.name)}" width="536" style="display:block;width:100%;max-width:536px;border-radius:8px;margin-top:8px" /></a>` : ""}
    <div style="margin-top:8px;font-size:16px;font-weight:700;color:${C.white}">${escapeHtml(sp.headline)}</div>
    <div style="margin-top:4px;font-size:14px;line-height:1.6;color:${C.text}">${escapeHtml(sp.body)}</div>
    <a href="${escapeHtml(href)}" rel="sponsored" style="display:inline-block;margin-top:10px;color:${C.accent};font-weight:700;text-decoration:none">${escapeHtml(sp.cta)} →</a>
  </div></td></tr>`;
}

function popularSection(cards: DigestCard[], market: Country): string {
  if (!cards.length) return "";
  return `${heading("What collectors are searching for")}
    <tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards
      .map((c) => {
        const cents = c.low[market];
        return `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.border}">
      <a href="${utm(cardHref(c))}" style="color:${C.white};font-weight:700;text-decoration:none;font-size:15px">${escapeHtml(c.name)}</a>
      <span style="font-size:12px;color:${C.muted}"> · ${escapeHtml(c.setCode)}</span>
      ${cents != null ? `<span style="float:right;font-size:14px;color:${C.text}">from ${money(cents, market)}</span>` : ""}
    </td></tr>`;
      })
      .join("")}</table></td></tr>`;
}

function releasesSection(list: NonNullable<DigestExtras["releases"]>): string {
  if (!list.length) return "";
  return `${heading("Coming up")}${list
    .map((r) =>
      para(
        `<strong style="color:${C.white}">${escapeHtml(r.name)}</strong> — ${fmtDay(r.date)} (${r.daysAway === 0 ? "today" : `in ${r.daysAway} ${r.daysAway === 1 ? "day" : "days"}`})${r.href ? ` · <a href="${utm(r.href)}" style="color:${C.accent};text-decoration:none">details →</a>` : ""}`,
      ),
    )
    .join("")}`;
}

/** Load every extra section for one market. Each source fails on its own. */
export async function loadDigestExtras(market: Country, now = new Date(), opts: { sponsor?: boolean } = {}): Promise<DigestExtras> {
  const quiet = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
  const [catalog, home, popular, sets] = await Promise.all([quiet(getCatalogStats()), quiet(getHomeStats()), quiet(getDemandStrip().then((d) => d.rows.slice(0, 5).map((r) => r.card))), quiet(getUpcomingSets(2))]);
  const today = now.toISOString().slice(0, 10);
  return {
    stats: catalog ? { priced: catalog.pricedByMarket[market] ?? 0, liveStores: home ? home.liveStoresAll : null } : null,
    popular: (popular ?? []).map(toDigestCard),
    releases: (sets ?? [])
      .filter((s) => s.releasedOn)
      .map((s) => {
        const date = s.releasedOn!.slice(0, 10);
        return { name: s.name, date, daysAway: Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000), href: `/sets/${s.slug}` };
      }),
    ...(opts.sponsor ? { sponsor: sponsorFor(market, now) ?? "house" } : {}),
  };
}

export interface Digest {
  subject: string;
  heading: string;
  inner: string;
}

// Build one market's digest, or null on a quiet week (house rule: skip rather
// than send noise).
export function buildDigest(movers: PriceMovers, market: Country, newCards: DigestCard[] = [], extras: DigestExtras = {}): Digest | null {
  const quietMarket = !movers.spiking.length && !movers.plummeting.length && !movers.value.length;
  if (quietMarket && !newCards.length) return null;

  const info = COUNTRIES[market];
  const bits: string[] = [];
  const topRiser = movers.spiking[0];
  const topDrop = movers.plummeting[0];
  if (topRiser) bits.push(`${topRiser.card.name} ${signedPct(topRiser.pct)}`);
  if (topDrop) bits.push(`${topDrop.card.name} ${signedPct(topDrop.pct)}`);
  const subject = bits.length
    ? `Magic cards this week: ${bits.join(", ")}`
    : `${newCards.length} of the newest Magic ${newCards.length === 1 ? "card" : "cards"}`;

  const inner = `
    <tr><td style="padding:8px 32px 0;font-size:14px;line-height:1.6;color:${C.text}">
      Your weekly read on the Magic: The Gathering market: the biggest price moves on TCGplayer's market price, the cards collectors are searching for and what's coming up — with the cheapest listing we track at ${info.adjective} stores.
    </td></tr>
    ${glanceSection(extras, market)}
    ${newCardsSection(newCards, market)}
    ${section("Rising this week", movers.spiking, 8, market)}
    ${sponsorSection(extras.sponsor)}
    ${section("Biggest drops", movers.plummeting, 8, market)}
    ${section("Best value vs the 90-day high", movers.value, 5, market, "value")}
    ${extras.popular ? popularSection(extras.popular, market) : ""}
    ${extras.releases ? releasesSection(extras.releases) : ""}
    <tr><td style="padding:18px 32px 24px"><a href="${utm("/movers")}" style="display:inline-block;background:${C.button};color:${C.buttonInk};font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">See all movers and price charts</a></td></tr>`;

  return { subject, heading: "This week on the Magic card market", inner };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Weekly digest send. Walks every subscriber who hasn't received this week's
// edition, builds one digest per market (subscribers chose their market at
// signup), and emails them with a per-subscriber unsubscribe link. Marks each
// row only after a successful send, so a crash mid-run resumes cleanly.
export async function runNewsletterDigest(now = new Date()): Promise<NewsletterRunSummary> {
  const edition = editionKey(now);
  const subs = await prisma.newsletterSubscriber.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, market: true, unsubToken: true, lastEditionKey: true },
    take: 20000,
  });
  const due = subs.filter((s) => s.lastEditionKey !== edition);
  const summary: NewsletterRunSummary = { edition, subscribers: subs.length, due: due.length, emails: 0, quietMarkets: [], skipped: null };
  if (!isEmailEnabled()) return { ...summary, skipped: "email-off" };
  if (!due.length) return summary;

  // Movers and new cards are market-independent: read once per run.
  const movers = digestMovers(await loadDigestCards());
  const newCards = await recentNewCards();
  const digests = new Map<Country, Digest | null>();
  for (const sub of due) {
    const market = normalizeCountry(sub.market);
    if (!digests.has(market)) {
      const extras = await loadDigestExtras(market, now, { sponsor: true });
      digests.set(market, buildDigest(movers, market, newCards, extras));
      if (!digests.get(market)) summary.quietMarkets.push(market);
    }
    const digest = digests.get(market);
    if (!digest) continue; // quiet week in this market — try again next edition

    // Lazy-backfill the unsubscribe token for a row created without one.
    const token = sub.unsubToken ?? randomUUID();
    if (!sub.unsubToken) await prisma.newsletterSubscriber.update({ where: { id: sub.id }, data: { unsubToken: token } });
    const sent = await sendNewsletterDigestEmail(sub.email, digest.subject, digest.heading, digest.inner, newsletterUnsubUrl(token));
    if (sent) {
      summary.emails++;
      await prisma.newsletterSubscriber.update({ where: { id: sub.id }, data: { lastEditionKey: edition } });
    }
    await sleep(600); // stay under Resend's 2 req/s rate limit
  }
  return summary;
}

export function newsletterUnsubUrl(token: string): string {
  return `${SITE_URL}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

export const NEWSLETTER_WELCOMES_PER_RUN = 50;

/**
 * The welcome outbox: one welcome to each subscriber who has none yet,
 * claim-before-send (welcomeSentAt set only while still null), released on a
 * failed send. Only subscribers from the last 7 days: an older row predates
 * the outbox or was refused for a week, and gets the next edition instead.
 */
export async function drainNewsletterWelcomes(
  now = new Date(),
  send: (to: string, unsubUrl: string) => Promise<boolean>,
): Promise<{ pending: number; sent: number; failed: number }> {
  const rows = await prisma.newsletterSubscriber.findMany({
    where: { welcomeSentAt: null, createdAt: { gte: new Date(now.getTime() - 7 * 86400_000) } },
    orderBy: { createdAt: "asc" },
    take: NEWSLETTER_WELCOMES_PER_RUN,
    select: { id: true, email: true, unsubToken: true },
  });
  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    const claim = await prisma.newsletterSubscriber.updateMany({ where: { id: r.id, welcomeSentAt: null }, data: { welcomeSentAt: now } });
    if (claim.count === 0) continue;
    const token = r.unsubToken ?? randomUUID();
    if (!r.unsubToken) await prisma.newsletterSubscriber.update({ where: { id: r.id }, data: { unsubToken: token } });
    let ok = false;
    try {
      ok = await send(r.email, newsletterUnsubUrl(token));
    } catch {
      ok = false;
    }
    if (ok) sent++;
    else {
      failed++;
      await prisma.newsletterSubscriber.update({ where: { id: r.id }, data: { welcomeSentAt: null } }).catch(() => {});
    }
  }
  return { pending: rows.length, sent, failed };
}
