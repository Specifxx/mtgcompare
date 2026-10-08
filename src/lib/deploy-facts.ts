// What /admin/deploys shows about THIS deployment and the recent releases. No database. The deployment's own commit comes from the platform's build environment; the
// release history is one unauthenticated GitHub REST read (revalidate 3600), and any failure is "unknown", never an error (tests/admin-panels.test.ts).
import { DEPLOY_MARKER, isReleaseSubject, type DeployFacts } from "./release-schedule";
import { repoSlug } from "./admin-dispatch";

/** The running deployment. `builtAt` is the commit's own date (the build time is not exposed at runtime); null when the platform variables are absent (local development). */
export function currentDeploy(env: Record<string, string | undefined> = process.env): DeployFacts {
  const sha = env.VERCEL_GIT_COMMIT_SHA || null;
  const msg = env.VERCEL_GIT_COMMIT_MESSAGE || null;
  return { sha, subject: msg ? msg.split("\n")[0]!.slice(0, 200) : null, builtAt: null };
}

export interface ReleaseCommit { sha: string; subject: string; at: string }
export interface ReleaseHistory { commits: ReleaseCommit[]; last7: number | null; last30: number | null }

/** Fold a GitHub commits list into the [deploy] commits and their counts in the last 7 and 30 days (pure). */
export function foldReleases(rows: readonly { sha?: string; commit?: { message?: string; committer?: { date?: string } | null } }[], now = new Date()): ReleaseHistory {
  const commits: ReleaseCommit[] = [];
  for (const r of rows) {
    const subject = (r.commit?.message ?? "").split("\n")[0] ?? "";
    const at = r.commit?.committer?.date ?? "";
    if (r.sha && at && isReleaseSubject(subject)) commits.push({ sha: r.sha, subject, at });
  }
  const within = (days: number) => commits.filter((c) => now.getTime() - Date.parse(c.at) <= days * 86_400_000).length;
  return { commits: commits.slice(0, 10), last7: within(7), last30: within(30) };
}

/** The last releases from GitHub. null when the read fails (the panel says "unknown"). */
export async function readReleaseHistory(o: { env?: Record<string, string | undefined>; fetchFn?: typeof fetch; now?: Date } = {}): Promise<ReleaseHistory | null> {
  const f = o.fetchFn ?? fetch;
  try {
    const res = await f(`https://api.github.com/repos/${repoSlug(o.env)}/commits?sha=main&per_page=100`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "MTGCompare-admin" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    } as RequestInit);
    if (!res.ok) return null;
    return foldReleases((await res.json()) as Parameters<typeof foldReleases>[0], o.now);
  } catch {
    return null;
  }
}
export { DEPLOY_MARKER };
