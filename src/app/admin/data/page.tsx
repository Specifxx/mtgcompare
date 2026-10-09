import type { Metadata } from "next";
import { Bars, Light, Rows } from "@/components/admin/AdminPanel";
import { RunWorkflow } from "@/components/admin/RunWorkflow";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { dispatchConfigured, WORKFLOWS, workflowUrl } from "@/lib/admin-dispatch";
import { loadImportRuns } from "@/lib/admin-db-footprint";
import { loadPublication } from "@/lib/admin-publication";
import { ago } from "@/lib/format";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Data publication" });

// What the site is serving: status.json and the pointer on the data host, NOT Neon (the page works when Neon is down). Beside it, when Neon answers, the last import runs.
export default async function AdminData() {
  await requireAdminPage();
  const { view } = await loadPublication();
  const runs = await loadImportRuns().catch(() => null);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl text-white">Data publication</h1>
        <Light level={view.level} />
      </div>
      <p className="max-w-3xl text-sm text-slate-400">The daily import publishes the catalogue, prices, offers and history to the published data plane (the PlaneFile table of the Neon database by default; the private data repository with PLANE_BACKEND=github) and moves one pointer. Data never waits for a release: a week-old deployment serves today&apos;s prices.</p>
      <Rows rows={view.rows.map((r) => ({ label: r.label, value: r.value, level: r.level, note: r.note }))} />
      {view.guards.length ? (
        <div className="card-surface p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gold">Failsafes that fired</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">{view.guards.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      ) : null}
      {view.alarms.length ? (
        <div className="card-surface p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Alarms</p>
          <ul className="space-y-1.5 text-sm">
            {view.alarms.map((a) => (
              <li key={a.code} className="flex flex-wrap gap-2">
                <Light level={a.level === "error" ? "bad" : "warn"} label={a.code} />
                <span className="text-slate-300">{a.message}</span>
                <span className="text-xs text-slate-500">since {a.since}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.kinds.length ? (
        <div className="card-surface p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Published files by kind</p>
          <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {view.kinds.map((k) => (
              <li key={k.kind} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-300">{k.kind}</span>
                <span className="num text-white">{k.files.toLocaleString("en-US")} files, {(k.bytes / 1_048_576).toFixed(1)} MB</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.trend.length > 1 ? (
        <div className="card-surface p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Data size (PlaneFile table or repository), last {view.trend.length} days{view.dailyGrowthKb != null ? ` (${view.dailyGrowthKb} KB/day)` : ""}</p>
          <Bars label="Repository size trend" points={view.trend.map((kb, i) => ({ k: `day ${i + 1}`, n: kb }))} />
        </div>
      ) : null}
      <div className="card-surface p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Import runs (Neon)</p>
        {runs == null ? (
          <p className="text-sm text-slate-500">Neon unreachable. The status above does not need it.</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-slate-500">No runs recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th>Kind</th><th>Started</th><th>Seconds</th><th>Result</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-ink-700">
                  <td className="py-1.5 text-slate-300">{r.kind}</td>
                  <td className="text-slate-400">{ago(r.startedAt)}</td>
                  <td className="num text-slate-300">{r.seconds ?? "–"}</td>
                  <td>{r.finishedAt ? <Light level={r.ok ? "ok" : "bad"} label={r.ok ? "ok" : "failed"} /> : <Light level="unknown" label="running or killed" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <RunWorkflow endpoint="/api/admin/publish-run" label="Re-run publish" url={workflowUrl(WORKFLOWS.publish)} enabled={dispatchConfigured()} />
    </div>
  );
}
