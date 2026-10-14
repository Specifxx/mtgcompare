// The ops watch, pure half (owner request 2026-10-14: "I'm not going to keep checking Neon, the limits, the inbox: tell me"). One hourly job (scripts/ops-watch.ts) turns every area of the
// site into HealthChecks, keeps the last snapshot in Neon (Meta `ops.health`), and emails the owner when something is NEW or gets WORSE, with a reminder while it stays red, never on every
// run. This file holds only the rules, so they are tested by running them; no database, no network, no mail. The mail itself is src/lib/ops-mail.ts, the collection src/lib/ops-collect.ts,
// both script-side. The admin pages read the snapshot through src/lib/admin-ops.ts.
import { worst, type Level } from "./admin-alarms";

export interface HealthCheck {
  key: string;
  group: string;
  label: string;
  level: Level;
  /** One plain sentence: what is wrong, or what "fine" means here. */
  detail: string;
  /** Present for a limit: how much is used of how much. */
  used?: number | null;
  limit?: number | null;
  unit?: string;
  href?: string;
}
export interface InboxCounts { reports: number; suggestions: number; feedback: number; contact: number; support: number }
export const inboxTotal = (c: InboxCounts | null | undefined): number | null => (c ? c.reports + c.suggestions + c.feedback + c.contact + c.support : null);

export interface Snapshot { v: 1; at: string; checks: HealthCheck[]; inbox: InboxCounts | null }
/** A snapshot older than this means the watch itself stopped (GitHub disabled the schedule, a secret expired): the admin says so in red. */
export const SNAPSHOT_STALE_HOURS = 3;
export const snapshotLevel = (s: Snapshot | null, now = new Date()): Level => {
  if (!s) return "unknown";
  const t = Date.parse(s.at);
  if (!Number.isFinite(t)) return "unknown";
  return (now.getTime() - t) / 3_600_000 >= SNAPSHOT_STALE_HOURS ? "bad" : "ok";
};
export const overall = (checks: readonly HealthCheck[]): Level => worst(checks.map((c) => c.level));
export function parseSnapshot(raw: string | null | undefined): Snapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Snapshot>;
    return s && s.v === 1 && typeof s.at === "string" && Array.isArray(s.checks) ? (s as Snapshot) : null;
  } catch {
    return null;
  }
}

/** A limit as a check: amber from warnPct of the limit, red from badPct. An unreadable `used` is grey, never green. */
export function limitCheck(o: { key: string; group: string; label: string; used: number | null | undefined; limit: number; unit: string; href?: string; warnPct?: number; badPct?: number; fixHint?: string }): HealthCheck {
  const { used, limit, unit } = o;
  if (used == null || !Number.isFinite(used)) return { key: o.key, group: o.group, label: o.label, level: "unknown", detail: `Could not be read${o.fixHint ? `: ${o.fixHint}` : "."}`, used: null, limit, unit, href: o.href };
  const pct = Math.round((used / limit) * 1000) / 10;
  const level: Level = pct >= (o.badPct ?? 90) ? "bad" : pct >= (o.warnPct ?? 70) ? "warn" : "ok";
  const f = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString("en-US") : String(Math.round(n * 10) / 10));
  return { key: o.key, group: o.group, label: o.label, level, detail: `${f(used)} of ${f(limit)} ${unit} used (${pct}%).`, used, limit, unit, href: o.href };
}

// ── what to email ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Only amber and red can alert; grey ("could not be read") never emails by itself, or a missing optional key would mail every hour. */
const rank = (l: Level): 0 | 1 | 2 => (l === "bad" ? 2 : l === "warn" ? 1 : 0);
export type NotifyState = Record<string, { level: "warn" | "bad"; at: string }>;
export interface AlertItem { check: HealthCheck; reason: "new" | "worse" | "reminder" }
export interface NotifyPlan { send: AlertItem[]; recovered: HealthCheck[]; next: NotifyState }
/** A red problem is repeated every 24 h while it lasts, an amber one every 72 h. */
export const REMIND_HOURS = { bad: 24, warn: 72 } as const;

export function planNotifications(checks: readonly HealthCheck[], state: NotifyState, now: Date): NotifyPlan {
  const next: NotifyState = { ...state };
  const send: AlertItem[] = [], recovered: HealthCheck[] = [];
  for (const c of checks) {
    const r = rank(c.level), prev = state[c.key];
    if (r === 0) {
      if (c.level === "ok" && prev) { recovered.push(c); delete next[c.key]; }   // "unknown" keeps the old state: a failed read is not a recovery
      continue;
    }
    const level = r === 2 ? "bad" : "warn";
    if (!prev) { send.push({ check: c, reason: "new" }); next[c.key] = { level, at: now.toISOString() }; continue; }
    if (rank(level) > rank(prev.level)) { send.push({ check: c, reason: "worse" }); next[c.key] = { level, at: now.toISOString() }; continue; }
    const age = (now.getTime() - Date.parse(prev.at)) / 3_600_000;
    if (!(age < REMIND_HOURS[level])) { send.push({ check: c, reason: "reminder" }); next[c.key] = { level, at: now.toISOString() }; }
    else if (prev.level !== level) next[c.key] = { level, at: prev.at };   // eased from red to amber: quiet, the clock keeps running
  }
  return { send, recovered, next };
}
export const parseNotifyState = (raw: string | null | undefined): NotifyState => {
  try {
    const o = JSON.parse(raw ?? "{}") as unknown;
    if (!o || typeof o !== "object") return {};
    return Object.fromEntries(Object.entries(o as Record<string, { level?: unknown; at?: unknown }>).filter(([, v]) => (v?.level === "warn" || v?.level === "bad") && typeof v.at === "string")) as NotifyState;
  } catch {
    return {};
  }
};

// ── the inbox ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type InboxKind = "report" | "suggestion" | "feedback" | "message" | "support";
export interface InboxItem { kind: InboxKind; at: Date; title: string; snippet: string }
export const INBOX_LABEL: Record<InboxKind, string> = { report: "Wrong-price report", suggestion: "Store suggestion", feedback: "Feedback", message: "Contact message", support: "Support ticket" };
/** At most this many items are quoted in one e-mail; the count is always the full one. */
export const DIGEST_MAX_ITEMS = 15;
export const clip = (s: string | null | undefined, n = 280): string => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
/** Newest first, capped; the total is the number BEFORE the cap. */
export function digestOf(items: readonly InboxItem[]): { total: number; shown: InboxItem[]; byKind: Partial<Record<InboxKind, number>> } {
  const byKind: Partial<Record<InboxKind, number>> = {};
  for (const i of items) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
  return { total: items.length, shown: [...items].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, DIGEST_MAX_ITEMS), byKind };
}
