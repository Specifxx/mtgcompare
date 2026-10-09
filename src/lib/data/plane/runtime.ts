// src/lib/data/plane/runtime.ts (owner WP02, FROZEN). The server-side binding of the reader to the environment: the singleton HttpPlane, the pointer reader, getDataRef(), planeJson(), planeHealth(). Server-only (it reads PLANE_TOKEN):
// never import it from a client component (tests/env-names.test.ts forbids a NEXT_PUBLIC_ name for the token; the client-import ratchet forbids this file).
//
// BACKEND (DECISIONS.md, 2026-10-09): the published tree lives in Neon by default (plane/neon-reader.ts, plane/neon-store.ts); PLANE_BACKEND=github selects the private data repository again. The variables below that name the repository are only read in that mode.
// Environment (Annex B): PLANE_BACKEND (neon | github, default neon), PLANE_POINTER_TTL_S (60, Neon only), PLANE_REPO (default Specifxx/mtgcompare-data), PLANE_BRANCH (data), PLANE_TOKEN (Vercel secret, fine-grained read-only PAT on that one repository), PLANE_DIR (development, jobs and tests: a directory that holds v1/ and
// optionally latest.json; no network, no token), PLANE_LRU_MB (64), PLANE_TIMEOUT_RAW_MS (3000), PLANE_TIMEOUT_API_MS (5000).
import fs from "node:fs";
import path from "node:path";
import * as React from "react";
import type { BucketsFile, PointerFile } from "./formats";
import { PointerError, PointerReader, type PointerEnv, type PointerState } from "./pointer";
import { publicationStatusOf, type PublicationStatus, type StatusFile } from "./status";
import { planeBackend, type PlaneBackend } from "./backend";
import { databaseWhere } from "./neon-store";
import { NeonPlane } from "./neon-reader";
import { API_HOST, HttpPlane, PlaneError, RAW_HOST, fsSource, pointerInit, type FetchLike, type Host, type PlaneSource } from "./source";

export interface PlaneEnv { backend?: PlaneBackend; repo: string; branch: string; token?: string; dir?: string; lruMb: number; rawMs: number; apiMs: number; pointerTtlS?: number }
export function planeEnv(env: Record<string, string | undefined> = process.env): PlaneEnv {
  const backend = planeBackend(env);
  return { backend, repo: env.PLANE_REPO || "Specifxx/mtgcompare-data", branch: env.PLANE_BRANCH || "data", token: env.PLANE_TOKEN || undefined, dir: env.PLANE_DIR || undefined, lruMb: Number(env.PLANE_LRU_MB || (backend === "neon" ? 120 : 64)), pointerTtlS: Number(env.PLANE_POINTER_TTL_S || 60), rawMs: Number(env.PLANE_TIMEOUT_RAW_MS || 3000), apiMs: Number(env.PLANE_TIMEOUT_API_MS || 5000) };
}
const pointerUrls = (e: PlaneEnv): { host: Host; url: string }[] => [
  { host: RAW_HOST, url: `https://raw.githubusercontent.com/${e.repo}/${e.branch}/latest.json` },
  { host: API_HOST, url: `https://api.github.com/repos/${e.repo}/contents/latest.json?ref=${e.branch}` },
];
/** The origin look of the pointer reader: raw, then the API; a 404 with a token configured is a rejected token. */
export function httpPointerEnv(e: PlaneEnv, fetchFn: FetchLike, now: () => number = Date.now): PointerEnv {
  return {
    now, sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async fetchPointer() {
      let last: PointerError = new PointerError("http", "no host answered");
      for (const { host, url } of pointerUrls(e)) {
        try {
          const res = await fetchFn(url, pointerInit(host, e.token, host.name === "raw" ? e.rawMs : e.apiMs));
          if (res.status === 404 || res.status === 401) { last = new PointerError(e.token ? "token" : "http", `HTTP ${res.status} for the pointer on ${host.name}`); if (e.token) throw last; continue; }
          if (!res.ok) { last = new PointerError("http", `HTTP ${res.status} on ${host.name}`); continue; }
          return JSON.parse(await res.text()) as unknown;
        } catch (err) { if (err instanceof PointerError) { last = err; if (err.reason === "token") throw err; } else last = new PointerError((err as Error).name === "TimeoutError" ? "timeout" : "http", String(err)); }
      }
      throw last;
    },
  };
}
/** PLANE_DIR mode: the pointer is latest.json beside v1/ when present, else a fixed synthetic one (a fixture directory has no publish history). */
export function dirPointer(dir: string): PointerFile {
  const f = path.join(dir, "latest.json");
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")) as PointerFile;
  return { v: 1, seq: 0, ref: "0".repeat(40), publishedAt: "1970-01-01T00:00:00Z", priceDay: "1970-01-01", tcgcsv: "", scryfall: "", phase: "full", format: "v1", counts: { cards: 0, units: 0, files: 0 }, manifestSha256: "", prev: null, repo: "local/dir", histCut: "1970-01-01", pvAt: null };
}

let singleton: { env: PlaneEnv; planes: Map<string, HttpPlane>; fetchFn: FetchLike | null; reader: PointerReader | null; neon: NeonPlane | null } | null = null;
function boot(): NonNullable<typeof singleton> {
  if (singleton) return singleton;
  const env = planeEnv();
  if (env.dir) return (singleton = { env, planes: new Map(), fetchFn: null, reader: null, neon: null });
  if (env.backend === "neon") { const neon = new NeonPlane({ lruBytes: env.lruMb * 1024 * 1024 }); return (singleton = { env, planes: new Map(), fetchFn: null, neon, reader: new PointerReader(neon.pointerEnv(), { memoMs: (env.pointerTtlS ?? 60) * 1000 }) }); }
  const f = globalThis.fetch as unknown as FetchLike;
  return (singleton = { env, planes: new Map(), fetchFn: f, neon: null, reader: new PointerReader(httpPointerEnv(env, f)) });
}
/** The reader of the repository that holds v1/**: the one the POINTER names (`pointer.repo`: a rotation to a new repository changes it with no deploy and no environment change, contract 7.4 and 12.5.7), else PLANE_REPO. The pointer itself is always read from PLANE_REPO.
 *  One HttpPlane (one LRU) per repository, the newest two kept: a rotation costs one cold LRU, and requests still pinned to the old pointer finish on the old repository. */
function planeFor(b: NonNullable<typeof singleton>, repo: string | undefined): HttpPlane {
  const name = repo || b.env.repo; let plane = b.planes.get(name);
  if (!plane) {
    plane = new HttpPlane({ repo: name, token: b.env.token, fetch: b.fetchFn!, lruBytes: b.env.lruMb * 1024 * 1024 }); b.planes.set(name, plane);
    while (b.planes.size > 2) b.planes.delete(b.planes.keys().next().value as string);
  }
  return plane;
}
/** Test hook: forget the singleton (and so the memo and the LRU). */
export function resetPlaneForTests(): void { singleton = null; refMemos.clear(); dirSources.clear(); }

/** The build reads no data, in the directory mode too (check 24): `next build` and its page-data workers run with NEXT_PHASE=phase-production-build. HttpPlane carries the same guard for file reads. */
export const duringBuild = (env: Record<string, string | undefined> = process.env): boolean => env.NEXT_PHASE === "phase-production-build";
function guardBuild(rel: string): void { if (duringBuild()) throw new PlaneError(rel, "build", "the build fetches nothing (contract 12.7.6)"); }

// React's request-scoped cache (the react-server build of Next: one entry per render or route handler). Looked up by name so a plain Node process (tests, Actions jobs) and any bundle without it get the identity function.
const requestScoped: <A extends unknown[], R>(fn: (...a: A) => R) => (...a: A) => R = ((React as unknown as Record<string, unknown>)["cache"] as never) ?? ((fn: unknown) => fn);
const pointerOfRequest = requestScoped(async (): Promise<PointerFile | null> => {
  const b = boot(); if (b.env.dir) return dirPointer(b.env.dir);
  return (await b.reader!.get()).ptr;
});

/** The pointer of this instance (memo, single-flight, last good on failure), PINNED PER REQUEST: the first read of a render or route handler is kept for all of it, so one page never mixes two publishes (contract 7.4). Outside a request it is the 20-second memo.
 *  null only on a cold instance with nothing: the loaders then throw PlaneError("http") and the route answers 503 + Retry-After. Throws PlaneError("build") while `next build` runs. */
export async function getDataRef(): Promise<PointerFile | null> { guardBuild("latest.json"); return pointerOfRequest(); }
export async function getPointerState(): Promise<PointerState> { const b = boot(); return b.env.dir ? { ptr: dirPointer(b.env.dir), source: "memo", tokenRejected: false, lastError: null, at: Date.now() } : b.reader!.get(); }
/** The warm call asks the origin again now (the 20-second memo would otherwise decide when this instance notices a publish). No-op for a directory. */
export function refreshPointer(): void { singleton?.reader?.invalidate(); }

/** PLANE_DIR mode: fsSource plus a parse cache, so a development server or a test reads and parses each file once per pointer (the HTTP path has the LRU for this). Keyed by the pointer, so a re-import that moves latest.json is seen. One slot. */
const dirSources = new Map<string, PlaneSource>();
function dirSource(dir: string, ptr: PointerFile): PlaneSource {
  const key = `${path.resolve(dir)}|${ptr.ref}|${ptr.seq}|${ptr.publishedAt}`; const hit = dirSources.get(key); if (hit) return hit;
  const base = fsSource(dir), parsed = new Map<string, unknown>(); let held = 0;
  const src: PlaneSource = {
    text: (rel) => base.text(rel),
    async json<T>(rel: string): Promise<T> {
      const c = parsed.get(rel); if (c !== undefined) return c as T;
      const t = await base.text(rel); let v: unknown;
      try { v = JSON.parse(t); } catch { throw new PlaneError(rel, "parse"); }
      if (held + t.length <= 256 * 1024 * 1024) { parsed.set(rel, v); held += t.length; }
      return v as T;
    },
  };
  dirSources.clear(); dirSources.set(key, src); return src;
}
/** The PlaneSource of one render: pinned to the ref the request's first pointer read returned. Throws PlaneError("http") when there is no pointer at all. */
export async function planeSource(): Promise<{ src: PlaneSource; ptr: PointerFile }> {
  const ptr = await getDataRef();
  if (!ptr) throw new PlaneError("latest.json", "http", "no pointer");
  const b = boot();
  return { ptr, src: b.env.dir ? dirSource(b.env.dir, ptr) : b.neon ? b.neon.source(ptr) : planeFor(b, ptr.repo).source(ptr.ref, ptr.prev) };
}
/** A source at an explicit ref (the warm call names the ref it was sent; the Actions jobs read a checkout instead). `repo` is the pointer's repository when the caller knows it (default PLANE_REPO). */
export function planeSourceAt(ref: string, prev: string | null = null, repo?: string): PlaneSource {
  const b = boot(); if (b.env.dir) return fsSource(b.env.dir);
  if (b.neon) return b.neon.source(getDataRef);                      // Neon holds the current tree only: the ref names nothing else, the source follows the pointer
  return planeFor(b, repo).source(ref, prev);
}
/** The identity of a publish for the instance memos. The ref alone names the content on the HTTP path; a development directory can be re-imported under the same ref, so the sequence and the time are part of the key. */
export const memoKey = (ptr: Pick<PointerFile, "ref" | "seq" | "publishedAt">): string => `${ptr.ref}:${ptr.seq}:${ptr.publishedAt}`;
/** M: one value per name and ref in this instance, built once (concurrent callers share the promise), dropped when a newer ref is asked for and never kept when the build fails. For parsed shapes derived from published files (the set index, the browse index, the bucket list). */
const refMemos = new Map<string, { ref: string; v: Promise<unknown> }>();
export function memoByRef<T>(name: string, ref: string, build: () => Promise<T>): Promise<T> {
  const hit = refMemos.get(name); if (hit && hit.ref === ref) return hit.v as Promise<T>;
  const v = build(); refMemos.set(name, { ref, v });
  v.catch(() => { if (refMemos.get(name)?.v === v) refMemos.delete(name); });
  return v;
}
/** The memo of a name at a ref if it was already asked for (the shim and the index look for a richer sibling before building a poorer one). */
export function peekByRef<T>(name: string, ref: string): Promise<T> | undefined { const hit = refMemos.get(name); return hit && hit.ref === ref ? (hit.v as Promise<T>) : undefined; }
/** A file that may legitimately not exist at the ref or its predecessor: null for PlaneError("missing") only. A host that fails is still an error (the route answers 503). */
export async function optionalOf<T>(src: PlaneSource, rel: string): Promise<T | null> {
  try { return await src.json<T>(rel); } catch (e) { if (e instanceof PlaneError && e.reason === "missing") return null; throw e; }
}
/** Rows of a parsed bucket file by their leading id, built once per parsed file (the HTTP LRU and the directory cache hand back the same object, so the index lives exactly as long as the file does). */
const idIndexes = new WeakMap<object, Map<number, unknown>>();
export function indexById<R extends readonly [number, ...unknown[]]>(file: object, rows: readonly R[]): Map<number, R> {
  let m = idIndexes.get(file) as Map<number, R> | undefined;
  if (!m) { m = new Map(rows.map((r) => [r[0], r] as const)); idIndexes.set(file, m); }
  return m;
}
/** meta/buckets.json as sets: the bucket numbers (width 256) that exist in cat/px and those that hold tracked units (un, of, hist). A reader never requests a file this list rules out. null when the file is absent (an old tree): the caller then asks the host. */
export interface BucketList { cat: ReadonlySet<number>; tracked: ReadonlySet<number> }
export function bucketList(src: PlaneSource, ptr: Pick<PointerFile, "ref" | "seq" | "publishedAt">): Promise<BucketList | null> {
  return memoByRef("meta/buckets", memoKey(ptr), async () => { const f = await optionalOf<BucketsFile>(src, "meta/buckets.json"); return f ? { cat: new Set(f.cat), tracked: new Set(f.tracked) } : null; });
}
/** One published file at the request's ref. `optional: true` returns null for a file that does not exist at the ref or its predecessor (history of an untracked card, un/of of an untracked card); every other failure throws PlaneError. */
export async function planeJson<T>(rel: string): Promise<T>;
export async function planeJson<T>(rel: string, opts: { optional: true }): Promise<T | null>;
export async function planeJson<T>(rel: string, opts: { optional?: boolean }): Promise<T | null>;
export async function planeJson<T>(rel: string, opts: { optional?: boolean } = {}): Promise<T | null> {
  const { src } = await planeSource();
  try { return await src.json<T>(rel); } catch (e) { if (opts.optional && e instanceof PlaneError && e.reason === "missing") return null; throw e; }
}
export interface PlaneHealth { ref: string | null; seq: number | null; ageHours: number | null; hostUsed: "raw" | "api" | "dir" | "neon" | null; stale: boolean; tokenRejected: boolean; lruMb: number; failures: number; lastError?: string; db?: string }
/** GET /api/data-status: counts only, no secrets. */
export function planeHealth(now = Date.now()): PlaneHealth {
  const b = boot();
  if (b.env.dir) { const p = dirPointer(b.env.dir); return { ref: p.ref, seq: p.seq, ageHours: null, hostUsed: "dir", stale: false, tokenRejected: false, lruMb: 0, failures: 0 }; }
  const s = b.reader!.peek();
  if (b.neon) return { ref: s.ptr?.ref ?? null, seq: s.ptr?.seq ?? null, ageHours: s.ptr ? Math.round(((now - Date.parse(s.ptr.publishedAt)) / 3_600_000) * 10) / 10 : null, hostUsed: s.ptr ? "neon" : null, stale: s.ptr !== null && s.lastError !== null, tokenRejected: false, lruMb: Math.round(b.neon.stats.lruBytes / 1048576), failures: b.neon.stats.failures, ...(b.neon.stats.lastError ? { lastError: b.neon.stats.lastError } : {}), db: databaseWhere() };
  const st = planeFor(b, s.ptr?.repo).stats;
  return { ref: s.ptr?.ref ?? null, seq: s.ptr?.seq ?? null, ageHours: s.ptr ? Math.round(((now - Date.parse(s.ptr.publishedAt)) / 3_600_000) * 10) / 10 : null, hostUsed: st.apiOk > st.rawOk ? "api" : st.rawOk ? "raw" : null, stale: s.ptr !== null && s.lastError !== null, tokenRejected: s.tokenRejected, lruMb: Math.round(st.lruBytes / 1048576), failures: st.failures };
}

/** The admin panel's only data source (contract 15.3, C24: the page works when Neon is down). status.json at the HEAD of the data branch (the watchdog keeps it current between publishes), else the copy inside the pointed tree, else just the pointer.
 *  Short timeout, never throws; every field it could not read is null. The token never leaves this module. */
export async function readPublicationStatus(o: { fetchFn?: FetchLike; timeoutMs?: number; env?: Record<string, string | undefined> } = {}): Promise<PublicationStatus> {
  const e = planeEnv(o.env ?? process.env), ptr = e.dir ? dirPointer(e.dir) : await getDataRef().catch(() => null);
  try {
    if (e.dir) {
      for (const rel of ["status.json", "v1/status.json"]) { const f = path.join(e.dir, rel); if (fs.existsSync(f)) return publicationStatusOf(JSON.parse(fs.readFileSync(f, "utf8")) as StatusFile, ptr); }
      return publicationStatusOf(null, ptr);
    }
    if (e.backend === "neon") { const t = await boot().neon?.statusText(o.timeoutMs ?? 3000); return publicationStatusOf(t ? (JSON.parse(t) as StatusFile) : null, ptr); }
    const f = o.fetchFn ?? (globalThis.fetch as unknown as FetchLike), ms = o.timeoutMs ?? 3000;
    const urls: { host: Host; url: string }[] = [
      { host: RAW_HOST, url: `https://raw.githubusercontent.com/${e.repo}/${e.branch}/status.json` },
      { host: API_HOST, url: `https://api.github.com/repos/${e.repo}/contents/status.json?ref=${e.branch}` },
    ];
    for (const { host, url } of urls) {
      try { const res = await f(url, pointerInit(host, e.token, ms)); if (res.ok) return publicationStatusOf(JSON.parse(await res.text()) as StatusFile, ptr); } catch { /* next host */ }
    }
  } catch { /* fall through */ }
  return publicationStatusOf(null, ptr);
}
