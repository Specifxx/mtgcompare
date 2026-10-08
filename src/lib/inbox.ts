// Public form writes: wrong-price reports, store suggestions, feedback and
// contact messages (/api/price-report, /api/stores/suggest, /api/feedback,
// /api/contact). Inputs arrive already parsed by lib/inbox-rules.ts. Nothing
// here reads the session (routes pass the user id), stores an IP address or
// sends email. Every read is one narrow lookup by key.
import { prisma } from "./db";
import type { Country } from "./country";
import type { Finish } from "./constants";
import { cardExists, sealedExists } from "./data";
import { planeSource } from "./data/plane/runtime";
import { readLiveOffers, type LiveOffer } from "./offer-read";
import { formatTicketNumber, nextNumber, type CounterClient } from "./order-number";
import type { SupportInput, ContactInput, FeedbackInput, PriceReportInput, StoreSuggestionInput } from "./inbox-rules";
import { STORES, sourceLabel } from "./stores";

/** The offer a report is about, out of the live offers of its unit: same source, same market. Pure. */
export function pickShownOffer(offers: readonly LiveOffer[], source: string, market: string): { priceCents: number; currency: string; url: string } | null {
  const o = offers.find((x) => x.source === source && x.market === market);
  return o ? { priceCents: o.priceCents, currency: o.currency, url: o.url } : null;
}

/**
 * What we SHOWED for a report: the published offer of (product, finish) at that source, read here and never taken from the
 * request. Singles only (sealed offers sit in their own detail file), and never an eBay row (eBay data is not a published file).
 * A vanished offer, an unknown store or an unreachable data host is null: the report is still worth keeping.
 */
async function shownOffer(v: PriceReportInput): Promise<{ priceCents: number; currency: string; url: string } | null> {
  if (!/^(tcgplayer|store:|feed:)/.test(v.source)) return null;
  try {
    const { src } = await planeSource();
    const finish: Finish = v.finish === 1 ? "F" : "N";
    const offers = await readLiveOffers(src, { units: [{ id: v.productId, finish }], market: v.market as Country, includeTcgplayer: true });
    return pickShownOffer(offers, v.source, v.market);
  } catch {
    return null;
  }
}

/**
 * A wrong-price report. The product must exist in the published catalogue (its id, no foreign key: user rows hold a plain
 * productId); what we SHOWED (price, currency, listing URL) is read from the published offers server-side, never from the
 * request. The offer's own title is not published, so `listingTitle` stays null. If the catalogue cannot be reached the
 * visitor is asked to try again (503) rather than told the product is unknown.
 */
export async function createPriceReport(v: PriceReportInput, userId: string | null): Promise<{ ok: true } | { ok: false; status: 400 | 503; error: string }> {
  let kind: "card" | "sealed";
  try {
    const [cards, sealed] = await Promise.all([cardExists([v.productId]), sealedExists([v.productId])]);
    if (cards.has(v.productId)) kind = "card";
    else if (sealed.has(v.productId)) kind = "sealed";
    else return { ok: false, status: 400, error: "Unknown product" };
  } catch {
    return { ok: false, status: 503, error: "We couldn't check that product just now. Try again in a minute." };
  }
  const offer = kind === "card" ? await shownOffer(v) : null;
  await prisma.priceReport.create({
    data: {
      productId: v.productId,
      finish: v.finish,
      kind,
      source: v.source,
      market: v.market,
      storeName: sourceLabel(v.source, v.market),
      shownPriceCents: offer?.priceCents ?? null,
      currency: offer?.currency ?? null,
      listingTitle: null,
      listingUrl: offer?.url ?? null,
      issue: v.issue,
      claimedCents: v.claimedCents,
      note: v.note,
      userId,
      page: v.page,
    },
  });
  return { ok: true };
}

const bareHost = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Is this host one we already read? (`storeUrl` is "https://<bare host>".) */
export function isTrackedStoreUrl(storeUrl: string): boolean {
  const host = bareHost(storeUrl);
  return Boolean(host) && STORES.some((s) => bareHost(s.base) === host);
}

export async function createStoreSuggestion(
  v: StoreSuggestionInput,
  userId: string | null,
): Promise<{ ok: true; alreadyTracked?: true; alreadySuggested?: true }> {
  if (isTrackedStoreUrl(v.storeUrl)) return { ok: true, alreadyTracked: true };
  const existing = await prisma.storeSuggestion.findFirst({ where: { storeUrl: v.storeUrl }, select: { id: true } });
  if (existing) return { ok: true, alreadySuggested: true };
  await prisma.storeSuggestion.create({ data: { storeName: v.storeName, storeUrl: v.storeUrl, country: v.country, note: v.note, userId } });
  return { ok: true };
}

export async function createFeedback(v: FeedbackInput, userId: string | null): Promise<{ ok: true }> {
  await prisma.feedback.create({
    data: { userId, rating: v.rating, message: v.message, displayName: v.consentPublic ? v.displayName : null, consentPublic: v.consentPublic, page: v.page, source: v.source, email: v.email },
  });
  return { ok: true };
}

export async function createContactMessage(v: ContactInput, userId: string | null): Promise<{ ok: true }> {
  await prisma.contactMessage.create({ data: { name: v.name, email: v.email, subject: v.subject, category: v.category, message: v.message, userId } });
  return { ok: true };
}

/**
 * A support ticket. The number comes from order-number.ts inside the SAME
 * transaction as the insert, so a failed write never burns a number. Shown on
 * screen as MC-<n>; no email is sent until a mailer exists (the owner replies
 * from their own mail client).
 */
export async function createSupportTicket(v: SupportInput, userId: string | null): Promise<{ ok: true; ticket: string; number: number }> {
  const number = await prisma.$transaction(async (tx) => {
    const n = await nextNumber("support", tx as unknown as CounterClient);
    await tx.supportTicket.create({ data: { number: n, userId, email: v.email, name: v.name, category: v.category, subject: v.subject, message: v.message } });
    return n;
  });
  return { ok: true, ticket: formatTicketNumber(number)!, number };
}
