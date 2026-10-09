// src/lib/data/plane/neon-reader.ts (owner WP02). HOW THE SITE READS THE PLANE WHEN IT LIVES IN NEON (DECISIONS.md, 2026-10-09). Same PlaneSource interface as the HTTP chain and the directory, so no loader changes. No unstable_cache and no Data Cache anywhere on this path (CLAUDE.md):
// the egress and latency controls are the ones a database read needs, all in this instance's memory.
//   * the pointer row is re-read at most every PLANE_POINTER_TTL_S (60) seconds by the shared PointerReader, single-flight, and the last good pointer keeps serving when Neon errors (stale-while-error);
//   * v1/manifest.json (path -> sha prefix of every file) is read once per pointer; it tells a read which cached copy is current BEFORE any query, so a file that did not change in a publish is never fetched again, and a path the manifest does not list is
//     `missing` without a query (a card with no history, the optional files);
//   * a module-level LRU of raw + parsed files keyed by path@sha (cap PLANE_LRU_MB, 120 by default for Neon), concurrent reads of one path share one query, at most 8 queries in flight;
//   * the browse index and every other derived structure is built once per instance per pointer by memoByRef (runtime.ts), unchanged.
// A build reads nothing (PlaneError "build"); with Neon down a page renders only as far as the LRU holds it, then the loaders' existing 503/fallback behaviour.
import type { PointerFile } from "./formats";
import { PointerError, type PointerEnv } from "./pointer";
import { PlaneError, type PlaneSource } from "./source";
import { PLANE_TABLE, STATUS_ROW, TREE_PREFIX, POINTER_ROW, readerSql, sha256Hex, unpack, type PlaneSql } from "./neon-store";

export interface NeonReaderConfig { sql?: () => Promise<PlaneSql>; lruBytes?: number; timeoutMs?: number; maxInflight?: number; now?: () => number; buildPhase?: boolean }
export interface NeonStats { queries: number; lruHits: number; missesNoQuery: number; failures: number; lruBytes: number; manifestReads: number }
interface Entry { text: string; parsed: unknown; bytes: number }
interface ManifestView { map: Map<string, string>; authoritative: boolean }
const within = <T,>(p: Promise<T>, ms: number, what: string): Promise<T> => {
  let t: ReturnType<typeof setTimeout>;
  const clock = new Promise<never>((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error(`${what} timed out`), { name: "TimeoutError" })), ms); });
  return Promise.race([p, clock]).finally(() => clearTimeout(t));
};

export class NeonPlane {
  private lru = new Map<string, Entry>(); private lruBytes = 0;
  private inflight = new Map<string, Promise<Entry>>(); private active = 0; private waiters: (() => void)[] = [];
  private manifests = new Map<string, Promise<ManifestView | null>>();
  private sqlP: Promise<PlaneSql> | null = null;
  readonly stats: NeonStats = { queries: 0, lruHits: 0, missesNoQuery: 0, failures: 0, lruBytes: 0, manifestReads: 0 };
  constructor(private cfg: NeonReaderConfig = {}) {}
  private get building(): boolean { return this.cfg.buildPhase ?? process.env.NEXT_PHASE === "phase-production-build"; }
  private get maxLru(): number { return this.cfg.lruBytes ?? 120 * 1024 * 1024; }
  private db(): Promise<PlaneSql> { return (this.sqlP ??= (this.cfg.sql ?? readerSql)().catch((e) => { this.sqlP = null; throw e; })); }
  private async query<T>(sql: string, ...p: unknown[]): Promise<T[]> {
    const ms = this.cfg.timeoutMs ?? 8000; const q = await this.db(); this.stats.queries++;
    return within(q.all<T>(sql, ...p), ms, "plane query");
  }

  /** The origin look of the pointer reader. */
  pointerEnv(sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): PointerEnv {
    return {
      now: this.cfg.now ?? Date.now, sleep,
      fetchPointer: async () => {
        if (this.building) throw new PointerError("http", "the build reads no database");
        try {
          const rows = await this.query<{ body: Uint8Array }>(`SELECT body FROM "${PLANE_TABLE}" WHERE path = $1`, POINTER_ROW);
          if (!rows[0]) throw new PointerError("http", "no pointer row yet (nothing has been published into Neon)");
          return JSON.parse(unpack(rows[0].body)) as unknown;
        } catch (e) { this.stats.failures++; if (e instanceof PointerError) throw e; throw new PointerError((e as Error).name === "TimeoutError" ? "timeout" : "http", `Neon pointer read failed: ${String((e as Error).message).slice(0, 160)}`); }
      },
    };
  }
  /** status.json (the head status copy). null when absent or unreadable. */
  async statusText(timeoutMs = 3000): Promise<string | null> {
    if (this.building) return null;
    try { const q = await this.db(); const r = await within(q.all<{ body: Uint8Array }>(`SELECT body FROM "${PLANE_TABLE}" WHERE path = $1`, STATUS_ROW), timeoutMs, "status read"); return r[0] ? unpack(r[0].body) : null; } catch { return null; }
  }

  private manifestOf(ptr: Pick<PointerFile, "ref" | "manifestSha256">): Promise<ManifestView | null> {
    let p = this.manifests.get(ptr.ref);
    if (!p) {
      this.stats.manifestReads++;
      p = (async () => {
        try {
          const rows = await this.query<{ body: Uint8Array }>(`SELECT body FROM "${PLANE_TABLE}" WHERE path = $1`, `${TREE_PREFIX}manifest.json`);
          if (!rows[0]) return null; const text = unpack(rows[0].body);
          const m = JSON.parse(text) as { files: [string, number, string][] };
          return { map: new Map(m.files.map((f) => [f[0], f[2]] as const)), authoritative: !ptr.manifestSha256 || sha256Hex(text) === ptr.manifestSha256 };
        } catch { return null; }
      })();
      this.manifests.set(ptr.ref, p); while (this.manifests.size > 2) this.manifests.delete(this.manifests.keys().next().value as string);
      p.then((v) => { if (!v && this.manifests.get(ptr.ref) === p) this.manifests.delete(ptr.ref); });
    }
    return p;
  }
  private remember(key: string, e: Entry): void {
    if (this.lru.has(key)) this.lruBytes -= this.lru.get(key)!.bytes;
    this.lru.set(key, e); this.lruBytes += e.bytes;
    while (this.lruBytes > this.maxLru && this.lru.size > 1) { const k = this.lru.keys().next().value as string; this.lruBytes -= this.lru.get(k)!.bytes; this.lru.delete(k); }
    this.stats.lruBytes = this.lruBytes;
  }
  private async permit<T>(fn: () => Promise<T>): Promise<T> {
    const cap = this.cfg.maxInflight ?? 8; while (this.active >= cap) await new Promise<void>((r) => this.waiters.push(r));
    this.active++; try { return await fn(); } finally { this.active--; this.waiters.shift()?.(); }
  }
  private async read(ptr: Pick<PointerFile, "ref" | "manifestSha256">, rel: string): Promise<Entry> {
    if (this.building) throw new PlaneError(rel, "build", "the build reads no database (contract 12.7.6)");
    const man = rel === "manifest.json" || rel === "status.json" ? null : await this.manifestOf(ptr);
    if (man?.authoritative && !man.map.has(rel)) { this.stats.missesNoQuery++; throw new PlaneError(rel, "missing"); }
    const want = man?.map.get(rel); const ck = want ? `${rel}@${want}` : null;
    if (ck) { const hit = this.lru.get(ck); if (hit) { this.lru.delete(ck); this.lru.set(ck, hit); this.stats.lruHits++; return hit; } }
    const flight = ck ?? `?${rel}`; const running = this.inflight.get(flight); if (running) return running;
    const p = this.permit(async () => {
      let rows: { sha: string; body: Uint8Array }[];
      try { rows = await this.query<{ sha: string; body: Uint8Array }>(`SELECT sha, body FROM "${PLANE_TABLE}" WHERE path = $1`, `${TREE_PREFIX}${rel}`); }
      catch (e) { this.stats.failures++; throw new PlaneError(rel, (e as Error).name === "TimeoutError" ? "timeout" : "http", String((e as Error).message).slice(0, 120)); }
      if (!rows[0]) throw new PlaneError(rel, "missing");
      const text = unpack(rows[0].body); let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { throw new PlaneError(rel, "parse"); }
      const e: Entry = { text, parsed, bytes: text.length * 3 };
      this.remember(`${rel}@${rows[0].sha.slice(0, 16)}`, e); return e;
    }).finally(() => this.inflight.delete(flight));
    this.inflight.set(flight, p); return p;
  }
  /** The PlaneSource of one pointer (a render pins the pointer it started with); `ptr` may be a getter for callers that only know the pointer later. */
  source(ptr: Pick<PointerFile, "ref" | "manifestSha256"> | (() => Promise<Pick<PointerFile, "ref" | "manifestSha256"> | null>)): PlaneSource {
    const at = async (rel: string): Promise<Entry> => { const p = typeof ptr === "function" ? await ptr() : ptr; if (!p) throw new PlaneError(rel, "http", "no pointer"); return this.read(p, rel); };
    return { text: async (rel) => (await at(rel)).text, json: async <T,>(rel: string) => (await at(rel)).parsed as T };
  }
}
