// /admin/inbox reads and mutations. Uncached (owner-only traffic). Each list
// loads under its own try/catch so one failing table never sinks the page.
import { loadAppearances } from "./admin-health";
import { prisma } from "./db";
import type { FeedbackAction, ReportStatus, SuggestionStatus, ContactStatus } from "./inbox-rules";
import { shouldNotifyReporter } from "./inbox-rules";
import type { StoreAppearance } from "./store-health";
import { isEbaySource, sourceLabel } from "./stores";

export const INBOX_CAPS = { contact: 500, suggestions: 500, feedback: 500, reports: 300 } as const;
/** A store with this many NEW/CONFIRMED reports in HOT_DAYS gets the red banner. */
export const HOT_REPORTS = 2;
export const HOT_DAYS = 14;

const settle = async <T>(p: Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> => {
  try {
    return { ok: true, data: await p };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "Failed" };
  }
};

async function loadReports() {
  const rows = await prisma.priceReport.findMany({ orderBy: { createdAt: "desc" }, take: INBOX_CAPS.reports });
  const ids = [...new Set(rows.map((r) => r.productId))];
  const [cards, sealed] = ids.length
    ? await Promise.all([
        prisma.card.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true } }),
        prisma.sealed.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true } }),
      ])
    : [[], []];
  const product = new Map<number, { name: string; href: string }>();
  for (const c of cards) product.set(c.id, { name: c.name, href: `/card/${c.slug}` });
  for (const s of sealed) product.set(s.id, { name: s.name, href: `/sealed/${s.slug}` });
  return rows.map((r) => ({ ...r, product: product.get(r.productId) ?? null }));
}

async function loadHotStores(now = new Date()): Promise<{ source: string; name: string; reports: number; latest: StoreAppearance | null }[]> {
  const groups = await prisma.priceReport.groupBy({
    by: ["source"],
    where: { status: { in: ["NEW", "CONFIRMED"] }, createdAt: { gte: new Date(now.getTime() - HOT_DAYS * 86_400_000) } },
    _count: { _all: true },
  });
  // eBay rows are listings found by the eBay pass, not a store scraper: their
  // reports stay in the inbox but never flag a "hot store".
  const hot = groups.filter((g) => g._count._all >= HOT_REPORTS && !isEbaySource(g.source)).sort((a, b) => b._count._all - a._count._all);
  if (!hot.length) return [];
  // The store's last read, so a broken scraper is easy to tell from a real price change.
  const appearances = await loadAppearances().catch(() => new Map<string, StoreAppearance[]>());
  return hot.map((g) => ({
    source: g.source,
    name: sourceLabel(g.source),
    reports: g._count._all,
    latest: g.source.startsWith("store:") ? (appearances.get(g.source.slice(6))?.[0] ?? null) : null,
  }));
}

async function loadFeedback() {
  const [rows, total] = await Promise.all([prisma.feedback.findMany({ orderBy: { createdAt: "desc" }, take: INBOX_CAPS.feedback }), prisma.feedback.count()]);
  const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is string => Boolean(x)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, email: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return { total, rows: rows.map((r) => ({ ...r, submitter: r.userId ? (byId.get(r.userId) ?? null) : null })) };
}

export async function loadInbox() {
  const [reports, hotStores, suggestions, feedback, contact] = await Promise.all([
    settle(loadReports()),
    settle(loadHotStores()),
    settle(prisma.storeSuggestion.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: INBOX_CAPS.suggestions })),
    settle(loadFeedback()),
    settle(prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: INBOX_CAPS.contact })),
  ]);
  return { reports, hotStores, suggestions, feedback, contact };
}

export type Inbox = Awaited<ReturnType<typeof loadInbox>>;

/** Open items per queue, for the /admin home. */
export async function newCounts(): Promise<{ reports: number; suggestions: number; feedback: number; contact: number }> {
  const [reports, suggestions, feedback, contact] = await Promise.all([
    prisma.priceReport.count({ where: { status: "NEW" } }),
    prisma.storeSuggestion.count({ where: { status: "pending" } }),
    prisma.feedback.count({ where: { status: "NEW" } }),
    prisma.contactMessage.count({ where: { status: "NEW" } }),
  ]);
  return { reports, suggestions, feedback, contact };
}

type Result = { ok: true; before?: string; after?: string } | { ok: false; status: 400 | 404; error: string };
const NOT_FOUND: Result = { ok: false, status: 404, error: "Not found" };

export async function setReportStatus(id: string, status: ReportStatus): Promise<Result> {
  const row = await prisma.priceReport.findUnique({ where: { id }, select: { status: true } });
  if (!row) return NOT_FOUND;
  await prisma.priceReport.update({ where: { id }, data: { status } });
  // When a mailer exists: notify the reporter when shouldNotifyReporter(prev, next).
  void shouldNotifyReporter(row.status, status);
  return { ok: true, before: row.status, after: status };
}

export async function deleteReport(id: string): Promise<Result> {
  const { count } = await prisma.priceReport.deleteMany({ where: { id } });
  return count ? { ok: true } : NOT_FOUND;
}

export async function setSuggestionStatus(id: string, status: SuggestionStatus): Promise<Result> {
  const row = await prisma.storeSuggestion.findUnique({ where: { id }, select: { status: true } });
  if (!row) return NOT_FOUND;
  await prisma.storeSuggestion.update({ where: { id }, data: { status } });
  return { ok: true, before: row.status, after: status };
}

export async function deleteSuggestion(id: string): Promise<Result> {
  const { count } = await prisma.storeSuggestion.deleteMany({ where: { id } });
  return count ? { ok: true } : NOT_FOUND;
}

export async function setContactStatus(id: string, status: ContactStatus): Promise<Result> {
  const row = await prisma.contactMessage.findUnique({ where: { id }, select: { status: true } });
  if (!row) return NOT_FOUND;
  await prisma.contactMessage.update({ where: { id }, data: { status } });
  return { ok: true, before: row.status, after: status };
}

export async function deleteContact(id: string): Promise<Result> {
  const { count } = await prisma.contactMessage.deleteMany({ where: { id } });
  return count ? { ok: true } : NOT_FOUND;
}

const FEEDBACK_STATUS_FOR: Record<Exclude<FeedbackAction, "approve" | "delete">, "HIDDEN" | "SPAM" | "NEW"> = { hide: "HIDDEN", spam: "SPAM", reopen: "NEW" };

/** Approve publishes ONLY a row whose author ticked "show this publicly". */
export async function moderateFeedback(id: string, action: FeedbackAction): Promise<Result> {
  const row = await prisma.feedback.findUnique({ where: { id }, select: { status: true, consentPublic: true } });
  if (!row) return NOT_FOUND;
  if (action === "delete") {
    await prisma.feedback.delete({ where: { id } });
    return { ok: true, before: row.status };
  }
  if (action === "approve") {
    if (!row.consentPublic) return { ok: false, status: 400, error: "The author did not agree to show this publicly" };
    await prisma.feedback.update({ where: { id }, data: { status: "APPROVED", publishedAt: new Date() } });
    return { ok: true, before: row.status, after: "APPROVED" };
  }
  const status = FEEDBACK_STATUS_FOR[action];
  await prisma.feedback.update({ where: { id }, data: { status, publishedAt: null } });
  return { ok: true, before: row.status, after: status };
}
