// src/lib/data/plane/view-beacon.ts (owner WP02, FROZEN). The card view and search counters (CardStat) are the only per-request Neon WRITE of public traffic. On the Free plan compute is 100 CU-hours a month, i.e. 400 hours at 0.25 CU = 13.3 hours a day,
// and every isolated burst of queries keeps the database awake for its 5-minute idle timeout: about 160 isolated bursts a day exhaust it (12.12). So the counter is SAMPLED, BATCHED in the instance and flushed rarely, never awaited by a render,
// never raised by a crawler, and bounded in memory. Pure: the clock and the random source are injected.
export interface BeaconConfig { sampleOneIn: number; flushMinutes: number; maxEntries: number; maxFlushRows: number; windowSeconds?: number }
export const BEACON_DEFAULTS: BeaconConfig = { sampleOneIn: 10, flushMinutes: 30, maxEntries: 5000, maxFlushRows: 2000, windowSeconds: 60 };   // env: VIEW_BEACON_SAMPLE (1 = every view, 0 = off), VIEW_FLUSH_MINUTES
export type Counter = "view" | "search";
export class ViewBatcher {
  private pending = new Map<number, { view: number; search: number }>(); private lastWindow: number;
  constructor(private now: () => number, private random: () => number, readonly cfg: BeaconConfig = BEACON_DEFAULTS) { this.lastWindow = Math.floor(now() / (cfg.flushMinutes * 60_000)); }
  /** Record one event. Returns false when it was not counted (off, a bot, or not sampled). A sampled event counts for `sampleOneIn` when drained, so totals stay unbiased. */
  record(cardId: number, kind: Counter, isBot: boolean): boolean {
    if (isBot || this.cfg.sampleOneIn <= 0 || !Number.isInteger(cardId) || cardId <= 0) return false;
    if (this.cfg.sampleOneIn > 1 && this.random() * this.cfg.sampleOneIn >= 1) return false;
    let e = this.pending.get(cardId);
    if (!e) { if (this.pending.size >= this.cfg.maxEntries) return false; e = { view: 0, search: 0 }; this.pending.set(cardId, e); }
    e[kind]++; return true;
  }
  /** Is a flush due? ALIGNED: a flush may happen only in the first `windowSeconds` (60) of each wall-clock `flushMinutes` period (:00 and :30), at most once per period and only when something is pending. Every instance of the site therefore writes inside the same minute,
   *  so the database wakes at most 48 times a day however many instances run (the isolated-burst arithmetic of 12.12), instead of 48 per instance. */
  due(): boolean { const t = this.now(), period = this.cfg.flushMinutes * 60_000; return this.pending.size > 0 && t % period < (this.cfg.windowSeconds ?? 60) * 1000 && Math.floor(t / period) !== this.lastWindow; }
  /** Take at most maxFlushRows entries (scaled by the sampling rate) and mark the current period flushed. The caller writes them in ONE statement inside try/catch and never awaits it in a render. */
  drain(): { cardId: number; views: number; searches: number }[] {
    this.lastWindow = Math.floor(this.now() / (this.cfg.flushMinutes * 60_000)); const out: { cardId: number; views: number; searches: number }[] = []; const k = Math.max(1, this.cfg.sampleOneIn);
    for (const [cardId, e] of this.pending) { if (out.length >= this.cfg.maxFlushRows) break; out.push({ cardId, views: e.view * k, searches: e.search * k }); this.pending.delete(cardId); }
    return out;
  }
  get size(): number { return this.pending.size; }
}

// ── the outbound click log shares the same aligned window (contract 10.32, 12.12) ───────────────────────────────────────────────────────────────────────────
// A ClickEvent insert per click would wake a scale-to-zero database as often as people click. `/api/click` (WP15) therefore appends to this bounded in-instance buffer and the instance flushes it in ONE insert inside the same
// first minute of each wall-clock half hour as the view counter, so views and clicks together wake the database at most 48 times a day. Rows buffered in an instance that is frozen before the window are lost: accepted for a sampled analytics log.
export interface ClickRow { retailer: string; page: string; slug: string | null; country: string; userId: string | null; entry: string | null }
export interface ClickConfig { sampleRate: number; flushMinutes: number; maxEntries: number; maxFlushRows: number; windowSeconds?: number }
export const CLICK_DEFAULTS: ClickConfig = { sampleRate: 1, flushMinutes: 30, maxEntries: 2000, maxFlushRows: 2000, windowSeconds: 60 };   // env: CLICK_LOG (0 = off), CLICK_SAMPLE_RATE (0..1), VIEW_FLUSH_MINUTES
export class ClickBatcher {
  private rows: ClickRow[] = []; private lastWindow: number;
  constructor(private now: () => number, private random: () => number, readonly cfg: ClickConfig = CLICK_DEFAULTS) { this.lastWindow = Math.floor(now() / (cfg.flushMinutes * 60_000)); }
  /** Returns false when the click was not logged (off, a bot, not sampled, or the buffer is full). */
  record(row: ClickRow, isBot: boolean): boolean {
    if (isBot || !(this.cfg.sampleRate > 0)) return false;
    if (this.cfg.sampleRate < 1 && this.random() >= this.cfg.sampleRate) return false;
    if (this.rows.length >= this.cfg.maxEntries) return false;
    this.rows.push(row); return true;
  }
  /** ALIGNED exactly like ViewBatcher.due(): only inside the first `windowSeconds` of each wall-clock period, at most once per period, only when something is pending. */
  due(): boolean { const t = this.now(), period = this.cfg.flushMinutes * 60_000; return this.rows.length > 0 && t % period < (this.cfg.windowSeconds ?? 60) * 1000 && Math.floor(t / period) !== this.lastWindow; }
  drain(): ClickRow[] { this.lastWindow = Math.floor(this.now() / (this.cfg.flushMinutes * 60_000)); return this.rows.splice(0, this.cfg.maxFlushRows); }
  get size(): number { return this.rows.length; }
}
