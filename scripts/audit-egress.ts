// scripts/audit-egress.ts (owner WP19, parity P02; adapted from RiftCompare's audit of two Neon projects to ONE operational database whose public data is files).
//
// WHAT IT ANSWERS. Neon Free gives 5 GB a month of transfer and 100 CU-hours of compute. After the data-plane decision (contract 12) public pages read ZERO bytes from Neon and the database holds
// private state only (accounts, billing, watches, alerts, collection, notifications, inbox, counters, the eBay tables, click events), so the expected transfer is members (about 51 MB a day at
// 1,000 members, 12.12) and a handful of wake-ups. This script measures the QUERY VOLUME that actually reaches the database and compares every statement shape with a BUDGET (QUERY_BUDGETS
// below): a shape above its budget, a table that has no business existing (public data back in Postgres), a full-table scan of a big table or an estimated day above the global allowance is a
// finding, and an `error` finding fails the run (Annex C check 16: "egress-audit.yml reports no query above its budget").
//
// It writes nothing: it reads pg_stat_user_tables and pg_stat_statements (the one write is the idempotent CREATE EXTENSION IF NOT EXISTS). Counters are read for every shape and TEXT only for the
// top slice that is reported, so the audit's own reads stay well under a megabyte.
//
// MODES.   (default)         CUMULATIVE counters since the endpoint started: finds pathological SHAPES (rows per call), useless as a rate.
//          --sample=N        DELTA: snapshot, wait N minutes, snapshot, report only what moved. A rate, but only for a window that is representative of a day.
//          --cadence         NO DATABASE: count the `[deploy]` commit subjects of the last seven days (git log) and fail above CADENCE_LIMIT. A body that mentions the marker does not count (the gate looks at the
//                            subject only, scripts/vercel-ignore-build.sh). RiftCompare counted 16 deploying commits in four days when the gate assumed one a day; nothing counted them until someone ran git log by hand.
//          --json            machine-readable findings after the human report.
//
// DO NOT READ A DELTA THAT SPANS A DEPLOY OR A CRON: a weekly release (Tuesday 08:00 UTC) refills caches from files on GitHub, not from Neon, so it no longer inflates a sample, but a publish, the eBay passes
// and the alert jobs are batch work; their share of a short window is not a day's rate. The rows-per-call budgets do not depend on the window; the calls-per-day budgets are only enforced on a window of a day or more.
//
// Run by .github/workflows/egress-audit.yml (Sunday 03:00 UTC, no job runs then; "Run workflow" for an ad-hoc reading). Without DATABASE_URL the database part is a green no-op.
import { execFileSync } from "node:child_process";
import { DEPLOY_MARKER, isReleaseSubject } from "../src/lib/release-schedule";

export const MONTHLY_ALLOWANCE_GB = 5;
/** The daily transfer the budgets are written against: 60% of an even share of the allowance (the rest is headroom for a publish day, a bad crawl and the audit itself). */
export const DAILY_EGRESS_BUDGET_BYTES = Math.round((MONTHLY_ALLOWANCE_GB * 1024 ** 3 / 30) * 0.6);
/** Deploying commits tolerated in seven days: the scheduled weekly release plus ONE urgent one (contract 13.1). */
export const CADENCE_LIMIT = 2;
export const CADENCE_DAYS = 7;

/** The tables of the private schema (prisma/schema.prisma, 28 models). A statement on any other table means public data or a history table crept back into Postgres (C24, the history rule of CLAUDE.md). */
export const PRIVATE_TABLES: readonly string[] = [
  "User", "Meta", "PriceReport", "StoreSuggestion", "Feedback", "ContactMessage", "ClickEvent", "PremiumClick", "PriceAlert", "AlertMute", "SealedWatch", "DeckWatch", "Notification", "CollectionCard", "Counter",
  "NewsletterSubscriber", "SetReleaseAlert", "PublishedDeck", "RisingSnapshot", "SupportTicket", "ImportRun", "EbayTrack", "EbayBest", "EbayPanel", "EbayBanner", "EbayLedger", "CardStat", "DemandDay",
];
/** Tables that held public data in the baseline and must never be queried again; named so the message can say what replaced them. */
export const RETIRED_TABLES: Record<string, string> = {
  Card: "the catalogue is published files (cat/ px/ un/ of/)", Set: "meta/sets.json", Sealed: "sl/ files", Offer: "of/ and ix/f files", RetailerPrice: "of/ files", PriceHistory: "hist/ files (price history lives in GitHub)",
  PriceSnapshot: "hist/ files", Oracle: "or/ files", Retailer: "the store registry in stores.ts",
};
const KNOWN_ELSEWHERE = /^(_prisma_migrations|pg_\w+|information_schema|neon\w*)$/i;

export interface QueryBudget {
  id: string;
  /** Tables the budget covers; "*" is the default for every other private table. */
  tables: readonly string[];
  /** Statement kinds the budget covers. */
  ops?: readonly ("select" | "insert" | "update" | "delete")[];
  maxRowsPerCall: number;
  maxCallsPerDay: number;
  why: string;
}
/** The budgets. Initial values derived from the arithmetic of contract 12.12 (members only; the beacon and the click log flush inside one aligned minute of each half hour, at most 48 wake-ups a day however many instances run) and re-baselined
 *  from the first month of pg_stat_statements (12.14.1 check 7): change a number here WITH the measurement that justifies it, in the same commit. */
export const QUERY_BUDGETS: readonly QueryBudget[] = [
  { id: "view-beacon", tables: ["CardStat", "DemandDay"], ops: ["insert", "update"], maxRowsPerCall: 3_000, maxCallsPerDay: 48 * 8, why: "one batched upsert per instance in the first minute of each half hour (plane/view-beacon.ts): 48 windows x up to 8 warm instances" },
  { id: "click-log", tables: ["ClickEvent"], ops: ["insert"], maxRowsPerCall: 3_000, maxCallsPerDay: 48 * 8, why: "ClickBatcher writes ONE insert per instance per window; CLICK_SAMPLE_RATE thins it" },
  { id: "click-sweep", tables: ["ClickEvent"], ops: ["delete"], maxRowsPerCall: 200_000, maxCallsPerDay: 24, why: "the daily 90-day sweep (Annex C check 28)" },
  { id: "session", tables: ["User"], ops: ["select"], maxRowsPerCall: 2, maxCallsPerDay: 60_000, why: "getCurrentUser: one select-limited row per signed-in request; the header asks /api/me only when the oc_auth hint cookie exists" },
  { id: "ebay-panels", tables: ["EbayPanel", "EbayBest", "EbayBanner"], ops: ["select"], maxRowsPerCall: 250, maxCallsPerDay: 12_000, why: "browser-side panels from /api routes with s-maxage=21600; the banner is ONE row of at most 100 KB; never read by a crawler (plane/crawler.ts)" },
  { id: "ebay-job", tables: ["EbayTrack", "EbayBest", "EbayPanel", "EbayBanner", "EbayLedger"], ops: ["insert", "update", "delete"], maxRowsPerCall: 5_000, maxCallsPerDay: 6_000, why: "four scripted passes a day write per (product, market) pair after a COMPLETED search; the 72-hour sweep deletes" },
  { id: "member-lists", tables: ["Notification", "PriceAlert", "SealedWatch", "DeckWatch", "AlertMute", "CollectionCard", "PublishedDeck", "SetReleaseAlert"], ops: ["select"], maxRowsPerCall: 6_000, maxCallsPerDay: 40_000, why: "a member's own rows: a binder export may be thousands of lines, a list page tens; never an all-members scan except the alert jobs" },
  { id: "alert-jobs", tables: ["PriceAlert", "SealedWatch", "DeckWatch", "SetReleaseAlert", "NewsletterSubscriber", "User", "Notification", "AlertMute"], ops: ["select", "insert", "update"], maxRowsPerCall: 60_000, maxCallsPerDay: 4_000, why: "the Actions jobs read every active watch once per run (the 9 MB alert run of 12.12) and write notifications" },
  { id: "ops-rows", tables: ["ImportRun", "Meta", "Counter", "RisingSnapshot"], maxRowsPerCall: 100, maxCallsPerDay: 20_000, why: "a courtesy row per publish, a few counters, one snapshot a day" },
  { id: "inbox", tables: ["PriceReport", "StoreSuggestion", "Feedback", "ContactMessage", "SupportTicket", "PremiumClick"], maxRowsPerCall: 600, maxCallsPerDay: 8_000, why: "public forms write one row; the admin lists page through 50" },
  { id: "default", tables: ["*"], maxRowsPerCall: 1_000, maxCallsPerDay: 50_000, why: "any other private table: a statement returning more than 1,000 rows or running more than 50,000 times a day is a shape to look at" },
];

export type Op = "select" | "insert" | "update" | "delete" | "other";
export function opOf(query: string): Op {
  const q = query.trimStart().toLowerCase();
  if (q.startsWith("with")) return /\binsert\s+into\b/.test(q) ? "insert" : /\bupdate\b/.test(q.slice(0, 200)) ? "update" : "select";
  for (const o of ["select", "insert", "update", "delete"] as const) if (q.startsWith(o)) return o;
  return "other";
}
/** The tables a statement touches, from Prisma's quoting ("public"."User") and from hand-written SQL. Deduplicated, in order of appearance. */
export function tablesOf(query: string): string[] {
  const out: string[] = [];
  for (const m of query.matchAll(/\b(?:from|join|into|update)\s+(?:only\s+)?(?:"?public"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)) {
    const t = m[1]!; if (!out.includes(t) && !/^(select|set|lateral|unnest|generate_series|values)$/i.test(t)) out.push(t);
  }
  return out;
}
/** Neon's own monitoring and the Postgres catalogs are not the application's traffic: counted and reported, never budgeted. */
export function isPlatformNoise(q: string): boolean {
  return /pg_stat_activity|neon_perf_counters|pg_settings|pg_database|pg_stat_database|pg_stat_user_tables|pg_stat_replication|pg_stat_statements|pg_relation_size|pg_total_relation_size|pg_catalog\.|information_schema|pg_class|pg_namespace|pg_index/i.test(q);   // (the audit's own reads included: pg_stat_database, pg_stat_user_tables, pg_*_size)
}
export function budgetFor(tables: readonly string[], op: Op, budgets: readonly QueryBudget[] = QUERY_BUDGETS): QueryBudget {
  const typed = (b: QueryBudget): boolean => !b.ops || (op !== "other" && b.ops.includes(op));
  // the tightest budget wins when a statement touches several budgeted tables
  const hits = budgets.filter((b) => !b.tables.includes("*") && typed(b) && tables.some((t) => b.tables.includes(t)));
  if (hits.length) return hits.reduce((a, b) => (b.maxRowsPerCall < a.maxRowsPerCall ? b : a));
  return budgets.find((b) => b.tables.includes("*")) ?? budgets[budgets.length - 1]!;
}

export interface Shape { queryid: string; calls: number; rows: number; query: string }
export interface Finding { level: "error" | "warn"; code: "ROWS_PER_CALL" | "CALLS_PER_DAY" | "RETIRED_TABLE" | "UNKNOWN_TABLE" | "FULL_SCAN" | "DAILY_EGRESS" | "NO_STATEMENTS"; budget: string; message: string; query?: string }
export interface EvalOpts { windowDays: number; /** the window is a day or more, so a per-day extrapolation is a measurement and not a guess */ perDayIsReal?: boolean; budgets?: readonly QueryBudget[] }

/** Compares every application statement shape with its budget. Pure: the caller supplies the shapes. */
export function evaluate(shapes: readonly Shape[], o: EvalOpts): { findings: Finding[]; app: number; noise: number } {
  const findings: Finding[] = []; let app = 0, noise = 0;
  const real = o.perDayIsReal ?? o.windowDays >= 1;
  for (const s of shapes) {
    if (s.calls <= 0) continue;
    const q = s.query.replace(/\s+/g, " ").trim();
    if (isPlatformNoise(q)) { noise++; continue; }
    app++;
    const tables = tablesOf(q), op = opOf(q), perCall = s.rows / s.calls, perDay = o.windowDays > 0 ? s.calls / o.windowDays : NaN;
    const retired = tables.find((t) => t in RETIRED_TABLES);
    if (retired) { findings.push({ level: "error", code: "RETIRED_TABLE", budget: "private-only", message: `queries "${retired}", which left Postgres: ${RETIRED_TABLES[retired]} (C24: public data is files)`, query: q.slice(0, 240) }); continue; }
    const unknown = tables.find((t) => !PRIVATE_TABLES.includes(t) && !KNOWN_ELSEWHERE.test(t));
    if (unknown) { findings.push({ level: "error", code: "UNKNOWN_TABLE", budget: "private-only", message: `queries "${unknown}", which is not one of the 28 private tables`, query: q.slice(0, 240) }); continue; }
    const b = budgetFor(tables, op, o.budgets);
    if (op !== "insert" && perCall > b.maxRowsPerCall) findings.push({ level: "error", code: "ROWS_PER_CALL", budget: b.id, message: `${perCall.toFixed(1)} rows per call (budget ${b.maxRowsPerCall}, ${b.id}: ${b.why})`, query: q.slice(0, 240) });
    if (Number.isFinite(perDay) && perDay > b.maxCallsPerDay) findings.push({ level: real ? "error" : "warn", code: "CALLS_PER_DAY", budget: b.id, message: `${Math.round(perDay).toLocaleString("en-US")} calls a day${real ? "" : " projected from a short window"} (budget ${b.maxCallsPerDay.toLocaleString("en-US")}, ${b.id}: ${b.why})`, query: q.slice(0, 240) });
  }
  return { findings, app, noise };
}
export interface TableUse { table: string; rows: number; heapBytes: number; seqScans: number; seqRows: number }
/** A table scanned in full, repeatedly: seq_tup_read close to seq_scan x live rows on a table with real size. */
export function fullScans(tables: readonly TableUse[]): Finding[] {
  return tables.filter((t) => t.seqScans > 50 && t.rows > 1000 && t.seqRows > t.seqScans * t.rows * 0.8).map((t) => ({ level: "warn" as const, code: "FULL_SCAN" as const, budget: "index-use", message: `${t.table}: ${t.seqScans.toLocaleString("en-US")} sequential scans of ~${t.rows.toLocaleString("en-US")} rows (no index in play)` }));
}
/** The global rule: the estimated bytes the application statements returned, per day, against DAILY_EGRESS_BUDGET_BYTES. A floor (joins are charged to one table), and only an error on a window of a day. */
export function dailyEgress(bytesInWindow: number, windowDays: number, real: boolean): Finding[] {
  if (!(windowDays > 0)) return [];
  const perDay = bytesInWindow / windowDays;
  if (perDay <= DAILY_EGRESS_BUDGET_BYTES) return [];
  return [{ level: real ? "error" : "warn", code: "DAILY_EGRESS", budget: "global", message: `about ${(perDay / 1024 ** 2).toFixed(0)} MB a day${real ? "" : " projected from a short window"} against a budget of ${(DAILY_EGRESS_BUDGET_BYTES / 1024 ** 2).toFixed(0)} MB (${MONTHLY_ALLOWANCE_GB} GB a month: a fresh project would last ${(MONTHLY_ALLOWANCE_GB * 1024 ** 3 / perDay).toFixed(1)} days)` }];
}

// ── the deploy cadence (no database) ─────────────────────────────────────────────────────────────────────────────────────────
/** Subjects that deploy: the SAME rule as scripts/vercel-ignore-build.sh and isReleaseSubject (the marker in the SUBJECT, any casing). */
export const deploySubjects = (subjects: readonly string[]): string[] => subjects.filter((s) => isReleaseSubject(s));
export interface Cadence { total: number; limit: number; ok: boolean; byDay: [string, number][]; subjects: string[] }
/** `lines` are `YYYY-MM-DD|subject` as printed by `git log --pretty='%ad|%s' --date=short`. */
export function cadenceOf(lines: readonly string[], limit = CADENCE_LIMIT): Cadence {
  const hits = lines.map((l) => { const i = l.indexOf("|"); return i < 0 ? null : { day: l.slice(0, i), subject: l.slice(i + 1) }; }).filter((x): x is { day: string; subject: string } => !!x && isReleaseSubject(x.subject));
  const byDay = new Map<string, number>(); for (const h of hits) byDay.set(h.day, (byDay.get(h.day) ?? 0) + 1);
  return { total: hits.length, limit, ok: hits.length <= limit, byDay: [...byDay].sort(), subjects: hits.map((h) => h.subject) };
}
function runCadence(): number {
  let lines: string[] = [];
  try { lines = execFileSync("git", ["log", `--since=${CADENCE_DAYS} days ago`, "--pretty=%ad|%s", "--date=short"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).split("\n").filter(Boolean); }
  catch (e) { console.log(`cadence: git log failed (${e instanceof Error ? e.message.split("\n")[0] : String(e)}); a shallow checkout cannot be counted - use fetch-depth: 0`); return 0; }
  const c = cadenceOf(lines);
  console.log(`== ${DEPLOY_MARKER} subjects, last ${CADENCE_DAYS} days ==`);
  for (const [day, n] of c.byDay) console.log(`  ${day}  ${n}`);
  console.log(`${c.total} deploying commit(s) in ${CADENCE_DAYS} days (limit ${c.limit}: the weekly release plus one urgent one). The gate assumes one a week; RiftCompare's RM9 died at four a day.`);
  if (!c.ok) { console.log(`::error title=Deploy cadence::${c.total} commits with ${DEPLOY_MARKER} in their subject in ${CADENCE_DAYS} days (limit ${c.limit}). Ordinary work waits for the weekly release (CLAUDE.md).`); for (const s of c.subjects.slice(0, 10)) console.log(`  ${s}`); }
  return c.ok ? 0 : 1;
}

// ── the database part ────────────────────────────────────────────────────────────────────────────────────────────────────────
const gb = (b: number): string => `${(b / 1024 ** 3).toFixed(2)} GB`;
const mb = (b: number): string => `${(b / 1024 ** 2).toFixed(1)} MB`;
const num = (n: number | bigint): string => Number(n).toLocaleString("en-US");
const section = (t: string): void => console.log(`\n--- ${t} ---`);

async function runDatabase(sampleMinutes: number, json: boolean): Promise<number> {
  if (!process.env.DATABASE_URL) { console.log("DATABASE_URL is not set: no database to audit (a green no-op)."); return 0; }
  const { prisma: db } = await import("../src/lib/db");
  const { Prisma } = await import("@prisma/client");
  type StmtRow = { queryid: bigint; calls: bigint; rows: bigint };
  type TableRow = { relname: string; n_live_tup: bigint; seq_scan: bigint; seq_tup_read: bigint; idx_scan: bigint | null; idx_tup_fetch: bigint | null; heap_bytes: bigint; total_bytes: bigint };
  type DbRow = { datname: string; xact_commit: bigint; tup_returned: bigint; tup_fetched: bigint; blks_read: bigint; blks_hit: bigint; stats_reset: Date | null };
  // Neon scales to zero: the first connection after a suspend can outlast Prisma's connect timeout.
  for (let i = 1; ; i++) { try { await db.$queryRaw`SELECT 1`; break; } catch (e) { if (i >= 6) throw e; console.log(`  ...database cold (attempt ${i}/6), retrying in 10s`); await new Promise((r) => setTimeout(r, 10_000)); } }
  console.log(`Database under audit: operational (DATABASE_URL)\nWall clock: ${new Date().toISOString()}`);
  let pgssError = "";
  try { await db.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_stat_statements"); } catch (e) { pgssError = e instanceof Error ? (e.message.split("\n")[0] ?? "") : String(e); }
  const snapshot = async () => {
    const [dbRows, tables, stmts] = await Promise.all([
      db.$queryRaw<DbRow[]>`SELECT datname, xact_commit, tup_returned, tup_fetched, blks_read, blks_hit, stats_reset FROM pg_stat_database WHERE datname = current_database()`,
      db.$queryRaw<TableRow[]>`SELECT relname, n_live_tup, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch, pg_relation_size(relid) AS heap_bytes, pg_total_relation_size(relid) AS total_bytes FROM pg_stat_user_tables`,
      // counters for EVERY shape (about 40 bytes each); text only for the shapes that are reported
      db.$queryRaw<StmtRow[]>`SELECT queryid, SUM(calls)::bigint AS calls, SUM(rows)::bigint AS rows FROM pg_stat_statements WHERE queryid IS NOT NULL GROUP BY queryid`.catch((e: unknown) => { pgssError ||= (e instanceof Error ? e.message : String(e)).split("\n").filter(Boolean).pop() ?? "unavailable"; return [] as StmtRow[]; }),
    ]);
    return { at: Date.now(), db: dbRows[0], tables: new Map(tables.map((t) => [t.relname, t])), stmts: new Map(stmts.map((s) => [String(s.queryid), s])) };
  };
  const first = await snapshot();
  let windowDays: number, windowLabel: string, tables: TableRow[], stmts: { queryid: bigint; calls: bigint; rows: bigint }[], real: boolean;
  if (sampleMinutes > 0) {
    section("Measurement window");
    console.log(`  DELTA mode: ${sampleMinutes} minute(s) of live traffic. Only counters that MOVE are reported. A publish, an eBay pass or an alert run inside the window is batch work, not a day's rate.`);
    await new Promise((r) => setTimeout(r, sampleMinutes * 60_000));
    const second = await snapshot();
    windowDays = (second.at - first.at) / 86_400_000; windowLabel = `${sampleMinutes} min of live traffic`; real = false;
    tables = [...second.tables.values()].map((t) => { const a = first.tables.get(t.relname); return { ...t, seq_scan: t.seq_scan - (a?.seq_scan ?? 0n), seq_tup_read: t.seq_tup_read - (a?.seq_tup_read ?? 0n), idx_scan: (t.idx_scan ?? 0n) - (a?.idx_scan ?? 0n), idx_tup_fetch: (t.idx_tup_fetch ?? 0n) - (a?.idx_tup_fetch ?? 0n) }; });
    stmts = [...second.stmts.values()].map((s) => { const a = first.stmts.get(String(s.queryid)); return { ...s, calls: s.calls - (a?.calls ?? 0n), rows: s.rows - (a?.rows ?? 0n) }; });
  } else {
    const resetAt = first.db?.stats_reset ?? null;
    windowDays = resetAt ? (Date.now() - resetAt.getTime()) / 86_400_000 : 0; windowLabel = resetAt ? `since ${resetAt.toISOString()}` : "since the endpoint started (unknown)"; real = windowDays >= 1;
    section("Measurement window");
    console.log(resetAt ? `  stats_reset ${resetAt.toISOString()} (${(windowDays * 24).toFixed(1)} h)${windowDays < 1 ? "; under a day, so calls-per-day findings are projections (warnings)" : ""}` : "  stats_reset is NULL: Neon leaves it unset until the endpoint restarts, so the per-day budgets cannot be applied (rows-per-call budgets still are). Re-run with --sample=20 for a rate.");
    tables = [...first.tables.values()]; stmts = [...first.stmts.values()];
  }
  const width = (t: TableRow): number => (Number(t.n_live_tup) > 0 ? Number(t.heap_bytes) / Number(t.n_live_tup) : 0);
  const active = stmts.filter((s) => Number(s.calls) > 0).sort((a, b) => Number(b.rows) - Number(a.rows));
  const top = active.slice(0, 60);
  const texts = new Map<string, string>();
  if (top.length) {
    const ids = top.map((s) => String(s.queryid));
    const rows = await db.$queryRaw<{ queryid: bigint; query: string }[]>`SELECT queryid, max(left(query, 1500)) AS query FROM pg_stat_statements WHERE queryid::text IN (${Prisma.join(ids)}) GROUP BY queryid`.catch(() => []);
    for (const r of rows) texts.set(String(r.queryid), r.query);
  }
  const shapes: Shape[] = top.map((s) => ({ queryid: String(s.queryid), calls: Number(s.calls), rows: Number(s.rows), query: texts.get(String(s.queryid)) ?? "(statement text evicted from pg_stat_statements)" }));

  section(`Database-wide (pg_stat_database, cumulative)`);
  const d = first.db; if (d) console.log(`  transactions ${num(d.xact_commit)} | tuples returned by scans ${num(d.tup_returned)} (scan WORK, not client egress) | buffer cache hit ${(Number(d.blks_hit) / Math.max(1, Number(d.blks_hit) + Number(d.blks_read)) * 100).toFixed(1)}%`);
  section(`Per-table scan attribution (${windowLabel})`);
  const used = tables.map((t): TableUse => ({ table: t.relname, rows: Number(t.n_live_tup), heapBytes: Number(t.heap_bytes), seqScans: Number(t.seq_scan), seqRows: Number(t.seq_tup_read) }));
  for (const t of [...tables].sort((a, b) => Number(b.seq_tup_read + (b.idx_tup_fetch ?? 0n)) - Number(a.seq_tup_read + (a.idx_tup_fetch ?? 0n))).slice(0, 12)) {
    const read = Number(t.seq_tup_read) + Number(t.idx_tup_fetch ?? 0); if (!read) continue;
    console.log(`  ${t.relname.padEnd(22)} ${num(t.n_live_tup).padStart(9)} rows ${width(t).toFixed(0).padStart(6)} B/row  seq ${num(t.seq_scan).padStart(8)} scans ${num(t.seq_tup_read).padStart(12)} rows  idx ${num(t.idx_tup_fetch ?? 0n).padStart(12)} rows`);
  }
  const res = evaluate(shapes, { windowDays, perDayIsReal: real });
  const findings = [...res.findings, ...fullScans(used)];
  // estimated bytes: rows x the average width of the first table named (a floor: joins are charged to one table)
  const widthByTable = new Map(tables.map((t) => [t.relname, width(t)]));
  let bytes = 0; for (const s of shapes) if (!isPlatformNoise(s.query)) { const t = tablesOf(s.query)[0]; if (t) bytes += s.rows * (widthByTable.get(t) ?? 0); }
  findings.push(...dailyEgress(bytes, windowDays, real));
  if (!shapes.length) findings.push({ level: "warn", code: "NO_STATEMENTS", budget: "pg_stat_statements", message: `no application statement moved in this window${pgssError ? ` (pg_stat_statements: ${pgssError})` : ""}: without it the audit can say WHICH TABLE churns but not WHICH QUERY` });
  section(`Statement shapes against their budgets (${res.app} application shapes, ${res.noise} platform shapes excluded; ${num(active.length)} moved)`);
  for (const s of shapes.filter((x) => !isPlatformNoise(x.query)).slice(0, 12)) {
    const q = s.query.replace(/\s+/g, " ").trim(), b = budgetFor(tablesOf(q), opOf(q));
    console.log(`  calls ${num(s.calls)} rows ${num(s.rows)} (${(s.rows / Math.max(1, s.calls)).toFixed(1)}/call) budget ${b.id}: ${q.slice(0, 150)}`);
  }
  console.log(`\n  Estimated application egress in this window: ${mb(bytes)} (a floor)${windowDays > 0 ? `; ${mb(bytes / windowDays)} a day against the budget of ${mb(DAILY_EGRESS_BUDGET_BYTES)} (${gb(DAILY_EGRESS_BUDGET_BYTES * 30)} a month of the ${MONTHLY_ALLOWANCE_GB} GB allowance)` : ""}`);
  section("Table sizes (what one full scan costs)");
  for (const t of [...tables].sort((a, b) => Number(b.total_bytes) - Number(a.total_bytes)).slice(0, 10)) console.log(`  ${t.relname.padEnd(24)} ${mb(Number(t.heap_bytes)).padStart(10)} heap ${mb(Number(t.total_bytes)).padStart(10)} with indexes`);
  section("Findings");
  if (!findings.length) console.log("  none: no statement above its budget.");
  for (const f of findings) { console.log(`  ${f.level === "error" ? "ERROR" : "warn "} [${f.code}] ${f.message}${f.query ? `\n         ${f.query}` : ""}`); if (f.level === "error") console.log(`::error title=Egress budget (${f.budget})::${f.message}`); }
  if (json) console.log(JSON.stringify({ windowLabel, findings }, null, 1));
  await db.$disconnect().catch(() => undefined);
  return findings.some((f) => f.level === "error") ? 1 : 0;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes("--cadence")) return runCadence();
  const sample = Number((args.find((a) => a.startsWith("--sample")) ?? "").split("=")[1] ?? "0");
  return runDatabase(Number.isFinite(sample) && sample > 0 ? sample : 0, args.includes("--json"));
}
if (process.argv[1] && /scripts[\\/]audit-egress\.ts$/.test(process.argv[1])) main().then((c) => { process.exitCode = c; }).catch((e) => { console.error(e); process.exitCode = 1; });
