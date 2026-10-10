// The "Run" buttons of the admin console (/admin/ebay, /admin/deploys, /admin/data) dispatch a GitHub Actions workflow. The ONE place the optional GITHUB_DISPATCH_TOKEN is read.
// Without the token a panel shows a link to the workflow page instead of a button; nothing else changes. Server-only: never import it from a client component.
// The token is a fine-grained PAT on this repository with Actions: write. It is NOT an eBay credential and it never reaches a client prop (tests/admin-panels.test.ts).
export const WORKFLOWS = { ebay: "ebay-prices.yml", deploy: "production-deploy.yml", publish: "import-prices.yml" } as const;
export type WorkflowKey = keyof typeof WORKFLOWS;

export const DEFAULT_REPO = "Specifxx/mtgcompare";
/** owner/repo, validated: it is put into a URL path. */
export function repoSlug(env: Record<string, string | undefined> = process.env): string {
  const v = (env.NEXT_PUBLIC_GITHUB_REPO ?? "").trim();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v) && v.split("/").every((p) => !/^\.+$/.test(p)) ? v : DEFAULT_REPO;
}
export const workflowUrl = (file: string, env: Record<string, string | undefined> = process.env): string => `https://github.com/${repoSlug(env)}/actions/workflows/${file}`;
export const dispatchConfigured = (env: Record<string, string | undefined> = process.env): boolean => (env.GITHUB_DISPATCH_TOKEN ?? "").length >= 20;

/** The daily import window (schedule.ts IMPORT_WINDOW_UTC): a manual eBay run here can cancel a pending import, so the button warns and the route refuses. 21:05 to 23:30 UTC. */
export function inImportWindow(now: Date): boolean {
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  return m >= 21 * 60 + 5 && m < 23 * 60 + 30;
}

export interface DispatchResult { ok: boolean; status: number; message: string }
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ status: number; ok: boolean }>;

/** The branch a dispatch runs on: the deployment's own branch (Vercel's VERCEL_GIT_COMMIT_REF, the production branch, which is the default branch), else `main`. It named `main` alone until 2026-10-10, a branch this repository never had. */
export const dispatchRef = (env: Record<string, string | undefined>): string => env.VERCEL_GIT_COMMIT_REF || "main";
/** POST workflow_dispatch on dispatchRef(env). Never throws; the message never contains the token. */
export async function dispatchWorkflow(key: WorkflowKey, inputs: Record<string, string> = {}, o: { env?: Record<string, string | undefined>; fetchFn?: FetchLike; ref?: string } = {}): Promise<DispatchResult> {
  const env = o.env ?? process.env;
  const token = env.GITHUB_DISPATCH_TOKEN;
  if (!token || !dispatchConfigured(env)) return { ok: false, status: 501, message: "GITHUB_DISPATCH_TOKEN is not set: open the workflow page and press Run workflow there." };
  const fetchFn = o.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  const url = `https://api.github.com/repos/${repoSlug(env)}/actions/workflows/${WORKFLOWS[key]}/dispatches`;
  const ref = o.ref ?? dispatchRef(env);
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "MTGCompare-admin" },
      body: JSON.stringify({ ref, inputs }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 204) return { ok: true, status: 204, message: `Dispatched ${WORKFLOWS[key]}.` };
    if (res.status === 401 || res.status === 403) return { ok: false, status: 502, message: "GitHub refused the dispatch token (expired, or lacks Actions: write)." };
    if (res.status === 404 || res.status === 422) return { ok: false, status: 502, message: `GitHub could not find ${WORKFLOWS[key]} on ${ref}, or it has no workflow_dispatch trigger.` };
    return { ok: false, status: 502, message: `GitHub answered ${res.status}.` };
  } catch {
    return { ok: false, status: 502, message: "GitHub did not answer." };
  }
}
