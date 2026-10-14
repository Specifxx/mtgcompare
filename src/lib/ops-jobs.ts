// Are the scheduled jobs actually running and passing? (ops watch, 2026-10-14.) A workflow that fails or stops being scheduled is silent until someone opens GitHub: GitHub disables the schedules of a
// repository after 60 quiet days, a secret expires, a runner times out. The watch reads the last runs of the jobs that keep the site alive through the Actions API (a read, with the run's own GITHUB_TOKEN)
// and turns them into HealthChecks. The rules are pure; `readJobRuns` is the only network call. Script-side: a page never calls GitHub for this.
import type { Level } from "./admin-alarms";
import type { HealthCheck } from "./ops-health";

export interface JobSpec { file: string; label: string; /** the longest a healthy job goes without a finished run */ maxAgeHours: number }
export const WATCHED_JOBS: readonly JobSpec[] = [
  { file: "import-prices.yml", label: "Daily import (prices and stores)", maxAgeHours: 36 },
  { file: "ebay-prices.yml", label: "eBay prices", maxAgeHours: 30 },
  { file: "data-watchdog.yml", label: "Data watchdog (hourly)", maxAgeHours: 4 },
  { file: "store-health.yml", label: "Store health report", maxAgeHours: 36 },
  { file: "email.yml", label: "Alert and newsletter e-mail", maxAgeHours: 6 },
  { file: "egress-audit.yml", label: "Transfer audit (weekly)", maxAgeHours: 9 * 24 },
  { file: "db-audit.yml", label: "Database audit (weekly)", maxAgeHours: 9 * 24 },
  { file: "production-deploy.yml", label: "Weekly release", maxAgeHours: 9 * 24 },
];
export interface RunLite { conclusion: string | null; at: string }   // a FINISHED run, newest first
const FAIL = new Set(["failure", "timed_out", "startup_failure"]);

/** Cancelled and skipped runs say nothing either way and are dropped. Red: the last two finished runs failed. Amber: the last one failed, or the newest finished run is older than maxAgeHours (not running). */
export function jobCheck(spec: JobSpec, runs: readonly RunLite[] | null, now: Date): HealthCheck {
  const base = { key: `job:${spec.file}`, group: "Scheduled jobs", label: spec.label, href: `https://github.com/Specifxx/mtgcompare/actions/workflows/${spec.file}` };
  if (!runs) return { ...base, level: "unknown", detail: "The run list could not be read." };
  const done = runs.filter((r) => r.conclusion === "success" || (r.conclusion && FAIL.has(r.conclusion)));
  if (!done.length) return { ...base, level: "unknown", detail: "No finished run yet." };
  const [last, prev] = done;
  const ageH = (now.getTime() - Date.parse(last!.at)) / 3_600_000;
  let level: Level = "ok", detail = `Last run passed ${Math.max(0, Math.round(ageH))} h ago.`;
  if (FAIL.has(last!.conclusion!)) {
    const twice = !!prev && FAIL.has(prev.conclusion!);
    level = twice ? "bad" : "warn";
    detail = twice ? "The last two runs failed." : `The last run failed ${Math.max(0, Math.round(ageH))} h ago.`;
  } else if (ageH > spec.maxAgeHours) {
    level = "warn";
    detail = `No finished run for ${Math.round(ageH)} h (expected within ${spec.maxAgeHours} h): the schedule may be off.`;
  }
  return { ...base, level, detail };
}

type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
/** The newest finished runs of one workflow file; null when GitHub did not answer. Needs GITHUB_TOKEN (Actions provides it) and GITHUB_REPOSITORY. */
export async function readJobRuns(file: string, o: { env?: Record<string, string | undefined>; fetchFn?: FetchLike } = {}): Promise<RunLite[] | null> {
  const env = o.env ?? process.env, repo = env.GITHUB_REPOSITORY || "Specifxx/mtgcompare", token = env.GITHUB_TOKEN;
  const f = o.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  try {
    const res = await f(`https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(file)}/runs?status=completed&per_page=6`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "MTGCompare-ops-watch", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { workflow_runs?: { conclusion?: string | null; updated_at?: string; run_started_at?: string }[] };
    return (j.workflow_runs ?? []).map((r) => ({ conclusion: r.conclusion ?? null, at: r.updated_at ?? r.run_started_at ?? "" })).filter((r) => Number.isFinite(Date.parse(r.at)));
  } catch {
    return null;
  }
}
