// Where public reads go (ported from RiftCompare's src/lib/public-data/mode.ts):
//
//   files     (DexCompare's default since 2026-10-16) public reads come from the bundled files and never touch Neon; Neon serves
//             only the importers' writes and the rare query shape the file engine refuses (logged as [public-data:unsupported]).
//             Missing or unreadable files also fall through to Neon, so a checkout without data/public/ still works.
//   fallback  Neon first; when Neon cannot answer, public reads are served from the files for a minute before Neon is tried again.
//   db        every read goes to Neon, as before.
//
// The importers and every script run with DEXCOMPARE_SCRIPT=1: they always read and write Neon, never the files (they are what the
// files are made from).

export type PublicDataMode = "db" | "fallback" | "files";

export function publicDataMode(env: Record<string, string | undefined> = process.env): PublicDataMode {
  if (env.DEXCOMPARE_SCRIPT === "1") return "db";
  const v = (env.PUBLIC_DATA_MODE || "files").trim().toLowerCase();
  return v === "db" || v === "fallback" ? v : "files";
}

// ── Neon health ──────────────────────────────────────────────────────────────

const BREAKER_MS = 60_000;
const breaker = globalThis as unknown as { __dexNeonDownUntil?: number };

export function neonMarkedDown(): boolean {
  return (breaker.__dexNeonDownUntil ?? 0) > Date.now();
}

export function markNeonDown(): void {
  breaker.__dexNeonDownUntil = Date.now() + BREAKER_MS;
}

const UNAVAILABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);
const UNAVAILABLE_TEXT = [
  "data transfer quota",
  "compute time quota",
  "exceeded the compute time",
  "can't reach database server",
  "connection terminated",
  "econnrefused",
  "etimedout",
  "connection refused",
  "too many connections",
  "timed out fetching a new connection",
  "server closed the connection",
];

/** True when an error means "Neon could not answer", not "the query was wrong". */
export function isNeonUnavailable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: string; errorCode?: string; message?: string };
  if (e.name === "PrismaClientInitializationError" || e.name === "PrismaClientRustPanicError") return true;
  if (e.code && UNAVAILABLE_CODES.has(e.code)) return true;
  if (e.errorCode && UNAVAILABLE_CODES.has(e.errorCode)) return true;
  const msg = (e.message ?? "").toLowerCase();
  return UNAVAILABLE_TEXT.some((t) => msg.includes(t));
}
