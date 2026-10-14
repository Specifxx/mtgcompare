// The ops watch, collecting half: every area of the site as HealthChecks, plus the inbox. SCRIPT-SIDE (scripts/ops-watch.ts, an hourly Actions job): it reads Neon, the published tree and the Actions API, none of which a public
// page may touch. Each source is read on its own and a failure is that check going grey ("could not be read"), never the whole watch failing and never green. It reuses the loaders the admin panels already use, so the
// thresholds are the ones the panels show (src/lib/admin-alarms.ts), not a second opinion.
import { deployLevel, type Level } from "./admin-alarms";
import { loadStoreHealthInputs } from "./admin-health";
import { loadEbayBudget } from "./admin-ebay-budget";
import { loadFootprint, loadMailStatus } from "./admin-db-footprint";
import { loadPublication } from "./admin-publication";
import { prisma } from "./db";
import { currentDeploy, readReleaseHistory } from "./deploy-facts";
import { deployAgeDays } from "./release-schedule";
import { limitCheck, type HealthCheck, type InboxCounts, type InboxItem, clip } from "./ops-health";
import { WATCHED_JOBS, jobCheck, readJobRuns } from "./ops-jobs";
import { NEON_LIMITS, neonUsageChecks, readNeonUsage } from "./neon-usage";
import { computeStoreHealth } from "./store-health";
import { STORES, enabledFeeds, platformOf } from "./stores";

const settle = async <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
const unreadable = (key: string, group: string, label: string, href?: string): HealthCheck => ({ key, group, label, level: "unknown", detail: "Could not be read this run.", href });
const MB = 1_048_576;

export async function collectChecks(now = new Date(), env: Record<string, string | undefined> = process.env): Promise<HealthCheck[]> {
  const [pub, ebay, db, mail, hist, shInputs, neon, jobs] = await Promise.all([
    settle(loadPublication(now)),
    settle(loadEbayBudget(prisma, now)),
    settle(loadFootprint()),
    settle(loadMailStatus(prisma, now)),
    settle(readReleaseHistory({ now })),
    settle(loadStoreHealthInputs()),
    readNeonUsage({ env }).catch(() => null),
    Promise.all(WATCHED_JOBS.map(async (j) => jobCheck(j, await readJobRuns(j.file, { env }), now))),
  ]);
  const out: HealthCheck[] = [];

  // Data: what the site serves
  out.push(pub
    ? { key: "data:publication", group: "Data", label: "Published prices and data", level: pub.view.level, detail: pub.view.rows.filter((r) => r.level !== "ok").map((r) => `${r.label}: ${r.value}`).join("; ") || "Fresh: the daily publish is on time.", href: "/admin/data" }
    : unreadable("data:publication", "Data", "Published prices and data", "/admin/data"));

  // Neon: storage from SQL, transfer and compute from the console API when a key is set
  out.push(limitCheck({ key: "neon:storage", group: "Neon", label: "Neon storage", used: db?.totalBytes == null ? null : db.totalBytes / MB, limit: NEON_LIMITS.storageMb, unit: "MB", href: "/admin/database" }));
  out.push(...neonUsageChecks(neon));

  // eBay: the day's calls, then whether the pass is doing anything
  if (ebay?.today) out.push(limitCheck({ key: "ebay:calls", group: "eBay", label: "eBay calls today", used: ebay.today.spent, limit: ebay.today.cap, unit: "calls", href: "/admin/ebay" }));
  else out.push(unreadable("ebay:calls", "eBay", "eBay calls today", "/admin/ebay"));
  if (ebay) {
    const alarm = ebay.alarms.filter((a) => a.level !== "ok" && a.level !== "unknown");
    const observing = ebay.today?.observeOnly === true;
    const level: Level = ebay.latched ? "bad" : alarm.some((a) => a.level === "bad") ? "bad" : observing || alarm.length ? "warn" : "ok";
    const detail = [ebay.latched ? "The run is latched (it stopped itself after errors)." : "", observing ? "eBay is in observe-only mode: no listings are being collected." : "", ...alarm.map((a) => a.text)].filter(Boolean).join(" ") || "The eBay pass is running and within budget.";
    out.push({ key: "ebay:pass", group: "eBay", label: "eBay pass", level, detail, href: "/admin/ebay" });
  } else out.push(unreadable("ebay:pass", "eBay", "eBay pass", "/admin/ebay"));

  // Mail
  out.push(mail
    ? { key: "mail:status", group: "Mail", label: "E-mail sending", level: mail.email === "on" ? "ok" : mail.email === "off" ? "warn" : "unknown", detail: mail.email === "on" ? "On: alerts and the newsletter can be sent." : mail.email === "off" ? "Off: price alerts, the newsletter and these notifications cannot be sent (the mail secrets are missing or the provider refused the key)." : "No e-mail run has recorded its status yet.", href: "/admin/mail" }
    : unreadable("mail:status", "Mail", "E-mail sending", "/admin/mail"));

  // Stores
  if (shInputs) {
    const stores = STORES.filter((s) => platformOf(s) !== "feed" || enabledFeeds().includes(s));
    const alerting = computeStoreHealth(stores, shInputs.history, shInputs.offers, now).filter((h) => h.alerts.length).length;
    const pct = stores.length ? (alerting / stores.length) * 100 : 0;
    out.push({ key: "stores:health", group: "Stores", label: "Store scrapers", level: pct >= 30 ? "bad" : pct >= 10 ? "warn" : "ok", detail: alerting ? `${alerting} of ${stores.length} stores need a look (failed reads, drops, low match rate).` : `All ${stores.length} stores are reading normally.`, href: "/admin/store-health" });
  } else out.push(unreadable("stores:health", "Stores", "Store scrapers", "/admin/store-health"));

  // Code: how old is the running release
  const age = deployAgeDays(hist?.commits[0]?.at ?? currentDeploy().builtAt, now);
  out.push({ key: "site:deploy", group: "Site", label: "Release age", level: deployLevel(age), detail: age == null ? "The last release could not be read." : `The running code is ${age} day${age === 1 ? "" : "s"} old (a release is due every Tuesday).`, href: "/admin/deploys" });

  out.push(...jobs);
  return out;
}

// ── the inbox ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function loadInboxCounts(): Promise<InboxCounts> {
  const [reports, suggestions, feedback, contact, support] = await Promise.all([
    prisma.priceReport.count({ where: { status: "NEW" } }),
    prisma.storeSuggestion.count({ where: { status: "pending" } }),
    prisma.feedback.count({ where: { status: "NEW" } }),
    prisma.contactMessage.count({ where: { status: "NEW" } }),
    prisma.supportTicket.count({ where: { status: "OPEN" } }),
  ]);
  return { reports, suggestions, feedback, contact, support };
}

/** Everything that arrived after `since` (any status: a message answered within the hour is still news), up to `take` per queue. Visitors' addresses are quoted only so the owner can reply: the mail goes to the owner. */
export async function inboxItemsSince(since: Date, take = 25): Promise<InboxItem[]> {
  const gt = { gt: since };
  const [reports, suggestions, feedback, contact, support] = await Promise.all([
    prisma.priceReport.findMany({ where: { createdAt: gt }, orderBy: { createdAt: "desc" }, take }),
    prisma.storeSuggestion.findMany({ where: { createdAt: gt }, orderBy: { createdAt: "desc" }, take }),
    prisma.feedback.findMany({ where: { createdAt: gt }, orderBy: { createdAt: "desc" }, take }),
    prisma.contactMessage.findMany({ where: { createdAt: gt }, orderBy: { createdAt: "desc" }, take }),
    prisma.supportTicket.findMany({ where: { createdAt: gt }, orderBy: { createdAt: "desc" }, take }),
  ]);
  return [
    ...reports.map((r): InboxItem => ({ kind: "report", at: r.createdAt, title: `${r.storeName} (${r.market}): ${r.issue}`, snippet: clip(r.note ?? r.listingTitle ?? "") })),
    ...suggestions.map((s): InboxItem => ({ kind: "suggestion", at: s.createdAt, title: `${s.storeName} (${s.country})`, snippet: clip(`${s.storeUrl} ${s.note ?? ""}`) })),
    ...feedback.map((f): InboxItem => ({ kind: "feedback", at: f.createdAt, title: f.rating ? `${f.rating}/5${f.page ? ` on ${f.page}` : ""}` : f.page ? `On ${f.page}` : "Feedback", snippet: clip(`${f.message}${f.email ? ` (reply to ${f.email})` : ""}`) })),
    ...contact.map((m): InboxItem => ({ kind: "message", at: m.createdAt, title: `${m.name}: ${m.subject || m.category}`, snippet: clip(`${m.message} (reply to ${m.email})`) })),
    ...support.map((t): InboxItem => ({ kind: "support", at: t.createdAt, title: `#${t.number} ${t.subject}`, snippet: clip(`${t.message} (reply to ${t.email})`) })),
  ];
}
