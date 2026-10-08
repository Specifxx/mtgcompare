import type { Metadata } from "next";
import { Bars, Light, Rows } from "@/components/admin/AdminPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { DB_TARGET_BYTES } from "@/lib/admin-alarms";
import { loadFootprint, type Footprint } from "@/lib/admin-db-footprint";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Database footprint" });

const mb = (b: number | null) => (b == null ? "unknown" : `${(b / 1_048_576).toFixed(1)} MB`);

// Neon holds PRIVATE state only (accounts, billing, alerts, collection, inbox, click events, the eBay ledger); public data is files. Three small uncached queries.
export default async function AdminDatabase() {
  await requireAdminPage();
  let f: Footprint | null = null;
  let error: string | null = null;
  try {
    f = await loadFootprint();
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 200) : "Neon unreachable";
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl text-white">Database footprint</h1>
        {f ? <Light level={f.level} /> : null}
      </div>
      {error || !f ? <EmptyState title="Neon unreachable" body={error ?? "No answer"} /> : (
        <>
          <Rows
            rows={[
              { label: "Database size", value: mb(f.totalBytes), level: f.level, note: f.usedPct == null ? undefined : `${f.usedPct}% of the ${mb(DB_TARGET_BYTES)} target (amber at 70 MB, red at 90 MB)` },
              { label: "Click log", value: `${f.clicks.rows.toLocaleString("en-US")} rows`, note: f.clicks.oldest ? `${shortDate(f.clicks.oldest)} to ${shortDate(f.clicks.newest)}; swept at 90 days` : "empty" },
              { label: "Rising snapshots", value: mb(f.risingSnapshotBytes) },
            ]}
          />
          <div className="card-surface p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Ten largest tables</p>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400"><th>Table</th><th className="text-right">Size</th><th className="text-right">Rows (estimate)</th></tr></thead>
              <tbody>
                {f.tables.map((t) => (
                  <tr key={t.table} className="border-t border-ink-700"><td className="py-1.5 text-slate-300">{t.table}</td><td className="num text-right text-white">{mb(t.bytes)}</td><td className="num text-right text-slate-300">{t.rows.toLocaleString("en-US")}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {f.trend.length > 1 ? (
            <div className="card-surface p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Weekly samples</p>
              <Bars label="Database size by week" points={f.trend.map((t) => ({ k: t.week, n: t.bytes }))} />
            </div>
          ) : null}
        </>
      )}
      <p className="max-w-3xl text-sm text-slate-400">
        Compute hours and transfer are on the Neon console (Billing, Usage), which this page cannot read. The Launch-plan trigger is 80 projected compute hours by day 10 of a billing month.
      </p>
    </div>
  );
}
