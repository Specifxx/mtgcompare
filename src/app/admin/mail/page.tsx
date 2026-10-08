import type { Metadata } from "next";
import { Rows } from "@/components/admin/AdminPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { loadMailStatus, type MailStatus } from "@/lib/admin-db-footprint";
import { ago, int } from "@/lib/format";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Newsletter and alerts" });

// Mail is sent script-side from GitHub Actions only, and only once both mail secrets exist; the runners record on/off in Meta "email". This page reads counts, never sends.
export default async function AdminMail() {
  await requireAdminPage();
  let s: MailStatus | null = null;
  let error: string | null = null;
  try {
    s = await loadMailStatus();
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 200) : "Failed";
  }
  return (
    <div className="space-y-6">
      <h1 className="text-3xl text-white">Newsletter and alerts</h1>
      {error || !s ? <EmptyState title="Couldn't load mail status" body={error ?? "No answer"} /> : (
        <>
          <Rows
            rows={[
              { label: "Mail", value: s.email ?? "never recorded", level: s.email === "on" ? "ok" : "unknown", note: s.email === "on" ? undefined : "off until both mail secrets exist in GitHub Actions; the site promises no email while off" },
              { label: "Newsletter", value: `${int(s.newsletter.total)} subscribers`, note: `${int(s.newsletter.last7)} new in 7 days, ${int(s.newsletter.confirmed)} welcomed` },
              { label: "Price alerts", value: int(s.alerts.price) },
              { label: "Sealed watches", value: int(s.alerts.sealed) },
              { label: "Deck watches", value: int(s.alerts.deck) },
              { label: "Release alerts", value: int(s.alerts.release) },
              { label: "Muted addresses", value: int(s.alerts.muted) },
              { label: "Last alert run", value: s.lastRun ?? "none recorded" },
            ]}
          />
          <div className="card-surface p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Latest 20 notifications (kind only)</p>
            {s.recent.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
              <ul className="space-y-1 text-sm">{s.recent.map((n, i) => <li key={i} className="flex gap-3"><span className="text-slate-300">{n.type}</span><span className="text-xs text-slate-500">{ago(n.createdAt)}</span></li>)}</ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
