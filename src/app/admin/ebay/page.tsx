import type { Metadata } from "next";
import { Bars, Light, Rows } from "@/components/admin/AdminPanel";
import { RunWorkflow } from "@/components/admin/RunWorkflow";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { worst } from "@/lib/admin-alarms";
import { loadEbayBudget, type EbayBudget } from "@/lib/admin-db-footprint";
import { dispatchConfigured, inImportWindow, WORKFLOWS, workflowUrl } from "@/lib/admin-dispatch";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "eBay budget" });

// The eBay job's own records (EbayLedger, EbayTrack, EbayBanner), nothing from the eBay API: this page imports no src/lib/ebay*.ts module. The "Run now" button dispatches ebay-prices.yml;
// the script computes min(budget left today, remaining quota - reserve), fails closed and records what it spent, so the button can never overspend.
export default async function AdminEbay() {
  await requireAdminPage();
  let b: EbayBudget | null = null;
  let error: string | null = null;
  try {
    b = await loadEbayBudget();
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 200) : "Neon unreachable";
  }
  const t = b?.today ?? null;
  const level = b ? worst([b.spend.level, b.bannerLevel, b.latched ? "bad" : "ok"]) : "unknown";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl text-white">eBay budget</h1>
        <Light level={level} />
      </div>
      <p className="max-w-3xl text-sm text-slate-400">eBay prices are fetched script-side from GitHub Actions twice a day. They live in Neon only (never in the data repository) and are shown in their own labelled block.</p>
      {error ? <EmptyState title="Couldn't load the ledger" body={error} /> : !b || !t ? <EmptyState title="No eBay run recorded yet" body="eBay is off until both client secrets exist in GitHub Actions; the first run writes the ledger." /> : (
        <>
          <Rows
            rows={[
              { label: "Quota window", value: t.windowKey, note: t.resetAt ? `resets ${t.resetAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : undefined },
              { label: "Spent / cap", value: `${t.spent.toLocaleString("en-US")} / ${t.cap.toLocaleString("en-US")}`, level: b.spend.level, note: b.spend.pct == null ? undefined : `${b.spend.pct}% (claimed ${t.claimed})` },
              { label: "Quota left", value: t.remaining == null ? "unknown" : t.remaining.toLocaleString("en-US"), note: t.limit ? `of ${t.limit.toLocaleString("en-US")} a day${t.reserve != null ? `, reserve ${t.reserve}` : ""}` : undefined },
              { label: "Mode", value: `${t.mode ?? "unknown"}${t.observeOnly ? ", observe only" : ""}`, note: "shared: Rift first, then MTG on the same quota" },
              { label: "429 latch", value: b.latched ? `blocked until ${t.blockedUntil?.toISOString()}` : "clear", level: b.latched ? "bad" : "ok" },
              { label: "Chase banner", value: b.bannerAgeHours == null ? "none" : `${b.bannerAgeHours} h old`, level: b.bannerLevel, note: "licence limit 72 h" },
              { label: "Last run", value: b.lastRun ? `${b.lastRun.mode}, ${b.lastRun.spent} calls` : "none recorded", note: b.lastRun ? `${b.lastRun.matched ?? "?"} matched, ${b.lastRun.panels ?? "?"} panels${b.lastRun.stop ? `, stopped: ${b.lastRun.stop}` : ""}` : undefined },
            ]}
          />
          <div className="card-surface p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Calls spent per quota window</p>
            <Bars label="eBay calls spent per day" points={b.days.map((d) => ({ k: d.windowKey, n: d.spent }))} />
          </div>
          <div className="card-surface p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tracked work by tier</p>
            <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {b.tiers.map((x) => (
                <li key={x.tier} className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-300">{x.label}</span><span className="num text-white">{x.count.toLocaleString("en-US")}</span></li>
              ))}
            </ul>
          </div>
          {b.config ? <pre className="card-surface overflow-x-auto p-4 text-xs text-slate-400">{JSON.stringify(b.config, null, 2).slice(0, 2000)}</pre> : null}
        </>
      )}
      <RunWorkflow
        endpoint="/api/admin/ebay-run"
        label="Run now"
        url={workflowUrl(WORKFLOWS.ebay)}
        enabled={dispatchConfigured()}
        warn={inImportWindow(new Date()) ? "Inside the daily import window (21:05 to 23:30 UTC): a manual run could cancel a pending import, so the button is refused until 23:30." : undefined}
        fields={[{ name: "max_calls", label: "Lower the budget to N calls", placeholder: "50 for a smoke test" }]}
      />
    </div>
  );
}
