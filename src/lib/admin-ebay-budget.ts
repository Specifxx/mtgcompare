// What /admin/ebay shows: the eBay budget, read from the rows the eBay job wrote (EbayLedger, EbayTrack, EbayBanner, the last ImportRun of kind "ebay"). Uncached (owner-only traffic) and
// deliberately NOT named ebay*.ts: it imports NOTHING from src/lib/ebay*.ts (tests/no-ebay-api.test.ts), because the job records everything the panel needs, including the plan constants it
// ran with, so the page never reads the workflow variables (Vercel does not hold them) and never loads the eBay client. The client is a parameter (tests pass a stub); every caller wraps the
// call in try/catch: a Neon outage renders "unreachable", never a failed page.
import { prisma } from "./db";
import { spendLevel, type Level } from "./admin-alarms";

type Db = Pick<typeof prisma, "ebayLedger" | "ebayTrack" | "ebayBanner" | "importRun">;
const HOUR = 3_600_000;

export interface EbayDay { windowKey: string; spent: number; cap: number }
export interface EbayBudget {
  today: { windowKey: string; cap: number; claimed: number; spent: number; limit: number | null; resetAt: Date | null; blockedUntil: Date | null; remaining: number | null; mode: string | null; observeOnly: boolean | null; reserve: number | null } | null;
  days: EbayDay[];
  lastRun: { at: string; mode: string; spent: number; matched: number | null; panels: number | null; stop: string | null } | null;
  tiers: { tier: number; label: string; count: number }[];
  /** the OLDEST live tile of the chase strip, over every market (hours); the row's own age when it holds no tile; null when there is no row */
  bannerAgeHours: number | null;
  config: Record<string, unknown> | null;
  spend: { level: Level; pct: number | null };
  bannerLevel: Level;
  latched: boolean;
  // additive, for the richer panel
  banner: Record<string, { tiles: number; oldestHours: number | null }>;
  breakdown: Record<string, number>;
  samples: { t: string; remaining: number }[];
  lastImport: { at: string | null; ok: boolean; calls: Record<string, number>; matched: number | null; panels: number | null } | null;
  alarms: { level: Level; text: string }[];
}
export const TIER_LABEL: Record<number, string> = { 0: "C: no calls", 1: "A: daily chase", 2: "B: rotation", 3: "Sealed", 4: "Banner only" };
const MARKETS = ["US", "UK", "AU", "EU", "CA"];

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const numOr = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The strip is licence-limited to 72 h (contract 10.15): amber after 48 h, red after 72 h; no banner row is grey. */
export function bannerLevel(ageHours: number | null): Level {
  return ageHours == null ? "unknown" : ageHours >= 72 ? "bad" : ageHours >= 48 ? "warn" : "ok";
}

/** Per market: the count and the age (hours) of the oldest tile of a stored payload. Pure; a malformed payload is empty. */
export function bannerFreshness(payload: unknown, now: Date): Record<string, { tiles: number; oldestHours: number | null }> {
  const out: Record<string, { tiles: number; oldestHours: number | null }> = {};
  for (const m of MARKETS) out[m] = { tiles: 0, oldestHours: null };
  const tiles = obj(payload)?.tiles;
  if (!Array.isArray(tiles)) return out;
  for (const t of tiles as { market?: string; checkedAt?: string }[]) {
    const e = t?.market ? out[t.market] : undefined;
    const at = Date.parse(t?.checkedAt ?? "");
    if (!e || !Number.isFinite(at)) continue;
    e.tiles++;
    e.oldestHours = Math.max(e.oldestHours ?? 0, Math.round(((now.getTime() - at) / HOUR) * 10) / 10);
  }
  return out;
}

/** The panel's alarms (pure): spend, the 429 latch, a refused budget, an old strip, a run that failed. */
export function budgetAlarms(b: Pick<EbayBudget, "spend" | "latched" | "today" | "lastRun" | "bannerLevel" | "bannerAgeHours" | "lastImport">): { level: Level; text: string }[] {
  const out: { level: Level; text: string }[] = [];
  if (b.latched) out.push({ level: "bad", text: "A 429 blocked this quota window: no more eBay calls until it resets." });
  if (b.lastRun?.stop === "429") out.push({ level: "bad", text: "The last run stopped on a 429." });
  if (["ledger-cap", "ledger-blocked", "ledger-unreachable"].includes(b.lastRun?.stop ?? "")) out.push({ level: "bad", text: `The last run was refused by the ledger (${b.lastRun!.stop}).` });
  if (["quota-unreadable", "foreign-active", "reserve"].includes(b.lastRun?.stop ?? "")) out.push({ level: "warn", text: `The last run made no calls to protect RiftCompare's quota (${b.lastRun!.stop}).` });
  if (b.spend.level === "bad" || b.spend.level === "warn") out.push({ level: b.spend.level, text: `Today's spend is ${b.spend.pct}% of the day's cap.` });
  if (b.bannerLevel === "bad" || b.bannerLevel === "warn") out.push({ level: b.bannerLevel, text: `The chase strip's oldest listing is ${b.bannerAgeHours} h old (the licence limit is 72 h).` });
  if (b.lastImport && !b.lastImport.ok) out.push({ level: "bad", text: "The last eBay run ended red." });
  return out;
}

export async function loadEbayBudget(db: Db = prisma, now = new Date()): Promise<EbayBudget> {
  const [ledger, tiers, banner, run] = await Promise.all([
    db.ebayLedger.findMany({ orderBy: { windowKey: "desc" }, take: 31 }),
    db.ebayTrack.groupBy({ by: ["tier"], _count: { _all: true } }),
    db.ebayBanner.findFirst({ select: { payload: true, updatedAt: true }, orderBy: { updatedAt: "asc" } }),
    db.importRun.findFirst({ where: { kind: "ebay" }, orderBy: { startedAt: "desc" }, select: { startedAt: true, finishedAt: true, ok: true, summary: true } }),
  ]);
  const t = ledger[0] ?? null;
  const cfg = obj(t?.config);
  const samples = Array.isArray(t?.samples) ? (t!.samples as { t?: string; remaining?: number }[]) : [];
  const runs = Array.isArray(t?.runs) ? (t!.runs as Record<string, unknown>[]) : [];
  const last = runs[runs.length - 1];
  const fresh = banner ? bannerFreshness(banner.payload, now) : Object.fromEntries(MARKETS.map((m) => [m, { tiles: 0, oldestHours: null }]));
  const ages = Object.values(fresh).map((x) => x.oldestHours).filter((x): x is number => x != null);
  const rowAge = banner ? Math.round(((now.getTime() - banner.updatedAt.getTime()) / HOUR) * 10) / 10 : null;
  const bannerAge = ages.length ? Math.max(...ages) : rowAge;
  const sum = obj(run?.summary);
  const today = t
    ? {
        windowKey: t.windowKey, cap: t.cap, claimed: t.claimed, spent: t.spent, limit: t.limit, resetAt: t.resetAt, blockedUntil: t.blockedUntil,
        remaining: numOr(samples[samples.length - 1]?.remaining),
        mode: typeof cfg?.mode === "string" ? cfg.mode : null,
        observeOnly: typeof cfg?.observeOnly === "boolean" ? cfg.observeOnly : null,
        reserve: numOr(cfg?.reserve),
      }
    : null;
  const view: EbayBudget = {
    today,
    days: ledger.map((r) => ({ windowKey: r.windowKey, spent: r.spent, cap: r.cap })).reverse(),
    lastRun: last ? { at: String(last.at ?? ""), mode: String(last.mode ?? ""), spent: numOr(last.spent) ?? 0, matched: numOr(last.matched), panels: numOr(last.panels), stop: typeof last.stop === "string" ? last.stop : null } : null,
    tiers: tiers.map((x) => ({ tier: x.tier, label: TIER_LABEL[x.tier] ?? `tier ${x.tier}`, count: x._count._all })).sort((a, b) => a.tier - b.tier),
    bannerAgeHours: bannerAge,
    config: cfg,
    spend: spendLevel(t?.spent, t?.cap),
    bannerLevel: bannerLevel(bannerAge),
    latched: Boolean(t?.blockedUntil && t.blockedUntil > now),
    banner: fresh,
    breakdown: Object.fromEntries(Object.entries(obj(t?.breakdown) ?? {}).map(([k, v]) => [k, numOr(v) ?? 0])),
    samples: samples.filter((s) => typeof s.t === "string" && typeof s.remaining === "number").map((s) => ({ t: s.t!, remaining: s.remaining! })),
    lastImport: run ? { at: run.startedAt.toISOString(), ok: run.ok, calls: Object.fromEntries(Object.entries(obj(sum?.byClass) ?? {}).map(([k, v]) => [k, numOr(v) ?? 0])), matched: numOr(sum?.matched), panels: numOr(sum?.panels) } : null,
    alarms: [],
  };
  view.alarms = budgetAlarms(view);
  return view;
}
