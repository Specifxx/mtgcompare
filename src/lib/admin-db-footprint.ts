// Uncached Neon readers for the admin ops panels that look at the database and the jobs that write to it: /admin/database (the footprint), the ImportRun strip of /admin/data, /admin/ebay
// (the ledger the eBay job wrote) and /admin/mail (newsletter and alert status). Owner-only traffic, so UNCACHED by design (unstable_cache lives in src/lib/data only). Every reader takes the
// client as a parameter (tests pass a stub) and every panel wraps the call in try/catch: a Neon outage renders "Neon unreachable", never a failed page.
// The eBay and mail readers are adapters: REQ-WP21-1 asks WP05 for admin-ebay-budget.ts and REQ-WP21-2 asks WP14 for admin-mail.ts; when they land the panels switch and these two go.
// Nothing here imports a src/lib/ebay*.ts module (tests/no-ebay-api.test.ts): the job records everything the panel needs.
import { prisma } from "./db";
import { dbLevel, spendLevel, type Level } from "./admin-alarms";

type Db = typeof prisma;
const DAY = 86_400_000;

// ── Database footprint ──────────────────────────────────────────────────────
export interface TableSize { table: string; bytes: number; rows: number }
export interface Footprint {
  totalBytes: number | null;
  tables: TableSize[];
  level: Level;
  usedPct: number | null;
  clicks: { rows: number; oldest: Date | null; newest: Date | null };
  trend: { week: string; bytes: number }[];
  risingSnapshotBytes: number | null;
}

/** Parse the `Meta db.footprint.<yyyy-Www>` samples written weekly by scripts/db-audit.ts: value is the byte count (pure). */
export function parseFootprintTrend(rows: readonly { key: string; value: string }[]): { week: string; bytes: number }[] {
  return rows
    .map((r) => ({ week: r.key.replace(/^db\.footprint\./, ""), bytes: /^\d+(\.\d+)?/.test(r.value.trim()) ? Number(r.value.trim().match(/^\d+(\.\d+)?/)![0]) : NaN }))
    .filter((r) => /^\d{4}-W\d{2}$/.test(r.week) && Number.isFinite(r.bytes))
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-26);
}

export async function loadFootprint(db: Db = prisma): Promise<Footprint> {
  const [size, tables, clickAgg, trendRows, rising] = await Promise.all([
    db.$queryRaw<{ b: bigint }[]>`SELECT pg_database_size(current_database()) AS b`,
    db.$queryRaw<{ t: string; b: bigint; r: number }[]>`
      SELECT c.relname AS t, pg_total_relation_size(c.oid) AS b, GREATEST(c.reltuples, 0)::float AS r
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 10`,
    db.clickEvent.aggregate({ _count: { _all: true }, _min: { createdAt: true }, _max: { createdAt: true } }),
    db.meta.findMany({ where: { key: { startsWith: "db.footprint." } }, select: { key: true, value: true }, orderBy: { key: "desc" }, take: 26 }),
    db.$queryRaw<{ b: bigint | null }[]>`SELECT pg_total_relation_size('"RisingSnapshot"') AS b`.catch(() => [{ b: null }]),
  ]);
  const totalBytes = size[0] ? Number(size[0].b) : null;
  const lvl = dbLevel(totalBytes);
  return {
    totalBytes,
    tables: tables.map((t) => ({ table: t.t, bytes: Number(t.b), rows: Math.round(Number(t.r)) })),
    level: lvl.level,
    usedPct: lvl.usedPct,
    clicks: { rows: clickAgg._count._all, oldest: clickAgg._min.createdAt, newest: clickAgg._max.createdAt },
    trend: parseFootprintTrend(trendRows),
    risingSnapshotBytes: rising[0]?.b == null ? null : Number(rising[0].b),
  };
}

// ── ImportRun strip (/admin/data, beside the status that does not need Neon) ─
export interface ImportRunRow { id: number; kind: string; ok: boolean; startedAt: Date; finishedAt: Date | null; seconds: number | null }
export async function loadImportRuns(db: Db = prisma, take = 14): Promise<ImportRunRow[]> {
  const rows = await db.importRun.findMany({ select: { id: true, kind: true, ok: true, startedAt: true, finishedAt: true }, orderBy: { startedAt: "desc" }, take });
  return rows.map((r) => ({ ...r, seconds: r.finishedAt ? Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000) : null }));
}

// ── eBay budget (/admin/ebay) ────────────────────────────────────────────────
export interface EbayDay { windowKey: string; spent: number; cap: number }
export interface EbayBudget {
  today: { windowKey: string; cap: number; claimed: number; spent: number; limit: number | null; resetAt: Date | null; blockedUntil: Date | null; remaining: number | null; mode: string | null; observeOnly: boolean | null; reserve: number | null } | null;
  days: EbayDay[];
  lastRun: { at: string; mode: string; spent: number; matched: number | null; panels: number | null; stop: string | null } | null;
  tiers: { tier: number; label: string; count: number }[];
  bannerAgeHours: number | null;
  config: Record<string, unknown> | null;
  spend: { level: Level; pct: number | null };
  bannerLevel: Level;
  latched: boolean;
}
const TIER_LABEL: Record<number, string> = { 0: "C: no calls", 1: "A: daily chase", 2: "B: rotation", 3: "Sealed", 4: "Banner only" };

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const numOr = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The banner is licence-limited to 72 h (10.15): amber after 48 h, red after 72 h; no banner row is grey (pure). */
export function bannerLevel(ageHours: number | null): Level {
  return ageHours == null ? "unknown" : ageHours >= 72 ? "bad" : ageHours >= 48 ? "warn" : "ok";
}

export async function loadEbayBudget(db: Db = prisma, now = new Date()): Promise<EbayBudget> {
  const [ledger, tiers, banner] = await Promise.all([
    db.ebayLedger.findMany({ orderBy: { windowKey: "desc" }, take: 31 }),
    db.ebayTrack.groupBy({ by: ["tier"], _count: { _all: true } }),
    db.ebayBanner.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: "asc" } }),
  ]);
  const t = ledger[0] ?? null;
  const cfg = obj(t?.config);
  const samples = Array.isArray(t?.samples) ? (t!.samples as { remaining?: number }[]) : [];
  const runs = Array.isArray(t?.runs) ? (t!.runs as Record<string, unknown>[]) : [];
  const last = runs[runs.length - 1];
  const bannerAge = banner ? Math.round(((now.getTime() - banner.updatedAt.getTime()) / 3_600_000) * 10) / 10 : null;
  const today = t
    ? {
        windowKey: t.windowKey, cap: t.cap, claimed: t.claimed, spent: t.spent, limit: t.limit, resetAt: t.resetAt, blockedUntil: t.blockedUntil,
        remaining: numOr(samples[samples.length - 1]?.remaining),
        mode: typeof cfg?.mode === "string" ? cfg.mode : null,
        observeOnly: typeof cfg?.observeOnly === "boolean" ? cfg.observeOnly : null,
        reserve: numOr(cfg?.reserve),
      }
    : null;
  return {
    today,
    days: ledger.map((r) => ({ windowKey: r.windowKey, spent: r.spent, cap: r.cap })).reverse(),
    lastRun: last ? { at: String(last.at ?? ""), mode: String(last.mode ?? ""), spent: numOr(last.spent) ?? 0, matched: numOr(last.matched), panels: numOr(last.panels), stop: typeof last.stop === "string" ? last.stop : null } : null,
    tiers: tiers.map((x) => ({ tier: x.tier, label: TIER_LABEL[x.tier] ?? `tier ${x.tier}`, count: x._count._all })).sort((a, b) => a.tier - b.tier),
    bannerAgeHours: bannerAge,
    config: cfg,
    spend: spendLevel(t?.spent, t?.cap),
    bannerLevel: bannerLevel(bannerAge),
    latched: Boolean(t?.blockedUntil && t.blockedUntil > now),
  };
}

// ── Newsletter and alerts (/admin/mail) ─────────────────────────────────────
export interface MailStatus {
  email: "on" | "off" | null;
  newsletter: { total: number; last7: number; confirmed: number };
  alerts: { price: number; sealed: number; deck: number; release: number; muted: number };
  lastRun: string | null;
  recent: { type: string; createdAt: Date }[];
}
export async function loadMailStatus(db: Db = prisma, now = new Date()): Promise<MailStatus> {
  const since = new Date(now.getTime() - 7 * DAY);
  const [email, total, last7, confirmed, price, sealed, deck, release, muted, run, recent] = await Promise.all([
    db.meta.findUnique({ where: { key: "email" }, select: { value: true } }),
    db.newsletterSubscriber.count(),
    db.newsletterSubscriber.count({ where: { createdAt: { gte: since } } }),
    db.newsletterSubscriber.count({ where: { welcomeSentAt: { not: null } } }),
    db.priceAlert.count(),
    db.sealedWatch.count(),
    db.deckWatch.count(),
    db.setReleaseAlert.count(),
    db.alertMute.count(),
    db.meta.findFirst({ where: { key: { startsWith: "alerts." } }, orderBy: { updatedAt: "desc" }, select: { key: true, value: true, updatedAt: true } }),
    db.notification.findMany({ select: { type: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return {
    email: email?.value === "on" || email?.value === "off" ? email.value : null,
    newsletter: { total, last7, confirmed },
    alerts: { price, sealed, deck, release, muted },
    lastRun: run ? `${run.key}: ${run.value.slice(0, 200)} (${run.updatedAt.toISOString()})` : null,
    recent: recent.map((r) => ({ type: r.type, createdAt: r.createdAt })),
  };
}
