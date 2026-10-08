// The eBay quota ledger: one small EbayLedger row per quota WINDOW (ebay-brief 7). It is the second line of the budget (the live quota read is the first): the cap is frozen when the window
// opens, calls are CLAIMED in chunks of 25 just before they are spent (an upper bound of real spend; a killed run leaves `claimed` high, which is the safe direction) and settled at the
// end, a 429 blocks the window, and every sample and run is recorded so /admin/ebay and the Rift-usage profile need nothing from the environment.
//
// The key is the quota window (the UTC date of reset - timeWindow), not the calendar day: two runs on either side of eBay's reset can never share a day's cap, and a drifting reset cannot
// double-spend. The claim is ONE conditional UPDATE (safe under Neon's pooled connections; no advisory locks); the workflow's concurrency group is the other serialiser.
// The store is an interface so the whole discipline is tested without a database (memoryLedger) and the SQL has exactly the same rule (claimAllowed).
import type { PrismaClient } from "@prisma/client";

export interface QuotaSample { t: string; remaining: number; limit?: number }
export interface RunRecord {
  at: string; mode: string; purpose: string; claimed: number; spent: number; remainingStart: number | null; remainingEnd: number | null; foreignDelta: number | null; stop: string | null;
  byClass?: Record<string, number>; byMarket?: Record<string, number>; matched?: number; panels?: number;
}
export interface LedgerRow {
  windowKey: string; cap: number; claimed: number; spent: number; limit: number | null; resetAt: Date | null; blockedUntil: Date | null;
  samples: QuotaSample[]; runs: RunRecord[]; breakdown: Record<string, number>; config: Record<string, unknown> | null;
}
export const SAMPLES_KEPT = 24;
export const RUNS_KEPT = 8;
export const LEDGER_KEEP_DAYS = 400;
export const CLAIM_CHUNK = 25;

/** 'YYYY-MM-DD' = the UTC date of the window START (= reset - timeWindow). A window length that is not a positive number is a whole day. */
export function windowKeyOf(resetAt: Date, timeWindowSec: number): string {
  const w = Number.isFinite(timeWindowSec) && timeWindowSec > 0 ? timeWindowSec : 86_400;
  return new Date(resetAt.getTime() - w * 1000).toISOString().slice(0, 10);
}
/** The one rule of a claim, written once for the SQL and for the in-memory store. */
export function claimAllowed(row: Pick<LedgerRow, "cap" | "claimed" | "blockedUntil">, n: number, now: Date): boolean {
  return n > 0 && row.claimed + n <= row.cap && (row.blockedUntil == null || row.blockedUntil <= now);
}
export const appendCapped = <T>(list: readonly T[] | null | undefined, item: T, keep: number): T[] => [...(list ?? []), item].slice(-keep);
export function addBreakdown(b: Record<string, number> | null | undefined, delta: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...(b ?? {}) };
  for (const [k, v] of Object.entries(delta)) out[k] = (out[k] ?? 0) + v;
  return out;
}

export interface LedgerStore {
  /** Open (create when missing, with the cap FROZEN at this first call) and return the row. */
  open(windowKey: string, cap: number, quota: { limit: number | null; resetAt: Date | null }): Promise<LedgerRow>;
  /** Atomically claim n calls; the number left after the claim, or null when refused (cap, or the window is blocked). */
  claim(windowKey: string, n: number, now: Date): Promise<number | null>;
  /** At the end of a run: spent += used, claimed -= unused, breakdown += byClass. */
  settle(windowKey: string, used: number, unused: number, byClass: Record<string, number>): Promise<void>;
  /** A 429 (or error 2001): no run may spend again in this window. */
  block(windowKey: string, until: Date): Promise<void>;
  sample(windowKey: string, s: QuotaSample): Promise<void>;
  record(windowKey: string, run: RunRecord, config: Record<string, unknown>): Promise<void>;
  read(windowKey: string): Promise<LedgerRow | null>;
  prune(now: Date): Promise<number>;
}

const toRow = (r: {
  windowKey: string; cap: number; claimed: number; spent: number; limit: number | null; resetAt: Date | null; blockedUntil: Date | null; samples: unknown; runs: unknown; breakdown: unknown; config: unknown;
}): LedgerRow => ({
  windowKey: r.windowKey, cap: r.cap, claimed: r.claimed, spent: r.spent, limit: r.limit, resetAt: r.resetAt, blockedUntil: r.blockedUntil,
  samples: Array.isArray(r.samples) ? (r.samples as QuotaSample[]) : [], runs: Array.isArray(r.runs) ? (r.runs as RunRecord[]) : [],
  breakdown: r.breakdown && typeof r.breakdown === "object" && !Array.isArray(r.breakdown) ? (r.breakdown as Record<string, number>) : {},
  config: r.config && typeof r.config === "object" && !Array.isArray(r.config) ? (r.config as Record<string, unknown>) : null,
});

/** The Prisma implementation. The claim is the single conditional UPDATE; the other writes are read-modify-write on rows only this job writes (one run at a time, by the concurrency group). */
export function prismaLedger(db: PrismaClient): LedgerStore {
  const read = async (windowKey: string): Promise<LedgerRow | null> => {
    const r = await db.ebayLedger.findUnique({ where: { windowKey } });
    return r ? toRow(r) : null;
  };
  return {
    read,
    async open(windowKey, cap, quota) {
      await db.ebayLedger.upsert({ where: { windowKey }, create: { windowKey, cap, limit: quota.limit, resetAt: quota.resetAt }, update: {} });
      const row = (await read(windowKey))!;
      if (quota.limit != null && (row.limit !== quota.limit || (quota.resetAt && row.resetAt?.getTime() !== quota.resetAt.getTime()))) {
        await db.ebayLedger.update({ where: { windowKey }, data: { limit: quota.limit, resetAt: quota.resetAt } });
        return { ...row, limit: quota.limit, resetAt: quota.resetAt };
      }
      return row;
    },
    async claim(windowKey, n, now) {
      const rows = await db.$queryRaw<{ left: number }[]>`
        UPDATE "EbayLedger" SET claimed = claimed + ${n}, "updatedAt" = now()
         WHERE "windowKey" = ${windowKey} AND claimed + ${n} <= cap AND ("blockedUntil" IS NULL OR "blockedUntil" <= ${now})
        RETURNING cap - claimed AS "left"`;
      return rows.length ? Number(rows[0]!.left) : null;
    },
    async settle(windowKey, used, unused, byClass) {
      const row = await read(windowKey);
      if (!row) return;
      await db.ebayLedger.update({ where: { windowKey }, data: { spent: row.spent + used, claimed: Math.max(0, row.claimed - unused), breakdown: addBreakdown(row.breakdown, byClass) } });
    },
    async block(windowKey, until) {
      await db.ebayLedger.update({ where: { windowKey }, data: { blockedUntil: until } });
    },
    async sample(windowKey, s) {
      const row = await read(windowKey);
      if (row) await db.ebayLedger.update({ where: { windowKey }, data: { samples: appendCapped(row.samples, s, SAMPLES_KEPT) as object[] } });
    },
    async record(windowKey, run, config) {
      const row = await read(windowKey);
      if (row) await db.ebayLedger.update({ where: { windowKey }, data: { runs: appendCapped(row.runs, run, RUNS_KEPT) as object[], config: config as object } });
    },
    async prune(now) {
      const cut = new Date(now.getTime() - LEDGER_KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
      return (await db.ebayLedger.deleteMany({ where: { windowKey: { lt: cut } } })).count;
    },
  };
}

/** An in-memory store with the same rules, for tests and for dry runs. */
export function memoryLedger(): LedgerStore & { rows: Map<string, LedgerRow> } {
  const rows = new Map<string, LedgerRow>();
  const get = (k: string): LedgerRow => { const r = rows.get(k); if (!r) throw new Error(`no ledger window ${k}`); return r; };
  return {
    rows,
    async read(k) { return rows.get(k) ?? null; },
    async open(k, cap, q) {
      let r = rows.get(k);
      if (!r) { r = { windowKey: k, cap, claimed: 0, spent: 0, limit: q.limit, resetAt: q.resetAt, blockedUntil: null, samples: [], runs: [], breakdown: {}, config: null }; rows.set(k, r); }
      else if (q.limit != null) { r.limit = q.limit; r.resetAt = q.resetAt; }
      return { ...r };
    },
    async claim(k, n, now) { const r = get(k); if (!claimAllowed(r, n, now)) return null; r.claimed += n; return r.cap - r.claimed; },
    async settle(k, used, unused, byClass) { const r = get(k); r.spent += used; r.claimed = Math.max(0, r.claimed - unused); r.breakdown = addBreakdown(r.breakdown, byClass); },
    async block(k, until) { get(k).blockedUntil = until; },
    async sample(k, s) { const r = get(k); r.samples = appendCapped(r.samples, s, SAMPLES_KEPT); },
    async record(k, run, config) { const r = get(k); r.runs = appendCapped(r.runs, run, RUNS_KEPT); r.config = config; },
    async prune(now) {
      const cut = new Date(now.getTime() - LEDGER_KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
      let n = 0; for (const k of [...rows.keys()]) if (k < cut) { rows.delete(k); n++; }
      return n;
    },
  };
}

/** The claimer the search loop uses: it takes chunks from the ledger as the run needs them, gives back what it did not use, and says why it stopped. */
export class Claimer {
  private have = 0;
  used = 0;
  stop: "cap" | null = null;
  constructor(private store: LedgerStore, private key: string, private now: () => Date = () => new Date(), private chunk = CLAIM_CHUNK) {}
  /** True when one more call may be spent. Claims a new chunk (never more than `ceiling` calls in all) when the previous one is used up. */
  async next(ceiling: number): Promise<boolean> {
    if (this.used >= ceiling) return false;
    if (this.have === 0) {
      const n = Math.min(this.chunk, ceiling - this.used);
      if (n <= 0) return false;
      const left = await this.store.claim(this.key, n, this.now());
      if (left == null) { this.stop = "cap"; return false; }
      this.have = n;
    }
    this.have--; this.used++;
    return true;
  }
  get unused(): number { return this.have; }
  async settle(byClass: Record<string, number>): Promise<void> { await this.store.settle(this.key, this.used, this.have, byClass); this.have = 0; }
}
