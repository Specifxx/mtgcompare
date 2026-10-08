// src/lib/data/plane/source.ts (owner WP02, FROZEN). How a published file is READ: one interface, two implementations (the site reads over HTTP at a pinned ref, the Actions jobs and the tests read a directory), and the fetch chain with its
// failure semantics. Pure of Next: the fetch function is injected, so tests/plane-reader.test.ts drives every row of the failure table with a fake host.
//
// The chain for one file at ref R (section 7.4): instance memory (parsed, LRU) -> fetch(raw, token) -> fetch(GitHub contents API, token) -> the same file at the previous ref (same format only) -> PlaneError.
// The Vercel Data Cache sits INSIDE fetch: every pinned read is `fetch(url, { next: { revalidate: 2_592_000 } })` with NO tag (critique DP-04, reproduced: a tag purge also purges the pinned entries of the CURRENT ref, so a tagged pinned
// read loses its 30-day resilience and the warm set at every publish; the URL already names the ref, so nothing ever needs a purge to be correct).
// jsDelivr is NOT in the chain: it cannot serve a private repository, and it only ever protected the files the verification step pre-warmed (0.5% of the tree, critique DP-15).
import fs from "node:fs";
import path from "node:path";
import { PLANE_PREFIX } from "./formats";

export type PlaneFailure = "missing" | "http" | "timeout" | "parse" | "build" | "token" | "circuit";
export class PlaneError extends Error { constructor(public rel: string, public reason: PlaneFailure, detail = "") { super(`plane read failed: ${rel} (${reason}${detail ? `: ${detail}` : ""})`); this.name = "PlaneError"; } }
export interface PlaneSource { text(rel: string): Promise<string>; json<T>(rel: string): Promise<T> }

/** A directory that holds v1/ (a depth-1 checkout of the pointed commit, or a test fixture). `optional`-style misses throw PlaneError("missing"). */
export function fsSource(dir: string): PlaneSource {
  const root = path.join(dir, PLANE_PREFIX);
  const text = async (rel: string): Promise<string> => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { throw new PlaneError(rel, "missing"); } };
  return { text, json: async <T,>(rel: string) => { const t = await text(rel); try { return JSON.parse(t) as T; } catch { throw new PlaneError(rel, "parse"); } } };
}

export const REVALIDATE_PINNED = 2_592_000;                      // 30 days: the content at a sha never changes
export const PLANE_BUDGET_MS = 8_000;                            // one file, the whole chain
export interface Host { name: "raw" | "api"; timeoutMs: number; url(repo: string, ref: string, rel: string): string; headers(token: string | undefined): Record<string, string> }
export const RAW_HOST: Host = {
  name: "raw", timeoutMs: 3_000,
  url: (repo, ref, rel) => `https://raw.githubusercontent.com/${repo}/${ref}/${PLANE_PREFIX}/${rel}`,
  headers: (token) => { const h: Record<string, string> = {}; if (token) h.Authorization = `token ${token}`; return h; },
};
/** The GitHub contents API: the fallback for a private repository (5,000 requests/hour per token; raw media type returns the file bytes). UNVERIFIED from the build sandbox (its proxy blocks api.github.com): check 2 of 12.14. */
export const API_HOST: Host = {
  name: "api", timeoutMs: 5_000,
  url: (repo, ref, rel) => `https://api.github.com/repos/${repo}/contents/${PLANE_PREFIX}/${rel}?ref=${ref}`,
  headers: (token) => { const h: Record<string, string> = { Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28" }; if (token) h.Authorization = `Bearer ${token}`; return h; },
};
export interface FetchResult { ok: boolean; status: number; text(): Promise<string> }
export type FetchLike = (url: string, init: { headers: Record<string, string>; next?: { revalidate: number }; cache?: "no-store"; signal?: AbortSignal }) => Promise<FetchResult>;
/** The init of a pinned read: explicit revalidate (so Next caches it even with an Authorization header, measured), no tags, no cache mode. */
export const pinnedInit = (host: Host, token: string | undefined, timeoutMs = host.timeoutMs): Parameters<FetchLike>[1] => ({ headers: host.headers(token), next: { revalidate: REVALIDATE_PINNED }, signal: AbortSignal.timeout(timeoutMs) });
/** The init of a pointer read: no-store, no revalidate, no tag. */
export const pointerInit = (host: Host, token: string | undefined, timeoutMs = host.timeoutMs): Parameters<FetchLike>[1] => ({ headers: host.headers(token), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });

export interface ChainConfig {
  repo: string; token?: string; fetch: FetchLike; now?: () => number;
  hosts?: readonly Host[]; maxInflight?: number; lruBytes?: number; breakerMs?: number; buildPhase?: boolean;
  onHost?: (h: Host["name"], rel: string) => void;
}
export interface PlaneStats { rawOk: number; apiOk: number; fallbacks: number; prevRefReads: number; failures: number; lruHits: number; lruBytes: number; inflightPeak: number }

/** The site's reader. One instance per server process; `source(ref, prev)` returns the PlaneSource of a request's ref (taken from the request's first pointer read, kept for the whole render). */
export class HttpPlane {
  private lru = new Map<string, { v: unknown; bytes: number }>(); private lruBytes = 0;
  private inflight = new Map<string, Promise<unknown>>(); private active = 0; private waiters: (() => void)[] = [];
  private breaker = new Map<Host["name"], number>(); private misses = new Map<Host["name"], number>();
  readonly stats: PlaneStats = { rawOk: 0, apiOk: 0, fallbacks: 0, prevRefReads: 0, failures: 0, lruHits: 0, lruBytes: 0, inflightPeak: 0 };
  constructor(private cfg: ChainConfig) {}
  private get now(): number { return (this.cfg.now ?? Date.now)(); }
  private hosts(): readonly Host[] { return this.cfg.hosts ?? [RAW_HOST, API_HOST]; }
  private get maxLru(): number { return this.cfg.lruBytes ?? 64 * 1024 * 1024; }

  source(ref: string, prev: string | null = null): PlaneSource {
    const text = (rel: string) => this.read(ref, rel, prev).then((r) => r.text);
    return { text, json: async <T,>(rel: string) => (await this.read(ref, rel, prev)).parsed as T };
  }
  /** optional reads: a 404 at ref AND prev is `null`, not an error (history of an untracked card, un/of of an untracked card). */
  async optionalJson<T>(ref: string, rel: string, prev: string | null = null): Promise<T | null> { try { return (await this.read(ref, rel, prev)).parsed as T; } catch (e) { if (e instanceof PlaneError && e.reason === "missing") return null; throw e; } }

  private async withPermit<T>(fn: () => Promise<T>): Promise<T> {
    const cap = this.cfg.maxInflight ?? 8;
    while (this.active >= cap) await new Promise<void>((r) => this.waiters.push(r));
    this.active++; this.stats.inflightPeak = Math.max(this.stats.inflightPeak, this.active);
    try { return await fn(); } finally { this.active--; this.waiters.shift()?.(); }
  }
  private remember(key: string, v: unknown, bytes: number): void {
    this.lru.set(key, { v, bytes }); this.lruBytes += bytes;
    while (this.lruBytes > this.maxLru && this.lru.size > 1) { const k = this.lru.keys().next().value as string; this.lruBytes -= this.lru.get(k)!.bytes; this.lru.delete(k); }
    this.stats.lruBytes = this.lruBytes;
  }
  private async read(ref: string, rel: string, prev: string | null): Promise<{ text: string; parsed: unknown }> {
    if (this.cfg.buildPhase ?? process.env.NEXT_PHASE === "phase-production-build") throw new PlaneError(rel, "build", "the build fetches nothing (contract 12.7.6)");
    const key = `${this.cfg.repo}@${ref}/${rel}`;
    const hit = this.lru.get(key); if (hit) { this.lru.delete(key); this.lru.set(key, hit); this.stats.lruHits++; return hit.v as { text: string; parsed: unknown }; }
    const running = this.inflight.get(key); if (running) return running as Promise<{ text: string; parsed: unknown }>;
    const p = this.withPermit(() => this.chain(ref, rel, prev)).then((r) => { this.remember(key, r, r.text.length); return r; }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p); return p;
  }
  private async chain(ref: string, rel: string, prev: string | null): Promise<{ text: string; parsed: unknown }> {
    const started = this.now; let lastReason: PlaneFailure = "http"; const budget = PLANE_BUDGET_MS;
    for (const r of prev && prev !== ref ? [ref, prev] : [ref]) {
      const isPrev = r !== ref;
      for (const host of this.hosts()) {
        if (this.now - started > budget) { this.stats.failures++; throw new PlaneError(rel, "timeout", "budget"); }
        const until = this.breaker.get(host.name) ?? 0; if (this.now < until) { lastReason = "circuit"; continue; }
        try {
          const res = await this.cfg.fetch(host.url(this.cfg.repo, r, rel), pinnedInit(host, this.cfg.token));
          if (res.status === 429) { this.breaker.set(host.name, this.now + (this.cfg.breakerMs ?? 60_000)); lastReason = "http"; continue; }
          if (res.status === 404) { lastReason = "missing"; continue; }                  // with a token, a 404 on EVERY file is a rejected token: the pointer read and the watchdog detect it (pointer.ts rule 3)
          if (!res.ok) { lastReason = "http"; this.noteMiss(host.name); continue; }
          const text = await res.text(); let parsed: unknown;
          try { parsed = JSON.parse(text); } catch { lastReason = "parse"; continue; }       // a corrupt body is never cached by Next as a success: fetch is fine, our parse failed, the chain moves on
          this.misses.set(host.name, 0);
          if (host.name === "raw") this.stats.rawOk++; else { this.stats.apiOk++; this.stats.fallbacks++; }
          if (isPrev) this.stats.prevRefReads++;
          this.cfg.onHost?.(host.name, rel);
          return { text, parsed };
        } catch (e) { lastReason = (e as Error).name === "TimeoutError" || (e as Error).name === "AbortError" ? "timeout" : "http"; this.noteMiss(host.name); }
      }
    }
    this.stats.failures++; throw new PlaneError(rel, lastReason);
  }
  private noteMiss(h: Host["name"]): void { const n = (this.misses.get(h) ?? 0) + 1; this.misses.set(h, n); if (n >= 3) { this.breaker.set(h, this.now + (this.cfg.breakerMs ?? 60_000)); this.misses.set(h, 0); } }
}
