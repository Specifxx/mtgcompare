// The Neon plan limits the owner worries about: data transfer (5 GB a month per project on the free plan) and compute time (100 compute-hours a month). Neither is visible from SQL: the console API
// reports them per project. This is OPTIONAL and UNVERIFIED against a live key (written 2026-10-14 without one): it reads NEON_API_KEY and NEON_PROJECT_ID (Actions secrets, never on Vercel), asks
// GET /projects/<id>, and takes data_transfer_bytes and compute_time_seconds when the response carries them. A response without those fields is "unknown", never green. If the first real run says
// unknown, the field names are the thing to fix here (tests/ops-collect.test.ts pins the shape this expects). Script-side only.
import { limitCheck, type HealthCheck } from "./ops-health";

export const NEON_LIMITS = { transferGb: 5, computeHours: 100, storageMb: 512 } as const;
export interface NeonUsage { transferBytes: number | null; computeSeconds: number | null }
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
/** Pure: the usage out of the project response (the object may sit under `project`). */
export function neonUsageOf(body: unknown): NeonUsage {
  const o = (body && typeof body === "object" ? ((body as { project?: unknown }).project ?? body) : {}) as Record<string, unknown>;
  return { transferBytes: num(o.data_transfer_bytes), computeSeconds: num(o.compute_time_seconds) };
}
export async function readNeonUsage(o: { env?: Record<string, string | undefined>; fetchFn?: (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }> } = {}): Promise<NeonUsage | "not-configured" | null> {
  const env = o.env ?? process.env;
  if (!env.NEON_API_KEY || !env.NEON_PROJECT_ID) return "not-configured";
  const f = o.fetchFn ?? (globalThis.fetch as unknown as NonNullable<typeof o.fetchFn>);
  try {
    const res = await f(`https://console.neon.tech/api/v2/projects/${encodeURIComponent(env.NEON_PROJECT_ID)}`, { headers: { Accept: "application/json", Authorization: `Bearer ${env.NEON_API_KEY}` }, signal: AbortSignal.timeout(10_000) });
    return res.ok ? neonUsageOf(await res.json()) : null;
  } catch {
    return null;
  }
}
export function neonUsageChecks(u: NeonUsage | "not-configured" | null): HealthCheck[] {
  const g = "Neon";
  if (u === "not-configured") {
    const hint = "Add NEON_API_KEY and NEON_PROJECT_ID as Actions secrets to track the monthly transfer and compute limits.";
    return [
      { key: "neon:transfer", group: g, label: "Neon data transfer (month)", level: "unknown", detail: hint, unit: "GB", limit: NEON_LIMITS.transferGb },
      { key: "neon:compute", group: g, label: "Neon compute time (month)", level: "unknown", detail: hint, unit: "hours", limit: NEON_LIMITS.computeHours },
    ];
  }
  const fix = u ? "the Neon API answered without that figure" : "the Neon API did not answer";
  return [
    limitCheck({ key: "neon:transfer", group: g, label: "Neon data transfer (month)", used: u?.transferBytes == null ? null : u.transferBytes / 1e9, limit: NEON_LIMITS.transferGb, unit: "GB", fixHint: fix }),
    limitCheck({ key: "neon:compute", group: g, label: "Neon compute time (month)", used: u?.computeSeconds == null ? null : u.computeSeconds / 3600, limit: NEON_LIMITS.computeHours, unit: "hours", fixHint: fix }),
  ];
}
