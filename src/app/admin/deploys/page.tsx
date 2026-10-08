import type { Metadata } from "next";
import { Light, Rows } from "@/components/admin/AdminPanel";
import { RunWorkflow } from "@/components/admin/RunWorkflow";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { deployLevel, releaseBurst, worst } from "@/lib/admin-alarms";
import { dispatchConfigured, WORKFLOWS, workflowUrl } from "@/lib/admin-dispatch";
import { loadPublication } from "@/lib/admin-publication";
import { currentDeploy, readReleaseHistory } from "@/lib/deploy-facts";
import { RELEASE_COPY, RELEASE_CRON, deployAgeDays, nextRelease } from "@/lib/release-schedule";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Deploys" });

const when = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

// Release cadence: code ships weekly (Tuesday 08:00 UTC), data every day. No database here.
export default async function AdminDeploys() {
  await requireAdminPage();
  const now = new Date();
  const facts = currentDeploy();
  const [hist, pub] = await Promise.all([readReleaseHistory({ now }), loadPublication(now)]);
  const newest = hist?.commits[0]?.at ?? null;
  const age = deployAgeDays(newest, now);
  const ageLevel = deployLevel(age);
  const burst = releaseBurst(hist?.last7 ?? null);
  const published = pub.status.pointer.publishedAt;
  const lead = newest && published ? Math.round((Date.parse(published) - Date.parse(newest)) / 3_600_000) : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl text-white">Deploys</h1>
        <Light level={worst([ageLevel, burst])} />
      </div>
      <p className="max-w-3xl text-sm text-slate-400">{RELEASE_COPY}</p>
      <Rows
        rows={[
          { label: "Schedule", value: <code>{RELEASE_CRON}</code>, note: "Tuesday 08:00 UTC (production-deploy.yml)" },
          { label: "Next release", value: when(nextRelease(now)) },
          { label: "This deployment", value: facts.sha ? facts.sha.slice(0, 10) : "unknown (local development)", note: facts.subject ?? undefined },
          { label: "Newest release commit", value: newest ?? "unknown", level: ageLevel, note: age == null ? undefined : `${age} days ago` },
          { label: "[deploy] commits, 7 days", value: hist?.last7 == null ? "unknown" : String(hist.last7), level: burst, note: "more than two in a week is the burn RiftCompare measured" },
          { label: "[deploy] commits, 30 days", value: hist?.last30 == null ? "unknown" : String(hist.last30) },
          { label: "Data vs code", value: published ?? "unknown", note: lead == null ? undefined : lead >= 0 ? `the data is ${lead} h newer than the newest release: it does not wait for one` : `the newest release is ${-lead} h newer than the data` },
        ]}
      />
      <div className="card-surface p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Latest releases</p>
        {hist == null ? <p className="text-sm text-slate-500">GitHub did not answer (unknown, not an error).</p> : hist.commits.length === 0 ? <p className="text-sm text-slate-500">No [deploy] commit in the last 100 commits.</p> : (
          <ul className="space-y-1 text-sm">
            {hist.commits.map((c) => (
              <li key={c.sha} className="flex flex-wrap gap-3"><code className="text-slate-400">{c.sha.slice(0, 8)}</code><span className="text-slate-300">{c.subject}</span><span className="text-xs text-slate-500">{c.at.slice(0, 16).replace("T", " ")}</span></li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-2 text-sm text-slate-400">An unscheduled release is for a change that cannot wait for Tuesday. It needs a reason, which is written into the release commit.</p>
        <RunWorkflow endpoint="/api/admin/deploy-run" label="Run release now" url={workflowUrl(WORKFLOWS.deploy)} enabled={dispatchConfigured()} fields={[{ name: "reason", label: "Reason (required)", placeholder: "why this cannot wait", required: true }]} />
      </div>
    </div>
  );
}
