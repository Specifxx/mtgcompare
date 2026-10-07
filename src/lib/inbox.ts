// Public form writes: wrong-price reports, store suggestions, feedback and
// contact messages (/api/price-report, /api/stores/suggest, /api/feedback,
// /api/contact). Inputs arrive already parsed by lib/inbox-rules.ts. Nothing
// here reads the session (routes pass the user id), stores an IP address or
// sends email. Every read is one narrow lookup by key.
import { prisma } from "./db";
import { formatTicketNumber, nextNumber, type CounterClient } from "./order-number";
import type { SupportInput, ContactInput, FeedbackInput, PriceReportInput, StoreSuggestionInput } from "./inbox-rules";
import { STORES, sourceLabel } from "./stores";

/**
 * A wrong-price report. The product must exist; what we SHOWED (price, currency,
 * listing title and URL) is read from the Offer row server-side, never from the
 * request. A vanished offer stores nulls.
 */
export async function createPriceReport(v: PriceReportInput, userId: string | null): Promise<{ ok: true } | { ok: false; status: 400; error: string }> {
  const card = await prisma.card.findUnique({ where: { id: v.productId }, select: { id: true } });
  const sealed = card ? null : await prisma.sealed.findUnique({ where: { id: v.productId }, select: { id: true } });
  if (!card && !sealed) return { ok: false, status: 400, error: "Unknown product" };
  const offer = await prisma.offer.findUnique({
    where: { productId_source_market: { productId: v.productId, source: v.source, market: v.market } },
    select: { priceCents: true, currency: true, title: true, url: true },
  });
  await prisma.priceReport.create({
    data: {
      productId: v.productId,
      kind: card ? "card" : "sealed",
      source: v.source,
      market: v.market,
      storeName: sourceLabel(v.source, v.market),
      shownPriceCents: offer?.priceCents ?? null,
      currency: offer?.currency ?? null,
      listingTitle: offer?.title ?? null,
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
 * screen as OC-<n>; no email is sent until a mailer exists (the owner replies
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
