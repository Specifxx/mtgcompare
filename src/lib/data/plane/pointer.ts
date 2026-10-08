// src/lib/data/plane/pointer.ts (owner WP02, FROZEN). THE ONE MUTABLE READ: latest.json. Everything else is read at the commit this file names, so a render can never mix two publishes.
//
// Rules (each pinned by tests/plane-pointer.test.ts; section 7.4; the experiments are in 12.6.3 and 12.7):
//   1. The fetch is `cache: "no-store"` with NO `next.revalidate` and NO tag. A tagged or time-revalidated pointer (a) lowers the `revalidate` of any page that renders it to 120 s non-deterministically (critique DP-05, reproduced:
//      s-maxage=120 vs 3600 depending on whether the memo absorbed the read), and (b) turns stale-while-error into a hard miss after a tag purge. Plane-backed routes are `force-dynamic`, so a no-store read costs them nothing.
//      A route that sets `export const revalidate` must not read the pointer: a no-store fetch in an ISR page silently turns it into `private, no-store` (reproduced) and the build test rejects the combination.
//   2. Stale-while-error lives HERE: a per-instance memo (20 s), single-flight, the last good pointer when the origin fails, and a pointer never moves an instance backwards (a lagging CDN copy has a smaller seq).
//   3. A 404 on the pointer while a token is configured is a TOKEN problem (raw answers 404 to a bad or expired token, even for public paths: measured), reported as `tokenRejected`, never as "no pointer".
import type { PointerFile } from "./formats";

export type PointerFailure = "format" | "shape" | "http" | "token" | "timeout";
export class PointerError extends Error { constructor(public reason: PointerFailure, message: string) { super(message); this.name = "PointerError"; } }
const HEX40 = /^[0-9a-f]{40}$/, REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Validates a parsed latest.json. Throws PointerError("format") for an unknown major version (readers treat the pointer as unusable and keep the last good one) and ("shape") for a malformed field. Unknown extra fields are ignored. */
export function parsePointer(raw: unknown): PointerFile {
  const p = raw as Partial<PointerFile> | null;
  if (!p || typeof p !== "object") throw new PointerError("shape", "pointer is not an object");
  if (p.format !== "v1" || p.v !== 1) throw new PointerError("format", `unknown pointer format ${String(p.format)}/${String(p.v)}`);
  if (typeof p.ref !== "string" || !HEX40.test(p.ref)) throw new PointerError("shape", "ref is not a 40-hex sha");
  if (typeof p.seq !== "number" || !Number.isInteger(p.seq) || p.seq < 0) throw new PointerError("shape", "seq");
  if (typeof p.repo !== "string" || !REPO.test(p.repo)) throw new PointerError("shape", "repo");
  if (typeof p.priceDay !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.priceDay)) throw new PointerError("shape", "priceDay");
  if (typeof p.publishedAt !== "string" || !Number.isFinite(Date.parse(p.publishedAt))) throw new PointerError("shape", "publishedAt");
  if (p.phase !== "catalog" && p.phase !== "full") throw new PointerError("shape", "phase");
  if (p.prev != null && (typeof p.prev !== "string" || !HEX40.test(p.prev))) throw new PointerError("shape", "prev");
  return { ...(p as PointerFile), pvAt: p.pvAt ?? null, prev: p.prev ?? null };
}

export interface PointerEnv {
  now(): number;
  /** One look at the origin. Resolves to the parsed JSON body; rejects with PointerError("http" | "timeout" | "token"). */
  fetchPointer(): Promise<unknown>;
  sleep(ms: number): Promise<void>;
}
export interface PointerState { ptr: PointerFile | null; source: "fresh" | "memo" | "stale" | "none"; tokenRejected: boolean; lastError: PointerFailure | null; at: number }
export interface PointerOpts { memoMs?: number; waitColdMs?: number; waitWarmMs?: number }

export class PointerReader {
  private memo: { ptr: PointerFile; at: number } | null = null;
  private inflight: Promise<PointerFile | null> | null = null;
  private tokenRejected = false; private lastError: PointerFailure | null = null;
  readonly memoMs: number; readonly waitColdMs: number; readonly waitWarmMs: number;
  constructor(private env: PointerEnv, o: PointerOpts = {}) { this.memoMs = o.memoMs ?? 20_000; this.waitColdMs = o.waitColdMs ?? 3500; this.waitWarmMs = o.waitWarmMs ?? 250; }

  /** The current pointer for this instance. Never throws. Within memoMs of the last good read it returns the memo without a request; otherwise ONE origin attempt is shared by every concurrent caller (single-flight). With a memo the caller waits at most
   *  waitWarmMs (250 ms) for the origin and falls back to the memo; with nothing it waits waitColdMs (3.5 s) and then returns ptr null (the loaders answer 503, static pages still render). */
  async get(): Promise<PointerState> {
    const now = this.env.now();
    if (this.memo && now - this.memo.at < this.memoMs) return this.state("memo");
    if (!this.inflight) this.inflight = this.read().finally(() => { this.inflight = null; });
    const wait = this.memo ? this.waitWarmMs : this.waitColdMs;
    const fresh = await Promise.race([this.inflight, this.env.sleep(wait).then(() => "timeout" as const)]);
    if (fresh && fresh !== "timeout") return this.state("fresh");
    return this.memo ? this.state("stale") : this.state("none");
  }
  private state(source: PointerState["source"]): PointerState { return { ptr: this.memo?.ptr ?? null, source, tokenRejected: this.tokenRejected, lastError: this.lastError, at: this.memo?.at ?? 0 }; }
  private async read(): Promise<PointerFile | null> {
    try {
      const p = parsePointer(await this.env.fetchPointer());
      this.tokenRejected = false; this.lastError = null;
      if (this.memo && p.seq < this.memo.ptr.seq && p.priceDay <= this.memo.ptr.priceDay) { this.memo = { ptr: this.memo.ptr, at: this.env.now() }; return this.memo.ptr; }   // a lagging CDN copy never moves an instance backwards
      this.memo = { ptr: p, at: this.env.now() }; return p;
    } catch (e) {
      const reason = e instanceof PointerError ? e.reason : "http";
      this.lastError = reason; if (reason === "token") this.tokenRejected = true;
      return null;
    }
  }
  /** For planeHealth(): the memo without any request. */
  peek(): PointerState { return this.state(this.memo ? "memo" : "none"); }
}
